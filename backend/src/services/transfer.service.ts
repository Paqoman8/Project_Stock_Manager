import { AuditAction, Prisma, TransferStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { logAction } from './audit.service';
import * as transferRepo from '../repositories/transfer.repository';

export type { TransferRow } from '../repositories/transfer.repository';

export type CreateTransferInput = {
  from_store_id: string;
  to_store_id: string;
  items: Array<{
    product_id: string;
    qty?: number;
    packaging_format_id?: string;
    packages_count?: number;
  }>;
};

async function ensureStoreExists(storeId: string): Promise<void> {
  const found = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!found) throw new Error('STORE_NOT_FOUND');
}

async function ensureProductsExist(productIds: string[]): Promise<void> {
  const rows = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true },
  });
  if (rows.length !== new Set(productIds).size) throw new Error('PRODUCT_NOT_FOUND');
}

type NormalizedTransferItem = {
  product_id: string;
  qty: number;
  packaging_format_id?: string;
  packages_count?: number;
};

function aggregateRequestedQuantities(
  items: Array<{ product_id: string; qty: number }>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.product_id, (totals.get(item.product_id) ?? 0) + item.qty);
  }
  return totals;
}

async function normalizeTransferItems(items: CreateTransferInput['items']): Promise<NormalizedTransferItem[]> {
  const normalized: NormalizedTransferItem[] = [];
  for (const item of items) {
    if (item.packaging_format_id) {
      if (item.packages_count === undefined) throw new Error('PACKAGES_COUNT_REQUIRED');
      const format = await prisma.packagingFormat.findUnique({
        where: { id: item.packaging_format_id },
        select: { id: true, product_id: true, units_per_package: true },
      });
      if (!format || format.product_id !== item.product_id) throw new Error('FORMAT_NOT_FOUND');
      normalized.push({
        product_id: item.product_id,
        qty: item.packages_count * format.units_per_package,
        packaging_format_id: item.packaging_format_id,
        packages_count: item.packages_count,
      });
      continue;
    }

    if (item.qty === undefined) throw new Error('QTY_REQUIRED');
    normalized.push({
      product_id: item.product_id,
      qty: item.qty,
    });
  }
  return normalized;
}

async function ensureEnoughSourceStock(sourceStoreId: string, items: NormalizedTransferItem[]): Promise<void> {
  // Items with a format: check the specific inventory_breakdowns entry
  const formatItems = items.filter((i) => i.packaging_format_id && i.packages_count !== undefined);
  for (const item of formatItems) {
    const breakdown = await prisma.inventoryBreakdown.findUnique({
      where: {
        store_id_product_id_packaging_format_id: {
          store_id:            sourceStoreId,
          product_id:          item.product_id,
          packaging_format_id: item.packaging_format_id!,
        },
      },
      select: { quantity: true },
    });
    if (!breakdown || breakdown.quantity < item.packages_count!) {
      throw new Error('INSUFFICIENT_STOCK');
    }
  }

  // Items without a format: check global stock_physical
  const plainItems = items.filter((i) => !i.packaging_format_id);
  if (plainItems.length === 0) return;

  const requestedByProduct = aggregateRequestedQuantities(plainItems);
  const inventoryRows = await prisma.inventory.findMany({
    where: {
      store_id: sourceStoreId,
      product_id: { in: [...requestedByProduct.keys()] },
    },
    select: { product_id: true, stock_physical: true },
  });

  const byProduct = new Map(inventoryRows.map((r) => [r.product_id, r.stock_physical]));
  for (const [productId, requestedQty] of requestedByProduct.entries()) {
    const available = byProduct.get(productId) ?? 0;
    if (available < requestedQty) throw new Error('INSUFFICIENT_STOCK');
  }
}

function assertTransferStoreAccess(
  transfer: { from_store_id: string; to_store_id: string },
  requesterStoreId?: string,
  enforceRequesterScope?: boolean,
): void {
  if (!enforceRequesterScope || !requesterStoreId) return;
  if (transfer.from_store_id !== requesterStoreId && transfer.to_store_id !== requesterStoreId) {
    throw new Error('FORBIDDEN_TRANSFER_ACCESS');
  }
}

