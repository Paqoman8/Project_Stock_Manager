'use client';

// src/app/dashboard/audit/page.tsx
//
// Journal d'audit — liste paginée et filtrable de toutes les actions de la plateforme.
//
// Accès :
//   SA    → tous les logs sans restriction
//   Admin → uniquement les logs de ses magasins associés
//
// Filtres disponibles : type d'action, acteur, plage de dates.
// Pagination côté serveur (20 entrées par page par défaut).

import React, { useCallback, useEffect, useState } from 'react';
import { forbidden } from 'next/navigation';
import { useSession } from '@/contexts/SessionContext';
import apiClient from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuditAction =
  | 'USER_LOGIN'
  | 'USER_LOGIN_FAILED'
  | 'USER_LOGOUT'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DEACTIVATED'
  | 'USER_REACTIVATED';

interface AuditLog {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string;
  action: AuditAction;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  store_id: string | null;
  store_name: string | null;
  metadata: Record<string, unknown> | null;
}

interface AuditLogsResponse {
  success: boolean;
  logs: AuditLog[];
  total: number;
  page: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Libellés et couleurs des actions
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<AuditAction, string> = {
  USER_LOGIN:        'Connexion',
  USER_LOGIN_FAILED: 'Échec de connexion',
  USER_LOGOUT:       'Déconnexion',
  USER_CREATED:      'Utilisateur créé',
  USER_UPDATED:      'Utilisateur modifié',
  USER_DEACTIVATED:  'Utilisateur désactivé',
  USER_REACTIVATED:  'Utilisateur réactivé',
};

const ACTION_COLORS: Record<AuditAction, string> = {
  USER_LOGIN:        'bg-success/10 text-success border border-success/20',
  USER_LOGIN_FAILED: 'bg-danger/10 text-danger border border-danger/20',
  USER_LOGOUT:       'bg-[#E9ECEF] text-textMuted border border-borderLight',
  USER_CREATED:      'bg-primary/10 text-primary border border-primary/20',
  USER_UPDATED:      'bg-warning/20 text-warning border border-warning/30',
  USER_DEACTIVATED:  'bg-danger/10 text-danger border border-danger/20',
  USER_REACTIVATED:  'bg-success/10 text-success border border-success/20',
};

const ROLES_AUTORISES = ['Super Administrateur', 'Administrateur'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
}

function MetadataDetails({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata || Object.keys(metadata).length === 0) return null;

  const entries = Object.entries(metadata).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return null;

  const labels: Record<string, string> = {
    reason:             'Raison',
    role:               'Rôle',
    stores:             'Magasins',
    attempted_username: 'Identifiant tenté',
    store_id:           'Magasin tenté',
  };

  return (
    <ul className="mt-1 space-y-0.5">
      {entries.map(([key, value]) => (
        <li key={key} className="text-xs text-textMuted">
          <span className="font-medium text-textSecondary">{labels[key] ?? key} :</span>{' '}
          {Array.isArray(value) ? value.join(', ') : String(value)}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function AuditPage() {
  const { user: sessionUser, isLoading: sessionLoading } = useSession();

  if (!sessionLoading && sessionUser !== null) {
    if (!ROLES_AUTORISES.includes(sessionUser.roleName)) {
      forbidden();
    }
  }

  // --- État des filtres ---
  const [filterAction, setFilterAction]     = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate]   = useState('');

  // --- État des données ---
  const [logs, setLogs]           = useState<AuditLog[]>([]);
  const [total, setTotal]         = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage]           = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const LIMIT = 20;

  const loadLogs = useCallback(async (p: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('limit', String(LIMIT));
      if (filterAction)    params.set('action',    filterAction);
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate)   params.set('endDate',   filterEndDate);

      const res = await apiClient.get<AuditLogsResponse>(`/api/audit?${params.toString()}`);
      setLogs(res.data.logs);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
      setPage(res.data.page);
    } catch {
      setError('Impossible de charger le journal d\'audit.');
    } finally {
      setIsLoading(false);
    }
  }, [filterAction, filterStartDate, filterEndDate]);

  // Chargement initial
  useEffect(() => {
    if (!sessionLoading) loadLogs(1);
  }, [sessionLoading, loadLogs]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadLogs(1);
  }

  function handleReset() {
    setFilterAction('');
    setFilterStartDate('');
    setFilterEndDate('');
    // Le useEffect se rechargera avec les nouveaux états vides
  }

  return (
    <div className="flex flex-col gap-6">
      {/* En-tête */}
      <div>
        <h1 className="text-xl font-semibold text-textMain">Journal d&apos;audit</h1>
        <p className="text-sm text-textMuted mt-1">
          Historique complet des actions effectuées sur la plateforme.
          {sessionUser?.roleName === 'Administrateur' && (
            <span> Vous voyez uniquement les actions relatives à vos magasins.</span>
          )}
        </p>
      </div>

      {/* Filtres */}
      <form
        onSubmit={handleSearch}
        className="flex flex-wrap items-end gap-3 p-4 bg-surface border border-borderLight rounded"
      >
        {/* Type d'action */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-textSecondary">Type d&apos;action</label>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-3 py-2 text-sm bg-background border border-borderLight rounded text-textPrimary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
          >
            <option value="">Toutes</option>
            {(Object.entries(ACTION_LABELS) as [AuditAction, string][]).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* Date de début */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-textSecondary">Du</label>
          <input
            type="datetime-local"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
            className="px-3 py-2 text-sm bg-background border border-borderLight rounded text-textPrimary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
          />
        </div>

        {/* Date de fin */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-textSecondary">Au</label>
          <input
            type="datetime-local"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
            className="px-3 py-2 text-sm bg-background border border-borderLight rounded text-textPrimary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" variant="primary" size="sm">
            Filtrer
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={handleReset}>
            Réinitialiser
          </Button>
        </div>
      </form>

      {/* Compteur */}
      {!isLoading && !error && (
        <p className="text-xs text-textMuted">
          {total === 0
            ? 'Aucun événement trouvé.'
            : `${total} événement${total > 1 ? 's' : ''} — page ${page} / ${totalPages}`}
        </p>
      )}

      {/* Erreur */}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {/* Tableau */}
      {isLoading ? (
        <p className="text-sm text-textMuted">Chargement…</p>
      ) : (
        <div className="overflow-x-auto border border-borderLight rounded">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borderLight bg-background">
                <th className="px-4 py-3 text-left font-medium text-textSecondary whitespace-nowrap">
                  Date / Heure
                </th>
                <th className="px-4 py-3 text-left font-medium text-textSecondary">
                  Acteur
                </th>
                <th className="px-4 py-3 text-left font-medium text-textSecondary">
                  Action
                </th>
                <th className="px-4 py-3 text-left font-medium text-textSecondary">
                  Cible
                </th>
                <th className="px-4 py-3 text-left font-medium text-textSecondary">
                  Magasin
                </th>
                <th className="px-4 py-3 text-left font-medium text-textSecondary">
                  Détails
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-textMuted">
                    Aucun événement trouvé.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-borderLight hover:bg-background/50 transition-colors"
                  >
                    {/* Date */}
                    <td className="px-4 py-3 whitespace-nowrap text-textMuted font-mono text-xs">
                      {formatDate(log.created_at)}
                    </td>

                    {/* Acteur */}
                    <td className="px-4 py-3 font-medium text-textMain whitespace-nowrap">
                      {log.actor_name}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={[
                          'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                          ACTION_COLORS[log.action] ?? 'bg-[#E9ECEF] text-textMuted border border-borderLight',
                        ].join(' ')}
                      >
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>

                    {/* Cible */}
                    <td className="px-4 py-3 text-textMuted">
                      {log.target_name ? (
                        <span>
                          <span className="text-xs text-textMuted mr-1">
                            {log.target_type}
                          </span>
                          <span className="font-medium text-textMain">{log.target_name}</span>
                        </span>
                      ) : (
                        <span aria-label="Sans cible">—</span>
                      )}
                    </td>

                    {/* Magasin */}
                    <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                      {log.store_name ?? <span aria-label="Sans magasin">—</span>}
                    </td>

                    {/* Détails */}
                    <td className="px-4 py-3">
                      <MetadataDetails metadata={log.metadata} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadLogs(page - 1)}
            disabled={page <= 1 || isLoading}
          >
            ← Précédent
          </Button>

          <span className="text-sm text-textMuted px-2">
            {page} / {totalPages}
          </span>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadLogs(page + 1)}
            disabled={page >= totalPages || isLoading}
          >
            Suivant →
          </Button>
        </div>
      )}
    </div>
  );
}
