// validators/auth.validators.ts
// Schémas Zod pour tous les formulaires d'authentification.
// Les composants TSX importent ces schémas et les passent
// à react-hook-form via zodResolver.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'L\'identifiant est obligatoire.')
    .max(50, 'L\'identifiant ne peut pas dépasser 50 caractères.'),
  password: z
    .string()
    .min(1, 'Le mot de passe est obligatoire.'),
  storeId: z.string().optional(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Changement de mot de passe (modal premier login + paramètres)
// ---------------------------------------------------------------------------

const passwordRules = z.string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
  .max(128, 'Le mot de passe ne peut pas dépasser 128 caractères.')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule.')
  .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule.')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre.')
  .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un caractère spécial.');

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Le mot de passe actuel est obligatoire.'),
  newPassword: passwordRules,
  confirmPassword: z.string().min(1, 'Veuillez confirmer le mot de passe.'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas.',
  path: ['confirmPassword'],
});

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

// ---------------------------------------------------------------------------
// Mot de passe oublié — Étape 1 : email
// ---------------------------------------------------------------------------

export const forgotPasswordEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'L\'adresse email est obligatoire.')
    .email('Format d\'adresse email invalide.'),
});

export type ForgotPasswordEmailValues = z.infer<typeof forgotPasswordEmailSchema>;

// ---------------------------------------------------------------------------
// Mot de passe oublié — Étape 2 : code OTP
// ---------------------------------------------------------------------------

export const verifyOtpSchema = z.object({
  otp: z
    .string()
    .length(6, 'Le code doit contenir 6 chiffres.')
    .regex(/^\d{6}$/, 'Le code doit contenir uniquement des chiffres.'),
});

export type VerifyOtpValues = z.infer<typeof verifyOtpSchema>;

// ---------------------------------------------------------------------------
// Mot de passe oublié — Étape 3 : nouveau mot de passe
// ---------------------------------------------------------------------------

export const resetPasswordSchema = z.object({
  newPassword: passwordRules,
  confirmPassword: z.string().min(1, 'Veuillez confirmer le mot de passe.'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas.',
  path: ['confirmPassword'],
});

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
