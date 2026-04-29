import { Router } from 'express';
import { getRoles } from '../controllers/authController';

const roleRouter = Router();

// ---------------------------------------------------------------------------
// Routes de gestion des rôles
// ---------------------------------------------------------------------------

// Route publique — accessible sans être connecté.
// Retourne tous les rôles disponibles sauf "Super Administrateur".
// Le rôle "Super Administrateur" est exclu systématiquement côté backend :
// il ne peut être attribué à aucun utilisateur via l'API, quelle que soit
// la provenance de la requête.
//
// Utilisée pour alimenter les sélecteurs de rôle dans :
//  - le formulaire de création d'utilisateur
//  - le formulaire de modification d'utilisateur
//
// GET /api/roles
roleRouter.get('/', getRoles);

export default roleRouter;
