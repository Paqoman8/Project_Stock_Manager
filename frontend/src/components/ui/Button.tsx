// src/components/ui/Button.tsx
// Bouton réutilisable respectant le design system (UI_UX_KIT.md).
// Variantes : primary (bleu fond plein), secondary (gris clair), danger (rouge).
// Border-radius 4px (aspect logiciel professionnel, selon le design system).
// forwardRef inclus pour permettre le focus programmatique (ex: Modal).

import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white hover:opacity-90 focus:ring-primary disabled:opacity-50',
  secondary:
    'bg-[#E9ECEF] text-textMain border border-borderLight hover:bg-[#DEE2E6] focus:ring-borderLight disabled:opacity-50',
  danger:
    'bg-danger text-white hover:opacity-90 focus:ring-danger disabled:opacity-50',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      children,
      className = '',
      ...props
    },
    ref
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={[
          'inline-flex items-center justify-center gap-2',
          'font-medium rounded',
          'focus:outline-none focus:ring-2 focus:ring-offset-1',
          'transition-opacity cursor-pointer',
          'disabled:cursor-not-allowed',
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(' ')}
        {...props}
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span>Chargement...</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);
