# Déploiement Docker — Stock Manager

Guide complet pour installer, lancer et maintenir Stock Manager via Docker.
Aucune connaissance en Node.js, PostgreSQL ou TypeScript n'est requise côté machine hôte —
Docker gère tout.

**Audience :** développeur déployant l'application chez un client, ou toute personne
reprenant le projet sur une nouvelle machine.

---

## Table des matières

1. [Prérequis](#1-prérequis)
2. [Architecture des containers](#2-architecture-des-containers)
3. [Premier lancement (installation complète)](#3-premier-lancement-installation-complète)
4. [Commandes du quotidien](#4-commandes-du-quotidien)
5. [Variables d'environnement](#5-variables-denvironnement)
6. [Ce qui se passe sous le capot](#6-ce-qui-se-passe-sous-le-capot)
7. [Mettre à jour l'application](#7-mettre-à-jour-lapplication)
8. [Interactions depuis le terminal](#8-interactions-depuis-le-terminal)
9. [Sauvegardes de la base de données](#9-sauvegardes-de-la-base-de-données)
10. [Dépannage](#10-dépannage)
11. [Repartir de zéro](#11-repartir-de-zéro)

---

## 1. Prérequis

### Sur la machine hôte (client ou serveur)

| Outil | Version minimale | Lien de téléchargement |
|-------|-----------------|----------------------|
| **Docker Desktop** | Récent (inclut Docker Compose) | https://www.docker.com/products/docker-desktop/ |
| **Git** | Récent | https://git-scm.com/downloads |

C'est **tout**. Node.js, PostgreSQL, npm — rien d'autre à installer.

### Vérifier que Docker est bien installé

```bash
docker --version
# Docker version 27.x.x ou supérieur

docker compose version
# Docker Compose version v2.x.x ou supérieur
```

Si ces commandes retournent une version, Docker est prêt.

> **Windows :** s'assurer que Docker Desktop est démarré (icône dans la barre système)
> avant de lancer les commandes.

---

## 2. Architecture des containers

Stock Manager tourne sur **3 containers** qui communiquent entre eux via un réseau
Docker interne. L'extérieur (navigateur) n'accède qu'au container frontend.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Machine hôte                              │
│                                                                  │
│   Navigateur → http://localhost:3000                             │
│                        │                                         │
│   ┌────────────────────▼────────────────────────────────────┐   │
│   │           stockmanager-frontend  (port 3000)             │   │
│   │                Next.js 16                                │   │
│   │   /api/* ──────────────────────────────────────────┐    │   │
│   └────────────────────────────────────────────────────│────┘   │
│                                                         │        │
│   ┌─────────────────────────────────────────────────────▼────┐  │
│   │           stockmanager-backend   (port 5001)              │  │
│   │                Express 5 + Prisma                         │  │
│   │   DATABASE_URL ──────────────────────────────────────┐   │  │
│   └──────────────────────────────────────────────────────│───┘  │
│                                                           │       │
│   ┌───────────────────────────────────────────────────────▼───┐  │
│   │           stockmanager-postgres  (port 5432)               │  │
│   │                PostgreSQL 16                               │  │
│   │   Volume persistant : postgres-data                        │  │
│   └────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Résumé des rôles

| Container | Image / Code | Port exposé | Rôle |
|-----------|-------------|-------------|------|
| `stockmanager-postgres` | `postgres:16-alpine` | 5432 | Base de données PostgreSQL |
| `stockmanager-backend` | `./backend/` | 5001 | API REST + WebSocket |
| `stockmanager-frontend` | `./frontend/` | **3000** | Interface web (seul port accessible depuis le navigateur) |

> Le port 5001 (backend) est exposé sur l'hôte uniquement pour le développement
> (accès direct à l'API via un client REST). En production, on peut le supprimer.

---

## 3. Premier lancement (installation complète)

### Étape 1 — Cloner le dépôt

```bash
git clone <url-du-repo> stock-manager
cd stock-manager
```

### Étape 2 — (Recommandé) Définir un JWT secret sécurisé

Sans cette étape, un secret par défaut est utilisé. **Acceptable en développement,
à ne jamais laisser en production.**

```bash
cp .env.example .env
```

Ouvrir `.env` et remplacer la valeur de `JWT_SECRET` :

```env
# Générer une valeur sécurisée avec cette commande :
# openssl rand -hex 32
JWT_SECRET=VOTRE_SECRET_GENERE_ICI
```

### Étape 3 — Lancer le build et démarrer

```bash
make setup
```

Équivalent sans Make :

```bash
docker compose up --build -d
```

Ce que cette commande fait, dans l'ordre :
1. Construit les images Docker du backend et du frontend (download des dépendances,
   compilation TypeScript, build Next.js)
2. Démarre PostgreSQL et attend qu'il soit opérationnel
3. Démarre le backend qui applique les migrations et le seed
4. Démarre le frontend

**Durée estimée du premier build : 3 à 8 minutes** selon la connexion internet et
les performances de la machine.

### Étape 4 — Vérifier que tout tourne

```bash
docker compose ps
```

Résultat attendu :

```
NAME                       STATUS          PORTS
stockmanager-postgres      Up (healthy)    0.0.0.0:5432->5432/tcp
stockmanager-backend       Up              0.0.0.0:5001->5001/tcp
stockmanager-frontend      Up              0.0.0.0:3000->3000/tcp
```

Les trois containers doivent être en état `Up`.

### Étape 5 — Ouvrir l'application

Naviguer vers **http://localhost:3000**

Se connecter avec le compte administrateur créé par le seed :

| Champ | Valeur |
|-------|--------|
| Identifiant | `super.admin` |
| Mot de passe | `Admin@2026!` |
| Établissement | Hub Central |

> **Changer le mot de passe admin** dès la première connexion en production.

---

## 4. Commandes du quotidien

Toutes les opérations courantes sont accessibles via `make`. Lancer `make help` à
tout moment pour afficher la liste complète.

### Démarrage & arrêt

```bash
make start    # Démarrer les containers existants (pas de rebuild)
make stop     # Arrêter les containers (données conservées)
make restart  # Redémarrer tous les services
```

### Build & mise à jour du code

```bash
make rebuild        # Rebuilder le backend ET le frontend (après modification du code)
make rebuild-back   # Rebuilder uniquement le backend
make rebuild-front  # Rebuilder uniquement le frontend
```

### Monitoring

```bash
make logs        # Suivre tous les logs en temps réel (Ctrl+C pour quitter)
make logs-back   # Logs du backend uniquement
make logs-front  # Logs du frontend uniquement
make status      # État des containers (ports, statut, santé)
make health      # Vérifier que l'API backend répond (/api/health)
```

### Base de données

```bash
make backup                              # Sauvegarder → backups/backup_YYYYMMDD_HHMMSS.sql
make restore FILE=backups/backup_xxx.sql # Restaurer depuis un fichier de sauvegarde
make seed                                # Rejouer le seed (rôles + Hub Central + super.admin)
make db-reset                            # ⚠️  Réinitialiser la DB (migrations + seed)
make db-shell                            # Ouvrir un shell PostgreSQL interactif (psql)
```

### Développement & outils

```bash
make studio         # Lancer Prisma Studio → http://localhost:5555
make shell          # Ouvrir un shell dans le container backend
make migrate        # Appliquer les migrations Prisma en attente
make migrate-status # Vérifier l'état des migrations
```

### Reset & aide

```bash
make reset    # ⚠️  Tout effacer (containers + données) et repartir de zéro
make help     # Lister toutes les commandes disponibles
```

### Équivalents sans Make

```bash
# Démarrer
docker compose up -d

# Arrêter (données conservées)
docker compose down

# Suivre les logs en temps réel
docker compose logs -f

# Logs d'un seul service
docker compose logs -f backend
docker compose logs -f frontend

# État des containers
docker compose ps

# Rebuilder et redémarrer
docker compose up --build -d

# Rebuilder un seul service
docker compose up --build -d backend
docker compose up --build -d frontend

# Redémarrer un seul service
docker compose restart backend

# Reset complet (supprime la base de données)
docker compose down -v
```

> Si `docker compose build` échoue, `docker compose up -d` relance simplement la dernière image qui avait été construite avec succès. C'est la raison classique d'un vieux frontend ou backend qui réapparaît après un redémarrage.

---

## 5. Variables d'environnement

Le fichier `.env` à la racine du projet permet de surcharger les valeurs par défaut
utilisées par `docker-compose.yml`.

### Générer un `JWT_SECRET` fort

Le `JWT_SECRET` est la clé qui signe et vérifie tous les tokens d'authentification.
Une valeur faible (mot, phrase, UUID) rend l'application vulnérable aux attaques
par force brute sur les tokens.

**Règles minimales :** 32 bytes aléatoires (= 64 caractères hexadécimaux ou ~44 en base64),
généré par un générateur cryptographique, jamais réutilisé entre environnements.

Choisir la commande selon l'OS disponible :

```bash
# macOS / Linux — méthode recommandée
openssl rand -hex 32

# macOS / Linux — alternative si openssl absent
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Windows — PowerShell
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Exemple de valeur générée :
```
a3f8c2e1d4b7920f5e6c3a8d1b4f7e2c9d0a5b8e3f6c1d4a7b0e3f6c9d2a5b8
```

> Ce fichier est dans `.gitignore` — il ne sera jamais commité. Ne jamais
> partager ni copier ce secret dans une issue, un chat ou un email.

### Fichier `.env` (à créer depuis `.env.example`)

```env
# Secret JWT — OBLIGATOIRE en production
# Générer avec : openssl rand -hex 32
JWT_SECRET=COLLER_ICI_LA_VALEUR_GENEREE

# Environnement (development | production)
NODE_ENV=production
```

### Variables complètes de chaque service

#### Backend

| Variable | Valeur Docker | Description |
|----------|--------------|-------------|
| `DATABASE_URL` | `postgresql://admin:adminpassword@postgres:5432/gstock_db` | Connexion interne au container postgres |
| `JWT_SECRET` | Depuis `.env` | Clé de signature des tokens JWT |
| `NODE_ENV` | `production` | Active le mode sécurisé du cookie (HTTPS only) |
| `PORT` | `5001` | Port d'écoute du serveur Express |
| `FRONTEND_URL` | `http://localhost:3000` | Origine autorisée pour le CORS |

#### Frontend

| Variable | Valeur Docker | Description |
|----------|--------------|-------------|
| `BACKEND_URL` | `http://backend:5001` | URL interne du backend pour les rewrites Next.js |

> **Pourquoi `http://backend:5001` et pas `http://localhost:5001` ?**
>
> Dans Docker, `localhost` dans le container frontend désigne le container lui-même,
> pas le backend. Docker Compose crée un réseau interne où chaque service est
> accessible par son nom de service (`backend`, `postgres`, `frontend`).
> `BACKEND_URL=http://backend:5001` utilise ce réseau interne.

---

## 6. Ce qui se passe sous le capot

### Séquence de démarrage

```
docker compose up --build -d
         │
         ├─ [1] Build image postgres  → image officielle, rien à compiler
         │
         ├─ [2] Build image backend
         │       ├─ npm install (toutes les dépendances)
         │       ├─ npx prisma generate (génère le client Prisma)
         │       └─ npm run build (tsc → dist/)
         │
         ├─ [3] Build image frontend
         │       ├─ npm install
         │       └─ npm run build (next build)
         │
         ├─ [4] Démarrage postgres
         │       └─ healthcheck toutes les 5s jusqu'à "pg_isready" ✅
         │
         ├─ [5] Démarrage backend (attend que postgres soit healthy)
         │       └─ docker-entrypoint.sh :
         │               ├─ npx prisma migrate deploy  → crée toutes les tables
         │               ├─ npx prisma db seed         → insère rôles + Hub Central + super.admin
         │               └─ node dist/server.js        → serveur Express démarre sur :5001
         │
         └─ [6] Démarrage frontend (attend que backend soit démarré)
                 └─ npm start (next start) → serveur Next.js démarre sur :3000
```

### Le script `docker-entrypoint.sh`

Ce script est le point d'entrée du container backend. Il s'exécute à **chaque démarrage**
du container.

```sh
#!/bin/sh
set -e  # Arrêter immédiatement si une commande échoue

# Boucle de retry : si la DB n'est pas encore prête, réessaie toutes les 5s
until npx prisma migrate deploy; do
  sleep 5
done

# Le seed est idempotent (utilise des upsert) — safe à relancer
npx prisma db seed || true   # "|| true" : ne bloque pas si le seed échoue

exec node dist/server.js     # "exec" remplace le shell par node (signal handling correct)
```

**`prisma migrate deploy` vs `prisma migrate dev` :**

| Commande | Usage | Comportement |
|----------|-------|-------------|
| `migrate dev` | Développement local | Crée de nouvelles migrations, interactif |
| `migrate deploy` | Docker / Production | Applique les migrations existantes, non-interactif |

En Docker, on utilise toujours `migrate deploy`.

### Persistance des données

Les données PostgreSQL sont stockées dans un **volume Docker nommé** `postgres-data`.
Ce volume survit aux `docker compose down`. Il est **uniquement supprimé** par :

```bash
docker compose down -v    # supprime les volumes
docker volume rm stock-manager_postgres-data  # suppression directe
```

Tant que le volume existe, les données (utilisateurs créés, stocks, commandes...) sont
conservées entre les redémarrages.

---

## 7. Mettre à jour l'application

### Après une modification du code source

Si le code a changé (nouveau commit, modification locale), il faut rebuilder les images :

```bash
# Récupérer les dernières modifications
git pull

# Rebuilder et redémarrer (backend + frontend)
make rebuild
# — ou sans Make :
docker compose up --build -d
```

Les données en base sont **conservées** — seul le code applicatif est mis à jour.

### Après une migration Prisma (nouveau schéma)

Si le schéma Prisma a changé et qu'une nouvelle migration a été créée, le rebuild
suffit : `docker-entrypoint.sh` exécute `prisma migrate deploy` à chaque démarrage,
ce qui applique automatiquement les nouvelles migrations.

```bash
git pull
make rebuild
# → prisma migrate deploy s'exécute et applique la nouvelle migration
```

### Mettre à jour uniquement un service

```bash
# Rebuilder uniquement le backend
make rebuild-back
# — ou : docker compose up --build -d backend

# Rebuilder uniquement le frontend
make rebuild-front
# — ou : docker compose up --build -d frontend
```

---

## 8. Interactions depuis le terminal

Les commandes `make` couvrent les cas les plus courants. Pour les opérations avancées,
utiliser `docker exec` directement. Le principe :

```bash
docker exec -it <nom-du-container> <commande>
```

- `-it` : terminal interactif (nécessaire pour les commandes qui attendent une saisie ou affichent du texte)
- Sans `-it` : exécution one-shot, la sortie s'affiche et le terminal reprend la main

---

### Ouvrir un shell dans le backend

```bash
make shell
# — ou :
docker exec -it stockmanager-backend sh
```

Tu es dans `/app` avec toutes les variables d'environnement configurées (DATABASE_URL,
JWT_SECRET, etc.) et toutes les dépendances disponibles. Tu peux lancer n'importe
quelle commande Node/Prisma comme en local.

```bash
exit  # Quitter le shell
```

---

### Commandes Prisma

#### Raccourcis Make

```bash
make migrate        # Appliquer les migrations en attente (prisma migrate deploy)
make migrate-status # Vérifier l'état des migrations
make seed           # Rejouer le seed (idempotent — safe à relancer)
```

#### Depuis un shell interactif

```bash
docker exec -it stockmanager-backend sh

# Puis dans le container :
npx prisma migrate status   # Vérifier l'état des migrations
npx prisma db pull          # Synchroniser le schéma depuis la DB (introspection)
npx prisma db push          # Pousser le schéma vers la DB sans créer de migration
npx prisma db seed          # Rejouer le seed
npx prisma migrate deploy   # Appliquer les migrations en attente
```

#### En one-shot (sans ouvrir un shell)

```bash
docker exec -it stockmanager-backend npx prisma migrate status
docker exec -it stockmanager-backend npx prisma db pull
docker exec -it stockmanager-backend npx prisma db seed
```

> **Note sur `db pull` :** si le schéma contient des modèles avec `@@map`, Prisma
> peut afficher des avertissements `[*] Changed the name of the following enum/model`.
> Ce sont des avertissements informatifs, pas des erreurs. Le schéma `schema.prisma`
> reste la source de vérité ; ne pas écraser les modifications manuelles.

---

### Prisma Studio

Prisma Studio est une interface graphique pour explorer et modifier les données
directement en base. Il tourne sur le port **5555**, déjà exposé dans `docker-compose.yml`.

**Lancer Prisma Studio :**

```bash
make studio
# — ou :
docker exec -it stockmanager-backend npx prisma studio --port 5555 --browser none
```

**Ouvrir dans le navigateur :** [http://localhost:5555](http://localhost:5555)

> Le flag `--browser none` empêche Prisma d'essayer d'ouvrir un navigateur depuis
> l'intérieur du container (ce qui échouerait). On ouvre manuellement l'URL.

**Arrêter Prisma Studio :** `Ctrl+C` dans le terminal.

---

### Accès direct à PostgreSQL (psql)

```bash
make db-shell
# — ou :
docker exec -it stockmanager-postgres psql -U admin -d gstock_db
```

Commandes psql utiles une fois connecté :

```sql
\dt                          -- Lister toutes les tables
\d nom_de_la_table           -- Décrire la structure d'une table
SELECT * FROM roles;         -- Exemple de requête
\q                           -- Quitter psql
```

#### Requêtes SQL one-shot (sans shell interactif)

```bash
# Lister les tables
docker exec -it stockmanager-postgres psql -U admin -d gstock_db -c "\dt"

# Requête SQL directe
docker exec -it stockmanager-postgres psql -U admin -d gstock_db -c "SELECT * FROM roles;"

# Vérifier les utilisateurs créés
docker exec -it stockmanager-postgres psql -U admin -d gstock_db -c "SELECT username, email FROM users;"
```

---

### Tableau récapitulatif

| Besoin | Make | Docker direct |
|--------|------|---------------|
| Shell interactif backend | `make shell` | `docker exec -it stockmanager-backend sh` |
| État des migrations | `make migrate-status` | `docker exec -it stockmanager-backend npx prisma migrate status` |
| Appliquer les migrations | `make migrate` | `docker exec -it stockmanager-backend npx prisma migrate deploy` |
| Synchroniser le schéma | — | `docker exec -it stockmanager-backend npx prisma db pull` |
| Rejouer le seed | `make seed` | `docker exec -it stockmanager-backend npx prisma db seed` |
| Prisma Studio (UI) | `make studio` | `docker exec -it stockmanager-backend npx prisma studio --port 5555 --browser none` |
| Shell PostgreSQL | `make db-shell` | `docker exec -it stockmanager-postgres psql -U admin -d gstock_db` |
| Requête SQL directe | — | `docker exec -it stockmanager-postgres psql -U admin -d gstock_db -c "SELECT ..."` |

---

## 9. Sauvegardes de la base de données

Avant toute action sensible (migration risquée, modification manuelle de données,
reset complet), créer une sauvegarde. Les fichiers de backup ne sont jamais
committés dans git (`backups/` est dans `.gitignore`).

### Créer une sauvegarde

```bash
# Avec Make — crée automatiquement le dossier backups/ et horodate le fichier
make backup
# → backups/backup_20260504_143022.sql

# Sans Make
docker exec stockmanager-postgres pg_dump -U admin gstock_db > backup.sql

# Sans Make — version horodatée
docker exec stockmanager-postgres pg_dump -U admin gstock_db > "backup_$(date +%Y%m%d_%H%M%S).sql"
```

### Restaurer depuis une sauvegarde

```bash
# Avec Make
make restore FILE=backups/backup_20260504_143022.sql

# Sans Make
docker exec -i stockmanager-postgres psql -U admin -d gstock_db < backups/backup_20260504_143022.sql
```

> La restauration **écrase les données actuelles** sans possibilité d'annulation.
> Créer une sauvegarde de l'état courant avant de restaurer si nécessaire.

### Lister les sauvegardes disponibles

```bash
ls -lh backups/
```

### Bonnes pratiques

- Toujours faire un `make backup` avant un `make reset` ou une migration manuelle
- Nommer les fichiers de façon explicite si la sauvegarde correspond à un état particulier :
  ```bash
  docker exec stockmanager-postgres pg_dump -U admin gstock_db > backups/avant_migration_v2.sql
  ```
- Les fichiers `.sql` sont du texte brut lisibles avec n'importe quel éditeur

---

## 10. Dépannage

### Les containers ne démarrent pas

```bash
# Vérification rapide — état et santé de tous les containers
make status
# — ou :
docker compose ps

# Vérifier que l'API répond
make health

# Voir les logs d'erreur
docker compose logs
```

---

### `stockmanager-backend` s'arrête au démarrage

**Symptôme :** le backend redémarre en boucle ou est en état `Exited`.

```bash
docker compose logs backend
```

**Cause fréquente 1 — La base de données n'est pas encore prête**

Le script réessaie automatiquement toutes les 5 secondes. Si ça échoue trop longtemps,
vérifier que postgres est en bonne santé :

```bash
docker compose ps postgres
# Doit afficher : Up (healthy)
```

**Cause fréquente 2 — Erreur de migration**

```
Error: P3009 migrate found failed migrations
```

Solution : réinitialiser les migrations (perd les données) :

```bash
docker compose down -v
docker compose up --build -d
```

---

### `stockmanager-frontend` ne charge pas l'application

**Symptôme :** page blanche ou erreur réseau dans le navigateur.

```bash
docker compose logs frontend
```

**Cause fréquente — Le build Next.js a échoué**

Vérifier les erreurs TypeScript ou de compilation dans les logs. Corriger le code,
puis :

```bash
docker compose up --build -d frontend
```

---

### Les appels API retournent des erreurs réseau

**Symptôme :** les requêtes `/api/...` échouent dans le navigateur.

**Vérification :**

```bash
# Tester directement l'API backend depuis l'hôte
curl http://localhost:5001/api/health
# Réponse attendue : {"status":"ok","message":"..."}
```

Si le backend répond mais que le frontend ne le joint pas, vérifier que `BACKEND_URL`
est bien défini comme **argument de build** dans `docker-compose.yml` :

```yaml
frontend:
  build:
    args:
      BACKEND_URL: http://backend:5001
```

> `BACKEND_URL` doit être un ARG de build (pas une variable `environment:`). Next.js
> sérialise les rewrites dans `.next/routes-manifest.json` pendant le `next build` —
> une variable runtime arriverait trop tard et le frontend pointerait toujours vers
> `localhost:5001` au lieu de `backend:5001`.

---

### Erreur de connexion à la base de données

**Symptôme :** `Can't reach database server at postgres:5432`

```bash
# Vérifier que postgres est healthy
docker compose ps postgres

# Vérifier les logs postgres
docker compose logs postgres

# Tester la connexion manuellement
docker exec -it stockmanager-postgres psql -U admin -d gstock_db -c "SELECT 1;"
```

---

### Le port 3000 ou 5432 est déjà utilisé

**Symptôme :** `Bind for 0.0.0.0:3000 failed: port is already allocated`

Identifier le processus qui utilise le port :

```bash
# macOS / Linux
lsof -i :3000
lsof -i :5432

# Windows
netstat -ano | findstr :3000
```

Arrêter le processus concerné, puis relancer `docker compose up -d`.

---

### Forcer un rebuild complet (cache Docker corrompu)

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

## 11. Repartir de zéro

### Réinitialiser uniquement la base de données (conserver le code buildé)

Cette opération supprime les données et les recrée via migrations + seed, **sans**
rebuilder les images Docker.

```bash
make db-reset
```

Ce que `make db-reset` fait :
1. Arrête et supprime le container backend
2. Supprime le volume de données PostgreSQL
3. Redémarre postgres, puis backend
4. `docker-entrypoint.sh` ré-exécute `prisma migrate deploy` + `prisma db seed`

> Toujours faire un `make backup` avant un `make db-reset`.

### Réinitialiser complètement (code + données)

Supprime tout et rebuild les images depuis zéro :

```bash
make reset
# — ou :
docker compose down -v
docker compose up --build -d
```

### Réinitialiser uniquement le volume de données (méthode manuelle)

```bash
docker compose down -v          # Supprime les containers et le volume de données
docker compose up -d            # Redémarre — migrations + seed re-exécutés automatiquement
```

### Supprimer toutes les ressources Docker du projet

```bash
docker compose down -v --rmi all
```

Cette commande supprime les containers, les volumes **et les images buildées**.
Le prochain `docker compose up --build` retéléchargera et recompilera tout depuis zéro.
