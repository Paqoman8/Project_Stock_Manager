// src/controllers/categoryController.ts
//
// Handlers HTTP pour la gestion des catégories (Category).
// Les routes de lecture sont protégées par requireAuth uniquement.
// Les routes de mutation requièrent requireAuth + requireRole('Super Administrateur').
//
// Validation des entrées : Zod inline (schémas définis dans ce fichier).
// Logique métier : déléguée à category.service.ts.

import { Response } from 'express';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { resolveActorName, resolveStoreName } from '../services/audit.service';
import * as categoryService from '../services/category.service';

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/** Extrait l'IP réelle du client (gère les proxys via X-Forwarded-For). */
function extractIp(req: AuthenticatedRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim() || (req.ip ?? '');
  }
  return req.ip ?? '';
}

/**
 * Formate les erreurs Zod en tableau de messages lisibles pour le client.
 * Exemple : ["name: Le nom est obligatoire", "parent_id: UUID invalide"]
 */
function formatZodErrors(err: ZodError): string[] {
  return err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

// ---------------------------------------------------------------------------
// Schéma Zod — utilisé pour create (complet) et update (partiel)
// ---------------------------------------------------------------------------

/**
 * Schéma de validation des données catégorie.
 * Utilisé tel quel pour la création ; rendu entièrement optionnel pour la mise à jour.
 */
const categorySchema = z.object({
  /** Nom de la catégorie — obligatoire, non vide */
  name:      z.string().min(1, 'Le nom est obligatoire'),
  /** UUID de la catégorie parente — optionnel */
  parent_id: z.string().uuid('UUID invalide').optional(),
});

/** Type inféré depuis le schéma Zod — utilisé pour créer une catégorie. */
export type CategoryInput = z.infer<typeof categorySchema>;

/** Schéma partiel pour la mise à jour : tous les champs deviennent optionnels. */
const updateCategorySchema = categorySchema
  .partial()
  .extend({
    /** parent_id peut être null pour retirer la catégorie de sa hiérarchie */
    parent_id: z.string().uuid('UUID invalide').nullable().optional(),
  });

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/categories
 *
 * Retourne la liste complète des catégories avec leur parent et leurs compteurs.
 *
 * Réponse 200 : { success: true, categories: CategoryRow[] }
 *
 * Sécurité : requireAuth (lecture ouverte aux utilisateurs authentifiés).
 */
export async function getCategories(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const categories = await categoryService.getCategories();

    res.status(200).json({
      success: true,
      categories,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des catégories :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * GET /api/categories/:id
 *
 * Retourne une catégorie par son UUID.
 *
 * Params   : id — UUID de la catégorie
 * Réponse 200 : { success: true, category: CategoryRow }
 * Réponse 404 : { success: false, message } si introuvable
 *
 * Sécurité : requireAuth.
 */
export async function getCategoryById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  try {
    const category = await categoryService.getCategoryById(id);

    res.status(200).json({
      success: true,
      category,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'CATEGORY_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Catégorie introuvable.',
      });
      return;
    }

    console.error('Erreur lors de la récupération de la catégorie :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * POST /api/categories
 *
 * Crée une nouvelle catégorie.
 *
 * Body attendu : { name, parent_id? }
 * Réponse 201 : { success: true, message, category: CategoryRow }
 * Réponse 400 : { success: false, message, errors: string[] } si validation échoue
 * Réponse 409 : { success: false, message } si le nom est déjà utilisé
 *
 * Sécurité : requireAuth + requireRole('Super Administrateur').
 * L'actorId et le storeId sont extraits du token JWT — jamais du body.
 */
export async function createCategory(req: AuthenticatedRequest, res: Response): Promise<void> {
  // Validation Zod
  const parseResult = categorySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      message: 'Données invalides.',
      errors:  formatZodErrors(parseResult.error),
    });
    return;
  }

  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const category = await categoryService.createCategory(
      parseResult.data,
      actorId,
      actorName,
      storeId,
      storeName,
      ip,
    );

    res.status(201).json({
      success:  true,
      message:  `La catégorie "${category.name}" a été créée avec succès.`,
      category,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'NAME_ALREADY_EXISTS') {
      res.status(409).json({
        success: false,
        message: 'Une catégorie avec ce nom existe déjà.',
      });
      return;
    }

    console.error('Erreur lors de la création de la catégorie :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * PUT /api/categories/:id
 *
 * Met à jour les champs fournis d'une catégorie existante.
 *
 * Params  : id — UUID de la catégorie
 * Body    : { name?, parent_id? } (parent_id: null retire la catégorie de sa hiérarchie)
 * Réponse 200 : { success: true, message, category: CategoryRow }
 * Réponse 400 : { success: false, message, errors: string[] } si validation échoue
 * Réponse 404 : { success: false, message } si introuvable
 * Réponse 409 : { success: false, message } si le nom est déjà utilisé
 *
 * Sécurité : requireAuth + requireRole('Super Administrateur').
 */
export async function updateCategory(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  // Validation Zod (schéma partiel)
  const parseResult = updateCategorySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      message: 'Données invalides.',
      errors:  formatZodErrors(parseResult.error),
    });
    return;
  }

  // Au moins un champ doit être fourni
  if (Object.keys(parseResult.data).length === 0) {
    res.status(400).json({
      success: false,
      message: 'Au moins un champ doit être fourni pour la mise à jour.',
    });
    return;
  }

  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const category = await categoryService.updateCategory(
      id,
      parseResult.data,
      actorId,
      actorName,
      storeId,
      storeName,
      ip,
    );

    res.status(200).json({
      success:  true,
      message:  `La catégorie "${category.name}" a été mise à jour avec succès.`,
      category,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'CATEGORY_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Catégorie introuvable.',
      });
      return;
    }

    if (error instanceof Error && error.message === 'NAME_ALREADY_EXISTS') {
      res.status(409).json({
        success: false,
        message: 'Une catégorie avec ce nom existe déjà.',
      });
      return;
    }

    console.error('Erreur lors de la mise à jour de la catégorie :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * DELETE /api/categories/:id
 *
 * Supprime physiquement une catégorie.
 * Interdit si la catégorie possède des produits ou des sous-catégories.
 *
 * Params   : id — UUID de la catégorie
 * Réponse 200 : { success: true, message }
 * Réponse 404 : { success: false, message } si introuvable
 * Réponse 409 : { success: false, message } si catégorie en usage
 *
 * Sécurité : requireAuth + requireRole('Super Administrateur').
 */
export async function deleteCategory(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    await categoryService.deleteCategory(id, actorId, actorName, storeId, storeName, ip);

    res.status(200).json({
      success: true,
      message: 'La catégorie a été supprimée avec succès.',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'CATEGORY_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Catégorie introuvable.',
      });
      return;
    }

    if (error instanceof Error && error.message === 'CATEGORY_IN_USE') {
      res.status(409).json({
        success: false,
        message: 'Impossible de supprimer cette catégorie : elle contient des produits ou des sous-catégories.',
      });
      return;
    }

    console.error('Erreur lors de la suppression de la catégorie :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}
