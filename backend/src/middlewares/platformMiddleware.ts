import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authMiddleware';

export function requirePlatformManager(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Accès refusé : authentification requise.',
    });
    return;
  }

  if (!req.user.isPlatformManager) {
    res.status(403).json({
      success: false,
      message: 'Accès refusé : réservé au gestionnaire de plateforme.',
    });
    return;
  }

  next();
}
