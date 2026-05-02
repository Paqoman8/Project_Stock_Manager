-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN     "packaging_format_id" UUID;

-- AlterTable
ALTER TABLE "reception_items" ADD COLUMN     "packages_received" INTEGER,
ADD COLUMN     "packaging_format_id" UUID;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "packages_count" INTEGER,
ADD COLUMN     "packaging_format_id" UUID;

-- CreateTable
CREATE TABLE "inventory_breakdowns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "packaging_format_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inventory_breakdowns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_breakdowns_store_id_product_id_packaging_format_i_key" ON "inventory_breakdowns"("store_id", "product_id", "packaging_format_id");

-- AddForeignKey
ALTER TABLE "inventory_breakdowns" ADD CONSTRAINT "inventory_breakdowns_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_breakdowns" ADD CONSTRAINT "inventory_breakdowns_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_breakdowns" ADD CONSTRAINT "inventory_breakdowns_packaging_format_id_fkey" FOREIGN KEY ("packaging_format_id") REFERENCES "packaging_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_packaging_format_id_fkey" FOREIGN KEY ("packaging_format_id") REFERENCES "packaging_formats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_items" ADD CONSTRAINT "reception_items_packaging_format_id_fkey" FOREIGN KEY ("packaging_format_id") REFERENCES "packaging_formats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_packaging_format_id_fkey" FOREIGN KEY ("packaging_format_id") REFERENCES "packaging_formats"("id") ON DELETE SET NULL ON UPDATE CASCADE;
