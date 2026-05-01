// src/services/stock_movement.service.ts
//
// Logique métier pour les mouvements de stock.
//
// Règles :
//   - INITIAL : impossible si une entrée d'inventaire existe déjà
//   - ADJUSTMENT_IN / ADJUSTMENT_OUT : motif obligatoire
//   - ADJUSTMENT_OUT : ne peut pas dépasser le stock disponible (warning, non bloquant)
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
 * @throws Error('INITIAL_STOCK_ALREADY_EXISTS') si tentative d'INITIAL sur une entrée existante
 * @throws Error('REASON_REQUIRED')              si ADJUSTMENT sans motif
 * @throws Error('STORE_NOT_FOUND')              si l'établissement est introuvable
 * @throws Error('PRODUCT_NOT_FOUND')            si le produit est introuvable
 */
export async function createMovement(
  data: Omit<CreateMovementData, 'performed_by_id'> & { performed_by_id: string },
  actorId: string,
  actorName: string,
  storeId?: string,
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
    // On autorise INITIAL si l'entrée n'existe pas OU si stock_physical = 0
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

  const movement = await movementRepo.create(data);

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
      targetName: `${product.name} — ${typeLabels[data.type]} (${data.qty})`,
      storeId,
      storeName,
      ipAddress,
      metadata: {
        type:       data.type,
        qty:        data.qty,
        reason:     data.reason ?? null,
        store_id:   data.store_id,
        product_id: data.product_id,
      },
    });
  } catch (err) {
    console.error('[audit] Échec du log STOCK_MOVEMENT_CREATED :', err);
  }

  return movement;
}
