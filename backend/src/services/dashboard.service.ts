import { AuditAction, PaymentMethod } from '@prisma/client';
import { prisma } from '../config/database';

const POS_ROLES = ['Super Administrateur', 'Administrateur', 'Manager Magasin', 'Opérateur', 'Caissier'] as const;
const INVENTORY_ROLES = ['Super Administrateur', 'Administrateur', 'Manager Magasin', 'Opérateur'] as const;
const TRANSFER_ROLES = ['Super Administrateur', 'Administrateur', 'Manager Magasin'] as const;

type StatCard = {
  id: string;
  label: string;
  value: number;
  suffix?: string;
  tone: 'primary' | 'success' | 'warning' | 'neutral';
};

type DonutSegment = {
  id: string;
  label: string;
  value: number;
  color: string;
};

type BarPoint = {
  label: string;
  value: number;
};

type LinePoint = {
  label: string;
  value: number;
};

type RecentAction = {
  id: string;
  label: string;
  meta: string;
  created_at: string;
};

export type DashboardOverview = {
  visibility: {
    sales_widgets: boolean;
    low_stock_card: boolean;
    pending_transfers_card: boolean;
    recent_actions: boolean;
  };
  stat_cards: StatCard[];
  donut: {
    title: string;
    total: number;
    segments: DonutSegment[];
  } | null;
  bar: {
    title: string;
    points: BarPoint[];
  } | null;
  line: {
    title: string;
    points: LinePoint[];
  } | null;
  recent_actions: RecentAction[];
};

export type DashboardPeriod = {
  from: Date;
  to: Date;
};

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function isOneOf(roleName: string, roles: readonly string[]): boolean {
  return roles.includes(roleName);
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(date);
}

type TrendGranularity = 'day' | 'week' | 'month';

function getPeriodDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

function getTrendGranularity(dayCount: number): TrendGranularity {
  if (dayCount <= 14) return 'day';
  if (dayCount <= 90) return 'week';
  return 'month';
}

