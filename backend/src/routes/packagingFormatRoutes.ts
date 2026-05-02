// src/routes/packagingFormatRoutes.ts
//
// Routes imbriquées sous /api/products/:productId/packaging-formats
// Lecture  : tous les rôles authentifiés
// Écriture : Super Administrateur uniquement

import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import {
  getFormats,
  createFormat,
  updateFormat,
  deleteFormat,
} from '../controllers/packagingFormatController';

const router = Router({ mergeParams: true }); // mergeParams pour accéder à :productId

router.get('/',    requireAuth, getFormats);
router.post('/',   requireAuth, requireRole('Super Administrateur'), createFormat);
router.put('/:id', requireAuth, requireRole('Super Administrateur'), updateFormat);
router.delete('/:id', requireAuth, requireRole('Super Administrateur'), deleteFormat);

export default router;
