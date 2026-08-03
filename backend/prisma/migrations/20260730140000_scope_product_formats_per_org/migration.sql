-- Drop the old global case-insensitive unique index
DROP INDEX IF EXISTS product_formats_label_ci_key;

-- Add organization_id column (nullable first, backfill, then NOT NULL)
ALTER TABLE "product_formats" ADD COLUMN "organization_id" UUID;
UPDATE "product_formats" SET "organization_id" = '00000000-0000-0000-0000-000000000010' WHERE "organization_id" IS NULL;
ALTER TABLE "product_formats" ALTER COLUMN "organization_id" SET NOT NULL;

-- Add foreign key to organizations
ALTER TABLE "product_formats" ADD CONSTRAINT "product_formats_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add org-scoped unique constraint on (organization_id, label)
ALTER TABLE "product_formats" ADD CONSTRAINT "product_formats_organization_id_label_key"
  UNIQUE ("organization_id", "label");
