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
import { formatZodErrors } from '../utils/zod';

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

const createSchema = z.object({
  label:             z.string().min(1, 'Le libellé est obligatoire.').max(50),
  units_per_package: z.number().int().min(1, 'Le coefficient doit être ≥ 1.'),
  price:             z.number().positive('Le prix doit être positif.').nullable().optional(),
  is_base_unit:      z.boolean().optional().default(false),
});

const updateSchema = z.object({
  label:             z.string().min(1).max(50).optional(),
  units_per_package: z.number().int().min(1).optional(),
  price:             z.number().positive().nullable().optional(),
  is_base_unit:      z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertProductExists(orgId: string, productId: string): Promise<boolean> {
  const product = await prisma.product.findUnique({
    where: { id: productId, organization_id: orgId },
    select: { id: true },
  });
  return product !== null;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** GET /api/products/:productId/packaging-formats */
export async function getFormats(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId     = req.user!.orgId;
  const productId = req.params.productId as string;
  const storeId   = req.user!.storeId;
  try {
    if (!(await assertProductExists(orgId, productId))) {
      res.status(404).json({ success: false, message: 'Produit introuvable.' });
      return;
    }
    let formats = await repo.findAllByProduct(orgId, productId);

    // Si aucun format de base n'existe (produit créé avant l'ajout de ce champ),
    // on le crée automatiquement à partir de l'unité du produit.
    const hasBase = formats.some((f) => f.is_base_unit);
    if (!hasBase) {
      const product = await prisma.product.findUnique({
        where: { id: productId, organization_id: orgId },
        select: { unit: true },
      });
      if (product) {
        const labels: Record<string, string> = {
          PIECE:      'Pièce',
          KG:         'Kilogramme',
          G:          'Gramme',
          L:          'Litre',
          CL:         'Centilitre',
          ML:         'Millilitre',
          BOUTEILLE:  'Bouteille',
          SACHET:     'Sachet',
          BOITE:      'Boîte',
        };
        await prisma.packagingFormat.createMany({
          data: [{
            product_id:        productId,
            label:             labels[product.unit] ?? product.unit,
            units_per_package: 1,
            is_base_unit:      true,
          }],
          skipDuplicates: true,
        });
        formats = await repo.findAllByProduct(orgId, productId);
      }
    }

    // Enrichir chaque format avec le stock disponible dans le breakdown du magasin
    const formatIds = formats.map((f) => f.id);
    const breakdowns = await prisma.inventoryBreakdown.findMany({
      where: { packaging_format_id: { in: formatIds }, store_id: storeId },
      select: { packaging_format_id: true, quantity: true },
    });
    const breakdownMap = new Map(breakdowns.map((b) => [b.packaging_format_id, b.quantity]));

    const formatsWithStock = formats.map((f) => ({
      id: f.id,
      product_id: f.product_id,
      label: f.label,
      units_per_package: f.units_per_package,
      price: f.price,
      is_base_unit: f.is_base_unit,
      available_quantity: breakdownMap.get(f.id) ?? 0,
    }));

    res.status(200).json({ success: true, formats: formatsWithStock });
  } catch (err) {
    console.error('Erreur récupération formats :', err);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/** POST /api/products/:productId/packaging-formats */
export async function createFormat(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId     = req.user!.orgId;
  const productId = req.params.productId as string;

  const parseResult = createSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ success: false, message: 'Données invalides.', errors: formatZodErrors(parseResult.error) });
    return;
  }

  const { label, units_per_package, price, is_base_unit } = parseResult.data;

  try {
    if (!(await assertProductExists(orgId, productId))) {
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
      const existing = await repo.findBaseUnit(orgId, productId);
      if (existing) {
        res.status(409).json({ success: false, message: 'Ce produit a déjà une unité de base définie.' });
        return;
      }
    }

    // Règle : l'unité de base n'a jamais de prix propre — elle prend automatiquement
    // le prix de base du produit (null = product.price × 1, voir schema.prisma)
    if (is_base_unit && price !== undefined && price !== null) {
      res.status(422).json({
        success: false,
        message: 'Un format d\'unité de base ne peut pas avoir de prix spécifique : il utilise automatiquement le prix de base du produit.',
      });
      return;
    }

    const format = await repo.create(orgId, {
      product_id:        productId,
      label,
      units_per_package,
      price:             is_base_unit ? null : (price ?? null),
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
  const orgId     = req.user!.orgId;
  const productId = req.params.productId as string;
  const id        = req.params.id        as string;

  const parseResult = updateSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ success: false, message: 'Données invalides.', errors: formatZodErrors(parseResult.error) });
    return;
  }

  try {
    const existing = await repo.findById(orgId, id);
    if (!existing || existing.product_id !== productId) {
      res.status(404).json({ success: false, message: 'Format introuvable.' });
      return;
    }

    const { label, units_per_package, price, is_base_unit } = parseResult.data;

    // Recalcule les valeurs effectives après mise à jour partielle
    const newIsBase = is_base_unit ?? existing.is_base_unit;
    const newUnits  = units_per_package ?? existing.units_per_package;

    if (newIsBase && newUnits !== 1) {
      res.status(422).json({ success: false, message: 'L\'unité de base doit avoir un coefficient de 1.' });
      return;
    }

    // Règle : l'unité de base n'a jamais de prix propre — elle prend automatiquement
    // le prix de base du produit (null = product.price × 1, voir schema.prisma)
    if (newIsBase && price !== undefined && price !== null) {
      res.status(422).json({
        success: false,
        message: 'Un format d\'unité de base ne peut pas avoir de prix spécifique : il utilise automatiquement le prix de base du produit.',
      });
      return;
    }

    // Si on bascule ce format en unité de base, on retire le badge à l'ancien
    if (is_base_unit === true && !existing.is_base_unit) {
      const currentBase = await repo.findBaseUnit(orgId, productId);
      if (currentBase && currentBase.id !== id) {
        await repo.update(orgId, currentBase.id, { is_base_unit: false });
      }
    }

    // price omis (undefined) = ne pas toucher à la valeur existante ; forcé à null si unité de base.
    const priceUpdate = newIsBase ? null : price;
    const format = await repo.update(orgId, id, { label, units_per_package, price: priceUpdate, is_base_unit });
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
  const orgId     = req.user!.orgId;
  const productId = req.params.productId as string;
  const id        = req.params.id        as string;

  try {
    const existing = await repo.findById(orgId, id);
    if (!existing || existing.product_id !== productId) {
      res.status(404).json({ success: false, message: 'Format introuvable.' });
      return;
    }

    // Refuse de supprimer l'unité de base s'il reste d'autres formats
    if (existing.is_base_unit) {
      const count = await repo.countByProduct(orgId, productId);
      if (count > 1) {
        res.status(409).json({
          success: false,
          message: 'Impossible de supprimer l\'unité de base tant que d\'autres formats existent.',
        });
        return;
      }
    }

    await repo.remove(orgId, id);
    res.status(200).json({ success: true, message: 'Format supprimé.' });
  } catch (err) {
    console.error('Erreur suppression format :', err);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}
