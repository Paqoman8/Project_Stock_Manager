'use client';

import { useCallback, useMemo, useState } from 'react';
import axios from 'axios';
import apiClient from '@/lib/apiClient';
import type { Role, Store, UserRow } from '../types';

interface UseUsersReturn {
  users: UserRow[];
  stores: Store[];
  roles: Role[];
  isLoading: boolean;
  fetchError: string | null;
  search: string;
  filterRole: string;
  filterStatus: 'active' | 'inactive' | 'all';
  filterStore: string;
  filteredUsers: UserRow[];
  hasActiveFilters: boolean;
  setSearch: (v: string) => void;
  setFilterRole: (v: string) => void;
  setFilterStatus: (v: 'active' | 'inactive' | 'all') => void;
  setFilterStore: (v: string) => void;
  handleReset: () => void;
  loadData: () => Promise<void>;
}

export function useUsers(): UseUsersReturn {
  const [users, setUsers]   = useState<UserRow[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [roles, setRoles]   = useState<Role[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [search, setSearch]             = useState('');
  const [filterRole, setFilterRole]     = useState('');
  const [filterStatus, setFilterStatus] = useState<'active' | 'inactive' | 'all'>('all');
  const [filterStore, setFilterStore]   = useState('');

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

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (q) {
        const matchUsername = u.username.toLowerCase().includes(q);
        const matchEmail    = u.email?.toLowerCase().includes(q) ?? false;
        if (!matchUsername && !matchEmail) return false;
      }
      if (filterRole && u.role.name !== filterRole) return false;
      if (filterStatus === 'active'   && !u.is_active) return false;
      if (filterStatus === 'inactive' &&  u.is_active) return false;
      if (filterStore) {
        if (!u.store_access.some((sa) => sa.store.id === filterStore)) return false;
      }
      return true;
    });
  }, [users, search, filterRole, filterStatus, filterStore]);

  const hasActiveFilters =
    search !== '' || filterRole !== '' || filterStatus !== 'all' || filterStore !== '';

  function handleReset() {
    setSearch('');
    setFilterRole('');
    setFilterStatus('all');
    setFilterStore('');
  }

  return {
    users, stores, roles, isLoading, fetchError,
    search, filterRole, filterStatus, filterStore,
    filteredUsers, hasActiveFilters,
    setSearch, setFilterRole, setFilterStatus, setFilterStore,
    handleReset, loadData,
  };
}
