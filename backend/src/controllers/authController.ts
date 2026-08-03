import { Request, Response } from 'express';
import { AuditAction } from '@prisma/client';
import { z, ZodError } from 'zod';
import jwt from 'jsonwebtoken';
import * as authService from '../services/auth.service';
import { getJwtSecret } from '../services/auth.service';
import type { LoginResult } from '../services/auth.service';
import * as userRepository from '../repositories/user.repository';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { logAction, resolveActorName, resolveStoreName } from '../services/audit.service';
import { ROLE_PLATFORM_MANAGER, ROLE_SUPER_ADMIN } from '../config/roles';
import { extractIp } from '../utils/request';
import { formatZodErrors } from '../utils/zod';

// Nom du cookie qui stockera le token JWT côté navigateur
const COOKIE_NAME = 'auth_token';

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

/**
 * Schema de validation du body de login.
 * storeId est optionnel : si absent, le service auto-selectionne le store
 * selon user_store_access (1 store = auto, N stores = selecteur).
 */
const loginBodySchema = z.object({
  username: z.string().min(1, 'Le nom d\'utilisateur est obligatoire'),
  password: z.string().min(1, 'Le mot de passe est obligatoire'),
  storeId: z.string().uuid('Format de storeId invalide').optional(),
});

/**
 * POST /api/auth/login
 *
 * Authentifie l'utilisateur avec ses identifiants.
 * Le storeId est optionnel : si absent et que l'utilisateur n'a qu'un seul
 * magasin, il est auto-selectionne. S'il en a plusieurs, la reponse contient
 * `requiresStoreSelection` avec la liste des magasins du user.
 *
 * Body attendu : { username: string, password: string, storeId?: string }
 */
export async function login(req: Request, res: Response): Promise<void> {
  const parseResult = loginBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      message: 'Donnees invalides.',
      errors: formatZodErrors(parseResult.error),
    });
    return;
  }

  const { username, password, storeId } = parseResult.data;

  try {
    const resultat: LoginResult = await authService.login(username, password, storeId ?? null, extractIp(req));

    if ('requiresStoreSelection' in resultat && resultat.requiresStoreSelection) {
      res.status(200).json({
        success: true,
        requiresStoreSelection: true,
        stores: resultat.stores,
      });
      return;
    }

    if ('requiresPasswordChange' in resultat && resultat.requiresPasswordChange) {
      res.status(200).json({
        success: true,
        requiresPasswordChange: true,
        temporaryToken: resultat.temporaryToken,
      });
      return;
    }

    // Connexion reussie avec auto-selection
    res.cookie(COOKIE_NAME, resultat.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: 'Connexion réussie.',
      user: resultat.user,
    });
  } catch (error) {
    if (error instanceof Error) {
      const messagesMetier = [
        'Identifiants invalides',
        'Acces a ce magasin non autorise',
        'Ce compte a ete desactive. Contactez votre administrateur.',
        'Aucun magasin actif accessible pour ce compte.',
        'Cette organisation est suspendue ou desactivee. Contactez votre administrateur.',
      ];
      if (messagesMetier.includes(error.message)) {
        res.status(401).json({
          success: false,
          message: error.message,
        });
        return;
      }
    }

    console.error('Erreur lors de la connexion :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue. Veuillez réessayer.',
    });
  }
}

/**
 * POST /api/auth/logout
 *
 * Déconnecte l'utilisateur en effaçant le cookie d'authentification.
 * Simple et sans appel à la base de données.
 */
export async function logout(req: AuthenticatedRequest, res: Response): Promise<void> {
  // Audit de la déconnexion — avant de supprimer le cookie (on a encore req.user)
  if (req.user) {
    const { userId, storeId, orgId } = req.user;
    const ip = extractIp(req);
    Promise.all([resolveActorName(userId), resolveStoreName(storeId)])
      .then(([actorName, storeName]) =>
        logAction({
          actorId:   userId,
          actorName,
          action:    AuditAction.USER_LOGOUT,
          storeId,
          storeName,
          ipAddress: ip,
        }),
      )
      .catch((err) => console.error('[audit] Échec du log de déconnexion :', err));
  }

  res.clearCookie(COOKIE_NAME);
  res.status(200).json({
    success: true,
    message: 'Déconnexion réussie.',
  });
}

