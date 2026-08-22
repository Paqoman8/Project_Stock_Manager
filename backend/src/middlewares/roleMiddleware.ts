import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from './authMiddleware';

// ---------------------------------------------------------------------------
// Middleware de vérification de rôle (RBAC — Role-Based Access Control)
//
// Ce middleware est TOUJOURS placé APRÈS requireAuth dans la chaîne de
// middlewares. Il suppose donc que req.user est déjà attaché à la requête.
//
// Utilisation dans les routes :
//   router.get('/', requireAuth, requireRole('Super Administrateur'), handler)
//   router.get('/', requireAuth, requireRole('Manager Magasin', 'Super Administrateur'), handler)
// ---------------------------------------------------------------------------

/**
 * Fabrique de middleware qui vérifie que le rôle de l'utilisateur connecté
 * correspond à l'un des rôles autorisés passés en paramètre.
 *
 * La vérification se fait en base via le roleId contenu dans le JWT,
 * ce qui garantit que le nom du rôle est toujours à jour même si
 * le rôle a été renommé depuis la dernière connexion de l'utilisateur.
 *
 * @param rolesAutorises - Un ou plusieurs noms de rôles acceptés pour cette route
 * @returns Middleware Express
 *
 * Sécurité : retourne 403 (et non 401) car l'utilisateur est bien authentifié
 * mais ne dispose pas des permissions suffisantes.
 */
export function requireRole(...rolesAutorises: string[]) {
  return async function (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    // Cas impossible en théorie (requireAuth devrait être avant),
    // mais on le gère défensivement pour éviter une erreur runtime
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Accès refusé : authentification requise.',
      });
      return;
    }

    try {
      // On va chercher le rôle en base via le roleId du JWT.
      // On ne fait pas confiance au nom du rôle stocké en JWT car il peut
      // être modifié côté admin sans que le token soit régénéré.
      const role = await prisma.role.findUnique({
        where: { id: req.user.roleId },
        select: { name: true },
      });

      // Le rôle n'existe plus en base (supprimé depuis la connexion)
      if (!role) {
        res.status(403).json({
          success: false,
          message: 'Accès refusé : permissions insuffisantes.',
        });
        return;
      }

      // On vérifie que le nom du rôle DB est dans la liste des rôles autorisés
      const aLesPermissions = rolesAutorises.includes(role.name);

      if (!aLesPermissions) {
        res.status(403).json({
          success: false,
          message: 'Accès refusé : permissions insuffisantes.',
        });
        return;
      }

      // Rafraîchir le nom du rôle en JWT afin que les controllers n'utilisent
      // jamais une valeur obsolète pour les décisions d'autorisation.
      req.user.roleName = role.name;

      // Tout est bon — on passe au prochain middleware ou controller
      next();
    } catch (erreur) {
      // Erreur technique lors de la requête Prisma
      console.error('Erreur lors de la vérification du rôle :', erreur);
      res.status(500).json({
        success: false,
        message: 'Une erreur interne est survenue.',
      });
    }
  };
}
