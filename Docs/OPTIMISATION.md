# Chantier d'optimisation — Stock Manager

> Document de reprise. Pour continuer : "Réfère-toi à `Docs/OPTIMISATION.md` et reprends là où on s'est arrêtés."

---

## Contexte

Le lead dev optimise le code **antérieur à l'arrivée du second développeur**.  
**Règle absolue : ne jamais toucher aux fichiers du second développeur sans accord explicite.**

### Fichiers protégés (second développeur)

```
backend/src/routes/transferRoutes.ts
backend/src/controllers/transferController.ts
backend/src/services/transfer.service.ts
backend/src/repositories/transfer.repository.ts
backend/src/routes/transactionRoutes.ts
backend/src/controllers/transactionController.ts
backend/src/services/transaction.service.ts
backend/src/repositories/transaction.repository.ts
frontend/src/app/dashboard/transfers/page.tsx
frontend/src/app/dashboard/pos/page.tsx
frontend/src/app/dashboard/transactions/page.tsx
frontend/src/lib/pos.ts
frontend/src/components/dashboard/DailySalesSummary.tsx
backend/jest.config.js
backend/src/__tests__/transaction.service.test.ts
Migrations : 20260528*, 20260529*, 20260602*
```

---

## Les 7 éléments à optimiser

Numérotation d'origine. Ordre d'exécution décidé : **5 → 1 → 3 → 2 → 4 → 6 → 7**

| # | Élément | Statut |
|---|---|---|
| 5 | Confusion branding GStock vs Stock Manager | ✅ TERMINÉ |
| 1 | Pages frontend monolithiques | 🔄 EN COURS |
| 3 | `user.service.ts` trop volumineux (636 lignes) | ⏳ À FAIRE |
| 2 | Violation architecture 4 couches dans `purchase_order.service.ts` | ⏳ À FAIRE |
| 4 | Dead code Socket.io dans `server.ts` | ⏳ À FAIRE |
| 6 | Tokens Tailwind dupliqués | ⏳ À FAIRE |
| 7 | Documentation désynchronisée | ⏳ À FAIRE |

---

## Règles de travail

1. **Plan d'abord, code ensuite.** Pour chaque élément (et chaque sous-tâche non triviale), présenter un plan complet que le lead dev valide avant toute modification.
2. **Un élément à la fois**, dans l'ordre ci-dessus.
3. Ne jamais toucher aux fichiers du second développeur.
4. Comportement fonctionnel et visuel identique après chaque refactoring.

---

## Élément 5 — Branding GStock ✅ TERMINÉ

### Ce qui a été fait
- `frontend/src/lib/config/app.ts` : fallback `'GStock'` → `'Stock Manager'`
- `docker-compose.yml` : build arg `APP_NAME: ${APP_NAME:-Stock Manager}` pour le service frontend
- `frontend/Dockerfile` : `ARG APP_NAME=Stock Manager` + `ENV NEXT_PUBLIC_APP_NAME=$APP_NAME`
- `.env.example` : entrée `APP_NAME=Stock Manager` ajoutée
- `backend/src/server.ts` : messages de démarrage mis à jour
- `frontend/src/components/users/UserFormModal.tsx` : placeholder email `jean@gstock.local` → `jean.dupont@example.com`
- Commentaires mis à jour dans `SessionContext.tsx`, `Modal.tsx`, `Button.tsx`, `Input.tsx`, `audit/page.tsx`
- Docs : `INSTALLATION.md`, `SUPPLIER_ORDERS.md`, `CATALOGUE_INVENTORY.md`

### Intentionnellement conservé tel quel
- Nom de la base de données `gstock_db` (dans `docker-compose.yml` et `seed.ts`) — pas de migration nécessaire
- Email admin `admin@gstock.local` dans `seed.ts`
- Fichiers `Docs/DOCKER_DEPLOYMENT.md` et `Docs/.md/` — seront traités à l'étape #7

---

## Élément 1 — Pages frontend monolithiques 🔄 EN COURS

### Approche décidée
Pattern de décomposition colocalisé par page :
```
dashboard/<page>/
├── page.tsx          (~80-100 lignes — orchestration pure)
├── types.ts          (interfaces et types locaux)
├── helpers.ts        (fonctions utilitaires propres à la page, si nécessaire)
├── hooks/
│   └── use<Page>.ts  (fetch + état des filtres + logique dérivée)
└── components/
    ├── <Page>Filters.tsx
    ├── <Page>Table.tsx
    ├── <Badge>.tsx
    └── <Modal>.tsx   (modales extraites si elles étaient inline)
```

**Utilitaires partagés créés (Phase 0 — terminée) :**
```
frontend/src/lib/ui.ts                        ← inputCls, formatDate, formatDateTime,
                                                 formatPrice, extractApiError
frontend/src/components/shared/SkeletonRows.tsx
frontend/src/components/shared/IconReset.tsx
```

### Pages décomposées ✅

