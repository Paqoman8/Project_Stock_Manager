// src/components/ui/Card.tsx
// Conteneur "surface" (fond blanc, bordure fine, ombre légère).
// Correspond au style des panels/formulaires défini dans UI_UX_KIT.md §A.
// Titre optionnel : H2 16px Medium, séparé du contenu par une bordure.

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export function Card({ children, className = '', title }: CardProps) {
  return (
    <div
      className={[
        'bg-surface border border-borderLight rounded shadow-sm',
        className,
      ].join(' ')}
    >
      {title && (
        <div className="px-6 py-4 border-b border-borderLight">
          <h2 className="text-base font-medium text-textMain">{title}</h2>
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}
