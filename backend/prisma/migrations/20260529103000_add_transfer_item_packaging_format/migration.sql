ALTER TABLE "transfer_items"
  ADD COLUMN "packaging_format_id" UUID,
  ADD COLUMN "packages_count" INTEGER;

ALTER TABLE "transfer_items"
  ADD CONSTRAINT "transfer_items_packaging_format_id_fkey"
  FOREIGN KEY ("packaging_format_id") REFERENCES "packaging_formats"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
