// src/repositories/inventory_report.repository.ts
//
// Couche d'accès aux données pour les rapports d'inventaire.

import { ReportStatus } from '@prisma/client';
import { prisma } from '../config/database';

// ---------------------------------------------------------------------------
// Types exposés
// ---------------------------------------------------------------------------

export interface ReportLineBreakdownRow {
  id:                   string;
  line_id:              string;
  packaging_format_id:  string;
  packages_theoretical: number;
  packages_counted:     number;
  packages_variance:    number;
  packaging_format:     { id: string; label: string; units_per_package: number };
}

export interface ReportLineRow {
  id:                string;
  report_id:         string;
  product_id:        string;
  stock_theoretical: number;
  stock_counted:     number;
  variance:          number;
  note:              string | null;
  product:           { id: string; name: string; sku: string; unit: string };
  breakdowns:        ReportLineBreakdownRow[];
}

export interface InventoryReportRow {
  id:                     string;
  reference:              string;
  store_id:               string;
  status:                 ReportStatus;
  period_start:           Date;
  period_end:             Date;
  notes:                  string | null;
  rejection_reason:       string | null;
  created_by_id:          string;
  submitted_at:           Date | null;
  validated_at:           Date | null;
  validated_by_id:        string | null;
  adjustments_applied_at: Date | null;
  created_at:             Date;
  updated_at:             Date;
  store:                  { id: string; name: string; color: string };
  created_by:             { id: string; username: string };
  validated_by:           { id: string; username: string } | null;
  lines:                  ReportLineRow[];
}

export interface ReportFilters {
  store_id?: string;
  status?:   ReportStatus;
}

export interface CreateReportData {
  reference:     string;
  store_id:      string;
  period_start:  Date;
  period_end:    Date;
  notes?:        string;
  created_by_id: string;
  lines: {
    product_id:        string;
    stock_theoretical: number;
    breakdowns?: {
      packaging_format_id:  string;
      packages_theoretical: number;
    }[];
  }[];
}

export interface UpdateLinesData {
  lines: {
    product_id:    string;
    stock_counted: number;
    note?:         string;
    breakdowns?: {
      packaging_format_id: string;
      packages_counted:    number;
    }[];
  }[];
}

// ---------------------------------------------------------------------------
// Sélecteur partagé
// ---------------------------------------------------------------------------

const REPORT_INCLUDE = {
  store:        { select: { id: true, name: true, color: true } },
  created_by:   { select: { id: true, username: true } },
  validated_by: { select: { id: true, username: true } },
  lines: {
    include: {
      product: { select: { id: true, name: true, sku: true, unit: true } },
      breakdowns: {
        include: {
          packaging_format: { select: { id: true, label: true, units_per_package: true } },
        },
        orderBy: { packaging_format: { label: 'asc' as const } },
      },
    },
    orderBy: { product: { name: 'asc' as const } },
  },
} as const;

// ---------------------------------------------------------------------------
// Fonctions
// ---------------------------------------------------------------------------

export async function findAll(
  orgId: string,
  filters: ReportFilters = {},
): Promise<InventoryReportRow[]> {
  return prisma.inventoryReport.findMany({
    where: {
      store: { organization_id: orgId },
      ...(filters.store_id ? { store_id: filters.store_id } : {}),
      ...(filters.status   ? { status:   filters.status }   : {}),
    },
    include: REPORT_INCLUDE,
    orderBy: { created_at: 'desc' },
  }) as unknown as InventoryReportRow[];
}

export async function findById(id: string, orgId: string): Promise<InventoryReportRow | null> {
  return prisma.inventoryReport.findUnique({
    where: { id, store: { organization_id: orgId } },
    include: REPORT_INCLUDE,
  }) as unknown as InventoryReportRow | null;
}

export async function create(data: CreateReportData): Promise<InventoryReportRow> {
  return prisma.inventoryReport.create({
    data: {
      reference:     data.reference,
      store_id:      data.store_id,
      period_start:  data.period_start,
      period_end:    data.period_end,
      notes:         data.notes ?? null,
      created_by_id: data.created_by_id,
      lines: {
        create: data.lines.map((l) => ({
          product_id:        l.product_id,
          stock_theoretical: l.stock_theoretical,
          stock_counted:     0,
          variance:          -l.stock_theoretical, // sera mis à jour quand stock_counted saisi
          ...(l.breakdowns && l.breakdowns.length > 0 ? {
            breakdowns: {
              create: l.breakdowns.map((b) => ({
                packaging_format_id:  b.packaging_format_id,
                packages_theoretical: b.packages_theoretical,
                packages_counted:     0,
                packages_variance:    -b.packages_theoretical,
              })),
            },
          } : {}),
        })),
      },
    },
    include: REPORT_INCLUDE,
  }) as unknown as InventoryReportRow;
}

