import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logAction } from './audit.service';
import { resolveClient, type ClientInput } from './client.service';
import * as transactionRepo from '../repositories/transaction.repository';

export type { TransactionRow } from '../repositories/transaction.repository';


// ---------------------------------------------------------------------------
// INPUT TYPES & CONTRACTS                                                  
// ---------------------------------------------------------------------------

/**
 * Line item in a sale (product + quantity + unit price + optional packaging).
 */
export type SaleItemInput = {
  product_id:          string;
  qty?:                number;
  price_at_sale:       number;
  packaging_format_id?: string;
  packages_count?:     number;
  original_transaction_item_id?: string;
};

/**
 * API input for creating a new sale transaction.
 */
export type CreateSaleInput = {
  payment_method: 'CASH' | 'CARD' | 'MOBILE_MONEY';
  items: SaleItemInput[];
  client?: ClientInput;
};

/**
 * Daily sales summary for dashboard display.
 */
export type DailySummary = {
  total_sales:  number;
  total_amount: number;
  date:         string;
};


// ---------------------------------------------------------------------------
// HELPER FUNCTIONS — VALIDATION & PRECONDITIONS                            
// ---------------------------------------------------------------------------

/**
 * Validates that all products exist and are active.
 * Throws PRODUCT_NOT_FOUND if any product is missing or inactive.
 */
async function ensureProductsExist(productIds: string[]): Promise<void> {
  const unique = [...new Set(productIds)];
  const found  = await prisma.product.findMany({
    where:  { id: { in: unique }, is_active: true },
    select: { id: true },
  });
  if (found.length !== unique.length) throw new Error('PRODUCT_NOT_FOUND');
}

type NormalizedSaleItem = {
  product_id: string;
  qty: number;
  price_at_sale: number;
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

async function normalizeSaleItems(items: SaleItemInput[]): Promise<NormalizedSaleItem[]> {
  const normalized: NormalizedSaleItem[] = [];

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
        price_at_sale: item.price_at_sale,
        packaging_format_id: item.packaging_format_id,
        packages_count: item.packages_count,
      });
      continue;
    }

    if (item.qty === undefined) throw new Error('QTY_REQUIRED');
    normalized.push({
      product_id: item.product_id,
      qty: item.qty,
      price_at_sale: item.price_at_sale,
    });
  }

  return normalized;
}

/**
 * Validates that store has sufficient stock for all sale items.
 * Throws INSUFFICIENT_STOCK if any product lacks required quantity.
 * Accepts an optional Prisma transaction client so the check can be
 * executed inside the serializable $transaction block (prevents TOCTOU).
 */
