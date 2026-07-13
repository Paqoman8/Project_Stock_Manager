import { Prisma, TransactionType, PaymentMethod } from '@prisma/client';
import { prisma } from '../config/database';
import { parseFlexibleDateRange, parseAmountSearch } from '../utils/pagination';


// ---------------------------------------------------------------------------
// SHARED PRISMA INCLUDE SHAPE                                              
// ---------------------------------------------------------------------------

const TRANSACTION_INCLUDE = {
  store: { select: { id: true, name: true } },
  user:  { select: { id: true, username: true } },
  client: { select: { id: true, name: true, phone: true, email: true } },
  items: {
    select: {
      id: true,
      original_transaction_item_id: true,
      product_id: true,
      qty: true,
      price_at_sale: true,
      packaging_format_id: true,
      packages_count: true,
      product: { select: { id: true, name: true, sku: true, unit: true } },
      packaging_format: { select: { id: true, label: true, units_per_package: true } },
    },
    orderBy: { product: { name: 'asc' } },
  },
} satisfies Prisma.TransactionInclude;

export type TransactionRow = Prisma.TransactionGetPayload<{ include: typeof TRANSACTION_INCLUDE }>;


// ---------------------------------------------------------------------------
// INPUT & FILTER TYPES                                                     
// ---------------------------------------------------------------------------

/**
 * Input shape for transaction creation with nested items.
 */
export type CreateTransactionData = {
  store_id: string;
  user_id: string;
  client_id?: string;
  type: TransactionType;
  payment_method: 'CASH' | 'CARD' | 'MOBILE_MONEY';
  total_amount: number;
  refund_of_id?: string;
  items: Array<{
    original_transaction_item_id?: string;
    product_id: string;
    qty: number;
    price_at_sale: number;
    packaging_format_id?: string;
    packages_count?: number;
  }>;
};

/**
 * Filters for querying transactions by store, date range, and type.
 */
export type TransactionFilters = {
  store_id: string;
  date_from?: Date;
  date_to?: Date;
  type?: TransactionType;
  payment_method?: PaymentMethod;
  /** Maximum rows to return (default: 500). Prevents unbounded result sets. */
  limit?: number;
};

export type TransactionPaginationFilters = TransactionFilters & {
  search?: string;
  page: number;
  limit: number;
};

export type TransactionPaginationResult = {
  transactions: TransactionRow[];
  total: number;
  page: number;
  totalPages: number;
};


// ---------------------------------------------------------------------------
// REPOSITORY FUNCTIONS                                                     
// ---------------------------------------------------------------------------

/**
 * createTransaction — Persists transaction and line items in a single Prisma write.
 * Stock mutations are handled by the service layer (inside $transaction block).
 */
export async function createTransaction(
  data: CreateTransactionData,
  tx?: Prisma.TransactionClient,
): Promise<TransactionRow> {
  const client = tx ?? prisma;
  return (client as typeof prisma).transaction.create({
    data: {
      store_id:       data.store_id,
      user_id:        data.user_id,
      client_id:      data.client_id,
      type:           data.type,
      payment_method: data.payment_method,
      total_amount:   data.total_amount,
      refund_of_id:   data.refund_of_id,
      items: {
        create: data.items.map((item) => ({
          original_transaction_item_id: item.original_transaction_item_id,
          product_id:                   item.product_id,
          qty:                          item.qty,
          price_at_sale:                item.price_at_sale,
          packaging_format_id:          item.packaging_format_id,
          packages_count:               item.packages_count,
        })),
      },
    },
    include: TRANSACTION_INCLUDE,
  });
}


/**
 * listTransactions — Retrieves all transactions matching filters, sorted newest first.
 */
export async function listTransactions(filters: TransactionFilters): Promise<TransactionRow[]> {
  return prisma.transaction.findMany({
    where: buildTransactionWhere(filters),
    include:  TRANSACTION_INCLUDE,
    orderBy:  { created_at: 'desc' },
    take:     filters.limit ?? 500,
  });
}

/**
 * listTransactionsPaginated — Retrieves a paginated list of transactions matching filters.
 */
export async function listTransactionsPaginated(
  filters: TransactionPaginationFilters,
): Promise<TransactionPaginationResult> {
  const { page, limit } = filters;
  const skip = (page - 1) * limit;
  const where = buildTransactionWhere(filters);

  const [total, transactions] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: TRANSACTION_INCLUDE,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  return {
    transactions,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

function buildTransactionWhere(
  filters: TransactionFilters & { search?: string },
): Prisma.TransactionWhereInput {
  const andConditions: Prisma.TransactionWhereInput[] = [
    { store_id: filters.store_id },
  ];

  if (filters.type) {
    andConditions.push({ type: filters.type });
  }

  if (filters.payment_method) {
    andConditions.push({ payment_method: filters.payment_method });
  }

  if (filters.date_from || filters.date_to) {
    andConditions.push({
      created_at: {
        ...(filters.date_from ? { gte: filters.date_from } : {}),
        ...(filters.date_to ? { lte: filters.date_to } : {}),
      },
    });
  }

  const searchOr = buildTransactionSearchOr(filters.search);
  if (searchOr.length > 0) {
    andConditions.push({ OR: searchOr });
  }

  return { AND: andConditions };
}

function buildTransactionSearchOr(search?: string): Prisma.TransactionWhereInput[] {
  if (!search || search.trim() === '') return [];
  const q = search.trim();

  const conditions: Prisma.TransactionWhereInput[] = [
    { items: { some: { product: { name: { contains: q, mode: 'insensitive' } } } } },
    { user: { username: { contains: q, mode: 'insensitive' } } },
    { client: { name: { contains: q, mode: 'insensitive' } } },
  ];

  const dateRange = parseFlexibleDateRange(q);
  if (dateRange) {
    conditions.push({ created_at: { gte: dateRange.gte, lte: dateRange.lte } });
  }

  const amount = parseAmountSearch(q);
  if (amount !== null) {
    conditions.push({ total_amount: { equals: amount } });
  }

  return conditions;
}


/**
 * getTransactionById — Fetches a single transaction by ID with all nested data.
 */
export async function getTransactionById(id: string): Promise<TransactionRow | null> {
  return prisma.transaction.findUnique({
    where:   { id },
    include: TRANSACTION_INCLUDE,
  });
}
