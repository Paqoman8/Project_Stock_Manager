# État du projet — Stock Manager

Document de référence pour reprendre le projet à n'importe quel stade.
Mis à jour au : **2026-05-04**

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Modules implémentés et complets](#2-modules-implémentés-et-complets)
3. [Modules dans le schéma — non implémentés](#3-modules-dans-le-schéma--non-implémentés)
4. [Modules à créer de zéro](#4-modules-à-créer-de-zéro)
5. [Architecture & conventions à respecter](#5-architecture--conventions-à-respecter)
6. [Infrastructure & outillage](#6-infrastructure--outillage)
7. [Roadmap et priorités](#7-roadmap-et-priorités)

---

## 1. Vue d'ensemble

**Nom :** Stock Manager
**Nature :** ERP multi-établissements (gestion de stock, commandes, inventaire)
**Objectif à terme :** SaaS multi-tenant facturé à l'abonnement mensuel
**État actuel :** MVP fonctionnel — 11 modules métier complets, 3 modules manquants avant le premier client

**Stack :**
| Couche | Technologie |
|--------|-------------|
| Backend | Node.js + Express 5, TypeScript, Prisma 7.8 (`@prisma/adapter-pg`), PostgreSQL 16 |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, Zod |
| Auth | JWT dans cookie httpOnly (`sameSite: strict`, 8h), bcrypt 12 rounds |
| Infra | Docker Compose (3 containers), Makefile, pg_dump pour backup |

**Accès par défaut (après `make setup`) :**
- Application : http://localhost:3000
- Identifiant : `super.admin` / Mot de passe : `Admin@2026!`
- Prisma Studio : `make studio` → http://localhost:5555

---

## 2. Modules implémentés et complets

### M01 — Authentification & Sessions

**Statut :** ✅ Complet

**Backend :**
- `backend/src/routes/authRoutes.ts`
- `backend/src/controllers/authController.ts`
- `backend/src/services/auth.service.ts`
- `backend/src/middlewares/authMiddleware.ts` — `verifyToken` : décode le cookie JWT, injecte `req.user`
- `backend/src/middlewares/roleMiddleware.ts` — `requireRole(...roles)` : RBAC par rôle

**Frontend :**
- `frontend/src/app/login/page.tsx` — formulaire avec sélection d'établissement
- `frontend/src/contexts/SessionContext.tsx` — polling `/api/auth/me` toutes les 2 min
- `frontend/src/lib/apiClient.ts` — client HTTP centralisé avec gestion d'erreurs

**Endpoints :**
- `POST /api/auth/login` — login, pose le cookie `auth_token`
- `POST /api/auth/logout` — clear du cookie
- `GET /api/auth/me` — session courante
- `GET /api/auth/stores` — liste des établissements accessibles pour le login

---

### M02 — Gestion des utilisateurs

**Statut :** ✅ Complet

**Backend :**
- `backend/src/routes/userRoutes.ts`
- `backend/src/controllers/userController.ts`
- `backend/src/services/user.service.ts`
- `backend/src/repositories/user.repository.ts`

**Frontend :**
- `frontend/src/app/dashboard/users/page.tsx`
- `frontend/src/components/users/UserFormModal.tsx`
- `frontend/src/components/users/DeactivateUserModal.tsx`
- `frontend/src/components/users/ReactivateUserModal.tsx`

**Accès :** SA + Admin (Admin ne peut pas gérer les SA ni créer un rôle supérieur au sien)

---

### M03 — Établissements (Stores)

**Statut :** ✅ Complet

**Backend :**
- `backend/src/routes/storeRoutes.ts`
- `backend/src/controllers/storeController.ts`
- `backend/src/services/store.service.ts`

**Frontend :** `frontend/src/app/dashboard/stores/page.tsx`

**Règles :** Hub Central (`id = 00000000-0000-0000-0000-000000000001`, `is_protected = true`) ne peut pas être supprimé ni fermé. Types : `MAGASIN / BOUTIQUE / ENTREPOT`. Statuts : `ACTIVE / CLOSED`.

---

### M04 — Catalogue produits

**Statut :** ✅ Complet (catégories + produits + formats de conditionnement)

**Backend :**
- `backend/src/routes/categoryRoutes.ts` + `backend/src/routes/productRoutes.ts`
- `backend/src/routes/packagingFormatRoutes.ts` (monté sous `/api/products/:productId/packaging-formats`)
- Controllers, services et repositories correspondants

**Frontend :** `frontend/src/app/dashboard/catalogue/page.tsx`

**Schéma :** `Category` (hiérarchique, `parent_id`), `Product` (SKU unique, 9 unités), `PackagingFormat` (label + `units_per_package` + `is_base_unit`).

---

### M05 — Fournisseurs

**Statut :** ✅ Complet

**Backend :**
- `backend/src/routes/supplierRoutes.ts` + `backend/src/routes/supplierProductRoutes.ts`
- `backend/src/controllers/supplierController.ts` + `supplierProductController.ts`
- Services et repositories correspondants

**Frontend :**
- `frontend/src/app/dashboard/suppliers/page.tsx`
- `frontend/src/app/dashboard/supplier-products/page.tsx`

**Accès :** SA uniquement

---

### M06 — Bons de commande

**Statut :** ✅ Complet

**Backend :**
- `backend/src/routes/purchaseOrderRoutes.ts`
- `backend/src/controllers/purchaseOrderController.ts`
- `backend/src/services/purchase_order.service.ts`
- `backend/src/repositories/purchase_order.repository.ts`

**Frontend :** `frontend/src/app/dashboard/purchase-orders/page.tsx`

**Workflow statuts :** `DRAFT → SENT → PARTIALLY_RECEIVED → RECEIVED / CANCELLED`
**Référence :** `BC-YYYY-XXXX` via séquence atomique (`PurchaseOrderSequence`, `upsert` PostgreSQL)
**Fermeture manuelle :** disponible pour passer à `RECEIVED` avant réception complète

---

### M07 — Réceptions de stock

**Statut :** ✅ Complet

**Backend :**
- `backend/src/routes/stockReceptionRoutes.ts`
- `backend/src/controllers/stockReceptionController.ts`
- `backend/src/services/stock_reception.service.ts`
- `backend/src/repositories/stock_reception.repository.ts`

**Frontend :** `frontend/src/app/dashboard/receptions/page.tsx`

**Workflow statuts :** `PENDING → CONFIRMED / CANCELLED`
**Effet de la confirmation :** crée automatiquement un `StockMovement` de type `RECEPTION`, met à jour `Inventory.stock_physical` et `InventoryBreakdown` si un format de conditionnement est renseigné.

---

### M08 — Factures fournisseurs

**Statut :** ✅ Complet

**Backend :**
- `backend/src/routes/supplierInvoiceRoutes.ts`
- `backend/src/controllers/supplierInvoiceController.ts`
- `backend/src/services/supplier_invoice.service.ts`
- `backend/src/repositories/supplier_invoice.repository.ts`

**Frontend :** `frontend/src/app/dashboard/invoices/page.tsx`

**Statuts :** `PENDING / PAID / OVERDUE / DISPUTED` — liées 1-1 à un bon de commande

---

### M09 — Inventaire (niveaux de stock)

**Statut :** ✅ Complet

**Backend :**
- `backend/src/routes/inventoryRoutes.ts` + `backend/src/routes/stockMovementRoutes.ts`
- Controllers, services et repositories correspondants

**Frontend :** `frontend/src/app/dashboard/inventory/page.tsx`

**Schéma :**
- `Inventory` — clé composite `(store_id, product_id)`, champs `stock_physical / stock_reserved / stock_min / stock_reorder`
- `InventoryBreakdown` — ventilation par format de conditionnement
- `StockMovement` — ledger immuable de toutes les modifications (types : `INITIAL / ADJUSTMENT_IN / ADJUSTMENT_OUT / RECEPTION`)

---

### M10 — Rapports d'inventaire

**Statut :** ✅ Complet

**Backend :**
- `backend/src/routes/inventoryReportRoutes.ts`
- `backend/src/controllers/inventoryReportController.ts`
- `backend/src/services/inventory_report.service.ts`
- `backend/src/repositories/inventory_report.repository.ts`

**Frontend :**
- `frontend/src/app/dashboard/inventory/reports/page.tsx`

**Workflow statuts :** `DRAFT → SUBMITTED → VALIDATED / REJECTED`
**Référence :** `INV-YYYY-XXXX` (séquence atomique `InventoryReportSequence`)
**Règle critique :** la validation applique les ajustements de stock de façon **irréversible** (`adjustments_applied_at` non nul = déjà appliqué, ne pas rejouer).

---

### M11 — Journal d'audit

**Statut :** ✅ Complet

**Backend :**
- `backend/src/routes/auditRoutes.ts`
- `backend/src/controllers/auditController.ts`
- `backend/src/services/audit.service.ts` — `logAction()` non-bloquant (fire & forget)

**Frontend :** `frontend/src/app/dashboard/audit/page.tsx`

**Accès :** SA voit toutes les entrées, Admin voit seulement les entrées de ses établissements.
**30+ types d'actions** définis dans l'enum `AuditAction` du schéma Prisma.

---

## 3. Modules dans le schéma — non implémentés

Ces modèles existent dans `backend/prisma/schema.prisma` et dans la base de données,
mais n'ont **aucun** fichier backend (routes/controller/service/repository) ni frontend associé.
Ce sont les premiers à implémenter.

---

### M12 — Transferts inter-établissements

**Priorité :** 1 (le plus simple à implémenter)
**Statut :** ⬜ Schéma OK — backend et frontend à créer

**Modèles Prisma existants :**
```prisma
model Transfer {
  id            String         // UUID
  from_store_id String         // Établissement source
  to_store_id   String         // Établissement destination
  status        TransferStatus // PENDING | DONE | CANCEL
  created_at    DateTime
  updated_at    DateTime
  items         TransferItem[]
}

model TransferItem {
  transfer_id String
  product_id  String
  qty         Int              // Quantité en unités de base
}
```

**Ce qu'il faut créer :**

Backend :
- `backend/src/routes/transferRoutes.ts`
- `backend/src/controllers/transferController.ts`
- `backend/src/services/transfer.service.ts`
- `backend/src/repositories/transfer.repository.ts`

Endpoints à implémenter :
```
POST   /api/transfers              — Créer un transfert (statut PENDING)
GET    /api/transfers              — Lister (filtré par store si Manager)
GET    /api/transfers/:id          — Détail avec items
PUT    /api/transfers/:id/confirm  — Confirmer (PENDING → DONE) : décrémente stock source, incrémente stock destination
PUT    /api/transfers/:id/cancel   — Annuler (PENDING → CANCEL)
```

Frontend :
- `frontend/src/app/dashboard/transfers/page.tsx`
- Ajouter le lien dans `frontend/src/components/layout/Sidebar.tsx`

Effets à implémenter dans `transfer.service.ts` lors de la confirmation :
1. Décrémenter `Inventory.stock_physical` sur `from_store_id` pour chaque item
2. Incrémenter `Inventory.stock_physical` sur `to_store_id` pour chaque item
3. Créer deux `StockMovement` : un `ADJUSTMENT_OUT` sur la source, un `ADJUSTMENT_IN` sur la destination
4. Appeler `logAction()` avec les nouvelles actions d'audit `TRANSFER_CREATED`, `TRANSFER_CONFIRMED`, `TRANSFER_CANCELLED` (à ajouter dans l'enum `AuditAction` du schéma Prisma)

**Accès :** SA + Admin peuvent créer ; Manager peut voir les transferts de son établissement

---

### M13 — Caisse / Point de Vente (POS)

**Priorité :** 2 (module le plus différenciant commercialement)
**Statut :** ⬜ Schéma partiel — à enrichir, backend et frontend à créer

**Modèles Prisma existants :**
```prisma
model Transaction {
  id           String
  store_id     String
  user_id      String
  type         TransactionType   // SALE | REFUND | EXPENSE
  total_amount Decimal
  created_at   DateTime
  items        TransactionItem[]
}

model TransactionItem {
  id             String
  transaction_id String
  product_id     String
  qty            Int
  price_at_sale  Decimal        // Dénormalisé au moment de la vente
}
```

**Enrichissements de schéma à prévoir avant d'implémenter :**
- Ajouter `payment_method` (CASH, CARD, MOBILE_MONEY…) sur `Transaction`
- Ajouter `packaging_format_id` sur `TransactionItem` (cohérence avec le reste du schéma)
- Ajouter les actions d'audit `TRANSACTION_CREATED`, `TRANSACTION_REFUNDED` dans l'enum

**Ce qu'il faut créer :**

Backend :
- `backend/src/routes/transactionRoutes.ts`
- `backend/src/controllers/transactionController.ts`
- `backend/src/services/transaction.service.ts`
- `backend/src/repositories/transaction.repository.ts`

Endpoints à implémenter :
```
POST  /api/transactions            — Enregistrer une vente/remboursement/dépense
GET   /api/transactions            — Historique (filtré par store + période)
GET   /api/transactions/:id        — Détail
GET   /api/transactions/summary    — Résumé du jour (total ventes, remboursements)
```

Effet de `POST /api/transactions` (type `SALE`) :
1. Décrémenter `Inventory.stock_physical` pour chaque item vendu
2. Créer un `StockMovement` de type `ADJUSTMENT_OUT` par item
3. Logger l'action dans l'audit

Frontend :
- `frontend/src/app/dashboard/pos/page.tsx` — interface caisse (grille produits + panier)
- `frontend/src/app/dashboard/pos/history/page.tsx` — historique des transactions
- Ajouter dans `Sidebar.tsx` (visible pour Caissier + Manager + Admin)

**Accès :** Caissier + Opérateur + Manager + Admin

---

## 4. Modules à créer de zéro

### M14 — Dashboard BI (tableaux de bord)

**Priorité :** 3
**Statut :** ⬜ Aucun fichier existant — à construire entièrement

**Pas de nouveau schéma nécessaire** — les données sont déjà en base.
Tout repose sur des agrégations SQL (via Prisma raw queries ou `groupBy`).

**Ce qu'il faut créer :**

Backend :
- `backend/src/routes/dashboardRoutes.ts`
- `backend/src/controllers/dashboardController.ts`
- `backend/src/services/dashboard.service.ts`

Endpoints à implémenter :
```
GET /api/dashboard/kpis              — Chiffres clés du jour/semaine/mois
GET /api/dashboard/stock-alerts      — Produits en-dessous du seuil stock_min
GET /api/dashboard/top-products      — Top produits vendus ou réceptionnés
GET /api/dashboard/purchase-trends   — Évolution des commandes fournisseurs
GET /api/dashboard/inventory-value   — Valeur totale du stock par établissement
```

Frontend :
- `frontend/src/app/dashboard/page.tsx` — la page dashboard existe mais est vide ; y intégrer les KPIs
- Composants de graphiques : envisager `recharts` (léger, compatible React 19) ou `chart.js`

**KPIs prioritaires :**
- Valeur totale du stock (par établissement)
- Nombre de produits en rupture ou sous le seuil minimum
- Commandes fournisseurs en attente de réception
- Nombre de ventes du jour (nécessite M13 — POS)
- Rapports d'inventaire en attente de validation

---

## 5. Architecture & conventions à respecter

**Tout nouvel agent doit lire cette section avant d'écrire du code.**

### 5.1 Structure backend

Le backend suit un pattern 4 couches strict :

```
routes/*.ts         → déclare les endpoints, applique les middlewares
controllers/*.ts    → parse req/res, appelle le service, renvoie la réponse HTTP
services/*.ts       → logique métier, appelle le repository, appelle logAction()
repositories/*.ts   → requêtes Prisma uniquement (zéro logique métier)
```

Ne jamais faire de requête Prisma dans un controller. Ne jamais faire de logique métier dans un repository.

### 5.2 Authentification et RBAC

Chaque route protégée utilise ces deux middlewares dans cet ordre :

```typescript
import { verifyToken } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';

router.get('/', verifyToken, requireRole('Super Administrateur', 'Administrateur'), controller.list);
```

`verifyToken` injecte `req.user` avec la structure :
```typescript
{ id: string, username: string, roleName: string, storeId: string }
```

`storeId` dans `req.user` est **toujours** l'établissement actif depuis le JWT (jamais un paramètre de la requête).

### 5.3 Audit

Chaque service appelle `logAction()` de façon **non-bloquante** (pas de `await`, pas de `try/catch`) :

```typescript
import { logAction } from './audit.service';

// Dans une fonction de service, après l'opération réussie :
logAction({
  actorId:    performedBy.id,
  actorName:  performedBy.username,
  action:     'TRANSFER_CONFIRMED',
  targetType: 'Transfer',
  targetId:   transfer.id,
  targetName: `Transfert ${transfer.id}`,
  storeId:    req.user.storeId,
  storeName:  storeName,
  ipAddress:  req.ip,
});
```

Pour un nouveau module, ajouter les nouvelles actions dans l'enum `AuditAction` du schéma Prisma et créer une migration.

### 5.4 Références atomiques (séquences)

Le pattern BC-YYYY-XXXX et INV-YYYY-XXXX utilise un `upsert` PostgreSQL avec `$executeRaw` pour garantir l'atomicité :

```typescript
// Exemple depuis purchase_order.service.ts
await prisma.$executeRaw`
  INSERT INTO purchase_order_sequences (year, last_seq)
  VALUES (${year}, 1)
  ON CONFLICT (year) DO UPDATE SET last_seq = purchase_order_sequences.last_seq + 1
`;
const seq = await prisma.purchaseOrderSequence.findUnique({ where: { year } });
const reference = `BC-${year}-${String(seq!.last_seq).padStart(4, '0')}`;
```

### 5.5 Connexion Prisma

Le client Prisma utilise l'adapter `@prisma/adapter-pg` avec `driverAdapters` preview feature. Ne pas instancier `PrismaClient` directement avec `new PrismaClient()` sans l'adapter.

```typescript
// backend/src/config/database.ts — utiliser ce fichier pour accéder à prisma
import { prisma } from '../config/database';
```

### 5.6 Frontend — conventions

**Client API :** toujours utiliser `apiClient.ts`, jamais `fetch` directement.

```typescript
import { apiClient } from '@/lib/apiClient';

const response = await apiClient.get('/api/transfers');
const data = await apiClient.post('/api/transfers', { body: payload });
```

**Session :** utiliser `useSession()` du `SessionContext` pour accéder à l'utilisateur courant.

```typescript
const { user, isLoading } = useSession();
// user.roleName — pour les conditions d'accès dans le JSX
```

**Routing :** App Router Next.js 16. Toutes les pages sont dans `frontend/src/app/dashboard/`.
Chaque nouvelle page doit s'intégrer dans `Sidebar.tsx` avec le bon contrôle d'accès par rôle.

**Rôles utilisables dans la Sidebar :**
```typescript
const ROLES_ADMIN: readonly string[] = ['Super Administrateur', 'Administrateur'];
const ROLE_SA = 'Super Administrateur';
const ROLES_AGENT: readonly string[] = ['Manager Magasin', 'Opérateur'];
```

### 5.7 Schéma Prisma — règles

- Tout modèle utilise `gen_random_uuid()` comme valeur par défaut d'ID (`@db.Uuid`)
- Les noms de tables sont en snake_case via `@@map("nom_table")`
- Les champs dénormalisés (noms, prix) doivent rester en base pour l'historique (ne jamais les recalculer dynamiquement)
- Après tout ajout dans le schéma : `npx prisma migrate dev --name <description>` en dev, `npx prisma migrate deploy` en production Docker

---

## 6. Infrastructure & outillage

### 6.1 Démarrage

```bash
make setup      # Premier lancement (build + migrations + seed)
make start      # Démarrage sans rebuild
make stop       # Arrêt (données conservées)
make rebuild    # Après modification du code
```

### 6.2 Commandes utiles

```bash
make studio         # Prisma Studio → http://localhost:5555
make shell          # Shell dans le container backend
make db-shell       # psql interactif
make backup         # Sauvegarde → backups/backup_YYYYMMDD_HHMMSS.sql
make restore FILE=  # Restauration (nettoie le schéma avant de restaurer)
make db-reset       # Reset DB seule (migrations + seed, sans rebuild)
make health         # Vérifier que l'API répond
make logs           # Logs en temps réel
```

### 6.3 Point d'attention Docker critique

`BACKEND_URL` dans le `docker-compose.yml` **doit** être un ARG de build (pas une variable d'environnement runtime). Next.js sérialise les rewrites dans `.next/routes-manifest.json` au moment du `next build`. Si `BACKEND_URL` n'est pas disponible au build, le frontend proxifiera vers `localhost:5001` au lieu de `backend:5001`.

```yaml
frontend:
  build:
    args:
      BACKEND_URL: http://backend:5001   # ✅ build ARG
  # environment:
  #   BACKEND_URL: http://backend:5001  # ❌ trop tard — runtime seulement
```

### 6.4 Seed

Le seed (`backend/prisma/seed.ts`) est idempotent. Il crée/vérifie :
1. Les 5 rôles : `Super Administrateur`, `Administrateur`, `Manager Magasin`, `Opérateur`, `Caissier`
2. Le Hub Central (`id = 00000000-0000-0000-0000-000000000001`, `is_protected = true`)
3. Le compte `super.admin` / `Admin@2026!`

Le bloc de création des catégories est présent mais **commenté** dans le seed. À décommenter ou enrichir si nécessaire.

---

## 7. Roadmap et priorités

### Phase 1 — Compléter le MVP (0–3 mois)

| Ordre | Module | Complexité | Fichiers à créer |
|-------|--------|------------|-----------------|
| 1 | **Transferts inter-établissements** (M12) | Faible | 4 backend + 1 page frontend |
| 2 | **Caisse / POS** (M13) | Moyenne | 4 backend + 2 pages frontend + enrichissement schéma |
| 3 | **Dashboard BI** (M14) | Moyenne | 3 backend + refonte page dashboard |

### Phase 2 — Préparation SaaS (3–9 mois)

- Architecture multi-tenant (isolation des données par organisation)
- Intégration Stripe (abonnements, gestion des plans)
- Système d'invitation (onboarding client autonome)
- API publique + webhooks

### Phase 3 — Scale (9–18 mois)

- Mobile (React Native ou PWA)
- Intégrations externes (comptabilité, e-commerce)
- Rapports avancés exportables (PDF, Excel)
- Open Core éventuel si communauté suffisante

### Modèles tarifaires cibles

| Plan | Prix | Limites |
|------|------|---------|
| Starter | ~49 €/mois | 1 établissement, 5 utilisateurs |
| Business | ~129 €/mois | 5 établissements, 20 utilisateurs |
| Enterprise | ~299 €/mois | Illimité + SLA |

**Objectif 24 mois :** 50 clients = ~6 000 €/mois MRR

### Décisions en suspens (à trancher avant la landing page)

1. **Marché géographique :** France seule, Afrique francophone, ou les deux
2. **Nom de domaine :** "Stock Manager" est trop générique — envisager un nom plus distinctif
3. **Langue de l'interface :** français uniquement ou multi-langue dès le départ

---

## Annexe — État des fichiers par module

### Backend — routes enregistrées dans `server.ts`

```
GET  /api/health                          ← route de santé
     /api/auth                            ← M01
     /api/users                           ← M02
     /api/roles                           ← M02 (lecture seule)
     /api/audit                           ← M11
     /api/stores                          ← M03
     /api/suppliers                       ← M05
     /api/supplier-products               ← M05
     /api/categories                      ← M04
     /api/products                        ← M04
     /api/products/:id/packaging-formats  ← M04
     /api/purchase-orders                 ← M06
     /api/receptions                      ← M07
     /api/invoices                        ← M08
     /api/inventory                       ← M09
     /api/stock-movements                 ← M09
     /api/inventory-reports               ← M10

❌ MANQUANT : /api/transfers             ← M12 (à créer)
❌ MANQUANT : /api/transactions          ← M13 (à créer)
❌ MANQUANT : /api/dashboard             ← M14 (à créer)
```

### Frontend — pages existantes

```
/login                          ← M01
/dashboard                      ← vide (à remplir M14)
/dashboard/users                ← M02
/dashboard/stores               ← M03
/dashboard/catalogue            ← M04
/dashboard/suppliers            ← M05
/dashboard/supplier-products    ← M05
/dashboard/purchase-orders      ← M06
/dashboard/receptions           ← M07
/dashboard/invoices             ← M08
/dashboard/inventory            ← M09
/dashboard/inventory/reports    ← M10
/dashboard/audit                ← M11

❌ MANQUANT : /dashboard/transfers       ← M12 (à créer)
❌ MANQUANT : /dashboard/pos             ← M13 (à créer)
❌ MANQUANT : /dashboard/pos/history     ← M13 (à créer)
```
