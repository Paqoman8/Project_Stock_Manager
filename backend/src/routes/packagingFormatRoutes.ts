// src/routes/packagingFormatRoutes.ts
//
// Routes imbriquées sous /api/products/:productId/packaging-formats
// Lecture  : tous les rôles authentifiés
// Écriture : Super Administrateur uniquement

import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import { requireOrg } from '../middlewares/orgMiddleware';
import {
  getFormats,
  createFormat,
  updateFormat,
  deleteFormat,
} from '../controllers/packagingFormatController';

const router = Router({ mergeParams: true }); // mergeParams pour accéder à :productId

router.get('/',    requireAuth, requireOrg, getFormats);
router.post('/',   requireAuth, requireOrg, requireRole('Super Administrateur', 'Administrateur'), createFormat);
router.put('/:id', requireAuth, requireOrg, requireRole('Super Administrateur', 'Administrateur'), updateFormat);
router.delete('/:id', requireAuth, requireOrg, requireRole('Super Administrateur', 'Administrateur'), deleteFormat);

export default router;
