import bcrypt from 'bcrypt';
import { AuditAction } from '@prisma/client';
import { prisma } from '../config/database';
import * as userRepository from '../repositories/user.repository';
import type { UserWithDetails } from '../repositories/user.repository';
import { logAction, resolveActorName, resolveStoreName } from './audit.service';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

// Nombre de rounds bcrypt pour le hachage des mots de passe.
// 12 rounds est le bon équilibre entre sécurité et performance (env. 300ms par hash).
const BCRYPT_ROUNDS = 12;

// Noms de rôles utilisés dans les règles métier — centralisés ici pour éviter
// les fautes de frappe dispersées dans le code.
const ROLE_SUPER_ADMIN = 'Super Administrateur';
const ROLE_ADMIN = 'Administrateur';
const ROLE_PLATFORM_MANAGER = 'Platform Manager';

// ---------------------------------------------------------------------------
// Règles de validation des données entrantes
// ---------------------------------------------------------------------------

// Format imposé pour les identifiants : "texte.texte"
// Lettres (a-z, A-Z), chiffres (0-9), exactement un point séparateur.
// Exemples valides : jean.dupont, alice.martin2, responsable.stock
const USERNAME_REGEX = /^[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/;

// Validation du format email côté backend (défense en profondeur).
// La validation Zod côté frontend est la première ligne ; celle-ci protège
// les appels directs à l'API.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Vérifie que le mot de passe respecte la politique de sécurité :
 *   - 8 à 128 caractères
 *   - Au moins une majuscule, une minuscule, un chiffre, un caractère spécial
 *
 * @param password - Mot de passe en clair à valider
 * @throws Error si le mot de passe ne respecte pas la politique
 */
function verifierPolitiqueMotDePasse(password: string): void {
  const valide =
    password.length >= 8 &&
    password.length <= 128 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^a-zA-Z0-9\s]/.test(password);

  if (!valide) {
    throw new Error('Le mot de passe ne respecte pas les critères de sécurité requis.');
  }
}

// ---------------------------------------------------------------------------
// Types du service — contrat entre service et controller
// ---------------------------------------------------------------------------

/**
 * Données d'entrée pour la création d'un utilisateur.
 * Le password est en clair ici — le service se charge de le hacher.
 */
export type CreateUserInput = {
  username: string;
  email: string;
  password: string;
  roleId: string;
  storeIds: string[];
};

/**
 * Données d'entrée pour la mise à jour d'un utilisateur.
 * Tous les champs sont optionnels — seuls ceux fournis sont modifiés.
 */
export type UpdateUserInput = {
  username?: string;
  email?: string;
  password?: string;
  roleId?: string;
  storeIds?: string[];
};

/**
 * Contexte du requêteur transmis par le controller depuis le JWT.
 * Remplace les anciens paramètres (requesterRoleId, requesterId) éparpillés.
 */
export type RequesterInfo = {
  id: string;
  roleId: string;
  storeId: string;
  ipAddress?: string;
};

// ---------------------------------------------------------------------------
// Fonctions utilitaires internes
// ---------------------------------------------------------------------------

/**
 * Récupère le nom du rôle d'un utilisateur (roleId → role.name).
 * Retourne null si le rôle n'existe plus en base.
 *
 * @param roleId - UUID du rôle
 */
async function getNomRole(roleId: string): Promise<string | null> {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { name: true },
  });
  return role?.name ?? null;
}

/**
 * Vérifie qu'un utilisateur cible appartient bien à l'organisation courante.
 * Levé une erreur métier "Utilisateur introuvable" si ce n'est pas le cas,
 * afin de ne pas révéler l'existence d'un compte dans une autre organisation.
 */
async function verifierAppartenanceOrganisation(userId: string, orgId: string): Promise<void> {
  const appartient = await userRepository.belongsToOrganization(userId, orgId);
  if (!appartient) {
    throw new Error('Utilisateur introuvable');
  }
}

// ---------------------------------------------------------------------------
// Fonctions du service — logique métier, validations, orchestration
// ---------------------------------------------------------------------------

/**
 * Retourne la liste de tous les utilisateurs avec leur rôle et leurs accès magasins.
 *
 * @param includeInactive - Si true, inclut les comptes désactivés (défaut : true)
 *   On passe true par défaut ici car SA et Admin doivent voir tous les comptes
 *   (actifs et inactifs) sans avoir à passer un paramètre explicite.
 * @returns Liste des utilisateurs enrichis, sans pwd_hash
 */
