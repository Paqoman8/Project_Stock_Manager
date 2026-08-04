// src/components/platform/OrganizationFormModal.tsx
// Modale de création d'une organisation — Platform Manager uniquement.
//
// Le panel est répliqué depuis Modal.tsx (même style backdrop/panel), à
// l'image de UserFormModal : Modal.tsx n'accepte que du texte, pas de JSX
// de formulaire.
//
// La création reste atomique : onCreated() n'est appelé qu'après une
// réponse 201 effective de l'API — aucun état intermédiaire ne peut
// déclencher l'étape suivante (modal "à transmettre").

'use client';

import React, { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { extractApiErrorMessage } from '@/lib/errors';
import { createOrganization } from '@/services/platform.service';
import {
  createOrganizationSchema,
  slugify,
  type CreateOrganizationFormValues,
} from '@/validators/platform.validators';

interface OrganizationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (result: { organizationName: string; adminUsername: string; adminPassword: string }) => void;
}

export function OrganizationFormModal({ isOpen, onClose, onCreated }: OrganizationFormModalProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<CreateOrganizationFormValues>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: '', slug: '', adminEmail: '' },
  });

  // Réinitialise le formulaire à chaque ouverture et pose le focus initial.
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    reset({ name: '', slug: '', adminEmail: '' });
    setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('input')?.focus();
    }, 0);
  }, [isOpen, reset]);

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

  async function onSubmit(data: CreateOrganizationFormValues) {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const response = await createOrganization(data);
      // onCreated() ne part que si la création a réellement réussi de bout
      // en bout — aucun affichage intermédiaire possible.
      onCreated({
        organizationName: response.organization.name,
        adminUsername: response.adminUsername,
        adminPassword: response.adminPassword,
      });
    } catch (error: unknown) {
      setErrorMessage(extractApiErrorMessage(error, 'Impossible de créer l\'organisation.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="orgform-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop — clic en dehors ferme sans soumettre */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        className="relative z-10 w-full max-w-lg mx-4 bg-surface border border-borderLight rounded shadow-lg p-6"
      >
        <h2 id="orgform-modal-title" className="text-base font-medium text-textMain mb-5">
          Nouvelle organisation
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Input
            id="org-name"
            label="Nom de l'organisation"
            required
            placeholder="Acme Corp"
            error={errors.name?.message}
            {...register('name', {
              onChange: (e: ChangeEvent<HTMLInputElement>) => {
                // Tant que l'utilisateur n'a pas lui-même édité le slug, on le dérive du nom.
                if (!dirtyFields.slug) {
                  setValue('slug', slugify(e.target.value), { shouldValidate: true });
                }
              },
            })}
          />

          <div>
            <Input
              id="org-slug"
              label="Slug"
              required
              placeholder="acme-corp"
              error={errors.slug?.message}
              {...register('slug')}
            />
            <p className="text-xs text-textMuted mt-1">
              Généré automatiquement depuis le nom — modifiable librement.
            </p>
          </div>

          <Input
            id="org-admin-email"
            label="Email de l'administrateur"
            type="email"
            required
            placeholder="admin@acme.com"
            error={errors.adminEmail?.message}
            {...register('adminEmail')}
          />

          {errorMessage && (
            <div
              className="px-3 py-2 bg-danger bg-opacity-10 border border-danger border-opacity-30 rounded text-danger text-sm"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" size="md" onClick={onClose} disabled={isSubmitting}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isSubmitting}>
              Créer l&apos;organisation
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
