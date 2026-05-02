// src/controllers/purchaseOrderController.ts
//
// Handlers HTTP pour la gestion des commandes fournisseurs (PurchaseOrder).
//
// Validation des entrées : Zod inline (schémas définis dans ce fichier).
// Logique métier : déléguée à purchase_order.service.ts.

import { Response } from 'express';
import { z, ZodError } from 'zod';
import { PurchaseOrderStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { resolveActorName, resolveStoreName } from '../services/audit.service';
import * as orderService from '../services/purchase_order.service';

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
 * Exemple : ["items.0.ordered_qty: Expected number, received nan"]
 */
function formatZodErrors(err: ZodError): string[] {
  return err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

/** Schéma de validation d'une ligne de commande. */
const purchaseOrderItemSchema = z.object({
  /** UUID du supplier_product (couple fournisseur-produit). */
  supplier_product_id: z.string().uuid('supplier_product_id doit être un UUID valide'),
  /** Quantité commandée en unités de commande — entier strictement positif. */
  ordered_qty:         z.number().int().positive('ordered_qty doit être un entier positif'),
  /** Prix unitaire au moment de la commande — nombre strictement positif. */
  unit_price:          z.number().positive('unit_price doit être un nombre positif'),
  /** Format de conditionnement commandé (optionnel). */
  packaging_format_id: z.string().uuid('packaging_format_id doit être un UUID valide').optional(),
});

/** Schéma de validation pour la création d'une commande. */
const createPurchaseOrderSchema = z.object({
  /** UUID du fournisseur. */
  supplier_id:          z.string().uuid('supplier_id doit être un UUID valide'),
  /** UUID du magasin de destination. */
  destination_store_id: z.string().uuid('destination_store_id doit être un UUID valide'),
  /** Notes libres sur la commande. */
  notes:                z.string().optional(),
  /** Date de livraison prévue — ISO 8601. */
  expected_at:          z.string().datetime({ message: 'expected_at doit être une date ISO 8601 valide' }).optional(),
  /** Lignes de la commande — au moins une ligne obligatoire. */
  items:                z.array(purchaseOrderItemSchema).min(1, 'Au moins une ligne de commande est requise'),
});

/** Schéma de validation pour la mise à jour partielle d'une commande DRAFT. */
const updatePurchaseOrderSchema = z.object({
  /** Notes libres à modifier. */
  notes:                z.string().optional(),
  /** Date de livraison prévue à modifier — ISO 8601. */
  expected_at:          z.string().datetime({ message: 'expected_at doit être une date ISO 8601 valide' }).optional(),
  /** UUID du nouveau magasin de destination. */
  destination_store_id: z.string().uuid('destination_store_id doit être un UUID valide').optional(),
  /** Remplacement complet des lignes de la commande — au moins une ligne si fourni. */
  items: z.array(z.object({
    /** UUID du supplier_product (couple fournisseur-produit). */
    supplier_product_id: z.string().uuid('supplier_product_id doit être un UUID valide'),
    /** Quantité commandée — entier strictement positif. */
    ordered_qty:         z.number().int().positive('ordered_qty doit être un entier positif'),
    /** Prix unitaire au moment de la commande — nombre strictement positif. */
    unit_price:          z.number().positive('unit_price doit être un nombre positif'),
    /** Format de conditionnement commandé (optionnel). */
    packaging_format_id: z.string().uuid('packaging_format_id doit être un UUID valide').optional(),
  })).min(1, 'La commande doit contenir au moins une ligne.').optional(),
});

/** Types inférés depuis les schémas Zod. */
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/purchase-orders
 *
 * Retourne la liste des commandes fournisseurs.
 * Filtres acceptés en query params :
 *   - supplier_id          : UUID — filtre par fournisseur
 *   - destination_store_id : UUID — filtre par magasin de destination
 *   - status               : PurchaseOrderStatus — filtre par statut
 *
 * Réponse 200 : { success: true, orders: PurchaseOrderRow[] }
 */
export async function getPurchaseOrders(req: AuthenticatedRequest, res: Response): Promise<void> {
  const supplier_id          = req.query.supplier_id          as string | undefined;
  const destination_store_id = req.query.destination_store_id as string | undefined;
  const statusRaw            = req.query.status               as string | undefined;

  // Valider que le statut est un membre de l'enum si fourni
  let status: PurchaseOrderStatus | undefined;
  if (statusRaw) {
    const valid = Object.values(PurchaseOrderStatus) as string[];
    if (!valid.includes(statusRaw)) {
      res.status(400).json({
        success: false,
        message: `Statut invalide. Valeurs acceptées : ${valid.join(', ')}.`,
      });
      return;
    }
    status = statusRaw as PurchaseOrderStatus;
  }

  try {
    const orders = await orderService.getPurchaseOrders({
      supplier_id,
      destination_store_id,
      status,
    });

    res.status(200).json({ success: true, orders });
  } catch (error) {
    console.error('Erreur lors de la récupération des commandes :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * GET /api/purchase-orders/:id
 *
 * Retourne une commande par son UUID.
 *
 * Params   : id — UUID de la commande
 * Réponse 200 : { success: true, order: PurchaseOrderRow }
 * Réponse 404 : { success: false, message } si introuvable
 */
export async function getPurchaseOrderById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  try {
    const order = await orderService.getPurchaseOrderById(id);
    res.status(200).json({ success: true, order });
  } catch (error) {
    if (error instanceof Error && error.message === 'ORDER_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Commande introuvable.' });
      return;
    }
    console.error('Erreur lors de la récupération de la commande :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * POST /api/purchase-orders
 *
 * Crée une nouvelle commande fournisseur.
 *
 * Body attendu : { supplier_id, destination_store_id, notes?, expected_at?, items[] }
 * Réponse 201  : { success: true, message, order: PurchaseOrderRow }
 * Réponse 400  : { success: false, message, errors: string[] } si Zod échoue
 * Réponse 404  : { success: false, message } si fournisseur ou produit introuvable
 *
 * Sécurité : ordered_by_id = req.user!.userId (jamais depuis le body).
 */
export async function createPurchaseOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parseResult = createPurchaseOrderSchema.safeParse(req.body);
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

    const order = await orderService.createPurchaseOrder(
      parseResult.data,
      actorId,
      actorName,
      storeId,
      storeName,
      ip,
    );

    res.status(201).json({
      success: true,
      message: `La commande "${order.reference}" a été créée avec succès.`,
      order,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'SUPPLIER_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Fournisseur introuvable ou inactif.' });
      return;
    }
    if (error instanceof Error && error.message === 'STORE_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Magasin de destination introuvable.' });
      return;
    }
    if (error instanceof Error && error.message === 'SUPPLIER_PRODUCT_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Un ou plusieurs produits fournisseur sont introuvables ou n\'appartiennent pas à ce fournisseur.',
      });
      return;
    }

    console.error('Erreur lors de la création de la commande :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * PUT /api/purchase-orders/:id
 *
 * Met à jour les champs modifiables d'une commande DRAFT.
 * Le supplier_id est immuable et ne peut pas être modifié.
 *
 * Params  : id — UUID de la commande
 * Body    : { notes?, expected_at?, destination_store_id?, items? }
 *   - items : si fourni, remplace l'intégralité des lignes existantes (min 1 ligne).
 * Réponse 200 : { success: true, message, order: PurchaseOrderRow }
 * Réponse 400 : { success: false, message, errors: string[] }
 * Réponse 404 : { success: false, message } si commande, magasin ou produit introuvable
 * Réponse 422 : { success: false, message } si statut invalide
 */
export async function updatePurchaseOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  const parseResult = updatePurchaseOrderSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      message: 'Données invalides.',
      errors:  formatZodErrors(parseResult.error),
    });
    return;
  }

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

    const order = await orderService.updatePurchaseOrder(
      id,
      parseResult.data,
      actorId,
      actorName,
      storeId,
      storeName,
      ip,
    );

    res.status(200).json({
      success: true,
      message: `La commande "${order.reference}" a été mise à jour.`,
      order,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ORDER_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Commande introuvable.' });
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_STATUS_TRANSITION') {
      res.status(422).json({
        success: false,
        message: 'Seule une commande en statut DRAFT peut être modifiée.',
      });
      return;
    }
    if (error instanceof Error && error.message === 'STORE_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Magasin de destination introuvable.' });
      return;
    }
    if (error instanceof Error && error.message === 'SUPPLIER_PRODUCT_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Un ou plusieurs produits fournisseur sont introuvables ou n\'appartiennent pas à ce fournisseur.',
      });
      return;
    }

    console.error('Erreur lors de la mise à jour de la commande :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * PATCH /api/purchase-orders/:id/send
 *
 * Passe une commande DRAFT au statut SENT.
 *
 * Params   : id — UUID de la commande
 * Réponse 200 : { success: true, message, order: PurchaseOrderRow }
 * Réponse 404 : { success: false, message } si introuvable
 * Réponse 422 : { success: false, message } si statut invalide
 */
export async function sendPurchaseOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const order = await orderService.sendPurchaseOrder(id, actorId, actorName, storeId, storeName, ip);

    res.status(200).json({
      success: true,
      message: `La commande "${order.reference}" a été envoyée au fournisseur.`,
      order,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ORDER_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Commande introuvable.' });
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_STATUS_TRANSITION') {
      res.status(422).json({
        success: false,
        message: 'Seule une commande en statut DRAFT peut être envoyée.',
      });
      return;
    }
    if (error instanceof Error && error.message === 'SUPPLIER_INACTIVE') {
      res.status(422).json({
        success: false,
        message: 'Le fournisseur de cette commande a été désactivé. Impossible de l\'envoyer.',
      });
      return;
    }
    if (error instanceof Error && error.message === 'INACTIVE_ORDER_ITEMS') {
      const items = (error as Error & { items: string[] }).items;
      const list  = items.join(', ');
      res.status(422).json({
        success: false,
        message: `Impossible d'envoyer la commande : ${items.length} ligne(s) référencent un produit ou un catalogue fournisseur désactivé (${list}).`,
      });
      return;
    }

    console.error('Erreur lors de l\'envoi de la commande :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * PATCH /api/purchase-orders/:id/close
 *
 * Clôture définitivement une commande PARTIALLY_RECEIVED (→ RECEIVED).
 * Accessible aux SA, Administrateurs et Managers Magasin.
 *
 * Params   : id — UUID de la commande
 * Réponse 200 : { success: true, message, order: PurchaseOrderRow }
 * Réponse 404 : { success: false, message } si introuvable
 * Réponse 422 : { success: false, message } si statut invalide
 */
export async function closePurchaseOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const order = await orderService.closePurchaseOrder(id, actorId, actorName, storeId, storeName, ip);

    res.status(200).json({
      success: true,
      message: `La commande "${order.reference}" a été clôturée définitivement.`,
      order,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ORDER_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Commande introuvable.' });
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_STATUS_TRANSITION') {
      res.status(422).json({
        success: false,
        message: 'Seule une commande partiellement reçue peut être clôturée manuellement.',
      });
      return;
    }
    console.error('Erreur lors de la clôture de la commande :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * PATCH /api/purchase-orders/:id/cancel
 *
 * Annule une commande en statut DRAFT ou SENT.
 * Réservé aux Super Administrateurs (middleware requireRole sur le routeur).
 *
 * Params   : id — UUID de la commande
 * Réponse 200 : { success: true, message, order: PurchaseOrderRow }
 * Réponse 404 : { success: false, message } si introuvable
 * Réponse 422 : { success: false, message } si statut invalide
 */
export async function cancelPurchaseOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const order = await orderService.cancelPurchaseOrder(id, actorId, actorName, storeId, storeName, ip);

    res.status(200).json({
      success: true,
      message: `La commande "${order.reference}" a été annulée.`,
      order,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ORDER_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Commande introuvable.' });
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_STATUS_TRANSITION') {
      res.status(422).json({
        success: false,
        message: 'Seule une commande en statut DRAFT ou SENT peut être annulée.',
      });
      return;
    }

    console.error('Erreur lors de l\'annulation de la commande :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}
