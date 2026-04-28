// src/components/ui/Input.tsx
// Champ de saisie avec label au-dessus (design system GStock, UI_UX_KIT.md).
// Gère l'état d'erreur, le champ obligatoire, et l'accessibilité (aria).
// Navigation Tab optimisée selon le design system §C.

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  // id est obligatoire : il relie le label à l'input pour l'accessibilité.
  id: string;
}

export function Input({
  label,
  error,
  required = false,
  id,
  className = '',
  ...props
}: InputProps) {
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
      <input
        id={id}
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
          className,
        ].join(' ')}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
