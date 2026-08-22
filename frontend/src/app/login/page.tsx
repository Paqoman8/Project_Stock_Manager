'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { APP_NAME } from '@/lib/config/app';
import { Input } from '@/components/ui/Input';
import { extractApiErrorMessage } from '@/lib/errors';
import { loginSchema, type LoginFormValues } from '@/validators/auth.validators';
import { PasswordChangeModal } from './PasswordChangeModal';
import { login as loginApi } from '@/services/auth.service';
import type { StoreOption } from '@/services/auth.service';

type LoginState =
  | { phase: 'form' }
  | { phase: 'store-selection'; username: string; password: string; stores: StoreOption[] }
  | { phase: 'password-change'; temporaryToken: string };

export default function LoginPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [state, setState] = useState<LoginState>({ phase: 'form' });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const handleLoginError = useCallback((error: unknown) => {
    setErrorMessage(extractApiErrorMessage(error, 'Une erreur est survenue. Veuillez réessayer.'));
  }, []);

  async function onSubmit(data: LoginFormValues) {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const body = await loginApi(data.username, data.password, data.storeId);

      if (!body.success) {
        setErrorMessage(body.message ?? 'Identifiants invalides.');
        return;
      }

      if (body.requiresStoreSelection) {
        setState({
          phase: 'store-selection',
          username: data.username,
          password: data.password,
          stores: body.stores ?? [],
        });
        return;
      }

      if (body.requiresPasswordChange && body.temporaryToken) {
        setState({
          phase: 'password-change',
          temporaryToken: body.temporaryToken,
        });
        return;
      }

      router.replace('/dashboard');
    } catch (error: unknown) {
      handleLoginError(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStoreSelect(storeId: string) {
    if (state.phase !== 'store-selection') return;
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const body = await loginApi(state.username, state.password, storeId);

      if (!body.success) {
        setErrorMessage(body.message ?? 'Identifiants invalides.');
        return;
      }

      if (body.requiresPasswordChange && body.temporaryToken) {
        setState({
          phase: 'password-change',
          temporaryToken: body.temporaryToken,
        });
        return;
      }

      router.replace('/dashboard');
    } catch (error: unknown) {
      handleLoginError(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePasswordChanged() {
    router.replace('/dashboard');
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-textPrimary tracking-tight">
            {APP_NAME}
          </h1>
          <p className="text-sm text-textMuted mt-1">
            Gestion Commerciale Centralisée
          </p>
        </div>

        {state.phase === 'password-change' && (
          <PasswordChangeModal
            temporaryToken={state.temporaryToken}
            onPasswordChanged={handlePasswordChanged}
          />
        )}

        {state.phase === 'store-selection' && (
          <div className="bg-surface border border-borderLight rounded p-6 shadow-sm">
            <h2 className="text-base font-medium text-textPrimary mb-1">
              Sélectionnez un magasin
            </h2>
            <p className="text-sm text-textMuted mb-4">
              Votre compte a accès à plusieurs magasins. Choisissez celui auquel vous
              souhaitez vous connecter.
            </p>

            {errorMessage && (
              <div
                className="mb-4 px-3 py-2 bg-danger bg-opacity-10 border border-danger border-opacity-30 rounded text-danger text-sm"
                role="alert"
              >
                {errorMessage}
              </div>
            )}

            <div className="space-y-2">
              {state.stores.map((store) => (
                <button
                  key={store.id}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleStoreSelect(store.id)}
                  className="w-full text-left px-4 py-3 bg-background border border-borderLight rounded text-sm text-textPrimary hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="font-medium">{store.name}</span>
                  {store.location && (
                    <span className="text-textMuted ml-2">{store.location}</span>
                  )}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setState({ phase: 'form' })}
              className="mt-3 w-full py-2 px-4 text-sm text-textMuted hover:text-textMain rounded transition-colors disabled:opacity-50"
            >
              Retour
            </button>
          </div>
        )}

        {state.phase === 'form' && (
          <div className="bg-surface border border-borderLight rounded p-6 shadow-sm">
            <h2 className="text-base font-medium text-textPrimary mb-5">
              Connexion
            </h2>

            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="mb-4">
                <label
                  htmlFor="username"
                  className="block text-sm font-medium text-textSecondary mb-1"
                >
                  Identifiant
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  placeholder="votre.identifiant"
                  className={`
                    w-full px-3 py-2 text-sm bg-background border rounded
                    text-textPrimary placeholder-textMuted
                    focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                    transition-colors
                    ${errors.username ? 'border-danger' : 'border-borderLight'}
                  `}
                  {...register('username')}
                />
                {errors.username && (
                  <p className="mt-1 text-xs text-danger" role="alert">
                    {errors.username.message}
                  </p>
                )}
              </div>

              <div className="mb-4">
                <Input
                  id="password"
                  type="password"
                  label="Mot de passe"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  error={errors.password?.message}
                  showPasswordToggle
                  {...register('password')}
                />
              </div>

              {errorMessage && (
                <div
                  className="mb-4 px-3 py-2 bg-danger bg-opacity-10 border border-danger border-opacity-30 rounded text-danger text-sm"
                  role="alert"
                >
                  {errorMessage}
                </div>
              )}

              <button
                id="btn-login-submit"
                type="submit"
                disabled={isSubmitting}
                className="
                  w-full py-2 px-4 bg-primary text-white text-sm font-medium rounded
                  hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-opacity
                "
              >
                {isSubmitting ? 'Connexion en cours...' : 'Se connecter'}
              </button>
            </form>

            <div className="mt-4 text-center">
              <Link
                href="/login/mot-de-passe-oublie"
                className="text-sm text-primary hover:underline"
              >
                Mot de passe oublié&nbsp;?
              </Link>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-textMuted mt-6">
          {APP_NAME} — Plateforme interne. Accès restreint.
        </p>
      </div>
    </main>
  );
}
