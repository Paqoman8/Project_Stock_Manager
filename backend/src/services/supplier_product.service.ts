// src/services/supplier_product.service.ts
//
// Service de gestion du catalogue fournisseur (SupplierProduct).
//
// Responsabilités :
//   - Validation de l'existence du fournisseur et du produit référencés
//   - Unicité du couple (supplier_id, product_id)
//   - Garantie d'unicité du fournisseur préféré par produit (is_preferred)
//   - Soft delete via setActive(false)
//   - Journalisation non-bloquante via audit.service

import { AuditAction } from '@prisma/client';
import { prisma } from '../config/database';
import { logAction } from './audit.service';
import * as supplierRepo          from '../repositories/supplier.repository';
import * as supplierProductRepo   from '../repositories/supplier_product.repository';
import * as packagingFormatRepo   from '../repositories/packaging_format.repository';
import type {
  SupplierProductRow,
  SupplierProductFilters,
  CreateSupplierProductData,
  UpdateSupplierProductData,
} from '../repositories/supplier_product.repository';

// Ré-export du type pour les controllers
export type { SupplierProductRow };

// ---------------------------------------------------------------------------
// Fonctions du service
// ---------------------------------------------------------------------------

/**
 * Retourne la liste des enregistrements du catalogue fournisseur.
 * Délègue directement au repository.
 *
 * @param filters - { supplier_id?, product_id?, isActive? }
 * @returns Tableau de SupplierProductRow
 */
export async function getSupplierProducts(
  filters: SupplierProductFilters = {},
): Promise<SupplierProductRow[]> {
  return supplierProductRepo.findAll(filters);
}

/**
 * Retourne un enregistrement du catalogue fournisseur par son UUID.
 *
 * @param id - UUID de l'enregistrement
 * @returns L'enregistrement trouvé
 * @throws Error('SUPPLIER_PRODUCT_NOT_FOUND') si l'UUID ne correspond à aucun enregistrement
 */
export async function getSupplierProductById(id: string): Promise<SupplierProductRow> {
  const row = await supplierProductRepo.findById(id);
  if (!row) {
    throw new Error('SUPPLIER_PRODUCT_NOT_FOUND');
  }
  return row;
}

/**
 * Crée un nouvel enregistrement dans le catalogue fournisseur.
 * Journalise l'action SUPPLIER_PRODUCT_CREATED (non-bloquant).
 *
 * Règles métier :
 *   - Le fournisseur référencé doit exister (is_active non vérifié — on autorise les liaisons
 *     avec des fournisseurs temporairement inactifs pour ne pas bloquer la donnée historique).
 *   - Le produit référencé doit exister.
 *   - Le couple (supplier_id, product_id) doit être unique.
 *   - Si is_preferred = true, tous les autres enregistrements du même produit sont d'abord
 *     dé-préférés pour garantir l'unicité du fournisseur préféré.
 *
 * @param data       - Données de l'enregistrement à créer
 * @param actorId    - UUID de l'utilisateur qui effectue l'action
 * @param actorName  - Nom de l'acteur (dénormalisé dans le log)
 * @param storeId    - UUID du magasin de l'acteur (optionnel)
 * @param storeName  - Nom du magasin (optionnel, dénormalisé)
 * @param ipAddress  - Adresse IP de l'acteur (optionnelle)
 * @returns L'enregistrement créé
 * @throws Error('SUPPLIER_NOT_FOUND')             si le fournisseur est introuvable
 * @throws Error('PRODUCT_NOT_FOUND')              si le produit est introuvable
 * @throws Error('SUPPLIER_PRODUCT_ALREADY_EXISTS') si le couple existe déjà
 */
export async function createSupplierProduct(
  data:       CreateSupplierProductData,
  actorId:    string,
  actorName:  string,
  storeId?:   string,
  storeName?: string,
  ipAddress?: string,
): Promise<SupplierProductRow> {
  // Vérification existence du fournisseur
  const supplier = await supplierRepo.findById(data.supplier_id);
  if (!supplier) {
    throw new Error('SUPPLIER_NOT_FOUND');
  }

  // Vérification existence du produit
  const product = await prisma.product.findUnique({ where: { id: data.product_id } });
  if (!product) {
    throw new Error('PRODUCT_NOT_FOUND');
  }

  // Vérification que le format de conditionnement existe et appartient au bon produit
  const packagingFormat = await packagingFormatRepo.findById(data.packaging_format_id);
  if (!packagingFormat || packagingFormat.product_id !== data.product_id) {
    throw new Error('PACKAGING_FORMAT_NOT_FOUND');
  }

  // Vérification d'unicité : le triplet (fournisseur + produit + format) ne doit pas déjà exister
  const duplicate = await supplierProductRepo.findBySupplierProductAndFormat(
    data.supplier_id,
    data.product_id,
    data.packaging_format_id,
  );
  if (duplicate) {
    throw new Error('SUPPLIER_PRODUCT_ALREADY_EXISTS');
  }

  // Si is_preferred = true : retirer le flag des autres entrées du même produit
  const row = await prisma.$transaction(async (tx) => {
    if (data.is_preferred === true) {
      await supplierProductRepo.clearPreferred(data.product_id, tx);
    }
    return supplierProductRepo.create(data, tx);
  });

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.SUPPLIER_PRODUCT_CREATED,
      targetType: 'SUPPLIER_PRODUCT',
      targetId:   row.id,
      targetName: `${row.supplier.name} → ${row.product.name}`,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log SUPPLIER_PRODUCT_CREATED :', err);
  }

  return row;
}