export async function getAllUsers(orgId: string, includeInactive = true): Promise<UserWithDetails[]> {
  return userRepository.findAll(orgId, includeInactive);
}

/**
 * Crée un nouvel utilisateur après validation complète des données.
 *
 * Validations effectuées dans l'ordre :
 *  1. Existence et récupération du rôle cible
 *  2. Règle absolue : personne ne peut créer un SA via l'API
 *  3. Défense en profondeur : unicité du SA (redondant mais explicite)
 *  4. Règle de hiérarchie : un Administrateur ne peut pas créer un autre Administrateur
 *  5. Unicité du username
 *  6. Unicité de l'email (si fourni)
 *  7. Existence de chaque magasin en base
 *  8. Hachage du mot de passe (bcrypt 12 rounds)
 *  9. Création atomique (user + accès magasins dans une transaction)
 *
 * @param input           - Données de l'utilisateur à créer
 * @param requesterRoleId - roleId du compte qui effectue la requête (depuis JWT)
 * @returns L'utilisateur créé sans pwd_hash
 * @throws Error avec message métier si une validation échoue
 */
export async function createUser(
  orgId: string,
  input: CreateUserInput,
  requester: RequesterInfo,
): Promise<UserWithDetails> {
  // Validation du format de l'identifiant : "texte.texte" obligatoire
  if (!USERNAME_REGEX.test(input.username)) {
    throw new Error("Format d'identifiant invalide. Attendu : prenom.nom");
  }

  // Validation du format de l'email si fourni
  if (input.email && !EMAIL_REGEX.test(input.email)) {
    throw new Error("Format d'adresse email invalide.");
  }

  // Normalisation de l'email en minuscules sans espaces —
  // garantit que les recherches ultérieures (login, forgot-password) matchent
  const emailLower = input.email.toLowerCase().trim();

  // Validation de la politique de mot de passe
  verifierPolitiqueMotDePasse(input.password);

  // Étape 0a : Récupération du rôle cible pour valider son existence ET son nom.
  // Une seule requête qui sert à la fois à vérifier l'existence du rôle
  // et à appliquer les règles de sécurité.
  const roleCible = await prisma.role.findUnique({
    where: { id: input.roleId },
    select: { id: true, name: true },
  });

  if (!roleCible) {
    throw new Error('Rôle introuvable');
  }

  // Règle de sécurité absolue 1 : personne ne peut créer un utilisateur avec le rôle SA,
  // même en passant directement par l'API. Le SA est exclusivement créé par le seed.
  if (roleCible.name === ROLE_SUPER_ADMIN) {
    throw new Error("Impossible d'attribuer le rôle Super Administrateur à un nouvel utilisateur.");
  }

  // Règle de sécurité absolue : le rôle Platform Manager est exclusif au compte
  // plateforme créé par le seed — personne ne doit pouvoir l'attribuer via l'API,
  // ni même savoir qu'il existe. On répond "Rôle introuvable" (même message que
  // pour un roleId inexistant) pour ne rien révéler sur l'existence de ce rôle.
  if (roleCible.name === ROLE_PLATFORM_MANAGER) {
    throw new Error('Rôle introuvable');
  }

  // Étape 0b : Défense en profondeur — vérifier qu'aucun SA n'existe déjà.
  // Ce check est redondant avec le précédent mais protège si la logique évolue.
  const superAdminExistant = await prisma.user.findFirst({
    where: { role: { name: ROLE_SUPER_ADMIN } },
    select: { id: true },
  });
  if (superAdminExistant && roleCible.name === ROLE_SUPER_ADMIN) {
    throw new Error('Un Super Administrateur existe déjà dans le système.');
  }

  // Règle de hiérarchie : un Administrateur ne peut pas créer un autre Administrateur.
  // On récupère le nom du rôle requêteur pour appliquer cette règle.
  // Si le roleId requêteur est invalide (cas impossible en prod, JWT vérifié),
  // on retourne null et on ignore la vérification — le token JWT garantit la cohérence.
  const nomRoleRequeteur = await getNomRole(requester.roleId);
  if (nomRoleRequeteur === ROLE_ADMIN && roleCible.name === ROLE_ADMIN) {
    throw new Error('Un Administrateur ne peut pas créer un autre Administrateur.');
  }

  // Étape 1 : Unicité du username
  const usernameExistant = await userRepository.findByUsername(input.username);
  if (usernameExistant) {
    throw new Error('Identifiant déjà utilisé');
  }

  // Étape 2 : Unicité de l'email (seulement si fourni)
  if (input.email) {
    const emailExistant = await prisma.user.findUnique({
      where: { email: emailLower },
      select: { id: true },
    });
    if (emailExistant) {
      throw new Error('Email déjà utilisé');
    }
  }

  // Étape 4 : Vérification que tous les magasins existent en base.
  // On fait une seule requête avec findMany et on compare les longueurs.
  if (input.storeIds.length > 0) {
    const magasinsTrouves = await prisma.store.findMany({
      where: { id: { in: input.storeIds }, organization_id: orgId },
      select: { id: true },
    });
    if (magasinsTrouves.length !== input.storeIds.length) {
      throw new Error('Magasin introuvable');
    }
  }

  // Étape 5 : Hachage du mot de passe
  const motDePasseHache = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  // Étape 6 : Création atomique via le repository
    const nouvelUtilisateur = await userRepository.create({
      username: input.username,
      email: emailLower,
      pwd_hash: motDePasseHache,
      role_id: input.roleId,
      store_ids: input.storeIds,
    });

  // Audit — non-bloquant
  // On résout les noms de magasins pour la dénormalisation (jamais les UUIDs dans les logs)
  const [actorName, storeName, magasinsCreation] = await Promise.all([
    resolveActorName(requester.id),
    resolveStoreName(requester.storeId),
    input.storeIds.length > 0
      ? prisma.store.findMany({ where: { id: { in: input.storeIds } }, select: { name: true } })
      : Promise.resolve([]),
  ]);
  await logAction({
    actorId:    requester.id,
    actorName,
    action:     AuditAction.USER_CREATED,
    targetType: 'USER',
    targetId:   nouvelUtilisateur.id,
    targetName: nouvelUtilisateur.username,
    orgId,
    storeId:    requester.storeId,
    storeName,
    ipAddress:  requester.ipAddress,
    metadata: {
      role:    roleCible.name,
      magasins: magasinsCreation.map((s) => s.name),
    },
  });

  return nouvelUtilisateur;
}

