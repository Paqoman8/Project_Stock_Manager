// src/app/platform/organizations/page.tsx
// Liste des organisations — Platform Manager uniquement (accès déjà garanti
// par PlatformGuard au niveau du layout /platform).
//
// Pagination + filtre par statut gérés côté backend (GET /api/platform/organizations),
// à l'image de la page Transferts.

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { formatDate, inputCls } from '@/lib/ui';
import { extractApiErrorMessage } from '@/lib/errors';
import {
  listOrganizations,
  suspendOrganization,
  reactivateOrganization,
  type OrganizationRow,
  type OrganizationStatus,
} from '@/services/platform.service';
import { OrganizationFormModal } from '@/components/platform/OrganizationFormModal';
import { OrganizationCreatedModal } from '@/components/platform/OrganizationCreatedModal';
import { OrganizationDetailModal } from '@/components/platform/OrganizationDetailModal';
import { OrgStatusBadge } from '@/components/platform/OrgStatusBadge';

const PAGE_SIZE = 20;

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterStatus, setFilterStatus] = useState<OrganizationStatus | ''>('');

  const [actionTarget, setActionTarget] = useState<
    { org: OrganizationRow; type: 'suspend' | 'reactivate' } | null
  >(null);
  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [detailTargetId, setDetailTargetId] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createdResult, setCreatedResult] = useState<
    { organizationName: string; adminUsername: string; adminPassword: string } | null
  >(null);

  const loadOrganizations = useCallback(
    async (targetPage = page, status = filterStatus) => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await listOrganizations(targetPage, PAGE_SIZE, status);
        setOrganizations(data.organizations);
        setPage(data.page);
        setTotalPages(data.totalPages);
      } catch (err: unknown) {
        setError(extractApiErrorMessage(err, 'Impossible de charger les organisations.'));
      } finally {
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadOrganizations(1, '');
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleStatusFilterChange(value: OrganizationStatus | '') {
    setFilterStatus(value);
    void loadOrganizations(1, value);
  }

  async function handleConfirmAction() {
    if (!actionTarget) return;
    setIsActing(true);
    setActionError(null);
    try {
      if (actionTarget.type === 'suspend') {
        await suspendOrganization(actionTarget.org.id);
      } else {
        await reactivateOrganization(actionTarget.org.id);
      }
      setActionTarget(null);
      void loadOrganizations(page, filterStatus);
    } catch (err: unknown) {
      setActionError(extractApiErrorMessage(err, 'Une erreur est survenue. Veuillez réessayer.'));
    } finally {
      setIsActing(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-textMain">Organisations</h1>
        <Button variant="primary" size="md" onClick={() => setShowCreateModal(true)}>
          Nouvelle organisation
        </Button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <div className="bg-surface border border-borderLight rounded overflow-hidden">
        <div className="p-3 border-b border-borderLight">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => handleStatusFilterChange(e.target.value as OrganizationStatus | '')}
              className={[inputCls, 'shrink-0 w-auto'].join(' ')}
              aria-label="Filtrer par statut"
            >
              <option value="">Tous les statuts</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspendue</option>
              <option value="DISABLED">Désactivée</option>
            </select>

            {filterStatus && (
              <button
                type="button"
                onClick={() => handleStatusFilterChange('')}
                className="shrink-0 px-3 py-2 text-xs border border-borderLight rounded text-textMuted hover:text-red-600 hover:border-red-300 transition-colors"
              >
                Réinitialiser
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-background text-textMuted">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Nom</th>
                <th className="text-left px-4 py-2 font-medium">Slug</th>
                <th className="text-left px-4 py-2 font-medium">Statut</th>
                <th className="text-left px-4 py-2 font-medium">Établissements</th>
                <th className="text-left px-4 py-2 font-medium">Utilisateurs</th>
                <th className="text-left px-4 py-2 font-medium">Créée le</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="px-4 py-4 text-textMuted" colSpan={7}>Chargement...</td>
                </tr>
              ) : organizations.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-textMuted" colSpan={7}>
                    {filterStatus ? 'Aucune organisation ne correspond à ce filtre.' : 'Aucune organisation.'}
                  </td>
                </tr>
              ) : (
                organizations.map((org) => (
                  <tr key={org.id} className="border-t border-borderLight">
                    <td className="px-4 py-3 text-textMain align-top font-medium">
                      {org.name}
                      {org.is_protected && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-background border border-borderLight text-textMuted">
                          Protégée
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-textMuted align-top font-mono text-xs">{org.slug}</td>
                    <td className="px-4 py-3 align-top"><OrgStatusBadge status={org.status} /></td>
                    <td className="px-4 py-3 text-textMain align-top">{org._count.stores}</td>
                    <td className="px-4 py-3 text-textMain align-top">{org._count.user_store_accesses}</td>
                    <td className="px-4 py-3 text-textMuted align-top">{formatDate(org.created_at)}</td>
                    <td className="px-4 py-3 align-top text-right space-x-2 whitespace-nowrap">
                      {!org.is_protected && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setDetailTargetId(org.id)}
                        >
                          Détails
                        </Button>
                      )}
                      {org.status === 'ACTIVE' && !org.is_protected && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setActionTarget({ org, type: 'suspend' })}
                        >
                          Suspendre
                        </Button>
                      )}
                      {(org.status === 'SUSPENDED' || org.status === 'DISABLED') && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setActionTarget({ org, type: 'reactivate' })}
                        >
                          Réactiver
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-borderLight flex items-center justify-between">
            <p className="text-xs text-textMuted">
              Page {page} / {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(1, page - 1);
                  void loadOrganizations(next, filterStatus);
                }}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs border border-borderLight rounded text-textMuted hover:text-textMain hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Précédent
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = Math.min(totalPages, page + 1);
                  void loadOrganizations(next, filterStatus);
                }}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-xs border border-borderLight rounded text-textMuted hover:text-textMain hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Suivant →
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={actionTarget !== null}
        title={actionTarget?.type === 'suspend' ? 'Suspendre l\'organisation' : 'Réactiver l\'organisation'}
        message={
          actionError
            ? actionError
            : actionTarget?.type === 'suspend'
              ? `Voulez-vous vraiment suspendre "${actionTarget?.org.name}" ? Ses utilisateurs ne pourront plus se connecter tant qu'elle n'est pas réactivée.`
              : `Voulez-vous vraiment réactiver "${actionTarget?.org.name}" ? Ses utilisateurs pourront de nouveau se connecter.`
        }
        confirmLabel={actionTarget?.type === 'suspend' ? 'Suspendre' : 'Réactiver'}
        confirmVariant={actionTarget?.type === 'suspend' ? 'danger' : 'primary'}
        cancelLabel="Annuler"
        onConfirm={handleConfirmAction}
        onCancel={() => { setActionTarget(null); setActionError(null); }}
        isConfirming={isActing}
      />

      <OrganizationDetailModal
        organizationId={detailTargetId}
        onClose={() => setDetailTargetId(null)}
      />

      <OrganizationFormModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={(result) => {
          setShowCreateModal(false);
          setCreatedResult(result);
        }}
      />

      {createdResult && (
        <OrganizationCreatedModal
          organizationName={createdResult.organizationName}
          adminUsername={createdResult.adminUsername}
          adminPassword={createdResult.adminPassword}
          onClose={() => {
            setCreatedResult(null);
            void loadOrganizations(1, filterStatus);
          }}
        />
      )}
    </section>
  );
}
