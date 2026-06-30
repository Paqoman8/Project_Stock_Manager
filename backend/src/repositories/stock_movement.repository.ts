// src/repositories/stock_movement.repository.ts
//
// Couche d'accès aux données pour les mouvements de stock (StockMovement).
//
// Responsabilités :
//   - Lecture des mouvements par établissement et/ou produit
//   - Création d'un mouvement + mise à jour atomique de stock_physical
//   - Si packaging_format_id fourni : mise à jour atomique de InventoryBreakdown

import { MovementType } from '@prisma/client';
import { prisma } from '../config/database';
import { upsertOp as breakdownUpsert } from './inventory_breakdown.repository';

// ---------------------------------------------------------------------------
// Types exposés
// ---------------------------------------------------------------------------

export interface StockMovementRow {
  id:                     string;
  store_id:               string;
  product_id:             string;
  type:                   MovementType;
  qty:                    number;
  reason:                 string | null;
  performed_by_id:        string;
  packaging_format_id:    string | null;
  packages_count:         number | null;
  to_packaging_format_id: string | null;
  to_packages_count:      number | null;
  created_at:             Date;
  store:                 { id: string; name: string; color: string };
  product:               { id: string; name: string; sku: string; unit: string };
  performed_by:          { id: string; username: string };
  packaging_format:      { id: string; label: string; units_per_package: number } | null;
  to_packaging_format:   { id: string; label: string; units_per_package: number } | null;
}

export interface CreateConversionData {
  store_id:              string;
  product_id:            string;
  from_packaging_format_id: string;
  from_packages_count:   number;
  to_packaging_format_id: string;
  to_packages_count:     number;
  reason?:               string;
  performed_by_id:       string;
}

export interface StockMovementFilters {
  store_id?:   string;
  product_id?: string;
  type?:       MovementType;
}

export interface CreateMovementData {
  store_id:             string;
  product_id:           string;
  type:                 MovementType;
  qty:                  number;              // Toujours en unités de base
  reason?:              string;
  performed_by_id:      string;
  packaging_format_id?: string;             // Optionnel
  packages_count?:      number;             // Obligatoire si packaging_format_id fourni
}

// ---------------------------------------------------------------------------
// Sélecteur partagé
// ---------------------------------------------------------------------------

