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
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

// Icône "Journal d'audit" : presse-papier avec lignes de texte.
function IconAudit({ className }: { className?: string }) {
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
      {/* Presse-papier */}
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      {/* Lignes de texte */}
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Rôles autorisés aux sections d'administration
// ---------------------------------------------------------------------------

const ROLES_ADMIN: readonly string[] = ['Super Administrateur', 'Administrateur'];

// ---------------------------------------------------------------------------
// Helper : élément de navigation
// ---------------------------------------------------------------------------

function NavItem({
  href,
  label,
  icon,
  currentPath,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  currentPath: string;
}) {
  const isActive = currentPath.startsWith(href);
  return (
    <li>
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
        {icon}
        {label}
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function Sidebar() {
  const pathname = usePathname();
  const { user, isLoading } = useSession();

  // Les liens réservés SA/Admin sont absents du DOM tant que la session charge,
  // pour éviter tout flash d'accès interdit ou fuite via les technologies d'assistance.
  const estAdmin = !isLoading && user !== null && ROLES_ADMIN.includes(user.roleName);

  return (
    <aside
      className="bg-surface border-r border-borderLight w-56 flex-shrink-0 flex flex-col py-4"
      aria-label="Navigation principale"
      role="navigation"
    >
      <nav>
        <ul className="flex flex-col gap-0.5" role="list">
          {estAdmin && (
            <>
              <NavItem
                href="/dashboard/users"
                label="Utilisateurs"
                icon={<IconUsers className="flex-shrink-0" />}
                currentPath={pathname}
              />
              <NavItem
                href="/dashboard/audit"
                label="Journal d'audit"
                icon={<IconAudit className="flex-shrink-0" />}
                currentPath={pathname}
              />
            </>
          )}
        </ul>
      </nav>
    </aside>
  );
}
