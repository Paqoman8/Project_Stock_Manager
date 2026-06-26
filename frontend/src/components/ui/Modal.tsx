// src/components/ui/Modal.tsx
// Modale de confirmation — obligatoire pour toute mutation d'inventaire
// selon la règle de "Friction Positive" du design system (UI_UX_KIT.md §5).
// Focus initial sur "Annuler" pour éviter les confirmations accidentelles.
// Fermeture via Escape ou clic sur le backdrop.

'use client';

import React, { useEffect, useRef } from 'react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming?: boolean;
}

export function Modal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmer',
  confirmVariant = 'primary',
  cancelLabel = 'Annuler',
  onConfirm,
  onCancel,
  isConfirming = false,
}: ModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus sur "Annuler" à l'ouverture — réduit le risque de confirmation accidentelle.
  useEffect(() => {
    if (isOpen) {
      cancelButtonRef.current?.focus();
    }
  }, [isOpen]);

  // Fermeture au appui sur Escape.
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCancel();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby="modal-message"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop — clic en dehors ferme la modale */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Panel — z-index supérieur au backdrop */}
      <div className="relative z-10 w-full max-w-sm bg-surface border border-borderLight rounded shadow-lg p-6">
        <h2 id="modal-title" className="text-base font-medium text-textMain mb-2">
          {title}
        </h2>
        <p id="modal-message" className="text-sm text-textMuted mb-6">
          {message}
        </p>

        <div className="flex justify-end gap-3">
          <Button
            ref={cancelButtonRef}
            variant="secondary"
            size="md"
            onClick={onCancel}
            disabled={isConfirming}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            size="md"
            onClick={onConfirm}
            isLoading={isConfirming}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
