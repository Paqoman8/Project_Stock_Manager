import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { AuditAction } from '@prisma/client';
import { prisma } from '../config/database';
import { generateSecurePassword } from '../utils/password';
import { ROLE_PLATFORM_MANAGER, ROLE_SUPER_ADMIN, ROLE_ADMIN } from '../config/roles';
import * as userRepository from '../repositories/user.repository';
import { logAction } from './audit.service';

// ---------------------------------------------------------------------------
// Types exposes par le service — contrat entre service et controller
// ---------------------------------------------------------------------------

/**
 * Contrat du payload JWT signe par le service et verifie par requireAuth.
 */
export type TokenPayload = {
  userId: string;
  email: string;
  roleId: string;
  roleName: string;
  storeId: string;
  orgId: string;
  isPlatformManager: boolean;
  scope?: string;
};

/**
 * Magasin accessible a l'utilisateur via user_store_access.
 */
export type UserStoreOption = {
  id: string;
  name: string;
  location: string | null;
};

/**
 * Resultat d'une connexion reussie.
 */
export type LoginSuccess = {
  requiresStoreSelection: false;
  requiresPasswordChange: false;
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
    roleId: string;
    storeId: string;
    orgId: string;
  };
};

/**
 * L'utilisateur a plusieurs magasins : il doit en choisir un.
 */
export type StoreSelectionRequired = {
  requiresStoreSelection: true;
  requiresPasswordChange: false;
  stores: UserStoreOption[];
};

/**
 * L'utilisateur doit changer son mot de passe avant d'acceder a l'application.
 * Un token temporaire (scope change-password, 5 min) est fourni.
 */
export type RequiresPasswordChange = {
  requiresPasswordChange: true;
  temporaryToken: string;
};

/**
 * Resultat retourne par login() au controller.
 */
export type LoginResult = LoginSuccess | StoreSelectionRequired | RequiresPasswordChange;

/**
 * Un magasin tel qu'il est presente a la liste publique de selection.
 * (conserve pour GET /api/auth/stores, sera deprecie par la suite)
 */
export type StoreOption = {
  id: string;
  name: string;
  location: string | null;
  color: string;
  is_protected: boolean;
};

// ---------------------------------------------------------------------------
// Types internes
// ---------------------------------------------------------------------------

type UserAccessRecord = {
  store_id: string;
  organization_id: string;
  store: {
    id: string;
    name: string;
    location: string | null;
    status: string;
  };
};

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const TOKEN_EXPIRATION = '8h';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET non défini dans les variables d\'environnement.');
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET doit faire au moins 32 caractères (256 bits).');
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Fonctions du service
// ---------------------------------------------------------------------------

/**
 * Authentifie un utilisateur et genere un token JWT portant storeId et orgId.
 *
 * Logique :
 *  1. Cherche l'utilisateur par username
 *  2. Verifie le mot de passe via bcrypt
 *  3. Verifie que le compte est actif
 *  4. Interroge user_store_access pour obtenir les magasins + orgId
 *  5. Si storeId fourni : verifie dans la liste
 *     Si storeId absent  : auto-selection si 1 magasin, selecteur si N
 *  6. Signe le JWT avec { userId, email, roleId, storeId, orgId }
 *  7. Cree un SessionLog en base (non-bloquant)
 *  8. Retourne le token ou la liste des magasins
 */
