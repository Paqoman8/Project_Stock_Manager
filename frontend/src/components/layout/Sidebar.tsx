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

// Icône "Établissements" : bâtiment / store front.
function IconStores({ className }: { className?: string }) {
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
      {/* Façade */}
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      {/* Porte */}
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

// Icône "Fournisseurs" : camion de livraison, stroke uniquement.
function IconSuppliers({ className }: { className?: string }) {
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
      {/* Cabine */}
      <rect x="1" y="3" width="15" height="13" rx="1" />
      {/* Remorque */}
      <path d="M16 8h4l3 5v4h-7V8z" />
      {/* Roue gauche */}
      <circle cx="5.5" cy="18.5" r="2.5" />
      {/* Roue droite */}
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

// Icône "Catalogue" : grille 2×2 (4 carreaux), stroke uniquement.
function IconCatalogue({ className }: { className?: string }) {
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
      {/* Carreau haut-gauche */}
      <rect x="3" y="3" width="8" height="8" rx="1" />
      {/* Carreau haut-droit */}
      <rect x="13" y="3" width="8" height="8" rx="1" />
      {/* Carreau bas-gauche */}
      <rect x="3" y="13" width="8" height="8" rx="1" />
      {/* Carreau bas-droit */}
      <rect x="13" y="13" width="8" height="8" rx="1" />
    </svg>
  );
}

// Icône "Catalogue fournisseur" : liste à puces (rectangle + lignes horizontales).
function IconSupplierProducts({ className }: { className?: string }) {
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
      {/* Contour du document */}
      <rect x="3" y="3" width="18" height="18" rx="2" />
      {/* Ligne 1 */}
      <line x1="7" y1="8" x2="17" y2="8" />
      {/* Ligne 2 */}
      <line x1="7" y1="12" x2="17" y2="12" />
      {/* Ligne 3 (courte) */}
      <line x1="7" y1="16" x2="13" y2="16" />
    </svg>
  );
}

// Icône "Commandes fournisseurs" : presse-papier avec coche de validation.
function IconPurchaseOrders({ className }: { className?: string }) {
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
      {/* Corps du document / presse-papier */}
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      {/* Coche de validation */}
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

// Icône "Réceptions" : boîte ouverte avec flèche pointant vers le bas (livraison entrante).
function IconReceptions({ className }: { className?: string }) {
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
      {/* Boîte ouverte */}
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      {/* Flèche vers le bas */}
      <line x1="10" y1="12" x2="14" y2="12" />
      <line x1="12" y1="10" x2="12" y2="16" />
      <polyline points="9 14 12 17 15 14" />
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
const ROLE_SA = 'Super Administrateur';
const ROLES_AGENT: readonly string[] = ['Manager Magasin', 'Opérateur'];

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
  const estSA    = !isLoading && user !== null && user.roleName === ROLE_SA;
  const estAgent = !isLoading && user !== null && ROLES_AGENT.includes(user.roleName);

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
              <NavItem
                href="/dashboard/catalogue"
                label="Catalogue"
                icon={<IconCatalogue className="flex-shrink-0" />}
                currentPath={pathname}
              />
              <NavItem
                href="/dashboard/purchase-orders"
                label="Commandes fournisseurs"
                icon={<IconPurchaseOrders className="flex-shrink-0" />}
                currentPath={pathname}
              />
              <NavItem
                href="/dashboard/receptions"
                label="Réceptions"
                icon={<IconReceptions className="flex-shrink-0" />}
                currentPath={pathname}
              />
            </>
          )}
          {estSA && (
            <>
              <NavItem
                href="/dashboard/stores"
                label="Établissements"
                icon={<IconStores className="flex-shrink-0" />}
                currentPath={pathname}
              />
              <NavItem
                href="/dashboard/suppliers"
                label="Fournisseurs"
                icon={<IconSuppliers className="flex-shrink-0" />}
                currentPath={pathname}
              />
              <NavItem
                href="/dashboard/supplier-products"
                label="Catalogue fournisseur"
                icon={<IconSupplierProducts className="flex-shrink-0" />}
                currentPath={pathname}
              />
            </>
          )}
          {estAgent && (
            <NavItem
              href="/dashboard/receptions"
              label="Réceptions"
              icon={<IconReceptions className="flex-shrink-0" />}
              currentPath={pathname}
            />
          )}
        </ul>
      </nav>
    </aside>
  );
}
