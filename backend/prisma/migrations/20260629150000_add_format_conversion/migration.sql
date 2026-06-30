-- Migration: add FORMAT_CONVERSION movement type + inter-format fields on stock_movements

-- 1. Add new enum value
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'FORMAT_CONVERSION';

-- 2. Add destination format columns on stock_movements
ALTER TABLE "stock_movements"
  ADD COLUMN IF NOT EXISTS "to_packaging_format_id" UUID REFERENCES "packaging_formats"("id"),
  ADD COLUMN IF NOT EXISTS "to_packages_count"       INTEGER;
