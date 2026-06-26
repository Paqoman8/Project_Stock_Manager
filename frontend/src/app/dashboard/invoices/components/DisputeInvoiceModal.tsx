import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { extractApiError } from '@/lib/ui';
import apiClient from '@/lib/apiClient';
import type { SupplierInvoiceRow } from '../types';

interface DisputeInvoiceModalProps {
  invoice:   SupplierInvoiceRow | null;
  onClose:   () => void;
  onSuccess: () => void;
}

export default function DisputeInvoiceModal({ invoice, onClose, onSuccess }: DisputeInvoiceModalProps) {
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
