// src/components/platform/OrganizationCreatedModal.tsx
// Modal "À transmettre" affiché une seule fois après la création réussie
// d'une organisation — identifiants admin temporaires, copiables en un clic.
// Modelé sur components/users/ResetPasswordModal.tsx (même besoin : afficher
// un secret généré une seule fois, avant qu'il ne disparaisse définitivement).

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Portal } from '@/components/ui/Portal';

interface OrganizationCreatedModalProps {
  organizationName: string;
  adminUsername: string;
  adminPassword: string;
  onClose: () => void;
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback : la sélection manuelle (select-all) reste disponible
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-textSecondary">{label}</span>
      <div className="bg-background border border-borderLight rounded px-3 py-2.5 flex items-center justify-between">
        <code className="text-sm font-mono text-textPrimary select-all">{value}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="ml-2 px-2 py-1 text-xs text-primary hover:bg-primary/10 rounded transition-colors flex-shrink-0"
        >
          {copied ? 'Copié !' : 'Copier'}
        </button>
      </div>
    </div>
  );
}

export function OrganizationCreatedModal({
  organizationName,
  adminUsername,
  adminPassword,
  onClose,
}: OrganizationCreatedModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  return (
    <Portal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="org-created-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-sm bg-surface border border-borderLight rounded shadow-lg p-6 mx-4">
        <h2 id="org-created-modal-title" className="text-base font-medium text-textMain mb-2">
          Organisation créée
        </h2>

        <p className="text-sm text-textMuted mb-4">
          <span className="font-medium text-textPrimary">{organizationName}</span> a été créée
          avec succès. Voici les identifiants du compte administrateur — à transmettre :
        </p>

        <div className="space-y-3 mb-4">
          <CopyField label="Identifiant" value={adminUsername} />
          <CopyField label="Mot de passe temporaire" value={adminPassword} />
        </div>

        <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2 mb-5">
          Ce mot de passe ne sera plus affiché après la fermeture de cette fenêtre.
          L&apos;administrateur devra le changer à sa première connexion.
        </p>

        <div className="flex justify-end">
          <button
            ref={closeBtnRef}
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
