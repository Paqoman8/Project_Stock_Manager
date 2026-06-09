import { Button } from '@/components/ui/Button';
import { RoleBadge } from '@/components/ui/RoleBadge';
import SkeletonRows from '@/components/shared/SkeletonRows';
import StatusBadge from './StatusBadge';
import type { UserRow } from '../types';

interface UserTableProps {
  users: UserRow[];
  filteredUsers: UserRow[];
  isLoading: boolean;
  fetchError: string | null;
  sessionUserId: string | undefined;
  sessionUserRole: string | undefined;
  onEdit: (user: UserRow) => void;
  onDeactivate: (user: UserRow) => void;
  onReactivate: (user: UserRow) => void;
}

const COLUMNS = ['Identifiant', 'Email', 'Rôle', 'Magasins', 'Statut', 'Actions'];

export default function UserTable({
  users, filteredUsers, isLoading, fetchError,
  sessionUserId, sessionUserRole,
  onEdit, onDeactivate, onReactivate,
}: UserTableProps) {
  return (
    <>
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

      {fetchError && (
        <p role="alert" className="text-sm text-danger">{fetchError}</p>
      )}

      <div className="bg-surface border border-borderLight rounded overflow-x-auto">
        <table className="w-full text-sm" role="table" aria-label="Liste des utilisateurs">
          <thead>
            <tr className="bg-background border-b border-borderLight">
              {COLUMNS.map((col) => (
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
              <SkeletonRows cols={6} />
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
                const storeNames  = user.store_access.map((sa) => sa.store.name).join(', ');
                const isSuperAdmin = user.role.name === 'Super Administrateur';

                return (
                  <tr
                    key={user.id}
                    className="border-b border-borderLight hover:bg-background/50 transition-colors"
                  >
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

                    <td className="px-4 py-3 text-textMuted">
                      {user.email ?? <span aria-label="Aucun email">—</span>}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <RoleBadge roleName={user.role.name} />
                    </td>

                    <td className="px-4 py-3 text-sm text-textMuted max-w-[200px]">
                      {storeNames || <span aria-label="Aucun magasin">—</span>}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge isActive={user.is_active} />
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {(!isSuperAdmin || sessionUserRole === 'Super Administrateur') && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onEdit(user)}
                            aria-label={`Modifier ${user.username}`}
                          >
                            Modifier
                          </Button>
                        )}

                        {user.is_active && !isSuperAdmin && user.id !== sessionUserId && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => onDeactivate(user)}
                            aria-label={`Désactiver ${user.username}`}
                          >
                            Désactiver
                          </Button>
                        )}

                        {!user.is_active && !isSuperAdmin && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onReactivate(user)}
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
    </>
  );
}
