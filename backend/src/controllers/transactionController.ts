import { Response } from 'express';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { resolveActorName, resolveStoreName } from '../services/audit.service';
import * as transactionService from '../services/transaction.service';


// ---------------------------------------------------------------------------
// VALIDATION SCHEMAS                                                       
// ---------------------------------------------------------------------------

/**
 * UUID-like regex — accepts RFC 4122 and fixed seed IDs (hex-based UUIDs).
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidLike = (msg: string) => z.string().regex(UUID_REGEX, msg);

const saleItemSchema = z.object({
  product_id:          uuidLike('product_id invalide'),
  qty:                 z.number().int().min(1, 'qty doit être >= 1'),
  price_at_sale:       z.number().min(0, 'price_at_sale doit être >= 0'),
  packaging_format_id: uuidLike('packaging_format_id invalide').optional(),
});

const createSaleSchema = z.object({
  payment_method: z.enum(['CASH', 'CARD', 'MOBILE_MONEY'], {
    message: 'payment_method doit être CASH, CARD ou MOBILE_MONEY',
  }),
  items: z.array(saleItemSchema).min(1, 'Au moins un article est requis.'),
});


// ---------------------------------------------------------------------------
// HELPER FUNCTIONS                                                         
// ---------------------------------------------------------------------------

/**
 * Formats Zod validation errors into readable strings.
 */
function formatZodErrors(err: ZodError): string[] {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

/**
 * Extracts client IP from request headers (X-Forwarded-For or socket.ip).
 */
function extractIp(req: AuthenticatedRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim() || (req.ip ?? '');
  return req.ip ?? '';
}


// ---------------------------------------------------------------------------
// ROUTE HANDLERS                                                           
// ---------------------------------------------------------------------------

/**
 * POST /api/transactions — Create a new sale transaction.
 * Validates input, checks stock, and persists the transaction with audit log.
 */
export async function createTransaction(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsed = createSaleSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({
      success: false,
      message: 'Données invalides.',
      errors:  formatZodErrors(parsed.error),
    });
  }

  const actorId  = req.user!.userId;
  const storeId  = req.user!.storeId;
  const ip       = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const transaction = await transactionService.createSale(
      parsed.data,
      actorId,
      actorName,
      storeId,
      storeName,
      ip,
    );

    res.status(201).json({ success: true, transaction });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'PRODUCT_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Un ou plusieurs produits sont introuvables ou inactifs.' });
      if (error.message === 'INSUFFICIENT_STOCK')
        return void res.status(409).json({ success: false, message: 'Stock insuffisant pour un ou plusieurs articles.' });
    }
    console.error('Erreur createTransaction:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * GET /api/transactions — Fetch all transactions for the user's store.
 */
export async function listTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
  const storeId = req.user!.storeId;

  try {
    const transactions = await transactionService.listTransactionsForStore(storeId);
    res.status(200).json({ success: true, transactions });
  } catch (error) {
    console.error('Erreur listTransactions:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * GET /api/transactions/summary — Fetch daily sales summary for dashboard.
 * Accepts optional ?date=YYYY-MM-DD query parameter; defaults to today.
 */
export async function getSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  const storeId = req.user!.storeId;
  const dateParam = req.query.date as string | undefined;

  if (dateParam !== undefined) {
    // Accept only YYYY-MM-DD to prevent silent Invalid Date being passed downstream
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return void res.status(400).json({
        success: false,
        message: 'Paramètre date invalide. Format attendu : YYYY-MM-DD.',
      });
    }
    const ts = Date.parse(dateParam);
    if (Number.isNaN(ts)) {
      return void res.status(400).json({
        success: false,
        message: 'Paramètre date invalide.',
      });
    }
  }

  try {
    const date = dateParam ? new Date(dateParam) : undefined;
    const summary = await transactionService.getDailySummary(storeId, date);
    res.status(200).json({ success: true, summary });
  } catch (error) {
    console.error('Erreur getSummary:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * POST /api/transactions/:id/refund — Refund a sale transaction.
 * Reverses stock deduction and creates a REFUND record.
 * Fails if original is already refunded, is not a SALE, or belongs to another store.
 */
export async function refundTransaction(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;

  if (!UUID_REGEX.test(id)) {
    return void res.status(400).json({ success: false, message: 'Identifiant de transaction invalide.' });
  }

  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const refund = await transactionService.refundSale(id, actorId, actorName, storeId, storeName, ip);
    res.status(201).json({ success: true, transaction: refund });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'TRANSACTION_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Transaction introuvable.' });
      if (error.message === 'ONLY_SALES_CAN_BE_REFUNDED')
        return void res.status(409).json({ success: false, message: 'Seules les ventes peuvent être remboursées.' });
      if (error.message === 'TRANSACTION_STORE_MISMATCH')
        return void res.status(403).json({ success: false, message: 'Cette transaction appartient à un autre magasin.' });
      if (error.message === 'TRANSACTION_ALREADY_REFUNDED')
        return void res.status(409).json({ success: false, message: 'Cette transaction a déjà été remboursée.' });
    }
    console.error('Erreur refundTransaction:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}
