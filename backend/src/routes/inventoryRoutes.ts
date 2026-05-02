// src/routes/inventoryRoutes.ts
//
// Routes REST pour la gestion de l'inventaire.
//
// Access matrix :
//   GET  /api/inventory                                         → requireAuth (tous rôles)
//   GET  /api/inventory/:storeId/:productId                     → requireAuth (tous rôles)
//   GET  /api/inventory/:storeId/:productId/breakdown           → requireAuth (tous rôles)
//   PATCH /api/inventory/:storeId/:productId/thresholds         → requireAuth + SA/Admin

import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import {
  getInventory,
  getInventoryEntry,
  updateThresholds,
  getBreakdown,
} from '../controllers/inventoryController';

const inventoryRouter = Router();

inventoryRouter.get(
  '/',
  requireAuth,
  getInventory,
);

inventoryRouter.get(
  '/:storeId/:productId',
  requireAuth,
  getInventoryEntry,
);

inventoryRouter.get(
  '/:storeId/:productId/breakdown',
  requireAuth,
  getBreakdown,
);

inventoryRouter.patch(
  '/:storeId/:productId/thresholds',
  requireAuth,
  requireRole('Super Administrateur', 'Administrateur'),
  updateThresholds,
);

export default inventoryRouter;
