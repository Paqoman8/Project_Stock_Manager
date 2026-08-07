// src/components/users/UserFormModal.tsx
// Modale de création et d'édition d'un utilisateur.
//
// Un seul composant gère les deux cas (mode déterminé par la prop `user`) :
//   - user == null  → création  : POST /api/users, password obligatoire
//   - user != null  → édition   : PUT /api/users/:id, password optionnel
//
// Sécurité UI — Super Administrateur :
//   - En mode édition d'un SA, le champ "Rôle" est entièrement masqué
//   - Le roleId n'est PAS envoyé dans le body PUT si on édite un SA
//   - Le titre de la modale est adapté pour le SA
//
// Validation côté client via react-hook-form + zod (v4).
// Les champs storeIds sont des cases à cocher (au moins 1 requis).
// Le champ password est conditionnel selon le mode.
//
// Le panel est répliqué depuis Modal.tsx (même style backdrop/panel)
// car Modal n'accepte que du texte, pas du JSX de formulaire.

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import axios from 'axios';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Portal } from '@/components/ui/Portal';
import apiClient from '@/lib/apiClient';

// ---------------------------------------------------------------------------
// Types locaux — doivent rester synchronisés avec UserRow dans la page parente
// ---------------------------------------------------------------------------

interface Role {
  id: string;
  name: string;
}

interface Store {
  id: string;
  name: string;
  location: string | null;
  is_protected?: boolean;
}

interface StoreAccess {
  store: Store;
}

interface UserRow {
  id: string;
  username: string;
  email: string | null;
  is_active: boolean;
  role: Role;
  store_access: StoreAccess[];
}

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  roles: Role[];
  stores: Store[];
  user?: UserRow | null;
  sessionUserId?: string;
}

// ---------------------------------------------------------------------------
// Schémas Zod — un par mode pour que la validation soit correcte
// Zod v4 : les messages d'erreur se passent via { error: "..." }
// ---------------------------------------------------------------------------

