import { Request, Response } from 'express';
import * as authService from '../services/auth.service';

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
    const resultat = await authService.login(username, password, storeId);

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
      const messagesMetier = ['Identifiants invalides', 'Accès à ce magasin non autorisé'];
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
export async function logout(req: Request, res: Response): Promise<void> {
  // Pour déconnecter l'utilisateur, on supprime le cookie du navigateur
  // en le réécrivant avec une date d'expiration dans le passé
  res.clearCookie(COOKIE_NAME);
  res.status(200).json({
    success: true,
    message: 'Déconnexion réussie.',
  });
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
