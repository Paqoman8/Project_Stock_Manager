'use client';

import React, { useRef, useEffect } from 'react';
import { Portal } from '@/components/ui/Portal';

interface ResetPasswordModalProps {
  username: string;
  temporaryPassword: string;
  onClose: () => void;
}

export function ResetPasswordModal({
  username,
  temporaryPassword,
  onClose,
}: ResetPasswordModalProps) {
  const copyBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    copyBtnRef.current?.focus();
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
    } catch {
      // fallback : la sélection manuelle reste disponible
    }
  }

  return (
    <Portal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rp-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-sm bg-surface border border-borderLight rounded shadow-lg p-6 mx-4">
        <h2
          id="rp-modal-title"
          className="text-base font-medium text-textMain mb-2"
        >
          Mot de passe réinitialisé
        </h2>

        <p className="text-sm text-textMuted mb-4">
          Le mot de passe de <span className="font-medium text-textPrimary">{username}</span>{' '}
          a été réinitialisé. Voici le mot de passe temporaire&nbsp;:
        </p>

        <div className="bg-background border border-borderLight rounded px-3 py-2.5 mb-4 flex items-center justify-between">
          <code className="text-sm font-mono text-textPrimary select-all">
            {temporaryPassword}
          </code>
          <button
            ref={copyBtnRef}
            onClick={handleCopy}
            className="ml-2 px-2 py-1 text-xs text-primary hover:bg-primary/10 rounded transition-colors flex-shrink-0"
          >
            Copier
          </button>
        </div>

        <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2 mb-5">
          Ce mot de passe ne sera plus affiché après la fermeture de cette fenêtre.
          L&apos;utilisateur devra le changer à sa prochaine connexion.
        </p>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="py-2 px-4 bg-primary text-white text-sm font-medium rounded hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-opacity"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
