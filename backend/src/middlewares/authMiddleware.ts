import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { TokenPayload } from '../services/auth.service';
import { getJwtSecret } from '../services/auth.service';

// On étend le type Request d'Express pour pouvoir y attacher
// les infos de l'utilisateur une fois le token validé
export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
  orgId?: string;
}

// Ce middleware est un "gardien de porte". Il sera placé devant toutes
// les routes qui nécessitent d'être connecté.
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // On cherche le token dans le cookie httpOnly (notre méthode principale)
  // ou dans le header Authorization (pour une utilisation future via API externe)
  const tokenFromCookie = req.cookies?.auth_token;
  const tokenFromHeader = req.headers.authorization?.split(' ')[1];

  const token = tokenFromCookie || tokenFromHeader;

  // Si aucun token n'est présent, on refuse l'accès
  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Accès refusé : authentification requise.',
    });
    return;
  }

  try {
    // On vérifie que le token est valide et qu'il a été signé avec notre clé secrète
    const secret = getJwtSecret();
    const decodedPayload = jwt.verify(token, secret) as TokenPayload;

    // Si le token a un scope 'change-password' ou 'reset-password' (temporaryToken),
    // il n'est accepté QUE sur les routes correspondantes.
    //
    // IMPORTANT : on compare le chemin exact (req.baseUrl + req.path reconstruit
    // correctement dans Express 5) et non un simple endsWith, sinon un token
    // scope "reset-password" pourrait accéder à /api/auth/admin-reset-password.
    if (decodedPayload.scope === 'change-password') {
      // Seule la route POST /api/auth/change-password accepte ce scope
      const requestPath = req.originalUrl.split('?')[0];
      const isAllowedChangePass = requestPath === '/api/auth/change-password';

      if (!isAllowedChangePass) {
        res.status(401).json({
          success: false,
          message: 'Accès refusé : token temporaire, changement de mot de passe requis.',
        });
        return;
      }
    }

    if (decodedPayload.scope === 'reset-password') {
      // Seule la route POST /api/auth/reset-password accepte ce scope
      const requestPath = req.originalUrl.split('?')[0];
      const isAllowedReset = requestPath === '/api/auth/reset-password';

      if (!isAllowedReset) {
        res.status(401).json({
          success: false,
          message: 'Accès refusé : token temporaire invalide.',
        });
        return;
      }
    }

    // On attache les informations de l'utilisateur à la requête
    // pour que le controller suivant puisse les utiliser
    req.user = decodedPayload;

    // On passe au prochain middleware ou au controller
    next();
  } catch (error) {
    // Le token est invalide ou expiré
    res.status(401).json({
      success: false,
      message: 'Accès refusé : token invalide ou expiré.',
    });
  }
}
