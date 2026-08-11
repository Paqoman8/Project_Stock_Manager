// validators/platform.validators.ts
// Schéma Zod pour le formulaire de création d'organisation (Platform Manager).
// Reflète exactement les contraintes de backend/src/schemas/organization.schema.ts
// (createOrganizationSchema) pour que les erreurs s'affichent avant l'appel API.

import { z } from 'zod';

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Le nom est obligatoire.')
    .max(100, 'Le nom ne peut pas dépasser 100 caractères.'),
  slug: z
    .string()
    .trim()
    .min(2, 'Le slug doit contenir au moins 2 caractères.')
    .max(50, 'Le slug ne peut pas dépasser 50 caractères.')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Le slug doit contenir uniquement des minuscules, chiffres et tirets.',
    ),
  adminEmail: z
    .string()
    .trim()
    .min(1, 'L\'email de l\'administrateur est obligatoire.')
    .email('Format d\'adresse email invalide.')
    .max(255, 'L\'email ne peut pas dépasser 255 caractères.'),
});

export type CreateOrganizationFormValues = z.infer<typeof createOrganizationSchema>;

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
