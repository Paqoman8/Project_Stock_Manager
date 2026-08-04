// src/components/platform/PlatformNavbar.tsx
//
// Navbar du panneau plateforme — volontairement distincte de la Navbar
// dashboard : pas de chip organisation/magasin (le Platform Manager n'agit
// pas dans le contexte d'une organisation précise), bouton retour vers
// l'espace dashboard, et déconnexion directe (pas de dropdown métier).

'use client';

import { useRouter } from 'next/navigation';
import { useSession } from '@/contexts/SessionContext';

function IconArrowLeft() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

export function PlatformNavbar() {
  const { user, logout } = useSession();
  const router = useRouter();

  return (
    <header
      className="sticky top-0 z-40 bg-textMain text-white h-14 px-4 flex items-center justify-between"
      role="banner"
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          aria-label="Retour"
          className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <IconArrowLeft />
        </button>
        <span className="font-semibold tracking-tight">Panneau Plateforme</span>
      </div>

      {user && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/70">{user.username}</span>
          <button
            onClick={() => logout()}
            className="text-xs font-medium px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
          >
            Déconnexion
          </button>
        </div>
      )}
    </header>
  );
}
