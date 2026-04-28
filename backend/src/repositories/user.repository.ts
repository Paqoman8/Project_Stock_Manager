import { prisma } from '../config/database';

// ---------------------------------------------------------------------------
// Types retournés par le repository — reflètent exactement la structure Prisma
// ---------------------------------------------------------------------------

/**
 * Représentation complète d'un utilisateur telle que stockée en base.
 * Le champ pwd_hash est inclus car le service d'auth en a besoin pour bcrypt.
 */
export type UserRecord = {
  id: string;
  username: string;
  email: string | null;
  pwd_hash: string;
  role_id: string;
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
    },
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
