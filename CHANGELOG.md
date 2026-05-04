# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/), et ce projet suit le [Versionnage Sémantique](https://semver.org/lang/fr/).

---

## [Non publié]

### Ajouté
- Fermeture manuelle des bons de commande (statut `CLOSED`)
- Gestion des breakdowns d'inventaire par format de conditionnement dans les rapports
- Rôle Administrateur et Manager peuvent désormais lire les bons de commande

### Modifié
- Contrôle d'accès affiné sur les routes bons de commande et réceptions
- Label "Produits fournisseurs" mis à jour dans la Sidebar
- Cohérence de mise en page dans `DashboardShell`
- Logique de sauvegarde des lignes de rapport améliorée

---

## [0.7.0] — 2026-05-01

### Ajouté
- Module **Rapports d'Inventaire** complet (DRAFT → SUBMITTED → VALIDATED/REJECTED)
  - Références INV-YYYY-XXXX via séquences atomiques
  - Lignes par produit avec écarts quantitatifs
  - Breakdowns par format de conditionnement
  - Application irréversible des ajustements post-validation
- Module **Factures fournisseur** (PENDING / PAID / OVERDUE / DISPUTED)
- Formats de **conditionnement** (packaging formats) par produit avec suivi de stock par format
- Mouvements de stock automatiques à la confirmation d'une réception
- Résumé de progression des réceptions en cours

### Modifié
- Contrôle d'accès produits étendu au rôle Administrateur

---

## [0.6.0] — 2026-04-30

### Ajouté
- Module **Réceptions de stock** — workflow PENDING → CONFIRMED/CANCELLED
- Page de gestion des réceptions avec historique
- Catalogue produit fournisseur avec tarification et quantités minimales
- Support des séquences de références bons de commande (BC-YYYY-XXXX) via `upsert` atomique
- Actions d'audit étendues : produits fournisseur, bons de commande, réceptions, factures

---

## [0.5.0] — 2026-04-29

### Ajouté
- Module **Bons de Commande** complet (DRAFT → SENT → PARTIALLY_RECEIVED → RECEIVED → CANCELLED)
- Page de gestion des bons de commande avec filtres et tri
- Module **Fournisseurs** avec CRUD complet
- Page de gestion des fournisseurs (SA uniquement)
- Navigation Sidebar mise à jour (Catalogue, Fournisseurs)

---

## [0.4.0] — 2026-04-28

### Ajouté
- Module **Catalogue Produits** — catégories hiérarchiques, 10 types d'unité, SKU unique
- Page de gestion du catalogue avec activation/désactivation
- Module **Inventaire** — niveaux de stock par établissement, seuils min/réappro

### Modifié
- Rewrites Next.js configurés pour proxifier `/api/*` vers le backend (plus de `localhost` en dur)

---

## [0.3.0] — 2026-04-28

### Ajouté
- **Système d'audit** complet — journal d'audit immuable avec 30+ types d'actions
- Logging des adresses IP sur toutes les actions authentifiées
- Filtrage du journal d'audit par établissement (SA voit tout, Admin voit ses stores)
- Endpoint `/api/auth/accessible-stores` pour les Admins

---

## [0.2.0] — 2026-04-28

### Ajouté
- Module **Gestion des Utilisateurs** — CRUD avec hiérarchie des rôles stricte
- Module **Gestion des Établissements** — MAGASIN / BOUTIQUE / ENTREPOT, statuts ACTIVE/CLOSED
- Store protégé Hub Central (UUID fixe `00000000-0000-0000-0000-000000000001`)
- Attribut `color` sur les établissements pour l'affichage dans la navbar
- Flag `is_protected` sur les établissements (ne peut pas être supprimé)
- Filtrage côté client sur les listes utilisateurs et établissements

---

## [0.1.0] — 2026-04-28

### Ajouté
- Initialisation du schéma Prisma — modèles `users`, `roles`, `stores`, `user_store_access`, `sessions_log`
- Système d'**authentification** — login par identifiant, JWT httpOnly, déconnexion
- Sélection de l'établissement au login
- Rate limiting sur la route de login (10 tentatives / 15 min)
- Validation des mots de passe (regex, politique forte)
- Contraintes RBAC sur les routes : `requireRole`, `requireSA`, `requireAdmin`
- `SessionContext` frontend avec polling toutes les 2 minutes (détection de désactivation de compte)
- Composants UI de base : Button, Card, Input, Modal
- Script de seed : rôles, compte `super.admin`, Hub Central
- `docker-compose.yml` avec PostgreSQL 16
