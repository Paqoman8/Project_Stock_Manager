// src/controllers/stockMovementController.ts
//
// Handlers HTTP pour les mouvements de stock.
//
// GET  /api/stock-movements         → requireAuth (tous rôles)
// POST /api/stock-movements         → requireAuth + SA/Admin/Manager

import { Response } from 'express';
import { z, ZodError } from 'zod';
import { MovementType } from '@prisma/client';
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

// ---------------------------------------------------------------------------
// Schéma Zod
// ---------------------------------------------------------------------------

const MANUAL_TYPES = ['INITIAL', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] as const;

const createMovementSchema = z.object({
  store_id:   z.string().uuid('UUID établissement invalide'),
  product_id: z.string().uuid('UUID produit invalide'),
  type:       z.enum(MANUAL_TYPES, { message: 'Type de mouvement invalide.' }),
  qty:        z.number().int().positive('La quantité doit être un entier positif.'),
  reason:     z.string().optional(),
});

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
 * Body : { store_id, product_id, type, qty, reason? }
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

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const movement = await movementService.createMovement(
      { ...parseResult.data, performed_by_id: actorId },
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
      if (error.message === 'INITIAL_STOCK_ALREADY_EXISTS')
        return void res.status(409).json({ success: false, message: 'Un stock initial existe déjà pour ce produit dans cet établissement.' });
      if (error.message === 'REASON_REQUIRED')
        return void res.status(400).json({ success: false, message: 'Un motif est obligatoire pour les ajustements.' });
    }
    console.error('Erreur création mouvement :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}