function getPeriodKey(date: Date, granularity: TrendGranularity, from: Date): string {
  if (granularity === 'day') return date.toISOString().slice(0, 10);
  if (granularity === 'week') {
    const daysSinceFrom = Math.floor((date.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
    const weekIndex = Math.floor(daysSinceFrom / 7);
    return `week-${weekIndex}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatPeriodLabel(key: string, granularity: TrendGranularity, from: Date): string {
  if (granularity === 'day') {
    return formatShortDate(new Date(`${key}T00:00:00`));
  }
  if (granularity === 'week') {
    const weekIndex = Number(key.replace('week-', ''));
    const start = new Date(from.getTime() + weekIndex * 7 * 24 * 60 * 60 * 1000);
    return `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}`;
  }
  const [year, month] = key.split('-');
  return new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' }).format(new Date(Number(year), Number(month) - 1));
}

function buildRecentActionLabel(action: AuditAction, targetName: string | null): string {
  const actionLabels: Partial<Record<AuditAction, string>> = {
    TRANSACTION_CREATED: 'Vente enregistrée',
    TRANSACTION_REFUNDED: 'Remboursement effectué',
    TRANSFER_CREATED: 'Transfert créé',
    TRANSFER_CONFIRMED: 'Transfert confirmé',
    TRANSFER_CANCELLED: 'Transfert annulé',
    INVENTORY_REPORT_VALIDATED: 'Rapport d’inventaire validé',
    STOCK_MOVEMENT_CREATED: 'Mouvement de stock enregistré',
    RECEPTION_CONFIRMED: 'Réception confirmée',
  };

  return targetName ? `${actionLabels[action] ?? action} · ${targetName}` : (actionLabels[action] ?? action);
}

export async function getDashboardOverview(
  storeId: string,
  roleName: string,
  period?: DashboardPeriod,
): Promise<DashboardOverview> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const from = period?.from ?? startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
  const to   = period?.to   ?? todayEnd;

  const canViewSales = isOneOf(roleName, POS_ROLES);
  const canViewInventory = isOneOf(roleName, INVENTORY_ROLES);
  const canViewTransfers = isOneOf(roleName, TRANSFER_ROLES);

  const [salesRows, lowStockRows, pendingTransfers, recentAuditRows] = await Promise.all([
    canViewSales
      ? prisma.transaction.findMany({
          where: {
            store_id: storeId,
            type: 'SALE',
            created_at: { gte: from, lte: to },
          },
          select: {
            id: true,
            payment_method: true,
            total_amount: true,
            created_at: true,
            items: {
              select: {
                qty: true,
                product: { select: { name: true } },
              },
            },
          },
          orderBy: { created_at: 'asc' },
        })
      : Promise.resolve([]),
    canViewInventory
      ? prisma.inventory.findMany({
          where: {
            store_id: storeId,
            stock_min: { gt: 0 },
          },
          select: {
            stock_min: true,
            stock_physical: true,
          },
        })
      : Promise.resolve(0),
    canViewTransfers
      ? prisma.transfer.count({
          where: {
            status: 'PENDING',
            OR: [{ from_store_id: storeId }, { to_store_id: storeId }],
          },
        })
      : Promise.resolve(0),
    prisma.auditLog.findMany({
      where: {
        store_id: storeId,
        action: {
          in: [
            AuditAction.TRANSACTION_CREATED,
            AuditAction.TRANSACTION_REFUNDED,
            AuditAction.TRANSFER_CREATED,
            AuditAction.TRANSFER_CONFIRMED,
            AuditAction.TRANSFER_CANCELLED,
            AuditAction.RECEPTION_CONFIRMED,
            AuditAction.STOCK_MOVEMENT_CREATED,
            AuditAction.INVENTORY_REPORT_VALIDATED,
          ],
        },
        created_at: { gte: from, lte: to },
      },
      orderBy: { created_at: 'desc' },
      take: 3,
      select: {
        id: true,
        action: true,
        target_name: true,
        actor_name: true,
        created_at: true,
      },
    }),
  ]);

  const statCards: StatCard[] = [];
  if (canViewSales) {
    const periodSales = salesRows;
    const revenue = periodSales.reduce((sum, row) => sum + Number(row.total_amount), 0);
    statCards.push(
      { id: 'revenue_today', label: 'CA', value: revenue, suffix: 'F', tone: 'primary' },
      { id: 'tickets_today', label: 'Ventes', value: periodSales.length, tone: 'success' },
    );
  }
  if (canViewInventory) {
    const lowStockCount = Array.isArray(lowStockRows)
      ? lowStockRows.filter((row) => row.stock_physical <= row.stock_min).length
      : 0;
    statCards.push({ id: 'low_stock', label: 'Stocks bas', value: lowStockCount, tone: 'warning' });
  }
  if (canViewTransfers) {
    statCards.push({ id: 'pending_transfers', label: 'Transferts en attente', value: pendingTransfers, tone: 'neutral' });
  }

  let donut: DashboardOverview['donut'] = null;
  let bar: DashboardOverview['bar'] = null;
  let line: DashboardOverview['line'] = null;

  if (canViewSales) {
    const paymentColors: Record<PaymentMethod, string> = {
      CASH: '#FFC107',
      CARD: '#0D6EFD',
      MOBILE_MONEY: '#198754',
    };

    const salesByPayment = salesRows
      .reduce<Record<PaymentMethod, number>>((acc, row) => {
        acc[row.payment_method] += Number(row.total_amount);
        return acc;
      }, { CASH: 0, CARD: 0, MOBILE_MONEY: 0 });

    const segments = (Object.entries(salesByPayment) as Array<[PaymentMethod, number]>)
      .filter(([, value]) => value > 0)
      .map(([paymentMethod, value]) => ({
        id: paymentMethod,
        label: paymentMethod === 'CASH' ? 'Espèces' : paymentMethod === 'CARD' ? 'Carte' : 'Mobile Money',
        value,
        color: paymentColors[paymentMethod],
      }));

    donut = {
      title: 'Répartition des encaissements',
      total: segments.reduce((sum, segment) => sum + segment.value, 0),
      segments,
    };

    const quantitiesByProduct = new Map<string, number>();
    for (const sale of salesRows) {
      for (const item of sale.items) {
        const current = quantitiesByProduct.get(item.product.name) ?? 0;
        quantitiesByProduct.set(item.product.name, current + item.qty);
      }
    }

    bar = {
      title: 'Produits les plus vendus',
      points: [...quantitiesByProduct.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label, value]) => ({ label, value })),
    };

    const dayCount = getPeriodDays(from, to);
    const granularity = getTrendGranularity(dayCount);
    const totalsByPeriod = new Map<string, number>();
    const labelsByPeriod = new Map<string, string>();

    if (granularity === 'day') {
      for (let offset = 0; offset < dayCount; offset += 1) {
        const day = startOfDay(new Date(from.getTime() + offset * 24 * 60 * 60 * 1000));
        const key = getPeriodKey(day, 'day', from);
        totalsByPeriod.set(key, 0);
        labelsByPeriod.set(key, formatPeriodLabel(key, 'day', from));
      }
    } else if (granularity === 'week') {
      const weekCount = Math.ceil(dayCount / 7);
      for (let i = 0; i < weekCount; i += 1) {
        const key = `week-${i}`;
        totalsByPeriod.set(key, 0);
        labelsByPeriod.set(key, formatPeriodLabel(key, 'week', from));
      }
    } else {
      const startMonth = new Date(from.getFullYear(), from.getMonth(), 1);
      const endMonth = new Date(to.getFullYear(), to.getMonth(), 1);
      const cursor = new Date(startMonth);
      while (cursor <= endMonth) {
        const key = getPeriodKey(cursor, 'month', from);
        totalsByPeriod.set(key, 0);
        labelsByPeriod.set(key, formatPeriodLabel(key, 'month', from));
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    for (const sale of salesRows) {
      const key = getPeriodKey(sale.created_at, granularity, from);
      totalsByPeriod.set(key, (totalsByPeriod.get(key) ?? 0) + Number(sale.total_amount));
    }

    line = {
      title: 'Tendance',
      points: [...totalsByPeriod.entries()].map(([key, value]) => ({
        label: labelsByPeriod.get(key) ?? key,
        value,
      })),
    };
  }

  return {
    visibility: {
      sales_widgets: canViewSales,
      low_stock_card: canViewInventory,
      pending_transfers_card: canViewTransfers,
      recent_actions: true,
    },
    stat_cards: statCards,
    donut,
    bar,
    line,
    recent_actions: recentAuditRows.map((row) => ({
      id: row.id,
      label: buildRecentActionLabel(row.action, row.target_name),
      meta: row.actor_name,
      created_at: row.created_at.toISOString(),
    })),
  };
}
