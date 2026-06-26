// src/repositories/product.repository.ts
//
// Couche d'accès aux données pour les produits (Product).
//
// Responsabilités :
//   - CRUD Prisma pur — aucune logique métier ici
//   - Sélecteur partagé PRODUCT_SELECT pour garantir une forme constante
//   - Recherche textuelle sur name ou sku, filtres par catégorie et statut

import { ProductUnit } from '@prisma/client';
import { prisma } from '../config/database';

// ---------------------------------------------------------------------------
// Types exposés — contrat entre repository et service
// ---------------------------------------------------------------------------

/**
 * Un produit tel que retourné par toutes les fonctions du repository.
 * Le prix est sérialisé en string pour éviter la perte de précision Decimal.
 */
export interface ProductRow {
  id:          string;
  sku:         string;
  name:        string;
  description: string | null;
  price:       string;   // Decimal sérialisé en string
  unit:        string;   // ProductUnit enum
  is_active:   boolean;
  created_at:  Date;
  updated_at:  Date;
  category_id: string;
  category:    { id: string; name: string };
  _count:      { inventories: number };
}

/**
 * Filtres acceptés par findAll.
 */
export interface ProductFilters {
  /** Recherche partielle insensible à la casse sur name ou sku */
  search?:     string;
  /** Filtre par catégorie (UUID) */
  categoryId?: string;
  /** Filtre sur le statut actif/inactif */
  isActive?:   boolean;
}

/**
 * Données requises pour créer un produit.
 */
export type CreateProductData = {
  sku:         string;
  name:        string;
  price:       number;
  unit?:       ProductUnit;
  category_id: string;
  description?: string;
};

/**
 * Données pour la mise à jour d'un produit — sku exclu (immuable), tous les
 * autres champs optionnels.
 */
export type UpdateProductData = Partial<Omit<CreateProductData, 'sku'>>;

// ---------------------------------------------------------------------------
// Sélecteur Prisma partagé — garantit que toutes les fonctions retournent
// exactement la même forme de données (ProductRow).
// ---------------------------------------------------------------------------

const PRODUCT_SELECT = {
  id:          true,
  sku:         true,
  name:        true,
  description: true,
  price:       true,
  unit:        true,
  is_active:   true,
  created_at:  true,
  updated_at:  true,
  category_id: true,
  category: { select: { id: true, name: true } },
  _count:   { select: { inventories: true } },
} as const;

// ---------------------------------------------------------------------------
// Fonctions du repository
// ---------------------------------------------------------------------------

/**
 * Retourne la liste des produits avec filtres optionnels.
 *
 * Filtre search     : recherche partielle insensible à la casse sur name OU sku.
 * Filtre categoryId : restreint aux produits de la catégorie donnée.
 * Filtre isActive   : si non précisé, retourne tous les produits.
 * Tri               : alphabétique sur le nom.
 *
 * @param filters - { search?, categoryId?, isActive? }
 * @returns Tableau de ProductRow, potentiellement vide
 */
