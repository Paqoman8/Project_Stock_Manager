// src/controllers/supplierInvoiceController.ts
//
// Handlers HTTP pour la gestion des factures fournisseurs (SupplierInvoice).
//
// Validation des entrées : Zod inline.
// Logique métier : déléguée à supplier_invoice.service.ts.

import { Response } from 'express';
import { z, ZodError } from 'zod';
import { InvoiceStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { resolveActorName, resolveStoreName } from '../services/audit.service';
import * as invoiceService from '../services/supplier_invoice.service';

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function extractIp(req: AuthenticatedRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim() || (req.ip ?? '');
  }
  return req.ip ?? '';
}

function formatZodErrors(err: ZodError): string[] {
  return err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

const createInvoiceSchema = z.object({
  order_id:    z.string().uuid('order_id doit être un UUID valide'),
  invoice_ref: z.string().min(1).optional(),
  amount:      z.number().positive('Le montant doit être positif'),
  due_at:      z.string().datetime({ offset: true }).optional(),
  notes:       z.string().optional(),
});

const updateInvoiceSchema = z.object({
  invoice_ref: z.string().min(1).optional(),
  amount:      z.number().positive('Le montant doit être positif').optional(),
  due_at:      z.string().datetime({ offset: true }).optional(),
  notes:       z.string().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Au moins un champ doit être fourni.' },
);

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/invoices
 *
 * Retourne la liste des factures avec filtres optionnels.
 * Query params : ?status=PENDING|PAID|OVERDUE|DISPUTED  &supplier_id=uuid
 *
 * Réponse 200 : { success: true, invoices: SupplierInvoiceRow[] }
 */
export async function getInvoices(req: AuthenticatedRequest, res: Response): Promise<void> {
  const status      = req.query.status as InvoiceStatus | undefined;
  const supplier_id = req.query.supplier_id as string | undefined;

  try {
    const invoices = await invoiceService.getInvoices({ status, supplier_id });
    res.status(200).json({ success: true, invoices });
  } catch (error) {
    console.error('Erreur lors de la récupération des factures :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * GET /api/invoices/:id
 *
 * Réponse 200 : { success: true, invoice: SupplierInvoiceRow }
 * Réponse 404 : { success: false, message }
 */
export async function getInvoiceById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  try {
    const invoice = await invoiceService.getInvoiceById(id);
    res.status(200).json({ success: true, invoice });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVOICE_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Facture introuvable.' });
      return;
    }
    console.error('Erreur lors de la récupération de la facture :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * POST /api/invoices
 *
 * Body : { order_id, invoice_ref?, amount, due_at?, notes? }
 * Réponse 201 : { success: true, message, invoice }
 * Réponse 400 : validation Zod
 * Réponse 404 : commande introuvable
 * Réponse 409 : facture déjà existante pour cette commande
 * Réponse 422 : statut de commande invalide
 */
export async function createInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parseResult = createInvoiceSchema.safeParse(req.body);
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

    const invoice = await invoiceService.createInvoice(
      parseResult.data,
      actorId,
      actorName,
      storeId,
      storeName,
      ip,
    );

    res.status(201).json({
      success: true,
      message: `La facture a été créée avec succès.`,
      invoice,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ORDER_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Commande introuvable.' });
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_ORDER_STATUS') {
      res.status(422).json({
        success: false,
        message: 'Une facture ne peut être créée que pour une commande en statut SENT, PARTIALLY_RECEIVED ou RECEIVED.',
      });
      return;
    }
    if (error instanceof Error && error.message === 'INVOICE_ALREADY_EXISTS') {
      res.status(409).json({
        success: false,
        message: 'Une facture existe déjà pour cette commande.',
      });
      return;
    }
    console.error('Erreur lors de la création de la facture :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * PATCH /api/invoices/:id
 *
 * Body : { invoice_ref?, amount?, due_at?, notes? }
 * Réponse 200 : { success: true, message, invoice }
 * Réponse 422 : facture payée (immuable)
 */
export async function updateInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id          = req.params.id as string;
  const parseResult = updateInvoiceSchema.safeParse(req.body);
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

    const invoice = await invoiceService.updateInvoice(
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
      message: 'La facture a été mise à jour.',
      invoice,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVOICE_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Facture introuvable.' });
      return;
    }
    if (error instanceof Error && error.message === 'INVOICE_PAID') {
      res.status(422).json({
        success: false,
        message: 'Une facture déjà payée ne peut pas être modifiée.',
      });
      return;
    }
    console.error('Erreur lors de la mise à jour de la facture :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * PATCH /api/invoices/:id/pay
 *
 * Marque la facture comme payée (PAID). Enregistre paid_at.
 * Statuts autorisés : PENDING, DISPUTED, OVERDUE.
 */
export async function payInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const invoice = await invoiceService.payInvoice(id, actorId, actorName, storeId, storeName, ip);

    res.status(200).json({
      success: true,
      message: 'La facture a été marquée comme payée.',
      invoice,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVOICE_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Facture introuvable.' });
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_STATUS_TRANSITION') {
      res.status(422).json({
        success: false,
        message: 'Cette facture ne peut pas être marquée comme payée depuis son statut actuel.',
      });
      return;
    }
    console.error('Erreur lors du paiement de la facture :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * PATCH /api/invoices/:id/dispute
 *
 * Marque la facture comme disputée (DISPUTED).
 * Statuts autorisés : PENDING, OVERDUE.
 */
export async function disputeInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const invoice = await invoiceService.disputeInvoice(id, actorId, actorName, storeId, storeName, ip);

    res.status(200).json({
      success: true,
      message: 'La facture a été marquée comme disputée.',
      invoice,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVOICE_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Facture introuvable.' });
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_STATUS_TRANSITION') {
      res.status(422).json({
        success: false,
        message: 'Cette facture ne peut pas être contestée depuis son statut actuel.',
      });
      return;
    }
    console.error('Erreur lors de la contestation de la facture :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/**
 * PATCH /api/invoices/:id/reopen
 *
 * Rouvre une facture DISPUTED ou OVERDUE en la repassant à PENDING.
 */
export async function reopenInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const invoice = await invoiceService.reopenInvoice(id, actorId, actorName, storeId, storeName, ip);

    res.status(200).json({
      success: true,
      message: 'La facture a été rouverte.',
      invoice,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVOICE_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Facture introuvable.' });
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_STATUS_TRANSITION') {
      res.status(422).json({
        success: false,
        message: 'Seule une facture DISPUTED ou OVERDUE peut être rouverte.',
      });
      return;
    }
    console.error('Erreur lors de la réouverture de la facture :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}
