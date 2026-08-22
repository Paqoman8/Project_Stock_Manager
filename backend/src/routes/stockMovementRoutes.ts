// src/routes/stockMovementRoutes.ts
//
// Access matrix :
//   GET  /api/stock-movements → requireAuth (tous rôles)
//   POST /api/stock-movements → requireAuth + SA / Admin / Manager Magasin

import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import { requireOrg } from '../middlewares/orgMiddleware';
import { getMovements, createMovement, createConversion } from '../controllers/stockMovementController';

const stockMovementRouter = Router();

stockMovementRouter.get('/',  requireAuth, requireOrg, getMovements);

stockMovementRouter.post('/', requireAuth, requireOrg,
  requireRole('Super Administrateur', 'Administrateur', 'Manager Magasin'),
  createMovement,
);

stockMovementRouter.post('/convert', requireAuth, requireOrg,
  requireRole('Super Administrateur', 'Administrateur', 'Manager Magasin'),
  createConversion,
);

export default stockMovementRouter;
