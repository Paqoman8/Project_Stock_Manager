import { Request, Response } from 'express';
import * as userService from '../services/user.service';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

/** Extrait l'IP réelle du client (gère les proxys via X-Forwarded-For). */
function extractIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim() || undefined;
  }
  return req.ip ?? undefined;
}

// ---------------------------------------------------------------------------
// Messages métier — utilisés pour distinguer les erreurs 400/409/403 des erreurs 500
//
// Toute erreur dont le message correspond à l'un de ces libellés est une erreur
// métier attendue (données invalides, conflit, violation de règle de sécurité)
// et doit être retournée au client avec un code 4xx approprié.
// Les erreurs inconnues sont des erreurs techniques et retournent 500.
// ---------------------------------------------------------------------------

// 400 Bad Request : ressource référencée introuvable en base, état incohérent,
// ou données d'entrée ne respectant pas les règles de format.
const ERREURS_METIER_400 = new Set([
  'Rôle introuvable',
  'Magasin introuvable',
  'Utilisateur introuvable',
  // Tentative de réactivation d'un compte déjà actif — état incohérent, pas un 403
  'Ce compte est déjà actif.',
  // Validation de format des données entrantes
  "Format d'identifiant invalide. Attendu : prenom.nom",
  "Format d'adresse email invalide.",
  'Le mot de passe ne respecte pas les critères de sécurité requis.',
]);

// 409 Conflict : violation d'unicité en base
const ERREURS_METIER_409 = new Set([
  'Identifiant déjà utilisé',
  'Email déjà utilisé',
]);

// 403 Forbidden : violation des règles de sécurité (SA et hiérarchie Admin).
// Ces règles sont absolues et incontournables — un 403 signale au client qu'il
// s'agit d'une interdiction de sécurité, pas d'une erreur de validation ordinaire.
const ERREURS_METIER_403 = new Set([
  // Règles absolues concernant le Super Administrateur
  "Impossible d'attribuer le rôle Super Administrateur à un nouvel utilisateur.",
  'Impossible de modifier le rôle du Super Administrateur.',
  "Impossible d'attribuer le rôle Super Administrateur.",
  'Le compte Super Administrateur ne peut pas être désactivé.',
  'Le compte Super Administrateur ne peut pas être modifié de cette façon.',
  // Règles de hiérarchie : un Admin ne peut pas gérer d'autres Admins
  'Un Administrateur ne peut pas créer un autre Administrateur.',
  'Un Administrateur ne peut pas modifier un autre Administrateur.',
  'Un Administrateur ne peut pas attribuer le rôle Administrateur.',
  'Un Administrateur ne peut pas désactiver un autre Administrateur.',
  'Un Administrateur ne peut pas réactiver un autre Administrateur.',
  'Un Administrateur ne peut pas modifier son propre rôle.',
]);

/**
 * Détermine le code HTTP approprié pour une erreur métier donnée.
 * Retourne null si l'erreur n'est pas reconnue (=> 500 côté appelant).
 *
 * Ordre de priorité : 403 > 409 > 400 — les violations de sécurité ont la priorité.
 *
 * @param message - Message de l'erreur levée par le service
 */
