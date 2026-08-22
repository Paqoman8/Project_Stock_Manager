// src/lib/slug.ts
// Utilitaire de dérivation de slug — pas un validateur, donc séparé de validators/.

const DIACRITICS_REGEX = new RegExp('[̀-ͯ]', 'g');

/**
 * Dérive un slug candidat à partir du nom saisi : minuscules, accents
 * retirés, tout caractère non alphanumérique remplacé par un tiret,
 * tirets consécutifs/en bordure supprimés.
 *
 * Purement indicatif — l'utilisateur reste libre de le modifier avant
 * soumission (le slug définitif est toujours revalidé par createOrganizationSchema).
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
