// src/services/inventory_report.service.ts
//
// Logique métier pour les rapports d'inventaire.
//
// Cycle de vie :
//   DRAFT → SUBMITTED → VALIDATED (ajustements possibles par SA)
//                    ↘ REJECTED  → SUBMITTED (après correction)

import { AuditAction, ReportStatus } from '@prisma/client';
import { logAction } from './audit.service';
import { prisma } from '../config/database';
import * as reportRepo  from '../repositories/inventory_report.repository';
import * as movementRepo from '../repositories/stock_movement.repository';
import type {
  InventoryReportRow,
  ReportFilters,
  UpdateLinesData,
} from '../repositories/inventory_report.repository';

export type { InventoryReportRow };

// (Référence générée via séquence atomique dans le repository)

// ---------------------------------------------------------------------------
// Fonctions
// ---------------------------------------------------------------------------

export async function getReports(filters: ReportFilters = {}): Promise<InventoryReportRow[]> {
  return reportRepo.findAll(filters);
}

export async function getReportById(id: string): Promise<InventoryReportRow> {
  const report = await reportRepo.findById(id);
  if (!report) throw new Error('REPORT_NOT_FOUND');
  return report;
}

/**
 * Crée un rapport d'inventaire pour un établissement.
 * Capture automatiquement le stock théorique actuel de chaque produit en inventaire.
 * Si des InventoryBreakdown existent (stock par format), les snapshots par format
 * sont également inclus dans les lignes du rapport.
 *
 * @throws Error('STORE_NOT_FOUND')         si l'établissement est introuvable
 * @throws Error('REPORT_ALREADY_EXISTS')   si un rapport existe déjà pour ce magasin/semaine
 * @throws Error('NO_INVENTORY_ENTRIES')    si l'établissement n'a aucune entrée d'inventaire
 */
export async function createReport(
  data: {
    store_id:      string;
    period_start:  Date;
    period_end:    Date;
    notes?:        string;
    created_by_id: string;
  },
  actorId: string,
  actorName: string,
  storeName?: string,
  ipAddress?: string,
): Promise<InventoryReportRow> {
  // Vérification existence de l'établissement
  const store = await prisma.store.findUnique({
    where:  { id: data.store_id },
    select: { id: true, name: true },
  });
  if (!store) throw new Error('STORE_NOT_FOUND');

  // Référence unique via séquence atomique (pas de risque de doublon)
  const reference = await reportRepo.generateReference();

  // Snapshot du stock actuel
  const inventoryEntries = await prisma.inventory.findMany({
    where:  { store_id: data.store_id },
    select: { product_id: true, stock_physical: true },
  });
  if (inventoryEntries.length === 0) throw new Error('NO_INVENTORY_ENTRIES');

  // Snapshot des ventilations par format (optionnel — peut être vide pour certains produits)
  const breakdownEntries = await prisma.inventoryBreakdown.findMany({
    where:  { store_id: data.store_id },
    select: { product_id: true, packaging_format_id: true, quantity: true },
  });

  // Regrouper les breakdowns par product_id
  const breakdownsByProduct = new Map<string, { packaging_format_id: string; quantity: number }[]>();
  for (const b of breakdownEntries) {
    if (!breakdownsByProduct.has(b.product_id)) {
      breakdownsByProduct.set(b.product_id, []);
    }
    breakdownsByProduct.get(b.product_id)!.push({
      packaging_format_id: b.packaging_format_id,
      quantity:            b.quantity,
    });
  }

  const report = await reportRepo.create({
    reference,
    store_id:      data.store_id,
    period_start:  data.period_start,
    period_end:    data.period_end,
    notes:         data.notes,
    created_by_id: data.created_by_id,
    lines: inventoryEntries.map((e) => {
      const productBreakdowns = breakdownsByProduct.get(e.product_id) ?? [];
      return {
        product_id:        e.product_id,
        stock_theoretical: e.stock_physical,
        ...(productBreakdowns.length > 0 ? {
          breakdowns: productBreakdowns.map((b) => ({
            packaging_format_id:  b.packaging_format_id,
            packages_theoretical: b.quantity,
          })),
        } : {}),
      };
    }),
  });

  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.INVENTORY_REPORT_CREATED,
      targetType: 'INVENTORY_REPORT',
      targetId:   report.id,
      targetName: report.reference,
      storeId:    data.store_id,
      storeName,
      ipAddress,
      metadata:   { store_id: data.store_id, period_start: data.period_start, period_end: data.period_end },
    });
  } catch (err) {
    console.error('[audit] Échec du log INVENTORY_REPORT_CREATED :', err);
  }

  return report;
}

