// src/repositories/stock_movement.repository.ts
//
// Couche d'accès aux données pour les mouvements de stock (StockMovement).
//
// Responsabilités :
//   - Lecture des mouvements par établissement et/ou produit
//   - Création d'un mouvement + mise à jour atomique de stock_physical
//   - Si packaging_format_id fourni : mise à jour atomique de InventoryBreakdown

import { MovementType, Prisma } from '@prisma/client';
import { prisma } from '../config/database';

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
  total_units:           number; // équivalence en unités de base — calculée par le service, tracée sur le mouvement
  reason?:               string;
  performed_by_id:       string;
  /** Nombre d'unités restantes (conversion non-divisible) à créditer sur le format de base */
  remainder_units?:      number;
  /** ID du format de base qui reçoit le reste */
  remainder_format_id?:  string;
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
 *
 * @throws Error('INSUFFICIENT_FORMAT_STOCK') si ADJUSTMENT_OUT et ventilation format insuffisante
 *         (vérifié à l'intérieur de la transaction — Serializable — pour éviter tout TOCTOU)
 */
export async function create(data: CreateMovementData): Promise<StockMovementRow> {
  const stockDelta     = data.type === 'ADJUSTMENT_OUT' ? -data.qty : data.qty;
  const breakdownDelta = data.type === 'ADJUSTMENT_OUT'
    ? -(data.packages_count ?? 0)
    :  (data.packages_count ?? 0);

  const movement = await prisma.$transaction(async (tx) => {
    // 0. ADJUSTMENT_OUT avec format : vérifier que la ventilation est suffisante
    if (data.type === 'ADJUSTMENT_OUT' && data.packaging_format_id && data.packages_count) {
      const breakdown = await tx.inventoryBreakdown.findUnique({
        where: {
          store_id_product_id_packaging_format_id: {
            store_id:            data.store_id,
            product_id:          data.product_id,
            packaging_format_id: data.packaging_format_id,
          },
        },
        select: { quantity: true },
      });
      if (!breakdown || breakdown.quantity < data.packages_count) {
        throw new Error('INSUFFICIENT_FORMAT_STOCK');
      }
    }

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
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return movement as unknown as StockMovementRow;
}

/**
 * Crée une conversion inter-formats et met à jour les breakdowns atomiquement.
 *
 * - Débite inventory_breakdowns[from_format].quantity de from_packages_count
 * - Crédite inventory_breakdowns[to_format].quantity de to_packages_count
 * - to_packages_count est déjà l'équivalence exacte calculée par le service —
 *   stock_physical (compteur global en unités de base) n'a donc jamais besoin d'être ajusté ici
 * - Un seul StockMovement FORMAT_CONVERSION est créé (traçabilité)
 *
 * @throws Error('INSUFFICIENT_FORMAT_STOCK') si la ventilation source est insuffisante
 */
export async function createConversion(data: CreateConversionData): Promise<StockMovementRow> {
  const movement = await prisma.$transaction(async (tx) => {
    // Vérifier stock du format source
    let fromBreakdown = await tx.inventoryBreakdown.findUnique({
      where: {
        store_id_product_id_packaging_format_id: {
          store_id:            data.store_id,
          product_id:          data.product_id,
          packaging_format_id: data.from_packaging_format_id,
        },
      },
      select: { quantity: true },
    });

    // Si aucune entrée de ventilation n'existe pour le format source (ex. stock
    // ajouté sans packaging_format_id via INITIAL/ADJUSTMENT_IN), on regarde si
    // c'est l'unité de base et on synthétise l'entrée depuis le stock total.
    if (!fromBreakdown) {
      const fromFmt = await tx.packagingFormat.findUnique({
        where: { id: data.from_packaging_format_id },
        select: { is_base_unit: true },
      });
      if (!fromFmt?.is_base_unit) {
        throw new Error('INSUFFICIENT_FORMAT_STOCK');
      }
      const inv = await tx.inventory.findUnique({
        where: {
          store_id_product_id: {
            store_id:   data.store_id,
            product_id: data.product_id,
          },
        },
        select: { stock_physical: true },
      });
      if (!inv || inv.stock_physical < data.from_packages_count) {
        throw new Error('INSUFFICIENT_FORMAT_STOCK');
      }
      fromBreakdown = await tx.inventoryBreakdown.create({
        data: {
          store_id:            data.store_id,
          product_id:          data.product_id,
          packaging_format_id: data.from_packaging_format_id,
          quantity:            inv.stock_physical,
        },
        select: { quantity: true },
      });
    }
    if (fromBreakdown.quantity < data.from_packages_count) {
      throw new Error('INSUFFICIENT_FORMAT_STOCK');
    }

    // Débit format source (upsert au cas où l'entrée vient d'être créée ci-dessus)
    await tx.inventoryBreakdown.upsert({
      where: {
        store_id_product_id_packaging_format_id: {
          store_id:            data.store_id,
          product_id:          data.product_id,
          packaging_format_id: data.from_packaging_format_id,
        },
      },
      update: { quantity: { decrement: data.from_packages_count } },
      create: {
        store_id:            data.store_id,
        product_id:          data.product_id,
        packaging_format_id: data.from_packaging_format_id,
        quantity:            0,
      },
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

    // Crédit du reste au format de base (conversion non-divisible)
    if (data.remainder_units && data.remainder_format_id) {
      await tx.inventoryBreakdown.upsert({
        where: {
          store_id_product_id_packaging_format_id: {
            store_id:            data.store_id,
            product_id:          data.product_id,
            packaging_format_id: data.remainder_format_id,
          },
        },
        update: { quantity: { increment: data.remainder_units } },
        create: {
          store_id:            data.store_id,
          product_id:          data.product_id,
          packaging_format_id: data.remainder_format_id,
          quantity:            data.remainder_units,
        },
      });
    }

    // Créer le mouvement traçabilité
    return tx.stockMovement.create({
      data: {
        store_id:               data.store_id,
        product_id:             data.product_id,
        type:                   'FORMAT_CONVERSION',
        qty:                    data.total_units,
        reason:                 data.reason ?? null,
        performed_by_id:        data.performed_by_id,
        packaging_format_id:    data.from_packaging_format_id,
        packages_count:         data.from_packages_count,
        to_packaging_format_id: data.to_packaging_format_id,
        to_packages_count:      data.to_packages_count,
      },
      include: MOVEMENT_INCLUDE,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return movement as unknown as StockMovementRow;
}
