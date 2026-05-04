# Guide d'Utilisation — Stock Manager

Ce guide décrit les modules de Stock Manager et leur utilisation depuis l'interface web.

---

## Table des matières

1. [Connexion et sélection d'établissement](#1-connexion-et-sélection-détablissement)
2. [Gestion des utilisateurs](#2-gestion-des-utilisateurs)
3. [Gestion des établissements](#3-gestion-des-établissements)
4. [Catalogue produits](#4-catalogue-produits)
5. [Fournisseurs](#5-fournisseurs)
6. [Bons de commande](#6-bons-de-commande)
7. [Réceptions de stock](#7-réceptions-de-stock)
8. [Factures fournisseur](#8-factures-fournisseur)
9. [Inventaire](#9-inventaire)
10. [Rapports d'inventaire](#10-rapports-dinventaire)
11. [Journal d'audit](#11-journal-daudit)

---

## 1. Connexion et sélection d'établissement

### Accès

URL : `http://localhost:3000` → `/login`

### Procédure

1. Saisir l'**identifiant** (ex : `super.admin`) et le **mot de passe**
2. Sélectionner l'**établissement de session** dans la liste déroulante
3. Cliquer sur **Se connecter**

L'établissement sélectionné définit le contexte de toutes les opérations de stock effectuées pendant cette session. Il est affiché en permanence dans la barre de navigation.

### Changement d'établissement

Pour changer d'établissement, se déconnecter et se reconnecter en sélectionnant un autre établissement. Il n'existe pas de changement rapide depuis la navbar (friction positive intentionnelle pour éviter les erreurs de saisie).

---

## 2. Gestion des utilisateurs

**Accès :** SA et Admin | `/dashboard/users`

### Créer un utilisateur

1. Cliquer sur **Nouvel utilisateur**
2. Renseigner : identifiant, prénom, nom, email (optionnel), mot de passe, rôle
3. Assigner un ou plusieurs établissements
4. Valider

**Règles de hiérarchie :**
- Un Admin ne peut pas créer un SA ou un autre Admin
- Le rôle attribué ne peut pas être supérieur au rôle du créateur

### Modifier un utilisateur

Cliquer sur l'icône d'édition sur la ligne souhaitée. Les mêmes règles hiérarchiques s'appliquent.

### Désactiver / Réactiver

Utiliser le bouton d'état sur la ligne. Un utilisateur désactivé est immédiatement déconnecté lors du prochain polling (dans les 2 minutes).

---

## 3. Gestion des établissements

**Accès :** SA uniquement | `/dashboard/stores`

### Créer un établissement

1. Cliquer sur **Nouvel établissement**
2. Renseigner : nom, type (MAGASIN / BOUTIQUE / ENTREPOT), couleur d'affichage
3. Valider

### Fermer / Rouvrir un établissement

Un établissement fermé reste visible dans les historiques mais ne peut plus être sélectionné lors de la connexion.

> L'établissement **Hub Central** est protégé et ne peut pas être supprimé ni fermé.

---

## 4. Catalogue produits

**Accès :** Lecture — tous rôles | Modification — SA et Admin | `/dashboard/catalogue`

### Créer un produit

1. Cliquer sur **Nouveau produit**
2. Renseigner : nom, SKU (unique), catégorie, unité, prix de référence
3. Valider

### Formats de conditionnement

Chaque produit peut avoir des formats de conditionnement (ex : Unité ×1, Pack ×6, Carton ×24). Les définir depuis la fiche produit.

### Catégories

Les catégories sont hiérarchiques (parent / enfant). Les gérer depuis le menu catégories. Une catégorie parente ne peut pas être supprimée si elle a des sous-catégories ou des produits.

---

## 5. Fournisseurs

**Accès :** SA uniquement | `/dashboard/suppliers`

### Créer un fournisseur

Renseigner : raison sociale, contact, conditions de paiement (IMMEDIATE, NET30, NET60, NET90).

### Catalogue produit fournisseur

`/dashboard/supplier-products` — Lier des produits du catalogue à un fournisseur avec :
- Prix d'achat
- Unité de commande
- Quantité minimale de commande
- Délai de livraison
- Flag "fournisseur préféré"

---

## 6. Bons de commande

**Accès :** Lecture — Admin et Manager | Création/Envoi — SA | `/dashboard/purchase-orders`

### Cycle de vie

```
DRAFT → SENT → PARTIALLY_RECEIVED → RECEIVED
              ↘                              ↗
               CANCELLED          CLOSED (manuel)
```

### Créer un bon de commande

1. Cliquer sur **Nouveau bon de commande**
2. Sélectionner le fournisseur et l'établissement de destination
3. Ajouter les lignes (produit, quantité, format de conditionnement)
4. Enregistrer en **DRAFT** ou envoyer directement

### Envoyer (DRAFT → SENT)

Le statut passe à SENT, signifiant que la commande a été transmise au fournisseur. La référence BC-YYYY-XXXX est générée à la création.

### Fermer manuellement

Un bon de commande partiellement reçu peut être fermé manuellement (statut CLOSED) si le reliquat ne doit pas être attendu.

---

## 7. Réceptions de stock

**Accès :** Lecture — tous rôles | Création — Admin+ | Confirmation — SA et Admin | `/dashboard/receptions`

### Créer une réception

1. Depuis un bon de commande au statut SENT ou PARTIALLY_RECEIVED, créer une réception
2. Saisir les quantités réellement reçues par ligne et par format de conditionnement
3. Enregistrer (statut **PENDING**)

### Confirmer une réception (PENDING → CONFIRMED)

La confirmation déclenche automatiquement :
- La création des **mouvements de stock** (type RECEPTION)
- La mise à jour des **niveaux d'inventaire** pour l'établissement destinataire
- La mise à jour du statut du bon de commande (PARTIALLY_RECEIVED ou RECEIVED)

### Annuler une réception

Une réception en statut PENDING peut être annulée. Une réception CONFIRMED ne peut pas être annulée (les mouvements de stock sont irréversibles).

---

## 8. Factures fournisseur

**Accès :** SA uniquement | `/dashboard/invoices`

### Créer une facture

Lier une facture à un bon de commande. Renseigner : numéro de facture, montant, date d'échéance.

### Cycle de vie des statuts

| Statut | Description |
|--------|-------------|
| PENDING | Facture reçue, paiement en attente |
| PAID | Facture réglée |
| OVERDUE | Date d'échéance dépassée |
| DISPUTED | Litige en cours avec le fournisseur |

---

## 9. Inventaire

**Accès :** Lecture — tous rôles | Modification — Admin+ | `/dashboard/inventory`

### Consulter les stocks

La vue affiche les niveaux de stock (physique et réservé) par produit pour l'établissement de session. Filtres disponibles : produit, catégorie, état du stock.

### Modifier les seuils

Depuis la fiche stock d'un produit, modifier le seuil minimum et le seuil de réapprovisionnement.

### Breakdowns par format

Chaque ligne de stock peut être décomposée par format de conditionnement (Carton, Pack, Unité) depuis l'icône de détail.

---

## 10. Rapports d'inventaire

**Accès :** Lecture — tous rôles | Création et soumission — Admin+ | Validation — SA et Admin | `/dashboard/inventory/reports`

### Créer un rapport

1. Cliquer sur **Nouveau rapport**
2. Sélectionner l'établissement et la période
3. Le système génère la liste des produits avec les stocks théoriques

### Saisir les comptages

Pour chaque ligne, saisir la quantité physiquement comptée. L'écart (compté - théorique) est calculé automatiquement. La saisie par format de conditionnement est possible.

### Cycle de vie

```
DRAFT → SUBMITTED → VALIDATED → (ajustements appliqués)
                  ↘ REJECTED → retour à DRAFT
```

### Valider un rapport (VALIDATED)

La validation est irréversible. Elle déclenche :
- La création des **mouvements de stock** d'ajustement pour chaque écart non nul
- Le verrouillage définitif du rapport

---

## 11. Journal d'audit

**Accès :** SA — tous les logs | Admin — logs de ses établissements | `/dashboard/audit`

### Filtres disponibles

- **Établissement** — restreindre aux actions d'un établissement spécifique
- **Type d'action** — par groupe (Authentification, Utilisateurs, Établissements, Fournisseurs, etc.)
- **Acteur** — filtrer par utilisateur
- **Période** — date de début et de fin

### Lecture d'un log

Chaque entrée affiche :
- La date et heure exactes
- L'acteur (nom dénormalisé au moment du fait)
- L'action (badge coloré selon la sémantique)
- La cible (entité concernée)
- L'établissement de session de l'acteur
- L'adresse IP

Les données de contexte supplémentaires (metadata) sont visibles en dépliant la ligne.