export async function createTransfer(
  input: CreateTransferInput,
  actorId: string,
  actorName: string,
  actorStoreId?: string,
  actorStoreName?: string,
  ipAddress?: string,
): Promise<transferRepo.TransferRow> {
  if (input.from_store_id === input.to_store_id) throw new Error('SAME_STORE_TRANSFER_FORBIDDEN');

  const normalizedItems = await normalizeTransferItems(input.items);

  await Promise.all([
    ensureStoreExists(input.from_store_id),
    ensureStoreExists(input.to_store_id),
    ensureProductsExist(normalizedItems.map((i) => i.product_id)),
  ]);
  await ensureEnoughSourceStock(input.from_store_id, normalizedItems);

  const transfer = await transferRepo.createTransfer({
    ...input,
    items: normalizedItems,
  });

  void logAction({
    actorId,
    actorName,
    action: AuditAction.TRANSFER_CREATED,
    targetType: 'TRANSFER',
    targetId: transfer.id,
    targetName: `Transfert ${transfer.id}`,
    storeId: actorStoreId,
    storeName: actorStoreName,
    ipAddress,
    metadata: {
      from_store_id: transfer.from_store_id,
      to_store_id: transfer.to_store_id,
      items_count: transfer.items.length,
    },
  });

  return transfer;
}

export type ListTransfersOptions = {
  status?: TransferStatus;
  requesterStoreId?: string;
  forceRequesterScope?: boolean;
  search?: string;
  page: number;
  limit: number;
};

export type ListTransfersResult = transferRepo.TransferPaginationResult;

export async function listTransfers(options: ListTransfersOptions): Promise<ListTransfersResult> {
  return transferRepo.listTransfersPaginated({
    status: options.status,
    store_id: options.forceRequesterScope ? options.requesterStoreId : undefined,
    search: options.search,
    page: options.page,
    limit: options.limit,
  });
}

export async function getTransferById(
  id: string,
  requesterStoreId?: string,
  enforceRequesterScope?: boolean,
): Promise<transferRepo.TransferRow> {
  const transfer = await transferRepo.getTransferById(id);
  if (!transfer) throw new Error('TRANSFER_NOT_FOUND');
  assertTransferStoreAccess(transfer, requesterStoreId, enforceRequesterScope);
  return transfer;
}

