import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import { getDashboardOverview } from '../controllers/dashboardController';

const DASHBOARD_ROLES = ['Super Administrateur', 'Administrateur', 'Manager Magasin', 'Opérateur', 'Caissier'] as const;

const dashboardRouter = Router();

dashboardRouter.get('/overview', requireAuth, requireRole(...DASHBOARD_ROLES), getDashboardOverview);

export default dashboardRouter;
