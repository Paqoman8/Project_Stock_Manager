import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { inputCls, formatDate, extractApiError } from '@/lib/ui';
import apiClient from '@/lib/apiClient';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import type { SupplierInvoiceRow, InvoiceOrderItem } from '../types';

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
  const [isEditing,   setIsEditing]   = useState(false);
  const [fullInvoice, setFullInvoice] = useState<SupplierInvoiceRow | null>(null);
  const [invoiceRef,     setInvoiceRef]     = useState('');
  const [amount,         setAmount]         = useState('');
  const [dueAt,          setDueAt]          = useState('');
  const [notes,          setNotes]          = useState('');
  const [apiError,       setApiError]       = useState<string | null>(null);
  const [isSubmitting,   setIsSubmitting]   = useState(false);

  // Chargement du détail complet (avec order.items) à l'ouverture
  useEffect(() => {
    if (!invoice) { setFullInvoice(null); return; }
    setFullInvoice(null);
    apiClient
      .get<{ success: boolean; invoice: SupplierInvoiceRow }>(`/api/invoices/${invoice.id}`)
      .then((res) => setFullInvoice(res.data.invoice))
      .catch(() => setFullInvoice(invoice));
  }, [invoice]);

  useEffect(() => {
    if (!invoice) return;
    setInvoiceRef(invoice.invoice_ref ?? '');
    setAmount(parseFloat(invoice.amount).toString());
    setDueAt(invoice.due_at ? invoice.due_at.substring(0, 10) : '');
    setNotes(invoice.notes ?? '');
    setApiError(null);
    setIsEditing(false);
  }, [invoice]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!invoice) return null;

  const isEditable = invoice.status !== 'PAID';

  const orderTotal = fullInvoice?.order?.items?.length
    ? Math.round(fullInvoice.order.items.reduce(
        (sum: number, item: InvoiceOrderItem) => sum + item.ordered_qty * parseFloat(item.unit_price), 0,
      ))
    : null;

  const parsedAmountEdit = parseFloat(amount);
  const hasAmountDiscrepancy =
    orderTotal !== null && !isNaN(parsedAmountEdit) && parsedAmountEdit !== orderTotal;

  function handleCancelEdit() {
    if (!invoice) return;
    setInvoiceRef(invoice.invoice_ref ?? '');
    setAmount(parseFloat(invoice.amount).toString());
    setDueAt(invoice.due_at ? invoice.due_at.substring(0, 10) : '');
    setNotes(invoice.notes ?? '');
    setApiError(null);
    setIsEditing(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    setApiError(null);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setApiError('Le montant doit être un nombre positif.');
      return;
    }
    if (hasAmountDiscrepancy && !notes.trim()) {
      setApiError('Une note est obligatoire lorsque le montant de la facture diffère du total de la commande.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.patch(`/api/invoices/${invoice.id}`, {
        invoice_ref: invoiceRef.trim() || undefined,
        amount:      parsedAmount,
        due_at:      dueAt ? `${dueAt}T00:00:00.000Z` : undefined,
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

        {/* En-tête */}
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

        <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto flex-1">

          {/* Commande liée */}
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
              {orderTotal !== null && (
                <div className="col-span-2 pt-1 border-t border-borderLight mt-1">
                  <dt className="text-xs text-textMuted">Total commande</dt>
                  <dd className="font-semibold text-textMain">{orderTotal.toLocaleString('fr-FR')} XOF</dd>
                </div>
              )}
              {invoice.paid_at && (
                <div>
                  <dt className="text-xs text-textMuted">Payée le</dt>
                  <dd className="text-green-700 font-medium">{formatDate(invoice.paid_at)}</dd>
                </div>
              )}
            </dl>
          </div>


          {/* ----------------------------------------------------------------
              MODE CONSULTATION
          ---------------------------------------------------------------- */}
          {!isEditing && (
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-textMuted uppercase tracking-wide">Détails de la facture</h3>
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-textMuted text-xs">Référence fournisseur</dt>
                  <dd className="font-mono text-textMain">{invoice.invoice_ref || '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-textMuted text-xs">Montant facturé</dt>
                  <dd className={[
                    'font-semibold',
                    orderTotal !== null && parseFloat(invoice.amount) !== orderTotal
                      ? 'text-amber-700'
                      : 'text-textMain',
                  ].join(' ')}>
                    {parseFloat(invoice.amount).toLocaleString('fr-FR')} XOF
                    {orderTotal !== null && parseFloat(invoice.amount) !== orderTotal && (
                      <span className="ml-1.5 text-xs font-normal">
                        (écart de {Math.abs(parseFloat(invoice.amount) - orderTotal).toLocaleString('fr-FR')} XOF)
                      </span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-textMuted text-xs">Échéance</dt>
                  <dd className="text-textMain">{invoice.due_at ? formatDate(invoice.due_at) : '—'}</dd>
                </div>
                {invoice.notes && (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-textMuted text-xs">Notes</dt>
                    <dd className="text-textMain text-sm whitespace-pre-wrap">{invoice.notes}</dd>
                  </div>
                )}
              </dl>

              {/* Actions métier */}
              <div className="flex flex-col gap-2 pt-2 border-t border-borderLight">
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
          )}

          {/* ----------------------------------------------------------------
              MODE ÉDITION
          ---------------------------------------------------------------- */}
          {isEditing && (
            <form id="invoice-edit-form" onSubmit={handleSave} noValidate className="flex flex-col gap-4">
              <h3 className="text-xs font-semibold text-textMuted uppercase tracking-wide">Modifier la facture</h3>

              <div className="flex flex-col gap-1">
                <label htmlFor="edit-ref" className="text-xs font-medium text-textSecondary">
                  Référence facture fournisseur
                </label>
                <input id="edit-ref" type="text" value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  placeholder="Ex : FAC-2026-0042" className={inputCls} />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="edit-amount" className="text-xs font-medium text-textSecondary">
                  Montant (XOF) <span className="text-danger">*</span>
                </label>
                {hasAmountDiscrepancy && (
                  <p className="text-xs text-amber-700">
                    Écart de {Math.abs(parsedAmountEdit - orderTotal!).toLocaleString('fr-FR')} XOF avec le total de la commande.
                  </p>
                )}
                <input id="edit-amount" type="number" step="1" value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputCls} />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="edit-due-at" className="text-xs font-medium text-textSecondary">
                  Date d&apos;échéance
                </label>
                <input id="edit-due-at" type="date" value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className={inputCls} />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="edit-notes" className="text-xs font-medium text-textSecondary">
                  Notes{hasAmountDiscrepancy
                    ? <span className="text-danger"> *</span>
                    : <span className="font-normal text-textMuted"> (optionnel)</span>}
                </label>
                {hasAmountDiscrepancy && (
                  <p className="text-xs text-amber-700">
                    Obligatoire pour justifier l&apos;écart avec le total de la commande.
                  </p>
                )}
                <textarea id="edit-notes" value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder={hasAmountDiscrepancy ? 'Justifiez l\'écart avec le total de la commande…' : 'Observations, conditions particulières…'}
                  className={inputCls + ' resize-none'} />
              </div>

              {apiError && <p role="alert" className="text-sm text-danger">{apiError}</p>}
            </form>
          )}
        </div>

        {/* Pied */}
        <div className="px-6 py-4 border-t border-borderLight flex justify-between gap-2 flex-shrink-0">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Fermer</Button>
          <div className="flex gap-2">
            {!isEditing && isEditable && (
              <Button type="button" variant="primary" size="sm" onClick={() => setIsEditing(true)}>
                Modifier
              </Button>
            )}
            {isEditing && (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={handleCancelEdit}>
                  Annuler
                </Button>
                <Button type="submit" form="invoice-edit-form" variant="primary" size="sm" isLoading={isSubmitting}>
                  Enregistrer
                </Button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
