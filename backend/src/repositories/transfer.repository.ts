import { Prisma, TransferStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { parseFlexibleDateRange } from '../utils/pagination';

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

export type TransferPaginationFilters = TransferFilters & {
  search?: string;
  page: number;
  limit: number;
};

export type TransferPaginationResult = {
  transfers: TransferRow[];
  total: number;
  page: number;
  totalPages: number;
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

export async function listTransfers(orgId: string, filters: TransferFilters = {}): Promise<TransferRow[]> {
  return prisma.transfer.findMany({
    where: buildTransferWhere(orgId, filters),
    include: TRANSFER_INCLUDE,
    orderBy: { created_at: 'desc' },
  });
}

export async function listTransfersPaginated(
  orgId: string,
  filters: TransferPaginationFilters,
): Promise<TransferPaginationResult> {
  const { page, limit } = filters;
  const skip = (page - 1) * limit;
  const where = buildTransferWhere(orgId, filters);

  const [total, transfers] = await Promise.all([
    prisma.transfer.count({ where }),
    prisma.transfer.findMany({
      where,
      include: TRANSFER_INCLUDE,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  return {
    transfers,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

function buildTransferWhere(orgId: string, filters: TransferFilters & { search?: string }): Prisma.TransferWhereInput {
  const andConditions: Prisma.TransferWhereInput[] = [
    { OR: [
      { from_store: { organization_id: orgId } },
      { to_store: { organization_id: orgId } },
    ] },
  ];

  if (filters.status) {
    andConditions.push({ status: filters.status });
  }

  if (filters.store_id) {
    andConditions.push({
      OR: [
        { from_store_id: filters.store_id },
        { to_store_id: filters.store_id },
      ],
    });
  }

  const searchOr = buildTransferSearchOr(filters.search);
  if (searchOr.length > 0) {
    andConditions.push({ OR: searchOr });
  }

  return andConditions.length > 0 ? { AND: andConditions } : {};
}

function buildTransferSearchOr(search?: string): Prisma.TransferWhereInput[] {
  if (!search || search.trim() === '') return [];
  const q = search.trim();

  const conditions: Prisma.TransferWhereInput[] = [
    { from_store: { name: { contains: q, mode: 'insensitive' } } },
    { to_store: { name: { contains: q, mode: 'insensitive' } } },
    { items: { some: { product: { name: { contains: q, mode: 'insensitive' } } } } },
    { items: { some: { packaging_format: { label: { contains: q, mode: 'insensitive' } } } } },
  ];

  const dateRange = parseFlexibleDateRange(q);
  if (dateRange) {
    conditions.push({ created_at: { gte: dateRange.gte, lte: dateRange.lte } });
  }

  return conditions;
}

export async function getTransferById(id: string, orgId: string): Promise<TransferRow | null> {
  return prisma.transfer.findUnique({
    where: { id, OR: [
      { from_store: { organization_id: orgId } },
      { to_store: { organization_id: orgId } },
    ] },
    include: TRANSFER_INCLUDE,
  });
}

export async function updateTransferStatus(id: string, status: TransferStatus, orgId: string): Promise<TransferRow> {
  return prisma.transfer.update({
    where: { id, OR: [
      { from_store: { organization_id: orgId } },
      { to_store: { organization_id: orgId } },
    ] },
    data: { status },
    include: TRANSFER_INCLUDE,
  });
}

export async function listDestinationStoresForUserStore(orgId: string, excludedStoreId?: string): Promise<Array<{ id: string; name: string }>> {
  return prisma.store.findMany({
    where: {
      organization_id: orgId,
      status: 'ACTIVE',
      ...(excludedStoreId ? { id: { not: excludedStoreId } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}
