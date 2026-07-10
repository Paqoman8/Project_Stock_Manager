// src/controllers/stockMovementController.ts
//
// Handlers HTTP pour les mouvements de stock.
//
// GET  /api/stock-movements  → requireAuth (tous rôles)
// POST /api/stock-movements  → requireAuth + SA/Admin/Manager

import { Response } from 'express';
import { z, ZodError } from 'zod';
import { MovementType } from '@prisma/client';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { resolveActorName, resolveStoreName } from '../services/audit.service';
import * as movementService from '../services/stock_movement.service';

function formatZodErrors(err: ZodError): string[] {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

function extractIp(req: AuthenticatedRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim() || (req.ip ?? '');
  return req.ip ?? '';
}

/** Résout le nom du rôle de l'utilisateur connecté. */
async function getRoleNameFromRequest(req: AuthenticatedRequest): Promise<string> {
  const role = await prisma.role.findUnique({
    where:  { id: req.user!.roleId },
    select: { name: true },
  });
  return role?.name ?? '';
}

// ---------------------------------------------------------------------------
// Schéma Zod
// ---------------------------------------------------------------------------

const MANUAL_TYPES = ['INITIAL', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] as const;

const createMovementSchema = z
  .object({
    store_id:            z.string().uuid('UUID établissement invalide'),
    product_id:          z.string().uuid('UUID produit invalide'),
    type:                z.enum(MANUAL_TYPES, { message: 'Type de mouvement invalide.' }),
    // qty requis seulement si pas de format — validé ci-dessous via refine
    qty:                 z.number().int().positive('La quantité doit être un entier positif.').optional(),
    reason:              z.string().optional(),
    // Conditionnement optionnel
    packaging_format_id: z.string().uuid('UUID format invalide').optional(),
    packages_count:      z.number().int().positive('Le nombre de colis doit être un entier positif.').optional(),
  })
  .refine(
    (d) => d.packaging_format_id ? d.packages_count !== undefined : d.qty !== undefined,
    {
      message: 'Fournissez qty (sans format) ou packages_count + packaging_format_id (avec format).',
    },
  );

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/stock-movements
 * Query : store_id?, product_id?, type?
 */
export async function getMovements(req: AuthenticatedRequest, res: Response): Promise<void> {
  const store_id   = req.query.store_id   as string | undefined;
  const product_id = req.query.product_id as string | undefined;
  const typeRaw    = req.query.type       as string | undefined;

  const type = typeRaw && Object.values(MovementType).includes(typeRaw as MovementType)
    ? (typeRaw as MovementType)
    : undefined;

  try {
    const movements = await movementService.getMovements({ store_id, product_id, type });
    res.status(200).json({ success: true, movements });
  } catch (err) {
    console.error('Erreur récupération mouvements :', err);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * POST /api/stock-movements
 * Body : { store_id, product_id, type, qty?, reason?, packaging_format_id?, packages_count? }
 */
export async function createMovement(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parseResult = createMovementSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ success: false, message: 'Données invalides.', errors: formatZodErrors(parseResult.error) });
    return;
  }

  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  const { qty, packaging_format_id, packages_count, ...rest } = parseResult.data;

  try {
    const roleName = await getRoleNameFromRequest(req);
    if (roleName !== 'Super Administrateur' && roleName !== 'Administrateur' && rest.store_id !== storeId) {
      res.status(403).json({ success: false, message: 'Vous ne pouvez créer un mouvement de stock que pour votre propre établissement.' });
      return;
    }

    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const movement = await movementService.createMovement(
      {
        ...rest,
        // qty sera recalculé si format fourni ; sinon on utilise celui envoyé
        qty:                 qty ?? 0,
        performed_by_id:     actorId,
        packaging_format_id,
        packages_count,
      },
      actorId,
      actorName,
      storeId,
      storeName,
      ip,
    );

    res.status(201).json({ success: true, message: 'Mouvement de stock enregistré.', movement });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'STORE_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Établissement introuvable.' });
      if (error.message === 'PRODUCT_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Produit introuvable.' });
      if (error.message === 'FORMAT_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Format de conditionnement introuvable ou non associé à ce produit.' });
      if (error.message === 'PACKAGES_COUNT_REQUIRED')
        return void res.status(400).json({ success: false, message: 'Le nombre de colis est obligatoire lorsqu\'un format est sélectionné.' });
      if (error.message === 'INITIAL_STOCK_ALREADY_EXISTS')
        return void res.status(409).json({ success: false, message: 'Un stock initial existe déjà pour ce produit dans cet établissement.' });
      if (error.message === 'REASON_REQUIRED')
        return void res.status(400).json({ success: false, message: 'Un motif est obligatoire pour les ajustements.' });
      if (error.message === 'INSUFFICIENT_FORMAT_STOCK')
        return void res.status(409).json({ success: false, message: 'Stock insuffisant pour ce format de conditionnement.' });
    }
    console.error('Erreur création mouvement :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

// ---------------------------------------------------------------------------
// Conversion inter-formats
// ---------------------------------------------------------------------------

const createConversionSchema = z.object({
  store_id:                 z.string().uuid('UUID établissement invalide'),
  product_id:               z.string().uuid('UUID produit invalide'),
  from_packaging_format_id: z.string().uuid('UUID format source invalide'),
  from_packages_count:      z.number().int().positive('Nombre de colis source invalide'),
  to_packaging_format_id:   z.string().uuid('UUID format destination invalide'),
  // Calculé server-side par équivalence — optionnel ici, sert seulement de cross-check si fourni
  to_packages_count:        z.number().int().positive('Nombre de colis destination invalide').optional(),
  reason:                   z.string().trim().min(1, 'Un motif est obligatoire pour toute conversion.'),
});

/**
 * POST /api/stock-movements/convert
 * Body : { store_id, product_id, from_packaging_format_id, from_packages_count,
 *           to_packaging_format_id, to_packages_count, reason? }
 */
export async function createConversion(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parseResult = createConversionSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ success: false, message: 'Données invalides.', errors: formatZodErrors(parseResult.error) });
    return;
  }

  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const roleName = await getRoleNameFromRequest(req);
    if (roleName !== 'Super Administrateur' && roleName !== 'Administrateur' && parseResult.data.store_id !== storeId) {
      res.status(403).json({ success: false, message: 'Vous ne pouvez effectuer une conversion que pour votre propre établissement.' });
      return;
    }

    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const movement = await movementService.createConversion(
      { ...parseResult.data, performed_by_id: actorId },
      actorId,
      actorName,
      storeId,
      storeName,
      ip,
    );

    res.status(201).json({ success: true, message: 'Conversion inter-formats enregistrée.', movement });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'STORE_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Établissement introuvable.' });
      if (error.message === 'PRODUCT_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Produit introuvable.' });
      if (error.message === 'FORMAT_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Format introuvable ou non associé à ce produit.' });
      if (error.message === 'SAME_FORMAT_CONVERSION')
        return void res.status(400).json({ success: false, message: 'Le format source et le format destination doivent être différents.' });
      if (error.message === 'NON_DIVISIBLE_CONVERSION')
        return void res.status(422).json({ success: false, message: 'Cette conversion ne correspond à aucun nombre entier de colis destination.' });
      if (error.message === 'CONVERSION_MISMATCH')
        return void res.status(400).json({ success: false, message: 'Le nombre de colis destination fourni ne correspond pas à l\'équivalence calculée.' });
      if (error.message === 'INSUFFICIENT_FORMAT_STOCK')
        return void res.status(409).json({ success: false, message: 'Stock insuffisant pour ce format source.' });
    }
    console.error('Erreur conversion inter-formats :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}
