import { Router } from 'express';
import { login, logout } from '../controllers/authController';
import { requireAuth } from '../middlewares/authMiddleware';

const authRouter = Router();

// Route publique : accessible sans être connecté
// POST /api/auth/login
authRouter.post('/login', login);

// Route protégée : nécessite d'être connecté (le middleware vérifie le token)
// POST /api/auth/logout
authRouter.post('/logout', requireAuth, logout);

export default authRouter;
