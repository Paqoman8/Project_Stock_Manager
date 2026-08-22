// src/services/product.service.ts
//
// Service de gestion des produits (Product).
//
// Responsabilités :
//   - Logique métier : unicité SKU, vérification d'existence de la catégorie
//   - Cycle de vie : création, mise à jour, activation/désactivation (soft delete)
//   - Journalisation de chaque action métier via audit.service

import { AuditAction } from '@prisma/client';
import { logAction } from './audit.service';
import * as productRepo from '../repositories/product.repository';
import * as categoryRepo from '../repositories/category.repository';
import type {
  ProductRow,
  ProductFilters,
  CreateProductData,
  UpdateProductData,
} from '../repositories/product.repository';

// Ré-export du type pour les controllers
export type { ProductRow };

// ---------------------------------------------------------------------------
// Fonctions du service
// ---------------------------------------------------------------------------

/**
 * Retourne la liste des produits avec filtres optionnels.
 * Délègue directement au repository.
 *
 * @param filters - { search?, categoryId?, isActive? }
 * @returns Tableau de ProductRow
 */
export async function getProducts(orgId: string, filters: ProductFilters = {}): Promise<ProductRow[]> {
  return productRepo.findAll(orgId, filters);
}

/**
 * Retourne un produit par son UUID.
 *
 * @param id - UUID du produit
 * @returns Le produit trouvé
 * @throws Error('PRODUCT_NOT_FOUND') si l'UUID ne correspond à aucun enregistrement
 */
export async function getProductById(orgId: string, id: string): Promise<ProductRow> {
  const product = await productRepo.findById(orgId, id);
  if (!product) {
    throw new Error('PRODUCT_NOT_FOUND');
  }
  return product;
}

/**
 * Crée un nouveau produit et journalise l'action PRODUCT_CREATED.
 *
 * Règles métier :
 *   - Le SKU doit être unique (insensible à la casse).
 *   - La catégorie référencée doit exister.
 * L'audit est non-bloquant : un échec d'écriture du log ne fait pas échouer
 * la création.
 *
 * @param data       - { sku, name, price, category_id, description? }
 * @param actorId    - UUID de l'utilisateur qui effectue l'action
 * @param actorName  - Nom de l'acteur (dénormalisé dans le log)
 * @param storeId    - UUID du magasin de contexte (optionnel)
 * @param storeName  - Nom du magasin (dénormalisé dans le log)
 * @param ipAddress  - Adresse IP de l'acteur (optionnelle)
 * @returns Le produit créé
 * @throws Error('SKU_ALREADY_EXISTS')  si le SKU est déjà utilisé
 * @throws Error('CATEGORY_NOT_FOUND')  si la catégorie référencée n'existe pas
 */
export async function createProduct(
  orgId: string,
  data: CreateProductData,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
  initialFormatLabel?: string,
): Promise<ProductRow> {
  // Vérification unicité SKU
  const existingSku = await productRepo.findBySku(orgId, data.sku);
  if (existingSku) {
    throw new Error('SKU_ALREADY_EXISTS');
  }

  // Vérification existence de la catégorie
  const category = await categoryRepo.findById(orgId, data.category_id);
  if (!category) {
    throw new Error('CATEGORY_NOT_FOUND');
  }

  const product = initialFormatLabel
    ? await productRepo.createWithBaseFormat(orgId, data, initialFormatLabel)
    : await productRepo.create(orgId, data);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.PRODUCT_CREATED,
      targetType: 'PRODUCT',
      targetId:   product.id,
      targetName: product.name,
      orgId,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log PRODUCT_CREATED :', err);
  }

  return product;
}

