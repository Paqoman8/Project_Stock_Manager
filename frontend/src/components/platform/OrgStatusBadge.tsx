// src/components/platform/OrgStatusBadge.tsx
// Badge de statut d'organisation — partagé entre la liste et la modale de détail.

import type { OrganizationStatus } from '@/services/platform.service';

const STATUS_LABELS: Record<OrganizationStatus, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspendue',
  DISABLED: 'Désactivée',
};

const STATUS_BADGE_CLASSES: Record<OrganizationStatus, string> = {
  ACTIVE: 'bg-success/10 text-success',
  SUSPENDED: 'bg-warning/20 text-yellow-700',
  DISABLED: 'bg-danger/10 text-danger',
};

export function OrgStatusBadge({ status }: { status: OrganizationStatus }) {
  return (
    <span
      className={[
        'inline-block px-2 py-0.5 rounded text-xs font-medium',
        STATUS_BADGE_CLASSES[status],
      ].join(' ')}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
