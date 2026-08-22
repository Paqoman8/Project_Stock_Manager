-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateTable: organizations
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
    "settings" JSONB,
    "logo_url" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- Unique index on slug
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- Add organization_id to Tier 1 tables.
-- NOTE : colonne ajoutée NULLABLE — le backfill + SET NOT NULL + recréation
-- des PK composites sont gérés dans 20260727112000_backfill_global_corp
-- (cette séquence nullable → backfill → NOT NULL est la seule qui survit
-- sur une base déjà peuplée ; un ADD COLUMN ... NOT NULL sans DEFAULT
-- échoue dès qu'une ligne existe).
ALTER TABLE "stores" ADD COLUMN "organization_id" UUID;
ALTER TABLE "user_store_access" ADD COLUMN "organization_id" UUID;
ALTER TABLE "sessions_log" ADD COLUMN "organization_id" UUID;
ALTER TABLE "categories" ADD COLUMN "organization_id" UUID;
ALTER TABLE "products" ADD COLUMN "organization_id" UUID;
ALTER TABLE "suppliers" ADD COLUMN "organization_id" UUID;
ALTER TABLE "inventory" ADD COLUMN "organization_id" UUID;
ALTER TABLE "purchase_order_sequences" ADD COLUMN "organization_id" UUID;
ALTER TABLE "inventory_report_sequences" ADD COLUMN "organization_id" UUID;

-- Add password management columns to users
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "password_updated_at" TIMESTAMP(3);

-- Foreign keys
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stores" ADD CONSTRAINT "stores_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_store_access" ADD CONSTRAINT "user_store_access_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sessions_log" ADD CONSTRAINT "sessions_log_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_sequences" ADD CONSTRAINT "purchase_order_sequences_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_report_sequences" ADD CONSTRAINT "inventory_report_sequences_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Organization-scoped unique constraints (replace old single-column ones)
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_sku_key";
CREATE UNIQUE INDEX "products_organization_id_sku_key" ON "products"("organization_id", "sku");
ALTER TABLE "suppliers" DROP CONSTRAINT IF EXISTS "suppliers_email_key";
CREATE UNIQUE INDEX "suppliers_organization_id_email_key" ON "suppliers"("organization_id", "email");

-- Indexes on organization_id for Tier 1 tables
CREATE INDEX "stores_organization_id_idx" ON "stores"("organization_id");
CREATE INDEX "categories_organization_id_idx" ON "categories"("organization_id");
CREATE INDEX "products_organization_id_idx" ON "products"("organization_id");
CREATE INDEX "suppliers_organization_id_idx" ON "suppliers"("organization_id");
CREATE INDEX "sessions_log_organization_id_idx" ON "sessions_log"("organization_id");
CREATE INDEX "user_store_access_organization_id_idx" ON "user_store_access"("organization_id");
