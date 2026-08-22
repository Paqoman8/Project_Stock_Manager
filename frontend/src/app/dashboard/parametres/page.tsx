'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from '@/contexts/SessionContext';
import { Input } from '@/components/ui/Input';
import { extractApiErrorMessage } from '@/lib/errors';
import { getPasswordStrength } from '@/lib/password';
import { changePassword } from '@/services/auth.service';
import { changePasswordSchema, type ChangePasswordFormValues } from '@/validators/auth.validators';

export default function SettingsPage() {
  const { user } = useSession();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
  });

  const newPassword = watch('newPassword') ?? '';
  const strength = getPasswordStrength(newPassword);

  async function onSubmit(data: ChangePasswordFormValues) {
    setServerError(null);
    setSuccessMessage(null);

    try {
      await changePassword(data.currentPassword, data.newPassword);
      setSuccessMessage('Mot de passe changé avec succès.');
      reset();
    } catch (error: unknown) {
      setServerError(
        extractApiErrorMessage(
          error,
          'Une erreur est survenue. Veuillez réessayer.',
        ),
      );
    }
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-semibold text-textPrimary mb-6">Paramètres</h2>

      {/* SECTION SÉCURITÉ */}
      <div className="bg-surface border border-borderLight rounded p-6 shadow-sm">
        <h3 className="text-base font-medium text-textPrimary mb-1">
          Sécurité
        </h3>
        <p className="text-sm text-textMuted mb-5">
          Changez votre mot de passe. Le nouveau mot de passe doit contenir au moins 8
          caractères, une majuscule, une minuscule, un chiffre et un caractère spécial.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Input
            id="set-current"
            type="password"
            label="Mot de passe actuel"
            autoComplete="current-password"
            placeholder="••••••••"
            error={errors.currentPassword?.message}
            showPasswordToggle
            {...register('currentPassword')}
          />

          <div>
            <Input
              id="set-new"
              type="password"
              label="Nouveau mot de passe"
              autoComplete="new-password"
              placeholder="8 caractères minimum"
              error={errors.newPassword?.message}
              showPasswordToggle
              {...register('newPassword')}
            />
            {newPassword.length > 0 && !errors.newPassword && (
              <div className="mt-1.5">
                <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                    style={{ width: strength.width }}
                  />
                </div>
                <p className="text-xs text-textMuted mt-0.5">
                  Force : {strength.label}
                </p>
              </div>
            )}
          </div>

          <Input
            id="set-confirm"
            type="password"
            label="Confirmer le mot de passe"
            autoComplete="new-password"
            placeholder="••••••••"
            error={errors.confirmPassword?.message}
            showPasswordToggle
            {...register('confirmPassword')}
          />

          {serverError && (
            <div className="px-3 py-2 bg-danger bg-opacity-10 border border-danger border-opacity-30 rounded text-danger text-sm" role="alert">
              {serverError}
            </div>
          )}

          {successMessage && (
            <div className="px-3 py-2 bg-success bg-opacity-10 border border-success border-opacity-30 rounded text-success text-sm" role="status">
              {successMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="py-2 px-4 bg-primary text-white text-sm font-medium rounded hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {isSubmitting ? 'Changement en cours...' : 'Changer le mot de passe'}
          </button>
        </form>
      </div>

      {/* SECTION COMPTE */}
      {user && (
        <div className="bg-surface border border-borderLight rounded p-6 shadow-sm mt-6">
          <h3 className="text-base font-medium text-textPrimary mb-4">
            Compte
          </h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-textMuted">Identifiant</dt>
              <dd className="text-textPrimary font-medium">{user.username}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-textMuted">Email</dt>
              <dd className="text-textPrimary">{user.email ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-textMuted">Rôle</dt>
              <dd className="text-textPrimary">{user.roleName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-textMuted">Organisation</dt>
              <dd className="text-textPrimary">{user.orgName ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-textMuted">Magasin</dt>
              <dd className="text-textPrimary flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: user.storeColor }}
                  aria-hidden="true"
                />
                {user.storeName}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
