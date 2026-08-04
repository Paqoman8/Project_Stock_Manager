// src/components/users/DeactivateUserModal.tsx
// Modale de confirmation pour désactiver un utilisateur.
//
// Utilise le composant Modal existant (friction positive — UI_UX_KIT §5).
// La désactivation est "soft delete" : le compte reste en base mais is_active = false.
// Le backend renvoie 422 si on tente de désactiver le dernier Super Admin actif.
//
// Sécurité UI — garde défensive :
//   Si user.role.name === 'Super Administrateur', la modale retourne null
//   immédiatement. C'est la dernière ligne de défense côté UI — normalement
//   le bouton "Désactiver" n'est jamais affiché pour le SA (page parente).
//
// Pattern : l'erreur API est affichée sous le message de confirmation
// en réutilisant le slot "message" de Modal, enrichi d'un rendu conditionnel
// autour du panel. On ne peut pas injecter du JSX dans Modal (il attend string),
// donc on contourne en rendant un panel custom inspiré du même style backdrop.

'use client';

import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/Button';
import { Portal } from '@/components/ui/Portal';
import apiClient from '@/lib/apiClient';

// ---------------------------------------------------------------------------
// Types locaux — alignés avec UserRow dans la page parente
// ---------------------------------------------------------------------------

interface Role {
  id: string;
  name: string;
}

interface Store {
  id: string;
  name: string;
  location: string | null;
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

interface DeactivateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: UserRow | null;
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function DeactivateUserModal({
  isOpen,
  onClose,
  onSuccess,
  user,
}: DeactivateUserModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [reason, setReason] = useState('');
  // Message d'erreur renvoyé par l'API (ex : dernier Super Admin actif)
  const [apiError, setApiError] = useState<string | null>(null);
  // Ref pour le focus initial sur "Annuler" — friction positive (UI_UX_KIT §5)
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Réinitialise l'état et repositionne le focus à chaque ouverture
  useEffect(() => {
    if (isOpen) {
      setApiError(null);
      setReason('');
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
  // Normalement inaccessible (bouton absent dans le tableau), mais on se protège
  // d'un éventuel appel direct ou d'une future régression.
  if (!isOpen || !user) return null;
  if (user.role.name === 'Super Administrateur') return null;

  async function handleConfirm() {
    if (!user) return;
    setIsConfirming(true);
    setApiError(null);

    try {
      await apiClient.delete(`/api/users/${user.id}`, {
        data: reason.trim() ? { reason: reason.trim() } : undefined,
      });
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
    <Portal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deactivate-modal-title"
      aria-describedby="deactivate-modal-desc"
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
          id="deactivate-modal-title"
          className="text-base font-medium text-textMain mb-2"
        >
          Désactiver l&apos;utilisateur
        </h2>

        <p id="deactivate-modal-desc" className="text-sm text-textMuted mb-4">
          Êtes-vous sûr de vouloir désactiver le compte de{' '}
          <span className="font-medium text-textMain">{user.username}</span> ?
          <br />
          Le compte sera conservé mais l&apos;utilisateur ne pourra plus se connecter.
        </p>

        {/* Raison optionnelle — tracée dans le journal d'audit */}
        <div className="flex flex-col gap-1 mb-4">
          <label
            htmlFor="deactivate-reason"
            className="text-sm font-medium text-textSecondary"
          >
            Raison <span className="text-textMuted font-normal">(optionnel)</span>
          </label>
          <textarea
            id="deactivate-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Ex : départ de l'entreprise, compte compromis…"
            className="w-full px-3 py-2 text-sm bg-background border border-borderLight rounded text-textPrimary placeholder-textMuted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors resize-none"
          />
        </div>

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
            variant="danger"
            size="md"
            onClick={handleConfirm}
            isLoading={isConfirming}
          >
            Désactiver
          </Button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
