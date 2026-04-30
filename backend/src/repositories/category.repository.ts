// src/repositories/category.repository.ts
//
// Couche d'accès aux données pour les catégories (Category).
//
// Responsabilités :
//   - CRUD Prisma pur — aucune logique métier ici
//   - Sélecteur partagé CATEGORY_SELECT pour garantir une forme constante
//   - Hiérarchie : expose le parent direct et le nombre d'enfants + produits

import { prisma } from '../config/database';

// ---------------------------------------------------------------------------
// Types exposés — contrat entre repository et service
// ---------------------------------------------------------------------------

/**
 * Une catégorie telle que retournée par toutes les fonctions du repository.
 * Inclut le parent direct (pour l'affichage hiérarchique) et les compteurs.
 */
export interface CategoryRow {
  id:        string;
  name:      string;
  parent_id: string | null;
  parent:    { id: string; name: string } | null;
  _count:    { products: number; children: number };
}

/**
 * Données requises pour créer une catégorie.
 */
export interface CreateCategoryData {
  name:      string;
  parent_id?: string;
}

/**
 * Données pour la mise à jour d'une catégorie — tous les champs optionnels.
 * parent_id peut être null pour retirer la catégorie de sa hiérarchie.
 */
export interface UpdateCategoryData {
  name?:      string;
  parent_id?: string | null;
}

// ---------------------------------------------------------------------------
// Sélecteur Prisma partagé — garantit que toutes les fonctions retournent
// exactement la même forme de données (CategoryRow).
// ---------------------------------------------------------------------------

const CATEGORY_SELECT = {
  id:        true,
  name:      true,
  parent_id: true,
  parent: {
    select: { id: true, name: true },
  },
  _count: {
    select: { products: true, children: true },
  },
} as const;

// ---------------------------------------------------------------------------
// Fonctions du repository
// ---------------------------------------------------------------------------

/**
 * Retourne la liste complète des catégories, triées alphabétiquement.
 * Chaque catégorie inclut son parent direct et les compteurs de produits/enfants.
 *
 * @returns Tableau de CategoryRow, potentiellement vide
 */
export async function findAll(): Promise<CategoryRow[]> {
  return prisma.category.findMany({
    select:  CATEGORY_SELECT,
    orderBy: { name: 'asc' },
  });
}

/**
 * Retourne une catégorie par son UUID, ou null si elle n'existe pas.
 *
 * @param id - UUID de la catégorie
 */
export async function findById(id: string): Promise<CategoryRow | null> {
  return prisma.category.findUnique({
    where:  { id },
    select: CATEGORY_SELECT,
  });
}

/**
 * Recherche une catégorie par son nom (insensible à la casse).
 * Utilisé pour la vérification d'unicité avant création/mise à jour.
 *
 * @param name      - Nom à rechercher
 * @param excludeId - UUID à exclure de la recherche (pour la mise à jour)
 */
export async function findByName(name: string, excludeId?: string): Promise<CategoryRow | null> {
  return prisma.category.findFirst({
    where: {
      name:  { equals: name, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: CATEGORY_SELECT,
  });
}

/**
 * Crée une nouvelle catégorie en base.
 *
 * @param data - { name, parent_id? }
 * @returns La catégorie créée
 */
export async function create(data: CreateCategoryData): Promise<CategoryRow> {
  return prisma.category.create({
    data: {
      name:      data.name,
      parent_id: data.parent_id ?? null,
    },
    select: CATEGORY_SELECT,
  });
}

/**
 * Met à jour les champs fournis d'une catégorie existante.
 * Seuls les champs présents dans data sont mis à jour (PATCH sémantique).
 * parent_id: null retire la catégorie de sa hiérarchie.
 *
 * @param id   - UUID de la catégorie à mettre à jour
 * @param data - Champs à modifier
 * @returns La catégorie mise à jour
 */
export async function update(id: string, data: UpdateCategoryData): Promise<CategoryRow> {
  const updateData: Record<string, unknown> = {};
  if (data.name      !== undefined) updateData.name      = data.name;
  if (data.parent_id !== undefined) updateData.parent_id = data.parent_id;

  return prisma.category.update({
    where:  { id },
    data:   updateData,
    select: CATEGORY_SELECT,
  });
}

/**
 * Supprime physiquement une catégorie.
 * La garde métier (pas de produits ni d'enfants) est appliquée dans le service.
 *
 * @param id - UUID de la catégorie à supprimer
 */
export async function deleteById(id: string): Promise<void> {
  await prisma.category.delete({ where: { id } });
}
