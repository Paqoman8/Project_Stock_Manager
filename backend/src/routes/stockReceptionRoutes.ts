// src/routes/stockReceptionRoutes.ts
//
// Routes de gestion des réceptions de stock (StockReception).
//
// Accès :
//   - Lecture, création, confirmation : requireAuth (SA + Admin)
//   - Annulation                      : requireAuth + requireRole('Super Administrateur')

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

// POST /api/receptions — crée une nouvelle réception
stockReceptionRouter.post('/', requireAuth, createReception);

// PATCH /api/receptions/:id/confirm — confirme une réception et met à jour le stock
stockReceptionRouter.patch('/:id/confirm', requireAuth, confirmReception);

// PATCH /api/receptions/:id/cancel — annule une réception (SA uniquement)
stockReceptionRouter.patch(
  '/:id/cancel',
  requireAuth,
  requireRole('Super Administrateur'),
  cancelReception,
);

export default stockReceptionRouter;
