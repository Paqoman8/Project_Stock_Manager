'use client';

import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';

export type DashboardStatCard = {
  id: string;
  label: string;
  value: number;
  suffix?: string;
  tone: 'primary' | 'success' | 'warning' | 'neutral';
};

export type DashboardDonut = {
  title: string;
  total: number;
  segments: Array<{ id: string; label: string; value: number; color: string }>;
};

export type DashboardBar = {
  title: string;
  points: Array<{ label: string; value: number }>;
};

export type DashboardLine = {
  title: string;
  points: Array<{ label: string; value: number }>;
};

export type DashboardRecentAction = {
  id: string;
  label: string;
  meta: string;
  created_at: string;
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}

function toneStyles(tone: DashboardStatCard['tone']): { panel: string; badge: string; accent: string } {
  if (tone === 'primary') {
    return {
      panel: 'border-l-4 border-l-primary',
      badge: 'bg-primary/10 text-primary border border-primary/20',
      accent: 'text-primary',
    };
  }
  if (tone === 'success') {
    return {
      panel: 'border-l-4 border-l-success',
      badge: 'bg-success/10 text-success border border-success/20',
      accent: 'text-success',
    };
  }
  if (tone === 'warning') {
    return {
      panel: 'border-l-4 border-l-warning',
      badge: 'bg-warning/20 text-textMain border border-warning/30',
      accent: 'text-textMain',
    };
  }
  return {
    panel: 'border-l-4 border-l-textMuted',
    badge: 'bg-background text-textMuted border border-borderLight',
    accent: 'text-textMain',
  };
}

export function StatCards({ cards }: { cards: DashboardStatCard[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const styles = toneStyles(card.tone);
        return (
        <div
          key={card.id}
          className={[
            'rounded border border-borderLight bg-surface p-5 shadow-sm',
            styles.panel,
          ].join(' ')}
        >
          <p className="text-xs uppercase tracking-[0.24em] text-current/70">{card.label}</p>
          <div className="mt-6 flex items-end justify-between gap-3">
            <p className={['text-3xl font-semibold text-textMain', styles.accent].join(' ')}>
              {formatNumber(card.value)}
              {card.suffix ? <span className="ml-1 text-base font-medium text-textMuted">{card.suffix}</span> : null}
            </p>
          </div>
        </div>
      )})}
    </div>
  );
}

