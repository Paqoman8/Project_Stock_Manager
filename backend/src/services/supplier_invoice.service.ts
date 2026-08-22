// src/services/supplier_invoice.service.ts
//
// Service de gestion des factures fournisseurs (SupplierInvoice).
//
// Responsabilités :
//   - Validation métier : existence des entités, cohérence des statuts
//   - Cycle de vie : PENDING → PAID / DISPUTED → PENDING (reopen) → PAID
//   - Journalisation de chaque action métier via audit.service (non-bloquant)

import { AuditAction, InvoiceStatus, PurchaseOrderStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { logAction } from './audit.service';
import * as invoiceRepo from '../repositories/supplier_invoice.repository';
import type {
  SupplierInvoiceRow,
  InvoiceFilters,
  CreateInvoiceData,
  UpdateInvoiceData,
} from '../repositories/supplier_invoice.repository';

// Ré-export du type pour les controllers
export type { SupplierInvoiceRow };

// ---------------------------------------------------------------------------
// Fonctions du service
// ---------------------------------------------------------------------------

/**
 * Retourne la liste des factures avec filtres optionnels.
 */
export async function getInvoices(orgId: string, filters: InvoiceFilters = {}): Promise<SupplierInvoiceRow[]> {
  return invoiceRepo.findAll(orgId, filters);
}

/**
 * Retourne une facture par son UUID.
 *
 * @throws Error('INVOICE_NOT_FOUND') si introuvable
 */
export async function getInvoiceById(orgId: string, id: string): Promise<SupplierInvoiceRow> {
  const invoice = await invoiceRepo.findById(id, orgId);
  if (!invoice) throw new Error('INVOICE_NOT_FOUND');
  return invoice;
}

/**
 * Crée une facture pour une commande fournisseur.
 *
 * Règles métier :
 *   - La commande doit exister et avoir statut SENT, PARTIALLY_RECEIVED ou RECEIVED.
 *   - Une seule facture par commande (contrainte unique DB).
 *
 * @throws Error('ORDER_NOT_FOUND')         si la commande n'existe pas
 * @throws Error('INVALID_ORDER_STATUS')    si le statut de la commande ne permet pas la facturation
 * @throws Error('INVOICE_ALREADY_EXISTS')  si une facture existe déjà pour cette commande
 */
export async function createInvoice(
  orgId: string,
  data: CreateInvoiceData,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<SupplierInvoiceRow> {
  // Vérification de la commande
  const order = await prisma.purchaseOrder.findUnique({
    where:  { id: data.order_id },
    select: { id: true, reference: true, status: true, destination_store_id: true },
  });

  if (!order) throw new Error('ORDER_NOT_FOUND');

  const allowedStatuses: PurchaseOrderStatus[] = [
    PurchaseOrderStatus.SENT,
    PurchaseOrderStatus.PARTIALLY_RECEIVED,
    PurchaseOrderStatus.RECEIVED,
  ];
  if (!allowedStatuses.includes(order.status)) {
    throw new Error('INVALID_ORDER_STATUS');
  }

  // Tentative de création — Prisma lèvera P2002 si la facture existe déjà
  try {
    const invoice = await invoiceRepo.create(data);

    // Audit — non-bloquant
    try {
      await logAction({
        actorId,
        actorName,
        action:     AuditAction.INVOICE_CREATED,
        targetType: 'SUPPLIER_INVOICE',
        targetId:   invoice.id,
        targetName: invoice.invoice_ref ?? invoice.id,
        orgId,
        storeId,
        storeName,
        ipAddress,
        metadata: { order_reference: order.reference },
      });
    } catch (err) {
      console.error('[audit] Échec du log INVOICE_CREATED :', err);
    }

    return invoice;
  } catch (err: unknown) {
    // Contrainte unique Prisma P2002 — facture déjà existante pour cette commande
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      throw new Error('INVOICE_ALREADY_EXISTS');
    }
    throw err;
  }
}

/**
 * Met à jour les champs modifiables d'une facture (invoice_ref, amount, due_at, notes).
 * Interdit sur une facture PAID.
 *
 * @throws Error('INVOICE_NOT_FOUND')   si introuvable
 * @throws Error('INVOICE_PAID')        si la facture est déjà payée (immuable)
 */
export async function updateInvoice(
  orgId: string,
  id: string,
  data: UpdateInvoiceData,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<SupplierInvoiceRow> {
  const existing = await invoiceRepo.findById(id, orgId);
  if (!existing) throw new Error('INVOICE_NOT_FOUND');
  if (existing.status === InvoiceStatus.PAID) throw new Error('INVOICE_PAID');

  const invoice = await invoiceRepo.update(id, data);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.INVOICE_UPDATED,
      targetType: 'SUPPLIER_INVOICE',
      targetId:   invoice.id,
      targetName: invoice.invoice_ref ?? invoice.id,
      orgId,
      storeId,
      storeName,
      ipAddress,
      metadata: { updated_fields: Object.keys(data) },
    });
  } catch (err) {
    console.error('[audit] Échec du log INVOICE_UPDATED :', err);
  }

  return invoice;
}

