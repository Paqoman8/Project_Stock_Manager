'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '@/lib/apiClient';
import { useSession } from '@/contexts/SessionContext';
import { inputCls } from '@/lib/ui';
import {
  BarCard,
  DonutCard,
  RecentActionsCard,
  StatCards,
  TrendBarCard,
  type DashboardBar,
  type DashboardDonut,
  type DashboardLine,
  type DashboardRecentAction,
  type DashboardStatCard,
} from '@/components/dashboard/OverviewWidgets';

type DashboardResponse = {
  success: boolean;
  dashboard: {
    visibility: {
      sales_widgets: boolean;
      low_stock_card: boolean;
      pending_transfers_card: boolean;
      recent_actions: boolean;
    };
    stat_cards: DashboardStatCard[];
    donut: DashboardDonut | null;
    bar: DashboardBar | null;
    line: DashboardLine | null;
    recent_actions: DashboardRecentAction[];
  };
};

function todayStr(): string {
  return formatLocalDate(new Date());
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatLocalDate(d);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function DashboardPage() {
  const { user, isLoading } = useSession();
  const [data, setData] = useState<DashboardResponse['dashboard'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [period, setPeriod] = useState({ from: daysAgoStr(6), to: todayStr() });

  const params = useMemo(
    () => `?from=${period.from}&to=${period.to}`,
    [period.from, period.to],
  );

  const fetchDashboard = useCallback(() => {
    setIsFetching(true);
    setError(null);
    apiClient
      .get<DashboardResponse>(`/api/dashboard/overview${params}`)
      .then(({ data: response }) => setData(response.dashboard))
      .catch(() => setError('Impossible de charger le tableau de bord.'))
      .finally(() => setIsFetching(false));
  }, [params]);

  useEffect(() => {
    if (isLoading || !user) return;
    fetchDashboard();
  }, [isLoading, user, fetchDashboard]);

  if (isLoading || (isFetching && !data)) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-80 animate-pulse rounded bg-borderLight" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-36 animate-pulse rounded bg-borderLight" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="h-80 animate-pulse rounded bg-borderLight" />
          <div className="h-80 animate-pulse rounded bg-borderLight" />
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-semibold text-textMain">Vue d’ensemble du magasin</h1>

        <div className="flex items-center gap-2 rounded border border-borderLight bg-surface px-3 py-1.5">
          <label htmlFor="dash-from" className="text-xs text-textMuted whitespace-nowrap">Du</label>
          <input
            id="dash-from"
            type="date"
            className={[inputCls, '!w-auto !py-1 !text-xs'].join(' ')}
            value={period.from}
            max={period.to}
            onChange={(e) => setPeriod((prev) => ({ ...prev, from: e.target.value }))}
          />
          <label htmlFor="dash-to" className="text-xs text-textMuted whitespace-nowrap">au</label>
          <input
            id="dash-to"
            type="date"
            className={[inputCls, '!w-auto !py-1 !text-xs'].join(' ')}
            value={period.to}
            min={period.from}
            max={todayStr()}
            onChange={(e) => setPeriod((prev) => ({ ...prev, to: e.target.value }))}
          />
          <button
            type="button"
            onClick={fetchDashboard}
            className="ml-1 rounded bg-primary px-3 py-1 text-xs text-white hover:opacity-90"
          >
            Appliquer
          </button>
        </div>

        {isFetching && (
          <span className="text-xs text-textMuted animate-pulse">Chargement…</span>
        )}
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {data ? <StatCards cards={data.stat_cards} /> : null}

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        {data?.donut ? <DonutCard chart={data.donut} /> : null}
        {data?.line ? <TrendBarCard chart={data.line} /> : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        {data?.bar ? <BarCard chart={data.bar} /> : null}
        {data?.recent_actions ? <RecentActionsCard actions={data.recent_actions} /> : null}
      </div>
    </section>
  );
}