/**
 * Met à jour les champs fournis d'un enregistrement du catalogue fournisseur.
 * Journalise l'action SUPPLIER_PRODUCT_UPDATED avec les champs modifiés (non-bloquant).
 *
 * Règle métier :
 *   - Si is_preferred = true, tous les autres enregistrements du même produit sont
 *     d'abord dé-préférés avant la mise à jour.
 *
 * @param id         - UUID de l'enregistrement à mettre à jour
 * @param data       - Champs à modifier
 * @param actorId    - UUID de l'utilisateur qui effectue l'action
 * @param actorName  - Nom de l'acteur (dénormalisé)
 * @param storeId    - UUID du magasin de l'acteur (optionnel)
 * @param storeName  - Nom du magasin (optionnel, dénormalisé)
 * @param ipAddress  - Adresse IP de l'acteur (optionnelle)
 * @returns L'enregistrement mis à jour
 * @throws Error('SUPPLIER_PRODUCT_NOT_FOUND') si l'UUID ne correspond à aucun enregistrement
 */
export async function updateSupplierProduct(
  id:         string,
  data:       UpdateSupplierProductData,
  actorId:    string,
  actorName:  string,
  storeId?:   string,
  storeName?: string,
  ipAddress?: string,
): Promise<SupplierProductRow> {
  // Vérification d'existence
  const existing = await supplierProductRepo.findById(id);
  if (!existing) {
    throw new Error('SUPPLIER_PRODUCT_NOT_FOUND');
  }

  // Vérification que le nouveau format de conditionnement appartient au bon produit
  if (data.packaging_format_id) {
    const packagingFormat = await packagingFormatRepo.findById(data.packaging_format_id);
    if (!packagingFormat || packagingFormat.product_id !== existing.product_id) {
      throw new Error('PACKAGING_FORMAT_NOT_FOUND');
    }
  }

  // Si is_preferred = true : retirer le flag des autres entrées du même produit
  const row = await prisma.$transaction(async (tx) => {
    if (data.is_preferred === true) {
      await supplierProductRepo.clearPreferred(existing.product_id, tx);
    }
    return supplierProductRepo.update(id, data, tx);
  });

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.SUPPLIER_PRODUCT_UPDATED,
      targetType: 'SUPPLIER_PRODUCT',
      targetId:   row.id,
      targetName: `${row.supplier.name} → ${row.product.name}`,
      storeId,
      storeName,
      ipAddress,
      metadata:   { updated_fields: Object.keys(data) },
    });
  } catch (err) {
    console.error('[audit] Échec du log SUPPLIER_PRODUCT_UPDATED :', err);
  }

  return row;
}

/**
 * Désactive un enregistrement du catalogue fournisseur (soft delete — is_active = false).
 * Journalise l'action SUPPLIER_PRODUCT_DELETED (non-bloquant).
 *
 * @param id         - UUID de l'enregistrement à désactiver
 * @param actorId    - UUID de l'utilisateur qui effectue l'action
 * @param actorName  - Nom de l'acteur (dénormalisé)
 * @param storeId    - UUID du magasin de l'acteur (optionnel)
 * @param storeName  - Nom du magasin (optionnel, dénormalisé)
 * @param ipAddress  - Adresse IP de l'acteur (optionnelle)
 * @returns L'enregistrement désactivé
 * @throws Error('SUPPLIER_PRODUCT_NOT_FOUND') si l'UUID ne correspond à aucun enregistrement
 */
export async function deleteSupplierProduct(
  id:         string,
  actorId:    string,
  actorName:  string,
  storeId?:   string,
  storeName?: string,
  ipAddress?: string,
): Promise<SupplierProductRow> {
  // Vérification d'existence
  const existing = await supplierProductRepo.findById(id);
  if (!existing) {
    throw new Error('SUPPLIER_PRODUCT_NOT_FOUND');
  }

  const row = await supplierProductRepo.setActive(id, false);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.SUPPLIER_PRODUCT_DELETED,
      targetType: 'SUPPLIER_PRODUCT',
      targetId:   row.id,
      targetName: `${row.supplier.name} → ${row.product.name}`,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log SUPPLIER_PRODUCT_DELETED :', err);
  }

  return row;
}
