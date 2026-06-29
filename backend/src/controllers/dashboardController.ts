import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import * as dashboardService from '../services/dashboard.service';

function parseDateBoundary(value: string, boundary: 'start' | 'end'): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const day = Number(dayRaw);
  const date = boundary === 'start'
    ? new Date(year, monthIndex, day, 0, 0, 0, 0)
    : new Date(year, monthIndex, day, 23, 59, 59, 999);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export async function getDashboardOverview(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { storeId, roleId } = req.user!;

  try {
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { name: true },
    });

    let period: dashboardService.DashboardPeriod | undefined;
    if (typeof req.query.from === 'string' || typeof req.query.to === 'string') {
      if (typeof req.query.from !== 'string' || typeof req.query.to !== 'string') {
        return void res.status(400).json({ success: false, message: 'Les paramètres from et to sont requis ensemble.' });
      }

      const from = parseDateBoundary(req.query.from, 'start');
      const to = parseDateBoundary(req.query.to, 'end');
      if (!from || !to) {
        return void res.status(400).json({ success: false, message: 'Période invalide. Format attendu : YYYY-MM-DD.' });
      }
      if (from.getTime() > to.getTime()) {
        return void res.status(400).json({ success: false, message: 'La date de début doit précéder la date de fin.' });
      }

      period = { from, to };
    }

    const overview = await dashboardService.getDashboardOverview(storeId, role?.name ?? '', period);
    res.status(200).json({ success: true, dashboard: overview });
  } catch (error) {
    console.error('Erreur getDashboardOverview:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}
