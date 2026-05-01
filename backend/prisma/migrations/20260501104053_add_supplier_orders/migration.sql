-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('PIECE', 'KG', 'G', 'L', 'CL', 'ML', 'BOUTEILLE', 'SACHET', 'BOITE');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReceptionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'DISPUTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'SUPPLIER_PRODUCT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPPLIER_PRODUCT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPPLIER_PRODUCT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'PURCHASE_ORDER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'PURCHASE_ORDER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PURCHASE_ORDER_SENT';
ALTER TYPE "AuditAction" ADD VALUE 'PURCHASE_ORDER_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE 'RECEPTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'RECEPTION_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'RECEPTION_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE 'INVOICE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'INVOICE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'INVOICE_PAID';
ALTER TYPE "AuditAction" ADD VALUE 'INVOICE_DISPUTED';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "unit" "ProductUnit" NOT NULL DEFAULT 'PIECE';

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "is_international" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "supplier_products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "supplier_ref" TEXT,
    "purchase_price" DECIMAL(10,2) NOT NULL,
    "order_unit" TEXT NOT NULL,
    "units_per_order" INTEGER NOT NULL DEFAULT 1,
    "min_order_qty" INTEGER NOT NULL DEFAULT 1,
    "is_preferred" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "destination_store_id" UUID NOT NULL,
    "ordered_by_id" UUID NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "expected_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "supplier_product_id" UUID NOT NULL,
    "ordered_qty" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_receptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "received_by_id" UUID NOT NULL,
    "status" "ReceptionStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "stock_receptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reception_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reception_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "received_qty" INTEGER NOT NULL,
    "stock_units_added" INTEGER NOT NULL,

    CONSTRAINT "reception_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "invoice_ref" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_products_supplier_id_product_id_key" ON "supplier_products"("supplier_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_reference_key" ON "purchase_orders"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_items_order_id_supplier_product_id_key" ON "purchase_order_items"("order_id", "supplier_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoices_order_id_key" ON "supplier_invoices"("order_id");

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_destination_store_id_fkey" FOREIGN KEY ("destination_store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_ordered_by_id_fkey" FOREIGN KEY ("ordered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_supplier_product_id_fkey" FOREIGN KEY ("supplier_product_id") REFERENCES "supplier_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receptions" ADD CONSTRAINT "stock_receptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receptions" ADD CONSTRAINT "stock_receptions_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_items" ADD CONSTRAINT "reception_items_reception_id_fkey" FOREIGN KEY ("reception_id") REFERENCES "stock_receptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_items" ADD CONSTRAINT "reception_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
