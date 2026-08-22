import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { getRoles } from '../controllers/authController';

const roleRouter = Router();

// ---------------------------------------------------------------------------
// Routes de gestion des rôles
// ---------------------------------------------------------------------------

// Route protégée — nécessite d'être connecté.
// Retourne tous les rôles disponibles sauf "Super Administrateur" et
// "Platform Manager". Ces deux rôles sont exclus systématiquement côté
// backend : ils ne peuvent être attribués à aucun utilisateur via l'API,
// quelle que soit la provenance de la requête. "Platform Manager" en
// particulier ne doit même pas être visible par un utilisateur d'une
// organisation — d'où requireAuth : seuls des comptes déjà authentifiés
// peuvent voir la liste des rôles existants.
//
// Utilisée pour alimenter les sélecteurs de rôle dans :
//  - le formulaire de création d'utilisateur
//  - le formulaire de modification d'utilisateur
//
// GET /api/roles
roleRouter.get('/', requireAuth, getRoles);

export default roleRouter;
