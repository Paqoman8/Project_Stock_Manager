import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

// Connexion à la base via l'adapter Prisma/PostgreSQL
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Nombre de "rounds" pour le hachage bcrypt.
// Plus c'est élevé, plus c'est sécurisé mais lent. 12 est un bon équilibre.
const BCRYPT_SALT_ROUNDS = 12;

async function main() {
  console.log('Début du seeding...');

  // 1. Création des rôles par défaut
  // upsert = créer si n'existe pas, ignorer si déjà présent (idempotent)
  // "Administrateur" est ajouté entre "Super Administrateur" et "Manager Magasin".
  // Il couvre les opérations d'administration sans les droits réservés au Super Admin.
  const roles = ['Super Administrateur', 'Administrateur', 'Manager Magasin', 'Opérateur'];
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
  // On utilise upsert pour ne pas créer de doublon si le seed est rejoué.
  // La couleur est incluse dans update tant qu'il n'existe pas d'UI de gestion
  // des couleurs — une fois cette UI créée, retirer color de update.
  const hubCentral = await prisma.store.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: { color: '#1D4ED8' },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Hub Central GStock',
      location: 'Centre de Contrôle Principal',
      color: '#1D4ED8',  // Bleu primary — siège social
    },
  });
  console.log(`Magasin créé/vérifié: ${hubCentral.name}`);

  // 3. Création de l'Administrateur par défaut avec un vrai hash bcrypt
  if (superAdminRole) {
    const adminEmail = 'admin@gstock.local';
    const adminUsername = 'super.admin';
    const motDePasseTest = 'Admin@2026!';

    // On hash le mot de passe avant de le stocker. Jamais de mot de passe en clair en base.
    const motDePasseHashe = await bcrypt.hash(motDePasseTest, BCRYPT_SALT_ROUNDS);

    const admin = await prisma.user.upsert({
      where: { username: adminUsername },
      update: {
        // Si l'admin existe déjà, on s'assure que le hash est à jour
        pwd_hash: motDePasseHashe,
        email: adminEmail,
      },
      create: {
        username: adminUsername,
        email: adminEmail,
        pwd_hash: motDePasseHashe,
        role_id: superAdminRole.id,
      },
    });

    console.log(`Administrateur créé/mis à jour: ${admin.email}`);
    console.log(`Mot de passe de test : ${motDePasseTest}`);

    // Donner accès au Hub Central à l'admin (si pas déjà fait)
    await prisma.userStoreAccess.upsert({
      where: {
        user_id_store_id: {
          user_id: admin.id,
          store_id: hubCentral.id,
        },
      },
      update: {},
      create: {
        user_id: admin.id,
        store_id: hubCentral.id,
      },
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