export async function login(
  username: string,
  password: string,
  storeId: string | null,
  ipAddress?: string,
): Promise<LoginResult> {
  // Etape 1 : Recherche de l'utilisateur
  const utilisateur = await userRepository.findByUsername(username);

  if (!utilisateur) {
    await logAction({
      actorId:   null,
      actorName: username,
      action:    AuditAction.USER_LOGIN_FAILED,
      orgId:     null,
      ipAddress,
      metadata:  { attempted_username: username, reason: 'Utilisateur introuvable' },
    });
    throw new Error('Identifiants invalides');
  }

  // Etape 2 : Verification du mot de passe
  const motDePasseValide = await bcrypt.compare(password, utilisateur.pwd_hash);
  if (!motDePasseValide) {
    await logAction({
      actorId:   utilisateur.id,
      actorName: utilisateur.username,
      action:    AuditAction.USER_LOGIN_FAILED,
      orgId:     null,
      ipAddress,
      metadata:  { attempted_username: username, reason: 'Mot de passe incorrect' },
    });
    throw new Error('Identifiants invalides');
  }

  // Etape 3 : Verification que le compte est actif
  if (!utilisateur.is_active) {
    await logAction({
      actorId:   utilisateur.id,
      actorName: utilisateur.username,
      action:    AuditAction.USER_LOGIN_FAILED,
      orgId:     null,
      ipAddress,
      metadata:  { attempted_username: username, reason: 'Compte desactive' },
    });
    throw new Error('Ce compte a ete desactive. Contactez votre administrateur.');
  }

  // Etape 4 : Interrogation des magasins accessibles via user_store_access
  // On recupere a la fois le store et l'organisation via organization_id
  const userAccesses = await prisma.userStoreAccess.findMany({
    where: { user_id: utilisateur.id },
    select: {
      store_id: true,
      organization_id: true,
      store: {
        select: { id: true, name: true, location: true, status: true },
      },
    },
  });

  // On ne garde que les magasins actifs
  const activeAccesses: UserAccessRecord[] = userAccesses.filter(
    (a) => a.store.status === 'ACTIVE',
  );

  if (activeAccesses.length === 0) {
    await logAction({
      actorId:   utilisateur.id,
      actorName: utilisateur.username,
      action:    AuditAction.USER_LOGIN_FAILED,
      orgId:     null,
      ipAddress,
      metadata:  { attempted_username: username, reason: 'Aucun magasin actif accessible' },
    });
    throw new Error('Aucun magasin actif accessible pour ce compte.');
  }

  // Etape 5 : Determination du storeId et de l'orgId
  let selectedStoreId: string;
  let selectedOrgId: string;

  if (storeId) {
    const matched = activeAccesses.find((a) => a.store_id === storeId);
    if (!matched) {
      const magasinTente = await prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true },
      });
      await logAction({
        actorId:   utilisateur.id,
        actorName: utilisateur.username,
        action:    AuditAction.USER_LOGIN_FAILED,
        orgId:     null,
        storeId,
        storeName: magasinTente?.name ?? 'inconnu',
        ipAddress,
        metadata:  { attempted_username: username, reason: 'Acces magasin non autorise' },
      });
      throw new Error('Acces a ce magasin non autorise');
    }
    selectedStoreId = storeId;
    selectedOrgId = matched.organization_id;
  } else {
    // storeId non fourni — auto-selection ou selecteur
    if (activeAccesses.length === 1) {
      selectedStoreId = activeAccesses[0].store_id;
      selectedOrgId = activeAccesses[0].organization_id;
    } else {
      // Plusieurs magasins : retourne la liste pour que le frontend affiche un selecteur
      return {
        requiresStoreSelection: true,
        requiresPasswordChange: false,
        stores: activeAccesses.map((a) => ({
          id: a.store.id,
          name: a.store.name,
          location: a.store.location,
        })),
      };
    }
  }

  // Etape 5b : Verifier que l'organisation selectionnee est bien active.
  // Le middleware requireOrg bloque les requetes suivantes, mais le login
  // lui-meme doit refuser explicitement une organisation suspendue/desactivee.
  const organisation = await prisma.organization.findUnique({
    where: { id: selectedOrgId },
    select: { status: true, name: true },
  });
  if (!organisation || organisation.status !== 'ACTIVE') {
    await logAction({
      actorId:   utilisateur.id,
      actorName: utilisateur.username,
      action:    AuditAction.USER_LOGIN_FAILED,
      orgId:     selectedOrgId,
      ipAddress,
      metadata:  {
        attempted_username: username,
        reason:             'Organisation inactive',
        status:             organisation?.status ?? 'INCONNUE',
      },
    });
    throw new Error('Cette organisation est suspendue ou desactivee. Contactez votre administrateur.');
  }

  // Etape 6 : Recuperation du nom du role
  const roleRow = await prisma.role.findUnique({
    where: { id: utilisateur.role_id },
    select: { name: true },
  });

  // Etape 6bis : Verifier must_change_password — si vrai, generer un temporaryToken
  if (utilisateur.must_change_password) {
    const tempPayload: TokenPayload = {
      userId: utilisateur.id,
      email: utilisateur.email,
      roleId: utilisateur.role_id,
      roleName: roleRow?.name ?? '',
      storeId: selectedStoreId,
      orgId: selectedOrgId,
      isPlatformManager: roleRow?.name === ROLE_PLATFORM_MANAGER,
      scope: 'change-password',
    };

    const temporaryToken = jwt.sign(tempPayload, getJwtSecret(), {
      expiresIn: '5m',
    });

    // Audit : l'utilisateur s'est authentifié avec succès mais doit changer
    // son mot de passe avant d'accéder à l'application.
    try {
      const magasinTrouve = activeAccesses.find((a) => a.store_id === selectedStoreId);
      await logAction({
        actorId:   utilisateur.id,
        actorName: utilisateur.username,
        action:    AuditAction.USER_LOGIN,
        orgId:     selectedOrgId,
        storeId:   selectedStoreId,
        storeName: magasinTrouve?.store.name ?? 'inconnu',
        ipAddress,
        metadata:  { reason: 'must_change_password', temporary_token: true },
      });
    } catch (err) {
      console.error('[audit] Échec du log de connexion (must_change_password) :', err);
    }

    return {
      requiresPasswordChange: true,
      temporaryToken,
    };
  }

  // Etape 7 : Generation du JWT
  const secret = getJwtSecret();
  const tokenPayload: TokenPayload = {
    userId: utilisateur.id,
    email: utilisateur.email,
    roleId: utilisateur.role_id,
    roleName: roleRow?.name ?? '',
    storeId: selectedStoreId,
    orgId: selectedOrgId,
    isPlatformManager: roleRow?.name === ROLE_PLATFORM_MANAGER,
  };

  const token = jwt.sign(tokenPayload, secret, {
    expiresIn: TOKEN_EXPIRATION,
  });

  // Etape 8 : SessionLog — non-bloquant
  try {
    await prisma.sessionLog.create({
      data: {
        user_id: utilisateur.id,
        store_id: selectedStoreId,
        organization_id: selectedOrgId,
      },
    });
  } catch (erreurSessionLog) {
    console.error('Avertissement : impossible de creer le SessionLog :', erreurSessionLog);
  }

  // Etape 9 : Audit de connexion reussie — non-bloquant
  try {
    const magasin = activeAccesses.find((a) => a.store_id === selectedStoreId);
    await logAction({
      actorId:   utilisateur.id,
      actorName: utilisateur.username,
      action:    AuditAction.USER_LOGIN,
      orgId:     selectedOrgId,
      storeId:   selectedStoreId,
      storeName: magasin?.store.name ?? 'inconnu',
      ipAddress,
    });
  } catch (errAudit) {
    console.error('[audit] Echec du log de connexion :', errAudit);
  }

  return {
    requiresStoreSelection: false,
    requiresPasswordChange: false,
    token,
    user: {
      id: utilisateur.id,
      username: utilisateur.username,
      email: utilisateur.email,
      roleId: utilisateur.role_id,
      storeId: selectedStoreId,
      orgId: selectedOrgId,
    },
  };
}