/**
 * Met à jour les quantités comptées de toutes les lignes du rapport.
 * Si une ligne a des breakdowns, met aussi à jour chaque breakdown.
 * Recalcule les variances à la volée.
 */
export async function updateLines(
  orgId: string,
  reportId: string,
  data: UpdateLinesData,
): Promise<InventoryReportRow> {
  // Mise à jour de chaque ligne + ses breakdowns en transaction
  await prisma.$transaction(async (tx) => {
    for (const l of data.lines) {
      // Mettre à jour la ligne principale
      await tx.inventoryReportLine.updateMany({
        where: { report_id: reportId, product_id: l.product_id },
        data:  {
          stock_counted: l.stock_counted,
          note:          l.note ?? null,
        },
      });

      // Mettre à jour les breakdowns si fournis
      if (l.breakdowns && l.breakdowns.length > 0) {
        const line = await tx.inventoryReportLine.findFirst({
          where: { report_id: reportId, product_id: l.product_id },
        });
        if (line) {
          for (const bd of l.breakdowns) {
            await tx.inventoryReportLineBreakdown.updateMany({
              where: { line_id: line.id, packaging_format_id: bd.packaging_format_id },
              data:  { packages_counted: bd.packages_counted },
            });
          }
          // Recalculer les packages_variance
          const breakdowns = await tx.inventoryReportLineBreakdown.findMany({
            where: { line_id: line.id },
          });
          for (const bd of breakdowns) {
            await tx.inventoryReportLineBreakdown.update({
              where: { id: bd.id },
              data:  { packages_variance: bd.packages_counted - bd.packages_theoretical },
            });
          }
        }
      }
    }

    // Recalcul des variances sur les lignes après mise à jour
    const lines = await tx.inventoryReportLine.findMany({
      where: { report_id: reportId },
    });
    for (const line of lines) {
      await tx.inventoryReportLine.update({
        where: { id: line.id },
        data:  { variance: line.stock_counted - line.stock_theoretical },
      });
    }
  });

  return findById(reportId, orgId) as Promise<InventoryReportRow>;
}

export async function updateStatus(
  orgId: string,
  id: string,
  status: ReportStatus,
  opts?: {
    submitted_at?: Date;
    validated_at?: Date;
    validated_by_id?: string;
    rejection_reason?: string;
  },
): Promise<InventoryReportRow> {
  return prisma.inventoryReport.update({
    where: { id, store: { organization_id: orgId } },
    data: {
      status,
      ...(opts?.submitted_at ? { submitted_at: opts.submitted_at } : {}),
      ...(opts?.validated_at ? { validated_at: opts.validated_at } : {}),
      ...(opts?.validated_by_id ? { validated_by_id: opts.validated_by_id } : {}),
      ...(opts?.rejection_reason !== undefined ? { rejection_reason: opts.rejection_reason } : {}),
    },
    include: REPORT_INCLUDE,
  }) as unknown as InventoryReportRow;
}

/**
 * Marque le rapport comme ayant ses ajustements appliqués (opération irréversible).
 */
export async function setAdjustmentsApplied(orgId: string, id: string): Promise<InventoryReportRow> {
  return prisma.inventoryReport.update({
    where: { id, store: { organization_id: orgId } },
    data: { adjustments_applied_at: new Date() },
    include: REPORT_INCLUDE,
  }) as unknown as InventoryReportRow;
}

/**
 * Génère une référence INV-YYYY-XXXX via séquence atomique PostgreSQL.
 */
export async function generateReference(orgId: string, year: number): Promise<string> {
  const result = await prisma.$queryRaw<[{ last_seq: bigint }]>`
    INSERT INTO inventory_report_sequences (organization_id, year, last_seq)
    VALUES (${orgId}, ${year}, 1)
    ON CONFLICT (organization_id, year) DO UPDATE
    SET last_seq = inventory_report_sequences.last_seq + 1
    RETURNING last_seq
  `;
  const seq = Number(result[0].last_seq);
  return `INV-${year}-${String(seq).padStart(4, '0')}`;
}
