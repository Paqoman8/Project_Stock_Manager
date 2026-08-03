// src/services/productFormat.service.ts
//
// Service de gestion des formats de produit (ProductFormat).
//
// Responsabilités :
//   - Logique métier : unicité du label, protection contre la suppression
//     d'un format utilisé par des PackagingFormats existants
//   - Cycle de vie : création, mise à jour, suppression physique

import { Prisma } from '@prisma/client';
import * as productFormatRepo from '../repositories/productFormat.repository';
import type {
  ProductFormatRow,
  CreateProductFormatData,
  UpdateProductFormatData,
} from '../repositories/productFormat.repository';

/** true si l'erreur est une violation de contrainte/index unique Postgres (code P2002). */
function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

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
export async function getProductFormats(orgId: string): Promise<ProductFormatRow[]> {
  return productFormatRepo.findAll(orgId);
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
  orgId: string,
  data: CreateProductFormatData,
): Promise<ProductFormatRow> {
  const existing = await productFormatRepo.findByLabel(data.label, orgId);
  if (existing) {
    throw new Error('LABEL_ALREADY_EXISTS');
  }

  try {
    return await productFormatRepo.create(data, orgId);
  } catch (err) {
    // Filet de sécurité contre une création concurrente du même label entre le
    // check ci-dessus et l'insertion (protégé en base par l'index unique insensible à la casse).
    if (isUniqueViolation(err)) {
      throw new Error('LABEL_ALREADY_EXISTS');
    }
    throw err;
  }
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
  orgId: string,
  id: string,
  data: UpdateProductFormatData,
): Promise<ProductFormatRow> {
  // Vérification d'existence
  const existing = await productFormatRepo.findById(id, orgId);
  if (!existing) {
    throw new Error('FORMAT_NOT_FOUND');
  }

  // Vérification unicité du label (seulement si le label change)
  if (data.label.trim().toLowerCase() !== existing.label.trim().toLowerCase()) {
    const labelOwner = await productFormatRepo.findByLabel(data.label, orgId, id);
    if (labelOwner) {
      throw new Error('LABEL_ALREADY_EXISTS');
    }
  }

  try {
    return await productFormatRepo.update(id, data, orgId);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new Error('LABEL_ALREADY_EXISTS');
    }
    throw err;
  }
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
export async function deleteProductFormat(orgId: string, id: string): Promise<void> {
  // Vérification d'existence
  const existing = await productFormatRepo.findById(id, orgId);
  if (!existing) {
    throw new Error('FORMAT_NOT_FOUND');
  }

  // Vérification d'usage : aucun PackagingFormat produit ne doit utiliser ce label
  const isUsed = await productFormatRepo.isLabelUsedByPackagingFormat(existing.label);
  if (isUsed) {
    throw new Error('FORMAT_IN_USE');
  }

  await productFormatRepo.deleteById(id, orgId);
}
