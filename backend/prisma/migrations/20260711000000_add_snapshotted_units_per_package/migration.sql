-- Snapshot du units_per_package au moment de la création de la commande.
-- Permet au calcul de stock_units_added pendant la réception d'être invariant
-- même si le catalogue (PackagingFormat.units_per_package) change ultérieurement.

ALTER TABLE "purchase_order_items"
  ADD COLUMN "snapshotted_units_per_package" INTEGER NOT NULL DEFAULT 1;

-- Backfill existing rows with the current packaging_format value.
-- Priority: 1) line's own packaging_format, 2) supplier_product's packaging_format.
UPDATE "purchase_order_items" AS poi
SET "snapshotted_units_per_package" = COALESCE(
  (SELECT "units_per_package" FROM "packaging_formats" WHERE "id" = poi."packaging_format_id"),
  (SELECT "pf"."units_per_package"
   FROM "supplier_products" AS "sp"
   JOIN "packaging_formats" AS "pf" ON "pf"."id" = "sp"."packaging_format_id"
   WHERE "sp"."id" = poi."supplier_product_id"),
  1
);