/**
 * Met à jour un utilisateur existant après validation des données fournies.
 *
 * Validations effectuées :
 *  1. Existence de l'utilisateur cible avec son rôle
 *  2. Règle absolue : on ne peut pas changer le rôle du SA
 *  3. Règle absolue : on ne peut pas attribuer le rôle SA à quelqu'un
 *  4. Règle de hiérarchie : un Admin ne peut pas modifier un autre Admin
 *  5. Règle de hiérarchie : un Admin ne peut pas attribuer le rôle Admin
 *  6. Unicité du nouveau username (en excluant l'utilisateur lui-même)
 *  7. Unicité du nouvel email (en excluant l'utilisateur lui-même)
 *  8. Existence du rôle si fourni
 *  9. Existence de chaque magasin si storeIds est fourni
 * 10. Hachage du mot de passe si fourni
 *
 * @param id              - UUID de l'utilisateur à modifier
 * @param input           - Données à mettre à jour
 * @param requesterRoleId - roleId du compte qui effectue la requête (depuis JWT)
 * @returns L'utilisateur mis à jour sans pwd_hash
 * @throws Error avec message métier si une validation échoue
 */
export async function updateUser(
  orgId: string,
  id: string,
  input: UpdateUserInput,
  requester: RequesterInfo,
): Promise<UserWithDetails> {
  // Étape 1 : Vérification que l'utilisateur existe, avec son rôle inclus.
  // On a besoin du rôle pour appliquer les règles de protection du Super Admin et
  // la règle de hiérarchie Admin → Admin.
  const utilisateurExistant = await prisma.user.findUnique({
    where: { id },
    include: {
      role: true,
      store_access: { include: { store: { select: { name: true } } } },
    },
  });
  if (!utilisateurExistant) {
    throw new Error('Utilisateur introuvable');
  }

  // Isolation multi-tenant : l'utilisateur cible doit appartenir à l'organisation
  // courante. Cette vérification est faite avant toute règle métier.
  await verifierAppartenanceOrganisation(id, orgId);

  // Règle de sécurité absolue : seul le SA peut modifier son propre compte.
  // Aucun autre utilisateur, y compris un Administrateur, ne peut toucher
  // au compte Super Administrateur — ni le username, ni l'email, ni le mot
  // de passe, ni quoi que ce soit d'autre.
  if (utilisateurExistant.role.name === ROLE_SUPER_ADMIN && requester.id !== id) {
    throw new Error('Le compte Super Administrateur ne peut pas être modifié de cette façon.');
  }

  // Règle de sécurité absolue : on ne peut jamais changer le rôle du SA,
  // même si c'est le SA lui-même qui en fait la demande.
  if (utilisateurExistant.role.name === ROLE_SUPER_ADMIN && input.roleId !== undefined) {
    throw new Error('Impossible de modifier le rôle du Super Administrateur.');
  }

  // Règle de sécurité absolue 2 : on ne peut pas attribuer le rôle SA à quelqu'un.
  // Cette requête vérifie aussi que le rôle fourni existe en base.
  if (input.roleId !== undefined) {
    const roleVise = await prisma.role.findUnique({
      where: { id: input.roleId },
      select: { name: true },
    });
    if (!roleVise) {
      throw new Error('Rôle introuvable');
    }
    if (roleVise.name === ROLE_SUPER_ADMIN) {
      throw new Error("Impossible d'attribuer le rôle Super Administrateur.");
    }

    // Même règle que createUser : le rôle Platform Manager ne doit jamais être
    // attribuable, ni révélé par le message d'erreur.
    if (roleVise.name === ROLE_PLATFORM_MANAGER) {
      throw new Error('Rôle introuvable');
    }

    // Règle de hiérarchie 5b : un Admin ne peut pas attribuer le rôle Administrateur.
    // On récupère le nom du rôle requêteur une seule fois, puis on l'utilise
    // pour toutes les vérifications de hiérarchie qui suivent.
    const nomRoleRequeteur = await getNomRole(requester.roleId);
    if (nomRoleRequeteur === ROLE_ADMIN && roleVise.name === ROLE_ADMIN) {
      throw new Error('Un Administrateur ne peut pas attribuer le rôle Administrateur.');
    }
  }

  // Règle de hiérarchie 4 : un Admin ne peut pas modifier un autre Admin,
  // MAIS il peut modifier ses propres informations (username, email, password).
  if (utilisateurExistant.role.name === ROLE_ADMIN) {
    const nomRoleRequeteur = await getNomRole(requester.roleId);
    if (nomRoleRequeteur === ROLE_ADMIN) {
      const modifieSonPropreCompte = id === requester.id;

      if (!modifieSonPropreCompte) {
        // Un Admin ne peut pas toucher au compte d'un autre Admin.
        throw new Error('Un Administrateur ne peut pas modifier un autre Administrateur.');
      }

      // Auto-édition : l'Admin peut changer ses infos personnelles,
      // mais PAS son propre rôle — le changement de rôle est réservé au SA.
      if (input.roleId !== undefined) {
        throw new Error('Un Administrateur ne peut pas modifier son propre rôle.');
      }
    }
  }

  // Validation du format de l'identifiant si fourni
  if (input.username !== undefined && !USERNAME_REGEX.test(input.username)) {
    throw new Error("Format d'identifiant invalide. Attendu : prenom.nom");
  }

  // Validation du format de l'email si fourni
  if (input.email !== undefined && !EMAIL_REGEX.test(input.email)) {
    throw new Error("Format d'adresse email invalide.");
  }

  // Normalisation de l'email en minuscules sans espaces
  const emailLowerUpdate = input.email !== undefined
    ? input.email.toLowerCase().trim()
    : undefined;

  // Validation de la politique de mot de passe si fourni
  if (input.password !== undefined) {
    verifierPolitiqueMotDePasse(input.password);
  }

  // Étape 2 : Unicité du username (si fourni) — on exclut l'utilisateur en cours
  if (input.username !== undefined) {
    const conflitUsername = await prisma.user.findFirst({
      where: {
        username: input.username,
        NOT: { id },
      },
      select: { id: true },
    });
    if (conflitUsername) {
      throw new Error('Identifiant déjà utilisé');
    }
  }

  // Étape 3 : Unicité de l'email (si fourni) — on exclut l'utilisateur en cours
  if (emailLowerUpdate !== undefined) {
    const conflitEmail = await prisma.user.findFirst({
      where: {
        email: emailLowerUpdate,
        NOT: { id },
      },
      select: { id: true },
    });
    if (conflitEmail) {
      throw new Error('Email déjà utilisé');
    }
  }

  // Étape 5 : Vérification de l'existence de tous les magasins si fournis
  if (input.storeIds !== undefined && input.storeIds.length > 0) {
    const magasinsTrouves = await prisma.store.findMany({
      where: { id: { in: input.storeIds }, organization_id: orgId },
      select: { id: true },
    });
    if (magasinsTrouves.length !== input.storeIds.length) {
      throw new Error('Magasin introuvable');
    }
  }

  // Étape 5b : Si l'utilisateur cible est Super Administrateur, les stores protégés
  // de SON organisation ne peuvent pas lui être retirés — le SA doit toujours
  // avoir accès à son Hub Central. Scope obligatoire par organization_id : sans
  // lui, la requête récupère les Hub Centraux de TOUTES les organisations et la
  // condition ne peut plus jamais être satisfaite (le SA n'a jamais accès aux
  // stores protégés d'une autre organisation).
  if (input.storeIds !== undefined && utilisateurExistant.role.name === ROLE_SUPER_ADMIN) {
    const storesProtegés = await prisma.store.findMany({
      where: { is_protected: true, organization_id: orgId },
      select: { id: true },
    });
    const storeIdsSet = new Set(input.storeIds);
    const storeProtégéManquant = storesProtegés.some((s) => !storeIdsSet.has(s.id));
    if (storeProtégéManquant) {
      throw new Error('SA_PROTECTED_STORE_REQUIRED');
    }
  }

  // Étape 6 : Hachage du mot de passe si un nouveau est fourni.
  // On met à jour password_updated_at pour garder une trace cohérente.
  let motDePasseHache: string | undefined;
  let passwordUpdatedAt: Date | undefined;
  if (input.password !== undefined) {
    motDePasseHache = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    passwordUpdatedAt = new Date();
  }

  // Mise à jour via le repository — la transaction est gérée dedans
  const utilisateurMisAJour = await userRepository.update(id, {
    username: input.username,
    email: emailLowerUpdate,
    pwd_hash: motDePasseHache,
    role_id: input.roleId,
    store_ids: input.storeIds,
    password_updated_at: passwordUpdatedAt,
  });

  // Audit — construction du diff avant/après (noms lisibles, jamais d'UUIDs ni de hash)
  const modifications: Record<string, unknown> = {};

  if (input.username !== undefined && input.username !== utilisateurExistant.username) {
    modifications.identifiant = { avant: utilisateurExistant.username, apres: input.username };
  }
  if (emailLowerUpdate !== undefined && emailLowerUpdate !== (utilisateurExistant.email ?? '')) {
    modifications.email = { avant: utilisateurExistant.email ?? null, apres: emailLowerUpdate };
  }
  if (input.password !== undefined) {
    modifications.mot_de_passe = { modifie: true };
  }
  if (input.roleId !== undefined && input.roleId !== utilisateurExistant.role_id) {
    const nouveauRole = await prisma.role.findUnique({
      where: { id: input.roleId },
      select: { name: true },
    });
    modifications.role = {
      avant: utilisateurExistant.role.name,
      apres: nouveauRole?.name ?? input.roleId,
    };
  }
  if (input.storeIds !== undefined) {
    const nomsAvant = utilisateurExistant.store_access.map((sa) => sa.store.name).sort();
    const magasinsApres = await prisma.store.findMany({
      where: { id: { in: input.storeIds } },
      select: { name: true },
    });
    const nomsApres = magasinsApres.map((s) => s.name).sort();
    if (JSON.stringify(nomsAvant) !== JSON.stringify(nomsApres)) {
      modifications.magasins = { avant: nomsAvant, apres: nomsApres };
    }
  }

  // Audit — non-bloquant
  const [actorName, storeName] = await Promise.all([
    resolveActorName(requester.id),
    resolveStoreName(requester.storeId),
  ]);
  await logAction({
    actorId:    requester.id,
    actorName,
    action:     AuditAction.USER_UPDATED,
    targetType: 'USER',
    targetId:   utilisateurExistant.id,
    targetName: utilisateurExistant.username,
    orgId,
    storeId:    requester.storeId,
    storeName,
    ipAddress:  requester.ipAddress,
    metadata:   Object.keys(modifications).length > 0
      ? { modifications } as import('@prisma/client').Prisma.InputJsonValue
      : undefined,
  });

  return utilisateurMisAJour;
}

