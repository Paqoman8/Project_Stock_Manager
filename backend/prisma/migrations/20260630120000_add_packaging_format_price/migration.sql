-- Add optional price field to packaging_formats
-- null = use product.price × units_per_package (default behaviour)
ALTER TABLE "packaging_formats" ADD COLUMN "price" DECIMAL(12,2);
