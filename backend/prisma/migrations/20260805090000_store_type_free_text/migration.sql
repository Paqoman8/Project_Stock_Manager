-- Store.type devient un champ texte libre au lieu d'un enum Postgres.
-- Les valeurs existantes (MAGASIN, BOUTIQUE, ENTREPOT) sont converties telles
-- quelles (cast enum -> texte, aucune perte de données).
ALTER TABLE "stores" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "stores" ALTER COLUMN "type" TYPE VARCHAR(50) USING "type"::text;
ALTER TABLE "stores" ALTER COLUMN "type" SET DEFAULT 'MAGASIN';

DROP TYPE "StoreType";

-- Les établissements protégés (Hub Central provisionné à la création de
-- chaque organisation) reprennent le nouveau type réservé "HUB", auparavant
-- stocké comme "ENTREPOT" faute d'option dédiée.
UPDATE "stores" SET "type" = 'HUB' WHERE "is_protected" = true;
