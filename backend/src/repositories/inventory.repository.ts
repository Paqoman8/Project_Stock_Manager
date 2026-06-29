// src/repositories/inventory.repository.ts
//
// Couche d'accès aux données pour l'inventaire (Inventory).
//
// Responsabilités :
//   - Lecture des niveaux de stock par établissement et/ou produit
//   - Mise à jour des seuils (stock_min, stock_reorder)

import { prisma } from '../config/database';

// ---------------------------------------------------------------------------
// Types exposés
// ---------------------------------------------------------------------------

export interface InventoryRow {
  store_id:       string;
  product_id:     string;
  stock_physical: number;
  stock_reserved: number;
  stock_min:      number;
  stock_reorder:  number;
  store:   { id: string; name: string; color: string };
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    price: string;
    is_active: boolean;
  };
}

export interface InventoryFilters {
  store_id?:   string;
  product_id?: string;
  /** Si true, ne retourne que les lignes où stock_physical <= stock_min (hors stock_min=0) */
  low_stock?:  boolean;
}

export interface UpdateThresholdsData {
  stock_min?:     number;
  stock_reorder?: number;
}

// ---------------------------------------------------------------------------
// Sélecteur partagé
// ---------------------------------------------------------------------------

const INVENTORY_INCLUDE = {
  store:   { select: { id: true, name: true, color: true } },
  product: { select: { id: true, name: true, sku: true, unit: true, price: true, is_active: true } },
} as const;

// ---------------------------------------------------------------------------
// Fonctions
// ---------------------------------------------------------------------------

/**
 * Retourne toutes les entrées d'inventaire avec filtres optionnels.
 * Triées par nom d'établissement puis par nom de produit.
 */
export async function findAll(filters: InventoryFilters = {}): Promise<InventoryRow[]> {
  const rows = await prisma.inventory.findMany({
    where: {
      ...(filters.store_id   ? { store_id:   filters.store_id }   : {}),
      ...(filters.product_id ? { product_id: filters.product_id } : {}),
    },
    include: INVENTORY_INCLUDE,
    orderBy: [
      { store:   { name: 'asc' } },
      { product: { name: 'asc' } },
    ],
  });

  if (filters.low_stock) {
    return rows.filter(
      (r) => r.stock_min > 0 && r.stock_physical <= r.stock_min,
    ) as unknown as InventoryRow[];
  }

  return rows as unknown as InventoryRow[];
}

/**
 * Retourne une entrée d'inventaire par sa clé composite (store_id, product_id).
 * Retourne null si elle n'existe pas.
 */
export async function findOne(
  storeId: string,
  productId: string,
): Promise<InventoryRow | null> {
  return prisma.inventory.findUnique({
    where:   { store_id_product_id: { store_id: storeId, product_id: productId } },
    include: INVENTORY_INCLUDE,
  }) as unknown as InventoryRow | null;
}

/**
 * Met à jour les seuils d'une entrée d'inventaire.
 * Upsert : crée la ligne si elle n'existe pas encore.
 */
export async function updateThresholds(
  storeId: string,
  productId: string,
  data: UpdateThresholdsData,
): Promise<InventoryRow> {
  const updateData: Record<string, number> = {};
  if (data.stock_min     !== undefined) updateData.stock_min     = data.stock_min;
  if (data.stock_reorder !== undefined) updateData.stock_reorder = data.stock_reorder;

  return prisma.inventory.upsert({
    where:  { store_id_product_id: { store_id: storeId, product_id: productId } },
    update: updateData,
    create: {
      store_id:   storeId,
      product_id: productId,
      stock_min:     data.stock_min     ?? 0,
      stock_reorder: data.stock_reorder ?? 0,
    },
    include: INVENTORY_INCLUDE,
  }) as unknown as InventoryRow;
}
