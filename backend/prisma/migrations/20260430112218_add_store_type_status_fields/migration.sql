-- CreateEnum
CREATE TYPE "StoreType" AS ENUM ('MAGASIN', 'BOUTIQUE', 'ENTREPOT');

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'STORE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'STORE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'STORE_CLOSED';
ALTER TYPE "AuditAction" ADD VALUE 'STORE_REOPENED';
ALTER TYPE "AuditAction" ADD VALUE 'STORE_DELETED';

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "phone" VARCHAR(20),
ADD COLUMN     "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "type" "StoreType" NOT NULL DEFAULT 'MAGASIN';
