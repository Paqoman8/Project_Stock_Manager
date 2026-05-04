# Architecture — Stock Manager

Ce document décrit l'architecture technique de Stock Manager : organisation des couches, modèle de données, flux d'authentification, système d'audit et décisions structurantes.

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Organisation des couches](#2-organisation-des-couches)
3. [Modèle de données](#3-modèle-de-données)
4. [Flux d'authentification](#4-flux-dauthentification)
5. [Contrôle d'accès (RBAC)](#5-contrôle-daccès-rbac)
6. [Système d'audit](#6-système-daudit)
7. [Séquences de références](#7-séquences-de-références)
8. [Communication frontend ↔ backend](#8-communication-frontend--backend)
9. [Décisions architecturales](#9-décisions-architecturales)

---

## 1. Vue d'ensemble

Stock Manager est structuré en monorepo avec deux applications indépendantes qui communiquent via une API REST :

```
┌──────────────────────────────────────────────────────────┐
│                   Navigateur (port 3000)                  │
│  Next.js 16 — App Router — React 19 — Tailwind CSS        │
│  SessionContext (polling 2min) — axios (withCredentials)  │
└────────────────────────┬─────────────────────────────────┘
                         │ /api/* → rewrites Next.js
                         ▼
┌──────────────────────────────────────────────────────────┐
│                  Backend (port 5000)                      │
│  Express 5 — TypeScript — JWT httpOnly cookie             │
│  Routes → Middlewares → Controllers → Services → Repos    │
└────────────────────────┬─────────────────────────────────┘
                         │ Prisma 7 (PostgreSQL adapter)
                         ▼
┌──────────────────────────────────────────────────────────┐
│             PostgreSQL 16 (docker-compose)                │
│  UUID PKs — ACID transactions — Soft deletes              │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Organisation des couches

### Backend (`backend/src/`)

```
controllers/    Parsing HTTP, validation Zod, appel service, réponse JSON
services/       Logique métier, orchestration, appel audit
repositories/   Requêtes Prisma, SELECT/INSERT/UPDATE
middlewares/    requireAuth, requireRole, requireSA, requireAdmin
routes/         Définition des endpoints et chaînes de middlewares
config/         Instance Prisma partagée, variables d'environnement
```

**Règle absolue :** aucune requête Prisma dans un controller. Le controller appelle un service, le service appelle un repository.

### Frontend (`frontend/src/`)

```
app/
  (public)/login/       Page de connexion
  dashboard/            Shell protégé
    users/              Gestion utilisateurs
    stores/             Gestion établissements
    suppliers/          Fournisseurs
    supplier-products/  Catalogue fournisseur
    catalogue/          Catalogue produits
    purchase-orders/    Bons de commande
    receptions/         Réceptions de stock
    invoices/           Factures fournisseur
    inventory/          Stocks + rapports
    audit/              Journal d'audit
components/             Composants React réutilisables
lib/
  apiClient.ts          axios configuré (withCredentials, baseURL /api)
```

---

## 3. Modèle de données

### Authentification & accès

| Table | Rôle |
|-------|------|
| `roles` | 5 rôles prédéfinis (SA, Admin, Manager, Opérateur, Caissier) |
| `users` | Comptes utilisateurs (username, email, pwd_hash, is_active) |
| `user_store_access` | Accès many-to-many utilisateur ↔ établissement |
| `sessions_log` | Trace de chaque connexion (user, store, IP, timestamp) |

### Référentiel

| Table | Rôle |
|-------|------|
| `stores` | Établissements (type, statut, couleur, is_protected) |
| `categories` | Catégories hiérarchiques (parent_id nullable) |
| `products` | Catalogue produits (SKU unique, unité, prix, is_active) |
| `packaging_formats` | Formats de conditionnement par produit (ex : Carton ×24) |

### Approvisionnement

| Table | Rôle |
|-------|------|
| `suppliers` | Fournisseurs (conditions de paiement, is_active) |
| `supplier_products` | Tarification et conditions par fournisseur/produit |
| `purchase_orders` | Bons de commande (réf. BC-YYYY-XXXX, statut, store) |
| `purchase_order_sequences` | Compteur atomique par année pour les références |
| `purchase_order_items` | Lignes de commande |
| `stock_receptions` | Réceptions liées à un bon de commande |
| `reception_items` | Lignes de réception avec quantité et format |
| `supplier_invoices` | Factures fournisseur (liées à un BC, statut) |

### Stock & inventaire

| Table | Rôle |
|-------|------|
| `inventory` | Niveaux de stock par store/produit (physical, reserved, seuils) |
| `inventory_breakdowns` | Décomposition du stock par format de conditionnement |
| `stock_movements` | Ledger immuable de tous les mouvements (type, quantité, raison) |

### Rapports d'inventaire

| Table | Rôle |
|-------|------|
| `inventory_reports` | Rapport de comptage physique (réf. INV-YYYY-XXXX, statut) |
| `inventory_report_sequences` | Compteur atomique par année |
| `inventory_report_lines` | Ligne par produit (quantité comptée, écart calculé) |
| `inventory_report_line_breakdowns` | Écart par format de conditionnement |

### Audit

| Table | Rôle |
|-------|------|
| `audit_logs` | Journal immuable (acteur, action, cible, store, IP, metadata JSON) |

---

## 4. Flux d'authentification

```
[Browser]               [Express]              [PostgreSQL]
    |                       |                        |
    | POST /api/auth/login  |                        |
    | { username, password, storeId } |              |
    |---------------------->|                        |
    |                       | SELECT user WHERE      |
    |                       | username = ?           |
    |                       |----------------------->|
    |                       |<-- user + pwd_hash --  |
    |                       |                        |
    |                       | bcrypt.compare(pwd, hash)
    |                       | jwt.sign({ userId, roleId, storeId })
    |                       |                        |
    | Set-Cookie: auth_token (httpOnly, sameSite: strict)
    | 200 OK { user: {...} }|                        |
    |<----------------------|                        |
    |                       |                        |
    | [Cookie géré auto     |                        |
    |  par le navigateur]   |                        |
```

Le `storeId` est inclus dans le payload JWT. Toutes les requêtes authentifiées suivantes transmettent automatiquement le cookie, et le middleware extrait le contexte de session depuis le JWT sans requête DB.

**Polling frontend :** `SessionContext` appelle `/api/auth/me` toutes les 2 minutes. Si la réponse est `401` (compte désactivé, token expiré), l'utilisateur est redirigé vers `/login`.

---

## 5. Contrôle d'accès (RBAC)

### Hiérarchie des rôles

```
Super Administrateur (SA)
    └── Administrateur (Admin)
            └── Manager Magasin
                    └── Opérateur
                            └── Caissier
```

### Middlewares disponibles

```typescript
requireAuth          // Vérifie la présence et la validité du JWT
requireSA            // SA uniquement
requireAdmin         // SA ou Admin
requireRole(['Manager Magasin', 'Opérateur'])  // Rôles spécifiques
```

### Règles clés

- Un Admin ne peut pas créer ni modifier un SA ou un autre Admin.
- Un Admin ne voit dans le journal d'audit que les logs de ses établissements.
- Les routes de lecture sont généralement accessibles dès le rôle Manager.
- Les mutations (création, modification, suppression) requièrent Admin ou SA.

---

## 6. Système d'audit

Chaque mutation de données déclenche un appel non-bloquant à `logAction()` dans `backend/src/services/audit.service.ts`.

### Principe de non-blocage

```typescript
// Pattern obligatoire dans chaque service
const entity = await doMainOperation();   // opération métier en premier
try {
  await logAction({ ... });               // audit après, jamais bloquant
} catch { /* absorbé silencieusement */ }
return entity;
```

### Champs clés

| Champ | Source | Notes |
|-------|--------|-------|
| `actor_id` | JWT (`req.user.userId`) | null sur connexion échouée |
| `actor_name` | `resolveActorName()` | Dénormalisé au moment du fait |
| `store_id` | JWT (`req.user.storeId`) | Magasin de connexion, jamais le body |
| `store_name` | `resolveStoreName()` | Dénormalisé au moment du fait |
| `action` | Enum `AuditAction` | Défini dans le schéma Prisma |
| `metadata` | JsonB | Données contextuelles selon l'action |

**Dénormalisation :** `actor_name`, `target_name`, `store_name` sont copiés au moment de l'écriture. Les renommages ultérieurs n'altèrent pas l'historique.

### Ajouter l'audit à un nouveau module

1. Ajouter les valeurs à l'enum `AuditAction` dans `prisma/schema.prisma`
2. Appliquer la migration : `npx prisma migrate dev`
3. Appeler `logAction()` dans le service après l'opération principale
4. Mettre à jour le frontend : type union `AuditAction`, `ACTION_LABELS`, `ACTION_COLORS`, `ACTION_GROUPS`

---

## 7. Séquences de références

Les références BC-YYYY-XXXX (bons de commande) et INV-YYYY-XXXX (rapports) sont générées par `upsert` atomique sur les tables `purchase_order_sequences` et `inventory_report_sequences` :

```typescript
// Incrémentation atomique par année
const seq = await prisma.purchaseOrderSequence.upsert({
  where: { year },
  create: { year, last_number: 1 },
  update: { last_number: { increment: 1 } },
});
const ref = `BC-${year}-${String(seq.last_number).padStart(4, '0')}`;
```

Ne jamais générer ces références manuellement ou hors de ce mécanisme.

---

## 8. Communication frontend ↔ backend

Le frontend Next.js utilise des **rewrites** configurés dans `next.config.ts` :

```typescript
// next.config.ts
rewrites: async () => [{
  source: '/api/:path*',
  destination: 'http://localhost:5000/api/:path*',
}]
```

Cela permet d'appeler `/api/auth/login` côté frontend sans spécifier le port backend, et évite les problèmes CORS en développement.

Le client axios (`frontend/src/lib/apiClient.ts`) est configuré avec `withCredentials: true` pour transmettre automatiquement le cookie JWT.

---

## 9. Décisions architecturales

| Décision | Raison |
|----------|--------|
| JWT en cookie httpOnly | Inaccessible depuis JavaScript, protège contre XSS |
| `sameSite: strict` | Protection CSRF sans token supplémentaire |
| Soft deletes (`is_active`) | Préserve l'historique, les références d'audit restent valides |
| UUID comme PKs | Pas de séquence prédictible, compatible avec futur multi-tenant |
| Noms dénormalisés dans audit_logs | L'historique reste exact même après un renommage |
| Architecture Controller → Service → Repository | Séparation des responsabilités, testabilité |
| Séquences atomiques pour les références | Évite les doublons en cas de requêtes concurrentes |
| Polling 2min sur `/auth/me` | Détection rapide de désactivation de compte sans WebSocket |
