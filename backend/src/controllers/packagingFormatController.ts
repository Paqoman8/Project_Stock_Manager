// src/controllers/packagingFormatController.ts
//
// Handlers HTTP pour les formats de conditionnement.
//
// Routes : /api/products/:productId/packaging-formats[/:id]
// Lecture : tous les rôles authentifiés
// Écriture : Super Administrateur uniquement

import { Response } from 'express';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { prisma } from '../config/database';
import * as repo from '../repositories/packaging_format.repository';

function formatZodErrors(err: ZodError): string[] {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

const createSchema = z.object({
  label:             z.string().min(1, 'Le libellé est obligatoire.').max(50),
  units_per_package: z.number().int().min(1, 'Le coefficient doit être ≥ 1.'),
  is_base_unit:      z.boolean().optional().default(false),
});

const updateSchema = z.object({
  label:             z.string().min(1).max(50).optional(),
  units_per_package: z.number().int().min(1).optional(),
  is_base_unit:      z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertProductExists(productId: string): Promise<boolean> {
  const product = await prisma.product.findUnique({
    where:  { id: productId },
    select: { id: true },
  });
  return product !== null;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** GET /api/products/:productId/packaging-formats */
export async function getFormats(req: AuthenticatedRequest, res: Response): Promise<void> {
  const productId = req.params.productId as string;
  try {
    if (!(await assertProductExists(productId))) {
      res.status(404).json({ success: false, message: 'Produit introuvable.' });
      return;
    }
    const formats = await repo.findAllByProduct(productId);
    res.status(200).json({ success: true, formats });
  } catch (err) {
    console.error('Erreur récupération formats :', err);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/** POST /api/products/:productId/packaging-formats */
export async function createFormat(req: AuthenticatedRequest, res: Response): Promise<void> {
  const productId = req.params.productId as string;

  const parseResult = createSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ success: false, message: 'Données invalides.', errors: formatZodErrors(parseResult.error) });
    return;
  }

  const { label, units_per_package, is_base_unit } = parseResult.data;

  try {
    if (!(await assertProductExists(productId))) {
      res.status(404).json({ success: false, message: 'Produit introuvable.' });
      return;
    }

    // Règle : unité de base → coefficient doit être 1
    if (is_base_unit && units_per_package !== 1) {
      res.status(422).json({ success: false, message: 'L\'unité de base doit avoir un coefficient de 1.' });
      return;
    }

    // Règle : un seul format is_base_unit par produit
    if (is_base_unit) {
      const existing = await repo.findBaseUnit(productId);
      if (existing) {
        res.status(409).json({ success: false, message: 'Ce produit a déjà une unité de base définie.' });
        return;
      }
    }

    const format = await repo.create({
      product_id:        productId,
      label,
      units_per_package,
      is_base_unit,
    });
    res.status(201).json({ success: true, format });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Unique constraint')) {
      res.status(409).json({ success: false, message: 'Un format avec ce libellé existe déjà pour ce produit.' });
      return;
    }
    console.error('Erreur création format :', err);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/** PUT /api/products/:productId/packaging-formats/:id */
export async function updateFormat(req: AuthenticatedRequest, res: Response): Promise<void> {
  const productId = req.params.productId as string;
  const id        = req.params.id        as string;

  const parseResult = updateSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ success: false, message: 'Données invalides.', errors: formatZodErrors(parseResult.error) });
    return;
  }

  try {
    const existing = await repo.findById(id);
    if (!existing || existing.product_id !== productId) {
      res.status(404).json({ success: false, message: 'Format introuvable.' });
      return;
    }

    const { label, units_per_package, is_base_unit } = parseResult.data;

    // Recalcule les valeurs effectives après mise à jour partielle
    const newIsBase = is_base_unit ?? existing.is_base_unit;
    const newUnits  = units_per_package ?? existing.units_per_package;

    if (newIsBase && newUnits !== 1) {
      res.status(422).json({ success: false, message: 'L\'unité de base doit avoir un coefficient de 1.' });
      return;
    }

    // Si on bascule ce format en unité de base, on retire le badge à l'ancien
    if (is_base_unit === true && !existing.is_base_unit) {
      const currentBase = await repo.findBaseUnit(productId);
      if (currentBase && currentBase.id !== id) {
        await repo.update(currentBase.id, { is_base_unit: false });
      }
    }

    const format = await repo.update(id, { label, units_per_package, is_base_unit });
    res.status(200).json({ success: true, format });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Unique constraint')) {
      res.status(409).json({ success: false, message: 'Un format avec ce libellé existe déjà pour ce produit.' });
      return;
    }
    console.error('Erreur mise à jour format :', err);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/** DELETE /api/products/:productId/packaging-formats/:id */
export async function deleteFormat(req: AuthenticatedRequest, res: Response): Promise<void> {
  const productId = req.params.productId as string;
  const id        = req.params.id        as string;

  try {
    const existing = await repo.findById(id);
    if (!existing || existing.product_id !== productId) {
      res.status(404).json({ success: false, message: 'Format introuvable.' });
      return;
    }

    // Refuse de supprimer l'unité de base s'il reste d'autres formats
    if (existing.is_base_unit) {
      const count = await repo.countByProduct(productId);
      if (count > 1) {
        res.status(409).json({
          success: false,
          message: 'Impossible de supprimer l\'unité de base tant que d\'autres formats existent.',
        });
        return;
      }
    }

    await repo.remove(id);
    res.status(200).json({ success: true, message: 'Format supprimé.' });
  } catch (err) {
    console.error('Erreur suppression format :', err);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}
