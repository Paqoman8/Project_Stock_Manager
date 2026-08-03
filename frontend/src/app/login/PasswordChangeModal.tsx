'use client';

import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/Input';
import { extractApiErrorMessage } from '@/lib/errors';
import { getPasswordStrength } from '@/lib/password';
import { changePassword } from '@/services/auth.service';
import { changePasswordSchema, type ChangePasswordFormValues } from '@/validators/auth.validators';

interface PasswordChangeModalProps {
  temporaryToken: string;
  onPasswordChanged: () => void;
}

export function PasswordChangeModal({
  temporaryToken,
  onPasswordChanged,
}: PasswordChangeModalProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
  });

  const newPassword = watch('newPassword') ?? '';
  const strength = getPasswordStrength(newPassword);

  const onSubmit = useCallback(
    async (data: ChangePasswordFormValues) => {
      setErrorMessage(null);
      try {
        await changePassword(data.currentPassword, data.newPassword, temporaryToken);
        onPasswordChanged();
      } catch (error: unknown) {
        setErrorMessage(
          extractApiErrorMessage(
            error,
            'Une erreur est survenue. Veuillez réessayer.',
          ),
        );
      }
    },
    [temporaryToken, onPasswordChanged],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Changement de mot de passe obligatoire"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-sm bg-surface border border-borderLight rounded shadow-lg p-6 mx-4">
        <div className="text-center mb-5">
          <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-textPrimary">
            Changement de mot de passe requis
          </h2>
          <p className="text-sm text-textMuted mt-1">
            Votre mot de passe doit être changé avant de continuer.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Input
            id="pcm-current"
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
              id="pcm-new"
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
            id="pcm-confirm"
            type="password"
            label="Confirmer le mot de passe"
            autoComplete="new-password"
            placeholder="••••••••"
            error={errors.confirmPassword?.message}
            showPasswordToggle
            {...register('confirmPassword')}
          />

          {errorMessage && (
            <div
              className="px-3 py-2 bg-danger bg-opacity-10 border border-danger border-opacity-30 rounded text-danger text-sm"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2 px-4 bg-primary text-white text-sm font-medium rounded hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {isSubmitting ? 'Changement en cours...' : 'Changer le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  );
}
