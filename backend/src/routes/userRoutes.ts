import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import { requireOrg } from '../middlewares/orgMiddleware';
import {
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
  reactivateUser,
} from '../controllers/userController';

const userRouter = Router();

// ---------------------------------------------------------------------------
// Routes de gestion des utilisateurs
//
// Toutes les routes sont protégées par :
//  1. requireAuth  — vérifie la présence et la validité du token JWT
//  2. requireRole  — vérifie que le rôle en base est dans la liste autorisée
//
// Hiérarchie des permissions :
//   Super Administrateur → peut tout faire sur tous les comptes
//   Administrateur       → peut gérer les comptes Manager Magasin et Opérateur uniquement
//
// La distinction fine (ex. un Admin ne peut pas modifier un autre Admin) est appliquée
// dans la couche service — le middleware n'autorise que l'accès à la route, pas l'action.
// ---------------------------------------------------------------------------

// GET /api/users
// Retourne la liste des utilisateurs (actifs + inactifs par défaut)
// SA et Admin voient tous les comptes sans paramètre supplémentaire
userRouter.get(
  '/',
  requireAuth,
  requireOrg,
  requireRole('Super Administrateur', 'Administrateur'),
  listUsers,
);

// POST /api/users
// Crée un nouvel utilisateur
// L'Admin ne peut pas créer un compte Administrateur ou SA — vérification dans le service
userRouter.post(
  '/',
  requireAuth,
  requireOrg,
  requireRole('Super Administrateur', 'Administrateur'),
  createUser,
);

// PUT /api/users/:id
// Met à jour les champs fournis d'un utilisateur existant
// L'Admin ne peut pas modifier un compte Administrateur ou SA — vérification dans le service
userRouter.put(
  '/:id',
  requireAuth,
  requireOrg,
  requireRole('Super Administrateur', 'Administrateur'),
  updateUser,
);

// DELETE /api/users/:id
// Désactive un utilisateur (soft delete — jamais de suppression physique)
// L'Admin ne peut pas désactiver un compte Administrateur ou SA — vérification dans le service
userRouter.delete(
  '/:id',
  requireAuth,
  requireOrg,
  requireRole('Super Administrateur', 'Administrateur'),
  deactivateUser,
);

// PATCH /api/users/:id/reactivate
// Réactive un compte précédemment désactivé
// L'Admin ne peut pas réactiver un compte Administrateur ou SA — vérification dans le service
userRouter.patch(
  '/:id/reactivate',
  requireAuth,
  requireOrg,
  requireRole('Super Administrateur', 'Administrateur'),
  reactivateUser,
);

export default userRouter;
