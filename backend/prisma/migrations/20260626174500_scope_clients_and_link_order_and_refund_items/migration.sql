ALTER TABLE "clients"
ADD COLUMN "store_id" UUID;

UPDATE "clients" c
SET "store_id" = src.store_id
FROM (
  SELECT DISTINCT ON (t.client_id) t.client_id, t.store_id
  FROM "transactions" t
  WHERE t.client_id IS NOT NULL
  ORDER BY t.client_id, t.created_at ASC
) AS src
WHERE c.id = src.client_id
  AND c.store_id IS NULL;

ALTER TABLE "clients"
ALTER COLUMN "store_id" SET NOT NULL;

DROP INDEX IF EXISTS "clients_normalized_email_key";
DROP INDEX IF EXISTS "clients_normalized_phone_key";

ALTER TABLE "clients"
ADD CONSTRAINT "clients_store_id_fkey"
FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "clients_store_id_normalized_email_key"
ON "clients"("store_id", "normalized_email");

CREATE UNIQUE INDEX "clients_store_id_normalized_phone_key"
ON "clients"("store_id", "normalized_phone");

ALTER TABLE "transaction_items"
ADD COLUMN "original_transaction_item_id" UUID;

ALTER TABLE "reception_items"
ADD COLUMN "order_item_id" UUID;

UPDATE "reception_items" ri
SET "order_item_id" = poi.id
FROM "stock_receptions" sr
JOIN "purchase_order_items" poi
  ON poi.order_id = sr.order_id
LEFT JOIN "supplier_products" sp
  ON sp.id = poi.supplier_product_id
WHERE ri.reception_id = sr.id
  AND ri.order_item_id IS NULL
  AND sp.product_id = ri.product_id
  AND (
    ri.packaging_format_id IS NULL
    OR poi.packaging_format_id = ri.packaging_format_id
  );

ALTER TABLE "transaction_items"
ADD CONSTRAINT "transaction_items_original_transaction_item_id_fkey"
FOREIGN KEY ("original_transaction_item_id") REFERENCES "transaction_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reception_items"
ADD CONSTRAINT "reception_items_order_item_id_fkey"
FOREIGN KEY ("order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "transaction_items_original_transaction_item_id_idx"
ON "transaction_items"("original_transaction_item_id");

CREATE INDEX "reception_items_order_item_id_idx"
ON "reception_items"("order_item_id");
