// src/repositories/productFormat.repository.ts
//
// Couche d'accès aux données pour les formats de produit (ProductFormat).
//
// Responsabilités :
//   - CRUD Prisma pur — aucune logique métier ici
//   - Sélecteur partagé PRODUCT_FORMAT_SELECT pour garantir une forme constante
//   - Garde de suppression : vérifie qu'aucun PackagingFormat n'utilise le même label

import { prisma } from '../config/database';

// ---------------------------------------------------------------------------
// Types exposés — contrat entre repository et service
// ---------------------------------------------------------------------------

/**
 * Un format de produit tel que retourné par toutes les fonctions du repository.
 */
export interface ProductFormatRow {
  id:              string;
  label:           string;
  organization_id: string;
  createdAt:       Date;
  updatedAt:       Date;
}

/**
 * Données requises pour créer un format de produit.
 */
export interface CreateProductFormatData {
  label: string;
}

/**
 * Données pour la mise à jour d'un format — label obligatoire.
 */
export interface UpdateProductFormatData {
  label: string;
}

// ---------------------------------------------------------------------------
// Sélecteur Prisma partagé — garantit une forme de données constante.
// ---------------------------------------------------------------------------

const PRODUCT_FORMAT_SELECT = {
  id:              true,
  label:           true,
  organization_id: true,
  createdAt:       true,
  updatedAt:       true,
} as const;

// ---------------------------------------------------------------------------
// Fonctions du repository
// ---------------------------------------------------------------------------

/**
 * Retourne la liste complète des formats, triés alphabétiquement par label.
 *
 * @returns Tableau de ProductFormatRow, potentiellement vide
 */
export async function findAll(orgId: string): Promise<ProductFormatRow[]> {
  return prisma.productFormat.findMany({
    where:   { organization_id: orgId },
    select:  PRODUCT_FORMAT_SELECT,
    orderBy: { label: 'asc' },
  });
}

/**
 * Retourne un format par son UUID, ou null s'il n'existe pas.
 *
 * @param id - UUID du format
 */
export async function findById(id: string, orgId: string): Promise<ProductFormatRow | null> {
  return prisma.productFormat.findUnique({
    where:  { id, organization_id: orgId },
    select: PRODUCT_FORMAT_SELECT,
  });
}

/**
 * Recherche un format par son label (insensible à la casse).
 * Utilisé pour la vérification d'unicité avant création/mise à jour.
 *
 * @param label     - Label à rechercher
 * @param excludeId - UUID à exclure (pour la mise à jour, évite le faux conflit)
 */
export async function findByLabel(
  label: string,
  orgId: string,
  excludeId?: string,
): Promise<ProductFormatRow | null> {
  return prisma.productFormat.findFirst({
    where: {
      organization_id: orgId,
      label: { equals: label.trim(), mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: PRODUCT_FORMAT_SELECT,
  });
}

/**
 * Vérifie qu'aucun PackagingFormat (format produit-niveau) n'utilise ce label.
 * Utilisé comme garde avant suppression d'un ProductFormat de référence.
 *
 * @param label - Label du format à vérifier
 * @returns true si au moins un PackagingFormat utilise ce label
 */
export async function isLabelUsedByPackagingFormat(label: string): Promise<boolean> {
  const existing = await prisma.packagingFormat.findFirst({
    where:  { label: { equals: label.trim(), mode: 'insensitive' } },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * Crée un nouveau format de produit en base.
 *
 * @param data - { label }
 * @returns Le format créé
 */
export async function create(data: CreateProductFormatData, orgId: string): Promise<ProductFormatRow> {
  return prisma.productFormat.create({
    data:   { label: data.label.trim(), organization_id: orgId },
    select: PRODUCT_FORMAT_SELECT,
  });
}

/**
 * Met à jour le label d'un format existant.
 *
 * @param id   - UUID du format à mettre à jour
 * @param data - { label }
 * @returns Le format mis à jour
 */
export async function update(
  id: string,
  data: UpdateProductFormatData,
  orgId: string,
): Promise<ProductFormatRow> {
  return prisma.productFormat.update({
    where:  { id, organization_id: orgId },
    data:   { label: data.label.trim() },
    select: PRODUCT_FORMAT_SELECT,
  });
}

/**
 * Supprime physiquement un format de produit.
 * La garde métier (label non utilisé) est appliquée dans le service.
 *
 * @param id - UUID du format à supprimer
 */
export async function deleteById(id: string, orgId: string): Promise<void> {
  await prisma.productFormat.delete({ where: { id, organization_id: orgId } });
}
