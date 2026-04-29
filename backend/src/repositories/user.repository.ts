import { prisma } from '../config/database';

// ---------------------------------------------------------------------------
// Types retournés par le repository — reflètent exactement la structure Prisma
// ---------------------------------------------------------------------------

/**
 * Représentation complète d'un utilisateur telle que stockée en base.
 * Le champ pwd_hash est inclus car le service d'auth en a besoin pour bcrypt.
 * Le champ is_active indique si le compte est activé ou désactivé (soft delete).
 */
export type UserRecord = {
  id: string;
  username: string;
  email: string | null;
  pwd_hash: string;
  role_id: string;
  is_active: boolean;
};

/**
 * Un accès magasin avec les informations du magasin incluses.
 * Utilisé pour présenter la liste des magasins accessibles à l'utilisateur.
 */
export type StoreAccess = {
  store_id: string;
  store: {
    id: string;
    name: string;
    location: string | null;
  };
};

/**
 * Représentation enrichie d'un utilisateur pour les listings admin.
 * Inclut le rôle et les accès magasins — exclut pwd_hash (jamais exposé).
 */
export type UserWithDetails = {
  id: string;
  username: string;
  email: string | null;
  role_id: string;
  is_active: boolean;
  role: {
    id: string;
    name: string;
  };
  store_access: {
    store: {
      id: string;
      name: string;
    };
  }[];
};

/**
 * Données nécessaires à la création d'un nouvel utilisateur.
 * pwd_hash doit déjà être haché par le service avant d'être passé ici.
 * store_ids liste les UUIDs des magasins auxquels l'utilisateur aura accès.
 */
export type CreateUserData = {
  username: string;
  email?: string;
  pwd_hash: string;
  role_id: string;
  store_ids: string[];
};

/**
 * Données pouvant être mises à jour sur un utilisateur existant.
 * Tous les champs sont optionnels — seuls les champs fournis seront mis à jour.
 * Si store_ids est fourni, les anciens accès sont remplacés intégralement.
 */
export type UpdateUserData = {
  username?: string;
  email?: string;
  pwd_hash?: string;
  role_id?: string;
  store_ids?: string[];
};

// ---------------------------------------------------------------------------
// Sélecteur réutilisable pour les requêtes retournant UserWithDetails
//
// Centraliser ce sélecteur évite de dupliquer la structure select dans chaque
// fonction qui doit retourner un utilisateur complet (create, update, reactivate…).
// ---------------------------------------------------------------------------

const SELECT_USER_WITH_DETAILS = {
  id: true,
  username: true,
  email: true,
  role_id: true,
  is_active: true,
  role: { select: { id: true, name: true } },
  store_access: { select: { store: { select: { id: true, name: true } } } },
} as const;

// ---------------------------------------------------------------------------
// Fonctions du repository — uniquement des opérations Prisma, aucune logique métier
// ---------------------------------------------------------------------------

/**
 * Recherche un utilisateur par son identifiant (username).
 * Retourne null si aucun utilisateur ne correspond.
 *
 * @param username - L'identifiant unique de l'utilisateur
 */
export async function findByUsername(username: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      email: true,
      pwd_hash: true,
      role_id: true,
      is_active: true,
    },
  });
}

/**
 * Recherche un utilisateur par son identifiant UUID.
 * Retourne null si non trouvé.
 *
 * @param id - L'UUID de l'utilisateur
 */
export async function findById(id: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      email: true,
      pwd_hash: true,
      role_id: true,
      is_active: true,
    },
  });
}

/**
 * Retourne la liste de tous les utilisateurs avec leur rôle et leurs accès magasins.
 * Les utilisateurs désactivés sont exclus par défaut.
 *
 * @param includeInactive - Si true, inclut les utilisateurs avec is_active = false
 *
 * Sécurité : pwd_hash n'est jamais sélectionné ici — cette fonction est destinée
 * aux listings administratifs, pas à l'authentification.
 */
export async function findAll(includeInactive = false): Promise<UserWithDetails[]> {
  return prisma.user.findMany({
    where: includeInactive ? undefined : { is_active: true },
    select: SELECT_USER_WITH_DETAILS,
    orderBy: { username: 'asc' },
  });
}

/**
 * Crée un nouvel utilisateur et ses accès magasins dans une transaction atomique.
 *
 * La transaction garantit que :
 *   - si la création du User échoue, aucun UserStoreAccess n'est créé
 *   - si la création d'un UserStoreAccess échoue, le User est annulé
 *
 * @param data - Données de l'utilisateur, dont pwd_hash déjà haché
 * @returns L'utilisateur créé avec ses détails (sans pwd_hash)
 */
