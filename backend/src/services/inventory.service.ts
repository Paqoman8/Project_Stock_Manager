// src/services/inventory.service.ts
//
// Service de gestion de l'inventaire.
//
// Responsabilités :
//   - Lecture des niveaux de stock avec filtres optionnels
//   - Mise à jour des seuils stock_min / stock_reorder après validation
//     (vérification d'existence de l'établissement et du produit)

import { prisma } from '../config/database';
import * as inventoryRepo from '../repositories/inventory.repository';
import type {
  InventoryRow,
  InventoryFilters,
  UpdateThresholdsData,
} from '../repositories/inventory.repository';

// Ré-export du type pour les controllers
export type { InventoryRow };

// ---------------------------------------------------------------------------
// Fonctions du service
// ---------------------------------------------------------------------------

/**
 * Retourne toutes les entrées d'inventaire avec filtres optionnels.
 *
 * @param filters - { store_id?, product_id?, low_stock? }
 * @returns Tableau de InventoryRow
 */
export async function getInventory(filters: InventoryFilters = {}): Promise<InventoryRow[]> {
  return inventoryRepo.findAll(filters);
}

/**
 * Retourne une entrée d'inventaire par sa clé composite (store_id, product_id).
 *
 * @param storeId   - UUID de l'établissement
 * @param productId - UUID du produit
 * @returns InventoryRow ou null
 */
export async function getInventoryEntry(
  storeId: string,
  productId: string,
): Promise<InventoryRow | null> {
  return inventoryRepo.findOne(storeId, productId);
}

/**
 * Met à jour les seuils d'alerte d'une entrée d'inventaire.
 * Valide que l'établissement et le produit existent avant de persister.
 *
 * @param storeId   - UUID de l'établissement
 * @param productId - UUID du produit
 * @param data      - { stock_min?, stock_reorder? }
 * @returns L'entrée d'inventaire mise à jour
 * @throws Error('STORE_NOT_FOUND')   si l'établissement est introuvable
 * @throws Error('PRODUCT_NOT_FOUND') si le produit est introuvable
 */
export async function updateThresholds(
  storeId: string,
  productId: string,
  data: UpdateThresholdsData,
): Promise<InventoryRow> {
  // Vérification de l'existence de l'établissement
  const store = await prisma.store.findUnique({
    where:  { id: storeId },
    select: { id: true },
  });
  if (!store) {
    throw new Error('STORE_NOT_FOUND');
  }

  // Vérification de l'existence du produit
  const product = await prisma.product.findUnique({
    where:  { id: productId },
    select: { id: true },
  });
  if (!product) {
    throw new Error('PRODUCT_NOT_FOUND');
  }

  return inventoryRepo.updateThresholds(storeId, productId, data);
}
