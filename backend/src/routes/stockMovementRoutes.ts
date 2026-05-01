// src/routes/stockMovementRoutes.ts
//
// Access matrix :
//   GET  /api/stock-movements → requireAuth (tous rôles)
//   POST /api/stock-movements → requireAuth + SA / Admin / Manager Magasin

import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import { getMovements, createMovement } from '../controllers/stockMovementController';

const stockMovementRouter = Router();

stockMovementRouter.get('/',  requireAuth, getMovements);

stockMovementRouter.post('/', requireAuth,
  requireRole('Super Administrateur', 'Administrateur', 'Manager Magasin'),
  createMovement,
);

export default stockMovementRouter;
