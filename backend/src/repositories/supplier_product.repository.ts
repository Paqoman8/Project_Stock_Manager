// src/repositories/supplier_product.repository.ts
//
// Couche d'accès aux données pour le catalogue fournisseur (SupplierProduct).
//
// Responsabilités :
//   - CRUD Prisma pur — aucune logique métier ici
//   - Sélecteur partagé SUPPLIER_PRODUCT_SELECT pour garantir une forme constante
//   - Include des relations supplier et product sur toutes les opérations de lecture

import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

// ---------------------------------------------------------------------------
// Types exposés — contrat entre repository et service
// ---------------------------------------------------------------------------

/**
 * Un enregistrement du catalogue fournisseur tel que retourné par toutes les
 * fonctions du repository. Inclut les relations supplier et product.
 */
export interface SupplierProductRow {
  id:                   string;
  supplier_id:          string;
  product_id:           string;
  supplier_ref:         string | null;
  purchase_price:       string;    // Decimal Prisma — sérialisé en string par JSON.stringify
  packaging_format_id:  string;
  min_order_qty:        number;
  is_preferred:         boolean;
  is_active:            boolean;
  created_at:           Date;
  updated_at:           Date;
  // Relations incluses dans chaque SELECT
  supplier:         { id: string; name: string };
  product:          { id: string; name: string; sku: string; unit: string };
  packaging_format: { id: string; label: string; units_per_package: number };
}

/**
 * Données requises pour créer un enregistrement du catalogue fournisseur.
 * purchase_price accepte number | string — Prisma le convertit en Decimal.
 */
export interface CreateSupplierProductData {
  supplier_id:          string;
  product_id:           string;
  supplier_ref?:        string;
  purchase_price:       number | string;
  packaging_format_id:  string;
  min_order_qty?:       number;
  is_preferred?:        boolean;
}

/**
 * Données pour la mise à jour — tous les champs optionnels (PATCH sémantique).
 * is_active exposé ici pour le soft delete via setActive.
 */
export interface UpdateSupplierProductData {
  supplier_ref?:        string;
  purchase_price?:      number | string;
  packaging_format_id?: string;
  min_order_qty?:       number;
  is_preferred?:        boolean;
  is_active?:           boolean;
}

/**
 * Filtres acceptés par findAll.
 */
export interface SupplierProductFilters {
  supplier_id?: string;
  product_id?:  string;
  isActive?:    boolean;
}

// ---------------------------------------------------------------------------
// Sélecteur Prisma partagé — garantit une forme constante sur tous les appels
// ---------------------------------------------------------------------------

