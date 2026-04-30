// src/app/dashboard/users/page.tsx
// Page de gestion des utilisateurs — affiche la liste complète et permet
// de créer, modifier, désactiver et réactiver des comptes.
//
// Architecture :
//   - Client Component (interactions, état local, appels API)
//   - Chargement en parallèle de /api/users, /api/auth/stores et /api/roles au montage
//   - Les rôles sont chargés depuis GET /api/roles (le backend exclut déjà le SA)
//   - Quatre états de modale : création / édition / désactivation / réactivation
//   - Filtrage 100% client-side via useMemo (pas d'appel API supplémentaire)
//
// Sécurité UI :
//   - Vérification de rôle après hydratation → redirect('/dashboard') si insuffisant
//     (forbidden() est réservé aux Server Components — ne fonctionne pas côté client)
//   - Le bouton "Désactiver" n'apparaît JAMAIS sur la ligne du Super Administrateur
//   - Le bouton "Réactiver" n'apparaît que sur les comptes inactifs non-SA
//   - Le SA est identifié par user.role.name === 'Super Administrateur'
//
// Accessibilité :
//   - Tableau avec rôles ARIA (role="table", columnheader, etc.)
//   - Skeleton visually-hidden pour les lecteurs d'écran
//   - Badges sémantiques avec rôle status implicite via la couleur + texte

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { UserFormModal } from '@/components/users/UserFormModal';
import { DeactivateUserModal } from '@/components/users/DeactivateUserModal';
import { ReactivateUserModal } from '@/components/users/ReactivateUserModal';
import { useSession } from '@/contexts/SessionContext';
import apiClient from '@/lib/apiClient';

// ---------------------------------------------------------------------------
// Rôles autorisés à accéder à cette page
// ---------------------------------------------------------------------------

const ROLES_AUTORISES: readonly string[] = ['Super Administrateur', 'Administrateur'];

// ---------------------------------------------------------------------------
// Types locaux
// ---------------------------------------------------------------------------

interface Role {
  id: string;
  name: string;
}

interface Store {
  id: string;
  name: string;
  location: string | null;
  is_protected?: boolean;
}

interface StoreAccess {
  store: Store;
}

export interface UserRow {
  id: string;
  username: string;
  email: string | null;
  is_active: boolean;
  role: Role;
  store_access: StoreAccess[];
}

