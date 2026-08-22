import { Button } from '@/components/ui/Button';
import SkeletonRows from '@/components/shared/SkeletonRows';
import { formatDate } from '@/lib/ui';
import { formatAmount } from '../helpers';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import type { SupplierInvoiceRow } from '../types';

const COLUMNS = ['Réf. facture', 'Commande', 'Fournisseur', 'Montant', 'Statut', 'Émission', 'Échéance', 'Actions'];

interface InvoiceTableProps {
  invoices:   SupplierInvoiceRow[];
  isLoading:  boolean;
  fetchError: string | null;
  onDetail:   (inv: SupplierInvoiceRow) => void;
  onPay:      (inv: SupplierInvoiceRow) => void;
}

export default function InvoiceTable({ invoices, isLoading, fetchError, onDetail, onPay }: InvoiceTableProps) {
  return (
    <>
      {fetchError && <p role="alert" className="text-sm text-danger">{fetchError}</p>}

      {!isLoading && !fetchError && (
        <p className="text-xs text-textMuted -mt-3">
          {invoices.length === 0
            ? 'Aucune facture trouvée.'
            : `${invoices.length} facture${invoices.length > 1 ? 's' : ''}`}
        </p>
      )}

      <div className="bg-surface border border-borderLight rounded overflow-x-auto">
        <table className="w-full text-sm" role="table" aria-label="Factures fournisseurs">
          <thead>
            <tr className="bg-background border-b border-borderLight">
              {COLUMNS.map((col) => (
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

                  <td className="px-4 py-3 font-mono text-xs text-textMain whitespace-nowrap">
                    {inv.invoice_ref ?? <span className="text-textMuted italic">—</span>}
                  </td>

                  <td className="px-4 py-3 font-mono text-xs font-medium text-textMain whitespace-nowrap">
                    {inv.order.reference}
                  </td>

                  <td className="px-4 py-3 text-textMain whitespace-nowrap">
                    {inv.order.supplier.name}
                  </td>

                  <td className="px-4 py-3 text-textMain font-medium whitespace-nowrap tabular-nums">
                    {formatAmount(inv.amount)}
                  </td>

                  <td className="px-4 py-3">
                    <InvoiceStatusBadge status={inv.status} />
                  </td>

                  <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                    {formatDate(inv.issued_at)}
                  </td>

                  <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                    {formatDate(inv.due_at)}
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => onDetail(inv)}
                        aria-label={`Voir le détail de la facture ${inv.invoice_ref ?? inv.order.reference}`}>
                        Détails
                      </Button>
                      {['PENDING', 'DISPUTED', 'OVERDUE'].includes(inv.status) && (
                        <Button variant="primary" size="sm" onClick={() => onPay(inv)}
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
    </>
  );
}
