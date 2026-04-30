// src/services/supplier.service.ts
//
// Service de gestion des fournisseurs (Supplier).
//
// Responsabilités :
//   - Logique métier : unicité email, vérification d'existence
//   - Cycle de vie : création, mise à jour, activation/désactivation (soft delete)
//   - Journalisation de chaque action métier via audit.service

import { AuditAction } from '@prisma/client';
import { logAction } from './audit.service';
import * as supplierRepo from '../repositories/supplier.repository';
import type {
  SupplierRow,
  SupplierFilters,
  CreateSupplierData,
  UpdateSupplierData,
} from '../repositories/supplier.repository';

// Ré-export du type pour les controllers
export type { SupplierRow };

// ---------------------------------------------------------------------------
// Fonctions du service
// ---------------------------------------------------------------------------

/**
 * Retourne la liste des fournisseurs avec filtres optionnels.
 * Délègue directement au repository.
 *
 * @param filters - { isActive?, search? }
 * @returns Tableau de SupplierRow
 */
export async function getSuppliers(filters: SupplierFilters = {}): Promise<SupplierRow[]> {
  return supplierRepo.findAll(filters);
}

/**
 * Retourne un fournisseur par son UUID.
 *
 * @param id - UUID du fournisseur
 * @returns Le fournisseur trouvé
 * @throws Error('SUPPLIER_NOT_FOUND') si l'UUID ne correspond à aucun enregistrement
 */
export async function getSupplierById(id: string): Promise<SupplierRow> {
  const supplier = await supplierRepo.findById(id);
  if (!supplier) {
    throw new Error('SUPPLIER_NOT_FOUND');
  }
  return supplier;
}

/**
 * Crée un nouveau fournisseur et journalise l'action SUPPLIER_CREATED.
 *
 * Règle métier : l'email doit être unique parmi tous les fournisseurs.
 * L'audit est non-bloquant : un échec d'écriture du log ne fait pas échouer la création.
 *
 * @param data       - Données du fournisseur à créer
 * @param actorId    - UUID de l'utilisateur qui effectue l'action
 * @param actorName  - Nom de l'acteur (dénormalisé dans le log)
 * @param ipAddress  - Adresse IP de l'acteur (optionnelle)
 * @returns Le fournisseur créé
 * @throws Error('EMAIL_ALREADY_EXISTS') si l'email est déjà utilisé
 */
export async function createSupplier(
  data: CreateSupplierData,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<SupplierRow> {
  // Vérification unicité email
  if (data.email) {
    const existing = await supplierRepo.findByEmail(data.email);
    if (existing) {
      throw new Error('EMAIL_ALREADY_EXISTS');
    }
  }

  const supplier = await supplierRepo.create(data);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.SUPPLIER_CREATED,
      targetType: 'SUPPLIER',
      targetId:   supplier.id,
      targetName: supplier.name,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log SUPPLIER_CREATED :', err);
  }

  return supplier;
}

/**
 * Met à jour les champs fournis d'un fournisseur existant.
 * Journalise les champs modifiés dans les métadonnées de l'audit (SUPPLIER_UPDATED).
 *
 * Règle métier : si l'email est modifié, il doit rester unique parmi les autres fournisseurs.
 *
 * @param id         - UUID du fournisseur à mettre à jour
 * @param data       - Champs à modifier
 * @param actorId    - UUID de l'utilisateur qui effectue l'action
 * @param actorName  - Nom de l'acteur (dénormalisé)
 * @param ipAddress  - Adresse IP de l'acteur (optionnelle)
 * @returns Le fournisseur mis à jour
 * @throws Error('SUPPLIER_NOT_FOUND')    si l'UUID ne correspond à aucun enregistrement
 * @throws Error('EMAIL_ALREADY_EXISTS')  si le nouvel email est déjà utilisé par un autre fournisseur
 */
export async function updateSupplier(
  id: string,
  data: UpdateSupplierData,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<SupplierRow> {
  // Vérification d'existence
  const existing = await supplierRepo.findById(id);
  if (!existing) {
    throw new Error('SUPPLIER_NOT_FOUND');
  }

  // Vérification unicité email (uniquement si l'email change)
  if (data.email && data.email !== existing.email) {
    const emailOwner = await supplierRepo.findByEmail(data.email);
    if (emailOwner) {
      throw new Error('EMAIL_ALREADY_EXISTS');
    }
  }

  const supplier = await supplierRepo.update(id, data);

  // Audit — non-bloquant, champs modifiés dans les métadonnées
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.SUPPLIER_UPDATED,
      targetType: 'SUPPLIER',
      targetId:   supplier.id,
      targetName: supplier.name,
      storeId,
      storeName,
      ipAddress,
      metadata:   { updated_fields: Object.keys(data) },
    });
  } catch (err) {
    console.error('[audit] Échec du log SUPPLIER_UPDATED :', err);
  }

  return supplier;
}

/**
 * Désactive un fournisseur (soft delete — is_active = false).
 * Journalise l'action SUPPLIER_DEACTIVATED.
 *
 * @param id         - UUID du fournisseur à désactiver
 * @param actorId    - UUID de l'utilisateur qui effectue l'action
 * @param actorName  - Nom de l'acteur (dénormalisé)
 * @param ipAddress  - Adresse IP de l'acteur (optionnelle)
 * @returns Le fournisseur mis à jour
 * @throws Error('SUPPLIER_NOT_FOUND') si l'UUID ne correspond à aucun enregistrement
 */
export async function deactivateSupplier(
  id: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<SupplierRow> {
  // Vérification d'existence
  const existing = await supplierRepo.findById(id);
  if (!existing) {
    throw new Error('SUPPLIER_NOT_FOUND');
  }

  const supplier = await supplierRepo.setActive(id, false);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.SUPPLIER_DEACTIVATED,
      targetType: 'SUPPLIER',
      targetId:   supplier.id,
      targetName: supplier.name,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log SUPPLIER_DEACTIVATED :', err);
  }

  return supplier;
}

/**
 * Réactive un fournisseur désactivé (is_active = true).
 * Journalise l'action SUPPLIER_REACTIVATED.
 *
 * @param id         - UUID du fournisseur à réactiver
 * @param actorId    - UUID de l'utilisateur qui effectue l'action
 * @param actorName  - Nom de l'acteur (dénormalisé)
 * @param ipAddress  - Adresse IP de l'acteur (optionnelle)
 * @returns Le fournisseur mis à jour
 * @throws Error('SUPPLIER_NOT_FOUND') si l'UUID ne correspond à aucun enregistrement
 */
export async function reactivateSupplier(
  id: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<SupplierRow> {
  // Vérification d'existence
  const existing = await supplierRepo.findById(id);
  if (!existing) {
    throw new Error('SUPPLIER_NOT_FOUND');
  }

  const supplier = await supplierRepo.setActive(id, true);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.SUPPLIER_REACTIVATED,
      targetType: 'SUPPLIER',
      targetId:   supplier.id,
      targetName: supplier.name,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log SUPPLIER_REACTIVATED :', err);
  }

  return supplier;
}
