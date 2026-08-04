import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { AuditAction, OrgStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logAction } from './audit.service';
import { generateSecurePassword } from '../utils/password';
import { ROLE_SUPER_ADMIN } from '../config/roles';

const BCRYPT_ROUNDS = 12;

const PRODUCT_FORMAT_LABELS = [
  'Piece',
  'Kilogramme',
  'Gramme',
  'Litre',
  'Millilitre',
  'Metre',
  'Carton',
  'Palette',
  'Pack',
  'Boite',
  'Unite',
  'Rouleau',
  'Sac',
  'Bouteille',
  'Flacon',
];

// ---------------------------------------------------------------------------
// Types exposes — contrat entre service et controller
// ---------------------------------------------------------------------------

/**
 * Une organisation telle que retournee par les fonctions de liste.
 * Inclut les compteurs de stores et d'utilisateurs pour l'affichage.
 */
type OrgListPayload = Prisma.OrganizationGetPayload<{ select: typeof ORG_LIST_SELECT }>;

export interface OrganizationRow extends OrgListPayload {}

/**
 * Detail complet d'une organisation (GET /:id).
 * Inclut les settings, le createur, en plus des champs de OrganizationRow.
 */
export interface OrganizationDetail extends OrgListPayload {
  settings: Prisma.JsonValue | null;
  created_by: { id: string; username: string } | null;
}

/**
 * Donnees requises pour provisionner une nouvelle organisation.
 *
 * @example
 * { name: 'Acme Corp', slug: 'acme-corp', adminEmail: 'admin@acme.com' }
 */
export interface CreateOrganizationInput {
  name: string;
  slug: string;
  adminEmail: string;
}

/**
 * Donnees pour la mise a jour d'une organisation — tous les champs sont optionnels.
 */
export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
  settings?: Record<string, unknown>;
}

/**
 * Resultat d'une requete de liste paginee.
 */
export interface ListOrganizationsResult {
  organizations: OrganizationRow[];
  total: number;
  page: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Selecteur Prisma partage — garantit que toutes les fonctions de lecture
// retournent exactement la meme forme de donnees (OrganizationRow).
// ---------------------------------------------------------------------------

const ORG_LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  is_protected: true,
  logo_url: true,
  created_at: true,
  _count: {
    select: {
      stores: true,
      user_store_accesses: true,
    },
  },
} satisfies Prisma.OrganizationSelect;

// ---------------------------------------------------------------------------
// Fonctions exportees
// ---------------------------------------------------------------------------

/**
 * Liste les organisations avec pagination et filtre optionnel par statut.
 *
 * @param page   - Numero de page (1-indexe)
 * @param limit  - Nombre d'elements par page (max 100)
 * @param status - Filtre optionnel par statut (ex: 'ACTIVE', 'SUSPENDED', 'DISABLED')
 * @returns Resultat pagine contenant les organisations et les metadonnees
 */