export async function create(data: CreateUserData): Promise<UserWithDetails> {
  return prisma.$transaction(async (tx) => {
    // Création de l'utilisateur principal
    const nouvelUtilisateur = await tx.user.create({
      data: {
        username: data.username,
        email: data.email ?? null,
        pwd_hash: data.pwd_hash,
        role_id: data.role_id,
        is_active: true,
      },
    });

    // Création des accès magasins en une seule passe
    // createMany est plus performant qu'un create par itération
    if (data.store_ids.length > 0) {
      await tx.userStoreAccess.createMany({
        data: data.store_ids.map((storeId) => ({
          user_id: nouvelUtilisateur.id,
          store_id: storeId,
        })),
      });
    }

    // On relit l'utilisateur complet avec ses relations pour retourner
    // une réponse cohérente avec le type UserWithDetails
    return tx.user.findUniqueOrThrow({
      where: { id: nouvelUtilisateur.id },
      select: SELECT_USER_WITH_DETAILS,
    });
  });
}

/**
 * Met à jour les champs fournis d'un utilisateur existant.
 *
 * Si store_ids est fourni, les accès magasins actuels sont intégralement
 * remplacés (suppression + recréation) dans une transaction atomique.
 * Cette approche "replace all" évite les désynchronisations partielles.
 *
 * @param id   - UUID de l'utilisateur à modifier
 * @param data - Champs à mettre à jour (seuls les champs présents sont modifiés)
 * @returns L'utilisateur mis à jour avec ses détails (sans pwd_hash)
 */
export async function update(id: string, data: UpdateUserData): Promise<UserWithDetails> {
  return prisma.$transaction(async (tx) => {
    // Construction de l'objet de mise à jour en n'incluant que les champs fournis
    // pour ne pas écraser les champs absents avec undefined
    const champsAMettreAJour: Record<string, unknown> = {};
    if (data.username !== undefined) champsAMettreAJour.username = data.username;
    if (data.email !== undefined) champsAMettreAJour.email = data.email;
    if (data.pwd_hash !== undefined) champsAMettreAJour.pwd_hash = data.pwd_hash;
    if (data.role_id !== undefined) champsAMettreAJour.role_id = data.role_id;

    // On ne met à jour que si au moins un champ scalaire est fourni
    if (Object.keys(champsAMettreAJour).length > 0) {
      await tx.user.update({
        where: { id },
        data: champsAMettreAJour,
      });
    }

    // Remplacement intégral des accès magasins si store_ids est fourni
    if (data.store_ids !== undefined) {
      // Suppression de tous les accès existants pour cet utilisateur
      await tx.userStoreAccess.deleteMany({
        where: { user_id: id },
      });

      // Recréation des nouveaux accès
      if (data.store_ids.length > 0) {
        await tx.userStoreAccess.createMany({
          data: data.store_ids.map((storeId) => ({
            user_id: id,
            store_id: storeId,
          })),
        });
      }
    }

    // Relecture de l'utilisateur complet après toutes les modifications
    return tx.user.findUniqueOrThrow({
      where: { id },
      select: SELECT_USER_WITH_DETAILS,
    });
  });
}

/**
 * Désactive un utilisateur (soft delete) en passant is_active à false.
 * L'utilisateur reste en base pour la traçabilité des logs et transactions passées.
 * On ne supprime JAMAIS physiquement un utilisateur.
 *
 * @param id - UUID de l'utilisateur à désactiver
 */
export async function softDelete(id: string): Promise<void> {
  await prisma.user.update({
    where: { id },
    data: { is_active: false },
  });
}

/**
 * Réactive un utilisateur précédemment désactivé en passant is_active à true.
 *
 * Cette fonction ne contient aucune logique métier — la vérification que le compte
 * est bien inactif, que le requêteur a les droits, etc. est faite dans le service.
 * Le repository se contente de l'opération Prisma pure.
 *
 * @param id - UUID de l'utilisateur à réactiver
 * @returns L'utilisateur réactivé avec ses détails (sans pwd_hash)
 */
export async function reactivate(id: string): Promise<UserWithDetails> {
  return prisma.user.update({
    where: { id },
    data: { is_active: true },
    select: SELECT_USER_WITH_DETAILS,
  });
}

/**
 * Retourne la liste des magasins auxquels un utilisateur a accès,
 * avec les informations détaillées de chaque magasin.
 *
 * @param userId - L'UUID de l'utilisateur
 */
export async function findStoreAccessForUser(userId: string): Promise<StoreAccess[]> {
  return prisma.userStoreAccess.findMany({
    where: { user_id: userId },
    select: {
      store_id: true,
      store: {
        select: {
          id: true,
          name: true,
          location: true,
        },
      },
    },
  });
}

/**
 * Vérifie si un utilisateur possède un accès à un magasin donné.
 * Utilise une requête count pour éviter de ramener des données inutiles.
 *
 * @param userId  - L'UUID de l'utilisateur
 * @param storeId - L'UUID du magasin à vérifier
 */
export async function hasStoreAccess(userId: string, storeId: string): Promise<boolean> {
  // On utilise count plutôt que findUnique pour n'obtenir qu'un booléen sans données superflues
  const count = await prisma.userStoreAccess.count({
    where: {
      user_id: userId,
      store_id: storeId,
    },
  });
  return count > 0;
}
