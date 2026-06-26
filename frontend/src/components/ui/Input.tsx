// src/components/ui/Input.tsx
// Champ de saisie avec label au-dessus (design system Stock Manager, UI_UX_KIT.md).
// Gère l'état d'erreur, le champ obligatoire, et l'accessibilité (aria).
// Navigation Tab optimisée selon le design system §C.
//
// Prop `showPasswordToggle` : active un bouton œil pour afficher/masquer le mot
// de passe. Ne s'applique qu'aux champs de type "password".

'use client';

import React, { useState } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  // id est obligatoire : il relie le label à l'input pour l'accessibilité.
  id: string;
  // Active le bouton d'affichage/masquage du mot de passe.
  showPasswordToggle?: boolean;
}

// Icône œil ouvert (mot de passe visible)
function IconEye() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Icône œil barré (mot de passe masqué)
function IconEyeOff() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

export function Input({
  label,
  error,
  required = false,
  id,
  className = '',
  showPasswordToggle = false,
  // On extrait `type` pour le contrôler nous-mêmes quand le toggle est actif
  type,
  ...props
}: InputProps) {
  const [visible, setVisible] = useState(false);

  // Le type effectif : si toggle actif, on bascule entre "text" et "password"
  const effectiveType = showPasswordToggle
    ? visible ? 'text' : 'password'
    : type;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-textSecondary">
        {label}
        {required && (
          <span className="text-danger ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {/* Wrapper relatif pour positionner le bouton à l'intérieur du champ */}
      <div className="relative">
        <input
          id={id}
          type={effectiveType}
          required={required}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={Boolean(error)}
          className={[
            'w-full px-3 py-2 text-sm bg-background',
            'border rounded',
            'text-textPrimary placeholder-textMuted',
            'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary',
            'transition-colors',
            error ? 'border-danger' : 'border-borderLight',
            // Espace à droite pour le bouton quand le toggle est actif
            showPasswordToggle ? 'pr-9' : '',
            className,
          ].join(' ')}
          {...props}
        />

        {showPasswordToggle && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            // tabIndex={-1} : le bouton n'est pas dans la navigation Tab
            // car l'action est secondaire et accessible autrement
            tabIndex={-1}
            aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            className="absolute inset-y-0 right-0 flex items-center px-2.5 text-textMuted hover:text-textMain transition-colors"
          >
            {visible ? <IconEyeOff /> : <IconEye />}
          </button>
        )}
      </div>

      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
