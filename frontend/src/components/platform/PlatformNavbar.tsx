// src/components/platform/PlatformNavbar.tsx
//
// Navbar du panneau plateforme — volontairement distincte de la Navbar
// dashboard : pas de chip organisation/magasin (le Platform Manager n'agit
// pas dans le contexte d'une organisation précise), et déconnexion directe
// (pas de dropdown métier).

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/contexts/SessionContext';
import { Modal } from '@/components/ui/Modal';

export function PlatformNavbar() {
  const { user, logout } = useSession();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleConfirmLogout() {
    setIsLoggingOut(true);
    await logout();
    // Pas de reset d'état ici : logout() redirige vers /login,
    // ce composant est démonté avant qu'un nouveau render ait lieu.
  }

  return (
    <header
      className="sticky top-0 z-40 bg-textMain text-white h-14 px-4 flex items-center justify-between"
      role="banner"
    >
      <div className="flex items-center gap-3">
        <Link href="/platform" className="font-semibold tracking-tight hover:opacity-80 transition-opacity">
          Panneau Plateforme
        </Link>
      </div>

      {user && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/70">{user.username}</span>
          <button
            onClick={() => setConfirmingLogout(true)}
            className="text-xs font-medium px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
          >
            Déconnexion
          </button>
        </div>
      )}

      <Modal
        isOpen={confirmingLogout}
        title="Se déconnecter"
        message="Voulez-vous vraiment vous déconnecter du panneau plateforme ?"
        confirmLabel="Déconnexion"
        confirmVariant="danger"
        cancelLabel="Annuler"
        onConfirm={handleConfirmLogout}
        onCancel={() => setConfirmingLogout(false)}
        isConfirming={isLoggingOut}
      />
    </header>
  );
}
