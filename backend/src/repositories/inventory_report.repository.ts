// src/repositories/inventory_report.repository.ts
//
// Couche d'accès aux données pour les rapports d'inventaire.

import { ReportStatus } from '@prisma/client';
import { prisma } from '../config/database';

// ---------------------------------------------------------------------------
// Types exposés
// ---------------------------------------------------------------------------

export interface ReportLineRow {
  id:                string;
  report_id:         string;
  product_id:        string;
  stock_theoretical: number;
  stock_counted:     number;
  variance:          number;
  note:              string | null;
  product:           { id: string; name: string; sku: string; unit: string };
}

export interface InventoryReportRow {
  id:               string;
  reference:        string;
  store_id:         string;
  status:           ReportStatus;
  period_start:     Date;
  period_end:       Date;
  notes:            string | null;
  rejection_reason: string | null;
  created_by_id:    string;
  submitted_at:     Date | null;
  validated_at:     Date | null;
  validated_by_id:  string | null;
  created_at:       Date;
  updated_at:       Date;
  store:            { id: string; name: string; color: string };
  created_by:       { id: string; username: string };
  validated_by:     { id: string; username: string } | null;
  lines:            ReportLineRow[];
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
  }[];
}

export interface UpdateLinesData {
  lines: {
    product_id:    string;
    stock_counted: number;
    note?:         string;
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
    },
    orderBy: { product: { name: 'asc' as const } },
  },
} as const;

// ---------------------------------------------------------------------------
// Fonctions
// ---------------------------------------------------------------------------

export async function findAll(filters: ReportFilters = {}): Promise<InventoryReportRow[]> {
  return prisma.inventoryReport.findMany({
    where: {
      ...(filters.store_id ? { store_id: filters.store_id } : {}),
      ...(filters.status   ? { status:   filters.status }   : {}),
    },
    include: REPORT_INCLUDE,
    orderBy: { created_at: 'desc' },
  }) as unknown as InventoryReportRow[];
}

export async function findById(id: string): Promise<InventoryReportRow | null> {
  return prisma.inventoryReport.findUnique({
    where:   { id },
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
        })),
      },
    },
    include: REPORT_INCLUDE,
  }) as unknown as InventoryReportRow;
}

/**
 * Met à jour les quantités comptées de toutes les lignes du rapport.
 * Recalcule la variance à la volée.
 */
export async function updateLines(
  reportId: string,
  data: UpdateLinesData,
): Promise<InventoryReportRow> {
  // Mise à jour de chaque ligne en transaction
  await prisma.$transaction(
    data.lines.map((l) =>
      prisma.inventoryReportLine.updateMany({
        where: { report_id: reportId, product_id: l.product_id },
        data:  {
          stock_counted: l.stock_counted,
          note:          l.note ?? null,
          // variance sera recalculé en récupérant stock_theoretical
        },
      }),
    ),
  );

  // Recalcul des variances via une requête séparée
  const lines = await prisma.inventoryReportLine.findMany({
    where: { report_id: reportId },
  });

  await prisma.$transaction(
    lines.map((l) =>
      prisma.inventoryReportLine.update({
        where: { id: l.id },
        data:  { variance: l.stock_counted - l.stock_theoretical },
      }),
    ),
  );

  return findById(reportId) as Promise<InventoryReportRow>;
}

export async function updateStatus(
  id: string,
  status: ReportStatus,
  opts?: {
    submitted_at?:     Date;
    validated_at?:     Date;
    validated_by_id?:  string;
    rejection_reason?: string;
  },
): Promise<InventoryReportRow> {
  return prisma.inventoryReport.update({
    where: { id },
    data:  {
      status,
      ...(opts?.submitted_at     ? { submitted_at:     opts.submitted_at }     : {}),
      ...(opts?.validated_at     ? { validated_at:     opts.validated_at }     : {}),
      ...(opts?.validated_by_id  ? { validated_by_id:  opts.validated_by_id }  : {}),
      ...(opts?.rejection_reason !== undefined ? { rejection_reason: opts.rejection_reason } : {}),
    },
    include: REPORT_INCLUDE,
  }) as unknown as InventoryReportRow;
}
