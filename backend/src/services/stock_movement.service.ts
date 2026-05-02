// src/services/stock_movement.service.ts
//
// Logique métier pour les mouvements de stock.
//
// Règles :
//   - INITIAL : impossible si une entrée d'inventaire avec stock > 0 existe déjà
//   - ADJUSTMENT_IN / ADJUSTMENT_OUT : motif obligatoire
//   - Si packaging_format_id fourni :
//       · Le format doit appartenir au produit
//       · packages_count obligatoire (> 0)
//       · qty est calculé server-side : packages_count × units_per_package
//   - Journalise chaque mouvement dans l'audit

import { AuditAction, MovementType } from '@prisma/client';
import { logAction } from './audit.service';
import { prisma } from '../config/database';
import * as movementRepo from '../repositories/stock_movement.repository';
import type {
  StockMovementRow,
  StockMovementFilters,
  CreateMovementData,
} from '../repositories/stock_movement.repository';

export type { StockMovementRow };

// ---------------------------------------------------------------------------
// Fonctions
// ---------------------------------------------------------------------------

export async function getMovements(
  filters: StockMovementFilters = {},
): Promise<StockMovementRow[]> {
  return movementRepo.findAll(filters);
}

/**
 * Crée un mouvement de stock manuel.
 *
 * @throws Error('INITIAL_STOCK_ALREADY_EXISTS') si tentative d'INITIAL sur stock existant > 0
 * @throws Error('REASON_REQUIRED')              si ADJUSTMENT sans motif
 * @throws Error('STORE_NOT_FOUND')              si l'établissement est introuvable
 * @throws Error('PRODUCT_NOT_FOUND')            si le produit est introuvable
 * @throws Error('FORMAT_NOT_FOUND')             si le format est introuvable ou n'appartient pas au produit
 * @throws Error('PACKAGES_COUNT_REQUIRED')      si format fourni mais packages_count manquant
 */
export async function createMovement(
  data: Omit<CreateMovementData, 'performed_by_id'> & { performed_by_id: string },
  actorId:   string,
  actorName: string,
  storeId?:  string,
  storeName?: string,
  ipAddress?: string,
): Promise<StockMovementRow> {
  // Vérification existence de l'établissement
  const store = await prisma.store.findUnique({
    where:  { id: data.store_id },
    select: { id: true, name: true },
  });
  if (!store) throw new Error('STORE_NOT_FOUND');

  // Vérification existence du produit
  const product = await prisma.product.findUnique({
    where:  { id: data.product_id },
    select: { id: true, name: true },
  });
  if (!product) throw new Error('PRODUCT_NOT_FOUND');

  // Résolution du format et calcul de qty si packaging_format_id fourni
  let finalQty = data.qty;
  let packagingLabel: string | undefined;

  if (data.packaging_format_id) {
    if (!data.packages_count || data.packages_count <= 0) {
      throw new Error('PACKAGES_COUNT_REQUIRED');
    }

    const format = await prisma.packagingFormat.findUnique({
      where:  { id: data.packaging_format_id },
      select: { id: true, label: true, units_per_package: true, product_id: true },
    });

    if (!format || format.product_id !== data.product_id) {
      throw new Error('FORMAT_NOT_FOUND');
    }

    // La quantité en unités de base est calculée ici — le client n'a pas à l'envoyer
    finalQty      = data.packages_count * format.units_per_package;
    packagingLabel = `${data.packages_count} × ${format.label}`;
  }

  // INITIAL : impossible si une entrée inventaire avec stock > 0 existe déjà
  if (data.type === 'INITIAL') {
    const existing = await prisma.inventory.findUnique({
      where: {
        store_id_product_id: {
          store_id:   data.store_id,
          product_id: data.product_id,
        },
      },
      select: { stock_physical: true },
    });
    if (existing && existing.stock_physical !== 0) {
      throw new Error('INITIAL_STOCK_ALREADY_EXISTS');
    }
  }

  // ADJUSTMENT : motif obligatoire
  if (
    (data.type === 'ADJUSTMENT_IN' || data.type === 'ADJUSTMENT_OUT') &&
    (!data.reason || data.reason.trim() === '')
  ) {
    throw new Error('REASON_REQUIRED');
  }

  const movement = await movementRepo.create({
    ...data,
    qty: finalQty,
  });

  // Audit — non-bloquant
  try {
    const typeLabels: Record<MovementType, string> = {
      INITIAL:        'Saisie initiale',
      ADJUSTMENT_IN:  'Régularisation +',
      ADJUSTMENT_OUT: 'Régularisation −',
      RECEPTION:      'Réception',
    };
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.STOCK_MOVEMENT_CREATED,
      targetType: 'STOCK_MOVEMENT',
      targetId:   movement.id,
      targetName: `${product.name} — ${typeLabels[data.type]} (${packagingLabel ?? finalQty})`,
      storeId,
      storeName,
      ipAddress,
      metadata: {
        type:                data.type,
        qty:                 finalQty,
        reason:              data.reason ?? null,
        packaging_format_id: data.packaging_format_id ?? null,
        packages_count:      data.packages_count      ?? null,
      },
    });
  } catch (err) {
    console.error('[audit] Échec du log STOCK_MOVEMENT_CREATED :', err);
  }

  return movement;
}
