import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, logout, getStores, getMe, getRoles } from '../controllers/authController';
import { requireAuth } from '../middlewares/authMiddleware';

const authRouter = Router();

// ---------------------------------------------------------------------------
// Rate limiter pour la route de login
// Objectif : limiter les attaques par force brute sur les identifiants.
// Règle : max 10 tentatives par fenêtre de 15 minutes, par adresse IP.
// ---------------------------------------------------------------------------
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Fenêtre de 15 minutes en millisecondes
  max: 10,                   // Nombre maximum de requêtes par IP dans la fenêtre
  standardHeaders: true,     // Envoie les headers RateLimit-* standards (RFC 6585)
  legacyHeaders: false,      // Désactive les anciens headers X-RateLimit-*
  // Message retourné au client quand la limite est atteinte
  message: {
    message: 'Trop de tentatives. Réessayez dans 15 minutes.',
  },
});

// ---------------------------------------------------------------------------
// Routes d'authentification
// ---------------------------------------------------------------------------

// Route publique — accessible sans être connecté.
// Retourne la liste des magasins pour alimenter le sélecteur du formulaire de login.
// GET /api/auth/stores
authRouter.get('/stores', getStores);

// Route publique avec rate limiting — accessible sans être connecté.
// Le rate limiter protège contre les attaques par force brute.
// POST /api/auth/login
authRouter.post('/login', loginRateLimiter, login);

// Route protégée — nécessite d'être connecté (le middleware vérifie le token JWT).
// POST /api/auth/logout
authRouter.post('/logout', requireAuth, logout);

// Route protégée — retourne le profil complet de l'utilisateur connecté.
// Sans rate limit : appel léger, prévu pour être appelé fréquemment par le frontend
// (ex : hydratation du contexte utilisateur au chargement de l'app).
// GET /api/auth/me
authRouter.get('/me', requireAuth, getMe);

export default authRouter;
