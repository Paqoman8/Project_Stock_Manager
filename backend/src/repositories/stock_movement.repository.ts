// src/repositories/stock_movement.repository.ts
//
// Couche d'accès aux données pour les mouvements de stock (StockMovement).
//
// Responsabilités :
//   - Lecture des mouvements par établissement et/ou produit
//   - Création d'un mouvement + mise à jour atomique de stock_physical

import { MovementType } from '@prisma/client';
import { prisma } from '../config/database';

// ---------------------------------------------------------------------------
// Types exposés
// ---------------------------------------------------------------------------

export interface StockMovementRow {
  id:              string;
  store_id:        string;
  product_id:      string;
  type:            MovementType;
  qty:             number;
  reason:          string | null;
  performed_by_id: string;
  created_at:      Date;
  store:           { id: string; name: string; color: string };
  product:         { id: string; name: string; sku: string; unit: string };
  performed_by:    { id: string; username: string };
}

export interface StockMovementFilters {
  store_id?:   string;
  product_id?: string;
  type?:       MovementType;
}

export interface CreateMovementData {
  store_id:        string;
  product_id:      string;
  type:            MovementType;
  qty:             number;
  reason?:         string;
  performed_by_id: string;
}

// ---------------------------------------------------------------------------
// Sélecteur partagé
// ---------------------------------------------------------------------------

const MOVEMENT_INCLUDE = {
  store:        { select: { id: true, name: true, color: true } },
  product:      { select: { id: true, name: true, sku: true, unit: true } },
  performed_by: { select: { id: true, username: true } },
} as const;

// ---------------------------------------------------------------------------
// Fonctions
// ---------------------------------------------------------------------------

/**
 * Retourne les mouvements de stock avec filtres optionnels.
 * Triés du plus récent au plus ancien.
 */
export async function findAll(
  filters: StockMovementFilters = {},
): Promise<StockMovementRow[]> {
  return prisma.stockMovement.findMany({
    where: {
      ...(filters.store_id   ? { store_id:   filters.store_id }   : {}),
      ...(filters.product_id ? { product_id: filters.product_id } : {}),
      ...(filters.type       ? { type:       filters.type }        : {}),
    },
    include: MOVEMENT_INCLUDE,
    orderBy: { created_at: 'desc' },
  }) as unknown as StockMovementRow[];
}

/**
 * Crée un mouvement de stock et met à jour stock_physical en transaction atomique.
 *
 * - INITIAL / ADJUSTMENT_IN : stock_physical += qty (upsert)
 * - ADJUSTMENT_OUT           : stock_physical -= qty (upsert)
 * - RECEPTION                : stock_physical += qty (upsert)
 */
export async function create(data: CreateMovementData): Promise<StockMovementRow> {
  const delta =
    data.type === 'ADJUSTMENT_OUT'
      ? -data.qty
      : data.qty;

  const [movement] = await prisma.$transaction([
    // 1. Créer le mouvement
    prisma.stockMovement.create({
      data: {
        store_id:        data.store_id,
        product_id:      data.product_id,
        type:            data.type,
        qty:             data.qty,
        reason:          data.reason ?? null,
        performed_by_id: data.performed_by_id,
      },
      include: MOVEMENT_INCLUDE,
    }),

    // 2. Upsert inventory — crée la ligne si elle n'existe pas encore
    prisma.inventory.upsert({
      where: {
        store_id_product_id: {
          store_id:   data.store_id,
          product_id: data.product_id,
        },
      },
      update: { stock_physical: { increment: delta } },
      create: {
        store_id:       data.store_id,
        product_id:     data.product_id,
        stock_physical: Math.max(0, delta), // pas de négatif à l'initialisation
      },
    }),
  ]);

  return movement as unknown as StockMovementRow;
}
