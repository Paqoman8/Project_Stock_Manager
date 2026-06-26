import type { InvoiceStatus } from '../types';

const CLS: Record<InvoiceStatus, string> = {
  PENDING:  'bg-[#F1F3F5] text-textMuted border-borderLight',
  PAID:     'bg-green-50 text-green-700 border-green-200',
  OVERDUE:  'bg-red-50 text-red-700 border-red-200',
  DISPUTED: 'bg-orange-50 text-orange-700 border-orange-200',
};

const LABELS: Record<InvoiceStatus, string> = {
  PENDING:  'En attente',
  PAID:     'Payée',
  OVERDUE:  'En retard',
  DISPUTED: 'Disputée',
};

export default function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span className={['inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', CLS[status]].join(' ')}>
      {LABELS[status]}
    </span>
  );
}
