/*
  Warnings:

  - You are about to drop the column `action_type` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `after_data` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `before_data` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `entity_id` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `reason` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `audit_logs` table. All the data in the column will be lost.
  - Added the required column `action` to the `audit_logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actor_name` to the `audit_logs` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_LOGIN', 'USER_LOGIN_FAILED', 'USER_LOGOUT', 'USER_CREATED', 'USER_UPDATED', 'USER_DEACTIVATED', 'USER_REACTIVATED');

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_store_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";

-- AlterTable
ALTER TABLE "audit_logs" DROP COLUMN "action_type",
DROP COLUMN "after_data",
DROP COLUMN "before_data",
DROP COLUMN "entity_id",
DROP COLUMN "reason",
DROP COLUMN "user_id",
ADD COLUMN     "action" "AuditAction" NOT NULL,
ADD COLUMN     "actor_id" UUID,
ADD COLUMN     "actor_name" TEXT NOT NULL,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "store_name" TEXT,
ADD COLUMN     "target_id" UUID,
ADD COLUMN     "target_name" TEXT,
ADD COLUMN     "target_type" TEXT,
ALTER COLUMN "store_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
