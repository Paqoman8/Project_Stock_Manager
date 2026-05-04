# Politique de Sécurité

## Versions supportées

| Version | Supportée |
|---------|-----------|
| 0.x (actuelle) | ✅ |

## Signaler une vulnérabilité

**Ne pas signaler de vulnérabilités de sécurité via les issues publiques.**

Pour signaler une vulnérabilité, contacter directement les responsables du projet par email avec les informations suivantes :

- Description de la vulnérabilité
- Étapes pour la reproduire
- Impact potentiel
- Suggestion de correction si disponible

Vous recevrez une réponse dans les 48 heures. Si la vulnérabilité est confirmée, un correctif sera développé et déployé avant toute divulgation publique.

## Processus de traitement

1. **Réception** — accusé de réception sous 48h
2. **Triage** — confirmation et évaluation de la sévérité
3. **Correction** — développement et test du correctif
4. **Déploiement** — mise à jour en production
5. **Divulgation** — communication après un délai raisonnable permettant la mise à jour

## Mesures de sécurité en place

### Authentification
- Mots de passe hashés avec **bcrypt** (12 rounds)
- JWT stocké dans un cookie **httpOnly** (inaccessible par JavaScript)
- Cookie configuré `sameSite: strict` (protection CSRF)
- Cookie `secure: true` en production (HTTPS uniquement)
- Expiration automatique du token après 8 heures

### Protection contre les attaques
- **Rate limiting** sur `/api/auth/login` : 10 tentatives maximum par fenêtre de 15 minutes
- **CORS** strict avec whitelist d'origines autorisées
- Validation Zod sur toutes les entrées des controllers

### Contrôle d'accès
- RBAC (Role-Based Access Control) avec 5 niveaux hiérarchiques
- Vérification des permissions côté serveur à chaque requête
- Un Admin ne peut pas accéder aux données d'un établissement auquel il n'est pas rattaché

### Audit et traçabilité
- Journal d'audit immuable pour toutes les actions sensibles
- Adresse IP enregistrée sur chaque action
- Noms d'acteurs et de cibles dénormalisés (résistants aux renommages)

## Variables d'environnement sensibles

Ne jamais commiter les fichiers `.env`. Les variables suivantes sont critiques :

| Variable | Exigences |
|----------|-----------|
| `JWT_SECRET` | Minimum 32 caractères aléatoires (`openssl rand -hex 32`) |
| `DATABASE_URL` | Credentials de production distincts du développement |
| `NODE_ENV` | Doit être `production` en production (active `secure` sur le cookie) |
