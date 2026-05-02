// src/controllers/inventoryController.ts
//
// Handlers HTTP pour la gestion de l'inventaire.
//
// Routes de lecture  : requireAuth (tous les rôles authentifiés).
// Route de mutation  : requireAuth + requireRole SA/Admin.
//
// Validation des entrées : Zod inline.
// Logique métier : déléguée à inventory.service.ts.

import { Response } from 'express';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import * as inventoryService from '../services/inventory.service';
import * as breakdownRepo    from '../repositories/inventory_breakdown.repository';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatZodErrors(err: ZodError): string[] {
  return err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

// ---------------------------------------------------------------------------
// Schéma Zod — mise à jour des seuils
// ---------------------------------------------------------------------------

const updateThresholdsSchema = z
  .object({
    stock_min:     z.number().int().min(0, 'stock_min doit être ≥ 0').optional(),
    stock_reorder: z.number().int().min(0, 'stock_reorder doit être ≥ 0').optional(),
  })
  .refine(
    (d) => d.stock_min !== undefined || d.stock_reorder !== undefined,
    { message: 'Au moins un seuil (stock_min ou stock_reorder) doit être fourni.' },
  );

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/inventory
 *
 * Retourne toutes les entrées d'inventaire avec filtres optionnels.
 * Query params :
 *   - store_id   : UUID — filtre par établissement
 *   - product_id : UUID — filtre par produit
 *   - low_stock  : "true" — retourne uniquement les lignes en stock bas
 *
 * Réponse 200 : { success: true, inventory: InventoryRow[] }
 *
 * Sécurité : requireAuth.
 */
export async function getInventory(req: AuthenticatedRequest, res: Response): Promise<void> {
  const store_id   = req.query.store_id   as string | undefined;
  const product_id = req.query.product_id as string | undefined;
  const low_stock  = req.query.low_stock === 'true';

  try {
    const inventory = await inventoryService.getInventory({
      store_id,
      product_id,
      low_stock: low_stock || undefined,
    });

    res.status(200).json({ success: true, inventory });
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'inventaire :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * GET /api/inventory/:storeId/:productId
 *
 * Retourne une entrée d'inventaire par sa clé composite.
 *
 * Réponse 200 : { success: true, entry: InventoryRow }
 * Réponse 404 : si introuvable
 *
 * Sécurité : requireAuth.
 */
export async function getInventoryEntry(req: AuthenticatedRequest, res: Response): Promise<void> {
  const storeId   = req.params.storeId   as string;
  const productId = req.params.productId as string;

  try {
    const entry = await inventoryService.getInventoryEntry(storeId, productId);

    if (!entry) {
      res.status(404).json({ success: false, message: 'Entrée d\'inventaire introuvable.' });
      return;
    }

    res.status(200).json({ success: true, entry });
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'entrée d\'inventaire :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * PATCH /api/inventory/:storeId/:productId/thresholds
 *
 * Met à jour les seuils stock_min et/ou stock_reorder.
 *
 * Body : { stock_min?: number, stock_reorder?: number }
 * Réponse 200 : { success: true, message, entry: InventoryRow }
 * Réponse 400 : validation échouée
 * Réponse 404 : établissement ou produit introuvable
 *
 * Sécurité : requireAuth + requireRole SA/Admin.
 */
export async function updateThresholds(req: AuthenticatedRequest, res: Response): Promise<void> {
  const storeId   = req.params.storeId   as string;
  const productId = req.params.productId as string;

  const parseResult = updateThresholdsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      message: 'Données invalides.',
      errors:  formatZodErrors(parseResult.error),
    });
    return;
  }

  try {
    const entry = await inventoryService.updateThresholds(storeId, productId, parseResult.data);

    res.status(200).json({
      success: true,
      message: 'Seuils mis à jour avec succès.',
      entry,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'STORE_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Établissement introuvable.' });
      return;
    }
    if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Produit introuvable.' });
      return;
    }

    console.error('Erreur lors de la mise à jour des seuils :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * GET /api/inventory/:storeId/:productId/breakdown
 *
 * Retourne la ventilation du stock par format de conditionnement.
 * Réponse 200 : { success: true, breakdown: InventoryBreakdownRow[] }
 */
export async function getBreakdown(req: AuthenticatedRequest, res: Response): Promise<void> {
  const storeId   = req.params.storeId   as string;
  const productId = req.params.productId as string;

  try {
    const breakdown = await breakdownRepo.findByInventory(storeId, productId);
    res.status(200).json({ success: true, breakdown });
  } catch (error) {
    console.error('Erreur lors de la récupération de la ventilation :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}
