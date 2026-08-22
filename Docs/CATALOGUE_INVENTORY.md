# Gestion des produits — Catalogue et Inventaire

**Projet :** Stock Manager — ERP retail multi-établissements
**Stack :** Express + TypeScript + Prisma + PostgreSQL + Next.js 16
**Audience :** Développeurs reprenant ou maintenant le projet
**Date de rédaction :** 2026-04-30

---

## Table des matières

1. [Distinction fondamentale : Catalogue vs Inventaire](#1-distinction-fondamentale--catalogue-vs-inventaire)
2. [Category — Catégories de produits](#2-category--catégories-de-produits)
3. [Product — Catalogue produit](#3-product--catalogue-produit)
4. [Unités de mesure — champ `unit`](#4-unités-de-mesure--champ-unit)
5. [Inventory — Inventaire par établissement](#5-inventory--inventaire-par-établissement)
6. [Mouvements de stock](#6-mouvements-de-stock)
7. [Seuils de stock et alertes](#7-seuils-de-stock-et-alertes)
8. [Lien avec les fournisseurs — SupplierProduct](#8-lien-avec-les-fournisseurs--supplierproduct)
9. [Cycle de vie d'un produit](#9-cycle-de-vie-dun-produit)
10. [Règles d'accès (RBAC)](#10-règles-daccès-rbac)
11. [Roadmap — Ce qui reste à construire](#11-roadmap--ce-qui-reste-à-construire)

---

## 1. Distinction fondamentale : Catalogue vs Inventaire

Le système repose sur une séparation stricte entre deux couches de données produits. Confondre ces deux couches est la principale source d'erreurs d'implémentation.

### Catalogue — bibliothèque globale

Le catalogue contient **tous les produits qui existent dans le système**, indépendamment de l'endroit où ils sont stockés ou vendus. Un produit inscrit dans le catalogue appartient à l'entreprise entière. Il n'est rattaché à aucun établissement spécifique.

Le catalogue répond à la question : **"Quels produits notre entreprise connaît-elle ?"**

### Inventaire — réalité terrain par établissement

L'inventaire représente la **présence et la quantité d'un produit dans un établissement donné**. Pour chaque couple (établissement, produit), l'inventaire stocke : le stock disponible, le prix de vente local, et les seuils d'alerte.

L'inventaire répond à la question : **"Combien avons-nous de ce produit dans ce magasin, et à quel prix le vendons-nous ici ?"**

### Analogie

> Le catalogue est un livre de recettes — il liste tous les plats que l'entreprise sait faire. L'inventaire est le contenu réel du frigo de chaque cuisine — ce qui est physiquement présent, en quelle quantité, à quel endroit.

### Représentation en base de données

```
Product (catalogue global)
  id, sku, name, unit, price, category_id, is_active
        |
        | 1 produit → N lignes d'inventaire
        ↓
Inventory (par établissement)
  store_id, product_id, stock_physical, stock_reserved,
  selling_price, stock_min, stock_reorder
```

Un produit peut exister dans le catalogue sans être présent dans aucun inventaire (produit référencé, pas encore distribué). Inversement, un produit ne peut pas apparaître dans un inventaire sans exister dans le catalogue.

---

## 2. Category — Catégories de produits

### Structure du modèle

Les catégories organisent le catalogue en une hiérarchie à **deux niveaux maximum**, gérée via une auto-référence `parent_id`.

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (cuid) | Identifiant unique |
| `name` | `String` | Nom de la catégorie |
| `parent_id` | `String?` | Référence vers la catégorie parente (nullable) |

```prisma
model Category {
  id        String     @id @default(cuid())
  name      String
  parent_id String?
  parent    Category?  @relation("CategoryChildren", fields: [parent_id], references: [id])
  children  Category[] @relation("CategoryChildren")
  products  Product[]
}
```

### Hiérarchie et catégories feuilles

La hiérarchie à deux niveaux fonctionne ainsi : une catégorie sans `parent_id` est une **catégorie parente** (racine). Une catégorie avec un `parent_id` est une **sous-catégorie** (feuille).

```
Alimentation            ← catégorie parente (non sélectionnable)
├── Boissons            ← feuille (sélectionnable pour un produit)
└── Épicerie sèche      ← feuille (sélectionnable pour un produit)

Hygiène & Beauté        ← catégorie parente (non sélectionnable)
├── Soins du corps      ← feuille (sélectionnable pour un produit)
└── Parfumerie          ← feuille (sélectionnable pour un produit)
```

> **Règle critique :** Un produit ne peut être assigné qu'à une **catégorie feuille** (une catégorie sans enfants). Les catégories parentes servent uniquement au regroupement dans l'interface — elles ne peuvent pas être sélectionnées lors de la création ou de la modification d'un produit.

Vérification côté API avant d'assigner une catégorie à un produit :

```typescript
const category = await prisma.category.findUnique({
  where: { id: categoryId },
  include: { _count: { select: { children: true } } },
});

if (category._count.children > 0) {
  throw new Error("Cette catégorie a des sous-catégories. Sélectionnez une catégorie feuille.");
}
```

### Règles de suppression

La suppression des catégories est **physique** (pas de soft-delete). Elle est conditionnée à deux vérifications :

```typescript
const category = await prisma.category.findUnique({
  where: { id },
  include: {
    _count: { select: { products: true, children: true } },
  },
});

if (category._count.products > 0 || category._count.children > 0) {
  throw new Error("Impossible de supprimer une catégorie liée à des produits ou sous-catégories.");
}
```

| Condition | Suppression autorisée |
|---|---|
| Catégorie sans produits et sans enfants | Oui |
| Catégorie avec au moins un produit | Non |
| Catégorie parente avec au moins une sous-catégorie | Non |

> **Pas de soft-delete sur les catégories.** Les catégories sont des master data stables. Elles ne doivent pas être désactivées — elles doivent être supprimées (si orphelines) ou conservées.

---

## 3. Product — Catalogue produit

### Structure du modèle

| Champ | Type | Statut | Description |
|---|---|---|---|
| `id` | `String` (cuid) | Existant | Identifiant interne |
| `sku` | `String` | Existant | Identifiant universel — **immuable après création** |
| `name` | `String` | Existant | Nom du produit |
| `description` | `String?` | Existant | Description libre |
| `price` | `Decimal` | Existant | Prix de vente public de référence |
| `unit` | `String` (enum) | **A ajouter** | Unité de stock et de vente |
| `category_id` | `String` | Existant | Référence vers une catégorie feuille |
| `is_active` | `Boolean` | Existant | Soft-delete (false = désactivé) |
| `created_at` | `DateTime` | Existant | Date de création |
| `updated_at` | `DateTime` | Existant | Date de dernière modification |

### Règle sur le SKU

> **Le SKU est l'identifiant universel du produit dans tout le système.** Il est utilisé dans les commandes fournisseurs, les transferts inter-établissements, les inventaires et les rapports. **Il ne peut jamais être modifié après la création du produit.**

Le SKU doit être unique en base. Toute tentative de modification d'un SKU existant doit être rejetée avec une erreur explicite, indépendamment du rôle de l'utilisateur.

```typescript
// Interdire la modification du SKU dans le handler PATCH /products/:id
if (body.sku && body.sku !== existingProduct.sku) {
  throw new Error("Le SKU d'un produit est immuable et ne peut pas être modifié.");
}
```

### Règle sur le champ `price`

> **`Product.price` est le prix de vente public conseillé par l'entreprise.** Ce n'est PAS le prix d'achat fournisseur — celui-ci est stocké dans `SupplierProduct.purchase_price`. Un établissement peut choisir de vendre à un prix différent en définissant `Inventory.selling_price`.

### Soft-delete via `is_active`

Un produit ne doit jamais être supprimé physiquement. La désactivation (`is_active = false`) le rend invisible dans les nouvelles opérations (création de commandes, saisie d'inventaire) tout en le conservant dans l'historique des transactions passées.

---

## 4. Unités de mesure — champ `unit`

### Contexte

Le champ `unit` est à ajouter au modèle `Product`. Il représente l'**unité dans laquelle le stock est compté** et dans laquelle **le produit est vendu au client final**. Ce champ est distinct de l'unité de commande fournisseur.

### Valeurs supportées

| Valeur | Libellé | Usage typique |
|---|---|---|
| `PIECE` | Pièce | Produits unitaires (défaut) |
| `KG` | Kilogramme | Fruits, légumes, viandes au poids |
| `G` | Gramme | Épices, produits de précision |
| `L` | Litre | Huiles, jus en vrac |
| `CL` | Centilitre | Boissons en petite quantité |
| `ML` | Millilitre | Parfums, produits de beauté |
| `BOUTEILLE` | Bouteille | Boissons en bouteille |
| `SACHET` | Sachet | Condiments, produits emballés |
| `BOITE` | Boîte | Conserves, produits en boîte |

### Migration Prisma

```prisma
enum ProductUnit {
  PIECE
  KG
  G
  L
  CL
  ML
  BOUTEILLE
  SACHET
  BOITE
}

model Product {
  // ...champs existants...
  unit ProductUnit @default(PIECE)
}
```

### Distinction avec l'unité de commande fournisseur

Ces deux unités coexistent dans le système et ne doivent pas être confondues.

| Concept | Champ | Table | Exemple |
|---|---|---|---|
| Unité de stock / vente | `unit` | `Product` | Bouteille |
| Unité de commande fournisseur | `order_unit` | `SupplierProduct` | Carton de 12 |
| Facteur de conversion | `units_per_order` | `SupplierProduct` | 12 |

**Lecture :** on commande 1 carton au fournisseur → on réceptionne 12 bouteilles dans le stock.

Le détail du calcul de réception (cartons commandés → unités reçues) est documenté dans `SUPPLIER_ORDERS.md`.

---

## 5. Inventory — Inventaire par établissement

### Structure du modèle

La table `Inventory` est une **table de jointure enrichie** entre `Store` et `Product`. La clé primaire est composite : `(store_id, product_id)`.

| Champ | Type | Statut | Description |
|---|---|---|---|
| `store_id` | `String` | Existant | Référence vers l'établissement |
| `product_id` | `String` | Existant | Référence vers le produit du catalogue |
| `stock_physical` | `Decimal` | Existant | Quantité physiquement présente |
| `stock_reserved` | `Decimal` | Existant | Quantité réservée (commandes en cours) |
| `selling_price` | `Decimal?` | **A ajouter** | Prix de vente local (nullable) |
| `stock_min` | `Decimal?` | **A ajouter** | Seuil critique — alerte rouge |
| `stock_reorder` | `Decimal?` | **A ajouter** | Point de réapprovisionnement — alerte orange |

```prisma
model Inventory {
  store_id      String
  product_id    String
  stock_physical  Decimal @default(0)
  stock_reserved  Decimal @default(0)
  selling_price   Decimal?
  stock_min       Decimal?
  stock_reorder   Decimal?

  store   Store   @relation(fields: [store_id], references: [id])
  product Product @relation(fields: [product_id], references: [id])

  @@id([store_id, product_id])
}
```

### Calcul du prix affiché au client

La règle de priorité des prix est la suivante :

```
Prix affiché au client =
  Inventory.selling_price   (si défini pour cet établissement)
  sinon Product.price       (prix de référence du catalogue)
```

> **Règle de cascade des prix (Scénario C) :** Un établissement peut définir son propre prix de vente via `Inventory.selling_price`. Si ce champ est `null`, le système utilise automatiquement le `Product.price` comme prix de vente. Ne jamais afficher `null` au client — toujours résoudre la cascade avant l'affichage.

Implémentation côté service :

```typescript
function getEffectiveSellingPrice(inventory: Inventory, product: Product): Decimal {
  return inventory.selling_price ?? product.price;
}
```

### Calcul du stock disponible à la vente

```
stock_disponible = stock_physical - stock_reserved
```

Le `stock_reserved` correspond aux unités engagées dans des commandes clients en cours de traitement. Ces unités sont physiquement présentes en entrepôt mais ne sont plus disponibles à la vente. Elles ne sont libérées (décrémentées de `stock_reserved`) qu'à la livraison ou à l'annulation de la commande.

---

## 6. Mouvements de stock

Tout événement qui modifie `stock_physical` ou `stock_reserved` est un **mouvement de stock**. Chaque mouvement doit être tracé dans l'audit avec l'état avant et après.

### Tableau des événements

| Événement | Impact sur `stock_physical` | Déclencheur |
|---|---|---|
| Réception fournisseur confirmée | `+ quantité reçue` | `ReceptionItem` validé |
| Vente (Transaction `SALE`) | `- quantité vendue` | `TransactionItem` |
| Remboursement (Transaction `REFUND`) | `+ quantité remboursée` | `TransactionItem` |
| Transfert sortant confirmé | `- quantité transférée` | `TransferItem` (établissement source) |
| Transfert entrant confirmé | `+ quantité transférée` | `TransferItem` (établissement destination) |
| Ajustement manuel d'inventaire | `± valeur saisie` | Correction manuelle par SA |

> **Règle d'audit :** Tout mouvement de stock doit être tracé. L'entrée d'audit doit contenir : l'identifiant de l'inventaire concerné (`store_id + product_id`), le type d'événement, la quantité déplacée, le stock avant et le stock après, l'identifiant de l'utilisateur ayant déclenché l'opération, et le timestamp.

### Cas particulier : `stock_reserved`

Le `stock_reserved` est affecté par un cycle distinct :

| Événement | Impact sur `stock_reserved` |
|---|---|
| Création d'une commande client | `+ quantité commandée` |
| Livraison confirmée (décrément `stock_physical`) | `- quantité livrée` |
| Annulation de commande | `- quantité annulée` |

---

## 7. Seuils de stock et alertes

### Les deux seuils

Chaque ligne d'inventaire (`store_id × product_id`) peut définir deux seuils indépendants :

| Champ | Niveau d'alerte | Signification |
|---|---|---|
| `stock_reorder` | Orange — commande conseillée | Le stock est bas : il faut déclencher une commande fournisseur |
| `stock_min` | Rouge — critique | Le stock est dangereusement bas : la vente peut être compromise |

Les seuils sont **optionnels** (`nullable`). Si un seuil n'est pas défini pour une ligne d'inventaire, l'alerte correspondante n'est pas calculée pour ce produit dans cet établissement.

### Algorithme de calcul de l'état de stock

```
si stock_physical = 0
  → RUPTURE (noir)

sinon si stock_min est défini ET stock_physical < stock_min
  → CRITIQUE (rouge)

sinon si stock_reorder est défini ET stock_physical < stock_reorder
  → COMMANDE CONSEILLÉE (orange)

sinon
  → OK (vert)
```

Implémentation TypeScript :

```typescript
type StockStatus = "RUPTURE" | "CRITIQUE" | "COMMANDE_CONSEILLEE" | "OK";

function getStockStatus(inventory: Inventory): StockStatus {
  const { stock_physical, stock_min, stock_reorder } = inventory;

  if (stock_physical.equals(0)) return "RUPTURE";
  if (stock_min && stock_physical.lessThan(stock_min)) return "CRITIQUE";
  if (stock_reorder && stock_physical.lessThan(stock_reorder)) return "COMMANDE_CONSEILLEE";
  return "OK";
}
```

### Implémentation des alertes — pas de table persistante

> **Les alertes ne sont pas stockées en base.** Elles sont calculées en temps réel à chaque requête. Il n'existe pas de table `StockAlert` ou de job de calcul asynchrone.

Requête pour récupérer les produits en alerte dans un établissement :

```sql
SELECT
  i.store_id,
  i.product_id,
  p.name,
  p.sku,
  i.stock_physical,
  i.stock_min,
  i.stock_reorder
FROM "Inventory" i
JOIN "Product" p ON p.id = i.product_id
WHERE
  i.store_id = $1
  AND p.is_active = true
  AND (
    i.stock_physical = 0
    OR (i.stock_min IS NOT NULL AND i.stock_physical < i.stock_min)
    OR (i.stock_reorder IS NOT NULL AND i.stock_physical < i.stock_reorder)
  )
ORDER BY i.stock_physical ASC;
```

### Widget dashboard

Un widget sur le tableau de bord affiche le nombre de produits en alerte par établissement. Il est cliquable et redirige vers la vue inventaire filtrée sur les produits en alerte. La mise à jour est déclenchée à chaque chargement de page (pas de polling temps réel).

---

## 8. Lien avec les fournisseurs — SupplierProduct

La table `SupplierProduct` est le pont entre le catalogue produit et les fournisseurs. Elle ne fait pas partie du catalogue à proprement parler, mais s'y connecte directement.

### Ce qu'elle stocke

Pour chaque couple `(fournisseur, produit)`, `SupplierProduct` définit les **conditions d'achat spécifiques à ce fournisseur** :

| Champ | Description |
|---|---|
| `purchase_price` | Prix d'achat unitaire (par unité de commande) |
| `order_unit` | Unité dans laquelle le fournisseur livre (Carton, Pack, Palette…) |
| `units_per_order` | Nombre d'unités de stock par unité de commande |
| `is_preferred` | Indique si ce fournisseur est le fournisseur par défaut pour ce produit |

### Distinction avec `Product.price`

> **`Product.price` est le prix de vente public.** `SupplierProduct.purchase_price` est le coût d'achat. Ces deux valeurs ne doivent jamais être confondues.

La marge brute unitaire se calcule ainsi :

```
marge_brute = Product.price - SupplierProduct.purchase_price
```

Le détail complet du module fournisseurs (commandes, réceptions, calcul des quantités reçues) est documenté dans `SUPPLIER_ORDERS.md`.

---

## 9. Cycle de vie d'un produit

```
1. Création dans le catalogue
   → Saisie du SKU (immuable), du nom, de la catégorie feuille,
     de l'unité de mesure et du prix de vente conseillé

        ↓

2. Liaison avec les fournisseurs
   → Création d'une ou plusieurs entrées SupplierProduct
     (prix d'achat, unité de commande, facteur de conversion)
     Un fournisseur est marqué is_preferred = true

        ↓

3. Ajout à l'inventaire d'un établissement
   → Création d'une ligne Inventory (store_id × product_id)
     Définition optionnelle : selling_price, stock_min, stock_reorder

        ↓

4. Vie opérationnelle — mouvements de stock
   → Réceptions fournisseur : + stock_physical
   → Ventes : - stock_physical
   → Transferts entrants/sortants : ± stock_physical
   → Ajustements manuels : ± stock_physical

        ↓

5. Désactivation
   → is_active = false (soft delete)
   → Le produit disparaît des interfaces de création/saisie
   → Il reste présent dans l'historique des transactions passées
   → Réactivation possible par un SA à tout moment
```

> **Aucun produit ne doit jamais être supprimé physiquement de la base.** La désactivation est le seul mécanisme de retrait. La suppression physique briserait l'intégrité des historiques de vente, de commande et de transfert.

---

## 10. Règles d'accès (RBAC)

Les deux rôles impliqués dans la gestion du catalogue et de l'inventaire sont **SA** (Super Admin — niveau entreprise) et **Admin** (niveau établissement).

| Action | SA | Admin |
|---|---|---|
| Créer une catégorie | Oui | Non |
| Modifier une catégorie | Oui | Non |
| Supprimer une catégorie (si orpheline) | Oui | Non |
| Créer un produit dans le catalogue | Oui | Oui |
| Modifier les informations d'un produit | Oui | Oui |
| Modifier le SKU d'un produit | Non | Non |
| Désactiver un produit (`is_active = false`) | Oui | Non |
| Réactiver un produit (`is_active = true`) | Oui | Non |
| Ajouter un produit à l'inventaire d'un établissement | Oui | Oui (ses établissements) |
| Modifier les seuils et prix de vente en inventaire | Oui | Oui (ses établissements) |
| Effectuer un ajustement manuel de stock | Oui | Oui (ses établissements) |
| Consulter les alertes de stock | Oui (tous les établissements) | Oui (ses établissements) |

> **Règle SKU :** La modification d'un SKU est interdite pour tous les rôles sans exception. Cette contrainte doit être appliquée en base de données et au niveau de l'API — pas seulement dans l'interface.

---

## 11. Roadmap — Ce qui reste à construire

### Déjà en place

- Categories — CRUD complet (création, lecture, modification, suppression avec vérification)
- Products — CRUD complet avec `is_active` (soft delete)

### Migrations à effectuer

Les migrations suivantes sont requises avant de construire les modules listés ci-dessous.

**Migration 1 — Ajout du champ `unit` sur `Product` :**

```prisma
enum ProductUnit {
  PIECE
  KG
  G
  L
  CL
  ML
  BOUTEILLE
  SACHET
  BOITE
}

// Ajouter au modèle Product :
unit ProductUnit @default(PIECE)
```

**Migration 2 — Ajout des champs `selling_price`, `stock_min`, `stock_reorder` sur `Inventory` :**

```prisma
// Ajouter au modèle Inventory :
selling_price  Decimal?
stock_min      Decimal?
stock_reorder  Decimal?
```

### Modules à construire

| Module | Priorité | Description |
|---|---|---|
| Ajout champ `unit` sur Product | Haute | Migration + mise à jour du formulaire produit |
| Ajout des champs de seuil sur Inventory | Haute | Migration + interface de saisie par établissement |
| Module Inventaire | Haute | Interface de gestion de l'inventaire par établissement (stock, prix local, seuils) |
| Module Alertes | Moyenne | Widget dashboard affichant les produits en dessous des seuils |
| SupplierProduct | Haute | Liaison produit-fournisseur, prix d'achat, unités — détail dans `SUPPLIER_ORDERS.md` |

---

*Document maintenu dans `/Docs/`. Voir aussi : `SUPPLIER_ORDERS.md` pour le détail des commandes fournisseurs et du calcul des réceptions.*
