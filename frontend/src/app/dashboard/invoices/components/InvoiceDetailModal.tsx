import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { inputCls, formatDate, extractApiError } from '@/lib/ui';
import apiClient from '@/lib/apiClient';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import type { SupplierInvoiceRow } from '../types';

interface InvoiceDetailModalProps {
  invoice:   SupplierInvoiceRow | null;
  onClose:   () => void;
  onSuccess: () => void;
  onPay:     (inv: SupplierInvoiceRow) => void;
  onDispute: (inv: SupplierInvoiceRow) => void;
  onReopen:  (inv: SupplierInvoiceRow) => void;
}

export default function InvoiceDetailModal({
  invoice, onClose, onSuccess, onPay, onDispute, onReopen,
}: InvoiceDetailModalProps) {
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

  const disabledCls = ' opacity-60 cursor-not-allowed';

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

            <div className="flex flex-col gap-1">
              <label htmlFor="detail-ref" className="text-xs font-medium text-textSecondary">
                Référence facture fournisseur
              </label>
              <input id="detail-ref" type="text" value={invoiceRef} disabled={!isEditable}
                onChange={(e) => { setInvoiceRef(e.target.value); setIsDirty(true); }}
                placeholder="Ex : FAC-2026-0042"
                className={inputCls + (!isEditable ? disabledCls : '')} />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="detail-amount" className="text-xs font-medium text-textSecondary">
                Montant (XOF)
              </label>
              <input id="detail-amount" type="number" step="1" min="0" value={amount} disabled={!isEditable}
                onChange={(e) => { setAmount(e.target.value); setIsDirty(true); }}
                className={inputCls + (!isEditable ? disabledCls : '')} />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="detail-due-at" className="text-xs font-medium text-textSecondary">
                Date d&apos;échéance
              </label>
              <input id="detail-due-at" type="date" value={dueAt} disabled={!isEditable}
                onChange={(e) => { setDueAt(e.target.value); setIsDirty(true); }}
                className={inputCls + (!isEditable ? disabledCls : '')} />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="detail-notes" className="text-xs font-medium text-textSecondary">Notes</label>
              <textarea id="detail-notes" value={notes} disabled={!isEditable}
                onChange={(e) => { setNotes(e.target.value); setIsDirty(true); }}
                rows={3}
                className={inputCls + ' resize-none' + (!isEditable ? disabledCls : '')} />
            </div>

            {apiError && <p role="alert" className="text-sm text-danger">{apiError}</p>}

            <div className="flex flex-col gap-2 pt-1 border-t border-borderLight">
              <p className="text-xs font-semibold text-textMuted uppercase tracking-wide">Actions</p>
              <div className="flex flex-wrap gap-2">
                {['PENDING', 'DISPUTED', 'OVERDUE'].includes(invoice.status) && (
                  <Button type="button" variant="primary" size="sm"
                    onClick={() => { onClose(); onPay(invoice); }}>
                    Marquer payée
                  </Button>
                )}
                {['PENDING', 'OVERDUE'].includes(invoice.status) && (
                  <Button type="button" variant="secondary" size="sm"
                    onClick={() => { onClose(); onDispute(invoice); }}>
                    Contester
                  </Button>
                )}
                {['DISPUTED', 'OVERDUE'].includes(invoice.status) && (
                  <Button type="button" variant="secondary" size="sm"
                    onClick={() => { onClose(); onReopen(invoice); }}>
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
