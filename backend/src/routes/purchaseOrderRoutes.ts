// src/routes/purchaseOrderRoutes.ts
//
// Routes de gestion des commandes fournisseurs (PurchaseOrder).
//
// Accès :
//   - Lecture et création  : requireAuth (SA + Admin)
//   - Modification         : requireAuth (service vérifie que la commande est DRAFT)
//   - Envoi                : requireAuth
//   - Annulation           : requireAuth + requireRole('Super Administrateur')

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

// GET /api/purchase-orders — liste les commandes (filtres : supplier_id, destination_store_id, status)
purchaseOrderRouter.get('/', requireAuth, getPurchaseOrders);

// GET /api/purchase-orders/:id — récupère une commande par son UUID
purchaseOrderRouter.get('/:id', requireAuth, getPurchaseOrderById);

// POST /api/purchase-orders — crée une nouvelle commande
purchaseOrderRouter.post('/', requireAuth, createPurchaseOrder);

// PUT /api/purchase-orders/:id — met à jour les champs d'une commande DRAFT
purchaseOrderRouter.put('/:id', requireAuth, updatePurchaseOrder);

// PATCH /api/purchase-orders/:id/send — passe la commande au statut SENT
purchaseOrderRouter.patch('/:id/send', requireAuth, sendPurchaseOrder);

// PATCH /api/purchase-orders/:id/cancel — annule la commande (SA uniquement)
purchaseOrderRouter.patch(
  '/:id/cancel',
  requireAuth,
  requireRole('Super Administrateur'),
  cancelPurchaseOrder,
);

export default purchaseOrderRouter;
