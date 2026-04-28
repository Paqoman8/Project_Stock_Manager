import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';

// Durée de validité du token : 8 heures (durée d'une journée de travail)
const TOKEN_EXPIRATION = '8h';

// Nom du cookie qui stockera le token JWT côté navigateur
const COOKIE_NAME = 'auth_token';

export async function login(req: Request, res: Response): Promise<void> {
  // On extrait les données envoyées par le formulaire de connexion
  const { username, password } = req.body;

  // Validation basique : s'assurer que les deux champs sont présents
  if (!username || !password) {
    res.status(400).json({
      success: false,
      message: 'L\'identifiant et le mot de passe sont obligatoires.',
    });
    return;
  }

  try {
    // Étape 1 : Chercher l'utilisateur dans la base de données par son identifiant
    const utilisateurTrouve = await prisma.user.findUnique({
      where: { username: username },
      include: { role: true },
    });

    // Si aucun utilisateur n'est trouvé avec cet email, on retourne une erreur
    // Note : le message d'erreur est volontairement vague pour ne pas
    // indiquer à un attaquant si l'email existe ou non dans la base
    if (!utilisateurTrouve) {
      res.status(401).json({
        success: false,
        message: 'Identifiant ou mot de passe incorrect.',
      });
      return;
    }

    // Étape 2 : Comparer le mot de passe fourni avec le hash stocké en base
    const motDePasseValide = await bcrypt.compare(
      password,
      utilisateurTrouve.pwd_hash
    );

    if (!motDePasseValide) {
      res.status(401).json({
        success: false,
        message: 'Identifiant ou mot de passe incorrect.',
      });
      return;
    }

    // Étape 3 : Le mot de passe est correct. On crée le token JWT.
    // Ce token contient les informations essentielles de l'utilisateur
    // et sera vérifié à chaque requête protégée.
    const secret = process.env.JWT_SECRET as string;
    const tokenPayload = {
      userId: utilisateurTrouve.id,
      email: utilisateurTrouve.email,
      roleId: utilisateurTrouve.role_id,
    };

    const token = jwt.sign(tokenPayload, secret, {
      expiresIn: TOKEN_EXPIRATION,
    });

    // Étape 4 : On envoie le token dans un cookie httpOnly.
    // httpOnly = le cookie ne peut PAS être lu par le JavaScript côté navigateur
    // (protection contre les attaques XSS)
    // secure = le cookie ne sera envoyé que via HTTPS (désactivé en local pour le développement)
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000, // 8 heures en millisecondes
    });

    // On retourne les informations publiques de l'utilisateur (sans le hash du mot de passe)
    res.status(200).json({
      success: true,
      message: 'Connexion réussie.',
      user: {
        id: utilisateurTrouve.id,
        email: utilisateurTrouve.email,
        role: utilisateurTrouve.role.name,
      },
    });
  } catch (error) {
    console.error('Erreur lors de la connexion :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue. Veuillez réessayer.',
    });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  // Pour déconnecter l'utilisateur, on supprime le cookie du navigateur
  // en le réécrivant avec une date d'expiration dans le passé
  res.clearCookie(COOKIE_NAME);
  res.status(200).json({
    success: true,
    message: 'Déconnexion réussie.',
  });
}
