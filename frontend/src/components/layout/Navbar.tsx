'use client';

// src/components/layout/Navbar.tsx
// Barre de navigation principale du dashboard.
//
// Zone gauche : nom de l'application + badge magasin actif (couleur dynamique)
// Zone droite : UserDropdown (icône profil + username → dropdown rôle/déconnexion)
//
// Pendant l'hydratation (isLoading=true), des placeholders animate-pulse
// évitent le flash d'un contenu absent.

import Link from 'next/link';
import { useSession } from '@/contexts/SessionContext';
import { UserDropdown } from '@/components/layout/UserDropdown';
import { APP_NAME } from '@/lib/config/app';

export function Navbar() {
  const { user, isLoading } = useSession();

  return (
    <header
      className="sticky top-0 z-40 bg-surface border-b border-borderLight h-14 px-6 flex items-center justify-between"
      role="banner"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Zone gauche : nom de l'app + badge magasin                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center gap-3">
        {/* Nom de l'application — lien vers /dashboard, configurable via NEXT_PUBLIC_APP_NAME */}
        <Link
          href="/dashboard"
          className="font-semibold text-textMain tracking-tight hover:opacity-75 transition-opacity"
        >
          {APP_NAME}
        </Link>

        {/* Badge magasin actif — couleur issue de store.color (style inline,
            car valeur dynamique runtime — les classes arbitraires Tailwind
            ne fonctionnent qu'avec des valeurs connues au build) */}
        {isLoading ? (
          <div
            className="h-5 w-28 rounded bg-[#DEE2E6] animate-pulse"
            aria-hidden="true"
          />
        ) : user ? (
          <span
            className="text-white text-xs font-medium px-2 py-0.5 rounded"
            style={{ backgroundColor: user.storeColor }}
            title={`Magasin actif : ${user.storeName}`}
          >
            {user.storeName}
          </span>
        ) : null}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Zone droite : dropdown profil utilisateur                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center">
        {isLoading ? (
          // Placeholder pendant le chargement de la session
          <div
            className="h-8 w-32 rounded bg-[#DEE2E6] animate-pulse"
            aria-hidden="true"
          />
        ) : user ? (
          <UserDropdown />
        ) : null}
      </div>
    </header>
  );
}
