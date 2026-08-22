-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_SUSPENDED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_REACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_DELETED';

-- DropForeignKey
ALTER TABLE "categories" DROP CONSTRAINT "categories_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "clients" DROP CONSTRAINT "clients_store_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory" DROP CONSTRAINT "inventory_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory" DROP CONSTRAINT "inventory_product_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory" DROP CONSTRAINT "inventory_store_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_breakdowns" DROP CONSTRAINT "inventory_breakdowns_packaging_format_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_breakdowns" DROP CONSTRAINT "inventory_breakdowns_product_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_breakdowns" DROP CONSTRAINT "inventory_breakdowns_store_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_report_line_breakdowns" DROP CONSTRAINT "inventory_report_line_breakdowns_packaging_format_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_report_lines" DROP CONSTRAINT "inventory_report_lines_product_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_report_sequences" DROP CONSTRAINT "inventory_report_sequences_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_reports" DROP CONSTRAINT "inventory_reports_store_id_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_packaging_format_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_sequences" DROP CONSTRAINT "purchase_order_sequences_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_destination_store_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "reception_items" DROP CONSTRAINT "reception_items_packaging_format_id_fkey";

-- DropForeignKey
ALTER TABLE "reception_items" DROP CONSTRAINT "reception_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions_log" DROP CONSTRAINT "sessions_log_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions_log" DROP CONSTRAINT "sessions_log_store_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_product_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_store_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_receptions" DROP CONSTRAINT "stock_receptions_order_id_fkey";

-- DropForeignKey
ALTER TABLE "stores" DROP CONSTRAINT "stores_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "supplier_invoices" DROP CONSTRAINT "supplier_invoices_order_id_fkey";

-- DropForeignKey
ALTER TABLE "supplier_products" DROP CONSTRAINT "supplier_products_packaging_format_id_fkey";

-- DropForeignKey
ALTER TABLE "supplier_products" DROP CONSTRAINT "supplier_products_product_id_fkey";

-- DropForeignKey
ALTER TABLE "supplier_products" DROP CONSTRAINT "supplier_products_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "transaction_items" DROP CONSTRAINT "transaction_items_packaging_format_id_fkey";

-- DropForeignKey
ALTER TABLE "transaction_items" DROP CONSTRAINT "transaction_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_store_id_fkey";

-- DropForeignKey
ALTER TABLE "transfer_items" DROP CONSTRAINT "transfer_items_packaging_format_id_fkey";

-- DropForeignKey
ALTER TABLE "transfer_items" DROP CONSTRAINT "transfer_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "transfers" DROP CONSTRAINT "transfers_from_store_id_fkey";

-- DropForeignKey
ALTER TABLE "transfers" DROP CONSTRAINT "transfers_to_store_id_fkey";

-- DropForeignKey
ALTER TABLE "user_store_access" DROP CONSTRAINT "user_store_access_organization_id_fkey";

-- DropIndex
DROP INDEX "products_sku_key";

-- DropIndex
DROP INDEX "suppliers_email_key";

-- AlterTable
ALTER TABLE "transfer_items" ALTER COLUMN "id" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_store_access" ADD CONSTRAINT "user_store_access_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions_log" ADD CONSTRAINT "sessions_log_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions_log" ADD CONSTRAINT "sessions_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_breakdowns" ADD CONSTRAINT "inventory_breakdowns_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_breakdowns" ADD CONSTRAINT "inventory_breakdowns_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_breakdowns" ADD CONSTRAINT "inventory_breakdowns_packaging_format_id_fkey" FOREIGN KEY ("packaging_format_id") REFERENCES "packaging_formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_store_id_fkey" FOREIGN KEY ("from_store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_store_id_fkey" FOREIGN KEY ("to_store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_packaging_format_id_fkey" FOREIGN KEY ("packaging_format_id") REFERENCES "packaging_formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_packaging_format_id_fkey" FOREIGN KEY ("packaging_format_id") REFERENCES "packaging_formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_packaging_format_id_fkey" FOREIGN KEY ("packaging_format_id") REFERENCES "packaging_formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_destination_store_id_fkey" FOREIGN KEY ("destination_store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_sequences" ADD CONSTRAINT "purchase_order_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_packaging_format_id_fkey" FOREIGN KEY ("packaging_format_id") REFERENCES "packaging_formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receptions" ADD CONSTRAINT "stock_receptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_items" ADD CONSTRAINT "reception_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_items" ADD CONSTRAINT "reception_items_packaging_format_id_fkey" FOREIGN KEY ("packaging_format_id") REFERENCES "packaging_formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_report_sequences" ADD CONSTRAINT "inventory_report_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reports" ADD CONSTRAINT "inventory_reports_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_report_lines" ADD CONSTRAINT "inventory_report_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_report_line_breakdowns" ADD CONSTRAINT "inventory_report_line_breakdowns_packaging_format_id_fkey" FOREIGN KEY ("packaging_format_id") REFERENCES "packaging_formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