// Regex du format d'identifiant imposé sur la plateforme : "texte.texte"
// Exemples valides : jean.dupont, alice.martin2, responsable.stock
const USERNAME_REGEX = /^[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/;

// Schéma de mot de passe fort — appliqué en mode création (obligatoire)
const strongPasswordSchema = z
  .string()
  .min(8, { error: 'Minimum 8 caractères.' })
  .max(128, { error: 'Maximum 128 caractères.' })
  .regex(/[A-Z]/, { error: 'Au moins une lettre majuscule requise.' })
  .regex(/[a-z]/, { error: 'Au moins une lettre minuscule requise.' })
  .regex(/[0-9]/, { error: 'Au moins un chiffre requis.' })
  .regex(/[^a-zA-Z0-9]/, { error: 'Au moins un caractère spécial requis (!@#$…).' });

// Schéma de base commun aux deux modes
const baseSchema = z.object({
  username: z
    .string()
    .min(3, { error: 'Minimum 3 caractères.' })
    .regex(USERNAME_REGEX, { error: 'Format invalide. Attendu : prenom.nom (ex : jean.dupont).' }),
  // Obligatoire : unique en base (contrainte DB) et utilisée comme clé de
  // recherche pour le flux "mot de passe oublié".
  email: z
    .string()
    .min(1, { error: "L'email est obligatoire." })
    .email({ error: 'Adresse email invalide.' }),
  roleId: z.string().min(1, { error: 'Veuillez sélectionner un rôle.' }),
  storeIds: z
    .array(z.string())
    .min(1, { error: 'Veuillez sélectionner au moins un magasin.' }),
});

// Mode création : password obligatoire et fort
const createSchema = baseSchema.extend({
  password: strongPasswordSchema,
});

// Mode édition : password optionnel — si renseigné, doit respecter la politique
const editSchema = baseSchema.extend({
  password: strongPasswordSchema.or(z.literal('')).optional(),
});

type CreateFormValues = z.infer<typeof createSchema>;
type EditFormValues = z.infer<typeof editSchema>;
// Union pour le typage unifié du formulaire
type FormValues = CreateFormValues | EditFormValues;

// ---------------------------------------------------------------------------
// Sous-composant : label de champ avec indicateur d'obligation
// ---------------------------------------------------------------------------

function FieldLabel({
  htmlFor,
  children,
  required = false,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-textSecondary">
      {children}
      {required && (
        <span className="text-danger ml-0.5" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export function UserFormModal({
  isOpen,
  onClose,
  onSuccess,
  roles,
  stores,
  user = null,
  sessionUserId,
}: UserFormModalProps) {
  const isEditMode = user !== null;

  // Détermine si on édite le Super Administrateur.
  // Dans ce cas, le champ "Rôle" est masqué et roleId est exclu du body PUT.
  const isEditingSuperAdmin = isEditMode && user?.role.name === 'Super Administrateur';

  // Détermine si un Administrateur édite son propre compte.
  // Dans ce cas, le champ "Rôle" est également masqué — un Admin ne peut pas
  // modifier son propre rôle, seul le SA peut le faire.
  const isEditingOwnAdminAccount =
    isEditMode &&
    user?.role.name === 'Administrateur' &&
    user?.id === sessionUserId;

  const [apiError, setApiError] = useState<string | null>(null);
  // Ref sur le panel pour pouvoir y chercher le premier input et y mettre le focus
  const panelRef = useRef<HTMLDivElement>(null);

  const schema = isEditMode ? editSchema : createSchema;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    // Zod v4 + @hookform/resolvers v5
    resolver: zodResolver(schema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      roleId: '',
      storeIds: [],
    },
  });

  // Synchronise les valeurs du formulaire à chaque ouverture de la modale.
  // Si on est en mode édition, pré-remplit avec les données du user existant.
  useEffect(() => {
    if (!isOpen) return;

    setApiError(null);

    if (isEditMode && user) {
      reset({
        username: user.username,
        email: user.email ?? '',
        password: '',
        roleId: user.role.id,
        storeIds: user.store_access.map((sa) => sa.store.id),
      });
    } else {
      reset({
        username: '',
        email: '',
        password: '',
        roleId: '',
        storeIds: [],
      });
    }

    // Micro-délai pour que le DOM soit prêt, puis focus sur le premier input du panel
    setTimeout(() => {
      const firstInput = panelRef.current?.querySelector<HTMLElement>(
        'input, select, textarea'
      );
      firstInput?.focus();
    }, 0);
  }, [isOpen, isEditMode, user, reset]);

  // Fermeture au clavier (Escape)
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Soumission : appelle POST ou PUT selon le mode
  async function onSubmit(values: FormValues) {
    setApiError(null);

    // Construction du body de base
    let resolvedStoreIds = values.storeIds;

    // Garantit que les stores protégés sont toujours inclus quand on édite le SA.
    // La checkbox disabled n'est pas toujours fiable dans RHF — on force l'inclusion ici.
    if (isEditingSuperAdmin) {
      const protectedIds = stores
        .filter((s) => s.is_protected)
        .map((s) => s.id);
      const storeIdsSet = new Set(resolvedStoreIds);
      protectedIds.forEach((id) => storeIdsSet.add(id));
      resolvedStoreIds = Array.from(storeIdsSet);
    }

    const body: Record<string, unknown> = {
      username: values.username,
      email: values.email.trim(),
      storeIds: resolvedStoreIds,
    };

    // roleId : exclu si on édite le SA ou si un Admin édite son propre compte.
    // Le backend rejette ces cas de toute façon, mais on évite l'envoi de données
    // non pertinentes côté client.
    if (!isEditingSuperAdmin && !isEditingOwnAdminAccount) {
      body.roleId = values.roleId;
    }

    // Mot de passe : en édition, on n'envoie que s'il est rempli (changement volontaire)
    if (values.password && values.password.trim() !== '') {
      body.password = values.password;
    }

    try {
      if (isEditMode && user) {
        await apiClient.put(`/api/users/${user.id}`, body);
      } else {
        await apiClient.post('/api/users', body);
      }

      onSuccess();
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.message) {
        setApiError(err.response.data.message as string);
      } else {
        setApiError('Une erreur inattendue est survenue.');
      }
    }
  }

  // Titre adapté selon le contexte : SA et Admin éditant leur propre compte
  // voient "Modifier mes informations" plutôt que le nom d'utilisateur.
  const title = isEditingSuperAdmin || isEditingOwnAdminAccount
    ? 'Modifier mes informations'
    : isEditMode
      ? `Modifier l'utilisateur — ${user?.username}`
      : 'Créer un utilisateur';

  return (
    <Portal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="userform-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop — clic en dehors ferme sans soumettre */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel formulaire — max-h + overflow pour les longues listes de magasins */}
      <div
        ref={panelRef}
        className="relative z-10 w-full max-w-lg mx-4 bg-surface border border-borderLight rounded shadow-lg p-6 max-h-[90vh] overflow-y-auto"
      >
        <h2
          id="userform-modal-title"
          className="text-base font-medium text-textMain mb-5"
        >
          {title}
        </h2>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex flex-col gap-4"
        >
          {/* Identifiant */}
          <Input
            id="username"
            label="Identifiant"
            required
            placeholder="ex : jean.dupont"
            error={errors.username?.message}
            {...register('username')}
          />

          {/* Email — obligatoire : utilisé pour la récupération de mot de passe */}
          <Input
            id="email"
            label="Email"
            type="email"
            required
            placeholder="ex : jean.dupont@example.com (récupération de mot de passe)"
            error={errors.email?.message}
            {...register('email')}
          />

          {/* Mot de passe */}
          <Input
            id="password"
            label="Mot de passe"
            type="password"
            showPasswordToggle
            required={!isEditMode}
            placeholder={
              isEditMode
                ? 'Laisser vide pour ne pas changer'
                : 'Minimum 8 caractères, maj, min, chiffre, spécial'
            }
            error={errors.password?.message}
            {...register('password')}
          />

          {/*
            Rôle — masqué si on édite le Super Administrateur, ou si un Admin
            édite son propre compte (un Admin ne peut pas changer son propre rôle,
            seul le SA peut le faire).
          */}
          {!isEditingSuperAdmin && !isEditingOwnAdminAccount && (
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="roleId" required>
                Rôle
              </FieldLabel>
              <select
                id="roleId"
                aria-describedby={errors.roleId ? 'roleId-error' : undefined}
                aria-invalid={Boolean(errors.roleId)}
                {...register('roleId')}
                className={[
                  'w-full px-3 py-2 text-sm bg-background',
                  'border rounded',
                  'text-textPrimary',
                  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary',
                  'transition-colors',
                  errors.roleId ? 'border-danger' : 'border-borderLight',
                ].join(' ')}
              >
                <option value="">-- Sélectionner un rôle --</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              {errors.roleId && (
                <p id="roleId-error" role="alert" className="text-xs text-danger">
                  {errors.roleId.message}
                </p>
              )}
            </div>
          )}

          {/* Magasins — cases à cocher, au moins 1 obligatoire */}
          <fieldset>
            <legend className="text-sm font-medium text-textSecondary mb-2">
              Magasins accessibles
              {!isEditingOwnAdminAccount && (
                <span className="text-danger ml-0.5" aria-hidden="true">
                  *
                </span>
              )}
            </legend>
            {isEditingOwnAdminAccount && (
              <p className="text-xs text-textMuted mb-2">
                Vos accès magasin ne peuvent pas être modifiés par vous-même.
              </p>
            )}

            {stores.length === 0 ? (
              <p className="text-xs text-textMuted">
                Aucun magasin disponible.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {stores.map((store) => {
                  // Un store protégé édité pour le SA est toujours coché et non modifiable.
                  // Les magasins d'un Admin éditant son propre compte sont aussi verrouillés :
                  // un Admin ne peut pas modifier ses propres accès magasin.
                  const isCurrentlyAssigned =
                    isEditingOwnAdminAccount &&
                    (user?.store_access.some((sa) => sa.store.id === store.id) ?? false);
                  const isForced =
                    (isEditingSuperAdmin && store.is_protected === true) ||
                    isCurrentlyAssigned;

                  // Admin éditant son propre compte : stores non attribués → désactivés + décochés
                  if (isEditingOwnAdminAccount && !isCurrentlyAssigned) {
                    return (
                      <div
                        key={store.id}
                        className="flex items-center gap-2 text-sm text-textMuted opacity-50"
                        aria-label={`${store.name} — non modifiable`}
                      >
                        <input
                          type="checkbox"
                          checked={false}
                          disabled
                          aria-checked="false"
                          aria-disabled="true"
                          className="rounded border-borderLight opacity-60 cursor-not-allowed"
                          readOnly
                        />
                        <span>
                          {store.name}
                          {store.location && (
                            <span className="text-textMuted ml-1 text-xs">
                              ({store.location})
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  }

                  if (isForced) {
                    return (
                      <div
                        key={store.id}
                        className="flex items-center gap-2 text-sm text-textMain"
                        aria-label={`${store.name} — requis, non modifiable`}
                      >
                        {/* Checkbox visible mais désactivée pour l'UX */}
                        <input
                          type="checkbox"
                          checked
                          disabled
                          aria-checked="true"
                          aria-disabled="true"
                          className="rounded border-borderLight text-primary focus:ring-primary opacity-60 cursor-not-allowed"
                          readOnly
                        />
                        {/* Input caché pour que RHF reçoive bien la valeur */}
                        <input type="hidden" value={store.id} {...register('storeIds')} />
                        <span className="flex items-center gap-1.5">
                          {store.name}
                          {store.location && (
                            <span className="text-textMuted text-xs">
                              ({store.location})
                            </span>
                          )}
                          {/* Indicateur "verrouillé" */}
                          <span className="inline-flex items-center gap-0.5 text-xs text-textMuted select-none">
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            {isEditingOwnAdminAccount ? 'non modifiable' : 'requis'}
                          </span>
                        </span>
                      </div>
                    );
                  }

                  return (
                    <label
                      key={store.id}
                      className="flex items-center gap-2 text-sm text-textMain cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        value={store.id}
                        {...register('storeIds')}
                        className="rounded border-borderLight text-primary focus:ring-primary"
                      />
                      <span>
                        {store.name}
                        {store.location && (
                          <span className="text-textMuted ml-1 text-xs">
                            ({store.location})
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Erreur de validation sur storeIds */}
            {errors.storeIds && (
              <p role="alert" className="text-xs text-danger mt-1">
                {/* storeIds est un tableau — l'erreur racine est dans .message */}
                {(errors.storeIds as { message?: string }).message ??
                  'Veuillez sélectionner au moins un magasin.'}
              </p>
            )}
          </fieldset>

          {/* Erreur globale renvoyée par l'API */}
          {apiError && (
            <p role="alert" className="text-xs text-danger">
              {apiError}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isSubmitting}
            >
              {isEditMode ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
}
