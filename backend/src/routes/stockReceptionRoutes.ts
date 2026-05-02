// src/routes/stockReceptionRoutes.ts
//
// Routes de gestion des réceptions de stock (StockReception).
//
// Accès :
//   - Lecture              : requireAuth (tous les rôles connectés)
//   - Création (POST)      : SA, Administrateur, Manager Magasin
//   - Confirmation (PATCH) : SA, Administrateur
//   - Annulation (PATCH)   : Super Administrateur uniquement

import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import {
  getReceptionsByOrder,
  getReceptionById,
  createReception,
  confirmReception,
  cancelReception,
} from '../controllers/stockReceptionController';

const stockReceptionRouter = Router();

// GET /api/receptions/by-order/:orderId — liste les réceptions d'une commande
// IMPORTANT : cette route est déclarée avant /:id pour éviter le conflit de paramètre
stockReceptionRouter.get('/by-order/:orderId', requireAuth, getReceptionsByOrder);

// GET /api/receptions/:id — récupère une réception par son UUID
stockReceptionRouter.get('/:id', requireAuth, getReceptionById);

// POST /api/receptions — crée une réception (SA + Admin + Manager)
stockReceptionRouter.post(
  '/',
  requireAuth,
  requireRole('Super Administrateur', 'Administrateur', 'Manager Magasin'),
  createReception,
);

// PATCH /api/receptions/:id/confirm — confirme et met à jour le stock (SA + Admin)
stockReceptionRouter.patch(
  '/:id/confirm',
  requireAuth,
  requireRole('Super Administrateur', 'Administrateur'),
  confirmReception,
);

// PATCH /api/receptions/:id/cancel — annule une réception (SA uniquement)
stockReceptionRouter.patch(
  '/:id/cancel',
  requireAuth,
  requireRole('Super Administrateur'),
  cancelReception,
);

export default stockReceptionRouter;
