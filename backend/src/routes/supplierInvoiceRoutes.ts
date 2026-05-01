// src/routes/supplierInvoiceRoutes.ts
//
// Routes de gestion des factures fournisseurs (SupplierInvoice).
//
// Accès : toutes les routes réservées SA + Administrateur.

import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import {
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  payInvoice,
  disputeInvoice,
  reopenInvoice,
} from '../controllers/supplierInvoiceController';

const supplierInvoiceRouter = Router();

const requireAdmin = requireRole('Super Administrateur', 'Administrateur');

// GET /api/invoices — liste des factures (filtres optionnels via query params)
supplierInvoiceRouter.get('/', requireAuth, requireAdmin, getInvoices);

// GET /api/invoices/:id — détail d'une facture
supplierInvoiceRouter.get('/:id', requireAuth, requireAdmin, getInvoiceById);

// POST /api/invoices — créer une facture pour une commande
supplierInvoiceRouter.post('/', requireAuth, requireAdmin, createInvoice);

// PATCH /api/invoices/:id — modifier les métadonnées d'une facture
supplierInvoiceRouter.patch('/:id', requireAuth, requireAdmin, updateInvoice);

// PATCH /api/invoices/:id/pay — marquer comme payée
supplierInvoiceRouter.patch('/:id/pay', requireAuth, requireAdmin, payInvoice);

// PATCH /api/invoices/:id/dispute — marquer comme disputée
supplierInvoiceRouter.patch('/:id/dispute', requireAuth, requireAdmin, disputeInvoice);

// PATCH /api/invoices/:id/reopen — rouvrir (DISPUTED/OVERDUE → PENDING)
supplierInvoiceRouter.patch('/:id/reopen', requireAuth, requireAdmin, reopenInvoice);

export default supplierInvoiceRouter;
