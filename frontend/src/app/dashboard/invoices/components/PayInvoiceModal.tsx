import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Portal } from '@/components/ui/Portal';
import { extractApiError } from '@/lib/ui';
import apiClient from '@/lib/apiClient';
import { formatAmount } from '../helpers';
import type { SupplierInvoiceRow } from '../types';

interface PayInvoiceModalProps {
  invoice:   SupplierInvoiceRow | null;
  onClose:   () => void;
  onSuccess: () => void;
}

export default function PayInvoiceModal({ invoice, onClose, onSuccess }: PayInvoiceModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError]         = useState<string | null>(null);

  useEffect(() => { if (!invoice) return; setApiError(null); }, [invoice]);

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
    <Portal>
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
            {invoice.invoice_ref && <strong className="text-textMain">{invoice.invoice_ref} </strong>}
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
    </Portal>
  );
}
