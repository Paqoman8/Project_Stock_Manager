/*
  Warnings:

  - The primary key for the `transfer_items` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[transfer_id,product_id,packaging_format_id]` on the table `transfer_items` will be added. If there are existing duplicate values, this will fail.
  - The required column `id` was added to the `transfer_items` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- DropForeignKey
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_to_packaging_format_id_fkey";

-- DropForeignKey
ALTER TABLE "transaction_items" DROP CONSTRAINT "transaction_items_original_transaction_item_id_fkey";

-- DropIndex
DROP INDEX "reception_items_order_item_id_idx";

-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "transfer_items" DROP CONSTRAINT "transfer_items_pkey",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD CONSTRAINT "transfer_items_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_items_transfer_id_product_id_packaging_format_id_key" ON "transfer_items"("transfer_id", "product_id", "packaging_format_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_to_packaging_format_id_fkey" FOREIGN KEY ("to_packaging_format_id") REFERENCES "packaging_formats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "supplier_products_supplier_id_product_id_packaging_format_id_ke" RENAME TO "supplier_products_supplier_id_product_id_packaging_format_i_key";
