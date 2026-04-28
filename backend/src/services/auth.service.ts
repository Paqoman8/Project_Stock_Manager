import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import * as userRepository from '../repositories/user.repository';

// ---------------------------------------------------------------------------
// Types exposés par le service — contrat entre service et controller
// ---------------------------------------------------------------------------

/**
 * Résultat retourné par login() au controller.
 * Le controller pose ensuite le cookie et renvoie la réponse HTTP.
 */
export type LoginResult = {
  token: string;
  user: {
    id: string;
    username: string;
    email: string | null;
    roleId: string;
    storeId: string;
  };
};

/**
 * Un magasin tel qu'il est présenté à la liste publique de sélection.
 */
export type StoreOption = {
  id: string;
  name: string;
  location: string | null;
};

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

// Durée de validité du token : 8h = une journée de travail
const TOKEN_EXPIRATION = '8h';

// ---------------------------------------------------------------------------
// Fonctions du service
// ---------------------------------------------------------------------------

/**
 * Authentifie un utilisateur et génère un token JWT portant le storeId choisi.
 *
 * Logique :
 *  1. Cherche l'utilisateur par username — message d'erreur générique si absent
 *     (on ne révèle pas si le username existe ou non, anti-énumération)
 *  2. Vérifie le mot de passe via bcrypt
 *  3. Vérifie que l'utilisateur a bien accès au magasin demandé
 *  4. Signe le JWT avec { userId, email, roleId, storeId }
 *  5. Crée une entrée SessionLog en base (non-bloquant : échec ignoré)
 *  6. Retourne le token et les infos publiques de l'utilisateur
 *
 * @param username - Identifiant saisi dans le formulaire
 * @param password - Mot de passe en clair saisi dans le formulaire
 * @param storeId  - UUID du magasin sélectionné dans le formulaire
 * @throws Error avec un message métier si l'authentification échoue
 */
export async function login(
  username: string,
  password: string,
  storeId: string,
): Promise<LoginResult> {
  // Étape 1 : Recherche de l'utilisateur
  const utilisateur = await userRepository.findByUsername(username);

  // Message identique pour "utilisateur introuvable" et "mauvais mot de passe"
  // afin de ne pas permettre l'énumération des comptes existants
  if (!utilisateur) {
    throw new Error('Identifiants invalides');
  }

  // Étape 2 : Vérification du mot de passe
  const motDePasseValide = await bcrypt.compare(password, utilisateur.pwd_hash);
  if (!motDePasseValide) {
    throw new Error('Identifiants invalides');
  }

  // Étape 3 : Vérification de l'accès au magasin demandé
  const accesAutorise = await userRepository.hasStoreAccess(utilisateur.id, storeId);
  if (!accesAutorise) {
    throw new Error('Accès à ce magasin non autorisé');
  }

  // Étape 4 : Génération du JWT
  // Le payload contient tout ce dont les middlewares auront besoin
  // pour autoriser les actions sans aller chercher la base à chaque requête
  const secret = process.env.JWT_SECRET as string;
  const tokenPayload = {
    userId: utilisateur.id,
    email: utilisateur.email,
    roleId: utilisateur.role_id,
    storeId,
  };

  const token = jwt.sign(tokenPayload, secret, {
    expiresIn: TOKEN_EXPIRATION,
  });

  // Étape 5 : Création du SessionLog — non-bloquant
  // Si l'écriture en base échoue (base surchargée, network, etc.),
  // on ne veut pas faire échouer la connexion de l'utilisateur pour autant.
  try {
    await prisma.sessionLog.create({
      data: {
        user_id: utilisateur.id,
        store_id: storeId,
      },
    });
  } catch (erreurSessionLog) {
    // On logue côté serveur pour ne pas perdre l'information,
    // mais on ne propage pas l'erreur au client
    console.error('Avertissement : impossible de créer le SessionLog :', erreurSessionLog);
  }

  // Étape 6 : Retour du résultat au controller
  return {
    token,
    user: {
      id: utilisateur.id,
      username: utilisateur.username,
      email: utilisateur.email,
      roleId: utilisateur.role_id,
      storeId,
    },
  };
}

/**
 * Retourne tous les magasins disponibles dans la base.
 * Utilisé par l'endpoint public GET /api/auth/stores pour alimenter
 * le sélecteur de magasin dans le formulaire de connexion.
 */
export async function getAvailableStores(): Promise<StoreOption[]> {
  return prisma.store.findMany({
    select: {
      id: true,
      name: true,
      location: true,
    },
    orderBy: { name: 'asc' },
  });
}
