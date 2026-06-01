import { Prisma, TransferStatus } from '@prisma/client';
import { prisma } from '../config/database';

const TRANSFER_INCLUDE = {
  from_store: { select: { id: true, name: true } },
  to_store:   { select: { id: true, name: true } },
  items: {
    select: {
      product_id: true,
      qty: true,
      packaging_format_id: true,
      packages_count: true,
      packaging_format: { select: { id: true, label: true, units_per_package: true } },
      product: { select: { id: true, name: true, sku: true, unit: true } },
    },
    orderBy: { product: { name: 'asc' } },
  },
} satisfies Prisma.TransferInclude;

export type TransferRow = Prisma.TransferGetPayload<{ include: typeof TRANSFER_INCLUDE }>;

export type CreateTransferData = {
  from_store_id: string;
  to_store_id: string;
  items: Array<{ product_id: string; qty: number; packaging_format_id?: string; packages_count?: number }>;
};

export type TransferFilters = {
  status?: TransferStatus;
  store_id?: string;
};

export async function createTransfer(data: CreateTransferData): Promise<TransferRow> {
  return prisma.transfer.create({
    data: {
      from_store_id: data.from_store_id,
      to_store_id: data.to_store_id,
      items: {
        create: data.items.map((it) => ({
          product_id: it.product_id,
          qty: it.qty,
          packaging_format_id: it.packaging_format_id,
          packages_count: it.packages_count,
        })),
      },
    },
    include: TRANSFER_INCLUDE,
  });
}

export async function listTransfers(filters: TransferFilters = {}): Promise<TransferRow[]> {
  return prisma.transfer.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.store_id ? {
        OR: [
          { from_store_id: filters.store_id },
          { to_store_id: filters.store_id },
        ],
      } : {}),
    },
    include: TRANSFER_INCLUDE,
    orderBy: { created_at: 'desc' },
  });
}

export async function getTransferById(id: string): Promise<TransferRow | null> {
  return prisma.transfer.findUnique({
    where: { id },
    include: TRANSFER_INCLUDE,
  });
}

export async function updateTransferStatus(id: string, status: TransferStatus): Promise<TransferRow> {
  return prisma.transfer.update({
    where: { id },
    data: { status },
    include: TRANSFER_INCLUDE,
  });
}

export async function listDestinationStoresForUserStore(userStoreId: string): Promise<Array<{ id: string; name: string }>> {
  return prisma.store.findMany({
    where: {
      status: 'ACTIVE',
      id: { not: userStoreId },
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}
