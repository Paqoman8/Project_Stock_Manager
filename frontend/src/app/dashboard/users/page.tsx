// src/app/dashboard/users/page.tsx
// Page de gestion des utilisateurs — affiche la liste complète et permet
// de créer, modifier, désactiver et réactiver des comptes.
//
// Architecture :
//   - Client Component (interactions, état local, appels API)
//   - Chargement en parallèle de /api/users, /api/auth/stores et /api/roles au montage
//   - Les rôles sont chargés depuis GET /api/roles (le backend exclut déjà le SA)
//   - Quatre états de modale : création / édition / désactivation / réactivation
//
// Sécurité UI :
//   - Vérification de rôle après hydratation de la session → forbidden() si insuffisant
//   - Le bouton "Désactiver" n'apparaît JAMAIS sur la ligne du Super Administrateur
//   - Le bouton "Réactiver" n'apparaît que sur les comptes inactifs non-SA
//   - Le SA est identifié par user.role.name === 'Super Administrateur'
//
// Accessibilité :
//   - Tableau avec rôles ARIA (role="table", columnheader, etc.)
//   - Skeleton visually-hidden pour les lecteurs d'écran
//   - Badges sémantiques avec rôle status implicite via la couleur + texte

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { forbidden } from 'next/navigation';
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
// Composant principal
// ---------------------------------------------------------------------------

