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

## Démarrage rapide

```bash
# 1. Cloner le dépôt
git clone <url-du-repo> gstock
cd gstock

# 2. Démarrer la base de données
docker compose up -d

# 3. Configurer et initialiser le backend
cd backend
cp .env.example .env   # puis renseigner les variables
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev            # port 5000

# 4. Démarrer le frontend (dans un nouveau terminal)
cd ../frontend
cp .env.example .env.local
npm install
npm run dev            # port 3000
```

Compte par défaut après le seed : `super.admin` / `Admin@2026!`

## Documentation

| Fichier | Contenu |
|---------|---------|
| [Docs/ARCHITECTURE.md](Docs/ARCHITECTURE.md) | Architecture technique, modèle de données, flux |
| [Docs/INSTALLATION.md](Docs/INSTALLATION.md) | Guide d'installation complet avec prérequis |
| [Docs/USAGE.md](Docs/USAGE.md) | Guide d'utilisation des modules |
| [Docs/STYLEGUIDE.md](Docs/STYLEGUIDE.md) | Standards de code TypeScript, React, Prisma |
| [Docs/MONETIZATION_STRATEGY.md](Docs/MONETIZATION_STRATEGY.md) | Stratégie de monétisation, roadmap commerciale, projections |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Comment contribuer au projet |
| [CHANGELOG.md](CHANGELOG.md) | Historique des versions |
| [SECURITY.md](SECURITY.md) | Politique de sécurité |

## Structure du projet

```
gstock/
├── backend/
│   ├── prisma/           # Schéma Prisma, migrations, seed
│   └── src/
│       ├── controllers/  # Logique HTTP
│       ├── services/     # Logique métier
│       ├── repositories/ # Accès base de données
│       ├── routes/       # Définition des endpoints
│       ├── middlewares/  # Auth, validation
│       └── config/       # Configuration (DB, env)
├── frontend/
│   └── src/
│       ├── app/          # Pages Next.js (App Router)
│       ├── components/   # Composants React réutilisables
│       └── lib/          # Utilitaires, client API
├── docs/                 # Documentation technique
├── docker-compose.yml    # PostgreSQL 16
└── README.md
```

## Licence

Projet propriétaire — usage interne uniquement.