async function ensureEnoughStock(
  storeId: string,
  items:   Array<{ product_id: string; qty: number; packaging_format_id?: string; packages_count?: number }>,
  tx?:     Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;

  const formatItems = items.filter((i) => i.packaging_format_id && i.packages_count !== undefined);
  for (const item of formatItems) {
    const breakdown = await client.inventoryBreakdown.findUnique({
      where: {
        store_id_product_id_packaging_format_id: {
          store_id:            storeId,
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

  const requestedByProduct = aggregateRequestedQuantities(items);
  const rows = await client.inventory.findMany({
    where:  { store_id: storeId, product_id: { in: [...requestedByProduct.keys()] } },
    select: { product_id: true, stock_physical: true },
  });
  const byProduct = new Map(rows.map((r) => [r.product_id, r.stock_physical]));
  for (const [productId, requestedQty] of requestedByProduct.entries()) {
    const available = byProduct.get(productId) ?? 0;
    if (available < requestedQty) throw new Error('INSUFFICIENT_STOCK');
  }
}


// ---------------------------------------------------------------------------
// createSale — CORE WORKFLOW                                               
// Atomic: validate inputs → decrement stock → log movements → persist TX   
// ---------------------------------------------------------------------------

/**
 * Creates a new SALE transaction within a serializable Prisma transaction.
 * Decrements physical stock, records stock movements, and logs audit entry.
 *
 * @throws PRODUCT_NOT_FOUND if product is missing or inactive
 * @throws INSUFFICIENT_STOCK if store lacks required quantity
 */
export async function createSale(
  input:         CreateSaleInput,
  actorId:       string,
  actorName:     string,
  storeId:       string,
  storeName?:    string,
  ipAddress?:    string,
): Promise<transactionRepo.TransactionRow> {
  const normalizedItems = await normalizeSaleItems(input.items);
  await ensureProductsExist(normalizedItems.map((i) => i.product_id));

  const totalAmount = normalizedItems.reduce(
    (sum, item) => sum + item.price_at_sale * item.qty,
    0,
  );

  // All stock mutations + transaction insert run in a single serializable TX.
  // Stock availability is re-checked inside the TX to prevent TOCTOU races.
  const transaction = await prisma.$transaction(
    async (tx) => {
      await ensureEnoughStock(storeId, normalizedItems, tx);
      const client = await resolveClient(input.client, tx, storeId);

      for (const item of normalizedItems) {
        // Decrement physical stock
        await tx.inventory.update({
          where: { store_id_product_id: { store_id: storeId, product_id: item.product_id } },
          data:  { stock_physical: { decrement: item.qty } },
        });

        // Stock ledger entry
        await tx.stockMovement.create({
          data: {
            store_id:            storeId,
            product_id:          item.product_id,
            type:                'ADJUSTMENT_OUT',
            qty:                 item.qty,
            reason:              'Vente directe (POS)',
            performed_by_id:     actorId,
            packaging_format_id: item.packaging_format_id,
            packages_count:      item.packages_count,
          },
        });

        // Decrement inventory breakdown per format (only if the row exists;
        // ensureEnoughStock already verified it does, so a straight update is safe)
        if (item.packaging_format_id && item.packages_count) {
          await tx.inventoryBreakdown.update({
            where: {
              store_id_product_id_packaging_format_id: {
                store_id: storeId,
                product_id: item.product_id,
                packaging_format_id: item.packaging_format_id,
              },
            },
            data: { quantity: { decrement: item.packages_count } },
          });
        }
      }

      return transactionRepo.createTransaction(
        {
          store_id:       storeId,
          user_id:        actorId,
          client_id:      client?.id,
          type:           'SALE',
          payment_method: input.payment_method,
          total_amount:   totalAmount,
          items:          normalizedItems,
        },
        tx,
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  void logAction({
    actorId,
    actorName,
    action:      AuditAction.TRANSACTION_CREATED,
    targetType:  'TRANSACTION',
    targetId:    transaction.id,
    targetName:  `Transaction ${transaction.id}`,
    storeId,
    storeName,
    ipAddress,
    metadata: {
      type:           'SALE',
      payment_method: transaction.payment_method,
      total_amount:   totalAmount,
      items_count:    input.items.length,
    },
  });

  return transaction;
}


// ---------------------------------------------------------------------------
// refundSale — REFUND WORKFLOW                                             
// Reverse stock deduction, create inbound movement, persist REFUND TX     
// ---------------------------------------------------------------------------

/**
 * Refunds an original SALE transaction. Credits stock back, creates refund record.
 * Supports partial refunds per line (e.g. 1 carton out of 2).
 *
 * @throws TRANSACTION_NOT_FOUND if original ID does not exist
 * @throws ONLY_SALES_CAN_BE_REFUNDED if original is REFUND or EXPENSE
 * @throws TRANSACTION_ALREADY_REFUNDED if a refund already exists
 * @throws TRANSACTION_STORE_MISMATCH if original belongs to different store
 */
export async function refundSale(
  originalTransactionId: string,
  actorId:               string,
  actorName:             string,
  storeId:               string,
  storeName?:            string,
  ipAddress?:            string,
  refundItems?:          Array<{ transaction_item_id: string; qty?: number; packages_count?: number }>,
): Promise<transactionRepo.TransactionRow> {
  const original = await transactionRepo.getTransactionById(originalTransactionId);
  if (!original) throw new Error('TRANSACTION_NOT_FOUND');
  if (original.type !== 'SALE') throw new Error('ONLY_SALES_CAN_BE_REFUNDED');
  if (original.store_id !== storeId) throw new Error('TRANSACTION_STORE_MISMATCH');

  // Build target items: if specific items are requested, use their partial qty;
  // otherwise refund all (full lines).
  const targetItems: Array<transactionRepo.TransactionRow['items'][number] & {
    _requestedQty?: number;
    _requestedPackagesCount?: number;
  }> = [];

  if (refundItems && refundItems.length > 0) {
    for (const ri of refundItems) {
      const originalItem = original.items.find((i) => i.id === ri.transaction_item_id);
      if (!originalItem) throw new Error('REFUND_ITEMS_REQUIRED');

      const requestedPackagesCount = ri.packages_count ?? originalItem.packages_count ?? undefined;
      const requestedQty = ri.qty ?? (
        requestedPackagesCount !== undefined && originalItem.packaging_format
          ? requestedPackagesCount * originalItem.packaging_format.units_per_package
          : originalItem.qty
      );

      if (requestedQty > originalItem.qty) throw new Error('REFUND_ITEMS_REQUIRED');
      if (originalItem.packaging_format_id && requestedPackagesCount !== undefined && requestedPackagesCount > (originalItem.packages_count ?? 0)) {
        throw new Error('REFUND_ITEMS_REQUIRED');
      }

      targetItems.push({
        ...originalItem,
        qty: requestedQty,
        packages_count: requestedPackagesCount ?? originalItem.packages_count,
        _requestedQty: requestedQty,
        _requestedPackagesCount: requestedPackagesCount,
      });
    }
  } else {
    targetItems.push(...original.items);
  }

  if (targetItems.length === 0) throw new Error('REFUND_ITEMS_REQUIRED');

  const refundAmount = targetItems.reduce(
    (sum, item) => sum + Number(item.price_at_sale) * item.qty,
    0,
  );

  const refund = await prisma.$transaction(
    async (tx) => {
      // Anti-doublon check inside the serializable TX to prevent TOCTOU race
      const refundSiblings = await tx.transaction.findMany({
        where: { refund_of_id: original.id },
        select: {
          items: {
            select: {
              original_transaction_item_id: true,
              product_id: true,
              packaging_format_id: true,
              packages_count: true,
              qty: true,
            },
          },
        },
      });

      // Track cumulative refunded quantities per original item
      const refundedQtys = new Map<string, { qty: number; packages_count: number }>();
      const refundedLegacySignatures = new Set<string>();
      for (const refund of refundSiblings) {
        for (const item of refund.items as Array<{
          original_transaction_item_id?: string | null;
          product_id: string;
          packaging_format_id?: string | null;
          packages_count?: number | null;
          qty: number;
        }>) {
          if (item.original_transaction_item_id) {
            const prev = refundedQtys.get(item.original_transaction_item_id) ?? { qty: 0, packages_count: 0 };
            refundedQtys.set(item.original_transaction_item_id, {
              qty: prev.qty + item.qty,
              packages_count: prev.packages_count + (item.packages_count ?? 0),
            });
            continue;
          }
          refundedLegacySignatures.add(
            `${item.product_id}:${item.packaging_format_id ?? 'base'}:${item.packages_count ?? item.qty}`,
          );
        }
      }

      if (!refundItems?.length && refundSiblings.length > 0) {
        throw new Error('TRANSACTION_ALREADY_REFUNDED');
      }

      for (const item of targetItems) {
        const alreadyRefunded = refundedQtys.get(item.id);
        if (alreadyRefunded) {
          if (item.packaging_format_id && item.packages_count != null) {
            if (alreadyRefunded.packages_count + item.packages_count > (original.items.find((oi) => oi.id === item.id)?.packages_count ?? 0)) {
              throw new Error('TRANSACTION_LINE_ALREADY_REFUNDED');
            }
          } else {
            if (alreadyRefunded.qty + item.qty > (original.items.find((oi) => oi.id === item.id)?.qty ?? 0)) {
              throw new Error('TRANSACTION_LINE_ALREADY_REFUNDED');
            }
          }
        }
        const signature = `${item.product_id}:${item.packaging_format_id ?? 'base'}:${item.packages_count ?? item.qty}`;
        if (refundedLegacySignatures.has(signature)) {
          throw new Error('TRANSACTION_LINE_ALREADY_REFUNDED');
        }
      }

      for (const item of targetItems) {
        const restoredQty = item._requestedQty ?? item.qty;
        const restoredPackagesCount = item._requestedPackagesCount ?? item.packages_count;

        await tx.inventory.upsert({
          where:  { store_id_product_id: { store_id: storeId, product_id: item.product_id } },
          update: { stock_physical: { increment: restoredQty } },
          create: { store_id: storeId, product_id: item.product_id, stock_physical: restoredQty },
        });

        await tx.stockMovement.create({
          data: {
            store_id:            storeId,
            product_id:          item.product_id,
            type:                'ADJUSTMENT_IN',
            qty:                 restoredQty,
            reason:              `Remboursement transaction ${original.id}`,
            performed_by_id:     actorId,
            packaging_format_id: item.packaging_format_id ?? undefined,
            packages_count:      restoredPackagesCount ?? undefined,
          },
        });

        if (item.packaging_format_id) {
          const pkgCount = restoredPackagesCount ?? restoredQty;
          await tx.inventoryBreakdown.upsert({
            where: {
              store_id_product_id_packaging_format_id: {
                store_id: storeId,
                product_id: item.product_id,
                packaging_format_id: item.packaging_format_id,
              },
            },
            update: { quantity: { increment: pkgCount } },
            create: {
              store_id: storeId,
              product_id: item.product_id,
              packaging_format_id: item.packaging_format_id,
              quantity: pkgCount,
            },
          });
        }
      }

      return transactionRepo.createTransaction(
        {
          store_id:       storeId,
          user_id:        actorId,
          type:           'REFUND',
          payment_method: original.payment_method,
          total_amount:   refundAmount,
          refund_of_id:   original.id,
          items: targetItems.map((item) => ({
            original_transaction_item_id: item.id,
            product_id:          item.product_id,
            qty:                 item._requestedQty ?? item.qty,
            price_at_sale:       Number(item.price_at_sale),
            packaging_format_id: item.packaging_format_id ?? undefined,
            packages_count:      item._requestedPackagesCount ?? item.packages_count ?? undefined,
          })),
        },
        tx,
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  void logAction({
    actorId,
    actorName,
    action:      AuditAction.TRANSACTION_REFUNDED,
    targetType:  'TRANSACTION',
    targetId:    refund.id,
    targetName:  `Remboursement de ${original.id}`,
    storeId,
    storeName,
    ipAddress,
    metadata: { original_transaction_id: original.id, refund_amount: refundAmount },
  });

  return refund;
}


// ---------------------------------------------------------------------------
// listTransactionsForStore — QUERY TRANSACTIONS                            
// ---------------------------------------------------------------------------

export type ListTransactionsOptions = {
  storeId: string;
  search?: string;
  type?: transactionRepo.TransactionRow['type'];
  paymentMethod?: transactionRepo.TransactionRow['payment_method'];
  page: number;
  limit: number;
};

export type ListTransactionsResult = transactionRepo.TransactionPaginationResult;

/**
 * Retrieves paginated transactions for a store, sorted by creation date (newest first).
 */
export async function listTransactionsForStore(
  options: ListTransactionsOptions,
): Promise<ListTransactionsResult> {
  return transactionRepo.listTransactionsPaginated({
    store_id: options.storeId,
    search: options.search,
    type: options.type,
    payment_method: options.paymentMethod,
    page: options.page,
    limit: options.limit,
  });
}


// ---------------------------------------------------------------------------
// getDailySummary — DASHBOARD AGGREGATE                                    
// Sums sales count and revenue for the day, scoped to store.               
// ---------------------------------------------------------------------------

/**
 * Computes total sales and revenue for a given date (default: today).
 * Only includes SALE transactions; REFUNDs and EXPENSEs are excluded.
 */
export async function getDailySummary(storeId: string, date?: Date): Promise<DailySummary> {
  const target = date ?? new Date();
  const dateFrom = new Date(target);
  dateFrom.setHours(0, 0, 0, 0);
  const dateTo = new Date(target);
  dateTo.setHours(23, 59, 59, 999);

  // Use aggregate instead of fetching full rows — avoids loading items/store/user joins
  // just to count and sum. Much cheaper at scale.
  const agg = await prisma.transaction.aggregate({
    where: {
      store_id:   storeId,
      type:       'SALE',
      created_at: { gte: dateFrom, lte: dateTo },
    },
    _count: { id: true },
    _sum:   { total_amount: true },
  });

  // Build the YYYY-MM-DD label from the local-midnight boundary so it always
  // matches the query window, even on servers that are not in UTC.
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateLabel = `${dateFrom.getFullYear()}-${pad(dateFrom.getMonth() + 1)}-${pad(dateFrom.getDate())}`;

  return {
    total_sales:  agg._count.id,
    total_amount: Number(agg._sum.total_amount ?? 0),
    date:         dateLabel,
  };
}
