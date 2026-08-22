# Gestion des commandes fournisseurs — Stock Manager

**Statut :** Spécification — à implémenter
**Dernière mise à jour :** 2026-04-30
**Module :** Approvisionnement (`/api/suppliers/orders`, `/api/receptions`, `/api/invoices`)

---

## Sommaire

1. [Vue d'ensemble du flux](#1-vue-densemble-du-flux)
2. [SupplierProduct — Catalogue fournisseur](#2-supplierproduct--catalogue-fournisseur)
3. [PurchaseOrder — Bon de commande](#3-purchaseorder--bon-de-commande)
4. [PurchaseOrderItem — Lignes de commande](#4-purchaseorderitem--lignes-de-commande)
5. [StockReception — Réception physique](#5-stockreception--réception-physique)
6. [ReceptionItem — Lignes de réception](#6-receptionitem--lignes-de-réception)
7. [Transfert initié depuis une réception](#7-transfert-initié-depuis-une-réception)
8. [SupplierInvoice — Facture fournisseur](#8-supplierinvoice--facture-fournisseur)
9. [Schéma Prisma complet](#9-schéma-prisma-complet)
10. [Actions d'audit](#10-actions-daudit)
11. [Règles d'accès RBAC](#11-règles-daccès-rbac)
12. [Points de décision et état ouvert](#12-points-de-décision-et-état-ouvert)

---

## 1. Vue d'ensemble du flux

Le cycle d'approvisionnement suit une séquence linéaire de bout en bout, depuis le catalogue négocié avec un fournisseur jusqu'au paiement de sa facture.

```
Catalogue fournisseur (SupplierProduct)
          │
          │  Conditions négociées : prix, unité, quantité min
          ▼
  Bon de commande (PurchaseOrder)
          │
          │  Référence snapshot des conditions au moment de l'achat
          ▼
  Réception physique (StockReception)
          │
          ├──────────────────────────────────────┐
          │                                      │
          ▼                                      ▼
  Stock mis à jour                   Transfert initié
  (Inventory.stock_physical ++)      si dépassement de capacité
                                     (Transfer)
          │
          ▼
  Facture fournisseur (SupplierInvoice)
```

**Entités impliquées :**

| Entité | Rôle | Statut dans le schéma |
|---|---|---|
| `Supplier` | Référentiel fournisseur | Existe dans `schema.prisma` |
| `SupplierProduct` | Catalogue et conditions négociées | **A créer** |
| `PurchaseOrder` | Bon de commande | **A créer** |
| `PurchaseOrderItem` | Lignes du bon de commande | **A créer** |
| `StockReception` | Réception physique des marchandises | **A créer** |
| `ReceptionItem` | Lignes de réception | **A créer** |
| `Transfer` | Transfert inter-établissements | Existe |
| `SupplierInvoice` | Facture fournisseur | **A créer** |

---

## 2. SupplierProduct — Catalogue fournisseur

### Rôle

`SupplierProduct` est la table de liaison entre un `Supplier` et un `Product`. Elle ne représente **pas** une commande — elle représente les **conditions commerciales négociées** avec un fournisseur pour un produit donné : prix d'achat, unité de livraison, seuil minimum.

### Distinction des prix

> **Règle critique — trois niveaux de prix distincts :**
>
> - `SupplierProduct.purchase_price` = prix payé **au fournisseur** par unité de commande
> - `Product.price` = prix de référence **catalogue de vente**
> - `Inventory.selling_price` (Scénario C) = prix de vente **effectif par établissement**
>
> Ces trois valeurs sont indépendantes et ne doivent jamais être confondues.

### Champs

| Champ | Type | Description |
|---|---|---|
| `supplier_id` | UUID (FK) | Fournisseur |
| `product_id` | UUID (FK) | Produit concerné |
| `purchase_price` | Decimal(10,2) | Prix d'une unité de commande (ex : prix d'un carton) |
| `order_unit` | String | Libellé de l'unité de commande (ex : "Carton", "Pack", "Palette") |
| `units_per_order` | Int | Facteur de conversion — unités de stock dans 1 unité de commande (ex : 24 pour 1 carton = 24 bouteilles) |
| `min_order_qty` | Int | Quantité minimum commandable en unités de commande |
| `is_preferred` | Boolean | Fournisseur préféré pour ce produit — **un seul `true` par produit** |
| `supplier_reference` | String? | Référence du produit dans le catalogue du fournisseur |
| `is_active` | Boolean | Permet de désactiver une relation sans la supprimer |
| `created_at` | DateTime | Date de création |
| `updated_at` | DateTime | Date de dernière modification |

**Clé primaire composite :** `[supplier_id, product_id]`

### Règle métier — fournisseur préféré

Un produit peut avoir plusieurs fournisseurs actifs, mais **un seul** peut avoir `is_preferred = true`.

> **Lors du passage d'un produit à `is_preferred = true`, le service doit en une seule transaction :**
> 1. Mettre `is_preferred = false` sur toutes les autres lignes `SupplierProduct` du même `product_id`
> 2. Puis mettre `is_preferred = true` sur la ligne cible

Cette opération doit être atomique (transaction Prisma). Ne jamais faire les deux mises à jour séparément.

---

## 3. PurchaseOrder — Bon de commande

### Rôle

Représente une commande officielle passée à un fournisseur, destinée à **un établissement précis** connu dès la création.

### Champs

| Champ | Type | Description |
|---|---|---|
| `id` | UUID | Identifiant interne |
| `reference` | String (unique) | Numéro lisible auto-généré (ex : `BC-2026-0042`) |
| `supplier_id` | UUID (FK) | Fournisseur ciblé |
| `destination_store_id` | UUID (FK) | Etablissement récepteur — fixé à la création |
| `status` | Enum | Voir statuts ci-dessous |
| `ordered_at` | DateTime | Date de création du bon de commande |
| `expected_at` | DateTime? | Date de livraison prévue (optionnelle) |
| `notes` | String? | Observations libres |
| `created_by` | UUID (FK) | Utilisateur auteur de la commande |
| `created_at` | DateTime | Horodatage de création |
| `updated_at` | DateTime | Horodatage de dernière modification |

### Génération de la référence

Le format `BC-YYYY-XXXX` doit être généré côté service au moment de la création, avec padding sur 4 chiffres et remise à zéro chaque année civile. Exemple : `BC-2026-0001`.

### Statuts et transitions autorisées

```
DRAFT ──────────► SENT ──────────► PARTIALLY_RECEIVED ──► RECEIVED
  │                 │
  └──► CANCELLED ◄──┘
```

| Transition | Déclencheur |
|---|---|
| `DRAFT → SENT` | Envoi manuel au fournisseur (action utilisateur) |
| `SENT → PARTIALLY_RECEIVED` | Première réception confirmée ne couvrant pas toutes les lignes |
| `SENT → RECEIVED` | Réception confirmée couvrant 100 % des quantités commandées |
| `PARTIALLY_RECEIVED → RECEIVED` | Réception complémentaire couvrant le solde |
| `DRAFT → CANCELLED` | Annulation avant envoi |
| `SENT → CANCELLED` | Annulation après envoi (avant toute réception) |

> **Aucun retour en arrière n'est autorisé.** Un bon de commande en statut `RECEIVED` ou `CANCELLED` est figé.

---

## 4. PurchaseOrderItem — Lignes de commande

### Rôle

Une ligne par produit dans le bon de commande. Les conditions commerciales sont **dénormalisées** au moment de la création de la ligne.

### Champs

| Champ | Type | Description |
|---|---|---|
| `id` | UUID | Identifiant |
| `purchase_order_id` | UUID (FK) | Bon de commande parent |
| `product_id` | UUID (FK) | Produit commandé |
| `supplier_product_id` | UUID (FK) | Snapshot de la relation catalogue utilisée |
| `ordered_qty` | Int | Quantité commandée **en unités de commande** (ex : 5 cartons) |
| `unit_price` | Decimal(10,2) | Prix unitaire au moment de la commande — copie de `SupplierProduct.purchase_price` |
| `order_unit` | String | Unité de commande au moment de la commande — copie de `SupplierProduct.order_unit` |
| `units_per_order` | Int | Facteur de conversion au moment de la commande — copie de `SupplierProduct.units_per_order` |

### Pourquoi dénormaliser

> **Règle fondamentale :** Un bon de commande est un document figé. Si le prix fournisseur ou l'unité de livraison change après l'émission de la commande, **les lignes de commande existantes ne doivent pas changer**. La dénormalisation garantit que la commande reflète les conditions réelles au moment de l'achat, pour des raisons comptables et d'audit.

### Calcul du total de la ligne

```
total_ligne = ordered_qty × unit_price
```

### Calcul des unités de stock attendues

```
stock_units_expected = ordered_qty × units_per_order
```

Exemple : 5 cartons × 24 bouteilles/carton = **120 bouteilles** attendues en stock.

---

## 5. StockReception — Réception physique

### Rôle

Représente l'arrivée physique de marchandises pour un bon de commande. Une commande peut générer **plusieurs réceptions** en cas de livraisons partielles successives.

### Champs

| Champ | Type | Description |
|---|---|---|
| `id` | UUID | Identifiant |
| `purchase_order_id` | UUID (FK) | Bon de commande associé |
| `received_at` | DateTime | Date effective de réception physique |
| `received_by` | UUID (FK) | Utilisateur ayant enregistré la réception |
| `status` | Enum | `PENDING` ou `CONFIRMED` |
| `notes` | String? | Observations (ex : "Carton endommagé", "Manque 2 unités") |
| `created_at` | DateTime | Horodatage de création |

### Processus en deux temps

```
1. SAISIE (status = PENDING)
   └─ L'utilisateur renseigne les quantités réellement reçues
   └─ Aucun impact sur le stock à ce stade

2. CONFIRMATION (status = CONFIRMED)
   └─ Impact sur l'Inventory (stock_physical mis à jour)
   └─ Statut du PurchaseOrder mis à jour
   └─ AuditLog STOCK_RECEPTION_CONFIRMED créé
   └─ Option : initiation d'un ou plusieurs transferts
```

> **Une réception confirmée est irréversible.** L'impact sur le stock est définitif. Toute correction passe par un ajustement d'inventaire distinct.

---

## 6. ReceptionItem — Lignes de réception

### Rôle

Une ligne par produit reçu dans cette réception. Liée à la ligne de commande correspondante pour permettre le suivi des quantités reçues vs commandées.

### Champs

| Champ | Type | Description |
|---|---|---|
| `id` | UUID | Identifiant |
| `reception_id` | UUID (FK) | Réception parente |
| `product_id` | UUID (FK) | Produit reçu |
| `purchase_order_item_id` | UUID (FK) | Ligne de commande correspondante |
| `received_qty` | Int | Quantité réellement reçue **en unités de commande** |
| `stock_units_added` | Int | Calculé : `received_qty × units_per_order` — unités ajoutées à l'inventaire |

### Actions à la confirmation de la réception

Toutes ces opérations doivent être exécutées dans une **seule transaction Prisma** :

```typescript
// Pseudo-code — logique de confirmation
await prisma.$transaction(async (tx) => {

  for (const item of receptionItems) {
    // 1. Incrémenter le stock physique de l'établissement destinataire
    await tx.inventory.upsert({
      where: { store_id_product_id: { store_id: destinationStoreId, product_id: item.product_id } },
      update: { stock_physical: { increment: item.stock_units_added } },
      create: { store_id: destinationStoreId, product_id: item.product_id, stock_physical: item.stock_units_added }
    });
  }

  // 2. Mettre à jour le statut de la réception
  await tx.stockReception.update({ where: { id: receptionId }, data: { status: 'CONFIRMED' } });

  // 3. Recalculer et mettre à jour le statut du PurchaseOrder
  const newOrderStatus = allItemsFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
  await tx.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: newOrderStatus } });

  // 4. Créer l'AuditLog
  await tx.auditLog.create({ data: { action: 'STOCK_RECEPTION_CONFIRMED', ... } });

});
```

### Calcul de complétude d'une commande

Pour déterminer si le statut doit passer à `RECEIVED` ou `PARTIALLY_RECEIVED`, le service compare pour chaque ligne de commande :

```
quantité_totale_reçue = somme des received_qty × units_per_order sur toutes les réceptions CONFIRMED liées

Si quantité_totale_reçue >= ordered_qty × units_per_order pour TOUTES les lignes → RECEIVED
Sinon → PARTIALLY_RECEIVED
```

---

## 7. Transfert initié depuis une réception

### Cas d'usage

Lors de la confirmation d'une réception, si l'établissement récepteur ne peut pas absorber la totalité des marchandises (capacité de stockage insuffisante, surstock), l'utilisateur peut initier **directement depuis l'écran de réception** un ou plusieurs transferts vers d'autres établissements.

### Logique

```
Réception confirmée sur store A
       │
       ├── stock_physical de A ++ (stock reçu en totalité)
       │
       └── Transfert initié : from_store_id = A, to_store_id = B
                   │
                   └── stock_physical de A -- / stock_physical de B ++
                       (quand le transfert passe en DONE)
```

### Traçabilité

Le transfert créé depuis une réception doit porter dans son champ `metadata` (JSON) :

```json
{
  "source": "reception",
  "reception_id": "<uuid de la réception>",
  "purchase_order_id": "<uuid du bon de commande>"
}
```

> Ce marquage est essentiel pour la traçabilité : il permet de retrouver, depuis une commande, l'ensemble des transferts induits par sa réception, et d'expliquer pourquoi le stock d'un établissement source a baissé immédiatement après une réception.

### Flux de stock complet avec transfert

```
Avant confirmation :
  Store A : stock = 100
  Store B : stock = 50

Réception confirmée : 60 unités sur Store A
  Store A : stock = 160

Transfert de 40 unités initié A → B (status PENDING)
  (aucun impact immédiat sur les stocks)

Transfert passé en DONE
  Store A : stock = 120
  Store B : stock = 90
```

---

## 8. SupplierInvoice — Facture fournisseur

### Rôle

Enregistre la facture émise par le fournisseur à la suite d'une livraison. Peut être liée à une réception spécifique ou couvrir plusieurs réceptions (facturation en fin de période selon les conditions du fournisseur).

### Champs

| Champ | Type | Description |
|---|---|---|
| `id` | UUID | Identifiant |
| `purchase_order_id` | UUID (FK) | Bon de commande associé |
| `reception_id` | UUID (FK)? | Réception spécifique concernée (optionnel) |
| `invoice_number` | String | Référence de la facture **chez le fournisseur** |
| `amount` | Decimal(10,2) | Montant total facturé (peut différer du total PO si livraison partielle) |
| `issued_at` | DateTime | Date d'émission de la facture |
| `due_at` | DateTime | Date d'échéance — calculée depuis `Supplier.payment_terms` |
| `status` | Enum | `PENDING`, `PAID`, `OVERDUE`, `DISPUTED` |
| `paid_at` | DateTime? | Date de paiement effectif |
| `created_at` | DateTime | Horodatage de création |
| `updated_at` | DateTime | Horodatage de dernière modification |

### Calcul de la date d'échéance

La date d'échéance est calculée automatiquement à la création de la facture en fonction des `payment_terms` du fournisseur (définis sur `Supplier`) :

| `PaymentTerms` | Calcul |
|---|---|
| `IMMEDIATE` | `issued_at` |
| `NET30` | `issued_at + 30 jours` |
| `NET60` | `issued_at + 60 jours` |
| `NET90` | `issued_at + 90 jours` |

### Transitions de statut

| Transition | Déclencheur |
|---|---|
| `PENDING → PAID` | Enregistrement du paiement effectif |
| `PENDING → OVERDUE` | Job planifié : `due_at < now()` et statut encore `PENDING` |
| `PENDING → DISPUTED` | Litige signalé manuellement |
| `DISPUTED → PENDING` | Litige résolu |
| `OVERDUE → PAID` | Paiement tardif enregistré |

> **Les factures sont des données financières sensibles.** L'accès à la création, la modification et la consultation des factures est réservé au rôle `SA` (Super Admin). Voir section [Règles d'accès RBAC](#11-règles-daccès-rbac).

---

## 9. Schéma Prisma complet

Les modèles ci-dessous sont à **ajouter** au fichier `backend/prisma/schema.prisma` existant. Le modèle `Supplier` et l'enum `PaymentTerms` existent déjà — ne pas les redéclarer.

### Enums à ajouter

```prisma
enum PurchaseOrderStatus {
  DRAFT
  SENT
  PARTIALLY_RECEIVED
  RECEIVED
  CANCELLED
}

enum ReceptionStatus {
  PENDING
  CONFIRMED
}

enum InvoiceStatus {
  PENDING
  PAID
  OVERDUE
  DISPUTED
}
```

### Modèles à ajouter

```prisma
// ---------------------------------------------------------------------------
// Catalogue fournisseur — conditions négociées par produit
// ---------------------------------------------------------------------------

model SupplierProduct {
  supplier_id        String    @db.Uuid
  product_id         String    @db.Uuid
  purchase_price     Decimal   @db.Decimal(10, 2)
  order_unit         String
  units_per_order    Int
  min_order_qty      Int       @default(1)
  is_preferred       Boolean   @default(false)
  supplier_reference String?
  is_active          Boolean   @default(true)
  created_at         DateTime  @default(now())
  updated_at         DateTime  @updatedAt

  supplier           Supplier  @relation(fields: [supplier_id], references: [id])
  product            Product   @relation(fields: [product_id], references: [id])
  order_items        PurchaseOrderItem[]

  @@id([supplier_id, product_id])
  @@map("supplier_products")
}

// ---------------------------------------------------------------------------
// Bon de commande fournisseur
// ---------------------------------------------------------------------------

model PurchaseOrder {
  id                   String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  reference            String              @unique
  supplier_id          String              @db.Uuid
  destination_store_id String              @db.Uuid
  status               PurchaseOrderStatus @default(DRAFT)
  ordered_at           DateTime            @default(now())
  expected_at          DateTime?
  notes                String?
  created_by           String              @db.Uuid
  created_at           DateTime            @default(now())
  updated_at           DateTime            @updatedAt

  supplier             Supplier            @relation(fields: [supplier_id], references: [id])
  destination_store    Store               @relation(fields: [destination_store_id], references: [id])
  creator              User                @relation(fields: [created_by], references: [id])
  items                PurchaseOrderItem[]
  receptions           StockReception[]
  invoices             SupplierInvoice[]

  @@map("purchase_orders")
}

// ---------------------------------------------------------------------------
// Lignes du bon de commande — snapshot des conditions au moment de l'achat
// ---------------------------------------------------------------------------

model PurchaseOrderItem {
  id                  String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  purchase_order_id   String          @db.Uuid
  product_id          String          @db.Uuid
  supplier_product_id String          @db.Uuid
  ordered_qty         Int
  unit_price          Decimal         @db.Decimal(10, 2)
  order_unit          String
  units_per_order     Int

  purchase_order      PurchaseOrder   @relation(fields: [purchase_order_id], references: [id], onDelete: Cascade)
  product             Product         @relation(fields: [product_id], references: [id])
  supplier_product    SupplierProduct @relation(fields: [supplier_product_id], references: [supplier_id, product_id])
  reception_items     ReceptionItem[]

  @@map("purchase_order_items")
}

// ---------------------------------------------------------------------------
// Réception physique des marchandises
// ---------------------------------------------------------------------------

model StockReception {
  id                String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  purchase_order_id String         @db.Uuid
  received_at       DateTime
  received_by       String         @db.Uuid
  status            ReceptionStatus @default(PENDING)
  notes             String?
  created_at        DateTime       @default(now())

  purchase_order    PurchaseOrder  @relation(fields: [purchase_order_id], references: [id])
  receiver          User           @relation(fields: [received_by], references: [id])
  items             ReceptionItem[]
  invoices          SupplierInvoice[]

  @@map("stock_receptions")
}

// ---------------------------------------------------------------------------
// Lignes de réception
// ---------------------------------------------------------------------------

model ReceptionItem {
  id                      String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  reception_id            String            @db.Uuid
  product_id              String            @db.Uuid
  purchase_order_item_id  String            @db.Uuid
  received_qty            Int
  stock_units_added       Int

  reception               StockReception    @relation(fields: [reception_id], references: [id], onDelete: Cascade)
  product                 Product           @relation(fields: [product_id], references: [id])
  purchase_order_item     PurchaseOrderItem @relation(fields: [purchase_order_item_id], references: [id])

  @@map("reception_items")
}

// ---------------------------------------------------------------------------
// Facture fournisseur
// ---------------------------------------------------------------------------

model SupplierInvoice {
  id                String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  purchase_order_id String        @db.Uuid
  reception_id      String?       @db.Uuid
  invoice_number    String
  amount            Decimal       @db.Decimal(10, 2)
  issued_at         DateTime
  due_at            DateTime
  status            InvoiceStatus @default(PENDING)
  paid_at           DateTime?
  created_at        DateTime      @default(now())
  updated_at        DateTime      @updatedAt

  purchase_order    PurchaseOrder  @relation(fields: [purchase_order_id], references: [id])
  reception         StockReception? @relation(fields: [reception_id], references: [id])

  @@map("supplier_invoices")
}
```

### Relations à ajouter sur les modèles existants

Les modèles `Supplier`, `Store`, `User` et `Product` doivent être mis à jour pour exposer les nouvelles relations :

```prisma
// Sur Supplier — ajouter :
supplier_products SupplierProduct[]
purchase_orders   PurchaseOrder[]

// Sur Store — ajouter :
purchase_orders   PurchaseOrder[]   @relation("PurchaseOrderDestination")

// Sur User — ajouter :
purchase_orders   PurchaseOrder[]
receptions        StockReception[]

// Sur Product — ajouter :
supplier_products   SupplierProduct[]
purchase_order_items PurchaseOrderItem[]
reception_items     ReceptionItem[]
```

---

## 10. Actions d'audit

Les actions suivantes sont à ajouter à l'enum `AuditAction` dans `schema.prisma` :

```prisma
// Gestion des commandes fournisseurs
PURCHASE_ORDER_CREATED
PURCHASE_ORDER_SENT
PURCHASE_ORDER_CANCELLED

// Gestion des réceptions
STOCK_RECEPTION_CONFIRMED

// Transferts issus d'une réception
STOCK_TRANSFER_FROM_RECEPTION

// Gestion des factures fournisseurs
SUPPLIER_INVOICE_CREATED
SUPPLIER_INVOICE_PAID
```

### Détail des métadonnées par action

| Action | `target_type` | Contenu `metadata` attendu |
|---|---|---|
| `PURCHASE_ORDER_CREATED` | `PurchaseOrder` | `{ reference, supplier_name, destination_store, items_count }` |
| `PURCHASE_ORDER_SENT` | `PurchaseOrder` | `{ reference, supplier_name }` |
| `PURCHASE_ORDER_CANCELLED` | `PurchaseOrder` | `{ reference, reason? }` |
| `STOCK_RECEPTION_CONFIRMED` | `StockReception` | `{ purchase_order_reference, items_received, new_order_status }` |
| `STOCK_TRANSFER_FROM_RECEPTION` | `Transfer` | `{ reception_id, purchase_order_id, from_store, to_store, items }` |
| `SUPPLIER_INVOICE_CREATED` | `SupplierInvoice` | `{ invoice_number, amount, due_at, purchase_order_reference }` |
| `SUPPLIER_INVOICE_PAID` | `SupplierInvoice` | `{ invoice_number, paid_at, amount }` |

---

## 11. Règles d'accès RBAC

Stock Manager dispose de deux rôles : `SA` (Super Admin) et `Admin`.

| Action | SA | Admin |
|---|---|---|
| Créer un bon de commande | Oui — tous établissements | Oui — ses établissements assignés uniquement |
| Modifier un bon de commande (DRAFT) | Oui | Oui — ses établissements |
| Envoyer un bon de commande (→ SENT) | Oui | Oui — ses établissements |
| Annuler un bon de commande | Oui | Oui — ses établissements |
| Enregistrer une réception | Oui | Oui — ses établissements |
| Confirmer une réception | Oui | Oui — ses établissements |
| Consulter les bons de commande | Oui — tous | Oui — ses établissements |
| Gérer le catalogue fournisseur (`SupplierProduct`) | Oui | Non |
| Créer une facture fournisseur | Oui | **Non** |
| Consulter les factures | Oui | **Non** |
| Marquer une facture comme payée | Oui | **Non** |

> **Les factures fournisseurs contiennent des données financières sensibles (montants, échéances, conditions de paiement).** L'accès est strictement limité au rôle `SA`. Le middleware d'autorisation doit rejeter toute requête Admin sur les routes `/api/invoices/*`.

---

## 12. Points de décision et état ouvert

### Décisions actées

| Décision | Justification |
|---|---|
| L'établissement destinataire est fixé à la création du bon de commande | Evite l'ambiguïté lors de la réception — l'établissement récepteur est connu avant l'arrivée des marchandises |
| Les prix et unités sont dénormalisés dans `PurchaseOrderItem` | Un bon de commande est un document figé à valeur comptable — il ne doit pas changer si les conditions fournisseur évoluent |
| La réception se fait en deux temps : saisie (PENDING) puis confirmation (CONFIRMED) | Permet à l'utilisateur de corriger les quantités avant tout impact sur le stock |
| Le transfert issu d'une réception est tracé dans les métadonnées de `Transfer` | Permet la traçabilité complète sans créer une table de liaison dédiée |
| Les factures sont accessibles au SA uniquement | Données financières sensibles — séparation des responsabilités |

### Point encore ouvert

> **Gestion des surplus — à préciser lors de l'implémentation**
>
> Que se passe-t-il si `received_qty × units_per_order > ordered_qty × units_per_order` (reçu plus que commandé) ?
>
> Options possibles :
> - **Bloquer** : refuser la confirmation si un écart positif est détecté
> - **Accepter silencieusement** : incrémenter le stock sans alerte
> - **Accepter avec alerte** : autoriser mais créer un `AuditLog` avec l'écart signalé
>
> La décision doit être prise avec le métier avant d'implémenter la logique de confirmation dans `StockReceptionService`.
