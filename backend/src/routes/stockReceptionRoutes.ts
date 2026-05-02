// src/routes/stockReceptionRoutes.ts
//
// Routes de gestion des réceptions de stock (StockReception).
//
// Accès : toutes les routes réservées Super Administrateur uniquement.

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

const superAdminOnly = [requireAuth, requireRole('Super Administrateur')];

// GET /api/receptions/by-order/:orderId — liste les réceptions d'une commande
// IMPORTANT : cette route est déclarée avant /:id pour éviter le conflit de paramètre
stockReceptionRouter.get('/by-order/:orderId', superAdminOnly, getReceptionsByOrder);

// GET /api/receptions/:id — récupère une réception par son UUID
stockReceptionRouter.get('/:id', superAdminOnly, getReceptionById);

// POST /api/receptions — crée une réception
stockReceptionRouter.post('/', superAdminOnly, createReception);

// PATCH /api/receptions/:id/confirm — confirme et met à jour le stock
stockReceptionRouter.patch('/:id/confirm', superAdminOnly, confirmReception);

// PATCH /api/receptions/:id/cancel — annule une réception
stockReceptionRouter.patch('/:id/cancel', superAdminOnly, cancelReception);

export default stockReceptionRouter;
