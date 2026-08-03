-- Protection propre a l'organisation, independante du store.
-- NOT NULL DEFAULT false : l'ajout est sur (base vide comme peuplee).
-- La protection d'une organisation ne depend plus de la presence d'un
-- store protege ; seul ce flag decide si le Platform Manager peut supprimer
-- l'organisation (en plus de la confirmation par slug).
ALTER TABLE "organizations" ADD COLUMN "is_protected" BOOLEAN NOT NULL DEFAULT false;

-- Proteger l'organisation systeme "Global Corp" (backfill) creee par
-- 20260727112000_backfill_global_corp : c'est l'organisation par defaut de
-- la plateforme (id 00000000-...-0010), elle ne doit jamais etre supprimable.
-- (Le seed la protege aussi via is_protected: true — ce UPDATE couvre le cas
-- des bases deja peuplees qui n'ont pas repasse le seed apres ce deploiement.)
UPDATE "organizations" SET "is_protected" = true
WHERE "id" = '00000000-0000-0000-0000-000000000010';