export default function UsersPage() {
  const { user: sessionUser, isLoading: sessionLoading } = useSession();

  // Vérification du rôle après hydratation de la session.
  // On attend que isLoading soit false pour avoir une valeur fiable.
  // forbidden() déclenche le rendu de src/app/dashboard/users/forbidden.tsx.
  if (!sessionLoading && sessionUser !== null) {
    if (!ROLES_AUTORISES.includes(sessionUser.roleName)) {
      forbidden();
    }
  }

  // --- État des données ---
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  // Rôles assignables chargés depuis le backend (SA exclu par le backend)
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // --- Contrôle des modales ---
  const [modalCreate, setModalCreate] = useState(false);
  const [userToEdit, setUserToEdit] = useState<UserRow | null>(null);
  const [userToDeactivate, setUserToDeactivate] = useState<UserRow | null>(null);
  const [userToReactivate, setUserToReactivate] = useState<UserRow | null>(null);

  // ---------------------------------------------------------------------------
  // Chargement des données
  // ---------------------------------------------------------------------------

  // Fonction stable (useCallback) pour pouvoir l'appeler depuis les callbacks
  // de succès des modales sans recréer le handler à chaque render.
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);

    try {
      // Les trois appels sont indépendants — on les lance en parallèle.
      const [usersRes, storesRes, rolesRes] = await Promise.all([
        apiClient.get<{ success: boolean; users: UserRow[] }>('/api/users'),
        apiClient.get<{ success: boolean; stores: Store[] }>('/api/auth/stores'),
        apiClient.get<{ success: boolean; roles: Role[] }>('/api/roles'),
      ]);

      setUsers(usersRes.data.users ?? []);
      setStores(storesRes.data.stores ?? []);
      setRoles(rolesRes.data.roles ?? []);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setFetchError(
          err.response?.data?.message ?? 'Impossible de charger les données.'
        );
      } else {
        setFetchError('Une erreur inattendue est survenue.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // On ne charge les données que lorsque la session est prête
    // et que l'utilisateur est autorisé (évite un appel inutile avant forbidden)
    if (sessionLoading) return;
    if (!sessionUser || !ROLES_AUTORISES.includes(sessionUser.roleName)) return;
    loadData();
  }, [loadData, sessionLoading, sessionUser]);

  // ---------------------------------------------------------------------------
  // Rendu — skeleton pendant le chargement de la session
  // ---------------------------------------------------------------------------

  // Ne pas rendre le contenu tant que la session est en chargement
  if (sessionLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-8 w-56 bg-borderLight rounded animate-pulse" aria-hidden="true" />
        <div className="bg-surface border border-borderLight rounded overflow-x-auto">
          <table className="w-full text-sm" aria-hidden="true">
            <tbody>
              <SkeletonRows />
            </tbody>
          </table>
        </div>
      </div>
    );
  }

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
        <Button
          variant="primary"
          size="md"
          onClick={() => setModalCreate(true)}
        >
          Créer un utilisateur
        </Button>
      </div>

      {/* Erreur de chargement */}
      {fetchError && (
        <p role="alert" className="text-sm text-danger">
          {fetchError}
        </p>
      )}

      {/* Tableau */}
      <div className="bg-surface border border-borderLight rounded overflow-x-auto">
        <table className="w-full text-sm" role="table" aria-label="Liste des utilisateurs">
          <thead>
            <tr className="bg-background border-b border-borderLight">
              {[
                'Identifiant',
                'Email',
                'Rôle',
                'Magasins',
                'Statut',
                'Actions',
              ].map((col) => (
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
            ) : users.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-textMuted"
                >
                  Aucun utilisateur trouvé.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                // Noms des magasins concaténés — affichage compact
                const storeNames = user.store_access
                  .map((sa) => sa.store.name)
                  .join(', ');

                // Détermine si ce compte est protégé (Super Administrateur)
                const isSuperAdmin = user.role.name === 'Super Administrateur';

                return (
                  <tr
                    key={user.id}
                    className="border-b border-borderLight hover:bg-background/50 transition-colors"
                  >
                    {/* Identifiant — avec indicateur discret si SA */}
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
                      {user.email ?? (
                        <span aria-label="Aucun email">—</span>
                      )}
                    </td>

                    {/* Rôle */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <RoleBadge roleName={user.role.name} />
                    </td>

                    {/* Magasins */}
                    <td className="px-4 py-3 text-sm text-textMuted max-w-[200px]">
                      {storeNames || (
                        <span aria-label="Aucun magasin">—</span>
                      )}
                    </td>

                    {/* Statut */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge isActive={user.is_active} />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setUserToEdit(user)}
                          aria-label={`Modifier ${user.username}`}
                        >
                          Modifier
                        </Button>

                        {/*
                          "Désactiver" est visible uniquement si :
                          1. Le compte est encore actif
                          2. Ce n'est PAS le Super Administrateur
                        */}
                        {user.is_active && !isSuperAdmin && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setUserToDeactivate(user)}
                            aria-label={`Désactiver ${user.username}`}
                          >
                            Désactiver
                          </Button>
                        )}

                        {/*
                          "Réactiver" est visible uniquement si :
                          1. Le compte est inactif
                          2. Ce n'est PAS le Super Administrateur
                          Style : couleur success pour distinguer l'action de réactivation
                          de l'action de désactivation (danger).
                        */}
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

      {/* -----------------------------------------------------------------
          Modales
      ----------------------------------------------------------------- */}

      {/* Création */}
      <UserFormModal
        isOpen={modalCreate}
        onClose={() => setModalCreate(false)}
        onSuccess={loadData}
        roles={roles}
        stores={stores}
        user={null}
      />

      {/* Édition — userToEdit non-null déclenche l'ouverture */}
      <UserFormModal
        isOpen={userToEdit !== null}
        onClose={() => setUserToEdit(null)}
        onSuccess={loadData}
        roles={roles}
        stores={stores}
        user={userToEdit}
      />

      {/* Désactivation */}
      <DeactivateUserModal
        isOpen={userToDeactivate !== null}
        onClose={() => setUserToDeactivate(null)}
        onSuccess={loadData}
        user={userToDeactivate}
      />

      {/* Réactivation */}
      <ReactivateUserModal
        isOpen={userToReactivate !== null}
        onClose={() => setUserToReactivate(null)}
        onSuccess={loadData}
        user={userToReactivate}
      />
    </div>
  );
}
