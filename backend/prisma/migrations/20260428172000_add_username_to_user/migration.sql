-- Étape 1 : Ajouter la colonne username comme nullable d'abord
-- (obligatoire quand des lignes existent déjà en base)
ALTER TABLE "users" ADD COLUMN "username" TEXT;

-- Étape 2 : Attribuer un username par défaut à tous les utilisateurs existants
-- On utilise la partie locale de l'email comme identifiant temporaire
UPDATE "users" SET "username" = SPLIT_PART("email", '@', 1) WHERE "username" IS NULL;

-- Étape 3 : Rendre la colonne obligatoire (NOT NULL) maintenant que toutes les lignes ont une valeur
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;

-- Étape 4 : Rendre l'email optionnel (les comptes peuvent ne pas avoir d'email)
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- Étape 5 : Ajouter la contrainte d'unicité sur le username
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
