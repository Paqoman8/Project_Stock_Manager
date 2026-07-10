import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { inputCls, extractApiError } from '@/lib/ui';
import apiClient from '@/lib/apiClient';
import type { PurchaseOrderRow } from '../types';

interface CreateInvoiceModalProps {
  orders:    PurchaseOrderRow[];
  onClose:   () => void;
  onSuccess: () => void;
}

export default function CreateInvoiceModal({ orders, onClose, onSuccess }: CreateInvoiceModalProps) {
  const [orderId,      setOrderId]      = useState('');
  const [invoiceRef,   setInvoiceRef]   = useState('');
  const [amount,       setAmount]       = useState('');
  const [dueAt,        setDueAt]        = useState('');
  const [notes,        setNotes]        = useState('');
  const [apiError,     setApiError]     = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const facturableOrders = orders.filter(
    (o) => ['SENT', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(o.status) && !o.invoice,
  );

  // Total attendu de la commande sélectionnée (arrondi entier, même logique que l'auto-fill)
  const selectedOrder = facturableOrders.find((o) => o.id === orderId) ?? null;
  const orderTotal = selectedOrder?.items?.length
    ? Math.round(selectedOrder.items.reduce((sum, item) => sum + item.ordered_qty * parseFloat(item.unit_price), 0))
    : null;

  const parsedAmountPreview = parseFloat(amount);
  const hasAmountDiscrepancy = orderTotal !== null && !isNaN(parsedAmountPreview) && parsedAmountPreview !== orderTotal;

  // Auto-remplissage du montant depuis les lignes de commande
  useEffect(() => {
    if (!orderId) return;
    const selected = facturableOrders.find((o) => o.id === orderId);
    if (!selected || !selected.items?.length) return;
    const total = selected.items.reduce(
      (sum, item) => sum + item.ordered_qty * parseFloat(item.unit_price),
      0,
    );
    setAmount(String(Math.round(total)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

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
    if (hasAmountDiscrepancy && !notes.trim()) {
      setApiError('Une note est obligatoire lorsque le montant de la facture diffère du total de la commande.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/api/invoices', {
        order_id:    orderId,
        invoice_ref: invoiceRef.trim() || undefined,
        amount:      parsedAmount,
        due_at:      dueAt ? `${dueAt}T00:00:00.000Z` : undefined,
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
          <h2 id="create-invoice-title" className="text-base font-medium text-textMain">Nouvelle facture</h2>
          <button onClick={onClose} aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto flex-1">

            <div className="flex flex-col gap-1">
              <label htmlFor="invoice-order" className="text-xs font-medium text-textSecondary">
                Commande <span className="text-danger">*</span>
              </label>
              {facturableOrders.length === 0 ? (
                <p className="text-sm text-textMuted py-2">
                  Aucune commande facturable disponible (les commandes doivent être en statut SENT, PARTIALLY_RECEIVED ou RECEIVED et sans facture existante).
                </p>
              ) : (
                <select id="invoice-order" value={orderId}
                  onChange={(e) => setOrderId(e.target.value)} className={inputCls}>
                  <option value="">— Sélectionner une commande —</option>
                  {facturableOrders.map((o) => (
                    <option key={o.id} value={o.id}>{o.reference} — {o.supplier.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="invoice-ref" className="text-xs font-medium text-textSecondary">
                Référence facture fournisseur (optionnel)
              </label>
              <input id="invoice-ref" type="text" value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                placeholder="Ex : FAC-2026-0042" className={inputCls} />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="invoice-amount" className="text-xs font-medium text-textSecondary">
                Montant (XOF) <span className="text-danger">*</span>
              </label>
              <input id="invoice-amount" type="number" step="1" min="0" value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="0" className={inputCls} />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="invoice-due-at" className="text-xs font-medium text-textSecondary">
                Date d&apos;échéance (optionnel)
              </label>
              <input id="invoice-due-at" type="date" value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className={inputCls} />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="invoice-notes" className="text-xs font-medium text-textSecondary">
                Notes{hasAmountDiscrepancy
                  ? <span className="text-danger"> *</span>
                  : <span className="font-normal text-textMuted"> (optionnel)</span>}
              </label>
              {hasAmountDiscrepancy && (
                <p className="text-xs text-amber-700">
                  Écart de {Math.abs(parsedAmountPreview - orderTotal!).toLocaleString('fr-FR')} XOF avec le total de la commande.
                </p>
              )}
              <textarea id="invoice-notes" value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={hasAmountDiscrepancy ? 'Justifiez l\'écart avec le total de la commande…' : 'Observations, conditions particulières…'}
                className={inputCls + ' resize-none'} />
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
