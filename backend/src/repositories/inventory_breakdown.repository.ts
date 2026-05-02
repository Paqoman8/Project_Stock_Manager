// src/repositories/inventory_breakdown.repository.ts
//
// Ventilation du stock par format de conditionnement.
// Mis à jour atomiquement dans la même transaction que StockMovement.

import { prisma } from '../config/database';

// ---------------------------------------------------------------------------
// Types exposés
// ---------------------------------------------------------------------------

export interface InventoryBreakdownRow {
  id:                  string;
  store_id:            string;
  product_id:          string;
  packaging_format_id: string;
  quantity:            number;
  packaging_format:    { id: string; label: string; units_per_package: number; is_base_unit: boolean };
}

// ---------------------------------------------------------------------------
// Fonctions
// ---------------------------------------------------------------------------

/**
 * Retourne la ventilation complète pour une entrée d'inventaire (magasin × produit).
 * Triée par units_per_package croissant (unité → pack → carton → palette).
 */
export async function findByInventory(
  storeId:   string,
  productId: string,
): Promise<InventoryBreakdownRow[]> {
  return prisma.inventoryBreakdown.findMany({
    where:   { store_id: storeId, product_id: productId },
    include: {
      packaging_format: {
        select: { id: true, label: true, units_per_package: true, is_base_unit: true },
      },
    },
    orderBy: { packaging_format: { units_per_package: 'asc' } },
  }) as unknown as InventoryBreakdownRow[];
}

/**
 * Opération d'upsert atomique — à appeler DEPUIS une $transaction Prisma existante.
 * Retourne l'opération Prisma (pas encore exécutée) pour être incluse dans le tableau
 * de transactions de stock_movement.repository.ts.
 */
export function upsertOp(
  storeId:   string,
  productId: string,
  formatId:  string,
  delta:     number, // positif = entrée, négatif = sortie
) {
  return prisma.inventoryBreakdown.upsert({
    where: {
      store_id_product_id_packaging_format_id: {
        store_id:            storeId,
        product_id:          productId,
        packaging_format_id: formatId,
      },
    },
    update: { quantity: { increment: delta } },
    create: {
      store_id:            storeId,
      product_id:          productId,
      packaging_format_id: formatId,
      quantity:            Math.max(0, delta),
    },
  });
}