const SUPPLIER_PRODUCT_SELECT = {
  id:                  true,
  supplier_id:         true,
  product_id:          true,
  supplier_ref:        true,
  purchase_price:      true,
  packaging_format_id: true,
  min_order_qty:       true,
  is_preferred:        true,
  is_active:           true,
  created_at:          true,
  updated_at:          true,
  supplier: {
    select: {
      id:   true,
      name: true,
    },
  },
  product: {
    select: {
      id:   true,
      name: true,
      sku:  true,
      unit: true,
    },
  },
  packaging_format: {
    select: {
      id:               true,
      label:            true,
      units_per_package: true,
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Fonctions du repository
// ---------------------------------------------------------------------------

/**
 * Retourne la liste des enregistrements du catalogue fournisseur avec filtres optionnels.
 *
 * Filtre supplier_id : restreint aux entrées d'un fournisseur donné.
 * Filtre product_id  : restreint aux entrées d'un produit donné.
 * Filtre isActive    : si non précisé, retourne tous les enregistrements.
 * Tri                : alphabétique sur le nom du fournisseur.
 *
 * @param filters - { supplier_id?, product_id?, isActive? }
 * @returns Tableau de SupplierProductRow, potentiellement vide
 */
export async function findAll(orgId: string, filters: SupplierProductFilters = {}): Promise<SupplierProductRow[]> {
  const { supplier_id, product_id, isActive } = filters;

  return prisma.supplierProduct.findMany({
    where: {
      supplier: { organization_id: orgId },
      ...(supplier_id !== undefined ? { supplier_id } : {}),
      ...(product_id  !== undefined ? { product_id  } : {}),
      ...(isActive    !== undefined ? { is_active: isActive } : {}),
    },
    select:  SUPPLIER_PRODUCT_SELECT,
    orderBy: { supplier: { name: 'asc' } },
  }) as unknown as SupplierProductRow[];
}

/**
 * Retourne un enregistrement du catalogue fournisseur par son UUID, ou null.
 *
 * @param id - UUID de l'enregistrement
 */
export async function findById(id: string, orgId: string): Promise<SupplierProductRow | null> {
  return prisma.supplierProduct.findUnique({
    where:  { id, supplier: { organization_id: orgId } },
    select: SUPPLIER_PRODUCT_SELECT,
  }) as unknown as Promise<SupplierProductRow | null>;
}

/**
 * Retourne l'enregistrement correspondant au triplet (supplier_id, product_id, packaging_format_id), ou null.
 * Utilisé pour la vérification d'unicité avant création.
 *
 * @param supplierId        - UUID du fournisseur
 * @param productId         - UUID du produit
 * @param packagingFormatId - UUID du format de conditionnement
 */
export async function findBySupplierProductAndFormat(
  orgId:              string,
  supplierId:         string,
  productId:          string,
  packagingFormatId:  string,
): Promise<SupplierProductRow | null> {
  return prisma.supplierProduct.findFirst({
    where: {
      supplier:             { organization_id: orgId },
      supplier_id:          supplierId,
      product_id:           productId,
      packaging_format_id:  packagingFormatId,
    },
    select: SUPPLIER_PRODUCT_SELECT,
  }) as unknown as Promise<SupplierProductRow | null>;
}

/**
 * Crée un nouvel enregistrement dans le catalogue fournisseur.
 *
 * @param data - Données de l'enregistrement à créer
 * @returns L'enregistrement créé avec ses relations
 */
export async function create(
  data: CreateSupplierProductData,
  tx?: Prisma.TransactionClient,
): Promise<SupplierProductRow> {
  const client = tx ?? prisma;
  try {
    return await client.supplierProduct.create({
      data: {
        supplier_id:          data.supplier_id,
        product_id:           data.product_id,
        supplier_ref:         data.supplier_ref ?? null,
        purchase_price:       data.purchase_price,
        packaging_format_id:  data.packaging_format_id,
        min_order_qty:        data.min_order_qty ?? 1,
        is_preferred:         data.is_preferred  ?? false,
      },
      select: SUPPLIER_PRODUCT_SELECT,
    }) as unknown as SupplierProductRow;
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
      throw new Error('SUPPLIER_PRODUCT_ALREADY_EXISTS');
    }
    throw err;
  }
}

/**
 * Met à jour les champs fournis d'un enregistrement existant (PATCH sémantique).
 * Seuls les champs présents dans data sont mis à jour.
 *
 * @param id   - UUID de l'enregistrement à mettre à jour
 * @param data - Champs à modifier
 * @returns L'enregistrement mis à jour avec ses relations
 * @throws Prisma P2025 si l'enregistrement n'existe pas
 */
export async function update(
  orgId: string,
  id: string,
  data: UpdateSupplierProductData,
  tx?: Prisma.TransactionClient,
): Promise<SupplierProductRow> {
  const client = tx ?? prisma;
  const updateData: Record<string, unknown> = {};
  if (data.supplier_ref !== undefined) updateData.supplier_ref = data.supplier_ref;
  if (data.purchase_price !== undefined) updateData.purchase_price = data.purchase_price;
  if (data.packaging_format_id !== undefined) updateData.packaging_format_id = data.packaging_format_id;
  if (data.min_order_qty !== undefined) updateData.min_order_qty = data.min_order_qty;
  if (data.is_preferred !== undefined) updateData.is_preferred = data.is_preferred;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;

  try {
    return await client.supplierProduct.update({
      where: { id, supplier: { organization_id: orgId } },
      data: updateData,
      select: SUPPLIER_PRODUCT_SELECT,
    }) as unknown as SupplierProductRow;
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
      throw new Error('SUPPLIER_PRODUCT_ALREADY_EXISTS');
    }
    throw err;
  }
}

/**
 * Active ou désactive un enregistrement du catalogue fournisseur (soft delete).
 *
 * @param orgId    - UUID de l'organisation courante
 * @param id       - UUID de l'enregistrement
 * @param isActive - true pour activer, false pour désactiver
 * @returns L'enregistrement mis à jour
 */
export async function setActive(orgId: string, id: string, isActive: boolean): Promise<SupplierProductRow> {
  return prisma.supplierProduct.update({
    where: { id, supplier: { organization_id: orgId } },
    data: { is_active: isActive },
    select: SUPPLIER_PRODUCT_SELECT,
  }) as unknown as SupplierProductRow;
}

/**
 * Retire le flag is_preferred de tous les enregistrements d'un produit donné.
 * Appelé avant toute création/mise à jour avec is_preferred = true pour garantir
 * qu'un seul fournisseur est marqué comme préféré par produit.
 *
 * @param orgId     - UUID de l'organisation courante
 * @param productId - UUID du produit dont on veut réinitialiser le fournisseur préféré
 */
export async function clearPreferred(orgId: string, productId: string, tx?: Prisma.TransactionClient): Promise<void> {
  const client = tx ?? prisma;
  await client.supplierProduct.updateMany({
    where: {
      product_id: productId,
      is_preferred: true,
      supplier: { organization_id: orgId },
    },
    data: { is_preferred: false },
  });
}
