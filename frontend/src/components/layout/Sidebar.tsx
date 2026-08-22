'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/contexts/SessionContext';
import { POS_ROLES } from '@/lib/pos';


// ---------------------------------------------------------------------------
// ICON COMPONENTS                                                          
// ---------------------------------------------------------------------------

function IconUsers({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconDashboard({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M3 13h8V3H3z" />
      <path d="M13 21h8v-6h-8z" />
      <path d="M13 11h8V3h-8z" />
      <path d="M3 21h8v-6H3z" />
    </svg>
  );
}

function IconStores({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconSuppliers({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="1" y="3" width="15" height="13" rx="1" />
      <path d="M16 8h4l3 5v4h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

function IconCatalogue({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
    </svg>
  );
}

function IconSupplierProducts({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="7" y1="8" x2="17" y2="8" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="7" y1="16" x2="13" y2="16" />
    </svg>
  );
}

function IconPurchaseOrders({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function IconReceptions({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
      <line x1="12" y1="10" x2="12" y2="16" />
      <polyline points="9 14 12 17 15 14" />
    </svg>
  );
}

function IconInvoices({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function IconReports({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="17" x2="8" y2="13" />
      <line x1="12" y1="17" x2="12" y2="11" />
      <line x1="16" y1="17" x2="16" y2="14" />
    </svg>
  );
}

function IconInventory({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="2" y="7" width="20" height="14" rx="1" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <line x1="6" y1="12" x2="10" y2="12" />
      <line x1="6" y1="16" x2="14" y2="16" />
    </svg>
  );
}

function IconAudit({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  );
}

function IconTransfers({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M17 3h4v4" />
      <path d="M7 21H3v-4" />
      <path d="M21 7l-6-4" />
      <path d="M3 17l6 4" />
      <path d="M3 7h12a4 4 0 0 1 4 4v0" />
      <path d="M21 17H9a4 4 0 0 1-4-4v0" />
    </svg>
  );
}

function IconPos({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 8h.01" />
      <path d="M11 8h.01" />
      <path d="M15 8h.01" />
      <path d="M7 12h.01" />
      <path d="M11 12h.01" />
      <path d="M15 12h.01" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ROLE DEFINITIONS                                                          
// ---------------------------------------------------------------------------

const ROLES_ADMIN: readonly string[]      = ['Super Administrateur', 'Administrateur'];
const ROLE_SA = 'Super Administrateur';
const ROLES_AGENT: readonly string[]      = ['Manager Magasin', 'Opérateur'];
const ROLES_RECEPTION: readonly string[]  = ['Super Administrateur', 'Administrateur', 'Manager Magasin'];
const ROLES_TRANSFER: readonly string[]   = ['Super Administrateur', 'Administrateur', 'Manager Magasin'];


// ---------------------------------------------------------------------------
// NAVIGATION COMPONENTS                                                    
// ---------------------------------------------------------------------------

/**
 * NavItem — top-level navigation link with active state styling.
 */
function NavItem({
  href,
  label,
  icon,
  currentPath,
  exact = false,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  currentPath: string;
  exact?: boolean;
}) {
  const isActive = exact ? currentPath === href : currentPath.startsWith(href);
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

/**
 * NavSubItem — indented sub-link displayed under a parent NavItem.
 */
function NavSubItem({
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
          'flex items-center gap-2 pl-10 pr-4 py-1.5 text-xs rounded mx-2 transition-colors',
          isActive
            ? 'text-primary font-medium'
            : 'text-textMuted hover:text-textMain',
        ].join(' ')}
        aria-current={isActive ? 'page' : undefined}
      >
        <span className="w-px h-3 bg-borderLight flex-shrink-0" aria-hidden="true" />
        {icon}
        {label}
      </Link>
    </li>
  );
}


// ---------------------------------------------------------------------------
// MAIN COMPONENT                                                           
// ---------------------------------------------------------------------------

/**
 * Sidebar — main navigation component with role-based menu items.
 * Displays different sections based on user role (Admin, Agent, POS, etc.).
 */
export function Sidebar({ isOpen = true }: { isOpen?: boolean }) {
  const pathname = usePathname();
  const { user, isLoading } = useSession();

  const estPlatformManager = !isLoading && user !== null && user.isPlatformManager;
  const estAdmin      = !isLoading && user !== null && ROLES_ADMIN.includes(user.roleName);
  const estSA         = !isLoading && user !== null && user.roleName === ROLE_SA;
  const estAgent      = !isLoading && user !== null && ROLES_AGENT.includes(user.roleName);
  const estReception  = !isLoading && user !== null && ROLES_RECEPTION.includes(user.roleName);
  const estTransfer   = !isLoading && user !== null && ROLES_TRANSFER.includes(user.roleName);
  const estPos        = !isLoading && user !== null && POS_ROLES.includes(user.roleName as (typeof POS_ROLES)[number]);

  if (!isOpen) return null;

  return (
    <aside
      className="bg-surface border-r border-borderLight w-56 flex-shrink-0 flex flex-col h-full overflow-y-auto"
      aria-label="Navigation principale"
      role="navigation"
    >
      <nav className="py-4 flex-1">
        <ul className="flex flex-col gap-0.5" role="list">

          {/* ADMIN SECTIONS — Super Admin and Admin shared links */}
          {estAdmin && (
            <>
                <NavItem
                  href="/dashboard"
                  label="Dashboard"
                  icon={<IconDashboard className="flex-shrink-0" />}
                  currentPath={pathname}
                  exact={true}
                />
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
              {/* Inventaire + sous-item Rapports */}
              <NavItem
                href="/dashboard/inventory"
                label="Inventaire"
                icon={<IconInventory className="flex-shrink-0" />}
                currentPath={pathname}
                exact={true}
              />
              <NavSubItem
                href="/dashboard/inventory/reports"
                label="Rapports"
                icon={<IconReports className="flex-shrink-0 opacity-75" />}
                currentPath={pathname}
              />
            </>
          )}

          {/* PLATFORM MANAGER — gère les organisations, pas une organisation précise */}
          {estPlatformManager && (
            <NavItem
              href="/platform"
              label="Dashboard"
              icon={<IconDashboard className="flex-shrink-0" />}
              currentPath={pathname}
              exact={true}
            />
          )}

          {!estAdmin && !estPlatformManager && user !== null && (
            <NavItem
              href="/dashboard"
              label="Dashboard"
              icon={<IconDashboard className="flex-shrink-0" />}
              currentPath={pathname}
              exact={true}
            />
          )}

          {/* SUPER ADMIN ONLY SECTIONS */}
          {estSA && (
            <>
              <NavItem
                href="/dashboard/stores"
                label="Établissements"
                icon={<IconStores className="flex-shrink-0" />}
                currentPath={pathname}
              />
              {/* Groupe Fournisseurs */}
              <NavItem
                href="/dashboard/suppliers"
                label="Fournisseurs"
                icon={<IconSuppliers className="flex-shrink-0" />}
                currentPath={pathname}
                exact={true}
              />
              <NavSubItem
                href="/dashboard/supplier-products"
                label="Catalogue"
                icon={<IconSupplierProducts className="flex-shrink-0 opacity-75" />}
                currentPath={pathname}
              />
              <NavSubItem
                href="/dashboard/purchase-orders"
                label="Commandes"
                icon={<IconPurchaseOrders className="flex-shrink-0 opacity-75" />}
                currentPath={pathname}
              />
              <NavSubItem
                href="/dashboard/invoices"
                label="Factures"
                icon={<IconInvoices className="flex-shrink-0 opacity-75" />}
                currentPath={pathname}
              />
            </>
          )}

          {/* RECEPTIONS — Super Admin + Admin + Manager */}
          {estReception && (
            <NavItem
              href="/dashboard/receptions"
              label="Réceptions"
              icon={<IconReceptions className="flex-shrink-0" />}
              currentPath={pathname}
            />
          )}

          {estTransfer && (
            <NavItem
              href="/dashboard/transfers"
              label="Transferts"
              icon={<IconTransfers className="flex-shrink-0" />}
              currentPath={pathname}
            />
          )}

          {/* AGENT SECTIONS — Manager and Operator links */}
          {estAgent && (
            <>
              <NavItem
                href="/dashboard/inventory"
                label="Inventaire"
                icon={<IconInventory className="flex-shrink-0" />}
                currentPath={pathname}
                exact={true}
              />
              <NavSubItem
                href="/dashboard/inventory/reports"
                label="Rapports"
                icon={<IconReports className="flex-shrink-0 opacity-75" />}
                currentPath={pathname}
              />
            </>
          )}

          {/* POS SECTIONS — all POS-enabled roles */}
          {estPos && (
            <>
              <NavItem
                href="/dashboard/pos"
                label="Point de Vente"
                icon={<IconPos className="flex-shrink-0" />}
                currentPath={pathname}
              />
            </>
          )}

        </ul>
      </nav>
    </aside>
  );
}