export async function listOrganizations(
  page: number,
  limit: number,
  status?: string,
): Promise<ListOrganizationsResult> {
  const where: Prisma.OrganizationWhereInput = {};
  if (status) where.status = status as OrgStatus;

  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      select: ORG_LIST_SELECT,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.organization.count({ where }),
  ]);

  return {
    organizations,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Retourne le detail complet d'une organisation par son ID.
 * Inclut les settings, le createur, et les compteurs de stores/utilisateurs.
 *
 * @param id - UUID de l'organisation
 * @returns L'organisation ou null si introuvable
 */
export async function getOrganization(id: string): Promise<OrganizationDetail | null> {
  const org = await prisma.organization.findUnique({
    where: { id },
    select: {
      ...ORG_LIST_SELECT,
      settings: true,
      created_by: { select: { id: true, username: true } },
    },
  });

  return org as OrganizationDetail | null;
}

/**
 * Provisionne une nouvelle organisation dans une transaction atomique.
 *
 * La transaction Serializable cree sequentiellement :
 *   1. L'organisation
 *   2. Un magasin "Hub Central" protege (is_protected = true, type = ENTREPOT)
 *   3. Un compte administrateur (role Super Administrateur, must_change_password = true)
 *   4. Une ligne user_store_access liant l'admin au Hub Central
 *
 * Les formats de produit standards sont ensemences (idempotent) hors transaction.
 * L'action est auditee (ORGANIZATION_CREATED).
 *
 * Le username admin est construit a partir du slug (tirets retires) pour
 * respecter le format "prenom.nom" impose par USERNAME_REGEX.
 *
 * @param input           - Donnees de l'organisation (name, slug, adminEmail)
 * @param createdByUserId - UUID du Platform Manager qui effectue le provisionnement
 * @param actorName       - Nom de l'acteur (denormalise dans l'audit)
 * @param creatorIp       - Adresse IP du Platform Manager (pour l'audit)
 * @returns L'organisation creee et le mot de passe temporaire de l'admin
 *
 * @example
 * const result = await createOrganization(
 *   { name: 'Acme Corp', slug: 'acme-corp', adminEmail: 'admin@acme.com' },
 *   'uuid-platform-manager',
 *   'platform.manager',
 *   '192.168.1.1',
 * );
 * // result.adminPassword = 'aB3kL9mNxP2q'
 * // result.organization.name = 'Acme Corp'
 */
export async function createOrganization(
  input: CreateOrganizationInput,
  createdByUserId: string,
  actorName: string,
  creatorIp: string,
): Promise<{ organization: OrganizationDetail; adminUsername: string; adminPassword: string }> {
  const adminPassword = generateSecurePassword(12);

  // Les tirets sont strippes du slug pour que le username respecte le format
  // "prenom.nom" alphanumerique impose par USERNAME_REGEX
  // (/^[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/) dans user.service.ts et UserFormModal.tsx.
  // Exemple : slug "mon-org" → username "admin.monorg"
  //
  // Protection anti-collision : deux slugs valides (ex: "abc" et "ab-c")
  // produiraient le meme username "admin.abc". On verifie l'unicite et on
  // suffixe avec 4 hex chars si necessaire.
  const slugStripped = input.slug.replace(/-/g, '');
  let adminUsername = `admin.${slugStripped}`;

  const existingUser = await prisma.user.findUnique({
    where: { username: adminUsername },
    select: { id: true },
  });
  if (existingUser) {
    const suffix = crypto.randomBytes(2).toString('hex');
    adminUsername = `admin.${slugStripped}${suffix}`;
  }

  const adminEmail = input.adminEmail.toLowerCase().trim();

  // L'email de l'admin nouvellement créé doit être unique. On vérifie avant
  // la transaction pour renvoyer une erreur métier claire plutôt qu'une 500.
  const existingEmail = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true },
  });
  if (existingEmail) {
    throw new Error('Cette adresse email est deja utilisee par un autre utilisateur.');
  }

  const pwdHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);

  const result = await prisma.$transaction(async (tx) => {
    const superAdminRole = await tx.role.findUnique({
      where: { name: ROLE_SUPER_ADMIN },
    });
    if (!superAdminRole) throw new Error('Role Super Administrateur introuvable.');

    const org = await tx.organization.create({
      data: {
        name: input.name,
        slug: input.slug,
        status: 'ACTIVE',
        created_by_id: createdByUserId,
      },
    });

    const hubStore = await tx.store.create({
      data: {
        organization_id: org.id,
        name: 'Hub Central',
        type: 'ENTREPOT',
        is_protected: true,
      },
    });

    const adminUser = await tx.user.create({
      data: {
        username: adminUsername,
        email: adminEmail,
        pwd_hash: pwdHash,
        role_id: superAdminRole.id,
        must_change_password: true,
      },
    });

    await tx.userStoreAccess.create({
      data: {
        user_id: adminUser.id,
        store_id: hubStore.id,
        organization_id: org.id,
      },
    });

    return {
      orgId: org.id,
      hubStoreId: hubStore.id,
      adminUserId: adminUser.id,
    };
  });

  await seedProductFormats(result.orgId);

  await logAction({
    actorId: createdByUserId,
    actorName,
    action: AuditAction.ORGANIZATION_CREATED,
    targetType: 'ORGANIZATION',
    targetId: result.orgId,
    targetName: input.name,
    orgId: null,
    ipAddress: creatorIp,
    metadata: {
      slug: input.slug,
      admin_username: adminUsername,
      hub_store_id: result.hubStoreId,
    },
  });

  const org = await getOrganization(result.orgId);
  if (!org) {
    throw new Error('Erreur interne : organisation introuvable apres creation.');
  }

  return {
    organization: org,
    adminUsername,
    adminPassword,
  };
}