/**
 * Marque une facture comme payée.
 * Statuts autorisés : PENDING, DISPUTED, OVERDUE.
 *
 * @throws Error('INVOICE_NOT_FOUND')           si introuvable
 * @throws Error('INVALID_STATUS_TRANSITION')   si le statut ne permet pas le paiement
 */
export async function payInvoice(
  orgId: string,
  id: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<SupplierInvoiceRow> {
  const existing = await invoiceRepo.findById(id, orgId);
  if (!existing) throw new Error('INVOICE_NOT_FOUND');

  const payableStatuses: InvoiceStatus[] = [
    InvoiceStatus.PENDING,
    InvoiceStatus.DISPUTED,
    InvoiceStatus.OVERDUE,
  ];
  if (!payableStatuses.includes(existing.status)) {
    throw new Error('INVALID_STATUS_TRANSITION');
  }

  const invoice = await invoiceRepo.updateStatus(id, InvoiceStatus.PAID, { paid_at: true });

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.INVOICE_PAID,
      targetType: 'SUPPLIER_INVOICE',
      targetId:   invoice.id,
      targetName: invoice.invoice_ref ?? invoice.id,
      orgId,
      storeId,
      storeName,
      ipAddress,
      metadata: { order_reference: invoice.order.reference },
    });
  } catch (err) {
    console.error('[audit] Échec du log INVOICE_PAID :', err);
  }

  return invoice;
}

/**
 * Marque une facture comme disputée.
 * Statuts autorisés : PENDING, OVERDUE.
 *
 * @throws Error('INVOICE_NOT_FOUND')           si introuvable
 * @throws Error('INVALID_STATUS_TRANSITION')   si le statut ne permet pas la contestation
 */
export async function disputeInvoice(
  orgId: string,
  id: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<SupplierInvoiceRow> {
  const existing = await invoiceRepo.findById(id, orgId);
  if (!existing) throw new Error('INVOICE_NOT_FOUND');

  const disputableStatuses: InvoiceStatus[] = [
    InvoiceStatus.PENDING,
    InvoiceStatus.OVERDUE,
  ];
  if (!disputableStatuses.includes(existing.status)) {
    throw new Error('INVALID_STATUS_TRANSITION');
  }

  const invoice = await invoiceRepo.updateStatus(id, InvoiceStatus.DISPUTED);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.INVOICE_DISPUTED,
      targetType: 'SUPPLIER_INVOICE',
      targetId:   invoice.id,
      targetName: invoice.invoice_ref ?? invoice.id,
      orgId,
      storeId,
      storeName,
      ipAddress,
      metadata: { order_reference: invoice.order.reference },
    });
  } catch (err) {
    console.error('[audit] Échec du log INVOICE_DISPUTED :', err);
  }

  return invoice;
}

/**
 * Rouvre une facture disputée ou en retard en la repassant à PENDING.
 * Statuts autorisés : DISPUTED, OVERDUE.
 *
 * @throws Error('INVOICE_NOT_FOUND')           si introuvable
 * @throws Error('INVALID_STATUS_TRANSITION')   si le statut ne permet pas la réouverture
 */
export async function reopenInvoice(
  orgId: string,
  id: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<SupplierInvoiceRow> {
  const existing = await invoiceRepo.findById(id, orgId);
  if (!existing) throw new Error('INVOICE_NOT_FOUND');

  const reopenableStatuses: InvoiceStatus[] = [
    InvoiceStatus.DISPUTED,
    InvoiceStatus.OVERDUE,
  ];
  if (!reopenableStatuses.includes(existing.status)) {
    throw new Error('INVALID_STATUS_TRANSITION');
  }

  const invoice = await invoiceRepo.updateStatus(id, InvoiceStatus.PENDING);

  // Audit — non-bloquant (INVOICE_UPDATED avec metadata action: 'reopen')
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.INVOICE_UPDATED,
      targetType: 'SUPPLIER_INVOICE',
      targetId:   invoice.id,
      targetName: invoice.invoice_ref ?? invoice.id,
      orgId,
      storeId,
      storeName,
      ipAddress,
      metadata: { action: 'reopen', previous_status: existing.status },
    });
  } catch (err) {
    console.error('[audit] Échec du log INVOICE_UPDATED (reopen) :', err);
  }

  return invoice;
}
