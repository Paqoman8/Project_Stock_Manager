'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from '@/contexts/SessionContext';
import apiClient from '@/lib/apiClient';
import { POS_ROLES, formatPrice } from '@/lib/pos';


// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

type Summary = {
  total_sales:  number;
  total_amount: number;
  date:         string;
};


// ---------------------------------------------------------------------------
// COMPONENT                                                                
// ---------------------------------------------------------------------------

/**
 * DailySalesSummary — dashboard widget showing today's sales total
 * for roles with POS access. Fetches data from /api/transactions/summary.
 */
export function DailySalesSummary() {
  const { user, isLoading } = useSession();
  const [summary, setSummary]     = useState<Summary | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const canView = !isLoading && user !== null &&
    POS_ROLES.includes(user.roleName as (typeof POS_ROLES)[number]);

  useEffect(() => {
    if (!canView || !user) return;
    setIsFetching(true);
    apiClient
      .get<{ success: boolean; summary: Summary }>('/api/transactions/summary')
      .then(({ data }) => setSummary(data.summary ?? null))
      .catch(() => setSummary(null))
      .finally(() => setIsFetching(false));
  }, [canView, user]);

  if (!canView) return null;

  if (isFetching) {
    return (
      <div className="bg-surface border border-borderLight p-4 space-y-2">
        <div className="h-4 w-32 bg-borderLight rounded animate-pulse" />
        <div className="h-7 w-24 bg-borderLight rounded animate-pulse" />
      </div>
    );
  }

  // Only show if summary data available
  if (!summary) return null;

  return (
    <div className="bg-surface border border-borderLight p-4 space-y-1">
      <p className="text-xs font-medium text-textMuted uppercase tracking-wide">
        Ventes du jour
      </p>
      <p className="text-2xl font-bold text-primary">
        {formatPrice(summary.total_amount)} F
      </p>
      <p className="text-xs text-textMuted">
        {summary.total_sales} transaction{summary.total_sales !== 1 ? 's' : ''} —{' '}
        {new Date(summary.date).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
      </p>
    </div>
  );
}
