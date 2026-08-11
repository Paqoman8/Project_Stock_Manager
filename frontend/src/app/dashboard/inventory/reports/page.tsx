// src/app/dashboard/inventory/reports/page.tsx
// Page de gestion des rapports d'inventaire.
//
// Cycle de vie :
//   DRAFT → SUBMITTED → VALIDATED (ajustements SA)
//                    ↘ REJECTED  → DRAFT (correction) → SUBMITTED
//
// Accès :
//   - Création / saisie / soumission : SA, Admin, Manager
//   - Validation / rejet             : SA, Admin
//   - Application des ajustements    : SA uniquement
//
// Export PDF : bouton visible mais désactivé (à implémenter ultérieurement).

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Button } from '@/components/ui/Button';
import { Portal } from '@/components/ui/Portal';
import { useSession } from '@/contexts/SessionContext';
import apiClient from '@/lib/apiClient';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const ROLES_ALLOWED  = ['Super Administrateur', 'Administrateur', 'Manager Magasin'];
const ROLES_VALIDATE = ['Super Administrateur', 'Administrateur'];
const ROLE_SA        = 'Super Administrateur';

const UNIT_LABELS: Record<string, string> = {
  PIECE: 'Pièce', KG: 'kg', G: 'g', L: 'L', CL: 'cL', ML: 'mL',
  BOUTEILLE: 'Bouteille', SACHET: 'Sachet', BOITE: 'Boîte',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReportStatus = 'DRAFT' | 'SUBMITTED' | 'VALIDATED' | 'REJECTED';

interface ReportLineBreakdown {
  id:                   string;
  line_id:              string;
  packaging_format_id:  string;
  packages_theoretical: number;
  packages_counted:     number;
  packages_variance:    number;
  packaging_format:     { id: string; label: string; units_per_package: number };
}

interface ReportLine {
  id:                string;
  product_id:        string;
  stock_theoretical: number;
  stock_counted:     number;
  variance:          number;
  note:              string | null;
  product:           { id: string; name: string; sku: string; unit: string };
  breakdowns:        ReportLineBreakdown[];
}

interface InventoryReport {
  id:                     string;
  reference:              string;
  store_id:               string;
  status:                 ReportStatus;
  period_start:           string;
  period_end:             string;
  notes:                  string | null;
  rejection_reason:       string | null;
  created_at:             string;
  submitted_at:           string | null;
  validated_at:           string | null;
  adjustments_applied_at: string | null;
  store:                  { id: string; name: string; color: string };
  created_by:             { id: string; username: string };
  validated_by:           { id: string; username: string } | null;
  lines:                  ReportLine[];
}

interface StoreOption { id: string; name: string; color: string }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const inputCls =
  'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-full';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function extractApiError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.message ?? fallback;
  return fallback;
}

// ---------------------------------------------------------------------------
// Badge statut
// ---------------------------------------------------------------------------