export async function confirmTransfer(
  id: string,
  actorId: string,
  actorName: string,
  actorStoreId?: string,
  actorStoreName?: string,
  ipAddress?: string,
  requesterStoreId?: string,
  enforceRequesterScope?: boolean,
): Promise<transferRepo.TransferRow> {
  const result = await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!transfer) throw new Error('TRANSFER_NOT_FOUND');
    assertTransferStoreAccess(transfer, requesterStoreId, enforceRequesterScope);
    if (transfer.status !== 'PENDING') throw new Error('TRANSFER_NOT_CONFIRMABLE');

    // Format-specific items: check inventory_breakdowns
    for (const item of transfer.items) {
      const itemExt = item as typeof item & { packaging_format_id: string | null; packages_count: number | null };
      if (itemExt.packaging_format_id && itemExt.packages_count != null) {
        const bd = await tx.inventoryBreakdown.findUnique({
          where: {
            store_id_product_id_packaging_format_id: {
              store_id:            transfer.from_store_id,
              product_id:          item.product_id,
              packaging_format_id: itemExt.packaging_format_id,
            },
          },
          select: { quantity: true },
        });
        if (!bd || bd.quantity < itemExt.packages_count) throw new Error('INSUFFICIENT_STOCK');
      }
    }

    // Plain items (no format): check global stock_physical
    const plainItems = transfer.items.filter((i) => {
      const e = i as typeof i & { packaging_format_id: string | null };
      return !e.packaging_format_id;
    });
    if (plainItems.length > 0) {
      const requestedByProduct = aggregateRequestedQuantities(plainItems);
      const inventoryRows = await tx.inventory.findMany({
        where: {
          store_id: transfer.from_store_id,
          product_id: { in: [...requestedByProduct.keys()] },
        },
        select: { product_id: true, stock_physical: true },
      });
      const stockByProduct = new Map(inventoryRows.map((r) => [r.product_id, r.stock_physical]));
      for (const [productId, requestedQty] of requestedByProduct.entries()) {
        const available = stockByProduct.get(productId) ?? 0;
        if (available < requestedQty) throw new Error('INSUFFICIENT_STOCK');
      }
    }

    for (const item of transfer.items) {
      const itemExt = item as typeof item & { packaging_format_id: string | null; packages_count: number | null };

      await tx.inventory.upsert({
        where: {
          store_id_product_id: {
            store_id: transfer.from_store_id,
            product_id: item.product_id,
          },
        },
        update: { stock_physical: { decrement: item.qty } },
        create: {
          store_id: transfer.from_store_id,
          product_id: item.product_id,
          stock_physical: 0,
        },
      });

      await tx.inventory.upsert({
        where: {
          store_id_product_id: {
            store_id: transfer.to_store_id,
            product_id: item.product_id,
          },
        },
        update: { stock_physical: { increment: item.qty } },
        create: {
          store_id: transfer.to_store_id,
          product_id: item.product_id,
          stock_physical: item.qty,
        },
      });

      // Update inventory_breakdowns for format-specific items
      if (itemExt.packaging_format_id && itemExt.packages_count != null) {
        // Debit source breakdown
        await tx.inventoryBreakdown.update({
          where: {
            store_id_product_id_packaging_format_id: {
              store_id:            transfer.from_store_id,
              product_id:          item.product_id,
              packaging_format_id: itemExt.packaging_format_id,
            },
          },
          data: { quantity: { decrement: itemExt.packages_count } },
        });
        // Credit destination breakdown
        await tx.inventoryBreakdown.upsert({
          where: {
            store_id_product_id_packaging_format_id: {
              store_id:            transfer.to_store_id,
              product_id:          item.product_id,
              packaging_format_id: itemExt.packaging_format_id,
            },
          },
          update: { quantity: { increment: itemExt.packages_count } },
          create: {
            store_id:            transfer.to_store_id,
            product_id:          item.product_id,
            packaging_format_id: itemExt.packaging_format_id,
            quantity:            itemExt.packages_count,
          },
        });
      }

      await tx.stockMovement.create({
        data: {
          store_id: transfer.from_store_id,
          product_id: item.product_id,
          type: 'ADJUSTMENT_OUT',
          qty: item.qty,
          reason: `Transfert sortant ${transfer.id}`,
          performed_by_id: actorId,
          packaging_format_id: item.packaging_format_id,
          packages_count: item.packages_count,
        },
      });

      await tx.stockMovement.create({
        data: {
          store_id: transfer.to_store_id,
          product_id: item.product_id,
          type: 'ADJUSTMENT_IN',
          qty: item.qty,
          reason: `Transfert entrant ${transfer.id}`,
          performed_by_id: actorId,
          packaging_format_id: item.packaging_format_id,
          packages_count: item.packages_count,
        },
      });
    }

    await tx.transfer.update({
      where: { id: transfer.id },
      data: { status: 'DONE' },
    });

    return transfer.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const updated = await transferRepo.getTransferById(result);
  if (!updated) throw new Error('TRANSFER_NOT_FOUND');

  void logAction({
    actorId,
    actorName,
    action: AuditAction.TRANSFER_CONFIRMED,
    targetType: 'TRANSFER',
    targetId: updated.id,
    targetName: `Transfert ${updated.id}`,
    storeId: actorStoreId,
    storeName: actorStoreName,
    ipAddress,
  });

  return updated;
}

export async function cancelTransfer(
  id: string,
  actorId: string,
  actorName: string,
  actorStoreId?: string,
  actorStoreName?: string,
  ipAddress?: string,
  requesterStoreId?: string,
  enforceRequesterScope?: boolean,
): Promise<transferRepo.TransferRow> {
  const transfer = await transferRepo.getTransferById(id);
  if (!transfer) throw new Error('TRANSFER_NOT_FOUND');
  assertTransferStoreAccess(transfer, requesterStoreId, enforceRequesterScope);
  if (transfer.status !== 'PENDING') throw new Error('TRANSFER_NOT_CANCELLABLE');

  const updated = await transferRepo.updateTransferStatus(id, 'CANCEL');

  void logAction({
    actorId,
    actorName,
    action: AuditAction.TRANSFER_CANCELLED,
    targetType: 'TRANSFER',
    targetId: updated.id,
    targetName: `Transfert ${updated.id}`,
    storeId: actorStoreId,
    storeName: actorStoreName,
    ipAddress,
  });

  return updated;
}

export async function listDestinationStores(excludedStoreId?: string): Promise<Array<{ id: string; name: string }>> {
  return transferRepo.listDestinationStoresForUserStore(excludedStoreId);
}