/**
 * Met a jour les champs modifiables d'une organisation existante.
 *
 * Verifie l'unicite du slug si celui-ci est modifie.
 * L'action est auditee (ORGANIZATION_UPDATED).
 *
 * @param id         - UUID de l'organisation a modifier
 * @param input      - Champs a mettre a jour (name, slug, settings)
 * @param actorUserId - UUID du Platform Manager qui effectue la modification
 * @param actorName  - Nom de l'acteur (denormalise dans le log)
 * @param actorIp    - Adresse IP du Platform Manager (pour l'audit)
 * @returns L'organisation mise a jour
 * @throws Si l'organisation est introuvable
 * @throws Si le nouveau slug est deja utilise par une autre organisation
 */
export async function updateOrganization(
  id: string,
  input: UpdateOrganizationInput,
  actorUserId: string,
  actorName: string,
  actorIp: string,
): Promise<OrganizationDetail> {
  const org = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true },
  });

  if (!org) throw new Error('Organisation introuvable.');

  if (input.slug && input.slug !== org.slug) {
    const existing = await prisma.organization.findUnique({
      where: { slug: input.slug },
    });
    if (existing && existing.id !== id) {
      throw new Error('Ce slug est deja utilise par une autre organisation.');
    }
  }

  const data: Prisma.OrganizationUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.settings !== undefined) data.settings = input.settings as Prisma.InputJsonValue;

  const updated = await prisma.organization.update({
    where: { id },
    data,
  });

  await logAction({
    actorId: actorUserId,
    actorName,
    action: AuditAction.ORGANIZATION_UPDATED,
    targetType: 'ORGANIZATION',
    targetId: id,
    targetName: updated.name,
    orgId: null,
    ipAddress: actorIp,
    metadata: input as Prisma.InputJsonValue,
  });

  const fresh = await getOrganization(id);
  if (!fresh) {
    throw new Error('Erreur interne : organisation introuvable apres mise a jour.');
  }
  return fresh;
}

/**
 * Suspend une organisation active.
 *
 * Passe le statut a SUSPENDED. Le middleware requireOrg (orgMiddleware.ts)
 * bloquera alors tous les utilisateurs de cette organisation (HTTP 403)
 * jusqu'a reactivation.
 *
 * @param orgId       - UUID de l'organisation a suspendre
 * @param actorUserId - UUID du Platform Manager
 * @param actorName   - Nom de l'acteur (denormalise dans l'audit)
 * @param actorIp     - Adresse IP (pour l'audit)
 * @throws Si l'organisation est introuvable
 * @throws Si l'organisation est protegee
 * @throws Si l'organisation n'est pas en statut ACTIVE
 */
export async function suspendOrganization(
  orgId: string,
  actorUserId: string,
  actorName: string,
  actorIp: string,
): Promise<OrganizationDetail> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, slug: true, status: true, is_protected: true },
  });

  if (!org) {
    throw new Error('Organisation introuvable.');
  }

  // Une organisation protegee (ex: Global Corp, qui heberge le Platform
  // Manager lui-meme) ne doit jamais pouvoir etre suspendue : le login
  // rejette toute connexion dont l'organisation n'est pas ACTIVE, y compris
  // celle du Platform Manager qui vient d'effectuer l'action — auto-verrouillage.
  if (org.is_protected) {
    throw new Error('Impossible de suspendre une organisation protegee.');
  }

  if (org.status !== 'ACTIVE') {
    throw new Error(`Impossible de suspendre une organisation avec le statut "${org.status}".`);
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: { status: 'SUSPENDED' },
  });

  await logAction({
    actorId: actorUserId,
    actorName,
    action: AuditAction.ORGANIZATION_SUSPENDED,
    targetType: 'ORGANIZATION',
    targetId: orgId,
    targetName: org.name,
    orgId: null,
    ipAddress: actorIp,
    metadata: { slug: org.slug },
  });

  const fresh = await getOrganization(orgId);
  if (!fresh) {
    throw new Error('Erreur interne : organisation introuvable apres suspension.');
  }
  return fresh;
}

/**
 * Reactive une organisation suspendue ou desactivee.
 *
 * Repasse le statut a ACTIVE, restaurant l'acces pour tous les utilisateurs
 * de cette organisation des le prochain passage du middleware requireOrg.
 *
 * @param orgId       - UUID de l'organisation a reactiver
 * @param actorUserId - UUID du Platform Manager
 * @param actorName   - Nom de l'acteur (denormalise dans l'audit)
 * @param actorIp     - Adresse IP (pour l'audit)
 * @throws Si l'organisation est introuvable
 * @throws Si l'organisation est deja ACTIVE
 */