/**
 * Met à jour les champs fournis d'un produit existant.
 * Journalise les champs modifiés dans les métadonnées de l'audit (PRODUCT_UPDATED).
 *
 * Règle métier : si category_id est modifié, la nouvelle catégorie doit exister.
 *
 * @param id         - UUID du produit à mettre à jour
 * @param data       - Champs à modifier (sku exclu — immuable)
 * @param actorId    - UUID de l'utilisateur qui effectue l'action
 * @param actorName  - Nom de l'acteur (dénormalisé)
 * @param storeId    - UUID du magasin de contexte (optionnel)
 * @param storeName  - Nom du magasin (dénormalisé)
 * @param ipAddress  - Adresse IP de l'acteur (optionnelle)
 * @returns Le produit mis à jour
 * @throws Error('PRODUCT_NOT_FOUND')  si l'UUID ne correspond à aucun enregistrement
 * @throws Error('CATEGORY_NOT_FOUND') si la nouvelle catégorie n'existe pas
 */
export async function updateProduct(
  orgId: string,
  id: string,
  data: UpdateProductData,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<ProductRow> {
  // Vérification d'existence
  const existing = await productRepo.findById(orgId, id);
  if (!existing) {
    throw new Error('PRODUCT_NOT_FOUND');
  }

  // Vérification existence de la nouvelle catégorie si elle change
  if (data.category_id) {
    const category = await categoryRepo.findById(orgId, data.category_id);

    if (!category) {
      throw new Error('CATEGORY_NOT_FOUND');
    }
  }

  const product = await productRepo.update(orgId, id, data);

  // Audit — non-bloquant, champs modifiés dans les métadonnées
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.PRODUCT_UPDATED,
      targetType: 'PRODUCT',
      targetId:   product.id,
      targetName: product.name,
      orgId,
      storeId,
      storeName,
      ipAddress,
      metadata:   { updated_fields: Object.keys(data) },
    });
  } catch (err) {
    console.error('[audit] Échec du log PRODUCT_UPDATED :', err);
  }

  return product;
}

/**
 * Désactive un produit (soft delete — is_active = false).
 * Journalise l'action PRODUCT_DEACTIVATED.
 *
 * @param id         - UUID du produit à désactiver
 * @param actorId    - UUID de l'utilisateur qui effectue l'action
 * @param actorName  - Nom de l'acteur (dénormalisé)
 * @param storeId    - UUID du magasin de contexte (optionnel)
 * @param storeName  - Nom du magasin (dénormalisé)
 * @param ipAddress  - Adresse IP de l'acteur (optionnelle)
 * @returns Le produit mis à jour
 * @throws Error('PRODUCT_NOT_FOUND') si l'UUID ne correspond à aucun enregistrement
 */
export async function deactivateProduct(
  orgId: string,
  id: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<ProductRow> {
  // Vérification d'existence
  const existing = await productRepo.findById(orgId, id);
  if (!existing) {
    throw new Error('PRODUCT_NOT_FOUND');
  }

  const product = await productRepo.setActive(orgId, id, false);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.PRODUCT_DEACTIVATED,
      targetType: 'PRODUCT',
      targetId:   product.id,
      targetName: product.name,
      orgId,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log PRODUCT_DEACTIVATED :', err);
  }

  return product;
}

/**
 * Réactive un produit désactivé (is_active = true).
 * Journalise l'action PRODUCT_REACTIVATED.
 *
 * @param id         - UUID du produit à réactiver
 * @param actorId    - UUID de l'utilisateur qui effectue l'action
 * @param actorName  - Nom de l'acteur (dénormalisé)
 * @param storeId    - UUID du magasin de contexte (optionnel)
 * @param storeName  - Nom du magasin (dénormalisé)
 * @param ipAddress  - Adresse IP de l'acteur (optionnelle)
 * @returns Le produit mis à jour
 * @throws Error('PRODUCT_NOT_FOUND') si l'UUID ne correspond à aucun enregistrement
 */
export async function reactivateProduct(
  orgId: string,
  id: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<ProductRow> {
  // Vérification d'existence
  const existing = await productRepo.findById(orgId, id);
  if (!existing) {
    throw new Error('PRODUCT_NOT_FOUND');
  }

  const product = await productRepo.setActive(orgId, id, true);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.PRODUCT_REACTIVATED,
      targetType: 'PRODUCT',
      targetId:   product.id,
      targetName: product.name,
      orgId,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log PRODUCT_REACTIVATED :', err);
  }

  return product;
}
