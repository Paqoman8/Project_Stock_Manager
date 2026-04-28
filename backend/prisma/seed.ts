import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Début du seeding...');

  // 1. Création des rôles par défaut
  const roles = ['Super Administrateur', 'Manager Magasin', 'Opérateur'];
  const createdRoles = [];
  
  for (const roleName of roles) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
    createdRoles.push(role);
    console.log(`Rôle créé/vérifié: ${role.name}`);
  }

  const superAdminRole = createdRoles.find(r => r.name === 'Super Administrateur');

  // 2. Création du Hub Central
  const hubCentral = await prisma.store.create({
    data: {
      name: 'Hub Central GStock',
      location: 'Siège Social',
    },
  });
  console.log(`Magasin créé: ${hubCentral.name}`);

  // 3. Création de l'Administrateur par défaut
  if (superAdminRole) {
    const adminEmail = 'admin@gstock.local';
    
    // Dans un cas réel, le pwd_hash devrait être hashé avec bcrypt/argon2
    // Ici nous mettons un hash factice pour le développement initial
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        pwd_hash: 'HASH_PLACEHOLDER_A_CHANGER', // A remplacer lors de l'implémentation de l'Auth
        role_id: superAdminRole.id,
      },
    });
    
    console.log(`Administrateur créé: ${admin.email}`);

    // Donner accès au Hub Central à l'admin
    await prisma.userStoreAccess.create({
      data: {
        user_id: admin.id,
        store_id: hubCentral.id
      }
    });
    console.log(`Accès au Hub accordé à l'Admin.`);
  }

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
