import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, logout, getStores, getMe, getRoles, getAccessibleStores, changePassword, resetPassword, initiatePasswordReset, verifyResetOtp, completePasswordReset } from '../controllers/authController';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import { requireOrg } from '../middlewares/orgMiddleware';
import { ROLE_SUPER_ADMIN, ROLE_ADMIN } from '../config/roles';

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

// ── MOT DE PASSE OUBLIÉ (flux OTP en 3 étapes) ─────────────────────────
// Route publique — étape 1 : demande d'OTP par email.
// POST /api/auth/forgot-password
authRouter.post('/forgot-password', initiatePasswordReset);

// Route publique — étape 2 : vérification de l'OTP.
// POST /api/auth/verify-reset-otp
authRouter.post('/verify-reset-otp', verifyResetOtp);

// Route protégée (scope reset-password) — étape 3 : nouveau mot de passe.
// POST /api/auth/reset-password
authRouter.post('/reset-password', requireAuth, completePasswordReset);

// Route publique avec rate limiting — accessible sans être connecté.
// Le rate limiter protège contre les attaques par force brute.
// POST /api/auth/login
authRouter.post('/login', loginRateLimiter, login);

// Route protégée — nécessite d'être connecté (le middleware vérifie le token JWT).
// POST /api/auth/logout
authRouter.post('/logout', requireAuth, logout);

// Route protégée — change le mot de passe de l'utilisateur connecte.
// POST /api/auth/change-password
authRouter.post('/change-password', requireAuth, requireOrg, changePassword);

// Route protégée — réinitialise le mot de passe d'un utilisateur (admin only).
// POST /api/auth/admin-reset-password
authRouter.post(
  '/admin-reset-password',
  requireAuth,
  requireOrg,
  requireRole(ROLE_SUPER_ADMIN, ROLE_ADMIN),
  resetPassword,
);

// Route protégée — retourne le profil complet de l'utilisateur connecté.
// Sans rate limit : appel léger, prévu pour être appelé fréquemment par le frontend
// (ex : hydratation du contexte utilisateur au chargement de l'app).
// GET /api/auth/me
authRouter.get('/me', requireAuth, getMe);

// Route protégée — retourne les magasins accessibles à l'utilisateur connecté.
// SA → tous les magasins | Admin → ses magasins assignés uniquement.
// Utilisée pour alimenter le filtre par magasin dans le journal d'audit.
// GET /api/auth/accessible-stores
authRouter.get(
  '/accessible-stores',
  requireAuth,
  requireOrg,
  requireRole(ROLE_SUPER_ADMIN, ROLE_ADMIN),
  getAccessibleStores,
);

export default authRouter;