export async function reactivateOrganization(
  orgId: string,
  actorUserId: string,
  actorName: string,
  actorIp: string,
): Promise<OrganizationDetail> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, slug: true, status: true },
  });

  if (!org) {
    throw new Error('Organisation introuvable.');
  }

  if (org.status === 'ACTIVE') {
    throw new Error('Cette organisation est deja active.');
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: { status: 'ACTIVE' },
  });

  await logAction({
    actorId: actorUserId,
    actorName,
    action: AuditAction.ORGANIZATION_REACTIVATED,
    targetType: 'ORGANIZATION',
    targetId: orgId,
    targetName: org.name,
    orgId: null,
    ipAddress: actorIp,
    metadata: { slug: org.slug },
  });

  const fresh = await getOrganization(orgId);
  if (!fresh) {
    throw new Error('Erreur interne : organisation introuvable apres reactivation.');
  }
  return fresh;
}

// ---------------------------------------------------------------------------
// Fonctions internes
// ---------------------------------------------------------------------------

/**
 * Supprime definitivement une organisation et toutes ses donnees associees.
 *
 * La cascade est geree par la base de donnees (onDelete: Cascade sur toutes
 * les FK non-nullables dans l'arbre Organization → Store/Product/Supplier/...
 * → leurs enfants et petits-enfants). Les FK nullables (AuditLog.store,
 * Transaction.client) utilisent SetNull pour preserver l'historique.
 *
 * Deux gardes avant suppression :
 *  1. confirmation par slug (le caller fournit le slug exact) ;
 *  2. l'organisation ne doit pas etre protegee (organizations.is_protected).
 *
 * La protection est une propriete PROPRE de l'organisation, independante des
 * stores : un store protege ne protege PAS l'organisation. Si l'organisation
 * n'est pas protegee, la cascade supprime tout, y compris un eventuel store
 * protege a l'interieur. A l'inverse, une organisation protegee ne peut etre
 * supprimee, meme par le Platform Manager.
 *
 * @param orgId       - UUID de l'organisation a supprimer
 * @param actorUserId - UUID du Platform Manager
 * @param actorName   - Nom de l'acteur (denormalise dans l'audit)
 * @param actorIp     - Adresse IP (pour l'audit)
 * @param confirmationSlug - Slug exact de l'organisation a confirmer
 * @throws Si l'organisation est introuvable
 * @throws Si le slug de confirmation est manquant ou incorrect (CONFIRMATION_REQUIRED)
 * @throws Si l'organisation est protegee (PROTECTED_ORGANIZATION)
 */
export async function deleteOrganization(
  orgId: string,
  actorUserId: string,
  actorName: string,
  actorIp: string,
  confirmationSlug?: string,
): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, slug: true, is_protected: true },
  });

  if (!org) {
    throw new Error('Organisation introuvable.');
  }

  // Protection anti-suppression accidentelle / malveillante : le caller doit
  // confirmer explicitement en fournissant le slug de l'organisation.
  if (!confirmationSlug || confirmationSlug.trim().toLowerCase() !== org.slug.toLowerCase()) {
    throw new Error('CONFIRMATION_REQUIRED');
  }

  // Refuser la suppression si l'organisation est marquee protegee dans la base
  // (propriete propre de l'organisation, independante du store).
  if (org.is_protected) {
    throw new Error('PROTECTED_ORGANIZATION');
  }

  await prisma.organization.delete({ where: { id: orgId } });

  await logAction({
    actorId: actorUserId,
    actorName,
    action: AuditAction.ORGANIZATION_DELETED,
    targetType: 'ORGANIZATION',
    targetId: orgId,
    targetName: org.name,
    orgId: null,
    ipAddress: actorIp,
    metadata: { slug: org.slug },
  });
}

/**
 * Ensemence les formats de produit standards (Piece, Kg, Litre, Carton...)
 * pour une organisation donnee. Idempotent : ne cree que les labels manquants.
 *
 * @param orgId - UUID de l'organisation pour laquelle creer les formats
 */
async function seedProductFormats(orgId: string): Promise<void> {
  const existing = await prisma.productFormat.findMany({
    where: { organization_id: orgId, label: { in: PRODUCT_FORMAT_LABELS } },
    select: { label: true },
  });
  const existingLabels = new Set(existing.map((f) => f.label));
  const missing = PRODUCT_FORMAT_LABELS.filter((l) => !existingLabels.has(l));

  if (missing.length > 0) {
    await prisma.productFormat.createMany({
      data: missing.map((label) => ({ organization_id: orgId, label })),
      skipDuplicates: true,
    });
  }
}