export function DonutCard({ chart }: { chart: DashboardDonut }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const total = Math.max(chart.total, 1);
  const segments = useMemo(() => {
    return chart.segments.reduce<Array<DashboardDonut['segments'][number] & { length: number; offset: number }>>((acc, segment) => {
      const ratio = segment.value / total;
      const length = circumference * ratio;
      const previousOffset = acc.length === 0 ? 0 : acc[acc.length - 1].offset + acc[acc.length - 1].length;
      acc.push({ ...segment, length, offset: previousOffset });
      return acc;
    }, []);
  }, [chart.segments, circumference, total]);

  return (
    <Card>
      <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-center">
        <div className="flex justify-center">
          <div className="relative">
            <svg width="180" height="180" viewBox="0 0 180 180" className="-rotate-90 overflow-visible">
              <circle cx="90" cy="90" r={radius} fill="none" stroke="currentColor" strokeWidth="20" className="text-borderLight" />
              {segments.map((segment) => (
                  <circle
                    key={segment.id}
                    cx="90"
                    cy="90"
                    r={radius}
                    fill="none"
                    stroke={segment.color}
                    strokeLinecap="round"
                    strokeWidth={hoveredId === segment.id ? 24 : hoveredId === null ? 20 : 16}
                    strokeDasharray={`${segment.length} ${circumference - segment.length}`}
                    strokeDashoffset={-segment.offset}
                    className="transition-all duration-200"
                    style={{ filter: hoveredId === segment.id ? 'drop-shadow(0 6px 14px rgba(15,23,42,0.18))' : 'none', opacity: hoveredId === null || hoveredId === segment.id ? 1 : 0.35 }}
                    onMouseEnter={() => setHoveredId(segment.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="mt-2 text-3xl font-semibold text-textMain">{formatNumber(chart.total)}</span>
              <span className="text-sm text-textMuted">FCFA</span>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-textMuted">Encaissements</p>
            <h2 className="mt-2 text-xl font-semibold text-textMain">{chart.title}</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {chart.segments.map((segment) => (
              <button
                key={segment.id}
                type="button"
                onMouseEnter={() => setHoveredId(segment.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={[
                  'rounded border px-4 py-3 text-left transition-all',
                  hoveredId === null || hoveredId === segment.id
                    ? 'border-borderLight bg-background'
                    : 'border-borderLight bg-background opacity-60',
                ].join(' ')}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                  <span className="text-sm font-medium text-textMain">{segment.label}</span>
                </div>
                <p className="mt-3 text-2xl font-semibold text-textMain">{formatNumber(segment.value)}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function BarCard({ chart }: { chart: DashboardBar }) {
  const maxValue = Math.max(...chart.points.map((point) => point.value), 1);
  const barClasses = ['bg-primary', 'bg-success', 'bg-warning', 'bg-textMuted'];

  return (
    <Card>
      <p className="text-xs uppercase tracking-[0.28em] text-textMuted">Performance</p>
      <h2 className="mt-2 text-xl font-semibold text-textMain">{chart.title}</h2>
      <div className="mt-6 space-y-4">
        {chart.points.length === 0 ? (
          <p className="text-sm text-textMuted">Aucune vente sur la période.</p>
        ) : (
          chart.points.map((point, index) => (
            <div key={point.label} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-textMain">{point.label}</span>
                <span className="text-sm font-medium text-textMain">{formatNumber(point.value)}</span>
              </div>
              <div className="h-3 rounded-full bg-background">
                <div
                  className={['h-3 rounded-full transition-all', barClasses[index % barClasses.length]].join(' ')}
                  style={{
                    width: `${Math.max((point.value / maxValue) * 100, 8)}%`,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

export function TrendBarCard({ chart }: { chart: DashboardLine }) {
  const count = chart.points.length;
  const values = chart.points.map((p) => p.value);
  const max = Math.max(...values, 1);

  const barGap = 4;
  const bottom = 160;
  const chartH = bottom - 8;
  const viewW = 360;
  const barSlot = (viewW - 16) / count;
  const barW = barSlot - barGap;

  const approxLabelWidth = 55;
  const availableLabelSpace = viewW - 16;
  const maxVisibleLabels = Math.max(1, Math.floor(availableLabelSpace / approxLabelWidth));
  const labelStep = Math.max(1, Math.ceil(count / maxVisibleLabels));

  return (
    <Card>
      <p className="text-xs uppercase tracking-[0.28em] text-textMuted">Évolution</p>
      <h2 className="mt-2 text-xl font-semibold text-textMain">{chart.title}</h2>
      <div className="mt-6 overflow-x-auto">
        <svg width="100%" height="200" viewBox={`0 0 ${viewW} 200`}>
          {[0, 1, 2].map((row) => (
            <line key={row} x1="0" y1={10 + row * 50} x2={viewW} y2={10 + row * 50} stroke="currentColor" strokeDasharray="4 6" className="text-borderLight" />
          ))}
          {chart.points.map((point, index) => {
            const h = Math.max((point.value / max) * chartH, 2);
            const x = 8 + index * barSlot;
            const showLabel = index % labelStep === 0;
            return (
              <g key={point.label}>
                <rect
                  x={x}
                  y={bottom - h}
                  width={barW}
                  height={h}
                  rx="3"
                  className="fill-primary"
                />
                {showLabel && (
                  <text x={x + barW / 2} y={bottom + 16} textAnchor="middle" className="fill-current text-[10px] text-textMuted">
                    {point.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </Card>
  );
}

export function RecentActionsCard({ actions }: { actions: DashboardRecentAction[] }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-[0.28em] text-textMuted">Flux récent</p>
      <h2 className="mt-2 text-xl font-semibold text-textMain">Actions récentes</h2>
      <div className="mt-6 space-y-3">
        {actions.length === 0 ? (
          <p className="text-sm text-textMuted">Aucune action récente à afficher pour ce magasin.</p>
        ) : (
          actions.map((action) => (
            <div key={action.id} className="rounded border border-borderLight bg-background px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-textMain">{action.label}</p>
                  <p className="mt-1 text-xs text-textMuted">{action.meta}</p>
                </div>
                <span className="whitespace-nowrap text-xs text-textMuted">
                  {new Date(action.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
