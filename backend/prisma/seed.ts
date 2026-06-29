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
  const roles = ['Super Administrateur', 'Administrateur', 'Manager Magasin', 'Opérateur', 'Caissier'];
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
    update: { color: '#1D4ED8', is_protected: true },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Hub Central',
      location: 'Centre de Contrôle Principal',
      color: '#1D4ED8',  // Bleu primary — siège social
      is_protected: true,
    },
  });
  console.log(`Magasin créé/vérifié: ${hubCentral.name}`);

  // 3. Création de l'Administrateur par défaut avec un vrai hash bcrypt
  if (superAdminRole) {
    const adminEmail = 'admin@gstock.local';
    const adminUsername = 'super.admin';
    const motDePasseTest = 'Admin@2026!'; // Mot de passe de test pour l'admin (à changer en production)

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

  // 4. Création des formats de produit de référence
  // upsert sur le label (unique) — idempotent
  const formatLabels = ['Unité', 'Carton', 'Boîte'];

  for (const label of formatLabels) {
    await prisma.productFormat.upsert({
      where:  { label },
      update: {},
      create: { label },
    });
    console.log(`Format créé/vérifié: ${label}`);
  }

  // 5. Création des catégories et sous-catégories
  // findFirst + create conditonnel (idempotent sans contrainte unique sur name+parent_id)
  // const categoriesTree = [
  //   {
  //     name: 'Boissons Fonctionnelles & Sucrées',
  //     children: ['Energy drinks', 'Sirops'],
  //   },
  //   {
  //     name: 'Brasserie',
  //     children: ['Bières', 'Gazéifiés'],
  //   },
  //   {
  //     name: 'Cave & Spiritueux',
  //     children: ['Liqueurs', 'Vins'],
  //   },
  //   {
  //     name: 'Eaux & Jus',
  //     children: ['Eaux', 'Jus de fruits'],
  //   },
  // ];

  // for (const cat of categoriesTree) {
  //   let parent = await prisma.category.findFirst({
  //     where: { name: cat.name, parent_id: null },
  //   });
  //   if (!parent) {
  //     parent = await prisma.category.create({ data: { name: cat.name } });
  //     console.log(`Catégorie créée: ${parent.name}`);
  //   } else {
  //     console.log(`Catégorie déjà présente: ${parent.name}`);
  //   }

  //   for (const childName of cat.children) {
  //     const existing = await prisma.category.findFirst({
  //       where: { name: childName, parent_id: parent.id },
  //     });
  //     if (!existing) {
  //       const child = await prisma.category.create({
  //         data: { name: childName, parent_id: parent.id },
  //       });
  //       console.log(`  └─ Sous-catégorie créée: ${child.name}`);
  //     } else {
  //       console.log(`  └─ Sous-catégorie déjà présente: ${existing.name}`);
  //     }
  //   }
  // }

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
