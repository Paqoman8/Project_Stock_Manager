# Guide de Style — Stock Manager

Standards de code pour le backend TypeScript/Express/Prisma et le frontend Next.js/React/Tailwind.

---

## Table des matières

1. [TypeScript — règles générales](#1-typescript--règles-générales)
2. [Backend — architecture en couches](#2-backend--architecture-en-couches)
3. [Backend — validation Zod](#3-backend--validation-zod)
4. [Backend — Prisma](#4-backend--prisma)
5. [Backend — gestion d'erreurs](#5-backend--gestion-derreurs)
6. [Frontend — composants React](#6-frontend--composants-react)
7. [Frontend — Tailwind CSS](#7-frontend--tailwind-css)
8. [Frontend — formulaires react-hook-form](#8-frontend--formulaires-react-hook-form)
9. [Nommage](#9-nommage)
10. [Ce qu'il ne faut pas faire](#10-ce-quil-ne-faut-pas-faire)

---

## 1. TypeScript — règles générales

Le mode `strict` est activé dans les deux `tsconfig.json`. Respecter les règles suivantes.

```typescript
// ✅ Bon — types explicites sur les signatures publiques
async function createUser(data: CreateUserInput): Promise<UserRow> { ... }

// ❌ Mauvais — any
function process(data: any) { ... }

// ✅ Bon — assertion non-null uniquement quand la valeur est garantie par le contexte
const userId = req.user!.userId;  // req.user est garanti par requireAuth avant

// ❌ Mauvais — assertion aveugle
const name = (someValue as string).toUpperCase();

// ✅ Bon — const par défaut
const items = await fetchItems();

// ✅ Bon — interfaces pour les formes de données, types pour les unions
interface UserRow { id: string; username: string; role: RoleRow; }
type StoreStatus = 'ACTIVE' | 'CLOSED';
```

---

## 2. Backend — architecture en couches

### Controller

Responsabilités : parsing HTTP, validation Zod, extraction du contexte de session, appel service, réponse JSON.

```typescript
// ✅ Bon
export async function createSupplier(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parseResult = createSupplierSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ success: false, errors: parseResult.error.flatten() });
    return;
  }

  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);
    const supplier = await supplierService.createSupplier(parseResult.data, actorId, actorName, storeId, storeName, ip);
    res.status(201).json({ success: true, supplier });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur interne' });
  }
}

// ❌ Mauvais — requête Prisma directe dans un controller
export async function getUsers(req: Request, res: Response) {
  const users = await prisma.user.findMany(); // interdit
  res.json(users);
}
```

### Service

Responsabilités : logique métier, orchestration, appel repository, déclenchement de l'audit.

```typescript
// ✅ Bon — audit non-bloquant après l'opération principale
export async function createSupplier(data: CreateSupplierInput, actorId: string, ...): Promise<SupplierRow> {
  const supplier = await supplierRepository.create(data);

  try {
    await logAction({
      actorId, actorName,
      action: AuditAction.SUPPLIER_CREATED,
      targetType: 'SUPPLIER', targetId: supplier.id, targetName: supplier.name,
      storeId, storeName, ipAddress,
    });
  } catch { /* absorbé */ }

  return supplier;
}
```

### Repository

Responsabilités : toutes les requêtes Prisma, SELECT de colonnes spécifiques.

```typescript
// ✅ Bon — select explicite
const SUPPLIER_SELECT = {
  id: true, name: true, contact_name: true, payment_terms: true, is_active: true, created_at: true,
} as const;

export async function createSupplier(data: CreateSupplierInput): Promise<SupplierRow> {
  return prisma.supplier.create({ data, select: SUPPLIER_SELECT });
}
```

---

## 3. Backend — validation Zod

Toute donnée entrante (body, params, query) doit être validée avec Zod dans le controller.

```typescript
// ✅ Bon
const createSupplierSchema = z.object({
  name: z.string().min(2).max(100),
  contact_name: z.string().optional(),
  payment_terms: z.enum(['IMMEDIATE', 'NET30', 'NET60', 'NET90']),
});

type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

// Dans le controller
const parseResult = createSupplierSchema.safeParse(req.body);
if (!parseResult.success) {
  res.status(400).json({ success: false, errors: parseResult.error.flatten() });
  return;
}
```

---

## 4. Backend — Prisma

```typescript
// ✅ Bon — select explicite (évite de retourner pwd_hash par accident)
const user = await prisma.user.findUnique({
  where: { username },
  select: { id: true, username: true, pwd_hash: true, is_active: true, role: { select: { name: true } } },
});

// ❌ Mauvais — findMany sans select (retourne tout, dont les champs sensibles)
const users = await prisma.user.findMany();

// ✅ Bon — upsert atomique pour les séquences
const seq = await prisma.purchaseOrderSequence.upsert({
  where: { year },
  create: { year, last_number: 1 },
  update: { last_number: { increment: 1 } },
});

// ✅ Bon — transaction pour les opérations multi-tables
await prisma.$transaction([
  prisma.inventory.update({ where: ..., data: ... }),
  prisma.stockMovement.create({ data: ... }),
]);
```

---

## 5. Backend — gestion d'erreurs

```typescript
// ✅ Bon — distinction erreurs métier / erreurs inattendues
try {
  const result = await service.doSomething();
  res.status(200).json({ success: true, data: result });
} catch (error) {
  if (error instanceof BusinessError) {
    res.status(409).json({ success: false, message: error.message });
    return;
  }
  console.error('[controller] Erreur inattendue :', error);
  res.status(500).json({ success: false, message: 'Erreur interne du serveur' });
}

// ✅ Bon — extractIp systématique dans chaque controller
function extractIp(req: AuthenticatedRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim() || (req.ip ?? '');
  return req.ip ?? '';
}
```

---

## 6. Frontend — composants React

```typescript
// ✅ Bon — props typées avec interface
interface UserBadgeProps {
  username: string;
  role: string;
  isActive: boolean;
}

export function UserBadge({ username, role, isActive }: UserBadgeProps) {
  return (
    <span className={`badge ${isActive ? 'badge-success' : 'badge-muted'}`}>
      {username} — {role}
    </span>
  );
}

// ✅ Bon — état de chargement et d'erreur explicites
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

// ❌ Mauvais — gestion d'erreur silencieuse
try {
  await apiClient.post('/suppliers', data);
} catch { /* rien */ }
```

---

## 7. Frontend — Tailwind CSS

Stock Manager utilise des variables sémantiques définies dans `tailwind.config.js`. Toujours utiliser les tokens sémantiques plutôt que les valeurs brutes.

```typescript
// ✅ Bon — tokens sémantiques
<div className="bg-background text-textMain border border-borderLight rounded p-4">
  <button className="bg-primary text-white hover:opacity-90">Valider</button>
  <button className="bg-danger text-white">Supprimer</button>
</div>

// ❌ Mauvais — couleurs hardcodées
<div className="bg-gray-100 text-gray-800">
  <button className="bg-blue-600">Valider</button>
</div>
```

### Tokens disponibles

| Token | Usage |
|-------|-------|
| `bg-background` | Fond de page |
| `bg-white` | Fond des cards/panels |
| `text-textMain` | Texte principal |
| `text-textMuted` | Labels, notes secondaires |
| `border-borderLight` | Séparateurs |
| `bg-primary` / `text-primary` | Actions primaires |
| `bg-success` / `text-success` | États positifs |
| `bg-warning` / `text-warning` | Alertes |
| `bg-danger` / `text-danger` | Erreurs, actions destructrices |

### Badges d'audit

```typescript
// Pattern pour les badges d'état/action
'bg-primary/10 text-primary border border-primary/20'    // créé
'bg-warning/20 text-warning border border-warning/30'    // modifié
'bg-danger/10 text-danger border border-danger/20'       // supprimé/désactivé
'bg-success/10 text-success border border-success/20'    // réactivé/validé
```

---

## 8. Frontend — formulaires react-hook-form

```typescript
// ✅ Bon — schéma Zod + resolver
const schema = z.object({
  name: z.string().min(2, 'Minimum 2 caractères'),
  payment_terms: z.enum(['IMMEDIATE', 'NET30', 'NET60', 'NET90']),
});

type FormValues = z.infer<typeof schema>;

const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
  resolver: zodResolver(schema),
});

const onSubmit = async (data: FormValues) => {
  try {
    await apiClient.post('/suppliers', data);
    onSuccess();
  } catch {
    setError('Une erreur est survenue.');
  }
};

// ✅ Bon — affichage des erreurs inline
<input {...register('name')} />
{errors.name && <p className="text-danger text-sm">{errors.name.message}</p>}
```

---

## 9. Nommage

### Fichiers

| Contexte | Convention | Exemple |
|----------|-----------|---------|
| Controllers backend | `camelCase.controller.ts` | `supplier.controller.ts` |
| Services backend | `camelCase.service.ts` | `audit.service.ts` |
| Repositories backend | `camelCase.repository.ts` | `user.repository.ts` |
| Routes backend | `camelCase.routes.ts` | `purchaseOrder.routes.ts` |
| Pages Next.js | `page.tsx` | `app/dashboard/suppliers/page.tsx` |
| Composants React | `PascalCase.tsx` | `UserFormModal.tsx` |

### Variables et fonctions

```typescript
// Fonctions — camelCase verbe + nom
async function createPurchaseOrder() { ... }
async function getAuditLogs() { ... }

// Composants React — PascalCase
function SupplierFormModal() { ... }

// Constantes de sélection Prisma — SCREAMING_SNAKE_CASE
const SUPPLIER_SELECT = { id: true, name: true } as const;

// Enums — SCREAMING_SNAKE_CASE (conventions Prisma)
AuditAction.SUPPLIER_CREATED
StoreStatus.ACTIVE
```

---

## 10. Ce qu'il ne faut pas faire

```typescript
// ❌ Requête Prisma dans un controller
// ❌ any dans une signature publique
// ❌ Suppression physique de transactions ou de produits (utiliser is_active)
// ❌ Générer les références BC-YYYY-XXXX manuellement
// ❌ Lire storeId depuis req.body pour les logs d'audit (toujours depuis le JWT)
// ❌ Appeler logAction() de façon bloquante (toujours dans un try/catch)
// ❌ Retourner pwd_hash dans une réponse API (toujours select explicite)
// ❌ Hardcoder des couleurs Tailwind (utiliser les tokens sémantiques)
// ❌ Faire une mutation d'inventaire sans créer un stock_movement correspondant
```