const MOVEMENT_INCLUDE = {
  store:               { select: { id: true, name: true, color: true } },
  product:             { select: { id: true, name: true, sku: true, unit: true } },
  performed_by:        { select: { id: true, username: true } },
  packaging_format:    { select: { id: true, label: true, units_per_package: true } },
  to_packaging_format: { select: { id: true, label: true, units_per_package: true } },
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
 * Si packaging_format_id est fourni, met aussi à jour InventoryBreakdown.
 *
 * - INITIAL / ADJUSTMENT_IN / RECEPTION : stock_physical += qty
 * - ADJUSTMENT_OUT                       : stock_physical -= qty
 */
export async function create(data: CreateMovementData): Promise<StockMovementRow> {
  const stockDelta     = data.type === 'ADJUSTMENT_OUT' ? -data.qty : data.qty;
  const breakdownDelta = data.type === 'ADJUSTMENT_OUT'
    ? -(data.packages_count ?? 0)
    :  (data.packages_count ?? 0);

  const movement = await prisma.$transaction(async (tx) => {
    // 1. Créer le mouvement
    const mov = await tx.stockMovement.create({
      data: {
        store_id:             data.store_id,
        product_id:           data.product_id,
        type:                 data.type,
        qty:                  data.qty,
        reason:               data.reason ?? null,
        performed_by_id:      data.performed_by_id,
        packaging_format_id:  data.packaging_format_id ?? null,
        packages_count:       data.packages_count       ?? null,
      },
      include: MOVEMENT_INCLUDE,
    });

    // 2. Upsert inventory (stock_physical)
    await tx.inventory.upsert({
      where: {
        store_id_product_id: {
          store_id:   data.store_id,
          product_id: data.product_id,
        },
      },
      update: { stock_physical: { increment: stockDelta } },
      create: {
        store_id:       data.store_id,
        product_id:     data.product_id,
        stock_physical: Math.max(0, stockDelta),
      },
    });

    // 3. Upsert breakdown uniquement si format précisé
    if (data.packaging_format_id && data.packages_count !== undefined) {
      await tx.inventoryBreakdown.upsert({
        where: {
          store_id_product_id_packaging_format_id: {
            store_id:            data.store_id,
            product_id:          data.product_id,
            packaging_format_id: data.packaging_format_id,
          },
        },
        update: { quantity: { increment: breakdownDelta } },
        create: {
          store_id:            data.store_id,
          product_id:          data.product_id,
          packaging_format_id: data.packaging_format_id,
          quantity:            Math.max(0, breakdownDelta),
        },
      });
    }

    return mov;
  });

  return movement as unknown as StockMovementRow;
}

/**
 * Crée une conversion inter-formats et met à jour les breakdowns atomiquement.
 *
 * - Débite inventory_breakdowns[from_format].quantity de from_packages_count
 * - Crédite inventory_breakdowns[to_format].quantity de to_packages_count
 * - stock_physical est recalculé : delta = to_units - from_units (peut être 0 si même base)
 * - Un seul StockMovement FORMAT_CONVERSION est créé (traçabilité)
 *
 * @throws Error('INSUFFICIENT_FORMAT_STOCK') si la ventilation source est insuffisante
 */
export async function createConversion(data: CreateConversionData): Promise<StockMovementRow> {
  const movement = await prisma.$transaction(async (tx) => {
    // Résoudre les deux formats
    const [fromFmt, toFmt] = await Promise.all([
      tx.packagingFormat.findUnique({
        where: { id: data.from_packaging_format_id },
        select: { id: true, units_per_package: true },
      }),
      tx.packagingFormat.findUnique({
        where: { id: data.to_packaging_format_id },
        select: { id: true, units_per_package: true },
      }),
    ]);
    if (!fromFmt || !toFmt) throw new Error('FORMAT_NOT_FOUND');

    const fromUnits = data.from_packages_count * fromFmt.units_per_package;
    const toUnits   = data.to_packages_count   * toFmt.units_per_package;
    const stockDelta = toUnits - fromUnits; // 0 if same total units

    // Vérifier stock du format source
    const fromBreakdown = await tx.inventoryBreakdown.findUnique({
      where: {
        store_id_product_id_packaging_format_id: {
          store_id:            data.store_id,
          product_id:          data.product_id,
          packaging_format_id: data.from_packaging_format_id,
        },
      },
      select: { quantity: true },
    });
    if (!fromBreakdown || fromBreakdown.quantity < data.from_packages_count) {
      throw new Error('INSUFFICIENT_FORMAT_STOCK');
    }

    // Débit format source
    await tx.inventoryBreakdown.update({
      where: {
        store_id_product_id_packaging_format_id: {
          store_id:            data.store_id,
          product_id:          data.product_id,
          packaging_format_id: data.from_packaging_format_id,
        },
      },
      data: { quantity: { decrement: data.from_packages_count } },
    });

    // Crédit format destination
    await tx.inventoryBreakdown.upsert({
      where: {
        store_id_product_id_packaging_format_id: {
          store_id:            data.store_id,
          product_id:          data.product_id,
          packaging_format_id: data.to_packaging_format_id,
        },
      },
      update: { quantity: { increment: data.to_packages_count } },
      create: {
        store_id:            data.store_id,
        product_id:          data.product_id,
        packaging_format_id: data.to_packaging_format_id,
        quantity:            data.to_packages_count,
      },
    });

    // Ajuster stock_physical si les unités totales diffèrent
    if (stockDelta !== 0) {
      await tx.inventory.upsert({
        where: {
          store_id_product_id: {
            store_id:   data.store_id,
            product_id: data.product_id,
          },
        },
        update: { stock_physical: { increment: stockDelta } },
        create: {
          store_id:       data.store_id,
          product_id:     data.product_id,
          stock_physical: Math.max(0, stockDelta),
        },
      });
    }

    // Créer le mouvement traçabilité
    return tx.stockMovement.create({
      data: {
        store_id:               data.store_id,
        product_id:             data.product_id,
        type:                   'FORMAT_CONVERSION',
        qty:                    fromUnits,
        reason:                 data.reason ?? null,
        performed_by_id:        data.performed_by_id,
        packaging_format_id:    data.from_packaging_format_id,
        packages_count:         data.from_packages_count,
        to_packaging_format_id: data.to_packaging_format_id,
        to_packages_count:      data.to_packages_count,
      },
      include: MOVEMENT_INCLUDE,
    });
  });

  return movement as unknown as StockMovementRow;
}
