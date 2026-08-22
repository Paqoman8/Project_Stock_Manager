// src/components/platform/OrganizationDetailModal.tsx
// Modale "Détails de l'organisation" — affichée depuis le bouton d'action
// de la ligne dans /platform/organizations. Charge le détail (incluant les
// comptes admin) via GET /api/platform/organizations/:id à l'ouverture.

'use client';

import React, { useEffect, useState } from 'react';
import { Portal } from '@/components/ui/Portal';
import { formatDate } from '@/lib/ui';
import { extractApiErrorMessage } from '@/lib/errors';
import { getOrganization, type OrganizationDetail } from '@/services/platform.service';
import { OrgStatusBadge } from '@/components/platform/OrgStatusBadge';

interface OrganizationDetailModalProps {
  organizationId: string | null;
  onClose: () => void;
}

export function OrganizationDetailModal({ organizationId, onClose }: OrganizationDetailModalProps) {
  const [detail, setDetail] = useState<OrganizationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getOrganization(organizationId)
      .then((data) => {
        if (!cancelled) setDetail(data.organization);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(extractApiErrorMessage(err, "Impossible de charger le détail de l'organisation."));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [organizationId]);

  if (!organizationId) return null;

  return (
    <Portal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="org-detail-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg bg-surface border border-borderLight rounded shadow-lg p-6 mx-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 id="org-detail-modal-title" className="text-base font-medium text-textMain">
            Détails de l&apos;organisation
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xl text-textMuted hover:text-textMain leading-none"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {isLoading && <p className="text-sm text-textMuted">Chargement...</p>}

        {error && (
          <div className="rounded border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2 mb-4">
            {error}
          </div>
        )}

        {detail && !isLoading && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-textMain">
                {detail.name}
                {detail.is_protected && (
                  <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-background border border-borderLight text-textMuted align-middle">
                    Protégée
                  </span>
                )}
              </h3>
              <p className="text-xs text-textMuted font-mono">{detail.slug}</p>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-textMuted">Statut</dt>
                <dd><OrgStatusBadge status={detail.status} /></dd>
              </div>
              <div>
                <dt className="text-xs text-textMuted">Établissements</dt>
                <dd className="text-textMain">{detail._count.stores}</dd>
              </div>
              <div>
                <dt className="text-xs text-textMuted">Utilisateurs</dt>
                <dd className="text-textMain">{detail._count.user_store_accesses}</dd>
              </div>
              <div>
                <dt className="text-xs text-textMuted">Créée le</dt>
                <dd className="text-textMain">{formatDate(detail.created_at)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-textMuted">Créée par</dt>
                <dd className="text-textMain">{detail.created_by?.username ?? '—'}</dd>
              </div>
            </dl>

            <div>
              <h4 className="text-xs font-semibold text-textMuted uppercase tracking-wide mb-2">
                Comptes administrateurs
              </h4>
              {detail.admins.length === 0 ? (
                <p className="text-sm text-textMuted">Aucun compte administrateur.</p>
              ) : (
                <ul className="divide-y divide-borderLight border border-borderLight rounded">
                  {detail.admins.map((admin) => (
                    <li key={admin.id} className="px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-textMain truncate">{admin.username}</p>
                        <p className="text-xs text-textMuted truncate">{admin.email}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-borderLight text-textMuted">
                          {admin.roleName}
                        </span>
                        {!admin.isActive && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/10 text-danger">
                            Inactif
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    </Portal>
  );
}
