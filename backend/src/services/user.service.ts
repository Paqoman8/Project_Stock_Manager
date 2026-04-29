import bcrypt from 'bcrypt';
import { prisma } from '../config/database';
import * as userRepository from '../repositories/user.repository';
import type { UserWithDetails } from '../repositories/user.repository';

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

// ---------------------------------------------------------------------------
// Types du service — contrat entre service et controller
// ---------------------------------------------------------------------------

/**
 * Données d'entrée pour la création d'un utilisateur.
 * Le password est en clair ici — le service se charge de le hacher.
 */
export type CreateUserInput = {
  username: string;
  email?: string;
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
export async function getAllUsers(includeInactive = true): Promise<UserWithDetails[]> {
  return userRepository.findAll(includeInactive);
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
  input: CreateUserInput,
  requesterRoleId: string,
): Promise<UserWithDetails> {
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
  const nomRoleRequeteur = await getNomRole(requesterRoleId);
  if (nomRoleRequeteur === ROLE_ADMIN && roleCible.name === ROLE_ADMIN) {
    throw new Error('Un Administrateur ne peut pas créer un autre Administrateur.');
  }

  // Étape 1 : Unicité du username
  const usernameExistant = await userRepository.findByUsername(input.username);
  if (usernameExistant) {
    throw new Error('Username déjà utilisé');
  }

  // Étape 2 : Unicité de l'email (seulement si fourni)
  if (input.email) {
    const emailExistant = await prisma.user.findUnique({
      where: { email: input.email },
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
      where: { id: { in: input.storeIds } },
      select: { id: true },
    });
    if (magasinsTrouves.length !== input.storeIds.length) {
      throw new Error('Magasin introuvable');
    }
  }

  // Étape 5 : Hachage du mot de passe
  const motDePasseHache = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  // Étape 6 : Création atomique via le repository
  return userRepository.create({
    username: input.username,
    email: input.email,
    pwd_hash: motDePasseHache,
    role_id: input.roleId,
    store_ids: input.storeIds,
  });
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
  id: string,
  input: UpdateUserInput,
  requesterRoleId: string,
): Promise<UserWithDetails> {
  // Étape 1 : Vérification que l'utilisateur existe, avec son rôle inclus.
  // On a besoin du rôle pour appliquer les règles de protection du Super Admin et
  // la règle de hiérarchie Admin → Admin.
  const utilisateurExistant = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  if (!utilisateurExistant) {
    throw new Error('Utilisateur introuvable');
  }

  // Règle de sécurité absolue 1 : on ne peut jamais changer le rôle du SA.
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

    // Règle de hiérarchie 5b : un Admin ne peut pas attribuer le rôle Administrateur.
    // On récupère le nom du rôle requêteur une seule fois, puis on l'utilise
    // pour toutes les vérifications de hiérarchie qui suivent.
    const nomRoleRequeteur = await getNomRole(requesterRoleId);
    if (nomRoleRequeteur === ROLE_ADMIN && roleVise.name === ROLE_ADMIN) {
      throw new Error('Un Administrateur ne peut pas attribuer le rôle Administrateur.');
    }
  }

  // Règle de hiérarchie 4 : un Admin ne peut pas modifier un autre Admin.
  // On vérifie le rôle requêteur et le rôle de la cible.
  // Note : si input.roleId était fourni, getNomRole a déjà été appelé dans le bloc
  // précédent — on refait l'appel ici car les blocs sont conditionnels indépendants.
  // Le coût est une requête Prisma supplémentaire dans le cas d'un Admin modifiant
  // un non-Admin sans changer le rôle — acceptable pour la clarté du code.
  if (utilisateurExistant.role.name === ROLE_ADMIN) {
    const nomRoleRequeteur = await getNomRole(requesterRoleId);
    if (nomRoleRequeteur === ROLE_ADMIN) {
      throw new Error('Un Administrateur ne peut pas modifier un autre Administrateur.');
    }
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
      throw new Error('Username déjà utilisé');
    }
  }

  // Étape 3 : Unicité de l'email (si fourni) — on exclut l'utilisateur en cours
  if (input.email !== undefined) {
    const conflitEmail = await prisma.user.findFirst({
      where: {
        email: input.email,
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
      where: { id: { in: input.storeIds } },
      select: { id: true },
    });
    if (magasinsTrouves.length !== input.storeIds.length) {
      throw new Error('Magasin introuvable');
    }
  }

  // Étape 6 : Hachage du mot de passe si un nouveau est fourni
  let motDePasseHache: string | undefined;
  if (input.password !== undefined) {
    motDePasseHache = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  }

  // Mise à jour via le repository — la transaction est gérée dedans
  return userRepository.update(id, {
    username: input.username,
    email: input.email,
    pwd_hash: motDePasseHache,
    role_id: input.roleId,
    store_ids: input.storeIds,
  });
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
export async function deactivateUser(id: string, requesterRoleId: string): Promise<void> {
  // Étape 1 : Vérification que l'utilisateur existe, avec son rôle inclus.
  const utilisateur = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  if (!utilisateur) {
    throw new Error('Utilisateur introuvable');
  }

  // Règle de sécurité absolue : le compte SA ne peut jamais être désactivé.
  if (utilisateur.role.name === ROLE_SUPER_ADMIN) {
    throw new Error('Le compte Super Administrateur ne peut pas être désactivé.');
  }

  // Règle de hiérarchie : un Admin ne peut pas désactiver un autre Admin.
  if (utilisateur.role.name === ROLE_ADMIN) {
    const nomRoleRequeteur = await getNomRole(requesterRoleId);
    if (nomRoleRequeteur === ROLE_ADMIN) {
      throw new Error('Un Administrateur ne peut pas désactiver un autre Administrateur.');
    }
  }

  // Soft delete — jamais de suppression physique
  await userRepository.softDelete(id);
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
  id: string,
  requesterRoleId: string,
): Promise<UserWithDetails> {
  // Étape 1 : Récupération de l'utilisateur cible avec son rôle inclus.
  // On a besoin du rôle pour les vérifications SA et Admin.
  const utilisateur = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  if (!utilisateur) {
    throw new Error('Utilisateur introuvable');
  }

  // Garde défensive : le compte SA ne doit jamais être manipulé par cette route.
  // En pratique le SA est toujours actif (règle absolue), mais on garde ce guard
  // pour signaler clairement qu'il est hors périmètre.
  if (utilisateur.role.name === ROLE_SUPER_ADMIN) {
    throw new Error('Le compte Super Administrateur ne peut pas être modifié de cette façon.');
  }

  // Règle de hiérarchie : un Admin ne peut pas réactiver un autre Admin.
  if (utilisateur.role.name === ROLE_ADMIN) {
    const nomRoleRequeteur = await getNomRole(requesterRoleId);
    if (nomRoleRequeteur === ROLE_ADMIN) {
      throw new Error('Un Administrateur ne peut pas réactiver un autre Administrateur.');
    }
  }

  // Vérification que le compte est bien inactif.
  // On retourne une erreur 400 (pas 403) car ce n'est pas une violation de permissions
  // mais un état incohérent — le client devrait savoir que le compte est déjà actif.
  if (utilisateur.is_active === true) {
    throw new Error('Ce compte est déjà actif.');
  }

  // Réactivation via le repository
  return userRepository.reactivate(id);
}
