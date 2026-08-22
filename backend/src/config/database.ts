import { Pool as PgPool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// On s'assure que les variables d'environnement sont chargées avant de créer la connexion
dotenv.config();

const databaseUrl = process.env.DATABASE_URL || '';
const useNeonDriver = databaseUrl.includes('neon.tech') || process.env.USE_NEON_DRIVER === 'true';

// Instance unique du client Prisma partagée dans toute l'application.
// Utilise le driver Neon serverless sur Vercel (requis pour les environnements serverless),
// et le driver pg classique en local / Docker.
let prisma: PrismaClient;

if (useNeonDriver) {
  const adapter = new PrismaNeon({ connectionString: databaseUrl });
  prisma = new PrismaClient({ adapter });
} else {
  const pool = new PgPool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
}

export { prisma };
