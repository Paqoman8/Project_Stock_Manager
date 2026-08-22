'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { UserFormModal } from '@/components/users/UserFormModal';
import { DeactivateUserModal } from '@/components/users/DeactivateUserModal';
import { ReactivateUserModal } from '@/components/users/ReactivateUserModal';
import { Modal } from '@/components/ui/Modal';
import { ResetPasswordModal } from '@/components/users/ResetPasswordModal';
import { useSession } from '@/contexts/SessionContext';
import { adminResetPassword } from '@/services/auth.service';
import { extractApiErrorMessage } from '@/lib/errors';
import SkeletonRows from '@/components/shared/SkeletonRows';
import { useUsers } from './hooks/useUsers';
import UserFilters from './components/UserFilters';
import UserTable from './components/UserTable';
import type { UserRow } from './types';

const ROLES_AUTORISES: readonly string[] = ['Super Administrateur', 'Administrateur'];

export default function UsersPage() {
  const { user: sessionUser, isLoading: sessionLoading } = useSession();
  const router = useRouter();

  const {
    users, stores, roles, isLoading, fetchError,
    search, filterRole, filterStatus, filterStore,
    filteredUsers, hasActiveFilters,
    setSearch, setFilterRole, setFilterStatus, setFilterStore,
    handleReset, loadData,
  } = useUsers();

  const [modalCreate, setModalCreate]           = useState(false);
  const [userToEdit, setUserToEdit]             = useState<UserRow | null>(null);
  const [userToDeactivate, setUserToDeactivate] = useState<UserRow | null>(null);
  const [userToReactivate, setUserToReactivate] = useState<UserRow | null>(null);

  const [resetTarget, setResetTarget]           = useState<UserRow | null>(null);
  const [resetResult, setResetResult]           = useState<{ username: string; password: string } | null>(null);
  const [resetError, setResetError]             = useState<string | null>(null);
  const [isResetting, setIsResetting]           = useState(false);

  useEffect(() => {
    if (!sessionLoading && sessionUser !== null && !ROLES_AUTORISES.includes(sessionUser.roleName)) {
      router.replace('/dashboard');
    }
  }, [sessionLoading, sessionUser, router]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!sessionUser || !ROLES_AUTORISES.includes(sessionUser.roleName)) return;
    loadData();
  }, [loadData, sessionLoading, sessionUser]);

  async function handleResetPassword() {
    if (!resetTarget) return;
    setIsResetting(true);
    setResetError(null);

    try {
      const response = await adminResetPassword(resetTarget.id);
      setResetTarget(null);
      setResetResult({
        username: resetTarget.username,
        password: response.temporaryPassword ?? '',
      });
    } catch (error: unknown) {
      setResetError(
        extractApiErrorMessage(
          error,
          'Une erreur est survenue. Veuillez réessayer.',
        ),
      );
    } finally {
      setIsResetting(false);
    }
  }

  if (sessionLoading || !sessionUser || !ROLES_AUTORISES.includes(sessionUser.roleName)) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-8 w-56 bg-borderLight rounded animate-pulse" aria-hidden="true" />
        <div className="bg-surface border border-borderLight rounded overflow-x-auto">
          <table className="w-full text-sm" aria-hidden="true">
            <tbody><SkeletonRows cols={6} /></tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-textMain">Gestion des utilisateurs</h1>
        <Button variant="primary" size="md" onClick={() => setModalCreate(true)}>
          Créer un utilisateur
        </Button>
      </div>

      <UserFilters
        search={search} filterRole={filterRole}
        filterStatus={filterStatus} filterStore={filterStore}
        roles={roles} stores={stores} hasActiveFilters={hasActiveFilters}
        onSearchChange={setSearch} onRoleChange={setFilterRole}
        onStatusChange={setFilterStatus} onStoreChange={setFilterStore}
        onReset={handleReset}
      />

      <UserTable
        users={users} filteredUsers={filteredUsers}
        isLoading={isLoading} fetchError={fetchError}
        sessionUserId={sessionUser.id} sessionUserRole={sessionUser.roleName}
        onEdit={setUserToEdit} onDeactivate={setUserToDeactivate} onReactivate={setUserToReactivate}
        onResetPassword={setResetTarget}
      />

      <UserFormModal
        isOpen={modalCreate} onClose={() => setModalCreate(false)}
        onSuccess={loadData} roles={roles} stores={stores} user={null}
      />
      <UserFormModal
        isOpen={userToEdit !== null} onClose={() => setUserToEdit(null)}
        onSuccess={loadData} roles={roles} stores={stores}
        user={userToEdit} sessionUserId={sessionUser.id}
      />
      <DeactivateUserModal
        isOpen={userToDeactivate !== null} onClose={() => setUserToDeactivate(null)}
        onSuccess={loadData} user={userToDeactivate}
      />
      <ReactivateUserModal
        isOpen={userToReactivate !== null} onClose={() => setUserToReactivate(null)}
        onSuccess={loadData} user={userToReactivate}
      />

      <Modal
        isOpen={resetTarget !== null}
        title="Réinitialiser le mot de passe"
        message={
          resetError
            ? resetError
            : `Voulez-vous vraiment réinitialiser le mot de passe de ${resetTarget?.username ?? 'cet utilisateur'} ? Un mot de passe temporaire sera généré et l'utilisateur devra le changer à sa prochaine connexion.`
        }
        confirmLabel="Réinitialiser"
        confirmVariant="primary"
        cancelLabel="Annuler"
        onConfirm={handleResetPassword}
        onCancel={() => { setResetTarget(null); setResetError(null); }}
        isConfirming={isResetting}
      />

      {resetResult && (
        <ResetPasswordModal
          username={resetResult.username}
          temporaryPassword={resetResult.password}
          onClose={() => setResetResult(null)}
        />
      )}
    </div>
  );
}
