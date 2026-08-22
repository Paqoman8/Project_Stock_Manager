# Stock Manager — Système de Gestion Commerciale Centralisée

Stock Manager est un ERP interne multi-établissements couvrant l'intégralité de la chaîne logistique et financière : de la commande fournisseur jusqu'au rapport d'inventaire, en passant par la réception de marchandises et la gestion des stocks.

## Fonctionnalités principales

- **Authentification sécurisée** — connexion par identifiant, JWT httpOnly, protection brute-force
- **Gestion des utilisateurs** — 5 rôles hiérarchiques (SA, Admin, Manager, Opérateur, Caissier)
- **Multi-établissements** — MAGASIN, BOUTIQUE, ENTREPOT avec contrôle d'accès par store
- **Catalogue produits** — catégories hiérarchiques, SKU unique, formats de conditionnement
- **Fournisseurs** — catalogue produit fournisseur avec tarification et conditions de paiement
- **Bons de commande** — workflow complet DRAFT → SENT → RECEIVED, référence BC-YYYY-XXXX
- **Réceptions de stock** — PENDING → CONFIRMED avec création automatique de mouvements
- **Factures fournisseur** — suivi PENDING / PAID / OVERDUE / DISPUTED
- **Inventaire** — niveaux de stock par établissement, seuils d'alerte, breakdowns par format
- **Rapports d'inventaire** — DRAFT → VALIDATED, référence INV-YYYY-XXXX, ajustements irréversibles
- **Journal d'audit** — traçabilité complète de 30+ types d'actions (Qui, Quoi, Où, Quand)

## Stack technique

| Couche | Technologie | Version |
|--------|-------------|---------|
| Backend | Express.js + TypeScript | 5.2.1 |
| ORM | Prisma | 7.8.0 |
| Base de données | PostgreSQL | 16 |
| Frontend | Next.js + React | 16.2.4 / 19.2.4 |
| Formulaires | react-hook-form + Zod | 7.74.0 / 4.4.1 |
| Styles | Tailwind CSS | 3.4.19 |
| Auth | JWT (httpOnly cookie) | 9.0.3 |

---

## Déploiement via Docker (recommandé)

> **Prérequis unique : [Docker Desktop](https://www.docker.com/products/docker-desktop/) installé.**
> Aucune autre installation requise (Node.js, PostgreSQL, etc.).

### Premier lancement

```bash
# 1. Cloner le dépôt
git clone <url-du-repo> stock-manager
cd stock-manager

# 2. (Optionnel) Définir un JWT secret sécurisé
cp .env.example .env
# Éditer .env et remplacer JWT_SECRET par une valeur forte

# 3. Tout lancer en une seule commande
make setup
# — ou sans Make :
docker compose up --build -d
```

C'est tout. Docker s'occupe de :
- Créer et démarrer la base de données PostgreSQL
- Installer les dépendances backend et frontend
- Compiler le code TypeScript
- Appliquer les migrations de base de données
- Exécuter le seed (rôles, établissement Hub Central, compte admin)
- Démarrer les serveurs backend et frontend

**L'application est accessible sur `http://localhost:3000`**

| Identifiant | Mot de passe |
|-------------|-------------|
| `super.admin` | `Admin@2026!` |

### Commandes du quotidien

```bash
make start    # Démarrer (sans rebuild)
make stop     # Arrêter (données conservées)
make restart  # Redémarrer les services
make dev      # Lancer backend + frontend en local (PostgreSQL reste dans Docker)
make logs     # Suivre les logs en temps réel
make reset    # ⚠️  Tout effacer et repartir de zéro
make help     # Lister toutes les commandes
```

Sans Make :

```bash
docker compose up -d          # Démarrer
docker compose down           # Arrêter
docker compose logs -f        # Logs
docker compose down -v        # Reset complet (supprime la base)
docker compose up --build -d  # Rebuild après modification du code
```

---

## Installation manuelle (développement local)

Pour travailler sur le code sans Docker pour l'application elle-même, voir [Docs/INSTALLATION.md](Docs/INSTALLATION.md).

Résumé rapide :

```bash
npm install
npm run dev:db
npm run db:migrate   # seulement au premier setup ou après nouvelle migration
npm run db:seed      # seulement pour peupler / réinitialiser
npm run dev
```

Cela lance :
- PostgreSQL dans Docker sur `localhost:5433`
- le backend Express en local sur `http://localhost:5000`
- le frontend Next.js en local sur `http://localhost:3000`

En pratique :
- `npm install` ou `npm i` à la racine installe maintenant les dépendances du workspace backend + frontend
- `npm run db:migrate` n'est pas à faire à chaque fois
- `npm run db:seed` n'est pas à faire à chaque fois

### Pourquoi Docker peut relancer une vieille version

Si `docker compose build` échoue, Docker ne produit pas de nouvelle image. Ensuite, `docker compose up -d` redémarre les containers à partir de la dernière image construite avec succès. C'est pour cela que vous pouvez retomber sur une ancienne version malgré un `down` puis `up`.

Pour repartir proprement après un échec réseau pendant l'installation npm :

```bash
docker compose down
docker compose build --no-cache backend frontend
docker compose up -d
make migrate
```

---

## Documentation

| Fichier | Contenu |
|---------|---------|
| [Docs/PROJECT_STATUS.md](Docs/PROJECT_STATUS.md) | **État du projet — modules implémentés, en attente, conventions** (lire en premier) |
| [Docs/DOCKER_DEPLOYMENT.md](Docs/DOCKER_DEPLOYMENT.md) | Guide complet de déploiement Docker (setup, commandes, dépannage) |
| [Docs/ARCHITECTURE.md](Docs/ARCHITECTURE.md) | Architecture technique, modèle de données, flux |
| [Docs/INSTALLATION.md](Docs/INSTALLATION.md) | Guide d'installation manuelle avec prérequis |
| [Docs/USAGE.md](Docs/USAGE.md) | Guide d'utilisation des modules |
| [Docs/STYLEGUIDE.md](Docs/STYLEGUIDE.md) | Standards de code TypeScript, React, Prisma |
| [Docs/MONETIZATION_STRATEGY.md](Docs/MONETIZATION_STRATEGY.md) | Stratégie de monétisation, roadmap commerciale |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Comment contribuer au projet |
| [CHANGELOG.md](CHANGELOG.md) | Historique des versions |
| [SECURITY.md](SECURITY.md) | Politique de sécurité |

## Structure du projet

```
stock-manager/
├── backend/
│   ├── Dockerfile
│   ├── docker-entrypoint.sh  # Migrations + seed + démarrage
│   ├── prisma/               # Schéma, migrations, seed
│   └── src/
│       ├── controllers/
│       ├── services/
│       ├── repositories/
│       ├── routes/
│       ├── middlewares/
│       └── config/
├── frontend/
│   ├── Dockerfile
│   └── src/
│       ├── app/              # Pages Next.js (App Router)
│       ├── components/
│       └── lib/
├── Docs/                     # Documentation
├── docker-compose.yml        # Orchestration des 3 services
├── Makefile                  # Commandes raccourcis
├── .env.example              # Template des variables d'environnement
└── README.md
```

## Licence

Projet propriétaire — usage interne uniquement.
