# Guide d'Installation — Stock Manager

Ce guide décrit comment installer et démarrer Stock Manager en environnement de développement local.

---

## Prérequis

| Outil | Version minimale | Usage |
|-------|-----------------|-------|
| Node.js | 20.x LTS | Runtime backend et frontend |
| npm | 10.x | Gestionnaire de paquets |
| Docker + Docker Compose | Récent | PostgreSQL 16 |
| Git | Récent | Clonage du dépôt |

Vérifier les versions installées :

```bash
node -v    # >= 20.0.0
npm -v     # >= 10.0.0
docker -v
git -v
```

---

## Installation étape par étape

### 1. Cloner le dépôt

```bash
git clone <url-du-repo> gstock
cd gstock
```

### 2. Démarrer la base de données

PostgreSQL 16 tourne dans un conteneur Docker :

```bash
docker compose up -d
```

Vérifier que le conteneur est actif :

```bash
docker ps
# gstock-postgres doit apparaître avec l'état "Up"
```

Paramètres de la base (définis dans `docker-compose.yml`) :

| Paramètre | Valeur |
|-----------|--------|
| Host | `localhost` |
| Port | `5432` |
| Database | `gstock_db` |
| User | `admin` |
| Password | `adminpassword` |

### 3. Configurer le backend

```bash
cd backend
```

Créer le fichier d'environnement :

```bash
cp .env.example .env
```

Contenu du fichier `.env` à renseigner :

```env
# Connexion à la base de données
DATABASE_URL="postgresql://admin:adminpassword@localhost:5432/gstock_db?schema=public"

# Secret JWT — utiliser une valeur aléatoire longue en production
JWT_SECRET="changez-moi-avec-openssl-rand-hex-32"

# Environnement
NODE_ENV="development"

# Port du serveur Express (optionnel, défaut : 5000)
PORT=5000

# URL du frontend (pour CORS)
FRONTEND_URL="http://localhost:3000"
```

> En production, générer un `JWT_SECRET` sécurisé : `openssl rand -hex 32`

### 4. Installer les dépendances backend

```bash
npm install
```

### 5. Appliquer les migrations et générer le client Prisma

```bash
npx prisma migrate dev
npx prisma generate
```

### 6. Peupler la base avec les données initiales

```bash
npx prisma db seed
```

Le seed crée :
- Les 5 rôles (Super Administrateur, Administrateur, Manager Magasin, Opérateur, Caissier)
- L'établissement Hub Central (UUID fixe)
- Le compte administrateur par défaut

| Champ | Valeur |
|-------|--------|
| Identifiant | `super.admin` |
| Mot de passe | `Admin@2026!` |
| Rôle | Super Administrateur |

> Ces identifiants sont uniquement pour le développement. Changer le mot de passe après la première connexion en production.

### 7. Démarrer le backend

```bash
npm run dev
```

Le serveur Express démarre sur `http://localhost:5000`. Un message de confirmation apparaît dans le terminal.

### 8. Configurer le frontend

Dans un nouveau terminal :

```bash
cd frontend
cp .env.example .env.local
```

Contenu du fichier `frontend/.env.local` :

```env
# URL de l'API (optionnel en dev — les rewrites Next.js gèrent la redirection)
NEXT_PUBLIC_API_URL="http://localhost:5000"
```

### 9. Installer les dépendances frontend

```bash
npm install
```

### 10. Démarrer le frontend

```bash
npm run dev
```

L'application Next.js démarre sur `http://localhost:3000`.

---

## Vérification de l'installation

Ouvrir `http://localhost:3000` dans un navigateur. La page de connexion doit s'afficher.

Se connecter avec :
- **Identifiant :** `super.admin`
- **Mot de passe :** `Admin@2026!`
- **Établissement :** Hub Central

Le dashboard doit s'afficher avec la navigation complète.

---

## Commandes utiles

### Backend

```bash
# Démarrer en mode développement (watch)
npm run dev

# Compiler TypeScript
npm run build

# Démarrer la version compilée
npm start

# Ouvrir Prisma Studio (interface graphique DB)
npx prisma studio

# Réinitialiser la base et relancer le seed
npx prisma migrate reset
```

### Frontend

```bash
# Démarrer en mode développement
npm run dev

# Build de production
npm run build

# Démarrer le build de production
npm start

# Linter
npm run lint
```

### Docker

```bash
# Démarrer PostgreSQL
docker compose up -d

# Arrêter PostgreSQL
docker compose down

# Voir les logs PostgreSQL
docker logs gstock-postgres

# Arrêter et supprimer les volumes (réinitialisation complète)
docker compose down -v
```

---

## Dépannage

### Le backend ne démarre pas

- Vérifier que le fichier `.env` existe dans `backend/`
- Vérifier que PostgreSQL est actif : `docker ps`
- Vérifier que le port 5000 est libre : `lsof -i :5000`

### Erreur Prisma "Can't reach database server"

- S'assurer que le conteneur Docker est actif : `docker compose up -d`
- Vérifier que `DATABASE_URL` dans `.env` correspond aux paramètres de `docker-compose.yml`

### Le frontend affiche une erreur de réseau

- Vérifier que le backend tourne sur le port 5000
- Vérifier les rewrites dans `frontend/next.config.ts`
- S'assurer que `withCredentials: true` est configuré dans `frontend/src/lib/apiClient.ts`

### Erreur "Invalid token" ou redirection vers /login en boucle

- Supprimer manuellement le cookie `auth_token` dans les DevTools du navigateur
- Se reconnecter

### Réinitialiser complètement l'environnement

```bash
docker compose down -v        # Supprimer la base de données
docker compose up -d          # Recréer le conteneur
cd backend
npx prisma migrate reset      # Réappliquer migrations + seed
```