// ---------------------------------------------------------------------------
// Sous-composant : Badge de statut actif/inactif
// ---------------------------------------------------------------------------

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-success/10 text-success">
      Actif
    </span>
  ) : (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-danger/10 text-danger opacity-70">
      Inactif
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sous-composant : Lignes skeleton pendant le chargement
// ---------------------------------------------------------------------------

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3].map((n) => (
        <tr key={n} aria-hidden="true">
          {[1, 2, 3, 4, 5, 6].map((c) => (
            <td key={c} className="px-4 py-3">
              <div className="h-4 bg-borderLight rounded animate-pulse" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sous-composant : Icône reset (×)
// ---------------------------------------------------------------------------

function IconReset() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function UsersPage() {
  const { user: sessionUser, isLoading: sessionLoading } = useSession();
  const router = useRouter();

  // Redirection si non autorisé — useEffect plutôt que forbidden() car ce composant
  // est un Client Component (forbidden() ne fonctionne qu'en Server Component).
  useEffect(() => {
    if (!sessionLoading && sessionUser !== null && !ROLES_AUTORISES.includes(sessionUser.roleName)) {
      router.replace('/dashboard');
    }
  }, [sessionLoading, sessionUser, router]);

  // --- État des données ---
  const [users, setUsers]       = useState<UserRow[]>([]);
  const [stores, setStores]     = useState<Store[]>([]);
  const [roles, setRoles]       = useState<Role[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [fetchError, setFetchError]   = useState<string | null>(null);

  // --- Filtres (client-side) ---
  // Statut par défaut : "active" — les comptes inactifs sont l'exception.
  const [search, setSearch]         = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState<'active' | 'inactive' | 'all'>('all');
  const [filterStore, setFilterStore]   = useState('');

  // --- Contrôle des modales ---
  const [modalCreate, setModalCreate]             = useState(false);
  const [userToEdit, setUserToEdit]               = useState<UserRow | null>(null);
  const [userToDeactivate, setUserToDeactivate]   = useState<UserRow | null>(null);
  const [userToReactivate, setUserToReactivate]   = useState<UserRow | null>(null);

  // ---------------------------------------------------------------------------
  // Chargement des données
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);

    try {
      const [usersRes, storesRes, rolesRes] = await Promise.all([
        apiClient.get<{ success: boolean; users: UserRow[] }>('/api/users'),
        apiClient.get<{ success: boolean; stores: Store[] }>('/api/auth/accessible-stores'),
        apiClient.get<{ success: boolean; roles: Role[] }>('/api/roles'),
      ]);

      setUsers(usersRes.data.users ?? []);
      setStores(storesRes.data.stores ?? []);
      setRoles(rolesRes.data.roles ?? []);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setFetchError(err.response?.data?.message ?? 'Impossible de charger les données.');
      } else {
        setFetchError('Une erreur inattendue est survenue.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    if (!sessionUser || !ROLES_AUTORISES.includes(sessionUser.roleName)) return;
    loadData();
  }, [loadData, sessionLoading, sessionUser]);

  // ---------------------------------------------------------------------------
  // Filtrage client-side — recalculé uniquement quand les données ou filtres changent
  // ---------------------------------------------------------------------------

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return users.filter((u) => {
      // Recherche libre : username OU email
      if (q) {
        const matchUsername = u.username.toLowerCase().includes(q);
        const matchEmail    = u.email?.toLowerCase().includes(q) ?? false;
        if (!matchUsername && !matchEmail) return false;
      }

      // Filtre par rôle
      if (filterRole && u.role.name !== filterRole) return false;

      // Filtre par statut
      if (filterStatus === 'active'   && !u.is_active) return false;
      if (filterStatus === 'inactive' &&  u.is_active) return false;

      // Filtre par magasin
      if (filterStore) {
        const hasStore = u.store_access.some((sa) => sa.store.id === filterStore);
        if (!hasStore) return false;
      }

      return true;
    });
  }, [users, search, filterRole, filterStatus, filterStore]);

  // Un filtre non-par-défaut est "actif" dès que quelque chose a changé
  const hasActiveFilters =
    search !== '' ||
    filterRole !== '' ||
    filterStatus !== 'all' ||
    filterStore !== '';

  function handleReset() {
    setSearch('');
    setFilterRole('');
    setFilterStatus('all');
    setFilterStore('');
  }

  // ---------------------------------------------------------------------------
  // Garde de rendu — skeleton pendant la session
  // ---------------------------------------------------------------------------

  if (sessionLoading || !sessionUser || !ROLES_AUTORISES.includes(sessionUser.roleName)) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-8 w-56 bg-borderLight rounded animate-pulse" aria-hidden="true" />
        <div className="bg-surface border border-borderLight rounded overflow-x-auto">
          <table className="w-full text-sm" aria-hidden="true">
            <tbody><SkeletonRows /></tbody>
          </table>
        </div>
      </div>
    );
  }

  // Classes communes aux selects et à l'input de recherche
  const inputCls =
    'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
    'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary';

  // ---------------------------------------------------------------------------
  // Rendu principal
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6">

      {/* En-tête de page */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-textMain">
          Gestion des utilisateurs
        </h1>
        <Button variant="primary" size="md" onClick={() => setModalCreate(true)}>
          Créer un utilisateur
        </Button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Barre de recherche et filtres                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-surface border border-borderLight rounded">

        {/* Recherche libre */}
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label htmlFor="search-users" className="text-xs font-medium text-textSecondary">
            Recherche
          </label>
          <input
            id="search-users"
            type="search"
            placeholder="Identifiant ou email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Filtre par rôle */}
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-role" className="text-xs font-medium text-textSecondary">
            Rôle
          </label>
          <select
            id="filter-role"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className={inputCls}
          >
            <option value="">Tous les rôles</option>
            {/* On affiche aussi le SA dans ce filtre car le SA peut vouloir
                retrouver son propre compte. Les rôles chargés depuis /api/roles
                excluent le SA — on l'ajoute manuellement ici. */}
            <option value="Super Administrateur">Super Administrateur</option>
            {roles.map((r) => (
              <option key={r.id} value={r.name}>{r.name}</option>
            ))}
          </select>
        </div>

        {/* Filtre par statut */}
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-status" className="text-xs font-medium text-textSecondary">
            Statut
          </label>
          <select
            id="filter-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'active' | 'inactive' | 'all')}
            className={inputCls}
          >
            <option value="all">Tous</option>
            <option value="active">Actifs</option>
            <option value="inactive">Inactifs</option>
          </select>
        </div>

        {/* Filtre par magasin — masqué s'il n'y a qu'un seul magasin */}
        {stores.length > 1 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-store" className="text-xs font-medium text-textSecondary">
              Magasin
            </label>
            <select
              id="filter-store"
              value={filterStore}
              onChange={(e) => setFilterStore(e.target.value)}
              className={inputCls}
            >
              <option value="">Tous les magasins</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Bouton réinitialiser — visible uniquement si un filtre est actif */}
        {hasActiveFilters && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleReset}
            className="flex items-center gap-1.5 self-end"
          >
            <IconReset />
            Réinitialiser
          </Button>
        )}
      </div>

      {/* Compteur de résultats */}
      {!isLoading && !fetchError && (
        <p className="text-xs text-textMuted -mt-3">
          {filteredUsers.length === 0
            ? 'Aucun utilisateur ne correspond aux filtres.'
            : filteredUsers.length === users.length
              ? `${users.length} utilisateur${users.length > 1 ? 's' : ''}`
              : `${filteredUsers.length} utilisateur${filteredUsers.length > 1 ? 's' : ''} affiché${filteredUsers.length > 1 ? 's' : ''} sur ${users.length}`
          }
        </p>
      )}

      {/* Erreur de chargement */}
      {fetchError && (
        <p role="alert" className="text-sm text-danger">{fetchError}</p>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tableau                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-surface border border-borderLight rounded overflow-x-auto">
        <table className="w-full text-sm" role="table" aria-label="Liste des utilisateurs">
          <thead>
            <tr className="bg-background border-b border-borderLight">
              {['Identifiant', 'Email', 'Rôle', 'Magasins', 'Statut', 'Actions'].map((col) => (
                <th
                  key={col}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-textMuted uppercase tracking-wide"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <SkeletonRows />
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-textMuted">
                  {users.length === 0
                    ? 'Aucun utilisateur trouvé.'
                    : 'Aucun utilisateur ne correspond aux filtres.'}
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const storeNames = user.store_access.map((sa) => sa.store.name).join(', ');
                const isSuperAdmin = user.role.name === 'Super Administrateur';

                return (
                  <tr
                    key={user.id}
                    className="border-b border-borderLight hover:bg-background/50 transition-colors"
                  >
                    {/* Identifiant */}
                    <td className="px-4 py-3 font-medium text-textMain whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        {user.username}
                        {isSuperAdmin && (
                          <span
                            title="Compte Super Administrateur — protégé"
                            aria-label="Compte protégé"
                            className="text-xs select-none"
                          >
                            🔒
                          </span>
                        )}
                      </span>
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3 text-textMuted">
                      {user.email ?? <span aria-label="Aucun email">—</span>}
                    </td>

                    {/* Rôle */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <RoleBadge roleName={user.role.name} />
                    </td>

                    {/* Magasins */}
                    <td className="px-4 py-3 text-sm text-textMuted max-w-[200px]">
                      {storeNames || <span aria-label="Aucun magasin">—</span>}
                    </td>

                    {/* Statut */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge isActive={user.is_active} />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {(!isSuperAdmin || sessionUser?.roleName === 'Super Administrateur') && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setUserToEdit(user)}
                            aria-label={`Modifier ${user.username}`}
                          >
                            Modifier
                          </Button>
                        )}

                        {user.is_active && !isSuperAdmin && user.id !== sessionUser?.id && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setUserToDeactivate(user)}
                            aria-label={`Désactiver ${user.username}`}
                          >
                            Désactiver
                          </Button>
                        )}

                        {!user.is_active && !isSuperAdmin && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setUserToReactivate(user)}
                            aria-label={`Réactiver ${user.username}`}
                            className="text-success border-success/30 hover:bg-success/5"
                          >
                            Réactiver
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Modales                                                              */}
      {/* ------------------------------------------------------------------ */}

      <UserFormModal
        isOpen={modalCreate}
        onClose={() => setModalCreate(false)}
        onSuccess={loadData}
        roles={roles}
        stores={stores}
        user={null}
      />

      <UserFormModal
        isOpen={userToEdit !== null}
        onClose={() => setUserToEdit(null)}
        onSuccess={loadData}
        roles={roles}
        stores={stores}
        user={userToEdit}
        sessionUserId={sessionUser?.id}
      />

      <DeactivateUserModal
        isOpen={userToDeactivate !== null}
        onClose={() => setUserToDeactivate(null)}
        onSuccess={loadData}
        user={userToDeactivate}
      />

      <ReactivateUserModal
        isOpen={userToReactivate !== null}
        onClose={() => setUserToReactivate(null)}
        onSuccess={loadData}
        user={userToReactivate}
      />
    </div>
  );
}
