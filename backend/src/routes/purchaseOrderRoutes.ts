// src/routes/purchaseOrderRoutes.ts
//
// Routes de gestion des commandes fournisseurs (PurchaseOrder).
//
// Accès : toutes les routes réservées Super Administrateur uniquement.

import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import {
  getPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  updatePurchaseOrder,
  sendPurchaseOrder,
  cancelPurchaseOrder,
} from '../controllers/purchaseOrderController';

const purchaseOrderRouter = Router();

const superAdminOnly = [requireAuth, requireRole('Super Administrateur')];

// GET /api/purchase-orders — liste les commandes (filtres : supplier_id, destination_store_id, status)
purchaseOrderRouter.get('/', superAdminOnly, getPurchaseOrders);

// GET /api/purchase-orders/:id — récupère une commande par son UUID
purchaseOrderRouter.get('/:id', superAdminOnly, getPurchaseOrderById);

// POST /api/purchase-orders — crée une nouvelle commande
purchaseOrderRouter.post('/', superAdminOnly, createPurchaseOrder);

// PUT /api/purchase-orders/:id — met à jour les champs d'une commande DRAFT
purchaseOrderRouter.put('/:id', superAdminOnly, updatePurchaseOrder);

// PATCH /api/purchase-orders/:id/send — passe la commande au statut SENT
purchaseOrderRouter.patch('/:id/send', superAdminOnly, sendPurchaseOrder);

// PATCH /api/purchase-orders/:id/cancel — annule la commande
purchaseOrderRouter.patch('/:id/cancel', superAdminOnly, cancelPurchaseOrder);

export default purchaseOrderRouter;
