import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Structure des données que nous stockons à l'intérieur du token JWT.
// storeId est obligatoire : depuis la refonte du login, l'utilisateur choisit
// son magasin au moment de la connexion, donc le JWT le contient toujours.
interface TokenPayload {
  userId: string;
  email: string;
  roleId: string;
  storeId: string;
}

// On étend le type Request d'Express pour pouvoir y attacher
// les infos de l'utilisateur une fois le token validé
export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
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
    const secret = process.env.JWT_SECRET as string;
    const decodedPayload = jwt.verify(token, secret) as TokenPayload;

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
