'use client';

// src/components/layout/UserDropdown.tsx
//
// Bouton de profil utilisateur avec dropdown.
//
// Affiche : icône profil + username
// Au clic : dropdown avec rôle, magasin actif (pastille couleur) et déconnexion
//
// Fermeture : clic extérieur (mousedown) + touche Escape

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/contexts/SessionContext';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { APP_NAME } from '@/lib/config/app';

function IconProfile() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function UserDropdown() {
  const { user, logout } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Fermeture à la touche Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  if (!user) return null;

  return (
    <div ref={containerRef} className="relative">
      {/* Bouton trigger — icône profil + username */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-textMuted hover:text-textMain hover:bg-background transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
      >
        <span className="text-textSecondary">
          <IconProfile />
        </span>
        <span className="font-medium text-textMain">{user.username}</span>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-56 bg-surface border border-borderLight rounded shadow-lg z-50"
        >
          {/* Identité */}
          <div className="px-4 py-3 border-b border-borderLight">
            <p className="text-sm font-medium text-textMain">{user.username}</p>
            <div className="mt-1">
              <RoleBadge roleName={user.roleName} />
            </div>
          </div>

          {/* Magasin actif */}
          <div className="px-4 py-3 border-b border-borderLight flex items-center gap-2">
            {/* Pastille couleur du magasin — style inline car valeur dynamique runtime */}
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: user.storeColor }}
              aria-hidden="true"
            />
            <span className="text-xs text-textMuted truncate">{user.storeName}</span>
          </div>

          {/* Paramètres */}
          <div className="px-2 pt-1">
            <Link
              href="/dashboard/parametres"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="block px-3 py-2 text-sm text-textMuted hover:text-textMain hover:bg-background rounded transition-colors"
            >
              Paramètres
            </Link>
          </div>

          {/* Déconnexion */}
          <div className="px-2 pb-2">
            <button
              role="menuitem"
              onClick={() => { setIsOpen(false); logout(); }}
              aria-label={`Se déconnecter de ${APP_NAME}`}
              className="w-full text-left px-3 py-2 text-sm text-danger hover:bg-danger/5 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-danger"
            >
              Déconnexion
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
