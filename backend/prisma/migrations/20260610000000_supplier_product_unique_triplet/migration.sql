-- Migration: Replace (supplier_id, product_id) unique constraint with (supplier_id, product_id, packaging_format_id)
-- Allows the same supplier to reference the same product in multiple packaging formats.
-- Uses a dynamic PL/pgSQL block to drop the old constraint regardless of its generated name.

DO $$
DECLARE v_name text;
BEGIN
  SELECT tc.constraint_name INTO v_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema   = kcu.table_schema
  WHERE tc.table_name      = 'supplier_products'
    AND tc.constraint_type = 'UNIQUE'
  GROUP BY tc.constraint_name
  HAVING COUNT(*) = 2
     AND bool_and(kcu.column_name IN ('supplier_id', 'product_id'));

  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE supplier_products DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

ALTER TABLE "supplier_products"
  ADD CONSTRAINT "supplier_products_supplier_id_product_id_packaging_format_id_key"
  UNIQUE ("supplier_id", "product_id", "packaging_format_id");
