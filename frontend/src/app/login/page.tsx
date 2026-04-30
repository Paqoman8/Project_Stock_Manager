'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/apiClient';
import { APP_NAME } from '@/lib/config/app';

// Interface représentant un magasin retourné par GET /api/auth/stores
interface Store {
  id: string;
  name: string;
  location: string | null;
}

// Schéma de validation du formulaire avec Zod
// L'identifiant est une chaîne simple, sans validation de format email
const loginSchema = z.object({
  username: z
    .string()
    .min(1, { message: 'L\'identifiant est obligatoire.' })
    .max(50, { message: 'L\'identifiant ne peut pas dépasser 50 caractères.' }),
  password: z
    .string()
    .min(1, { message: 'Le mot de passe est obligatoire.' }),
  // Magasin obligatoire depuis la mise à jour de l'API login
  storeId: z
    .string()
    .min(1, { message: 'Veuillez sélectionner un magasin.' }),
});

// Type TypeScript déduit automatiquement depuis le schéma Zod
type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Liste des magasins chargée depuis GET /api/auth/stores au montage
  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);

  // Chargement de la liste des magasins au montage du composant (endpoint public)
  useEffect(() => {
    async function fetchStores() {
      try {
        const response = await apiClient.get<{ stores: Store[] }>('/api/auth/stores');
        const liste = response.data?.stores;
        if (Array.isArray(liste)) {
          setStores(liste);
        } else {
          setStores([]);
        }
      } catch {
        // En cas d'échec, on laisse la liste vide — le formulaire restera bloqué
        // et l'utilisateur verra le message de validation Zod s'il tente de soumettre
        setStores([]);
      } finally {
        setStoresLoading(false);
      }
    }

    fetchStores();
  }, []);

  // Initialisation du formulaire avec react-hook-form et la validation Zod
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  // Fonction appelée quand le formulaire est soumis et valide
  async function onSubmit(data: LoginFormValues) {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      // Envoi des identifiants et du magasin sélectionné à l'API backend
      await apiClient.post('/api/auth/login', {
        username: data.username,
        password: data.password,
        storeId: data.storeId,
      });

      // Succès : on redirige vers le tableau de bord principal
      router.push('/dashboard');
    } catch (error: unknown) {
      // Gestion des erreurs retournées par l'API (ex: mauvais mot de passe)
      if (
        typeof error === 'object' &&
        error !== null &&
        'response' in error
      ) {
        const axiosError = error as {
          response?: { data?: { message?: string } };
        };
        setErrorMessage(
          axiosError.response?.data?.message ||
            'Une erreur est survenue. Veuillez réessayer.'
        );
      } else {
        setErrorMessage('Impossible de joindre le serveur.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* En-tête */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-textPrimary tracking-tight">
            {APP_NAME}
          </h1>
          <p className="text-sm text-textMuted mt-1">
            Gestion Commerciale Centralisée
          </p>
        </div>

        {/* Carte du formulaire */}
        <div className="bg-surface border border-borderLight rounded p-6 shadow-sm">
          <h2 className="text-base font-medium text-textPrimary mb-5">
            Connexion
          </h2>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>

            {/* Champ Identifiant */}
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

            {/* Champ Mot de passe */}
            <div className="mb-4">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-textSecondary mb-1"
              >
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className={`
                  w-full px-3 py-2 text-sm bg-background border rounded
                  text-textPrimary placeholder-textMuted
                  focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                  transition-colors
                  ${errors.password ? 'border-danger' : 'border-borderLight'}
                `}
                {...register('password')}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-danger" role="alert">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Champ Sélection du magasin — obligatoire depuis la v2 de l'API login */}
            <div className="mb-5">
              <label
                htmlFor="storeId"
                className="block text-sm font-medium text-textSecondary mb-1"
              >
                Magasin
              </label>
              <select
                id="storeId"
                disabled={storesLoading}
                className={`
                  w-full px-3 py-2 text-sm bg-background border rounded
                  text-textPrimary
                  focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                  transition-colors
                  disabled:opacity-60 disabled:cursor-not-allowed
                  ${errors.storeId ? 'border-danger' : 'border-borderLight'}
                `}
                {...register('storeId')}
              >
                {/* Option par défaut non sélectionnable */}
                <option value="" disabled>
                  {storesLoading ? 'Chargement...' : 'Sélectionnez un magasin'}
                </option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                    {store.location ? ` — ${store.location}` : ''}
                  </option>
                ))}
              </select>
              {errors.storeId && (
                <p className="mt-1 text-xs text-danger" role="alert">
                  {errors.storeId.message}
                </p>
              )}
            </div>

            {/* Message d'erreur global retourné par l'API */}
            {errorMessage && (
              <div
                className="mb-4 px-3 py-2 bg-danger bg-opacity-10 border border-danger border-opacity-30 rounded text-danger text-sm"
                role="alert"
              >
                {errorMessage}
              </div>
            )}

            {/* Bouton de soumission */}
            <button
              id="btn-login-submit"
              type="submit"
              disabled={isSubmitting}
              className="
                w-full py-2 px-4 bg-primary text-white text-sm font-medium rounded
                hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-opacity
              "
            >
              {isSubmitting ? 'Connexion en cours...' : 'Se connecter'}
            </button>
          </form>
        </div>

        {/* Pied de page : pas de lien d'inscription, accès restreint */}
        <p className="text-center text-xs text-textMuted mt-6">
          {APP_NAME} — Plateforme interne. Accès restreint.
        </p>
      </div>
    </main>
  );
}
