'use client';

// src/components/layout/Navbar.tsx

import Link from 'next/link';
import { useSession } from '@/contexts/SessionContext';
import { UserDropdown } from '@/components/layout/UserDropdown';
import { APP_NAME } from '@/lib/config/app';

function IconMenu() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function Navbar({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const { user, isLoading } = useSession();

  return (
    <header
      className="sticky top-0 z-40 bg-surface border-b border-borderLight h-14 px-4 flex items-center justify-between"
      role="banner"
    >
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            aria-label="Afficher/masquer la navigation"
            className="p-1.5 rounded text-textMuted hover:text-textMain hover:bg-background transition-colors"
          >
            <IconMenu />
          </button>
        )}

        <Link
          href="/dashboard"
          className="font-semibold text-textMain tracking-tight hover:opacity-75 transition-opacity"
        >
          {APP_NAME}
        </Link>

        {isLoading ? (
          <div className="flex items-center gap-2">
            <div className="h-5 w-28 rounded bg-[#DEE2E6] animate-pulse" aria-hidden="true" />
            <div className="h-5 w-20 rounded bg-[#DEE2E6] animate-pulse" aria-hidden="true" />
          </div>
        ) : user ? (
          <>
            {user.orgName && (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-background border border-borderLight text-textMuted">
                {user.orgName}
              </span>
            )}
            <span
              className="text-white text-xs font-medium px-2 py-0.5 rounded"
              style={{ backgroundColor: user.storeColor }}
              title={`Magasin actif : ${user.storeName}`}
            >
              {user.storeName}
            </span>
          </>
        ) : null}
      </div>

      <div className="flex items-center">
        {isLoading ? (
          <div className="h-8 w-32 rounded bg-[#DEE2E6] animate-pulse" aria-hidden="true" />
        ) : user ? (
          <UserDropdown />
        ) : null}
      </div>

      {user?.mustChangePassword && (
        <div className="absolute left-0 right-0 top-14 bg-yellow-50 border-b border-yellow-200 px-4 py-1.5 text-center">
          <p className="text-xs text-yellow-800 font-medium">
            Vous devez changer votre mot de passe.{' '}
            <Link
              href="/dashboard/parametres"
              className="underline hover:no-underline"
            >
              Cliquez ici
            </Link>
          </p>
        </div>
      )}
    </header>
  );
}
