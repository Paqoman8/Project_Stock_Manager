import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import {
  ROLE_PLATFORM_MANAGER,
  ROLE_SUPER_ADMIN,
  ROLE_ADMIN,
  ROLE_MANAGER_MAGASIN,
  ROLE_OPERATEUR,
  ROLE_CAISSIER,
} from '../src/config/roles';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const BCRYPT_SALT_ROUNDS = 12;

async function main() {
  console.log('Début du seeding...');

  // 1. Création des rôles (idempotent via upsert)
  // Platform Manager = gestionnaire de la plateforme (provisioning, orgs)
  // Super Administrateur = admin d'organisation, droits max dans son org
  // Administrateur = administration sans les droits réservés au SA
  const roles = [
    ROLE_PLATFORM_MANAGER,
    ROLE_SUPER_ADMIN,
    ROLE_ADMIN,
    ROLE_MANAGER_MAGASIN,
    ROLE_OPERATEUR,
    ROLE_CAISSIER,
  ];

  const createdRoles: Record<string, string> = {};

  for (const roleName of roles) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
    createdRoles[role.name] = role.id;
    console.log(`Rôle créé/vérifié: ${role.name}`);
  }

  // 2. Création du compte Platform Manager (super.admin)
  const platformManagerRoleId = createdRoles[ROLE_PLATFORM_MANAGER];
  if (!platformManagerRoleId) throw new Error('Role Platform Manager not found');

  const pmEmail = 'manager@gstock.local';
  const pmUsername = 'platform.manager';
  const pmPassword = 'Manager@2026!';
  const pmPwdHash = await bcrypt.hash(pmPassword, BCRYPT_SALT_ROUNDS);

  const pmUser = await prisma.user.upsert({
    where: { username: pmUsername },
    update: {
      pwd_hash: pmPwdHash,
      email: pmEmail,
      role_id: platformManagerRoleId,
    },
    create: {
      username: pmUsername,
      email: pmEmail,
      pwd_hash: pmPwdHash,
      role_id: platformManagerRoleId,
    },
  });

  console.log(`Platform Manager créé/vérifié: ${pmEmail}`);

  // 3. Création de l'organisation par défaut "Global Corp" (idempotent)
  //    C'est l'organisation système de la plateforme : elle est protégée
  //    (is_protected=true) pour ne jamais pouvoir être supprimée, même par
  //    le Platform Manager. La protection est une propriété propre de
  //    l'organisation, indépendante de la protection des stores.
  const defaultOrgId = '00000000-0000-0000-0000-000000000010';
  await prisma.organization.upsert({
    where: { id: defaultOrgId },
    update: { name: 'Global Corp', slug: 'default', is_protected: true },
    create: {
      id: defaultOrgId,
      name: 'Global Corp',
      slug: 'default',
      status: 'ACTIVE',
      is_protected: true,
      created_by_id: pmUser.id,
    },
  });
  console.log('Organisation par défaut créée/vérifiée: Global Corp');

  // 4. Création d'un magasin par défaut pour le Platform Manager s'il n'en a pas
  //    et attribution de l'accès. Sans cela, le Platform Manager ne pourrait pas
  //    s'authentifier car login() exige au moins un magasin actif accessible.
  const defaultStore = await prisma.store.findFirst({
    where: { organization_id: defaultOrgId },
    select: { id: true },
  });

  const platformStoreId =
    defaultStore?.id ??
    (
      await prisma.store.create({
        data: {
          organization_id: defaultOrgId,
          name: 'Hub Plateforme',
          type: 'HUB',
          is_protected: true,
        },
        select: { id: true },
      })
    ).id;

  await prisma.userStoreAccess.upsert({
    where: {
      user_id_store_id: {
        user_id: pmUser.id,
        store_id: platformStoreId,
      },
    },
    update: { organization_id: defaultOrgId },
    create: {
      user_id: pmUser.id,
      store_id: platformStoreId,
      organization_id: defaultOrgId,
    },
  });
  console.log('Accès Platform Manager au magasin par défaut créé/vérifié.');

  console.log('Seeding terminé avec succès.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
