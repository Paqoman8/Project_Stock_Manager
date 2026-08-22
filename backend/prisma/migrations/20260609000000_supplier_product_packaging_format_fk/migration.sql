-- Migration: Replace order_unit/units_per_order on SupplierProduct with packaging_format_id FK
-- Every existing row must be linked to a PackagingFormat. Since there may be existing rows,
-- we add the column as nullable first, then backfill, then enforce NOT NULL.

-- Step 1: Add nullable FK column
ALTER TABLE "supplier_products" ADD COLUMN "packaging_format_id" UUID;

-- Step 2: Backfill — link each supplier_product to the base_unit PackagingFormat of its product.
--         If no base unit exists for a product, fall back to any format for that product.
UPDATE "supplier_products" sp
SET "packaging_format_id" = (
  SELECT pf.id
  FROM "packaging_formats" pf
  WHERE pf.product_id = sp.product_id
  ORDER BY pf.is_base_unit DESC, pf.created_at ASC
  LIMIT 1
)
WHERE "packaging_format_id" IS NULL;

-- Step 3: Enforce NOT NULL now that all rows are backfilled
ALTER TABLE "supplier_products" ALTER COLUMN "packaging_format_id" SET NOT NULL;

-- Step 4: Add the foreign key constraint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_packaging_format_id_fkey"
  FOREIGN KEY ("packaging_format_id") REFERENCES "packaging_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 5: Drop old columns
ALTER TABLE "supplier_products" DROP COLUMN "order_unit";
ALTER TABLE "supplier_products" DROP COLUMN "units_per_order";