/**
 * Désactive un utilisateur (soft delete — is_active passe à false).
 *
 * Règles appliquées dans l'ordre :
 *  1. Règle absolue : le SA ne peut jamais être désactivé
 *  2. Règle de hiérarchie : un Admin ne peut pas désactiver un autre Admin
 *
 * @param id              - UUID de l'utilisateur à désactiver
 * @param requesterRoleId - roleId du compte qui effectue la requête (depuis JWT)
 * @throws Error avec message métier si l'utilisateur est introuvable ou si
 *         une règle de sécurité est enfreinte
 */
export async function deactivateUser(
  orgId: string,
  id: string,
  requester: RequesterInfo,
  reason?: string,
): Promise<void> {
  // Étape 1 : Vérification que l'utilisateur existe, avec son rôle inclus.
  const utilisateur = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  if (!utilisateur) {
    throw new Error('Utilisateur introuvable');
  }

  // Isolation multi-tenant : l'utilisateur cible doit appartenir à l'organisation courante.
  await verifierAppartenanceOrganisation(id, orgId);

  // Règle de sécurité absolue : le compte SA ne peut jamais être désactivé.
  if (utilisateur.role.name === ROLE_SUPER_ADMIN) {
    throw new Error('Le compte Super Administrateur ne peut pas être désactivé.');
  }

  // Règle de hiérarchie : un Admin ne peut pas désactiver un autre Admin.
  if (utilisateur.role.name === ROLE_ADMIN) {
    const nomRoleRequeteur = await getNomRole(requester.roleId);
    if (nomRoleRequeteur === ROLE_ADMIN) {
      throw new Error('Un Administrateur ne peut pas désactiver un autre Administrateur.');
    }
  }

  // Soft delete — jamais de suppression physique
  await userRepository.softDelete(id);

  // Audit — non-bloquant
  const [actorName, storeName] = await Promise.all([
    resolveActorName(requester.id),
    resolveStoreName(requester.storeId),
  ]);
  await logAction({
    actorId:    requester.id,
    actorName,
    action:     AuditAction.USER_DEACTIVATED,
    targetType: 'USER',
    targetId:   utilisateur.id,
    targetName: utilisateur.username,
    orgId,
    storeId:    requester.storeId,
    storeName,
    ipAddress:  requester.ipAddress,
    metadata: reason ? { reason } : undefined,
  });
}

