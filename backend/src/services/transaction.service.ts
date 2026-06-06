import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logAction } from './audit.service';
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
  qty:                 number;
  price_at_sale:       number;
  packaging_format_id?: string;
};

/**
 * API input for creating a new sale transaction.
 */
export type CreateSaleInput = {
  payment_method: 'CASH' | 'CARD' | 'MOBILE_MONEY';
  items: SaleItemInput[];
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

/**
 * Validates that store has sufficient stock for all sale items.
 * Throws INSUFFICIENT_STOCK if any product lacks required quantity.
 * Accepts an optional Prisma transaction client so the check can be
 * executed inside the serializable $transaction block (prevents TOCTOU).
 */
async function ensureEnoughStock(
  storeId: string,
  items:   SaleItemInput[],
  tx?:     Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;
  const rows = await client.inventory.findMany({
    where:  { store_id: storeId, product_id: { in: items.map((i) => i.product_id) } },
    select: { product_id: true, stock_physical: true },
  });
  const byProduct = new Map(rows.map((r) => [r.product_id, r.stock_physical]));
  for (const item of items) {
    const available = byProduct.get(item.product_id) ?? 0;
    if (available < item.qty) throw new Error('INSUFFICIENT_STOCK');
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
  await ensureProductsExist(input.items.map((i) => i.product_id));

  const totalAmount = input.items.reduce(
    (sum, item) => sum + item.price_at_sale * item.qty,
    0,
  );

  // All stock mutations + transaction insert run in a single serializable TX.
  // Stock availability is re-checked inside the TX to prevent TOCTOU races.
  const transaction = await prisma.$transaction(
    async (tx) => {
      await ensureEnoughStock(storeId, input.items, tx);

      for (const item of input.items) {
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
          },
        });
      }

      return transactionRepo.createTransaction(
        {
          store_id:       storeId,
          user_id:        actorId,
          type:           'SALE',
          payment_method: input.payment_method,
          total_amount:   totalAmount,
          items:          input.items,
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
 * Fails if: original not found, is already a REFUND, already refunded, or from different store.
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
): Promise<transactionRepo.TransactionRow> {
  const original = await transactionRepo.getTransactionById(originalTransactionId);
  if (!original) throw new Error('TRANSACTION_NOT_FOUND');
  if (original.type !== 'SALE') throw new Error('ONLY_SALES_CAN_BE_REFUNDED');
  if (original.store_id !== storeId) throw new Error('TRANSACTION_STORE_MISMATCH');

  // Check if already refunded
  const existingRefund = await prisma.transaction.findFirst({
    where: { refund_of_id: original.id },
    select: { id: true },
  });
  if (existingRefund) throw new Error('TRANSACTION_ALREADY_REFUNDED');

  const refundAmount = Number(original.total_amount);

  const refund = await prisma.$transaction(
    async (tx) => {
      for (const item of original.items) {
        // Credit stock back
        await tx.inventory.upsert({
          where:  { store_id_product_id: { store_id: storeId, product_id: item.product_id } },
          update: { stock_physical: { increment: item.qty } },
          create: { store_id: storeId, product_id: item.product_id, stock_physical: item.qty },
        });

        // Stock ledger — inbound movement
        await tx.stockMovement.create({
          data: {
            store_id:            storeId,
            product_id:          item.product_id,
            type:                'ADJUSTMENT_IN',
            qty:                 item.qty,
            reason:              `Remboursement transaction ${original.id}`,
            performed_by_id:     actorId,
            packaging_format_id: item.packaging_format_id ?? undefined,
          },
        });
      }

      return transactionRepo.createTransaction(
        {
          store_id:       storeId,
          user_id:        actorId,
          type:           'REFUND',
          payment_method: original.payment_method,
          total_amount:   refundAmount,
          refund_of_id:   original.id,
          items: original.items.map((item) => ({
            product_id:          item.product_id,
            qty:                 item.qty,
            price_at_sale:       Number(item.price_at_sale),
            packaging_format_id: item.packaging_format_id ?? undefined,
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

/**
 * Retrieves all transactions for a store, sorted by creation date (newest first).
 */
export async function listTransactionsForStore(
  storeId: string,
): Promise<transactionRepo.TransactionRow[]> {
  return transactionRepo.listTransactions({ store_id: storeId });
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
