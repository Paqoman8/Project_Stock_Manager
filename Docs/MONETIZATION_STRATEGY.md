# Stratégie de Monétisation — Stock Manager

Document de référence pour le lancement commercial de Stock Manager. Couvre les modèles de revenus, la roadmap produit vers la monétisation, les prérequis techniques, et la stratégie go-to-market.

**Date de rédaction :** 2026-05-04
**Statut du projet au moment de la rédaction :** Dépôt privé, modules core implémentés (auth, users, stores, catalogue, fournisseurs, bons de commande, réceptions, inventaire, rapports, audit). Modules manquants : caisse, transferts inter-magasins, dashboard BI.

---

## Table des matières

1. [Positionnement produit](#1-positionnement-produit)
2. [Les 4 modèles de revenus](#2-les-4-modèles-de-revenus)
3. [Modules manquants avant monétisation](#3-modules-manquants-avant-monétisation)
4. [Roadmap vers la monétisation](#4-roadmap-vers-la-monétisation)
5. [Modèle recommandé : SaaS multi-tenant](#5-modèle-recommandé--saas-multi-tenant)
6. [Chiffres et projections](#6-chiffres-et-projections)
7. [Prérequis techniques SaaS](#7-prérequis-techniques-saas)
8. [Go-to-market](#8-go-to-market)
9. [Questions stratégiques ouvertes](#9-questions-stratégiques-ouvertes)

---

## 1. Positionnement produit

### Le problème que Stock Manager résout

Les petites et moyennes structures commerciales multi-établissements (chaînes de boutiques, distributeurs, grossistes) ont un problème commun : leurs stocks, commandes et inventaires sont gérés dans des outils éparpillés — tableurs Excel, WhatsApp pour les commandes fournisseurs, et des systèmes de caisse sans passerelle vers la gestion centrale.

Les solutions existantes présentent chacune un défaut majeur :

| Concurrent | Défaut principal |
|------------|-----------------|
| **Odoo** | Trop complexe, trop cher pour des PME, nécessite un intégrateur |
| **ERPNext** | Difficile à configurer, interface peu intuitive |
| **Sage / EBP** | Desktop-only ou web vieillissant, pas multi-établissements natif |
| **Excel** | Pas de temps réel, pas de contrôle d'accès, erreurs humaines |

### Ce que Stock Manager apporte

- **Léger et moderne** — Next.js 16, React 19, interface épurée pensée pour les opérateurs terrain
- **Multi-établissements natif** — architecture conçue dès le départ pour gérer N boutiques/entrepôts
- **Traçabilité chirurgicale** — audit log immuable sur chaque action (qui, quoi, où, quand)
- **RBAC granulaire** — 5 niveaux de rôles, chaque employé voit exactement ce dont il a besoin
- **Déployable rapidement** — pas d'installation complexe, tourne dans un navigateur

### Marché cible

**Primaire :** Entreprises commerciales multi-établissements de 5 à 200 employés.
**Secondaire :** Distributeurs et grossistes avec gestion fournisseurs active.
**Géographie à définir :** France métropolitaine, Afrique francophone, ou les deux (voir [section 9](#9-questions-stratégiques-ouvertes)).

---

## 2. Les 4 modèles de revenus

### Modèle A — Déploiement sur mesure

**Ce que c'est :** Tu déploies Stock Manager pour un client spécifique, adaptes l'interface à ses besoins, et assures la maintenance.

**Modèle de facturation :**

| Prestation | Tarif indicatif |
|------------|----------------|
| Frais de setup et configuration initiale | 800 € – 2 500 € (one-shot) |
| Personnalisation spécifique (nouveau module, intégration) | 400 – 700 €/jour |
| Hébergement + maintenance mensuelle | 80 – 250 €/mois |

**Avantages :**
- Cash immédiat dès le premier client
- Feedback terrain direct pour améliorer le produit
- Relation client forte

**Inconvénients :**
- Ne scale pas — 10 clients = 10 instances à gérer
- Tu deviens prestataire de service, pas éditeur de logiciel
- Forte dépendance au temps disponible

**Quand utiliser ce modèle :** Phase de lancement (0–6 mois) pour valider le produit et générer du cash flow.

---

### Modèle B — SaaS multi-tenant ⭐ (modèle cible long terme)

**Ce que c'est :** Une seule infrastructure, plusieurs entreprises clientes isolées. Chaque client crée son compte, configure ses établissements, et paye un abonnement mensuel.

**Exemple de grille tarifaire :**

| Plan | Prix/mois | Limites |
|------|-----------|---------|
| **Starter** | 39 – 59 € | 1 établissement, 5 utilisateurs, support email |
| **Business** | 99 – 149 € | 5 établissements, 20 utilisateurs, support prioritaire |
| **Enterprise** | 249 – 399 € | Illimité, onboarding personnalisé, SLA garanti |

**Avantages :**
- Revenus récurrents et prévisibles (MRR)
- Coût marginal quasi nul pour chaque nouveau client
- Valeur de l'entreprise (valorisation = 3-10x ARR)
- Indépendance du temps de travail

**Inconvénients :**
- Architecture plus complexe (multi-tenant)
- Nécessite un système de facturation (Stripe)
- Acquisition client à construire (landing page, SEO, commercial)
- Support client à organiser

**Quand utiliser ce modèle :** Phase principale (6–18 mois après validation avec les premiers clients).

---

### Modèle C — Licence self-hosted

**Ce que c'est :** Le client achète une licence annuelle pour héberger Stock Manager sur ses propres serveurs.

**Modèle de facturation :**

| Licence | Prix indicatif |
|---------|---------------|
| PME (jusqu'à 10 utilisateurs) | 500 – 800 €/an |
| Moyenne entreprise (jusqu'à 50 utilisateurs) | 1 200 – 2 000 €/an |
| Grande entreprise | Sur devis |
| Support et mises à jour | +20% du prix de licence/an |

**Avantages :**
- Pas d'infrastructure à gérer
- Adapté aux clients avec des contraintes de souveraineté des données
- Revenus récurrents via les renouvellements annuels

**Inconvénients :**
- Difficile à imposer sans notoriété établie
- Nécessite un système de licence technique (clés d'activation)
- Support complexifié (environnements clients incontrôlés)
- Pas de visibilité sur l'usage réel

**Quand utiliser ce modèle :** Complément au SaaS pour les grandes structures ou clients sensibles à l'hébergement local.

---

### Modèle D — Open Core

**Ce que c'est :** Le cœur du logiciel est open source (catalogue, stocks, audit). Les modules premium (BI avancée, caisse, app mobile, intégrations comptables) sont payants en SaaS.

**Exemple Odoo :** Community Edition gratuite et open source, Enterprise Edition payante avec des modules supplémentaires.

**Avantages :**
- La communauté assure la visibilité et le marketing
- Les contributions extérieures améliorent le produit gratuitement
- Fort effet de différenciation vs concurrents propriétaires

**Inconvénients :**
- Nécessite une vraie maturité produit avant d'ouvrir le code
- Effort marketing important pour créer une communauté
- Risque de forks concurrents

**Quand utiliser ce modèle :** Phase avancée (18–36 mois) si la base SaaS est solide et qu'une communauté peut apporter de la valeur.

---

## 3. Modules manquants avant monétisation

Ces fonctionnalités sont **critiques** pour qu'un client réel puisse utiliser Stock Manager en production.

### Critiques (bloquants)

| Module | Description | Impact |
|--------|-------------|--------|
| **Caisse / POS** | Enregistrement des ventes, tickets de caisse, gestion du tiroir-caisse | Sans POS, ce n'est pas un ERP commerce complet. C'est le module le plus attendu. |
| **Transferts inter-magasins** | Workflow de transfert de stock entre établissements avec validation croisée | Fonctionnalité centrale pour toute chaîne multi-établissements |
| **Dashboard BI** | Tableaux de bord avec KPIs : CA, rotation stock, alertes de rupture, top produits | C'est souvent la première chose que les dirigeants veulent voir |

### Importantes (différenciants)

| Module | Description | Impact |
|--------|-------------|--------|
| **Alertes et notifications** | Email/webhook sur rupture de stock, BC en retard, rapport rejeté | Reduce le besoin de surveillance manuelle |
| **Export de données** | Export CSV/Excel des inventaires, mouvements, rapports | Exigé par presque tous les clients pour leur comptabilité |
| **PWA / Mobile** | Interface optimisée mobile pour les inventaires terrain | Fort avantage pour les opérateurs en entrepôt |

### Optionnels (phase SaaS)

| Module | Description |
|--------|-------------|
| Intégration comptable | Export vers Sage, EBP, ou format FEC |
| API publique | Pour les intégrations tierces (e-commerce, WMS) |
| Multi-devises | Pour les clients avec activité internationale |
| Gestion des retours fournisseurs | Workflow de retour et avoir fournisseur |

---

## 4. Roadmap vers la monétisation

```
PHASE 0 — Aujourd'hui
━━━━━━━━━━━━━━━━━━━━
État : Modules core implémentés (auth, users, stores, catalogue,
       fournisseurs, bons de commande, réceptions, inventaire, rapports, audit)
Manque : Caisse, transferts, dashboard BI
Objectif : Finir les modules critiques

        │
        ▼ ~3-4 mois de développement
        
PHASE 1 — Premier client (mois 4-6)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Objectif : Trouver 1 entreprise locale, déployer sur mesure
Revenue : Frais de setup (800-2000 €) + maintenance (100-200 €/mois)
Livrable : Instance déployée, client en production
Apprentissage : Feedback terrain, bugs réels, besoins non anticipés

        │
        ▼ ~2-3 mois
        
PHASE 2 — SaaS MVP (mois 7-12)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Objectif : Architecture multi-tenant, système d'inscription, Stripe
Revenue cible : 3-5 clients × 99 €/mois = ~300-500 €/mois MRR
Livrable : stockmanager.io (ou domaine choisi) avec inscriptions ouvertes

        │
        ▼ Croissance progressive
        
PHASE 3 — Scale SaaS (mois 12-24)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Objectif : 20-50 clients actifs, acquisition systématique
Revenue cible : 50 clients × 129 € = 6 450 €/mois MRR (~77k €/an ARR)
Actions : SEO, content marketing, partenariats, commercial

        │
        ▼ Si communauté à atteindre
        
PHASE 4 — Open Core (mois 24+)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Objectif : Ouvrir le cœur, vendre les modules premium et le SaaS
Revenue : Combinaison licences + SaaS + support Enterprise
```

---

## 5. Modèle recommandé : SaaS multi-tenant

### Pourquoi c'est le bon choix à moyen terme

1. **Revenus récurrents et prévisibles.** Un client à 99 €/mois vaut 1 188 € par an. 50 clients = 5 940 €/mois sans travailler davantage.
2. **Valeur de revente.** Une entreprise SaaS se valorise 3 à 10 fois son ARR (Annual Recurring Revenue). À 80k €/an ARR, l'entreprise vaut 240k–800k €.
3. **Indépendance du temps.** Contrairement au déploiement sur mesure, le SaaS génère des revenus même quand tu ne travailles pas.
4. **Amélioration continue.** Avec tous les clients sur la même instance, chaque correction profite immédiatement à tout le monde.

### Ce que ça implique techniquement

Voir [section 7](#7-prérequis-techniques-saas) pour le détail complet.

L'essentiel : le schéma de base de données doit être revu pour intégrer un `tenant_id` (ou une base par client). C'est le chantier le plus structurant — mieux vaut le planifier avant d'avoir trop de code à migrer.

---

## 6. Chiffres et projections

### Scénario conservateur

| Mois | Clients | MRR | ARR |
|------|---------|-----|-----|
| 6 | 1 (sur mesure) | ~200 € | — |
| 12 | 5 (SaaS) | ~600 € | 7 200 € |
| 18 | 20 (SaaS) | ~2 500 € | 30 000 € |
| 24 | 50 (SaaS) | ~6 000 € | 72 000 € |
| 36 | 100 (SaaS) | ~12 000 € | 144 000 € |

### Scénario optimiste (avec effort commercial actif)

| Mois | Clients | MRR | ARR |
|------|---------|-----|-----|
| 12 | 15 (SaaS) | ~2 000 € | 24 000 € |
| 24 | 80 (SaaS) | ~10 000 € | 120 000 € |
| 36 | 200 (SaaS) | ~25 000 € | 300 000 € |

### Coûts à anticiper (SaaS)

| Poste | Coût mensuel estimé |
|-------|-------------------|
| Hébergement (VPS ou Cloud) | 30 – 150 €/mois selon la charge |
| Domaine + SSL | ~15 €/an |
| Stripe (facturation) | 1,5% + 0,25€ par transaction |
| Support client (temps) | Variable |
| Marketing / SEO | 0 € si organique, +++ si payant |

**Point mort :** environ 3-5 clients Business à 129 €/mois couvrent les coûts d'infrastructure.

---

## 7. Prérequis techniques SaaS

Pour passer d'une application mono-entreprise à un vrai SaaS, voici les chantiers techniques à planifier.

### 7.1 Architecture multi-tenant

**Option A — Schéma partagé avec `tenant_id`**
Chaque table reçoit une colonne `tenant_id`. Toutes les requêtes filtrent par `tenant_id`. Simple à mettre en place, mais nécessite une discipline absolue (Row Level Security PostgreSQL recommandé).

```sql
-- Exemple
ALTER TABLE stores ADD COLUMN tenant_id UUID NOT NULL;
ALTER TABLE products ADD COLUMN tenant_id UUID NOT NULL;
-- Activer RLS pour sécuriser
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stores USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

**Option B — Une base par client**
Chaque client a sa propre base PostgreSQL. Isolation maximale, mais gestion des migrations plus complexe.

**Recommandation :** Option A pour démarrer (plus rapide), migrer vers Option B si nécessaire à grande échelle.

### 7.2 Système d'inscription et d'onboarding

- Page d'inscription publique (`/register`) avec création de compte entreprise
- Workflow d'onboarding guidé : création du premier établissement, invitation des utilisateurs
- Email de bienvenue et de confirmation

### 7.3 Facturation avec Stripe

- Intégration Stripe Billing pour les abonnements récurrents
- Page de gestion de l'abonnement (upgrade, downgrade, annulation)
- Webhooks Stripe pour gérer les paiements échoués (suspension de compte)
- Facturation automatique mensuelle

### 7.4 Gestion des limites par plan

```typescript
// Exemple — vérifier la limite d'établissements selon le plan
const limits = { starter: 1, business: 5, enterprise: Infinity };
const currentPlan = tenant.subscription.plan;
const storeCount = await countStores(tenantId);
if (storeCount >= limits[currentPlan]) {
  throw new PlanLimitError('Limite d\'établissements atteinte pour votre plan.');
}
```

### 7.5 Page de statut et SLA

- Page de statut publique (uptime.io ou Better Uptime)
- Monitoring des erreurs (Sentry ou équivalent)
- Backups automatiques de la base de données

### 7.6 Landing page marketing

- Page `/` publique présentant le produit, les plans, les fonctionnalités
- Témoignages clients (dès le premier client)
- Formulaire de contact / démo
- Blog pour le SEO

---

## 8. Go-to-market

### Segment prioritaire recommandé

**Distributeurs et chaînes de boutiques en Afrique francophone (5-50 employés)**

**Pourquoi :**
- Marché moins saturé qu'en France pour les solutions SaaS ERP
- Les outils existants sont souvent mal adaptés (interface anglaise, coûts élevés en devises)
- Multi-établissements est un besoin réel (grossiste avec plusieurs dépôts, chaîne de boutiques)
- Prix accessibles même pour des budgets plus limités (39-99 €/mois = ~25k-65k FCFA)
- Fort bouche-à-oreille dans les réseaux commerciaux

**Alternative :** France — marché plus mature, concurrence plus forte, mais pouvoir d'achat plus élevé.

### Stratégie d'acquisition (par phase)

**Phase 1 — Réseau personnel (mois 0-6)**
- Identifier 1-2 entreprises dans ton réseau qui ont exactement ce problème
- Proposer un déploiement à tarif réduit en échange de témoignage et de feedback
- Documenter les cas d'usage réels pour le marketing futur

**Phase 2 — Contenu et SEO (mois 6-18)**
- Blog avec des articles ciblés : "Gérer les stocks d'une boutique multi-sites", "Comment réduire les pertes d'inventaire"
- Comparatifs : "Stock Manager vs Excel pour les distributeurs"
- YouTube : tutoriels de prise en main

**Phase 3 — Partenariats (mois 12-24)**
- Partenariats avec des comptables et experts-comptables (ils conseillent leurs clients PME)
- Partenariats avec des revendeurs de matériel de caisse
- Présence dans des groupes professionnels Facebook/LinkedIn de commerçants

### Pricing psychologique

- Toujours afficher le prix annuel en option (2 mois offerts) pour améliorer le LTV
- Plan Starter volontairement limité pour pousser vers Business
- Essai gratuit 14 jours sans carte bancaire (réducteur de friction majeur)
- Démo vidéo de 3 minutes sur la landing page (convertit mieux que du texte)

---

## 9. Questions stratégiques ouvertes

Ces décisions doivent être prises avant de lancer la Phase 2. Elles influencent le développement, le pricing, et le marketing.

### Q1 — Quel marché géographique en priorité ?

| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| France uniquement | Pouvoir d'achat élevé, marché structuré | Forte concurrence, acquisition coûteuse |
| Afrique francophone uniquement | Moins de concurrence, besoin fort | Infrastructure variable, paiements complexes |
| Les deux dès le départ | Maximise l'adressable | Disperse les efforts marketing |

**Recommandation provisoire :** Commencer par un seul marché pour valider. Le produit est déjà en français, ce qui facilite les deux.

### Q2 — Multi-tenant dès maintenant ou plus tard ?

Rearchitecturer pour le multi-tenant est un chantier de 2-4 semaines. Le faire maintenant (avant d'avoir trop de clients sur mesure) est moins coûteux que de le faire sous pression.

**Recommandation :** Planifier la migration multi-tenant en parallèle de la finalisation des modules critiques (caisse, transferts).

### Q3 — Quel nom de domaine et marque ?

"Stock Manager" est générique, ce qui est bon pour le SEO mais difficile à protéger. Quelques pistes :
- `stockmanager.io` / `stockmanager.app`
- Un nom plus distinctif : `Stocklio`, `Storck`, `Gestio`, `Nexstock`

À décider avant la landing page.

### Q4 — Solo ou associé ?

Construire et vendre un SaaS seul est possible mais lent. Un associé commercial (quelqu'un qui connaît les cibles, fait les démos, signe les contrats) accélère considérablement la Phase 1 et 2.

---

## Résumé exécutif

Stock Manager est un ERP multi-établissements moderne avec une architecture solide et une documentation complète. Le produit manque encore de 2-3 modules critiques (caisse, transferts, BI) pour être commercialisable.

**Le chemin recommandé en 3 étapes :**

1. **Finir le produit** (3-4 mois) — modules caisse, transferts, dashboard BI
2. **Valider avec un premier client payant** (déploiement sur mesure, feedback réel)
3. **Lancer en SaaS** (architecture multi-tenant + Stripe + landing page)

L'objectif à 24 mois est d'atteindre **50 clients SaaS actifs** pour un **MRR de 5 000 – 7 000 €**, soit un **ARR de 60 000 – 84 000 €** — un revenu significatif et une base pour aller plus loin.

Le capital le plus rare n'est pas le code (il est déjà là) — c'est le **premier client réel** qui valide que des entreprises sont prêtes à payer pour ce problème résolu.