/**
 * GET /api/auth/me
 *
 * Retourne le profil complet de l'utilisateur actuellement connecté.
 * Protégé par requireAuth — req.user contient le payload JWT décodé.
 *
 * On va chercher les données fraîches en base (et non dans le JWT) pour garantir
 * que username, email, roleName, storeName et les champs d'organisation
 * sont à jour même si modifiés depuis la dernière connexion.
 *
 * Réponse : { success, user: { id, username, email, roleId, roleName,
 *   storeId, storeName, storeColor, orgId, orgName, isPlatformManager,
 *   mustChangePassword, isActive } }
 *
 * Sécurité : pwd_hash n'est JAMAIS retourné dans cette réponse.
 */
export async function getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
  // req.user est garanti présent par requireAuth — assertion non-null sûre ici
  const { userId, roleId, storeId, orgId } = req.user!;

  // JWT obsolète (émis avant le déploiement multi-tenant) : pas d'orgId.
  // On répond 401 pour que le frontend (SessionContext) déconnecte proprement,
  // au lieu d'un crash 500 sur organization.findUnique(id: undefined).
  if (!orgId) {
    res.status(401).json({
      success: false,
      message: 'Session expirée, veuillez vous reconnecter.',
    });
    return;
  }

  try {
    // Récupération de l'utilisateur en base — données toujours fraîches
    const utilisateur = await userRepository.findById(userId);

    if (!utilisateur) {
      res.status(404).json({
        success: false,
        message: 'Utilisateur introuvable.',
      });
      return;
    }

    // Récupération du nom du rôle depuis la base (ne pas se fier au JWT)
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { name: true },
    });

    // Récupération du nom et de la couleur du magasin de connexion actuel
    const magasin = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, color: true },
    });

    // Récupération du nom de l'organisation
    const organisation = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });

    res.status(200).json({
      success: true,
      user: {
        id: utilisateur.id,
        username: utilisateur.username,
        email: utilisateur.email,
        roleId,
        roleName: role?.name ?? null,
        storeId,
        storeName: magasin?.name ?? null,
        storeColor: magasin?.color ?? '#1D4ED8',
        orgId,
        orgName: organisation?.name ?? null,
        isPlatformManager: role?.name === ROLE_PLATFORM_MANAGER,
        mustChangePassword: utilisateur.must_change_password,
        isActive: utilisateur.is_active,
      },
    });
  } catch (erreur) {
    console.error('Erreur lors de la récupération du profil utilisateur :', erreur);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * GET /api/roles
 *
 * Retourne la liste de tous les rôles disponibles, à l'exclusion du rôle
 * "Super Administrateur" qui est réservé au compte initial créé par le seed.
 *
 * Endpoint public (pas de requireAuth) — utilisé pour alimenter les listes
 * déroulantes de création/modification d'utilisateur côté frontend.
 *
 * Sécurité : le rôle "Super Administrateur" est exclu côté base de données
 * pour éviter toute erreur d'attribution, même si le frontend ne l'affiche pas.
 *
 * Réponse : { success: true, roles: [{ id: string, name: string }] }
 */
export async function getRoles(req: Request, res: Response): Promise<void> {
  try {
    // On exclut systématiquement "Super Administrateur" — ce rôle ne peut pas
    // être attribué via l'API. Filtrage côté DB pour ne pas exposer l'ID non plus.
    const roles = await prisma.role.findMany({
      where: {
        name: { not: ROLE_SUPER_ADMIN },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    res.status(200).json({
      success: true,
      roles,
    });
  } catch (erreur) {
    console.error('Erreur lors de la récupération des rôles :', erreur);
    res.status(500).json({
      success: false,
      message: 'Impossible de récupérer la liste des rôles.',
    });
  }
}

/**
 * GET /api/auth/stores
 *
 * Retourne la liste de tous les magasins disponibles.
 * Endpoint public — utilisé pour alimenter le sélecteur de magasin
 * dans le formulaire de connexion avant que l'utilisateur soit authentifié.
 */
export async function getStores(req: Request, res: Response): Promise<void> {
  try {
    const magasins = await authService.getAvailableStores();

    res.status(200).json({
      success: true,
      stores: magasins,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des magasins :', error);
    res.status(500).json({
      success: false,
      message: 'Impossible de récupérer la liste des magasins.',
    });
  }
}

/**
 * GET /api/auth/accessible-stores
 *
 * Retourne les magasins accessibles à l'utilisateur connecté.
 *
 *   SA             → tous les magasins
 *   Administrateur → uniquement ses magasins assignés
 *
 * Protégé par requireAuth — le rôle est déduit du JWT.
 */
export async function getAccessibleStores(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { userId, roleId, orgId } = req.user!;

  try {
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { name: true },
    });

    const isSuperAdmin = role?.name === ROLE_SUPER_ADMIN;
    // activeOnly=false permet à l'audit d'inclure les établissements fermés dans son filtre
    const activeOnly = req.query.activeOnly !== 'false';
    const magasins = await authService.getAccessibleStores(orgId, userId, isSuperAdmin, activeOnly);

    res.status(200).json({
      success: true,
      stores: magasins,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des magasins accessibles :', error);
    res.status(500).json({
      success: false,
      message: 'Impossible de récupérer la liste des magasins.',
    });
  }
}

// ---------------------------------------------------------------------------
// Schemas Zod — Changement de mot de passe
// ---------------------------------------------------------------------------

const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1, 'Le mot de passe actuel est obligatoire'),
  newPassword:     z.string().min(1, 'Le nouveau mot de passe est obligatoire'),
});

/**
 * POST /api/auth/change-password
 *
 * Change le mot de passe de l'utilisateur connecte.
 * Verifie le mot de passe actuel, applique la politique de securite,
 * hache le nouveau mot de passe, passe must_change_password = false.
 *
 * Body attendu : { currentPassword: string, newPassword: string }
 * Protégé par requireAuth.
 */
export async function changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parseResult = changePasswordBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      message: 'Données invalides.',
      errors: formatZodErrors(parseResult.error),
    });
    return;
  }

  const { currentPassword, newPassword } = parseResult.data;
  const { userId, orgId } = req.user!;

  try {
    await authService.changePassword(orgId, userId, currentPassword, newPassword, extractIp(req));

    res.status(200).json({
      success: true,
      message: 'Mot de passe change avec succes.',
    });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === 'Le mot de passe actuel est incorrect.' ||
        error.message.startsWith('Le mot de passe doit contenir')
      ) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
        return;
      }
    }

    console.error('Erreur lors du changement de mot de passe :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

// ---------------------------------------------------------------------------
// Schemas Zod — Reinitialisation de mot de passe
// ---------------------------------------------------------------------------

const resetPasswordBodySchema = z.object({
  userId: z.string().uuid('Format de userId invalide'),
});

/**
 * POST /api/auth/reset-password
 *
 * Reinitialise le mot de passe d'un utilisateur (admin only).
 * Genere un mot de passe aleatoire de 16 caracteres, le hache,
 * force must_change_password = true sur la cible.
 * Retourne le mot de passe en clair dans la reponse JSON.
 *
 * Body attendu : { userId: string }
 * Protégé par requireAuth + requireRole('Super Administrateur', 'Administrateur').
 */
export async function resetPassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parseResult = resetPasswordBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      message: 'Donnees invalides.',
      errors: formatZodErrors(parseResult.error),
    });
    return;
  }

  const { userId: targetId } = parseResult.data;
  const { userId: adminId, orgId } = req.user!;

  try {
    const temporaryPassword = await authService.resetPassword(orgId, targetId, adminId, extractIp(req));

    res.status(200).json({
      success: true,
      message: 'Mot de passe reinitialise avec succes.',
      temporaryPassword,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Utilisateur cible introuvable.') {
      res.status(404).json({
        success: false,
        message: error.message,
      });
      return;
    }
    if (
      error instanceof Error &&
      (error.message === 'Le compte Super Administrateur ne peut pas être réinitialisé de cette façon.' ||
        error.message === "Un Administrateur ne peut pas réinitialiser le mot de passe d'un autre Administrateur.")
    ) {
      res.status(403).json({
        success: false,
        message: error.message,
      });
      return;
    }

    console.error('Erreur lors de la reinitialisation du mot de passe :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

// ---------------------------------------------------------------------------
// Schemas Zod — Mot de passe oublié (OTP)
// ---------------------------------------------------------------------------

const forgotPasswordBodySchema = z.object({
  email: z.string().email('Format d\'adresse email invalide'),
});

const verifyOtpBodySchema = z.object({
  email: z.string().email('Format d\'adresse email invalide'),
  otp:   z.string().length(6, 'Le code doit contenir 6 chiffres'),
});

const completeResetBodySchema = z.object({
  newPassword: z.string().min(1, 'Le nouveau mot de passe est obligatoire'),
});

/**
 * POST /api/auth/forgot-password
 *
 * Étape 1 — L'utilisateur fournit son email. Un OTP est généré, son hash
 * est stocké dans un cookie JWT signé, et l'OTP est envoyé par email.
 * Ne révèle pas si l'email existe.
 *
 * Route publique.
 */
export async function initiatePasswordReset(req: Request, res: Response): Promise<void> {
  const parseResult = forgotPasswordBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      message: 'Adresse email invalide.',
      errors: formatZodErrors(parseResult.error),
    });
    return;
  }

  try {
    const result = await authService.initiatePasswordReset(parseResult.data.email);

    if (result) {
      const cookiePayload = { email: result.email, otpHash: result.otpHash };
      const cookieToken = jwt.sign(cookiePayload, getJwtSecret(), { expiresIn: '10m' });

      res.cookie('reset_otp', cookieToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 10 * 60 * 1000,
      });

      const { sendPasswordResetOtp } = await import('../services/email.service');
      sendPasswordResetOtp(result.email, result.otp)
        .catch((err) => console.error('[email] Échec de l\'envoi de l\'OTP :', err));
    }

    res.status(200).json({
      success: true,
      message: 'Si cette adresse email est associée à un compte, vous recevrez un code de vérification.',
    });
  } catch (error) {
    console.error('Erreur lors de l\'initiation de réinitialisation :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * POST /api/auth/verify-reset-otp
 *
 * Étape 2 — L'utilisateur soumet l'OTP reçu par email. S'il est valide,
 * un resetToken (JWT scope reset-password, 5 min) est retourné.
 *
 * Route publique (le cookie reset_otp fait office de session temporaire).
 */
export async function verifyResetOtp(req: Request, res: Response): Promise<void> {
  const parseResult = verifyOtpBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      message: 'Données invalides.',
      errors: formatZodErrors(parseResult.error),
    });
    return;
  }

  const cookieToken = req.cookies?.reset_otp;
  if (!cookieToken) {
    res.status(400).json({
      success: false,
      message: 'Session de réinitialisation expirée. Veuillez recommencer.',
    });
    return;
  }

  let cookiePayload: { email: string; otpHash: string };
  try {
    cookiePayload = jwt.verify(cookieToken, getJwtSecret()) as { email: string; otpHash: string };
  } catch {
    res.status(400).json({
      success: false,
      message: 'Session de réinitialisation expirée. Veuillez recommencer.',
    });
    return;
  }

  const { email, otp } = parseResult.data;

  if (email.toLowerCase().trim() !== cookiePayload.email.toLowerCase().trim()) {
    res.status(400).json({
      success: false,
      message: 'Code de vérification invalide.',
    });
    return;
  }

  try {
    const resetToken = authService.verifyResetOtp(email, otp, cookiePayload.otpHash);

    res.clearCookie('reset_otp');

    res.status(200).json({
      success: true,
      message: 'Code vérifié avec succès.',
      resetToken,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Code de vérification invalide.') {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    console.error('Erreur lors de la vérification OTP :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * POST /api/auth/reset-password
 *
 * Étape 3 — L'utilisateur soumet son nouveau mot de passe. Le resetToken
 * doit être passé dans le header Authorization.
 *
 * Protégé par requireAuth (accepte le scope reset-password).
 */
export async function completePasswordReset(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parseResult = completeResetBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      message: 'Données invalides.',
      errors: formatZodErrors(parseResult.error),
    });
    return;
  }

  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.status(400).json({
      success: false,
      message: 'Token de réinitialisation manquant.',
    });
    return;
  }

  try {
    await authService.completePasswordReset(token, parseResult.data.newPassword);

    res.status(200).json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès.',
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'Token de réinitialisation invalide ou expiré.' ||
       error.message === 'Token de réinitialisation invalide.' ||
       error.message.startsWith('Le mot de passe doit contenir'))
    ) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    console.error('Erreur lors de la réinitialisation du mot de passe :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}
