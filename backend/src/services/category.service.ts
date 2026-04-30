// src/services/category.service.ts
//
// Service de gestion des catégories (Category).
//
// Responsabilités :
//   - Logique métier : unicité du nom, protection contre la suppression
//     d'une catégorie en usage (produits ou enfants)
//   - Cycle de vie : création, mise à jour, suppression physique
//   - Journalisation de chaque action métier via audit.service

import { AuditAction } from '@prisma/client';
import { logAction } from './audit.service';
import * as categoryRepo from '../repositories/category.repository';
import type { CategoryRow, CreateCategoryData, UpdateCategoryData } from '../repositories/category.repository';

// Ré-export du type pour les controllers
export type { CategoryRow };

// ---------------------------------------------------------------------------
// Fonctions du service
// ---------------------------------------------------------------------------

/**
 * Retourne la liste complète des catégories, triées par nom.
 * Délègue directement au repository.
 *
 * @returns Tableau de CategoryRow
 */
export async function getCategories(): Promise<CategoryRow[]> {
  return categoryRepo.findAll();
}

/**
 * Retourne une catégorie par son UUID.
 *
 * @param id - UUID de la catégorie
 * @returns La catégorie trouvée
 * @throws Error('CATEGORY_NOT_FOUND') si l'UUID ne correspond à aucun enregistrement
 */
export async function getCategoryById(id: string): Promise<CategoryRow> {
  const category = await categoryRepo.findById(id);
  if (!category) {
    throw new Error('CATEGORY_NOT_FOUND');
  }
  return category;
}

/**
 * Crée une nouvelle catégorie et journalise l'action CATEGORY_CREATED.
 *
 * Règle métier : le nom doit être unique (insensible à la casse) parmi toutes
 * les catégories.
 * L'audit est non-bloquant : un échec d'écriture du log ne fait pas échouer
 * la création.
 *
 * @param data       - { name, parent_id? }
 * @param actorId    - UUID de l'utilisateur qui effectue l'action
 * @param actorName  - Nom de l'acteur (dénormalisé dans le log)
 * @param storeId    - UUID du magasin de contexte (optionnel)
 * @param storeName  - Nom du magasin (dénormalisé dans le log)
 * @param ipAddress  - Adresse IP de l'acteur (optionnelle)
 * @returns La catégorie créée
 * @throws Error('NAME_ALREADY_EXISTS') si le nom est déjà utilisé
 */
export async function createCategory(
  data: CreateCategoryData,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<CategoryRow> {
  // Vérification unicité du nom
  const existing = await categoryRepo.findByName(data.name);
  if (existing) {
    throw new Error('NAME_ALREADY_EXISTS');
  }

  const category = await categoryRepo.create(data);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.CATEGORY_CREATED,
      targetType: 'CATEGORY',
      targetId:   category.id,
      targetName: category.name,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log CATEGORY_CREATED :', err);
  }

  return category;
}

/**
 * Met à jour les champs fournis d'une catégorie existante.
 * Journalise l'action CATEGORY_UPDATED.
 *
 * Règle métier : si le nom est modifié, il doit rester unique parmi les autres
 * catégories.
 *
 * @param id         - UUID de la catégorie à mettre à jour
 * @param data       - Champs à modifier
 * @param actorId    - UUID de l'utilisateur qui effectue l'action
 * @param actorName  - Nom de l'acteur (dénormalisé)
 * @param storeId    - UUID du magasin de contexte (optionnel)
 * @param storeName  - Nom du magasin (dénormalisé)
 * @param ipAddress  - Adresse IP de l'acteur (optionnelle)
 * @returns La catégorie mise à jour
 * @throws Error('CATEGORY_NOT_FOUND')  si l'UUID ne correspond à aucun enregistrement
 * @throws Error('NAME_ALREADY_EXISTS') si le nouveau nom est déjà utilisé par une autre catégorie
 */
export async function updateCategory(
  id: string,
  data: UpdateCategoryData,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<CategoryRow> {
  // Vérification d'existence
  const existing = await categoryRepo.findById(id);
  if (!existing) {
    throw new Error('CATEGORY_NOT_FOUND');
  }

  // Vérification unicité du nom (uniquement si le nom change)
  if (data.name && data.name.toLowerCase() !== existing.name.toLowerCase()) {
    const nameOwner = await categoryRepo.findByName(data.name, id);
    if (nameOwner) {
      throw new Error('NAME_ALREADY_EXISTS');
    }
  }

  const category = await categoryRepo.update(id, data);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.CATEGORY_UPDATED,
      targetType: 'CATEGORY',
      targetId:   category.id,
      targetName: category.name,
      storeId,
      storeName,
      ipAddress,
      metadata:   { updated_fields: Object.keys(data) },
    });
  } catch (err) {
    console.error('[audit] Échec du log CATEGORY_UPDATED :', err);
  }

  return category;
}

/**
 * Supprime physiquement une catégorie.
 * Journalise l'action CATEGORY_DELETED.
 *
 * Règle métier : une catégorie ne peut être supprimée que si elle n'est rattachée
 * à aucun produit ET n'a aucune sous-catégorie enfant.
 *
 * @param id         - UUID de la catégorie à supprimer
 * @param actorId    - UUID de l'utilisateur qui effectue l'action
 * @param actorName  - Nom de l'acteur (dénormalisé)
 * @param storeId    - UUID du magasin de contexte (optionnel)
 * @param storeName  - Nom du magasin (dénormalisé)
 * @param ipAddress  - Adresse IP de l'acteur (optionnelle)
 * @throws Error('CATEGORY_NOT_FOUND') si l'UUID ne correspond à aucun enregistrement
 * @throws Error('CATEGORY_IN_USE')    si la catégorie a des produits ou des sous-catégories
 */
export async function deleteCategory(
  id: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<void> {
  // Vérification d'existence
  const existing = await categoryRepo.findById(id);
  if (!existing) {
    throw new Error('CATEGORY_NOT_FOUND');
  }

  // Vérification d'usage : pas de produits ni de sous-catégories
  if (existing._count.products > 0 || existing._count.children > 0) {
    throw new Error('CATEGORY_IN_USE');
  }

  // Capture le nom avant suppression pour le log
  const categoryName = existing.name;
  const categoryId   = existing.id;

  await categoryRepo.deleteById(id);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.CATEGORY_DELETED,
      targetType: 'CATEGORY',
      targetId:   categoryId,
      targetName: categoryName,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log CATEGORY_DELETED :', err);
  }
}
