import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { getDashboardOverview } from '../controllers/dashboardController';

const dashboardRouter = Router();

dashboardRouter.get('/overview', requireAuth, getDashboardOverview);

export default dashboardRouter;
