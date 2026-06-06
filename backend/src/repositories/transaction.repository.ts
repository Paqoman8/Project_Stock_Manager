import { Prisma, TransactionType } from '@prisma/client';
import { prisma } from '../config/database';


// ---------------------------------------------------------------------------
// SHARED PRISMA INCLUDE SHAPE                                              
// ---------------------------------------------------------------------------

const TRANSACTION_INCLUDE = {
  store: { select: { id: true, name: true } },
  user:  { select: { id: true, username: true } },
  items: {
    select: {
      id: true,
      product_id: true,
      qty: true,
      price_at_sale: true,
      packaging_format_id: true,
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
  type: TransactionType;
  payment_method: 'CASH' | 'CARD' | 'MOBILE_MONEY';
  total_amount: number;
  refund_of_id?: string;
  items: Array<{
    product_id: string;
    qty: number;
    price_at_sale: number;
    packaging_format_id?: string;
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
  /** Maximum rows to return (default: 500). Prevents unbounded result sets. */
  limit?: number;
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
      type:           data.type,
      payment_method: data.payment_method,
      total_amount:   data.total_amount,
      refund_of_id:   data.refund_of_id,
      items: {
        create: data.items.map((item) => ({
          product_id:          item.product_id,
          qty:                 item.qty,
          price_at_sale:       item.price_at_sale,
          packaging_format_id: item.packaging_format_id,
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
    where: {
      store_id:   filters.store_id,
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.date_from || filters.date_to
        ? {
            created_at: {
              ...(filters.date_from ? { gte: filters.date_from } : {}),
              ...(filters.date_to   ? { lte: filters.date_to   } : {}),
            },
          }
        : {}),
    },
    include:  TRANSACTION_INCLUDE,
    orderBy:  { created_at: 'desc' },
    take:     filters.limit ?? 500,
  });
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
