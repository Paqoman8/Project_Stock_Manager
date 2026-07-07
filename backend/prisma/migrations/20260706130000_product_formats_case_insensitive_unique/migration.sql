-- Le référentiel de formats de produit doit être réellement canonique : deux entrées ne
-- différant que par la casse ou des espaces superflus ("Carton" / "carton " ) créent une
-- confusion silencieuse dans le catalogue. On normalise les données existantes puis on
-- remplace l'unicité exacte par une unicité sur LOWER(TRIM(label)).

UPDATE "product_formats" SET "label" = TRIM("label");

-- Créé à l'origine via CREATE UNIQUE INDEX (pas ADD CONSTRAINT) : c'est un index, pas un
-- constraint au sens catalogue Postgres, donc DROP INDEX (et non DROP CONSTRAINT).
DROP INDEX "product_formats_label_key";

CREATE UNIQUE INDEX "product_formats_label_ci_key" ON "product_formats" (LOWER(TRIM("label")));
