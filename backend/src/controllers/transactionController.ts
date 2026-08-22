import { Response } from 'express';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { resolveActorName, resolveStoreName } from '../services/audit.service';
import * as clientService from '../services/client.service';
import * as transactionService from '../services/transaction.service';
import { extractIp } from '../utils/request';
import { formatZodErrors } from '../utils/zod';

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
  qty:                 z.number().int().min(1, 'qty doit être >= 1').optional(),
  price_at_sale:       z.number().min(0, 'price_at_sale doit être >= 0'),
  packaging_format_id: uuidLike('packaging_format_id invalide').optional(),
  packages_count:      z.number().int().min(1, 'packages_count doit être >= 1').optional(),
});

const createSaleSchema = z.object({
  payment_method: z.enum(['CASH', 'CARD', 'MOBILE_MONEY'], {
    message: 'payment_method doit être CASH, CARD ou MOBILE_MONEY',
  }),
  items: z.array(saleItemSchema)
    .min(1, 'Au moins un article est requis.')
    .refine(
      (items) => items.every((item) => (item.packaging_format_id ? item.packages_count !== undefined : item.qty !== undefined)),
      { message: 'Chaque ligne doit fournir qty (sans format) ou packages_count + packaging_format_id (avec format).' },
    ),
  client: z.object({
    id: uuidLike('client.id invalide').optional(),
    name: z.string().min(1, 'client.name est requis').optional(),
    phone: z.string().optional(),
    email: z.string().email('client.email invalide').optional().or(z.literal('')),
  }).optional(),
});

const refundItemSchema = z.object({
  transaction_item_id: uuidLike('transaction_item_id invalide'),
  qty: z.number().int().min(1).optional(),
  packages_count: z.number().int().min(1).optional(),
});

const refundSchema = z.object({
  items: z.array(refundItemSchema).min(1, 'Sélectionnez au moins une ligne à rembourser.').optional(),
});

const listTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'page doit être >= 1').default(1),
  limit: z.coerce.number().int().min(1, 'limit doit être >= 1').max(100, 'limit doit être <= 100').default(10),
  search: z.string().trim().max(200, 'search doit faire 200 caractères max').optional(),
  type: z.enum(['SALE', 'REFUND', 'EXPENSE']).optional(),
  payment_method: z.enum(['CASH', 'CARD', 'MOBILE_MONEY']).optional(),
});


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
  const orgId    = req.user!.orgId;
  const ip       = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const transaction = await transactionService.createSale(
      orgId,
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
      if (error.message === 'FORMAT_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Format de conditionnement introuvable ou non associé au produit.' });
      if (error.message === 'PACKAGES_COUNT_REQUIRED' || error.message === 'QTY_REQUIRED')
        return void res.status(400).json({ success: false, message: 'Chaque ligne doit fournir qty (sans format) ou packages_count + packaging_format_id (avec format).' });
      if (error.message === 'CLIENT_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Client introuvable.' });
      if (error.message === 'CLIENT_NAME_REQUIRED')
        return void res.status(400).json({ success: false, message: 'Le nom du client est requis.' });
      if (error.message === 'CLIENT_CONTACT_REQUIRED')
        return void res.status(400).json({ success: false, message: 'Ajoutez au moins un téléphone ou un email pour créer un nouveau client.' });
      if (error.message === 'CLIENT_DUPLICATE_CONFLICT')
        return void res.status(409).json({ success: false, message: 'Plusieurs clients correspondent à ces coordonnées. Réutilisez un client existant avant de valider.' });
    }
    console.error('Erreur createTransaction:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * GET /api/transactions — Fetch paginated transactions for the user's store.
 */
export async function listTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId       = req.user!.orgId;
  const parsedQuery = listTransactionsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return void res.status(400).json({
      success: false,
      message: 'Paramètres de requête invalides.',
      errors: formatZodErrors(parsedQuery.error),
    });
  }

  const { page, limit, search, type, payment_method } = parsedQuery.data;

  try {
    const result = await transactionService.listTransactionsForStore(orgId, {
      storeId: req.user!.storeId,
      search,
      type,
      paymentMethod: payment_method,
      page,
      limit,
    });

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Erreur listTransactions:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * GET /api/transactions/clients/search?q=...
 * Returns reusable clients for POS selection.
 */
export async function searchTransactionClients(req: AuthenticatedRequest, res: Response): Promise<void> {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
  const orgId   = req.user!.orgId;
  const storeId = req.user!.storeId;

  try {
    const clients = await clientService.searchClients(orgId, query, storeId);
    res.status(200).json({ success: true, clients });
  } catch (error) {
    console.error('Erreur searchTransactionClients:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * GET /api/transactions/summary — Fetch daily sales summary for dashboard.
 * Accepts optional ?date=YYYY-MM-DD query parameter; defaults to today.
 */
export async function getSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId   = req.user!.orgId;
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
    const summary = await transactionService.getDailySummary(orgId, storeId, date);
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
  const orgId   = req.user!.orgId;
  const ip      = extractIp(req);
  const parsedBody = refundSchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return void res.status(400).json({
      success: false,
      message: 'Données invalides.',
      errors: formatZodErrors(parsedBody.error),
    });
  }

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const refund = await transactionService.refundSale(
      orgId,
      id,
      actorId,
      actorName,
      storeId,
      storeName,
      ip,
      parsedBody.data.items,
    );
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
      if (error.message === 'TRANSACTION_LINE_ALREADY_REFUNDED')
        return void res.status(409).json({ success: false, message: 'Au moins une ligne sélectionnée a déjà été remboursée.' });
      if (error.message === 'REFUND_ITEMS_REQUIRED')
        return void res.status(400).json({ success: false, message: 'Sélectionnez au moins une ligne à rembourser.' });
    }
    console.error('Erreur refundTransaction:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}
