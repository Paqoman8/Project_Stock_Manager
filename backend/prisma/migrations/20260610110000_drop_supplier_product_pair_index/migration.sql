-- Prisma creates unique constraints as indexes, not named CONSTRAINT objects.
-- The previous migration used DROP CONSTRAINT which was a no-op.
-- This migration uses DROP INDEX to actually remove the old (supplier_id, product_id) pair index.

DROP INDEX IF EXISTS "supplier_products_supplier_id_product_id_key";
