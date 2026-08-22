-- Drop the old (supplier_id, product_id) unique constraint that was not removed
-- by the previous migration. The triplet constraint already enforces the correct rule.

ALTER TABLE "supplier_products"
  DROP CONSTRAINT IF EXISTS "supplier_products_supplier_id_product_id_key";
