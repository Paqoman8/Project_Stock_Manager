import { Button } from '@/components/ui/Button';
import IconReset from '@/components/shared/IconReset';
import { inputCls } from '@/lib/ui';
import type { Role, Store } from '../types';

interface UserFiltersProps {
  search: string;
  filterRole: string;
  filterStatus: 'active' | 'inactive' | 'all';
  filterStore: string;
  roles: Role[];
  stores: Store[];
  hasActiveFilters: boolean;
  onSearchChange: (v: string) => void;
  onRoleChange: (v: string) => void;
  onStatusChange: (v: 'active' | 'inactive' | 'all') => void;
  onStoreChange: (v: string) => void;
  onReset: () => void;
}

export default function UserFilters({
  search, filterRole, filterStatus, filterStore,
  roles, stores, hasActiveFilters,
  onSearchChange, onRoleChange, onStatusChange, onStoreChange, onReset,
}: UserFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-4 bg-surface border border-borderLight rounded">

      <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
        <label htmlFor="search-users" className="text-xs font-medium text-textSecondary">
          Recherche
        </label>
        <input
          id="search-users"
          type="search"
          placeholder="Identifiant ou email…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className={inputCls}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-role" className="text-xs font-medium text-textSecondary">
          Rôle
        </label>
        <select
          id="filter-role"
          value={filterRole}
          onChange={(e) => onRoleChange(e.target.value)}
          className={inputCls}
        >
          <option value="">Tous les rôles</option>
          {/* /api/roles exclut le SA — on l'ajoute manuellement pour permettre le filtre */}
          <option value="Super Administrateur">Super Administrateur</option>
          {roles.map((r) => (
            <option key={r.id} value={r.name}>{r.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-status" className="text-xs font-medium text-textSecondary">
          Statut
        </label>
        <select
          id="filter-status"
          value={filterStatus}
          onChange={(e) => onStatusChange(e.target.value as 'active' | 'inactive' | 'all')}
          className={inputCls}
        >
          <option value="all">Tous</option>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
        </select>
      </div>

      {stores.length > 1 && (
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-store" className="text-xs font-medium text-textSecondary">
            Magasin
          </label>
          <select
            id="filter-store"
            value={filterStore}
            onChange={(e) => onStoreChange(e.target.value)}
            className={inputCls}
          >
            <option value="">Tous les magasins</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {hasActiveFilters && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onReset}
          className="flex items-center gap-1.5 self-end"
        >
          <IconReset />
          Réinitialiser
        </Button>
      )}
    </div>
  );
}