function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const cls: Record<ReportStatus, string> = {
    DRAFT:     'bg-[#F1F3F5] text-textMuted border-borderLight',
    SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
    VALIDATED: 'bg-green-50 text-green-700 border-green-200',
    REJECTED:  'bg-red-50 text-red-700 border-red-200',
  };
  const labels: Record<ReportStatus, string> = {
    DRAFT:     'Brouillon',
    SUBMITTED: 'Soumis',
    VALIDATED: 'Validé',
    REJECTED:  'Rejeté',
  };
  return (
    <span className={['inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', cls[status]].join(' ')}>
      {labels[status]}
    </span>
  );
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {[1, 2, 3].map((n) => (
        <tr key={n} aria-hidden="true">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3"><div className="h-4 bg-borderLight rounded animate-pulse" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Modale : création d'un rapport
// ---------------------------------------------------------------------------

function CreateReportModal({
  stores,
  defaultStoreId,
  onClose,
  onCreated,
}: {
  stores:         StoreOption[];
  defaultStoreId: string;
  onClose:        () => void;
  onCreated:      (r: InventoryReport) => void;
}) {
  // Semaine courante : lundi → dimanche
  const today = new Date();
  const day   = today.getDay() || 7;
  const mon   = new Date(today); mon.setDate(today.getDate() - day + 1);
  const sun   = new Date(mon);   sun.setDate(mon.getDate() + 6);
  const fmt   = (d: Date) => d.toISOString().slice(0, 10);

  const [storeId,     setStoreId]     = useState(defaultStoreId || stores[0]?.id || '');
  const [periodStart, setPeriodStart] = useState(fmt(mon));
  const [periodEnd,   setPeriodEnd]   = useState(fmt(sun));
  const [notes,       setNotes]       = useState('');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!storeId) { setError('Sélectionnez un établissement.'); return; }

    setSaving(true);
    try {
      const { data } = await apiClient.post('/api/inventory-reports', {
        store_id:     storeId,
        period_start: new Date(periodStart).toISOString(),
        period_end:   new Date(periodEnd + 'T23:59:59').toISOString(),
        notes:        notes.trim() || undefined,
      });
      onCreated(data.report as InventoryReport);
    } catch (err) {
      setError(extractApiError(err, 'Impossible de créer le rapport.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Portal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-create-report-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md mx-4 bg-surface border border-borderLight rounded shadow-lg max-h-[90vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight flex-shrink-0">
          <h2 id="modal-create-report-title" className="text-base font-medium text-textMain">
            Nouveau rapport d'inventaire
          </h2>
          <button
            onClick={onClose}
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {/* Corps scrollable */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto flex-1">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-textSecondary">Établissement</label>
              <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className={inputCls}>
                <option value="">— Choisir —</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-textSecondary">Début de période</label>
                <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-textSecondary">Fin de période</label>
                <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-textSecondary">Notes (optionnel)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} rows={2} />
            </div>
            {error && (
              <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded px-3 py-2">{error}</p>
            )}
          </div>

          {/* Pied fixe */}
          <div className="px-6 py-4 border-t border-borderLight flex justify-end gap-2 flex-shrink-0">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Création…' : 'Créer le rapport'}</Button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
}

// ---------------------------------------------------------------------------
// Modale : détail + saisie + workflow
// ---------------------------------------------------------------------------

function ReportDetailModal({
  report,
  canValidate,
  isSA,
  onClose,
  onUpdated,
}: {
  report:      InventoryReport;
  canValidate: boolean;
  isSA:        boolean;
  onClose:     () => void;
  onUpdated:   (r: InventoryReport) => void;
}) {
  // État local des lignes (quantités saisies)
  const [lines,          setLines]          = useState<ReportLine[]>(report.lines);
  const [savingLines,    setSavingLines]    = useState(false);
  const [actionLoading,  setActionLoading]  = useState<string | null>(null);
  const [rejectReason,   setRejectReason]   = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  const isDraft              = report.status === 'DRAFT';
  const isSubmitted          = report.status === 'SUBMITTED';
  const isValidated          = report.status === 'VALIDATED';
  const isRejected           = report.status === 'REJECTED';
  const adjustmentsApplied   = report.adjustments_applied_at !== null;
  const isEditable           = isDraft;

  // Mise à jour d'un champ direct (stock_counted / note) sur les lignes sans breakdown
  function updateLine(productId: string, field: 'stock_counted' | 'note', value: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.product_id !== productId) return l;
        if (field === 'note') return { ...l, note: value };
        const counted = parseInt(value, 10) || 0;
        return { ...l, stock_counted: counted, variance: counted - l.stock_theoretical };
      }),
    );
  }

  // Mise à jour du comptage d'un format dans un breakdown
  function updateBreakdown(productId: string, formatId: string, packagesCounted: number) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.product_id !== productId) return l;
        const newBreakdowns = l.breakdowns.map((b) =>
          b.packaging_format_id === formatId
            ? { ...b, packages_counted: packagesCounted, packages_variance: packagesCounted - b.packages_theoretical }
            : b,
        );
        // Recalculer le total en unités depuis les breakdowns
        const computedCounted = newBreakdowns.reduce(
          (sum, b) => sum + b.packages_counted * b.packaging_format.units_per_package, 0,
        );
        return {
          ...l,
          breakdowns:    newBreakdowns,
          stock_counted: computedCounted,
          variance:      computedCounted - l.stock_theoretical,
        };
      }),
    );
  }

  // Retourne true si la sauvegarde a réussi, false sinon
  async function saveLines(): Promise<boolean> {
    setSavingLines(true);
    setError(null);
    try {
      const { data } = await apiClient.put(`/api/inventory-reports/${report.id}/lines`, {
        lines: lines.map((l) => ({
          product_id:    l.product_id,
          stock_counted: l.stock_counted,
          note:          l.note || undefined,
          ...(l.breakdowns.length > 0 ? {
            breakdowns: l.breakdowns.map((b) => ({
              packaging_format_id: b.packaging_format_id,
              packages_counted:    b.packages_counted,
            })),
          } : {}),
        })),
      });
      onUpdated(data.report as InventoryReport);
      setLines((data.report as InventoryReport).lines);
      return true;
    } catch (err) {
      setError(extractApiError(err, 'Impossible de sauvegarder les lignes.'));
      return false;
    } finally {
      setSavingLines(false);
    }
  }

  async function doAction(action: string, body?: Record<string, unknown>) {
    setActionLoading(action);
    setError(null);
    try {
      const { data } = await apiClient.patch(`/api/inventory-reports/${report.id}/${action}`, body ?? {});
      onUpdated(data.report as InventoryReport);
    } catch (err) {
      setError(extractApiError(err, `Échec de l'action "${action}".`));
    } finally {
      setActionLoading(null);
    }
  }

  // Sauvegarde les lignes puis soumet — garantit que les valeurs saisies sont persistées
  async function handleSubmit() {
    const saved = await saveLines();
    if (!saved) return;
    await doAction('submit');
  }

  async function handleApplyAdjustments() {
    setActionLoading('apply-adjustments');
    setError(null);
    try {
      await apiClient.patch(`/api/inventory-reports/${report.id}/apply-adjustments`);
      const { data } = await apiClient.get(`/api/inventory-reports/${report.id}`);
      onUpdated(data.report as InventoryReport);
    } catch (err) {
      setError(extractApiError(err, 'Échec de l\'application des ajustements.'));
    } finally {
      setActionLoading(null);
    }
  }

  // Détecte s'il existe des écarts à corriger (lignes directes OU breakdowns)
  const hasVariances = lines.some((l) =>
    l.breakdowns.length > 0
      ? l.breakdowns.some((b) => b.packages_variance !== 0)
      : l.variance !== 0,
  );

  return (
    <Portal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-report-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-4xl mx-4 bg-surface border border-borderLight rounded shadow-lg max-h-[90vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight flex-shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h2 id="modal-report-detail-title" className="text-base font-medium text-textMain">{report.reference}</h2>
              <ReportStatusBadge status={report.status} />
            </div>
            <p className="text-sm text-textMuted mt-0.5">
              <span className="font-medium" style={{ color: report.store.color }}>{report.store.name}</span>
              {' · '}
              {formatDate(report.period_start)} → {formatDate(report.period_end)}
              {' · '}
              Créé par {report.created_by.username}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {/* Motif de rejet — état terminal */}
        {isRejected && (
          <div className="mx-6 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 space-y-1">
            <p className="font-medium">Ce rapport a été rejeté (état terminal).</p>
            {report.rejection_reason && <p><span className="font-medium">Motif :</span> {report.rejection_reason}</p>}
            <p className="text-xs text-red-500">Veuillez créer un nouveau rapport pour cette période.</p>
          </div>
        )}

        {/* Notes */}
        {report.notes && (
          <div className="mx-6 mt-4 px-4 py-2 bg-background border border-borderLight rounded text-sm text-textMuted">
            {report.notes}
          </div>
        )}

        {/* Tableau des lignes */}
        <div className="flex-1 overflow-auto mx-6 mt-4">
          <table className="w-full text-sm border border-borderLight rounded overflow-hidden">
            <thead className="bg-background border-b border-borderLight">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-textMuted">Produit / Format</th>
                <th className="px-4 py-2 text-left font-medium text-textMuted">SKU</th>
                <th className="px-4 py-2 text-right font-medium text-textMuted">Théorique</th>
                <th className="px-4 py-2 text-right font-medium text-textMuted">Compté</th>
                <th className="px-4 py-2 text-right font-medium text-textMuted">Écart</th>
                <th className="px-4 py-2 text-left font-medium text-textMuted">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLight">
              {lines.map((line) => {
                const unit       = UNIT_LABELS[line.product.unit] ?? line.product.unit;
                const isPos      = line.variance > 0;
                const isNeg      = line.variance < 0;
                const hasBreaks  = line.breakdowns.length > 0;

                return (
                  <React.Fragment key={line.product_id}>
                    {/* Ligne produit principale */}
                    <tr className={hasBreaks ? 'bg-background/40' : 'hover:bg-background/60'}>
                      <td className="px-4 py-2 text-textMain font-medium">
                        {line.product.name}
                        {hasBreaks && (
                          <span className="ml-2 text-xs text-textMuted font-normal">
                            ({line.breakdowns.length} format{line.breakdowns.length > 1 ? 's' : ''})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-textMuted">{line.product.sku}</td>
                      <td className="px-4 py-2 text-right text-textMuted">
                        {line.stock_theoretical} <span className="text-xs">{unit}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {/* Éditable directement seulement si pas de breakdowns */}
                        {isEditable && !hasBreaks ? (
                          <input
                            type="number"
                            min={0}
                            value={line.stock_counted}
                            onChange={(e) => updateLine(line.product_id, 'stock_counted', e.target.value)}
                            className="w-20 px-2 py-1 text-sm text-right border border-borderLight rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          <span className={hasBreaks ? 'text-textMuted text-xs italic' : 'text-textMain'}>
                            {line.stock_counted} <span className="text-xs text-textMuted">{unit}</span>
                            {hasBreaks && <span className="ml-1">(calculé)</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        <span className={isPos ? 'text-green-600' : isNeg ? 'text-red-600' : 'text-textMuted'}>
                          {isPos ? '+' : ''}{line.variance}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {isEditable ? (
                          <input
                            type="text"
                            value={line.note ?? ''}
                            onChange={(e) => updateLine(line.product_id, 'note', e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-borderLight rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="Motif si écart…"
                          />
                        ) : (
                          <span className="text-textMuted text-xs">{line.note ?? '—'}</span>
                        )}
                      </td>
                    </tr>

                    {/* Sous-lignes par format de conditionnement */}
                    {hasBreaks && line.breakdowns.map((bd) => {
                      const bdIsPos = bd.packages_variance > 0;
                      const bdIsNeg = bd.packages_variance < 0;
                      return (
                        <tr key={bd.packaging_format_id} className="bg-[#F8F9FA] hover:bg-[#F1F3F5]">
                          <td className="pl-10 pr-4 py-1.5 text-xs text-textMuted" colSpan={1}>
                            <span className="flex items-center gap-1.5">
                              <span className="w-px h-3 bg-borderLight flex-shrink-0" aria-hidden="true" />
                              {bd.packaging_format.label}
                              <span className="text-textMuted/60">× {bd.packaging_format.units_per_package} {unit}</span>
                            </span>
                          </td>
                          <td className="px-4 py-1.5 text-xs text-textMuted" />
                          <td className="px-4 py-1.5 text-right text-xs text-textMuted">
                            {bd.packages_theoretical} colis
                          </td>
                          <td className="px-4 py-1.5 text-right text-xs">
                            {isEditable ? (
                              <input
                                type="number"
                                min={0}
                                value={bd.packages_counted}
                                onChange={(e) =>
                                  updateBreakdown(line.product_id, bd.packaging_format_id, parseInt(e.target.value, 10) || 0)
                                }
                                className="w-20 px-2 py-0.5 text-xs text-right border border-borderLight rounded bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            ) : (
                              <span className="text-textMain">{bd.packages_counted} colis</span>
                            )}
                          </td>
                          <td className="px-4 py-1.5 text-right text-xs font-medium">
                            <span className={bdIsPos ? 'text-green-600' : bdIsNeg ? 'text-red-600' : 'text-textMuted'}>
                              {bdIsPos ? '+' : ''}{bd.packages_variance}
                            </span>
                          </td>
                          <td className="px-4 py-1.5 text-xs text-textMuted" />
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pied de page : actions */}
        <div className="px-6 py-4 border-t border-borderLight flex-shrink-0 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

          {/* Formulaire rejet */}
          {showRejectForm && (
            <div className="flex gap-2">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className={[inputCls, 'flex-1'].join(' ')}
                placeholder="Motif de rejet obligatoire…"
              />
              <Button
                variant="danger"
                size="sm"
                onClick={() => { doAction('reject', { reason: rejectReason }); setShowRejectForm(false); }}
                disabled={!rejectReason.trim() || actionLoading === 'reject'}
              >
                Confirmer le rejet
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowRejectForm(false)}>
                Annuler
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap">
            {/* Export PDF — désactivé, à implémenter */}
            <Button
              variant="secondary"
              size="sm"
              disabled
              title="Fonctionnalité à venir — export PDF du rapport"
            >
              ↓ Exporter PDF
            </Button>

            <div className="flex gap-2 flex-wrap justify-end">
              {/* Sauvegarder les lignes — uniquement en DRAFT */}
              {isDraft && (
                <Button variant="secondary" size="sm" onClick={saveLines} disabled={savingLines}>
                  {savingLines ? 'Sauvegarde…' : 'Sauvegarder'}
                </Button>
              )}

              {/* Soumettre — sauvegarde les lignes puis change le statut */}
              {isDraft && (
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={savingLines || actionLoading === 'submit'}
                >
                  {savingLines ? 'Sauvegarde…' : actionLoading === 'submit' ? 'Soumission…' : 'Soumettre pour validation'}
                </Button>
              )}

              {/* Valider */}
              {isSubmitted && canValidate && (
                <Button
                  size="sm"
                  onClick={() => doAction('validate')}
                  disabled={actionLoading === 'validate'}
                >
                  {actionLoading === 'validate' ? 'Validation…' : 'Valider'}
                </Button>
              )}

              {/* Rejeter */}
              {isSubmitted && canValidate && !showRejectForm && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowRejectForm(true)}
                >
                  Rejeter
                </Button>
              )}

              {/* Appliquer les ajustements — SA, rapport validé, écarts présents, non encore appliqués */}
              {isValidated && isSA && hasVariances && !adjustmentsApplied && (
                <Button
                  size="sm"
                  onClick={handleApplyAdjustments}
                  disabled={actionLoading === 'apply-adjustments'}
                  title="Crée des mouvements de stock pour corriger les écarts (opération unique)"
                >
                  {actionLoading === 'apply-adjustments' ? 'Application…' : 'Appliquer les ajustements'}
                </Button>
              )}

              {/* Confirmation que les ajustements ont été appliqués */}
              {isValidated && adjustmentsApplied && (
                <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-1.5">
                  Ajustements appliqués le {formatDate(report.adjustments_applied_at)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}

// ---------------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------------

export default function InventoryReportsPage() {
  const router = useRouter();
  const { user, isLoading: sessionLoading } = useSession();

  const [reports,     setReports]     = useState<InventoryReport[]>([]);
  const [stores,      setStores]      = useState<StoreOption[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  // Filtres
  const [filterStore,  setFilterStore]  = useState('');
  const [filterStatus, setFilterStatus] = useState<ReportStatus | ''>('');

  // Modales
  const [showCreate,   setShowCreate]   = useState(false);
  const [detailReport, setDetailReport] = useState<InventoryReport | null>(null);

  const canValidate = !sessionLoading && user !== null && ROLES_VALIDATE.includes(user.roleName);
  const isSA        = !sessionLoading && user !== null && user.roleName === ROLE_SA;

  // JWT storeId pour pré-sélectionner l'établissement du Manager
  const defaultStoreId = user?.storeId ?? '';

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterStore)  params.set('store_id', filterStore);
      if (filterStatus) params.set('status',   filterStatus);

      const { data } = await apiClient.get(`/api/inventory-reports?${params.toString()}`);
      setReports(data.reports as InventoryReport[]);
    } catch (err) {
      setError(extractApiError(err, 'Impossible de charger les rapports.'));
    } finally {
      setLoading(false);
    }
  }, [filterStore, filterStatus]);

  useEffect(() => {
    apiClient.get('/api/auth/accessible-stores').then(({ data }) => {
      setStores(data.stores as StoreOption[]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sessionLoading) {
      if (!user || !ROLES_ALLOWED.includes(user.roleName)) {
        router.replace('/dashboard');
        return;
      }
      loadReports();
    }
  }, [sessionLoading, user, router, loadReports]);

  function handleCreated(report: InventoryReport) {
    setShowCreate(false);
    setReports((prev) => [report, ...prev]);
    setDetailReport(report);
  }

  function handleUpdated(updated: InventoryReport) {
    setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setDetailReport(updated);
  }

  if (sessionLoading) return null;

  return (
    <div className="p-6 space-y-6">
      {/* Navigation retour */}
      <a href="/dashboard/inventory" className="text-sm text-textMuted hover:text-textMain transition-colors">
        ← Retour à l'inventaire
      </a>

      {/* Titre + actions */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-textMain">Rapports d'inventaire</h1>
          <p className="text-sm text-textMuted mt-0.5">
            Comptages physiques hebdomadaires par établissement.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          + Nouveau rapport
        </Button>
      </div>

      {/* Filtres */}
      <div className="bg-surface border border-borderLight rounded-lg px-4 py-3 flex flex-wrap gap-3 items-center">
        <select
          value={filterStore}
          onChange={(e) => setFilterStore(e.target.value)}
          className={[inputCls, 'w-auto min-w-[180px]'].join(' ')}
        >
          <option value="">Tous les établissements</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as ReportStatus | '')}
          className={[inputCls, 'w-auto min-w-[140px]'].join(' ')}
        >
          <option value="">Tous les statuts</option>
          <option value="DRAFT">Brouillon</option>
          <option value="SUBMITTED">Soumis</option>
          <option value="VALIDATED">Validé</option>
          <option value="REJECTED">Rejeté</option>
        </select>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      {/* Tableau */}
      <div className="bg-surface border border-borderLight rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borderLight bg-background text-left">
                <th className="px-4 py-3 font-medium text-textMuted">Référence</th>
                <th className="px-4 py-3 font-medium text-textMuted">Établissement</th>
                <th className="px-4 py-3 font-medium text-textMuted">Période</th>
                <th className="px-4 py-3 font-medium text-textMuted">Statut</th>
                <th className="px-4 py-3 font-medium text-textMuted">Créé par</th>
                <th className="px-4 py-3 font-medium text-textMuted">Créé le</th>
                <th className="px-4 py-3 font-medium text-textMuted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLight">
              {loading ? (
                <SkeletonRows cols={7} />
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-textMuted">
                    Aucun rapport d'inventaire.
                  </td>
                </tr>
              ) : (
                reports.map((report) => (
                  <tr key={report.id} className="hover:bg-background/60 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm font-medium text-textMain">
                      {report.reference}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: report.store.color }}
                          aria-hidden="true"
                        />
                        {report.store.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-textMuted text-xs">
                      {formatDate(report.period_start)} → {formatDate(report.period_end)}
                    </td>
                    <td className="px-4 py-3">
                      <ReportStatusBadge status={report.status} />
                    </td>
                    <td className="px-4 py-3 text-textMuted">{report.created_by.username}</td>
                    <td className="px-4 py-3 text-textMuted text-xs">{formatDate(report.created_at)}</td>
                    <td className="px-4 py-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDetailReport(report)}
                      >
                        Ouvrir
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modale création */}
      {showCreate && (
        <CreateReportModal
          stores={stores}
          defaultStoreId={defaultStoreId}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Modale détail */}
      {detailReport && (
        <ReportDetailModal
          report={detailReport}
          canValidate={canValidate}
          isSA={isSA}
          onClose={() => setDetailReport(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