/**
 * Réactive un compte utilisateur précédemment désactivé.
 *
 * Règles appliquées dans l'ordre :
 *  1. Existence de l'utilisateur cible
 *  2. Garde défensive : le SA ne peut pas être modifié de cette façon
 *  3. Règle de hiérarchie : un Admin ne peut pas réactiver un autre Admin
 *  4. Vérification que le compte est bien inactif (évite une mise à jour inutile)
 *
 * @param id              - UUID de l'utilisateur à réactiver
 * @param requesterRoleId - roleId du compte qui effectue la requête (depuis JWT)
 * @returns L'utilisateur réactivé avec ses détails (sans pwd_hash)
 * @throws Error avec message métier si une règle est enfreinte
 */
export async function reactivateUser(
  orgId: string,
  id: string,
  requester: RequesterInfo,
): Promise<UserWithDetails> {
  // Étape 1 : Récupération de l'utilisateur cible avec son rôle inclus.
  const utilisateur = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  if (!utilisateur) {
    throw new Error('Utilisateur introuvable');
  }

  // Isolation multi-tenant : l'utilisateur cible doit appartenir à l'organisation courante.
  await verifierAppartenanceOrganisation(id, orgId);

  // Garde défensive : le compte SA ne doit jamais être manipulé par cette route.
  if (utilisateur.role.name === ROLE_SUPER_ADMIN) {
    throw new Error('Le compte Super Administrateur ne peut pas être modifié de cette façon.');
  }

  // Règle de hiérarchie : un Admin ne peut pas réactiver un autre Admin.
  if (utilisateur.role.name === ROLE_ADMIN) {
    const nomRoleRequeteur = await getNomRole(requester.roleId);
    if (nomRoleRequeteur === ROLE_ADMIN) {
      throw new Error('Un Administrateur ne peut pas réactiver un autre Administrateur.');
    }
  }

  // Vérification que le compte est bien inactif.
  if (utilisateur.is_active === true) {
    throw new Error('Ce compte est déjà actif.');
  }

  // Réactivation via le repository
  const utilisateurReactive = await userRepository.reactivate(id);

  // Audit — non-bloquant
  const [actorName, storeName] = await Promise.all([
    resolveActorName(requester.id),
    resolveStoreName(requester.storeId),
  ]);
  await logAction({
    actorId:    requester.id,
    actorName,
    action:     AuditAction.USER_REACTIVATED,
    targetType: 'USER',
    targetId:   utilisateur.id,
    targetName: utilisateur.username,
    orgId,
    storeId:    requester.storeId,
    storeName,
    ipAddress:  requester.ipAddress,
  });

  return utilisateurReactive;
}
