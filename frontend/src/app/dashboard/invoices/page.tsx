// src/app/dashboard/invoices/page.tsx
// Page de gestion des factures fournisseurs.
//
// Architecture :
//   - Client Component (interactions, état local, appels API)
//   - Accessible uniquement aux rôles SA et Administrateur
//   - Charge la liste des factures + les commandes facturables en parallèle
//
// Cycle de vie d'une facture :
//   PENDING → PAID (payer)
//   PENDING → DISPUTED (contester)
//   DISPUTED → PENDING (rouvrir)
//   DISPUTED → PAID (payer malgré contestation)
//   PAID → terminal

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/contexts/SessionContext';
import apiClient from '@/lib/apiClient';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const ROLES_ALLOWED = ['Super Administrateur', 'Administrateur'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'DISPUTED';
type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';

interface SupplierInvoiceRow {
  id:          string;
  order_id:    string;
  invoice_ref: string | null;
  amount:      string;
  status:      InvoiceStatus;
  issued_at:   string;
  due_at:      string | null;
  paid_at:     string | null;
  notes:       string | null;
  order: {
    id:                string;
    reference:         string;
    supplier:          { id: string; name: string };
    destination_store: { id: string; name: string };
  };
}

interface PurchaseOrderRow {
  id:        string;
  reference: string;
  status:    PurchaseOrderStatus;
  supplier:  { id: string; name: string };
  destination_store: { id: string; name: string };
  invoice:   SupplierInvoiceRow | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const inputCls =
  'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-full';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function formatAmount(amount: string): string {
  return parseFloat(amount).toLocaleString('fr-FR', {
    style:                 'currency',
    currency:              'XOF',
    minimumFractionDigits: 0,
  });
}

function extractApiError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.message ?? fallback;
  return fallback;
}

// ---------------------------------------------------------------------------
// Badge statut
// ---------------------------------------------------------------------------

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const cls: Record<InvoiceStatus, string> = {
    PENDING:  'bg-[#F1F3F5] text-textMuted border-borderLight',
    PAID:     'bg-green-50 text-green-700 border-green-200',
    OVERDUE:  'bg-red-50 text-red-700 border-red-200',
    DISPUTED: 'bg-orange-50 text-orange-700 border-orange-200',
  };
  const labels: Record<InvoiceStatus, string> = {
    PENDING:  'En attente',
    PAID:     'Payée',
    OVERDUE:  'En retard',
    DISPUTED: 'Disputée',
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
// Modale 1 : Créer une facture
// ---------------------------------------------------------------------------

function CreateInvoiceModal({
  orders,
  onClose,
  onSuccess,
}: {
  orders: PurchaseOrderRow[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [orderId,    setOrderId]    = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [amount,     setAmount]     = useState('');
  const [dueAt,      setDueAt]      = useState('');
  const [notes,      setNotes]      = useState('');
  const [apiError,   setApiError]   = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Commandes facturables : SENT, PARTIALLY_RECEIVED, RECEIVED et sans facture existante
  const facturableOrders = orders.filter(
    (o) =>
      ['SENT', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(o.status) &&
      !o.invoice,
  );

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);

    if (!orderId) { setApiError('Veuillez sélectionner une commande.'); return; }
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setApiError('Le montant doit être un nombre positif.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/api/invoices', {
        order_id:    orderId,
        invoice_ref: invoiceRef.trim() || undefined,
        amount:      parsedAmount,
        due_at:      dueAt || undefined,
        notes:       notes.trim() || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(extractApiError(err, 'Une erreur est survenue lors de la création de la facture.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="create-invoice-title"
      className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-lg mx-4 bg-surface border border-borderLight rounded shadow-lg max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight flex-shrink-0">
          <h2 id="create-invoice-title" className="text-base font-medium text-textMain">
            Nouvelle facture
          </h2>
          <button onClick={onClose} aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto flex-1">

            {/* Commande */}
            <div className="flex flex-col gap-1">
              <label htmlFor="invoice-order" className="text-xs font-medium text-textSecondary">
                Commande <span className="text-danger">*</span>
              </label>
              {facturableOrders.length === 0 ? (
                <p className="text-sm text-textMuted py-2">
                  Aucune commande facturable disponible (les commandes doivent être en statut SENT, PARTIALLY_RECEIVED ou RECEIVED et sans facture existante).
                </p>
              ) : (
                <select
                  id="invoice-order"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Sélectionner une commande —</option>
                  {facturableOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.reference} — {o.supplier.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Référence facture */}
            <div className="flex flex-col gap-1">
              <label htmlFor="invoice-ref" className="text-xs font-medium text-textSecondary">
                Référence facture fournisseur (optionnel)
              </label>
              <input
                id="invoice-ref"
                type="text"
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                placeholder="Ex : FAC-2026-0042"
                className={inputCls}
              />
            </div>

            {/* Montant */}
            <div className="flex flex-col gap-1">
              <label htmlFor="invoice-amount" className="text-xs font-medium text-textSecondary">
                Montant (XOF) <span className="text-danger">*</span>
              </label>
              <input
                id="invoice-amount"
                type="number"
                step="1"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>

            {/* Date d'échéance */}
            <div className="flex flex-col gap-1">
              <label htmlFor="invoice-due-at" className="text-xs font-medium text-textSecondary">
                Date d&apos;échéance (optionnel)
              </label>
              <input
                id="invoice-due-at"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value ? new Date(e.target.value).toISOString() : '')}
                className={inputCls}
              />
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1">
              <label htmlFor="invoice-notes" className="text-xs font-medium text-textSecondary">
                Notes (optionnel)
              </label>
              <textarea
                id="invoice-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Observations, conditions particulières…"
                className={inputCls + ' resize-none'}
              />
            </div>

            {apiError && <p role="alert" className="text-sm text-danger">{apiError}</p>}
          </div>

          <div className="px-6 py-4 border-t border-borderLight flex justify-end gap-2 flex-shrink-0">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}
              disabled={facturableOrders.length === 0}>
              Créer la facture
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale 2 : Détail / édition d'une facture
// ---------------------------------------------------------------------------

function InvoiceDetailModal({
  invoice,
  onClose,
  onSuccess,
  onPay,
  onDispute,
  onReopen,
}: {
  invoice: SupplierInvoiceRow | null;
  onClose: () => void;
  onSuccess: () => void;
  onPay:     (inv: SupplierInvoiceRow) => void;
  onDispute: (inv: SupplierInvoiceRow) => void;
  onReopen:  (inv: SupplierInvoiceRow) => void;
}) {
  const [invoiceRef,   setInvoiceRef]   = useState('');
  const [amount,       setAmount]       = useState('');
  const [dueAt,        setDueAt]        = useState('');
  const [notes,        setNotes]        = useState('');
  const [apiError,     setApiError]     = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty,      setIsDirty]      = useState(false);

  useEffect(() => {
    if (!invoice) return;
    setInvoiceRef(invoice.invoice_ref ?? '');
    setAmount(parseFloat(invoice.amount).toString());
    setDueAt(invoice.due_at ? invoice.due_at.substring(0, 10) : '');
    setNotes(invoice.notes ?? '');
    setApiError(null);
    setIsDirty(false);
  }, [invoice]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!invoice) return null;

  const isEditable = invoice.status !== 'PAID';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice || !isDirty) return;
    setApiError(null);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setApiError('Le montant doit être un nombre positif.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.patch(`/api/invoices/${invoice.id}`, {
        invoice_ref: invoiceRef.trim() || undefined,
        amount:      parsedAmount,
        due_at:      dueAt ? new Date(dueAt).toISOString() : undefined,
        notes:       notes.trim() || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(extractApiError(err, 'Une erreur est survenue lors de la mise à jour.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="invoice-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-lg mx-4 bg-surface border border-borderLight rounded shadow-lg max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 id="invoice-detail-title" className="text-base font-medium text-textMain">
              Facture — {invoice.order.reference}
            </h2>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <button onClick={onClose} aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none">×</button>
        </div>

        <form onSubmit={handleSave} noValidate className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto flex-1">

            {/* Infos commande (lecture seule) */}
            <div className="p-3 bg-background border border-borderLight rounded flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-textMuted uppercase tracking-wide">Commande liée</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div>
                  <dt className="text-xs text-textMuted">Référence</dt>
                  <dd className="font-mono font-medium text-textMain">{invoice.order.reference}</dd>
                </div>
                <div>
                  <dt className="text-xs text-textMuted">Fournisseur</dt>
                  <dd className="font-medium text-textMain">{invoice.order.supplier.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-textMuted">Destination</dt>
                  <dd className="text-textMain">{invoice.order.destination_store.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-textMuted">Émise le</dt>
                  <dd className="text-textMain">{formatDate(invoice.issued_at)}</dd>
                </div>
                {invoice.paid_at && (
                  <div>
                    <dt className="text-xs text-textMuted">Payée le</dt>
                    <dd className="text-green-700 font-medium">{formatDate(invoice.paid_at)}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Référence facture */}
            <div className="flex flex-col gap-1">
              <label htmlFor="detail-ref" className="text-xs font-medium text-textSecondary">
                Référence facture fournisseur
              </label>
              <input
                id="detail-ref"
                type="text"
                value={invoiceRef}
                disabled={!isEditable}
                onChange={(e) => { setInvoiceRef(e.target.value); setIsDirty(true); }}
                placeholder="Ex : FAC-2026-0042"
                className={inputCls + (!isEditable ? ' opacity-60 cursor-not-allowed' : '')}
              />
            </div>

            {/* Montant */}
            <div className="flex flex-col gap-1">
              <label htmlFor="detail-amount" className="text-xs font-medium text-textSecondary">
                Montant (XOF)
              </label>
              <input
                id="detail-amount"
                type="number"
                step="1"
                min="0"
                value={amount}
                disabled={!isEditable}
                onChange={(e) => { setAmount(e.target.value); setIsDirty(true); }}
                className={inputCls + (!isEditable ? ' opacity-60 cursor-not-allowed' : '')}
              />
            </div>

            {/* Date d'échéance */}
            <div className="flex flex-col gap-1">
              <label htmlFor="detail-due-at" className="text-xs font-medium text-textSecondary">
                Date d&apos;échéance
              </label>
              <input
                id="detail-due-at"
                type="date"
                value={dueAt}
                disabled={!isEditable}
                onChange={(e) => { setDueAt(e.target.value); setIsDirty(true); }}
                className={inputCls + (!isEditable ? ' opacity-60 cursor-not-allowed' : '')}
              />
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1">
              <label htmlFor="detail-notes" className="text-xs font-medium text-textSecondary">
                Notes
              </label>
              <textarea
                id="detail-notes"
                value={notes}
                disabled={!isEditable}
                onChange={(e) => { setNotes(e.target.value); setIsDirty(true); }}
                rows={3}
                className={inputCls + ' resize-none' + (!isEditable ? ' opacity-60 cursor-not-allowed' : '')}
              />
            </div>

            {apiError && <p role="alert" className="text-sm text-danger">{apiError}</p>}

            {/* Actions de transition de statut */}
            <div className="flex flex-col gap-2 pt-1 border-t border-borderLight">
              <p className="text-xs font-semibold text-textMuted uppercase tracking-wide">Actions</p>
              <div className="flex flex-wrap gap-2">
                {/* Marquer payée */}
                {['PENDING', 'DISPUTED', 'OVERDUE'].includes(invoice.status) && (
                  <Button type="button" variant="primary" size="sm" onClick={() => { onClose(); onPay(invoice); }}>
                    Marquer payée
                  </Button>
                )}
                {/* Contester */}
                {['PENDING', 'OVERDUE'].includes(invoice.status) && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => { onClose(); onDispute(invoice); }}>
                    Contester
                  </Button>
                )}
                {/* Rouvrir */}
                {['DISPUTED', 'OVERDUE'].includes(invoice.status) && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => { onClose(); onReopen(invoice); }}>
                    Rouvrir
                  </Button>
                )}
                {invoice.status === 'PAID' && (
                  <p className="text-xs text-textMuted italic self-center">
                    Cette facture est payée — aucune action disponible.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-borderLight flex justify-end gap-2 flex-shrink-0">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>Fermer</Button>
            {isEditable && (
              <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting} disabled={!isDirty}>
                Enregistrer
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale 3 : Confirmer paiement
// ---------------------------------------------------------------------------

function PayInvoiceModal({
  invoice,
  onClose,
  onSuccess,
}: {
  invoice: SupplierInvoiceRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError]         = useState<string | null>(null);

  useEffect(() => {
    if (!invoice) return;
    setApiError(null);
  }, [invoice]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleConfirm() {
    if (!invoice) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      await apiClient.patch(`/api/invoices/${invoice.id}/pay`);
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(extractApiError(err, 'Une erreur est survenue.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!invoice) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="pay-invoice-title"
      className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface border border-borderLight rounded shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="pay-invoice-title" className="text-base font-medium text-textMain">Confirmer le paiement</h2>
          <button onClick={onClose} aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none">×</button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-3">
          <p className="text-sm text-textMuted">
            Marquer la facture{' '}
            {invoice.invoice_ref && (
              <strong className="text-textMain">{invoice.invoice_ref} </strong>
            )}
            de <strong className="text-textMain">{formatAmount(invoice.amount)}</strong>{' '}
            (commande <span className="font-mono text-xs">{invoice.order.reference}</span>) comme payée ?
          </p>
          <p className="text-xs text-danger font-medium">
            Cette action est irréversible — la facture ne pourra plus être modifiée.
          </p>
          {apiError && <p role="alert" className="text-sm text-danger">{apiError}</p>}
        </div>
        <div className="px-6 py-4 border-t border-borderLight flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
          <Button type="button" variant="primary" size="sm" isLoading={isSubmitting} onClick={handleConfirm}>
            Confirmer le paiement
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale 4 : Contester une facture
// ---------------------------------------------------------------------------

function DisputeInvoiceModal({
  invoice,
  onClose,
  onSuccess,
}: {
  invoice: SupplierInvoiceRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError]         = useState<string | null>(null);

  useEffect(() => {
    if (!invoice) return;
    setApiError(null);
  }, [invoice]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleConfirm() {
    if (!invoice) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      await apiClient.patch(`/api/invoices/${invoice.id}/dispute`);
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(extractApiError(err, 'Une erreur est survenue.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!invoice) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="dispute-invoice-title"
      className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface border border-borderLight rounded shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="dispute-invoice-title" className="text-base font-medium text-textMain">Contester la facture</h2>
          <button onClick={onClose} aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none">×</button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-3">
          <p className="text-sm text-textMuted">
            Marquer la facture (commande{' '}
            <span className="font-mono text-xs">{invoice.order.reference}</span>) comme disputée ?
          </p>
          <p className="text-xs text-textMuted">
            La facture pourra être rouverte ou payée ultérieurement depuis le détail.
          </p>
          {apiError && <p role="alert" className="text-sm text-danger">{apiError}</p>}
        </div>
        <div className="px-6 py-4 border-t border-borderLight flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
          <Button type="button" variant="danger" size="sm" isLoading={isSubmitting} onClick={handleConfirm}>
            Confirmer la contestation
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function InvoicesPage() {
  const router = useRouter();
  const { user: sessionUser, isLoading: sessionLoading } = useSession();

  const [invoices,  setInvoices]  = useState<SupplierInvoiceRow[]>([]);
  const [orders,    setOrders]    = useState<PurchaseOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filtres
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | ''>('');

  // Modales
  const [showCreate,      setShowCreate]      = useState(false);
  const [invoiceToDetail, setInvoiceToDetail] = useState<SupplierInvoiceRow | null>(null);
  const [invoiceToPay,    setInvoiceToPay]    = useState<SupplierInvoiceRow | null>(null);
  const [invoiceToDispute, setInvoiceToDispute] = useState<SupplierInvoiceRow | null>(null);

  // Contrôle d'accès
  useEffect(() => {
    if (sessionLoading || !sessionUser) return;
    if (!ROLES_ALLOWED.includes(sessionUser.roleName)) router.replace('/dashboard');
  }, [sessionLoading, sessionUser, router]);

  // Chargement des données
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const [invoicesRes, ordersRes] = await Promise.all([
        apiClient.get<{ success: boolean; invoices: SupplierInvoiceRow[] }>(
          filterStatus ? `/api/invoices?status=${filterStatus}` : '/api/invoices'
        ),
        apiClient.get<{ success: boolean; orders: PurchaseOrderRow[] }>(
          '/api/purchase-orders'
        ),
      ]);
      setInvoices(invoicesRes.data.invoices ?? []);
      setOrders(ordersRes.data.orders ?? []);
    } catch (err) {
      setFetchError(extractApiError(err, 'Impossible de charger les factures.'));
    } finally {
      setIsLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    if (sessionLoading || !sessionUser) return;
    if (!ROLES_ALLOWED.includes(sessionUser.roleName)) return;
    loadData();
  }, [loadData, sessionLoading, sessionUser]);

  // Réouverture d'une facture disputée — pas de modale dédiée, action directe
  async function handleReopen(invoice: SupplierInvoiceRow) {
    try {
      await apiClient.patch(`/api/invoices/${invoice.id}/reopen`);
      loadData();
    } catch (err) {
      console.error('Erreur lors de la réouverture :', err);
    }
  }

  if (sessionLoading || !sessionUser) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-8 w-64 bg-borderLight rounded animate-pulse" aria-hidden="true" />
      </div>
    );
  }

  if (!ROLES_ALLOWED.includes(sessionUser.roleName)) return null;

  return (
    <div className="flex flex-col gap-6">

      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-textMain">Factures fournisseurs</h1>
          <p className="text-sm text-textMuted">
            Suivi des factures liées aux commandes fournisseurs.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          + Nouvelle facture
        </Button>
      </div>

      {/* Filtre statut */}
      <div className="flex items-center gap-3">
        <label htmlFor="filter-status" className="text-xs font-medium text-textSecondary whitespace-nowrap">
          Filtrer par statut
        </label>
        <select
          id="filter-status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as InvoiceStatus | '')}
          className="px-3 py-1.5 text-sm bg-background border border-borderLight rounded text-textMain focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Tous</option>
          <option value="PENDING">En attente</option>
          <option value="PAID">Payées</option>
          <option value="OVERDUE">En retard</option>
          <option value="DISPUTED">Disputées</option>
        </select>
      </div>

      {/* Erreur */}
      {fetchError && <p role="alert" className="text-sm text-danger">{fetchError}</p>}

      {/* Compteur */}
      {!isLoading && !fetchError && (
        <p className="text-xs text-textMuted -mt-3">
          {invoices.length === 0
            ? 'Aucune facture trouvée.'
            : `${invoices.length} facture${invoices.length > 1 ? 's' : ''}`}
        </p>
      )}

      {/* Tableau */}
      <div className="bg-surface border border-borderLight rounded overflow-x-auto">
        <table className="w-full text-sm" role="table" aria-label="Factures fournisseurs">
          <thead>
            <tr className="bg-background border-b border-borderLight">
              {['Réf. facture', 'Commande', 'Fournisseur', 'Montant', 'Statut', 'Émission', 'Échéance', 'Actions'].map((col) => (
                <th key={col} scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-textMuted uppercase tracking-wide whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <SkeletonRows cols={8} />
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-textMuted">
                  Aucune facture trouvée.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id}
                  className="border-b border-borderLight hover:bg-background/50 transition-colors last:border-b-0">

                  {/* Réf. facture */}
                  <td className="px-4 py-3 font-mono text-xs text-textMain whitespace-nowrap">
                    {inv.invoice_ref ?? <span className="text-textMuted italic">—</span>}
                  </td>

                  {/* Commande */}
                  <td className="px-4 py-3 font-mono text-xs font-medium text-textMain whitespace-nowrap">
                    {inv.order.reference}
                  </td>

                  {/* Fournisseur */}
                  <td className="px-4 py-3 text-textMain whitespace-nowrap">
                    {inv.order.supplier.name}
                  </td>

                  {/* Montant */}
                  <td className="px-4 py-3 text-textMain font-medium whitespace-nowrap tabular-nums">
                    {formatAmount(inv.amount)}
                  </td>

                  {/* Statut */}
                  <td className="px-4 py-3">
                    <InvoiceStatusBadge status={inv.status} />
                  </td>

                  {/* Émission */}
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                    {formatDate(inv.issued_at)}
                  </td>

                  {/* Échéance */}
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                    {formatDate(inv.due_at)}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setInvoiceToDetail(inv)}
                        aria-label={`Voir le détail de la facture ${inv.invoice_ref ?? inv.order.reference}`}>
                        Détails
                      </Button>
                      {['PENDING', 'DISPUTED', 'OVERDUE'].includes(inv.status) && (
                        <Button variant="primary" size="sm" onClick={() => setInvoiceToPay(inv)}
                          aria-label={`Marquer la facture ${inv.order.reference} comme payée`}>
                          Payer
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modales */}
      {showCreate && (
        <CreateInvoiceModal
          orders={orders}
          onClose={() => setShowCreate(false)}
          onSuccess={loadData}
        />
      )}

      <InvoiceDetailModal
        invoice={invoiceToDetail}
        onClose={() => setInvoiceToDetail(null)}
        onSuccess={loadData}
        onPay={(inv) => setInvoiceToPay(inv)}
        onDispute={(inv) => setInvoiceToDispute(inv)}
        onReopen={handleReopen}
      />

      <PayInvoiceModal
        invoice={invoiceToPay}
        onClose={() => setInvoiceToPay(null)}
        onSuccess={loadData}
      />

      <DisputeInvoiceModal
        invoice={invoiceToDispute}
        onClose={() => setInvoiceToDispute(null)}
        onSuccess={loadData}
      />
    </div>
  );
}
