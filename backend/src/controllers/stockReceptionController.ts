// src/controllers/stockReceptionController.ts
//
// Handlers HTTP pour la gestion des réceptions de stock (StockReception).
//
// Validation des entrées : Zod inline (schémas définis dans ce fichier).
// Logique métier : déléguée à stock_reception.service.ts.

import { Response } from 'express';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { resolveActorName, resolveStoreName } from '../services/audit.service';
import * as receptionService from '../services/stock_reception.service';

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
 */
function formatZodErrors(err: ZodError): string[] {
  return err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

/** Schéma de validation d'une ligne de réception. */
const receptionItemSchema = z.object({
  /** UUID de la ligne de commande (PurchaseOrderItem) reçue. */
  order_item_id: z.string().uuid('order_item_id doit être un UUID valide'),
  /** Quantité reçue en unités de commande — entier strictement positif. */
  received_qty:  z.number().int().positive('received_qty doit être un entier positif'),
});

/** Schéma de validation pour la création d'une réception. */
const createReceptionSchema = z.object({
  /** UUID de la commande parente. */
  order_id: z.string().uuid('order_id doit être un UUID valide'),
  /** Notes libres sur la réception. */
  notes:    z.string().optional(),
  /** Lignes de la réception — au moins une ligne obligatoire. */
  items:    z.array(receptionItemSchema).min(1, 'Au moins une ligne de réception est requise'),
});

/** Types inférés depuis les schémas Zod. */
export type CreateReceptionInput = z.infer<typeof createReceptionSchema>;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/receptions/by-order/:orderId
 *
 * Retourne toutes les réceptions liées à une commande.
 *
 * Params   : orderId — UUID de la commande parente
 * Réponse 200 : { success: true, receptions: StockReceptionRow[] }
 */
export async function getReceptionsByOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orderId = req.params.orderId as string;

  try {
    const receptions = await receptionService.getReceptionsByOrder(orderId);
    res.status(200).json({ success: true, receptions });
  } catch (error) {
    console.error('Erreur lors de la récupération des réceptions :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * GET /api/receptions/:id
 *
 * Retourne une réception par son UUID.
 *
 * Params   : id — UUID de la réception
 * Réponse 200 : { success: true, reception: StockReceptionRow }
 * Réponse 404 : { success: false, message } si introuvable
 */
export async function getReceptionById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  try {
    const reception = await receptionService.getReceptionById(id);
    res.status(200).json({ success: true, reception });
  } catch (error) {
    if (error instanceof Error && error.message === 'RECEPTION_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Réception introuvable.' });
      return;
    }
    console.error('Erreur lors de la récupération de la réception :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * POST /api/receptions
 *
 * Crée une nouvelle réception de stock pour une commande SENT ou PARTIALLY_RECEIVED.
 *
 * Body attendu : { order_id, notes?, items[{ order_item_id, received_qty }] }
 * Réponse 201  : { success: true, message, reception: StockReceptionRow }
 * Réponse 400  : { success: false, message, errors: string[] } si Zod échoue
 * Réponse 404  : { success: false, message } si commande ou produit introuvable
 * Réponse 422  : { success: false, message } si statut de commande invalide
 *
 * Sécurité : received_by_id = req.user!.userId (jamais depuis le body).
 */
export async function createReception(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parseResult = createReceptionSchema.safeParse(req.body);
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

    const reception = await receptionService.createReception(
      parseResult.data,
      actorId,
      actorName,
      storeId,
      storeName,
      ip,
    );

    res.status(201).json({
      success:   true,
      message:   `La réception pour la commande a été créée avec succès.`,
      reception,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ORDER_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Commande introuvable.' });
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_ORDER_STATUS') {
      res.status(422).json({
        success: false,
        message: 'La commande doit être en statut SENT ou PARTIALLY_RECEIVED pour créer une réception.',
      });
      return;
    }
    if (error instanceof Error && error.message === 'SUPPLIER_PRODUCT_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Un ou plusieurs produits ne figurent pas dans cette commande.',
      });
      return;
    }
    if (error instanceof Error && error.message === 'RECEPTION_QTY_EXCEEDS_REMAINING') {
      res.status(409).json({
        success: false,
        message: 'La quantité reçue dépasse le reliquat autorisé pour au moins une ligne de commande.',
      });
      return;
    }

    console.error('Erreur lors de la création de la réception :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * PATCH /api/receptions/:id/confirm
 *
 * Confirme une réception PENDING et met à jour l'inventaire du magasin de destination.
 *
 * Params   : id — UUID de la réception
 * Réponse 200 : { success: true, message, reception: StockReceptionRow }
 * Réponse 404 : { success: false, message } si introuvable
 * Réponse 422 : { success: false, message } si statut invalide
 */
export async function confirmReception(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const reception = await receptionService.confirmReception(id, actorId, actorName, storeId, storeName, ip);

    res.status(200).json({
      success:   true,
      message:   `La réception a été confirmée. Le stock du magasin a été mis à jour.`,
      reception,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'RECEPTION_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Réception introuvable.' });
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_STATUS_TRANSITION') {
      res.status(422).json({
        success: false,
        message: 'Seule une réception en statut PENDING peut être confirmée.',
      });
      return;
    }
    if (error instanceof Error && error.message === 'RECEPTION_QTY_EXCEEDS_REMAINING') {
      res.status(409).json({
        success: false,
        message: 'La confirmation dépasserait la quantité commandée sur au moins une ligne.',
      });
      return;
    }

    console.error('Erreur lors de la confirmation de la réception :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * PATCH /api/receptions/:id/cancel
 *
 * Annule une réception PENDING.
 * Réservé aux Super Administrateurs (middleware requireRole sur le routeur).
 *
 * Params   : id — UUID de la réception
 * Réponse 200 : { success: true, message, reception: StockReceptionRow }
 * Réponse 404 : { success: false, message } si introuvable
 * Réponse 422 : { success: false, message } si statut invalide
 */
export async function cancelReception(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const reception = await receptionService.cancelReception(id, actorId, actorName, storeId, storeName, ip);

    res.status(200).json({
      success:   true,
      message:   `La réception a été annulée.`,
      reception,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'RECEPTION_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Réception introuvable.' });
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_STATUS_TRANSITION') {
      res.status(422).json({
        success: false,
        message: 'Seule une réception en statut PENDING peut être annulée.',
      });
      return;
    }

    console.error('Erreur lors de l\'annulation de la réception :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}
