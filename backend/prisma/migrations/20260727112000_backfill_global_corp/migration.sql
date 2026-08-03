-- ---------------------------------------------------------------------------
-- BACKFILL: Global Corp — organisation par défaut pour les données existantes
--
-- Objectif : ne pas perdre les données de test en dev. Crée l'organisation
-- "Global Corp" (id 00000000-0000-0000-0000-000000000010, slug "default"),
-- puis rattache toutes les lignes existantes des tables Tier 1.
--
-- Sécurité : cette migration est le complément obligatoire de
-- 20260727101500_add_multi_tenant_schema, qui ajoute organization_id en
-- NULLABLE. La séquence complète (nullable → backfill → SET NOT NULL →
-- recréation des PK composites) fonctionne aussi bien sur une base vide
-- que sur une base avec des données pré-migration.
--
-- NOTE : inventory, purchase_order_sequences et inventory_report_sequences
-- ne reçoivent leur NOT NULL qu'ici (et non dans la migration 1) car leur
-- organization_id fait partie de la PK — la PK ne peut être recréée qu'après
-- le backfill.
-- ---------------------------------------------------------------------------

-- Phase 1 : Créer l'organisation par défaut "Global Corp"
-- (la colonne organization_id est déjà NULLABLE depuis add_multi_tenant_schema)
INSERT INTO "organizations" ("id", "name", "slug", "status", "created_by_id", "created_at", "updated_at")
SELECT
    '00000000-0000-0000-0000-000000000010',
    'Global Corp',
    'default',
    'ACTIVE'::"OrgStatus",
    u.id,
    now(),
    now()
FROM (SELECT id FROM "users" LIMIT 1) u
ON CONFLICT (id) DO NOTHING;

-- Phase 2 : Backfill organization_id sur toutes les tables Tier 1
UPDATE "stores" SET "organization_id" = '00000000-0000-0000-0000-000000000010' WHERE "organization_id" IS NULL;
UPDATE "categories" SET "organization_id" = '00000000-0000-0000-0000-000000000010' WHERE "organization_id" IS NULL;
UPDATE "products" SET "organization_id" = '00000000-0000-0000-0000-000000000010' WHERE "organization_id" IS NULL;
UPDATE "suppliers" SET "organization_id" = '00000000-0000-0000-0000-000000000010' WHERE "organization_id" IS NULL;
UPDATE "inventory" SET "organization_id" = '00000000-0000-0000-0000-000000000010' WHERE "organization_id" IS NULL;
UPDATE "purchase_order_sequences" SET "organization_id" = '00000000-0000-0000-0000-000000000010' WHERE "organization_id" IS NULL;
UPDATE "inventory_report_sequences" SET "organization_id" = '00000000-0000-0000-0000-000000000010' WHERE "organization_id" IS NULL;
UPDATE "sessions_log" SET "organization_id" = '00000000-0000-0000-0000-000000000010' WHERE "organization_id" IS NULL;

-- user_store_access : rétro-remplir depuis stores.organization_id
UPDATE "user_store_access" usa
SET "organization_id" = COALESCE(s."organization_id", '00000000-0000-0000-0000-000000000010')
FROM "stores" s
WHERE usa."store_id" = s."id"
  AND usa."organization_id" IS NULL;

-- Phase 3 : Rétablir les contraintes NOT NULL (les 9 tables Tier 1)
ALTER TABLE "stores" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "user_store_access" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "sessions_log" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "categories" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "products" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "inventory" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "purchase_order_sequences" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "inventory_report_sequences" ALTER COLUMN "organization_id" SET NOT NULL;

-- Phase 4 : Recréer les PK composites (doit venir APRÈS le backfill + NOT NULL)
ALTER TABLE "inventory" DROP CONSTRAINT "inventory_pkey",
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("organization_id", "store_id", "product_id");
ALTER TABLE "purchase_order_sequences" DROP CONSTRAINT "purchase_order_sequences_pkey",
    ADD CONSTRAINT "purchase_order_sequences_pkey" PRIMARY KEY ("organization_id", "year");
ALTER TABLE "inventory_report_sequences" DROP CONSTRAINT "inventory_report_sequences_pkey",
    ADD CONSTRAINT "inventory_report_sequences_pkey" PRIMARY KEY ("organization_id", "year");
