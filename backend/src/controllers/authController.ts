import { Request, Response } from 'express';
import { AuditAction } from '@prisma/client';
import * as authService from '../services/auth.service';
import * as userRepository from '../repositories/user.repository';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { logAction, resolveActorName, resolveStoreName } from '../services/audit.service';

/** Extrait l'IP réelle du client (gère les proxys via X-Forwarded-For). */
function extractIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim() || undefined;
  }
  return req.ip ?? undefined;
}

// Nom du cookie qui stockera le token JWT côté navigateur
const COOKIE_NAME = 'auth_token';

/**
 * POST /api/auth/login
 *
 * Authentifie l'utilisateur avec ses identifiants et le magasin choisi.
 * Délègue toute la logique métier à authService.login().
 * Pose un cookie httpOnly en cas de succès.
 *
 * Body attendu : { username: string, password: string, storeId: string }
 */
export async function login(req: Request, res: Response): Promise<void> {
  // On extrait les trois champs attendus du formulaire de connexion
  const { username, password, storeId } = req.body as {
    username: unknown;
    password: unknown;
    storeId: unknown;
  };

  // Validation de présence des trois champs obligatoires
  if (!username || !password || !storeId) {
    res.status(400).json({
      success: false,
      message: 'L\'identifiant, le mot de passe et le magasin sont obligatoires.',
    });
    return;
  }

  // Vérification que les champs sont bien des chaînes de caractères
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    typeof storeId !== 'string'
  ) {
    res.status(400).json({
      success: false,
      message: 'Format de données invalide.',
    });
    return;
  }

  try {
    // Le service gère : recherche user, vérification mdp, vérification accès store, JWT, SessionLog
    const resultat = await authService.login(username, password, storeId, extractIp(req));

    // On envoie le token dans un cookie httpOnly.
    // httpOnly = le cookie ne peut PAS être lu par JavaScript côté navigateur (protection XSS)
    // secure = envoyé uniquement via HTTPS en production
    res.cookie(COOKIE_NAME, resultat.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000, // 8 heures en millisecondes
    });

    // On retourne les informations publiques de l'utilisateur connecté
    res.status(200).json({
      success: true,
      message: 'Connexion réussie.',
      user: resultat.user,
    });
  } catch (error) {
    // Les erreurs métier (identifiants invalides, accès refusé) sont distinguées
    // des erreurs techniques pour retourner le bon code HTTP
    if (error instanceof Error) {
      const messagesMetier = ['Identifiants invalides', 'Accès à ce magasin non autorisé', 'Ce compte a été désactivé. Contactez votre administrateur.'];
      if (messagesMetier.includes(error.message)) {
        res.status(401).json({
          success: false,
          message: error.message,
        });
        return;
      }
    }

    // Toute autre erreur = erreur technique — on ne logue pas les détails vers le client
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
    const { userId, storeId } = req.user;
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
 * que username, email, roleName et storeName sont à jour même si modifiés
 * depuis la dernière connexion.
 *
 * Réponse : { success, user: { id, username, email, roleId, roleName, storeId, storeName, isActive } }
 *
 * Sécurité : pwd_hash n'est JAMAIS retourné dans cette réponse.
 */
export async function getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
  // req.user est garanti présent par requireAuth — assertion non-null sûre ici
  const { userId, roleId, storeId } = req.user!;

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

    // Récupération du nom du magasin de connexion actuel
    const magasin = await prisma.store.findUnique({
      where: { id: storeId },
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
        name: { not: 'Super Administrateur' },
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