/**
 * Retourne les magasins disponibles dans la base — uniquement les etablissements ACTIVE.
 * Utilise par GET /api/auth/stores pour le selecteur public de la page login.
 *
 * Sécurité : par défaut la liste publique est vide pour éviter l'énumération
 * d'établissements. Elle peut être réactivée via ALLOW_PUBLIC_STORE_LIST=true
 * (non recommandé en production).
 *
 * @deprecated Le selecteur de magasin sera supprime du formulaire de login.
 */
export async function getAvailableStores(): Promise<StoreOption[]> {
  if (process.env.ALLOW_PUBLIC_STORE_LIST !== 'true') {
    return [];
  }

  return prisma.store.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      location: true,
      color: true,
      is_protected: true,
    },
    orderBy: { name: 'asc' },
  });
}

/**
 * Retourne les magasins accessibles a l'utilisateur connecte.
 *
 * - SA             -> tous les magasins de la base
 * - Administrateur -> uniquement les magasins qui lui sont assignes
 */
export async function getAccessibleStores(
  orgId: string,
  userId: string,
  isSuperAdmin: boolean,
  activeOnly: boolean = true,
): Promise<StoreOption[]> {
  const statusFilter = activeOnly ? { status: 'ACTIVE' as const } : {};

  if (isSuperAdmin) {
    return prisma.store.findMany({
      where: { ...statusFilter, organization_id: orgId },
      select: { id: true, name: true, location: true, color: true, is_protected: true },
      orderBy: { name: 'asc' },
    });
  }

  const stores = await prisma.store.findMany({
    where: {
      ...statusFilter,
      organization_id: orgId,
      user_access: { some: { user_id: userId } },
    },
    select: { id: true, name: true, location: true, color: true, is_protected: true },
    orderBy: { name: 'asc' },
  });

  return stores;
}

// ---------------------------------------------------------------------------
// Politique de mot de passe
// ---------------------------------------------------------------------------

export type PasswordPolicyResult = { valid: true } | { valid: false; errors: string[] };

