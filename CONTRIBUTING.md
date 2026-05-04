# Contribuer à Stock Manager

Merci de contribuer à Stock Manager. Ce guide décrit les conventions et la procédure à suivre pour toute modification du projet.

## Table des matières

1. [Prérequis](#prérequis)
2. [Workflow de contribution](#workflow-de-contribution)
3. [Conventions de commits](#conventions-de-commits)
4. [Standards de code](#standards-de-code)
5. [Règles métier à respecter](#règles-métier-à-respecter)
6. [Signaler un bug](#signaler-un-bug)
7. [Proposer une fonctionnalité](#proposer-une-fonctionnalité)

---

## Prérequis

Avant de commencer, s'assurer que l'environnement de développement est fonctionnel en suivant [Docs/INSTALLATION.md](Docs/INSTALLATION.md).

> Ce dépôt est **privé**. L'accès est restreint aux collaborateurs autorisés. Ne pas partager les identifiants d'accès ni le code source en dehors de l'équipe.

---

## Workflow de contribution

Le dépôt étant privé, les collaborateurs travaillent directement sur des branches du dépôt — pas besoin de fork.

1. **Cloner le dépôt** (une seule fois) :
   ```bash
   git clone <url-du-repo> stock-manager
   cd stock-manager
   ```

2. **Créer une branche** à partir de `main` :
   ```bash
   git checkout -b feat/nom-de-la-fonctionnalite
   # ou
   git checkout -b fix/description-du-bug
   ```

3. **Faire les modifications** en respectant les standards de code ([Docs/STYLEGUIDE.md](Docs/STYLEGUIDE.md)).

4. **Tester manuellement** les cas nominaux et les cas limites.

5. **Commiter** en suivant les conventions Conventional Commits (voir ci-dessous).

6. **Ouvrir une pull request** vers `main` avec une description claire de ce qui change et pourquoi.

---

## Conventions de commits

Le projet suit la spécification [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
<type>(<scope optionnel>): <description courte en français ou anglais>
```

### Types autorisés

| Type | Usage |
|------|-------|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `refactor` | Refactoring sans changement de comportement |
| `docs` | Mise à jour de documentation uniquement |
| `style` | Formatage, espaces (pas de logique) |
| `chore` | Tâches de maintenance (deps, config) |
| `perf` | Amélioration de performance |
| `test` | Ajout ou modification de tests |

### Exemples

```
feat(purchase-orders): ajouter la fermeture manuelle d'un bon de commande
fix(auth): corriger la redirection après expiration de session
docs: mettre à jour INSTALLATION.md avec les variables d'environnement
refactor(audit): extraire la résolution des noms dans un helper partagé
chore: mettre à jour Prisma vers 7.8.0
```

---

## Standards de code

Consulter [Docs/STYLEGUIDE.md](Docs/STYLEGUIDE.md) pour les règles détaillées. Points essentiels :

- **TypeScript strict** — pas de `any`, pas de `!` non justifié
- **Zod** pour toute validation de données entrantes dans les controllers
- **Architecture en couches** — `controller → service → repository`, pas de requête Prisma dans un controller
- **Audit obligatoire** — toute mutation de données doit déclencher un `logAction` (voir [Docs/ARCHITECTURE.md](Docs/ARCHITECTURE.md#audit))
- **Pas de suppression physique** — utiliser les flags `is_active` ou des transactions d'annulation

---

## Règles métier à respecter

Ces invariants ne doivent jamais être violés :

1. **Hiérarchie des rôles** — un Admin ne peut pas créer ni modifier un SA ou un autre Admin.
2. **`storeId` de session** — dans les logs d'audit, `store_id` vient **toujours** du JWT, jamais du body de la requête.
3. **Séquences de références** — les références BC-YYYY-XXXX et INV-YYYY-XXXX sont générées par `upsert` atomique ; ne pas les générer manuellement.
4. **Stocks non négatifs** — toute opération sur le stock doit vérifier la disponibilité avant déduction.
5. **Rapports validés** — un rapport `VALIDATED` ne peut plus être modifié ; ses ajustements sont irréversibles.

---

## Signaler un bug

Ouvrir une issue **privée** sur le dépôt en précisant :

- **Environnement** (OS, versions Node/npm, navigateur)
- **Étapes pour reproduire** le problème
- **Comportement observé** vs **comportement attendu**
- **Logs** backend ou messages d'erreur console si disponibles

Pour les bugs sensibles (faille de sécurité, données corrompues), contacter directement le responsable du projet plutôt que d'ouvrir une issue.

---

## Proposer une fonctionnalité

Ouvrir une issue en décrivant :

- **Le besoin métier** : qui en a besoin et pourquoi ?
- **La solution proposée** : description fonctionnelle
- **Les alternatives envisagées**
- **L'impact sur les modules existants** (audit, RBAC, schéma DB)

Les décisions d'architecture majeures (nouveaux modules, changements de schéma, dépendances) doivent être validées par le responsable du projet avant implémentation.
