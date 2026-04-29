// src/components/ui/RoleBadge.tsx
// Badge coloré affichant le rôle d'un utilisateur.
//
// La couleur est choisie sémantiquement selon le rôle pour permettre une
// lecture rapide du tableau des utilisateurs sans effort cognitif :
//   - Super Administrateur → couleur primaire (distinction maximale)
//   - Administrateur       → violet (autorité haute, secondaire)
//   - Manager Magasin      → jaune moutarde (attention, intermédiaire)
//   - Opérateur            → vert (rôle standard, nominal)
//   - inconnu              → gris neutre (pas de sémantique imposée)
//
// Pas de 'use client' : composant purement présentationnel, aucun hook.

import React from 'react';

interface RoleBadgeProps {
  roleName: string;
  className?: string;
}

// Mappe chaque nom de rôle connu vers ses classes Tailwind.
// Les tokens (primary, warning, success) sont définis dans tailwind.config.
function resolveRoleClasses(roleName: string): string {
  switch (roleName) {
    case 'Super Administrateur':
      return 'bg-primary/10 text-primary';
    case 'Administrateur':
      return 'bg-purple-100 text-purple-700';
    case 'Manager Magasin':
      // warning est jaune moutarde — le texte sombre améliore le contraste WCAG AA
      return 'bg-warning/20 text-yellow-700';
    case 'Opérateur':
      return 'bg-success/10 text-success';
    default:
      // Rôle inconnu : neutre pour ne pas induire de sens erroné
      return 'bg-background text-textMuted';
  }
}

export function RoleBadge({ roleName, className = '' }: RoleBadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        resolveRoleClasses(roleName),
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {roleName}
    </span>
  );
}
