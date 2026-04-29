// src/routes/auditRoutes.ts
//
// GET /api/audit — journal d'audit
// Protégé par requireAuth + requireRole(SA, Admin)

import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import { getAuditLogs } from '../controllers/auditController';

const router = Router();

router.get(
  '/',
  requireAuth,
  requireRole('Super Administrateur', 'Administrateur'),
  getAuditLogs,
);

export default router;
