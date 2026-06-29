// src/controllers/productFormatController.ts
//
// Handlers HTTP pour la gestion des formats de produit (ProductFormat).
// Les routes de lecture sont protégées par requireAuth uniquement.
// Les routes de mutation requièrent requireAuth + requireRole('Super Administrateur', 'Administrateur').
//
// Validation des entrées : Zod inline (schémas définis dans ce fichier).
// Logique métier : déléguée à productFormat.service.ts.

import { Response } from 'express';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import * as productFormatService from '../services/productFormat.service';

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/**
 * Formate les erreurs Zod en tableau de messages lisibles pour le client.
 * Exemple : ["label: Le label est obligatoire"]
 */
function formatZodErrors(err: ZodError): string[] {
  return err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

// ---------------------------------------------------------------------------
// Schéma Zod — utilisé pour create et update
// ---------------------------------------------------------------------------

/**
 * Schéma de validation des données d'un format de produit.
 * Un format n'a qu'un seul champ métier : le label.
 */
const productFormatSchema = z.object({
  /** Label du format — obligatoire, non vide */
  label: z.string().min(1, 'Le label est obligatoire'),
});

/** Type inféré depuis le schéma Zod — utilisé pour créer ou mettre à jour un format. */
export type ProductFormatInput = z.infer<typeof productFormatSchema>;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/product-formats
 *
 * Retourne la liste complète des formats de produit, triés par label ASC.
 *
 * Réponse 200 : { success: true, formats: ProductFormatRow[] }
 *
 * Sécurité : requireAuth (lecture ouverte à tous les utilisateurs authentifiés).
 */
export async function getProductFormats(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const formats = await productFormatService.getProductFormats();

    res.status(200).json({
      success: true,
      formats,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des formats de produit :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * POST /api/product-formats
 *
 * Crée un nouveau format de produit.
 *
 * Body attendu : { label }
 * Réponse 201 : { success: true, message, format: ProductFormatRow }
 * Réponse 400 : { success: false, message, errors: string[] } si validation échoue
 * Réponse 409 : { success: false, message } si le label est déjà utilisé
 *
 * Sécurité : requireAuth + requireRole('Super Administrateur', 'Administrateur').
 */
export async function createProductFormat(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  // Validation Zod
  const parseResult = productFormatSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      message: 'Données invalides.',
      errors:  formatZodErrors(parseResult.error),
    });
    return;
  }

  try {
    const format = await productFormatService.createProductFormat(parseResult.data);

    res.status(201).json({
      success: true,
      message: `Le format "${format.label}" a été créé avec succès.`,
      format,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'LABEL_ALREADY_EXISTS') {
      res.status(409).json({
        success: false,
        message: 'Un format avec ce label existe déjà.',
      });
      return;
    }

    console.error('Erreur lors de la création du format de produit :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * PUT /api/product-formats/:id
 *
 * Met à jour le label d'un format existant.
 *
 * Params  : id — UUID du format
 * Body    : { label }
 * Réponse 200 : { success: true, message, format: ProductFormatRow }
 * Réponse 400 : { success: false, message, errors: string[] } si validation échoue
 * Réponse 404 : { success: false, message } si le format est introuvable
 * Réponse 409 : { success: false, message } si le label est déjà utilisé
 *
 * Sécurité : requireAuth + requireRole('Super Administrateur', 'Administrateur').
 */
export async function updateProductFormat(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const id = req.params.id as string;

  // Validation Zod
  const parseResult = productFormatSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      message: 'Données invalides.',
      errors:  formatZodErrors(parseResult.error),
    });
    return;
  }

  try {
    const format = await productFormatService.updateProductFormat(id, parseResult.data);

    res.status(200).json({
      success: true,
      message: `Le format "${format.label}" a été mis à jour avec succès.`,
      format,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORMAT_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Format de produit introuvable.',
      });
      return;
    }

    if (error instanceof Error && error.message === 'LABEL_ALREADY_EXISTS') {
      res.status(409).json({
        success: false,
        message: 'Un format avec ce label existe déjà.',
      });
      return;
    }

    console.error('Erreur lors de la mise à jour du format de produit :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * DELETE /api/product-formats/:id
 *
 * Supprime physiquement un format de produit.
 * Interdit si le label est utilisé par au moins un PackagingFormat produit.
 *
 * Params   : id — UUID du format
 * Réponse 200 : { success: true, message }
 * Réponse 404 : { success: false, message } si le format est introuvable
 * Réponse 409 : { success: false, message } si le format est en usage
 *
 * Sécurité : requireAuth + requireRole('Super Administrateur', 'Administrateur').
 */
export async function deleteProductFormat(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const id = req.params.id as string;

  try {
    await productFormatService.deleteProductFormat(id);

    res.status(200).json({
      success: true,
      message: 'Le format de produit a été supprimé avec succès.',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORMAT_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Format de produit introuvable.',
      });
      return;
    }

    if (error instanceof Error && error.message === 'FORMAT_IN_USE') {
      res.status(409).json({
        success: false,
        message: 'Ce format est utilisé par des produits et ne peut pas être supprimé.',
      });
      return;
    }

    console.error('Erreur lors de la suppression du format de produit :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}
