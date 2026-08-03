-- Backfill any NULL emails with a synthetic value to avoid data loss
UPDATE "users" SET "email" = 'user-' || "username" || '@gstock.local' WHERE "email" IS NULL;

-- Make email NOT NULL after all rows have a value
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
