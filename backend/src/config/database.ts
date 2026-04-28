import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// On s'assure que les variables d'environnement sont chargées avant de créer la connexion
dotenv.config();

// Création du pool de connexions PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Instance unique du client Prisma partagée dans toute l'application
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