#### `users/page.tsx` (549 → 104 lignes)
```
users/
├── page.tsx                  104 lignes
├── types.ts                   25 lignes
├── hooks/useUsers.ts          98 lignes
└── components/
    ├── StatusBadge.tsx        11 lignes
    ├── UserFilters.tsx       111 lignes
    └── UserTable.tsx         157 lignes
```
Note : les modales `UserFormModal`, `DeactivateUserModal`, `ReactivateUserModal` étaient
déjà dans `frontend/src/components/users/` — elles n'ont pas bougé.

Fix associé : `frontend/src/components/users/ReactivateUserModal.tsx` importait `UserRow`
depuis `page.tsx` (qui était `export interface`). Corrigé → import depuis `types.ts`.

#### `invoices/page.tsx` (957 → 99 lignes)
```
invoices/
├── page.tsx                  99 lignes
├── types.ts                  30 lignes
├── helpers.ts                 7 lignes  (formatAmount XOF — format différent de formatPrice)
├── hooks/useInvoices.ts      45 lignes
└── components/
    ├── InvoiceStatusBadge.tsx   22 lignes
    ├── InvoiceFilters.tsx       28 lignes
    ├── InvoiceTable.tsx         85 lignes
    ├── CreateInvoiceModal.tsx  120 lignes
    ├── InvoiceDetailModal.tsx  162 lignes
    ├── PayInvoiceModal.tsx      62 lignes
    └── DisputeInvoiceModal.tsx  57 lignes
```
Note : le filtre statut est **server-side** (query param `?status=`), pas client-side.
`handleReopen` reste dans `page.tsx` car c'est une action directe sans modale.

### Pages restantes ⏳ (dans l'ordre)

| Page | Lignes actuelles | Complexité estimée |
|---|---|---|
| `suppliers/page.tsx` | 1 059 | Moyenne (modales inline probables) |
| `audit/page.tsx` | 1 109 | Moyenne (lecture seule, pas de modales complexes) |
| `stores/page.tsx` | 1 163 | Moyenne |
| `inventory/page.tsx` | 1 068 | Moyenne |
| `supplier-products/page.tsx` | 1 363 | Élevée |
| `receptions/page.tsx` | 1 428 | Élevée |
| `catalogue/page.tsx` | 2 008 | Très élevée |
| `purchase-orders/page.tsx` | 2 025 | Très élevée (la plus complexe) |

---

## Élément 3 — `user.service.ts` (636 lignes) ⏳

### Plan prévu (à valider avant exécution)
Extraire en 3 fichiers :
- `backend/src/repositories/role.repository.ts` — requêtes Prisma sur `role`
- `backend/src/repositories/store.repository.ts` — requêtes Prisma sur `store`
- `backend/src/validations/user.validation.ts` — schémas Zod de validation
- `backend/src/repositories/user.repository.ts` — enrichi avec les méthodes actuellement dans le service

Objectif : `user.service.ts` ne contient plus que la logique métier pure, sans appels Prisma directs ni schémas Zod inline.

---

## Élément 2 — Architecture 4 couches dans `purchase_order.service.ts` ⏳

### Problème
`purchase_order.service.ts` appelle Prisma directement (violation : les Services ne doivent pas appeler Prisma, seulement les Repositories).

### Plan prévu (à valider avant exécution)
- Créer ou enrichir `purchase_order.repository.ts` avec toutes les requêtes Prisma
- Le service n'appelle plus que le repository

---

## Élément 4 — Dead code Socket.io dans `server.ts` ⏳

### Problème
Du code Socket.io est présent dans `backend/src/server.ts` mais n'est utilisé nulle part dans l'application (aucun client ne s'y connecte, aucun événement n'est émis).

### Plan prévu (à valider avant exécution)
- Vérifier l'étendue exacte du dead code (imports, initialisation, listeners)
- Supprimer proprement + retirer la dépendance `socket.io` si elle n'est plus utilisée

---

## Élément 6 — Tokens Tailwind dupliqués ⏳

### Problème
Dans `tailwind.config.js`, deux paires de tokens font doublon :
- `textPrimary` = `textMain`
- `textSecondary` = `textMuted`

Les fichiers source utilisent un mix des deux noms pour les mêmes couleurs.

### Plan prévu (à valider avant exécution)
- Supprimer `textPrimary` et `textSecondary` de la config Tailwind
- Remplacer toutes les occurrences `text-textPrimary` → `text-textMain` et `text-textSecondary` → `text-textMuted` dans les fichiers frontend
- Ne pas toucher aux fichiers du second développeur

---

## Élément 7 — Documentation désynchronisée ⏳

### Problème
Les fichiers dans `Docs/.md/` et certains fichiers `Docs/*.md` référencent encore GStock, des routes supprimées, ou des fonctionnalités non implémentées.

### Plan prévu (à valider avant exécution)
- Audit complet de `Docs/` pour identifier les incohérences
- Mise à jour après que tous les autres éléments sont terminés (la doc reflète l'état final)

---

## Branche git

Tout le travail d'optimisation est sur la branche **`fix/optimization`**.
