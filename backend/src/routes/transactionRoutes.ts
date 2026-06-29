import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import {
  createTransaction,
  listTransactions,
  getSummary,
  refundTransaction,
  searchTransactionClients,
} from '../controllers/transactionController';


// ---------------------------------------------------------------------------
// ROUTE SETUP                                                              
// ---------------------------------------------------------------------------

const transactionRouter = Router();

/**
 * Roles authorized to access POS and transaction endpoints.
 * Includes all user tiers from cashier to super admin.
 */
const POS_ROLES = [
  'Super Administrateur',
  'Administrateur',
  'Manager Magasin',
  'Opérateur',
  'Caissier',
] as const;


// ---------------------------------------------------------------------------
// ENDPOINTS                                                                
// ---------------------------------------------------------------------------

// GET /summary — daily sales summary for dashboard
transactionRouter.get('/summary', requireAuth, requireRole(...POS_ROLES), getSummary);

// GET /clients/search — reusable clients for POS
transactionRouter.get('/clients/search', requireAuth, requireRole(...POS_ROLES), searchTransactionClients);

// GET / — list all transactions for store
transactionRouter.get('/',        requireAuth, requireRole(...POS_ROLES), listTransactions);

// POST / — create new sale transaction
transactionRouter.post('/',       requireAuth, requireRole(...POS_ROLES), createTransaction);

// POST /:id/refund — refund a transaction
transactionRouter.post('/:id/refund', requireAuth, requireRole(...POS_ROLES), refundTransaction);

export default transactionRouter;