export async function findAll(filters: ProductFilters = {}): Promise<ProductRow[]> {
  const { search, categoryId, isActive } = filters;

  const rows = await prisma.product.findMany({
    where: {
      ...(isActive !== undefined ? { is_active: isActive } : {}),
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku:  { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select:  PRODUCT_SELECT,
    orderBy: { created_at: 'desc' },
  });

  // Sérialise Decimal → string pour chaque ligne
  return rows.map(serializeProduct);
}

/**
 * Retourne un produit par son UUID, ou null s'il n'existe pas.
 *
 * @param id - UUID du produit
 */
export async function findById(id: string): Promise<ProductRow | null> {
  const row = await prisma.product.findUnique({
    where:  { id },
    select: PRODUCT_SELECT,
  });
  return row ? serializeProduct(row) : null;
}

/**
 * Recherche un produit par son SKU.
 * Utilisé pour la vérification d'unicité avant création.
 *
 * @param sku       - SKU à rechercher
 * @param excludeId - UUID à exclure (non utilisé pour SKU qui est immuable,
 *                    conservé pour cohérence avec le pattern du repo)
 */
export async function findBySku(sku: string, excludeId?: string): Promise<ProductRow | null> {
  const row = await prisma.product.findFirst({
    where: {
      sku:  { equals: sku, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: PRODUCT_SELECT,
  });
  return row ? serializeProduct(row) : null;
}

/**
 * Crée un nouveau produit en base.
 *
 * @param data - { sku, name, price, category_id, description? }
 * @returns Le produit créé
 */
export async function create(data: CreateProductData): Promise<ProductRow> {
  const row = await prisma.product.create({
    data: {
      sku:         data.sku,
      name:        data.name,
      price:       data.price,
      unit:        data.unit,
      category_id: data.category_id,
      description: data.description ?? null,
    },
    select: PRODUCT_SELECT,
  });
  return serializeProduct(row);
}

/**
 * Crée un produit et son unité de base en une seule transaction atomique.
 * Si l'une des deux insertions échoue, les deux sont annulées.
 *
 * @param data        - Données du produit
 * @param formatLabel - Libellé de l'unité de base (ex. "Pièce", "Kg")
 */
export async function createWithBaseFormat(
  data: CreateProductData,
  formatLabel: string,
): Promise<ProductRow> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.product.create({
      data: {
        sku:         data.sku,
        name:        data.name,
        price:       data.price,
        unit:        data.unit,
        category_id: data.category_id,
        description: data.description ?? null,
      },
      select: PRODUCT_SELECT,
    });

    await tx.packagingFormat.create({
      data: {
        product_id:        row.id,
        label:             formatLabel,
        units_per_package: 1,
        is_base_unit:      true,
      },
    });

    return serializeProduct(row);
  });
}

/**
 * Met à jour les champs fournis d'un produit existant.
 * Seuls les champs présents dans data sont mis à jour (PATCH sémantique).
 *
 * @param id   - UUID du produit à mettre à jour
 * @param data - Champs à modifier (sku exclu)
 * @returns Le produit mis à jour
 */
export async function update(id: string, data: UpdateProductData): Promise<ProductRow> {
  const updateData: Record<string, unknown> = {};
  if (data.name        !== undefined) updateData.name        = data.name;
  if (data.price       !== undefined) updateData.price       = data.price;
  if (data.unit        !== undefined) updateData.unit        = data.unit;
  if (data.category_id !== undefined) updateData.category_id = data.category_id;
  if (data.description !== undefined) updateData.description = data.description;

  const row = await prisma.product.update({
    where:  { id },
    data:   updateData,
    select: PRODUCT_SELECT,
  });
  return serializeProduct(row);
}

/**
 * Active ou désactive un produit (soft delete).
 *
 * @param id       - UUID du produit
 * @param isActive - true pour activer, false pour désactiver
 * @returns Le produit mis à jour
 */
export async function setActive(id: string, isActive: boolean): Promise<ProductRow> {
  const row = await prisma.product.update({
    where:  { id },
    data:   { is_active: isActive },
    select: PRODUCT_SELECT,
  });
  return serializeProduct(row);
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/**
 * Convertit la valeur Decimal de Prisma en string pour la sérialisation JSON.
 * Prisma retourne les champs Decimal comme des objets Decimal.js ; on les
 * convertit en string pour éviter toute perte de précision côté client.
 */
function serializeProduct(row: {
  id:          string;
  sku:         string;
  name:        string;
  description: string | null;
  price:       { toString(): string };
  unit:        string;
  is_active:   boolean;
  created_at:  Date;
  updated_at:  Date;
  category_id: string;
  category:    { id: string; name: string };
  _count:      { inventories: number };
}): ProductRow {
  return {
    id:          row.id,
    sku:         row.sku,
    name:        row.name,
    description: row.description,
    price:       row.price.toString(),
    unit:        row.unit,
    is_active:   row.is_active,
    created_at:  row.created_at,
    updated_at:  row.updated_at,
    category_id: row.category_id,
    category:    row.category,
    _count:      row._count,
  };
}
