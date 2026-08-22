-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'MOBILE_MONEY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'TRANSACTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'TRANSACTION_REFUNDED';

-- AlterTable
ALTER TABLE "transaction_items" ADD COLUMN     "packaging_format_id" UUID;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "payment_method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "refund_of_id" UUID;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_refund_of_id_fkey" FOREIGN KEY ("refund_of_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_packaging_format_id_fkey" FOREIGN KEY ("packaging_format_id") REFERENCES "packaging_formats"("id") ON DELETE SET NULL ON UPDATE CASCADE;
