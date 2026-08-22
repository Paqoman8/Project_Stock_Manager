import type { InvoiceStatus } from '../types';

interface InvoiceFiltersProps {
  filterStatus:    InvoiceStatus | '';
  onStatusChange:  (v: InvoiceStatus | '') => void;
}

export default function InvoiceFilters({ filterStatus, onStatusChange }: InvoiceFiltersProps) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor="filter-status" className="text-xs font-medium text-textSecondary whitespace-nowrap">
        Filtrer par statut
      </label>
      <select
        id="filter-status"
        value={filterStatus}
        onChange={(e) => onStatusChange(e.target.value as InvoiceStatus | '')}
        className="px-3 py-1.5 text-sm bg-background border border-borderLight rounded text-textMain focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">Tous</option>
        <option value="PENDING">En attente</option>
        <option value="PAID">Payées</option>
        <option value="OVERDUE">En retard</option>
        <option value="DISPUTED">Disputées</option>
      </select>
    </div>
  );
}
