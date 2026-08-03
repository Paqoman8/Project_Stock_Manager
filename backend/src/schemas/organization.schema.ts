import { z } from 'zod';

export const organizationIdParamsSchema = z.object({
  id: z.string().uuid('ID d\'organisation invalide'),
});

export const listOrganizationsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v ?? '1');
      return Number.isNaN(n) || n < 1 ? 1 : Math.floor(n);
    }),
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v ?? '20');
      return Number.isNaN(n) || n < 1 ? 20 : Math.min(Math.floor(n), 100);
    }),
  status: z.string().optional(),
});

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .min(1, 'Le nom est obligatoire')
    .max(100, 'Le nom ne peut pas depasser 100 caractères'),
  slug: z
    .string()
    .min(2, 'Le slug doit contenir au moins 2 caracteres')
    .max(50, 'Le slug ne peut pas depasser 50 caracteres')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Le slug doit contenir uniquement des minuscules, chiffres et tirets',
    ),
  adminEmail: z
    .string()
    .email('Adresse email invalide')
    .max(255, 'L\'email ne peut pas depasser 255 caracteres'),
});

export const updateOrganizationSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    slug: z
      .string()
      .min(2)
      .max(50)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Le slug doit contenir uniquement des minuscules, chiffres et tirets',
      )
      .optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Aucun champ à mettre à jour.',
  });
