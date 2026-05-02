// src/routes/supplierInvoiceRoutes.ts
//
// Routes de gestion des factures fournisseurs (SupplierInvoice).
//
// Accès : toutes les routes réservées Super Administrateur uniquement.

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

const superAdminOnly = [requireAuth, requireRole('Super Administrateur')];

// GET /api/invoices — liste des factures (filtres optionnels via query params)
supplierInvoiceRouter.get('/', superAdminOnly, getInvoices);

// GET /api/invoices/:id — détail d'une facture
supplierInvoiceRouter.get('/:id', superAdminOnly, getInvoiceById);

// POST /api/invoices — créer une facture pour une commande
supplierInvoiceRouter.post('/', superAdminOnly, createInvoice);

// PATCH /api/invoices/:id — modifier les métadonnées d'une facture
supplierInvoiceRouter.patch('/:id', superAdminOnly, updateInvoice);

// PATCH /api/invoices/:id/pay — marquer comme payée
supplierInvoiceRouter.patch('/:id/pay', superAdminOnly, payInvoice);

// PATCH /api/invoices/:id/dispute — marquer comme disputée
supplierInvoiceRouter.patch('/:id/dispute', superAdminOnly, disputeInvoice);

// PATCH /api/invoices/:id/reopen — rouvrir (DISPUTED/OVERDUE → PENDING)
supplierInvoiceRouter.patch('/:id/reopen', superAdminOnly, reopenInvoice);

export default supplierInvoiceRouter;
