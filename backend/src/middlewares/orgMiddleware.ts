import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from './authMiddleware';

export async function requireOrg(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // requireAuth must run before this middleware — req.user is guaranteed present
  const orgId = req.user?.orgId;

  // Un JWT sans orgId = token émis avant le déploiement multi-tenant (format
  // obsolète). On renvoie 401 (pas 400) pour que le frontend déclenche sa
  // déconnexion propre via le contrat 401 de SessionContext.
  if (!orgId) {
    res.status(401).json({
      success: false,
      message: 'Session expirée, veuillez vous reconnecter.',
    });
    return;
  }

  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, status: true },
    });

    if (!org) {
      res.status(404).json({
        success: false,
        message: 'Organisation introuvable.',
      });
      return;
    }

    if (org.status === 'SUSPENDED' || org.status === 'DISABLED') {
      res.status(403).json({
        success: false,
        message: org.status === 'DISABLED'
          ? 'Cette organisation a été désactivée. Contactez votre administrateur.'
          : 'Cette organisation est suspendue. Contactez votre administrateur.',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('[requireOrg] Erreur lors de la vérification de l\'organisation :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}
