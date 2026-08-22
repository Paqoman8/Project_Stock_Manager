// src/routes/inventoryReportRoutes.ts
//
// Access matrix :
//   GET  /api/inventory-reports             → requireAuth (tous rôles)
//   GET  /api/inventory-reports/:id         → requireAuth (tous rôles)
//   POST /api/inventory-reports             → requireAuth + SA / Admin / Manager
//   PUT  /api/inventory-reports/:id/lines   → requireAuth + SA / Admin / Manager
//   PATCH /api/inventory-reports/:id/submit → requireAuth + SA / Admin / Manager
//   PATCH /api/inventory-reports/:id/validate → requireAuth + SA / Admin
//   PATCH /api/inventory-reports/:id/reject   → requireAuth + SA / Admin
//   PATCH /api/inventory-reports/:id/apply-adjustments → requireAuth + SA uniquement

import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import { requireOrg } from '../middlewares/orgMiddleware';
import {
  getReports,
  getReportById,
  createReport,
  updateLines,
  submitReport,
  validateReport,
  rejectReport,
  applyAdjustments,
} from '../controllers/inventoryReportController';

const inventoryReportRouter = Router();

const CREATORS = ['Super Administrateur', 'Administrateur', 'Manager Magasin'] as const;
const VALIDATORS = ['Super Administrateur', 'Administrateur'] as const;

inventoryReportRouter.get('/',     requireAuth, requireOrg, getReports);
inventoryReportRouter.get('/:id',  requireAuth, requireOrg, getReportById);

inventoryReportRouter.post('/',    requireAuth, requireOrg, requireRole(...CREATORS), createReport);

inventoryReportRouter.put('/:id/lines',  requireAuth, requireOrg, requireRole(...CREATORS), updateLines);
inventoryReportRouter.patch('/:id/submit', requireAuth, requireOrg, requireRole(...CREATORS), submitReport);

inventoryReportRouter.patch('/:id/validate', requireAuth, requireOrg, requireRole(...VALIDATORS), validateReport);
inventoryReportRouter.patch('/:id/reject',   requireAuth, requireOrg, requireRole(...VALIDATORS), rejectReport);

inventoryReportRouter.patch('/:id/apply-adjustments',
  requireAuth,
  requireOrg,
  requireRole('Super Administrateur'),
  applyAdjustments,
);

export default inventoryReportRouter;
