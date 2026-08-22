# Guide d'Installation — Stock Manager

Ce guide décrit comment installer et démarrer Stock Manager en environnement de développement local.

---

## Deux modes de travail

| Mode | Commande | Usage |
|------|----------|-------|
| **Dev local** | `npm run dev` | Travail quotidien — rechargement à chaud, corrections instantanées |
| **Docker complet** | `make setup` | Validation, démo, recette — environnement propre proche de la prod |

En mode dev local, seul PostgreSQL tourne dans Docker. Backend et frontend sont natifs (Node.js local).

---

## Prérequis

| Outil | Version minimale | Usage |
|-------|-----------------|-------|
| Node.js | 20.x LTS | Runtime backend et frontend |
| npm | 10.x | Gestionnaire de paquets |
| Docker Desktop | Récent | PostgreSQL 16 (dev local) ou stack complète (Docker mode) |
| Git | Récent | Clonage du dépôt |

Vérifier les versions :

```bash
node -v    # >= 20.0.0
npm -v     # >= 10.0.0
docker -v
git -v
```

---

## Mode dev local (recommandé pour le développement)

### Premier setup (une seule fois)

```bash
# 1. Cloner le dépôt
git clone <url-du-repo> stock-manager
cd stock-manager

# 2. Installer toutes les dépendances (backend + frontend en une commande)
npm install

# 3. Démarrer PostgreSQL
npm run dev:db

# 4. Appliquer les migrations de base de données
npm run db:migrate

# 5. Peupler la base avec les données initiales
npm run db:seed
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

### Utilisation quotidienne

```bash
npm run dev
```

Cette commande unique :
- Démarre PostgreSQL dans Docker sur `localhost:5433` (si pas déjà actif)
- Lance le backend Express sur `http://localhost:5001`
- Lance le frontend Next.js sur `http://localhost:3000`
- Regroupe les logs des deux services dans le même terminal

`Ctrl+C` arrête proprement backend et frontend. PostgreSQL continue de tourner en arrière-plan.

### URLs de développement

| Service | URL |
|---------|-----|
| Application | `http://localhost:3000` |
| API backend | `http://localhost:5001` |
| PostgreSQL | `localhost:5433` |

### Après un `git pull`

```bash
npm run db:migrate   # si de nouvelles migrations ont été ajoutées
npm run dev          # reprendre le travail
```

`npm install` n'est nécessaire que si `package.json` a changé.

`npm run db:seed` n'est pas à relancer à chaque session — seulement si vous voulez réinitialiser les données de test.

---

## Configuration optionnelle (variables d'environnement)

Le script `dev-local.sh` utilise des valeurs par défaut fonctionnelles pour le développement. Un fichier `.env` à la racine permet de les surcharger si nécessaire.

Variables disponibles (toutes optionnelles en dev) :

```env
DATABASE_URL="postgresql://admin:adminpassword@localhost:5433/gstock_db?schema=public"
JWT_SECRET="changez-moi-en-production-avec-openssl-rand-hex-32"
NODE_ENV="development"
PORT=5001
FRONTEND_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="Stock Manager"
```

> En production, générer un `JWT_SECRET` fort : `openssl rand -hex 32`

---

## Commandes disponibles depuis la racine

### Dev local

```bash
npm run dev            # Tout démarrer (PostgreSQL + backend + frontend)
npm run dev:db         # PostgreSQL seulement
npm run dev:backend    # Backend seulement
npm run dev:frontend   # Frontend seulement
npm install            # Installer les dépendances backend + frontend
```

### Base de données

```bash
npm run db:migrate     # Appliquer les migrations en attente
npm run db:seed        # Rejouer le seed (rôles + Hub Central + super.admin)
make studio            # Prisma Studio → http://localhost:5555
make db-shell          # Shell PostgreSQL interactif
make backup            # Sauvegarder la DB → backups/backup_YYYYMMDD.sql
```

### Backend (depuis `backend/`)

```bash
npm run dev            # Démarrer en mode watch (ts-node)
npm run build          # Compiler TypeScript → dist/
npm start              # Démarrer le build compilé
npx prisma studio      # Interface graphique DB
npx prisma migrate reset  # Réinitialiser migrations + seed (⚠️ perd les données)
```

### Frontend (depuis `frontend/`)

```bash
npm run dev            # Démarrer en mode développement
npm run build          # Build de production
npm start              # Démarrer le build de production
npm run lint           # Linter
```

---

## Vérification de l'installation

Ouvrir `http://localhost:3000` dans un navigateur. La page de connexion doit s'afficher.

Se connecter avec :
- **Identifiant :** `super.admin`
- **Mot de passe :** `Admin@2026!`
- **Établissement :** Hub Central

Le dashboard doit s'afficher avec la navigation complète.

---

## Dépannage

### Le backend ne démarre pas

- Vérifier que PostgreSQL est actif : `docker ps` (chercher `stockmanager-postgres`)
- Vérifier que le port 5000 est libre : `lsof -i :5001`
- Si PostgreSQL n'est pas démarré : `npm run dev:db`

### Erreur Prisma "Can't reach database server"

- Démarrer PostgreSQL : `npm run dev:db`
- Vérifier que `DATABASE_URL` pointe sur le port **5433** (port hôte du conteneur Docker)

### Le frontend affiche une erreur de réseau

- Vérifier que le backend tourne : `curl http://localhost:5001/api/health`
- Vérifier les rewrites dans `frontend/next.config.ts`
- Vérifier que `withCredentials: true` est configuré dans `frontend/src/lib/apiClient.ts`

### Erreur "Invalid token" ou redirection vers /login en boucle

- Supprimer le cookie `auth_token` dans les DevTools du navigateur
- Se reconnecter

### Réinitialiser complètement l'environnement de dev

```bash
docker compose down -v      # Supprimer le conteneur et le volume PostgreSQL
npm run dev:db              # Recréer PostgreSQL
npm run db:migrate          # Réappliquer les migrations
npm run db:seed             # Remettre les données initiales
```

### Le port 5433 est déjà utilisé

```bash
lsof -i :5433               # Identifier le processus
docker compose down         # Arrêter tous les conteneurs du projet
```
