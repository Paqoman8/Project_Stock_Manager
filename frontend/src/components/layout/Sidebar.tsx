// src/components/layout/Sidebar.tsx
// Menu de navigation latéral du dashboard GStock.
//
// Design : sobre, compact, avec une seule icône par section (UI_UX_KIT §D).
// L'état actif est dérivé de usePathname() — pas de state local fragile.
//
// Structure évolutive : navLinks est un tableau typé,
// il suffira d'y ajouter une entrée pour étendre la navigation.
//
// Visibilité conditionnelle :
//   - Le lien "Utilisateurs" n'est rendu que si le rôle de la session est
//     'Super Administrateur' ou 'Administrateur'.
//   - Pendant le chargement (isLoading) on n'affiche rien pour ce lien
//     afin d'éviter un flash d'accès interdit.
//   - Le noeud est absent du DOM (pas de hidden) : pas de risque de fuite
//     d'information via l'accessibilité (screen readers).

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/contexts/SessionContext';

// ---------------------------------------------------------------------------
// Icône SVG inline — pas de dépendance externe pour un seul picto
// ---------------------------------------------------------------------------

// Icône "Utilisateurs" : silhouette groupe, stroke uniquement pour la lisibilité
// aux petites tailles (14–16px).
function IconUsers({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* Personne principale */}
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      {/* Personne secondaire (groupe) */}
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Rôles autorisés à voir le lien "Utilisateurs"
// ---------------------------------------------------------------------------

const ROLES_ADMIN: readonly string[] = ['Super Administrateur', 'Administrateur'];

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function Sidebar() {
  const pathname = usePathname();
  const { user, isLoading } = useSession();

  // Détermine si l'utilisateur courant a accès à la gestion des utilisateurs.
  // On n'évalue qu'après la fin du chargement pour éviter un flash.
  const peutVoirUtilisateurs =
    !isLoading && user !== null && ROLES_ADMIN.includes(user.roleName);

  return (
    <aside
      className="bg-surface border-r border-borderLight w-56 flex-shrink-0 flex flex-col py-4"
      aria-label="Navigation principale"
      role="navigation"
    >
      <nav>
        <ul className="flex flex-col gap-0.5" role="list">
          {/*
            Lien "Utilisateurs" — absent du DOM si le rôle n'est pas autorisé
            ou si la session est encore en chargement.
            On n'utilise pas `hidden` ou `visibility:hidden` pour ne pas exposer
            le noeud aux technologies d'assistance.
          */}
          {peutVoirUtilisateurs && (
            <li>
              {(() => {
                const href = '/dashboard/users';
                const isActive = pathname.startsWith(href);
                return (
                  <Link
                    href={href}
                    className={[
                      'flex items-center gap-3 px-4 py-2 text-sm rounded mx-2 transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-textMuted hover:bg-background hover:text-textMain',
                    ].join(' ')}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <IconUsers className="flex-shrink-0" />
                    Utilisateurs
                  </Link>
                );
              })()}
            </li>
          )}
        </ul>
      </nav>
    </aside>
  );
}
