// src/services/productFormat.service.ts
//
// Service de gestion des formats de produit (ProductFormat).
//
// Responsabilités :
//   - Logique métier : unicité du label, protection contre la suppression
//     d'un format utilisé par des PackagingFormats existants
//   - Cycle de vie : création, mise à jour, suppression physique

import * as productFormatRepo from '../repositories/productFormat.repository';
import type {
  ProductFormatRow,
  CreateProductFormatData,
  UpdateProductFormatData,
} from '../repositories/productFormat.repository';

// Ré-export du type pour les controllers
export type { ProductFormatRow };

// ---------------------------------------------------------------------------
// Fonctions du service
// ---------------------------------------------------------------------------

/**
 * Retourne la liste complète des formats de produit, triés par label ASC.
 * Délègue directement au repository.
 *
 * @returns Tableau de ProductFormatRow
 */
export async function getProductFormats(): Promise<ProductFormatRow[]> {
  return productFormatRepo.findAll();
}

/**
 * Crée un nouveau format de produit.
 *
 * Règle métier : le label doit être unique (insensible à la casse).
 *
 * @param data - { label }
 * @returns Le format créé
 * @throws Error('LABEL_ALREADY_EXISTS') si le label est déjà utilisé
 */
export async function createProductFormat(
  data: CreateProductFormatData,
): Promise<ProductFormatRow> {
  const existing = await productFormatRepo.findByLabel(data.label);
  if (existing) {
    throw new Error('LABEL_ALREADY_EXISTS');
  }

  return productFormatRepo.create(data);
}

/**
 * Met à jour le label d'un format existant.
 *
 * Règle métier : le nouveau label doit être unique parmi les autres formats.
 *
 * @param id   - UUID du format à mettre à jour
 * @param data - { label }
 * @returns Le format mis à jour
 * @throws Error('FORMAT_NOT_FOUND')    si l'UUID ne correspond à aucun enregistrement
 * @throws Error('LABEL_ALREADY_EXISTS') si le label est déjà utilisé par un autre format
 */
export async function updateProductFormat(
  id: string,
  data: UpdateProductFormatData,
): Promise<ProductFormatRow> {
  // Vérification d'existence
  const existing = await productFormatRepo.findById(id);
  if (!existing) {
    throw new Error('FORMAT_NOT_FOUND');
  }

  // Vérification unicité du label (seulement si le label change)
  if (data.label.toLowerCase() !== existing.label.toLowerCase()) {
    const labelOwner = await productFormatRepo.findByLabel(data.label, id);
    if (labelOwner) {
      throw new Error('LABEL_ALREADY_EXISTS');
    }
  }

  return productFormatRepo.update(id, data);
}

/**
 * Supprime physiquement un format de produit.
 *
 * Règle métier : la suppression est refusée si au moins un PackagingFormat
 * (format de conditionnement produit) utilise le même label — cela garantit
 * la cohérence des données produit existantes.
 *
 * @param id - UUID du format à supprimer
 * @throws Error('FORMAT_NOT_FOUND') si l'UUID ne correspond à aucun enregistrement
 * @throws Error('FORMAT_IN_USE')    si un PackagingFormat utilise ce label
 */
export async function deleteProductFormat(id: string): Promise<void> {
  // Vérification d'existence
  const existing = await productFormatRepo.findById(id);
  if (!existing) {
    throw new Error('FORMAT_NOT_FOUND');
  }

  // Vérification d'usage : aucun PackagingFormat produit ne doit utiliser ce label
  const isUsed = await productFormatRepo.isLabelUsedByPackagingFormat(existing.label);
  if (isUsed) {
    throw new Error('FORMAT_IN_USE');
  }

  await productFormatRepo.deleteById(id);
}