/**
 * Met à jour les quantités comptées des lignes d'un rapport (DRAFT uniquement).
 *
 * Si une ligne comporte des breakdowns, le stock_counted est recalculé à partir
 * des packages_counted × units_per_package de chaque format — le stock_counted
 * fourni dans le payload est ignoré pour ces lignes.
 *
 * @throws Error('REPORT_NOT_FOUND')
 * @throws Error('REPORT_NOT_EDITABLE') si statut != DRAFT
 */
export async function updateLines(
  reportId: string,
  data: UpdateLinesData,
): Promise<InventoryReportRow> {
  const report = await reportRepo.findById(reportId);
  if (!report) throw new Error('REPORT_NOT_FOUND');
  if (report.status !== 'DRAFT') throw new Error('REPORT_NOT_EDITABLE');

  // Pour les lignes avec breakdowns : recalculer stock_counted depuis les formats
  const processedLines = await Promise.all(
    data.lines.map(async (line) => {
      if (line.breakdowns && line.breakdowns.length > 0) {
        // Récupérer units_per_package pour chaque format concerné
        const formats = await prisma.packagingFormat.findMany({
          where:  { id: { in: line.breakdowns.map((b) => b.packaging_format_id) } },
          select: { id: true, units_per_package: true },
        });
        const formatMap = new Map(formats.map((f) => [f.id, f.units_per_package]));

        const computedStockCounted = line.breakdowns.reduce((sum, b) => {
          return sum + b.packages_counted * (formatMap.get(b.packaging_format_id) ?? 1);
        }, 0);

        return { ...line, stock_counted: computedStockCounted };
      }
      return line;
    }),
  );

  return reportRepo.updateLines(reportId, { lines: processedLines });
}

/**
 * Soumet le rapport pour validation.
 *
 * @throws Error('REPORT_NOT_FOUND')
 * @throws Error('REPORT_NOT_SUBMITTABLE') si statut != DRAFT et != REJECTED
 */
export async function submitReport(
  reportId: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<InventoryReportRow> {
  const report = await reportRepo.findById(reportId);
  if (!report) throw new Error('REPORT_NOT_FOUND');
  // REJECTED est un état terminal — il faut créer un nouveau rapport
  if (report.status !== 'DRAFT') throw new Error('REPORT_NOT_SUBMITTABLE');

  const updated = await reportRepo.updateStatus(reportId, 'SUBMITTED', {
    submitted_at: new Date(),
  });

  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.INVENTORY_REPORT_SUBMITTED,
      targetType: 'INVENTORY_REPORT',
      targetId:   report.id,
      targetName: report.reference,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log INVENTORY_REPORT_SUBMITTED :', err);
  }

  return updated;
}

/**
 * Valide le rapport (SA ou Admin pour son magasin).
 *
 * @throws Error('REPORT_NOT_FOUND')
 * @throws Error('REPORT_NOT_VALIDATABLE') si statut != SUBMITTED
 */
export async function validateReport(
  reportId: string,
  validatedById: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<InventoryReportRow> {
  const report = await reportRepo.findById(reportId);
  if (!report) throw new Error('REPORT_NOT_FOUND');
  if (report.status !== 'SUBMITTED') throw new Error('REPORT_NOT_VALIDATABLE');

  const updated = await reportRepo.updateStatus(reportId, 'VALIDATED', {
    validated_at:    new Date(),
    validated_by_id: validatedById,
  });

  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.INVENTORY_REPORT_VALIDATED,
      targetType: 'INVENTORY_REPORT',
      targetId:   report.id,
      targetName: report.reference,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log INVENTORY_REPORT_VALIDATED :', err);
  }

  return updated;
}

