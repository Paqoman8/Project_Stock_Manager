// src/components/layout/Navbar.tsx
// Barre de navigation principale du dashboard GStock.
//
// Affiche en permanence (comme prescrit dans UI_UX_KIT.md §D) :
//   - Nom de l'application (ancre visuelle)
//   - Badge "Scope" indiquant le magasin actif de l'utilisateur
//   - Nom d'utilisateur + bouton de déconnexion
//
// Pendant l'hydratation (isLoading=true), des placeholders animate-pulse
// évitent le flash d'un contenu absent.

'use client';

import { useSession } from '@/contexts/SessionContext';
import { Button } from '@/components/ui/Button';
import { RoleBadge } from '@/components/ui/RoleBadge';

export function Navbar() {
  const { user, isLoading, logout } = useSession();

  return (
    <header
      className="sticky top-0 z-40 bg-surface border-b border-borderLight h-14 px-6 flex items-center justify-between"
      role="banner"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Zone gauche : logo + badge magasin                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center gap-3">
        {/* Nom de l'application — ancre visuelle permanente */}
        <span className="font-semibold text-textMain tracking-tight">
          GStock
        </span>

        {/* Badge magasin actif (Scope contextuel — UI_UX_KIT §D) */}
        {isLoading ? (
          // Placeholder pendant le chargement de la session
          <div
            className="h-5 w-28 rounded bg-[#DEE2E6] animate-pulse"
            aria-hidden="true"
          />
        ) : user ? (
          <span
            className="bg-primary text-white text-xs font-medium px-2 py-0.5 rounded"
            title={`Magasin actif : ${user.storeName}`}
          >
            {user.storeName}
          </span>
        ) : null}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Zone droite : username + déconnexion                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center gap-4">
        {isLoading ? (
          // Placeholders pour username + badge rôle + bouton déconnexion
          <>
            <div
              className="h-4 w-24 rounded bg-[#DEE2E6] animate-pulse"
              aria-hidden="true"
            />
            {/* Placeholder du badge de rôle */}
            <div
              className="w-20 h-4 bg-borderLight rounded animate-pulse"
              aria-hidden="true"
            />
            <div
              className="h-7 w-24 rounded bg-[#DEE2E6] animate-pulse"
              aria-hidden="true"
            />
          </>
        ) : user ? (
          <>
            {/* Bloc identité : username + badge de rôle */}
            <div className="hidden sm:flex flex-col items-end gap-0.5">
              <span className="text-sm text-textMuted leading-none">
                {user.username}
              </span>
              {/* Badge rôle — lecture rapide du niveau de permission actif */}
              <RoleBadge roleName={user.roleName} />
            </div>

            {/* Bouton déconnexion — action secondaire non destructive */}
            <Button
              variant="secondary"
              size="sm"
              onClick={logout}
              aria-label="Se déconnecter de GStock"
            >
              Déconnexion
            </Button>
          </>
        ) : null}
      </div>
    </header>
  );
}