/**
 * Verifie qu'un mot de passe respecte la politique de securite de l'application.
 *
 * Regles :
 *   - 8 a 128 caracteres
 *   - Au moins une majuscule
 *   - Au moins une minuscule
 *   - Au moins un chiffre
 *   - Au moins un caractère spécial (ni lettre, ni chiffre, ni espace)
 */
export function verifyPasswordPolicy(password: string): PasswordPolicyResult {
  const errors: string[] = [];

  if (password.length < 8 || password.length > 128) {
    errors.push('Le mot de passe doit contenir entre 8 et 128 caracteres.');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins une majuscule.');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins une minuscule.');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins un chiffre.');
  }
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins un caractere special (ex: !@#$%).');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Changement de mot de passe
// ---------------------------------------------------------------------------

const BCRYPT_ROUNDS = 12;

/**
 * Change le mot de passe d'un utilisateur.
 *
 * @param userId          - UUID de l'utilisateur (depuis le JWT)
 * @param currentPassword - Mot de passe actuel (pour verification)
 * @param newPassword     - Nouveau mot de passe
 * @param ipAddress       - IP du client pour l'audit
 */
export async function changePassword(
  orgId: string,
  userId: string,
  currentPassword: string,
  newPassword: string,
  ipAddress?: string,
): Promise<void> {
  const utilisateur = await userRepository.findById(userId);
  if (!utilisateur) {
    throw new Error('Utilisateur introuvable.');
  }

  const motDePasseValide = await bcrypt.compare(currentPassword, utilisateur.pwd_hash);
  if (!motDePasseValide) {
    throw new Error('Le mot de passe actuel est incorrect.');
  }

  const policy = verifyPasswordPolicy(newPassword);
  if (!policy.valid) {
    throw new Error(policy.errors.join(' '));
  }

  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await userRepository.updatePassword(userId, hash);
  await userRepository.clearMustChangePassword(userId);
  await userRepository.setPasswordUpdatedAt(userId);

  try {
    await logAction({
      actorId:   userId,
      actorName: utilisateur.username,
      action:    AuditAction.PASSWORD_CHANGED,
      orgId,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Echec du log de changement de mot de passe :', err);
  }
}

// ---------------------------------------------------------------------------
// Reinitialisation de mot de passe par un admin
// ---------------------------------------------------------------------------

/**
 * Réinitialise le mot de passe d'un utilisateur (admin only).
 * Génère un mot de passe aléatoire, le hache, force must_change_password = true.
 * Retourne le mot de passe en clair (seule fois ou il est exposé).
 *
 * @param targetId   - UUID de l'utilisateur dont le mot de passe est réinitialisé
 * @param adminId   - UUID de l'administrateur qui effectue la réinitialisation
 * @param ipAddress - IP du client
 * @returns Le mot de passe genere en clair
 */
export async function resetPassword(
  orgId: string,
  targetId: string,
  adminId: string,
  ipAddress?: string,
): Promise<string> {
  const target = await userRepository.findById(targetId);
  if (!target) {
    throw new Error('Utilisateur cible introuvable.');
  }

  // Isolation multi-tenant : l'administrateur ne peut réinitialiser que les
  // comptes de sa propre organisation.
  const appartient = await userRepository.belongsToOrganization(targetId, orgId);
  if (!appartient) {
    throw new Error('Utilisateur cible introuvable.');
  }

  const admin = await userRepository.findById(adminId);
  if (!admin) {
    throw new Error('Administrateur introuvable.');
  }

  const adminRole = await prisma.role.findUnique({
    where: { id: admin.role_id },
    select: { name: true },
  });
  const targetRole = await prisma.role.findUnique({
    where: { id: target.role_id },
    select: { name: true },
  });

  // Règle absolue : un Administrateur ne peut jamais réinitialiser le mot de
  // passe du Super Administrateur.
  if (targetRole?.name === ROLE_SUPER_ADMIN) {
    throw new Error('Le compte Super Administrateur ne peut pas être réinitialisé de cette façon.');
  }

  // Règle de hiérarchie : un Admin ne peut pas réinitialiser le mot de passe
  // d'un autre Admin.
  if (adminRole?.name === ROLE_ADMIN && targetRole?.name === ROLE_ADMIN) {
    throw new Error("Un Administrateur ne peut pas réinitialiser le mot de passe d'un autre Administrateur.");
  }

  const adminName = admin.username;

  const plainPassword = generateSecurePassword();
  const hash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);

  await userRepository.updatePassword(targetId, hash);
  // Le mot de passe vient d'être réinitialisé par un admin : l'utilisateur
  // DOIT le changer à sa prochaine connexion (politique de sécurité).
  await userRepository.forceMustChangePassword(targetId);
  await userRepository.setPasswordUpdatedAt(targetId);

  try {
    await logAction({
      actorId:   adminId,
      actorName: adminName,
      action:    AuditAction.PASSWORD_RESET,
      orgId,
      ipAddress,
      metadata:  { target_user_id: targetId, target_username: target.username },
    });
  } catch (err) {
    console.error('[audit] Echec du log de réinitialisation de mot de passe :', err);
  }

  return plainPassword;
}

// ---------------------------------------------------------------------------
// Mot de passe oublié (self-service) — flux OTP
// ---------------------------------------------------------------------------

const OTP_TTL_MINUTES   = 10;
const RESET_TOKEN_TTL   = '5m';
const RESET_TOKEN_SCOPE = 'reset-password';

function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export type ForgotPasswordResult = {
  otp: string;
  otpHash: string;
  email: string;
} | null;

/**
 * Étape 1 du flux "mot de passe oublié".
 * Génère un OTP à 6 chiffres et son hash SHA-256.
 * Ne révèle pas si l'email existe (protection anti-énumération).
 *
 * @returns Les données pour construire le cookie JWT et l'email, ou null si email introuvable.
 */
export async function initiatePasswordReset(email: string): Promise<ForgotPasswordResult> {
  const normalizedEmail = email.toLowerCase().trim();
  const utilisateur = await userRepository.findByEmail(normalizedEmail);

  if (!utilisateur) {
    try {
      await logAction({
        actorId:   null,
        actorName: 'inconnu',
        action:    AuditAction.PASSWORD_RESET,
        orgId:     null,
        metadata:  { reason: 'forgot_password_email_introuvable', attempted_email: normalizedEmail },
      });
    } catch (err) {
      console.error('[audit] Échec du log de tentative forgot-password :', err);
    }
    return null;
  }

  const otp     = generateOtp();
  const otpHash = hashOtp(otp);

  return { otp, otpHash, email: utilisateur.email };
}

/**
 * Étape 2 du flux "mot de passe oublié".
 * Vérifie l'OTP fourni contre le hash stocké dans le cookie JWT.
 *
 * @returns Un resetToken (JWT scope reset-password, 5 min) utilisable à l'étape 3.
 * @throws  Si l'OTP est invalide.
 */
export function verifyResetOtp(email: string, otp: string, otpHash: string): string {
  if (hashOtp(otp) !== otpHash) {
    throw new Error('Code de vérification invalide.');
  }

  const resetToken = jwt.sign(
    { email, scope: RESET_TOKEN_SCOPE },
    getJwtSecret(),
    { expiresIn: RESET_TOKEN_TTL },
  );

  return resetToken;
}

/**
 * Étape 3 du flux "mot de passe oublié".
 * Finalise la réinitialisation avec le nouveau mot de passe.
 *
 * @throws Si le resetToken est invalide, expiré, ou la politique non respectée.
 */
export async function completePasswordReset(resetToken: string, newPassword: string): Promise<void> {
  let payload: { email: string; scope: string };
  try {
    payload = jwt.verify(resetToken, getJwtSecret()) as { email: string; scope: string };
  } catch {
    throw new Error('Token de réinitialisation invalide ou expiré.');
  }

  if (payload.scope !== RESET_TOKEN_SCOPE) {
    throw new Error('Token de réinitialisation invalide.');
  }

  const policy = verifyPasswordPolicy(newPassword);
  if (!policy.valid) {
    throw new Error(policy.errors.join(' '));
  }

  const normalizedEmail = payload.email.toLowerCase().trim();
  const utilisateur = await userRepository.findByEmail(normalizedEmail);
  if (!utilisateur) {
    throw new Error('Utilisateur introuvable.');
  }

  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await userRepository.updatePassword(utilisateur.id, hash);
  await userRepository.clearMustChangePassword(utilisateur.id);
  await userRepository.setPasswordUpdatedAt(utilisateur.id);

  try {
    await logAction({
      actorId:   utilisateur.id,
      actorName: utilisateur.username,
      action:    AuditAction.PASSWORD_CHANGED,
      orgId:     null,
      metadata:  { reason: 'forgot_password_otp' },
    });
  } catch (err) {
    console.error('[audit] Échec du log de réinitialisation de mot de passe :', err);
  }
}