/**
 * Rejette le rapport avec un motif.
 *
 * @throws Error('REPORT_NOT_FOUND')
 * @throws Error('REPORT_NOT_REJECTABLE') si statut != SUBMITTED
 * @throws Error('REASON_REQUIRED')       si motif vide
 */
export async function rejectReport(
  reportId: string,
  reason: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<InventoryReportRow> {
  if (!reason || reason.trim() === '') throw new Error('REASON_REQUIRED');

  const report = await reportRepo.findById(reportId);
  if (!report) throw new Error('REPORT_NOT_FOUND');
  if (report.status !== 'SUBMITTED') throw new Error('REPORT_NOT_REJECTABLE');

  const updated = await reportRepo.updateStatus(reportId, 'REJECTED', {
    rejection_reason: reason,
  });

  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.INVENTORY_REPORT_REJECTED,
      targetType: 'INVENTORY_REPORT',
      targetId:   report.id,
      targetName: report.reference,
      storeId,
      storeName,
      ipAddress,
      metadata:   { reason },
    });
  } catch (err) {
    console.error('[audit] Échec du log INVENTORY_REPORT_REJECTED :', err);
  }

  return updated;
}

/**
 * Applique les ajustements de stock issus d'un rapport validé (SA uniquement).
 *
 * - Pour les lignes avec breakdowns par format :
 *     → Crée un mouvement ADJUSTMENT_IN/OUT par format avec packages_variance != 0,
 *       en précisant packaging_format_id pour mettre à jour InventoryBreakdown.
 * - Pour les lignes sans breakdowns (variance != 0) :
 *     → Comportement historique : un seul mouvement sans format.
 *
 * @throws Error('REPORT_NOT_FOUND')
 * @throws Error('REPORT_NOT_VALIDATED') si statut != VALIDATED
 */
export async function applyAdjustments(
  reportId: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<{ adjustments_count: number }> {
  const report = await reportRepo.findById(reportId);
  if (!report) throw new Error('REPORT_NOT_FOUND');
  if (report.status !== 'VALIDATED') throw new Error('REPORT_NOT_VALIDATED');
  // Opération irréversible — ne peut être faite qu'une seule fois
  if (report.adjustments_applied_at !== null) throw new Error('ADJUSTMENTS_ALREADY_APPLIED');

  let count = 0;

  for (const line of report.lines) {
    const hasBreakdowns = line.breakdowns && line.breakdowns.length > 0;

    if (hasBreakdowns) {
      // Créer un mouvement par format avec packages_variance != 0
      for (const bd of line.breakdowns) {
        if (bd.packages_variance === 0) continue;

        const type           = bd.packages_variance > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
        const absPackages    = Math.abs(bd.packages_variance);
        const qty            = absPackages * bd.packaging_format.units_per_package;

        await movementRepo.create({
          store_id:            report.store_id,
          product_id:          line.product_id,
          type,
          qty,
          reason:              `Ajustement rapport ${report.reference} — ${bd.packaging_format.label}`,
          performed_by_id:     actorId,
          packaging_format_id: bd.packaging_format_id,
          packages_count:      absPackages,
        });

        count++;
      }
    } else if (line.variance !== 0) {
      // Comportement historique : mouvement sans format
      const type = line.variance > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
      const qty  = Math.abs(line.variance);

      await movementRepo.create({
        store_id:        report.store_id,
        product_id:      line.product_id,
        type,
        qty,
        reason:          `Ajustement rapport ${report.reference}`,
        performed_by_id: actorId,
      });

      count++;
    }
  }

  // Verrouille l'opération — plus possible de rejouer
  await reportRepo.setAdjustmentsApplied(reportId);

  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.INVENTORY_REPORT_ADJUSTED,
      targetType: 'INVENTORY_REPORT',
      targetId:   report.id,
      targetName: report.reference,
      storeId,
      storeName,
      ipAddress,
      metadata:   { adjustments_count: count },
    });
  } catch (err) {
    console.error('[audit] Échec du log INVENTORY_REPORT_ADJUSTED :', err);
  }

  return { adjustments_count: count };
}