function codeHttpPourErreurMetier(message: string): number | null {
  if (ERREURS_METIER_403.has(message)) return 403;
  if (ERREURS_METIER_409.has(message)) return 409;
  if (ERREURS_METIER_400.has(message)) return 400;
  return null;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/users
 *
 * Retourne la liste de tous les utilisateurs (actifs et inactifs par défaut)
 * avec leur rôle et leurs magasins. Passe includeInactive=true par défaut
 * car SA et Admin doivent voir tous les comptes sans paramètre supplémentaire.
 * Accepte le query param ?includeInactive=false pour n'inclure que les actifs.
 *
 * Protégé par requireAuth + requireRole('Super Administrateur', 'Administrateur').
 * Sécurité : pwd_hash n'est jamais retourné dans cette réponse.
 */
export async function listUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId = req.user!.orgId;
  // Par défaut on inclut les inactifs — SA et Admin doivent les voir.
  // Le query param permet de filtrer si le frontend a besoin d'un listing réduit.
  const inclureInactifs = req.query.includeInactive !== 'false';

  try {
    const utilisateurs = await userService.getAllUsers(orgId, inclureInactifs);

    res.status(200).json({
      success: true,
      users: utilisateurs,
    });
  } catch (erreur) {
    console.error('Erreur lors du listing des utilisateurs :', erreur);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * POST /api/users
 *
 * Crée un nouvel utilisateur.
 *
 * Body attendu : { username, email, password, roleId, storeIds: string[] } — storeIds non vide.
 *
 * Protégé par requireAuth + requireRole('Super Administrateur', 'Administrateur').
 * Retourne 409 si username ou email déjà utilisé.
 * Retourne 400 si rôle ou magasin introuvable, storeIds vide, ou champs obligatoires manquants.
 * Retourne 403 si l'Administrateur tente de créer un compte Administrateur ou SA.
 *
 * Sécurité : req.user!.roleId est passé au service pour les vérifications de hiérarchie.
 */
export async function createUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { username, email, password, roleId, storeIds } = req.body as {
    username: unknown;
    email: unknown;
    password: unknown;
    roleId: unknown;
    storeIds: unknown;
  };

  // Validation de présence des champs obligatoires
  if (!username || !email || !password || !roleId) {
    res.status(400).json({
      success: false,
      message: 'Les champs username, email, password et roleId sont obligatoires.',
    });
    return;
  }

  // Validation des types
  if (
    typeof username !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    typeof roleId !== 'string'
  ) {
    res.status(400).json({
      success: false,
      message: 'Format de données invalide.',
    });
    return;
  }

  // storeIds doit être un tableau de chaînes non vide — un utilisateur doit
  // toujours être rattaché à au moins un établissement à la création.
  if (!Array.isArray(storeIds) || !storeIds.every((id) => typeof id === 'string')) {
    res.status(400).json({
      success: false,
      message: "Le champ storeIds doit être un tableau d'identifiants.",
    });
    return;
  }
  if (storeIds.length === 0) {
    res.status(400).json({
      success: false,
      message: 'Veuillez attribuer au moins un établissement à cet utilisateur.',
    });
    return;
  }

    const orgId = req.user!.orgId;

  try {
    // On passe req.user!.roleId pour que le service puisse appliquer les règles
    // de hiérarchie (Admin ne peut pas créer un autre Admin).
    const nouvelUtilisateur = await userService.createUser(
      orgId,
      {
        username,
        email,
        password,
        roleId,
        storeIds,
      },
      { id: req.user!.userId, roleId: req.user!.roleId, storeId: req.user!.storeId, ipAddress: extractIp(req) },
    );

    res.status(201).json({
      success: true,
      message: 'Utilisateur créé avec succès.',
      user: nouvelUtilisateur,
    });
  } catch (erreur) {
    if (erreur instanceof Error) {
      const codeHttp = codeHttpPourErreurMetier(erreur.message);
      if (codeHttp !== null) {
        res.status(codeHttp).json({
          success: false,
          message: erreur.message,
        });
        return;
      }
    }

    console.error("Erreur lors de la création de l'utilisateur :", erreur);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * PUT /api/users/:id
 *
 * Met à jour un utilisateur existant.
 * Tous les champs du body sont optionnels — seuls ceux présents sont modifiés.
 *
 * Body accepté : { username?, email?, password?, roleId?, storeIds? } —
 * storeIds, s'il est fourni, ne peut pas être vide (absent = inchangé).
 *
 * Protégé par requireAuth + requireRole('Super Administrateur', 'Administrateur').
 * Retourne 403 si l'Administrateur tente de modifier un autre Administrateur ou SA.
 *
 * Sécurité : req.user!.roleId est passé au service pour les vérifications de hiérarchie.
 */
export async function updateUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;

  if (!id || typeof id !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Identifiant utilisateur invalide.',
    });
    return;
  }

  const { username, email, password, roleId, storeIds } = req.body as {
    username: unknown;
    email: unknown;
    password: unknown;
    roleId: unknown;
    storeIds: unknown;
  };

  // Validation des types des champs optionnels — on ne valide que ce qui est fourni
  if (username !== undefined && typeof username !== 'string') {
    res.status(400).json({ success: false, message: 'Format de données invalide.' });
    return;
  }
  if (email !== undefined && email !== null && typeof email !== 'string') {
    res.status(400).json({ success: false, message: 'Format de données invalide.' });
    return;
  }
  if (password !== undefined && typeof password !== 'string') {
    res.status(400).json({ success: false, message: 'Format de données invalide.' });
    return;
  }
  if (roleId !== undefined && typeof roleId !== 'string') {
    res.status(400).json({ success: false, message: 'Format de données invalide.' });
    return;
  }
  if (
    storeIds !== undefined &&
    (!Array.isArray(storeIds) || !storeIds.every((s) => typeof s === 'string'))
  ) {
    res.status(400).json({ success: false, message: 'Format de données invalide.' });
    return;
  }
  // storeIds absent du body = on ne touche pas aux accès actuels (comportement inchangé).
  // storeIds fourni mais vide = tentative de retirer tous les magasins — refusé, un
  // utilisateur doit toujours rester rattaché à au moins un établissement.
  if (storeIds !== undefined && storeIds.length === 0) {
    res.status(400).json({
      success: false,
      message: 'Veuillez attribuer au moins un établissement à cet utilisateur.',
    });
    return;
  }

  try {
    const orgId = req.user!.orgId;
    // On passe req.user!.roleId pour que le service applique les règles de hiérarchie.
    const utilisateurMisAJour = await userService.updateUser(
      orgId,
      id,
      {
        username: username as string | undefined,
        email: email as string | undefined,
        password: password as string | undefined,
        roleId: roleId as string | undefined,
        storeIds: storeIds as string[] | undefined,
      },
      { id: req.user!.userId, roleId: req.user!.roleId, storeId: req.user!.storeId, ipAddress: extractIp(req) },
    );

    res.status(200).json({
      success: true,
      message: 'Utilisateur mis à jour avec succès.',
      user: utilisateurMisAJour,
    });
  } catch (erreur) {
    if (erreur instanceof Error && erreur.message === 'SA_PROTECTED_STORE_REQUIRED') {
      res.status(422).json({
        success: false,
        message: 'Le Hub Central ne peut pas être retiré des accès du Super Administrateur.',
      });
      return;
    }

    if (erreur instanceof Error) {
      const codeHttp = codeHttpPourErreurMetier(erreur.message);
      if (codeHttp !== null) {
        res.status(codeHttp).json({
          success: false,
          message: erreur.message,
        });
        return;
      }
    }

    console.error("Erreur lors de la mise à jour de l'utilisateur :", erreur);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * DELETE /api/users/:id
 *
 * Désactive un utilisateur (soft delete — is_active passe à false).
 * L'utilisateur reste en base pour la traçabilité des logs et transactions passées.
 *
 * Protégé par requireAuth + requireRole('Super Administrateur', 'Administrateur').
 * Retourne 403 si l'utilisateur cible est le SA (règle absolue).
 * Retourne 403 si l'Administrateur tente de désactiver un autre Administrateur.
 *
 * Sécurité : req.user!.roleId est passé au service pour les vérifications de hiérarchie.
 */
export async function deactivateUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;

  if (!id || typeof id !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Identifiant utilisateur invalide.',
    });
    return;
  }

  // Raison optionnelle fournie dans le body de la requête DELETE
  const reason = typeof req.body?.reason === 'string' && req.body.reason.trim()
    ? req.body.reason.trim()
    : undefined;

  try {
    const orgId = req.user!.orgId;
    await userService.deactivateUser(
      orgId,
      id,
      { id: req.user!.userId, roleId: req.user!.roleId, storeId: req.user!.storeId, ipAddress: extractIp(req) },
      reason,
    );

    res.status(200).json({
      success: true,
      message: 'Utilisateur désactivé avec succès.',
    });
  } catch (erreur) {
    if (erreur instanceof Error) {
      const codeHttp = codeHttpPourErreurMetier(erreur.message);
      if (codeHttp !== null) {
        res.status(codeHttp).json({
          success: false,
          message: erreur.message,
        });
        return;
      }
    }

    console.error("Erreur lors de la désactivation de l'utilisateur :", erreur);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * PATCH /api/users/:id/reactivate
 *
 * Réactive un compte utilisateur précédemment désactivé.
 *
 * Protégé par requireAuth + requireRole('Super Administrateur', 'Administrateur').
 * Retourne 400 si le compte est déjà actif.
 * Retourne 403 si l'Administrateur tente de réactiver un autre Administrateur ou SA.
 * Retourne 400 si l'utilisateur cible est introuvable.
 *
 * Sécurité : req.user!.roleId est passé au service pour les vérifications de hiérarchie.
 */
export async function reactivateUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;

  if (!id || typeof id !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Identifiant utilisateur invalide.',
    });
    return;
  }

  try {
    const orgId = req.user!.orgId;
    const utilisateurReactive = await userService.reactivateUser(
      orgId,
      id,
      { id: req.user!.userId, roleId: req.user!.roleId, storeId: req.user!.storeId, ipAddress: extractIp(req) },
    );

    res.status(200).json({
      success: true,
      message: 'Utilisateur réactivé avec succès.',
      user: utilisateurReactive,
    });
  } catch (erreur) {
    if (erreur instanceof Error) {
      const codeHttp = codeHttpPourErreurMetier(erreur.message);
      if (codeHttp !== null) {
        res.status(codeHttp).json({
          success: false,
          message: erreur.message,
        });
        return;
      }
    }

    console.error("Erreur lors de la réactivation de l'utilisateur :", erreur);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}
