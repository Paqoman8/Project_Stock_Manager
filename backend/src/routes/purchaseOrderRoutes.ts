// src/routes/purchaseOrderRoutes.ts
//
// Routes de gestion des commandes fournisseurs (PurchaseOrder).
//
// Accès :
//   - Lecture (GET)     : SA, Administrateur, Manager Magasin
//     → nécessaire pour le module Réceptions (Admin + Manager doivent voir les
//       commandes SENT / PARTIALLY_RECEIVED pour créer des réceptions)
//   - Écriture (POST / PUT / PATCH) : Super Administrateur uniquement

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
  closePurchaseOrder,
} from '../controllers/purchaseOrderController';

const purchaseOrderRouter = Router();

const superAdminOnly   = [requireAuth, requireRole('Super Administrateur')];
const receptionReaders = [requireAuth, requireRole('Super Administrateur', 'Administrateur', 'Manager Magasin')];

// GET /api/purchase-orders — liste les commandes (filtres : supplier_id, destination_store_id, status)
purchaseOrderRouter.get('/', receptionReaders, getPurchaseOrders);

// GET /api/purchase-orders/:id — récupère une commande par son UUID
purchaseOrderRouter.get('/:id', receptionReaders, getPurchaseOrderById);

// POST /api/purchase-orders — crée une nouvelle commande
purchaseOrderRouter.post('/', superAdminOnly, createPurchaseOrder);

// PUT /api/purchase-orders/:id — met à jour les champs d'une commande DRAFT
purchaseOrderRouter.put('/:id', superAdminOnly, updatePurchaseOrder);

// PATCH /api/purchase-orders/:id/send — passe la commande au statut SENT
purchaseOrderRouter.patch('/:id/send', superAdminOnly, sendPurchaseOrder);

// PATCH /api/purchase-orders/:id/cancel — annule la commande (SA uniquement)
purchaseOrderRouter.patch('/:id/cancel', superAdminOnly, cancelPurchaseOrder);

// PATCH /api/purchase-orders/:id/close — clôture définitive d'une commande PARTIALLY_RECEIVED
// Accessible : SA, Admin, Manager (décision opérationnelle après entente fournisseur)
purchaseOrderRouter.patch(
  '/:id/close',
  [requireAuth, requireRole('Super Administrateur', 'Administrateur', 'Manager Magasin')],
  closePurchaseOrder,
);

export default purchaseOrderRouter;
