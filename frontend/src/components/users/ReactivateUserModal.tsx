// src/components/users/ReactivateUserModal.tsx
// Modale de confirmation pour réactiver un utilisateur désactivé.
//
// Symétrique à DeactivateUserModal — même structure, même pattern UX.
// La réactivation appelle PATCH /api/users/:id/reactivate.
//
// Sécurité UI — garde défensive :
//   Si user.role.name === 'Super Administrateur', la modale retourne null.
//   Le bouton "Réactiver" n'est jamais affiché pour le SA dans la page parente,
//   mais on se protège d'une éventuelle régression future.
//
// Friction positive (UI_UX_KIT §5) :
//   Le focus initial est posé sur le bouton "Annuler" pour éviter une
//   validation accidentelle par appui sur Entrée.

'use client';

import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/Button';
import apiClient from '@/lib/apiClient';
import type { UserRow } from '@/app/dashboard/users/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReactivateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: UserRow | null;
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function ReactivateUserModal({
  isOpen,
  onClose,
  onSuccess,
  user,
}: ReactivateUserModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  // Message d'erreur renvoyé par l'API
  const [apiError, setApiError] = useState<string | null>(null);
  // Ref pour le focus initial sur "Annuler" — friction positive
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Réinitialise l'erreur et repositionne le focus à chaque ouverture
  useEffect(() => {
    if (isOpen) {
      setApiError(null);
      // Micro-délai nécessaire pour que le DOM soit rendu avant le focus
      setTimeout(() => cancelRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Fermeture au clavier (Escape)
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Garde défensive : ne jamais rendre la modale pour le Super Administrateur.
  if (!isOpen || !user) return null;
  if (user.role.name === 'Super Administrateur') return null;

  async function handleConfirm() {
    if (!user) return;
    setIsConfirming(true);
    setApiError(null);

    try {
      // PATCH /api/users/:id/reactivate — remet is_active à true
      await apiClient.patch(`/api/users/${user.id}/reactivate`);
      // Succès : on notifie la page parente pour qu'elle recharge la liste
      onSuccess();
      onClose();
    } catch (err) {
      // Récupère le message métier du backend si disponible
      if (axios.isAxiosError(err) && err.response?.data?.message) {
        setApiError(err.response.data.message as string);
      } else {
        setApiError('Une erreur inattendue est survenue.');
      }
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reactivate-modal-title"
      aria-describedby="reactivate-modal-desc"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop — clic en dehors annule sans agir */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel de confirmation */}
      <div className="relative z-10 w-full max-w-sm bg-surface border border-borderLight rounded shadow-lg p-6">
        <h2
          id="reactivate-modal-title"
          className="text-base font-medium text-textMain mb-2"
        >
          Réactiver l&apos;utilisateur
        </h2>

        <p id="reactivate-modal-desc" className="text-sm text-textMuted mb-4">
          Voulez-vous réactiver le compte de{' '}
          <span className="font-medium text-textMain">{user.username}</span> ?
          <br />
          Il pourra à nouveau se connecter à l&apos;application.
        </p>

        {/* Erreur API — visible uniquement en cas d'échec */}
        {apiError && (
          <p role="alert" className="text-xs text-danger mb-4">
            {apiError}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Button
            ref={cancelRef}
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isConfirming}
          >
            Annuler
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleConfirm}
            isLoading={isConfirming}
          >
            Réactiver
          </Button>
        </div>
      </div>
    </div>
  );
}
