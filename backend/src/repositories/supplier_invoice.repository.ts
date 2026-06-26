// src/repositories/supplier_invoice.repository.ts
//
// Couche d'accès aux données pour les factures fournisseurs (SupplierInvoice).
//
// Responsabilités :
//   - CRUD Prisma pur — aucune logique métier ici
//   - Sélecteur partagé pour une forme de données constante

import { InvoiceStatus } from '@prisma/client';
import { prisma } from '../config/database';

// ---------------------------------------------------------------------------
// Types exposés — contrat entre repository et service
// ---------------------------------------------------------------------------

/** Une facture fournisseur complète telle que retournée par toutes les fonctions. */
export interface SupplierInvoiceRow {
  id:          string;
  order_id:    string;
  invoice_ref: string | null;
  amount:      string;           // Decimal Prisma — sérialisé en string par JSON.stringify
  status:      InvoiceStatus;
  issued_at:   Date;
  due_at:      Date | null;
  paid_at:     Date | null;
  notes:       string | null;
  order: {
    id:                string;
    reference:         string;
    supplier:          { id: string; name: string };
    destination_store: { id: string; name: string };
    items?: Array<{
      id:          string;
      ordered_qty: number;
      unit_price:  string;
      supplier_product: {
        product:          { id: string; name: string; sku: string; unit: string };
        packaging_format: { label: string; units_per_package: number };
      };
    }>;
  };
}

/** Filtres acceptés par findAll. */
export interface InvoiceFilters {
  status?:      InvoiceStatus;
  supplier_id?: string;
}

/** Données requises pour créer une facture. */
export interface CreateInvoiceData {
  order_id:    string;
  invoice_ref?: string;
  amount:      number;
  due_at?:     string;
  notes?:      string;
}

/** Données modifiables sur une facture. */
export interface UpdateInvoiceData {
  invoice_ref?: string;
  amount?:      number;
  due_at?:      string;
  notes?:       string;
}

// ---------------------------------------------------------------------------
// Sélecteur Prisma partagé
// ---------------------------------------------------------------------------

const INVOICE_INCLUDE = {
  order: {
    select: {
      id:        true,
      reference: true,
      supplier:          { select: { id: true, name: true } },
      destination_store: { select: { id: true, name: true } },
    },
  },
} as const;

// Include enrichi pour le détail — inclut les lignes de commande
const INVOICE_DETAIL_INCLUDE = {
  order: {
    select: {
      id:        true,
      reference: true,
      supplier:          { select: { id: true, name: true } },
      destination_store: { select: { id: true, name: true } },
      items: {
        include: {
          supplier_product: {
            select: {
              product:          { select: { id: true, name: true, sku: true, unit: true } },
              packaging_format: { select: { label: true, units_per_package: true } },
            },
          },
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Fonctions du repository
// ---------------------------------------------------------------------------

/**
 * Retourne la liste de toutes les factures avec filtres optionnels.
 * Triées de la plus récente à la plus ancienne (issued_at desc).
 */
export async function findAll(filters: InvoiceFilters = {}): Promise<SupplierInvoiceRow[]> {
  return prisma.supplierInvoice.findMany({
    where: {
      ...(filters.status      ? { status: filters.status }                                   : {}),
      ...(filters.supplier_id ? { order: { supplier_id: filters.supplier_id } }             : {}),
    },
    include: INVOICE_INCLUDE,
    orderBy: { issued_at: 'desc' },
  }) as unknown as SupplierInvoiceRow[];
}

/**
 * Retourne une facture par son UUID avec ses lignes de commande, ou null si elle n'existe pas.
 */
export async function findById(id: string): Promise<SupplierInvoiceRow | null> {
  return prisma.supplierInvoice.findUnique({
    where:   { id },
    include: INVOICE_DETAIL_INCLUDE,
  }) as unknown as SupplierInvoiceRow | null;
}

/**
 * Retourne la facture liée à une commande, ou null si aucune n'existe.
 */
export async function findByOrderId(orderId: string): Promise<SupplierInvoiceRow | null> {
  return prisma.supplierInvoice.findUnique({
    where:   { order_id: orderId },
    include: INVOICE_INCLUDE,
  }) as unknown as SupplierInvoiceRow | null;
}

/**
 * Crée une facture fournisseur.
 */
export async function create(data: CreateInvoiceData): Promise<SupplierInvoiceRow> {
  return prisma.supplierInvoice.create({
    data: {
      order_id:    data.order_id,
      invoice_ref: data.invoice_ref ?? null,
      amount:      data.amount,
      due_at:      data.due_at ? new Date(data.due_at) : null,
      notes:       data.notes  ?? null,
    },
    include: INVOICE_INCLUDE,
  }) as unknown as SupplierInvoiceRow;
}

/**
 * Met à jour les champs modifiables d'une facture.
 */
export async function update(id: string, data: UpdateInvoiceData): Promise<SupplierInvoiceRow> {
  const updateData: Record<string, unknown> = {};
  if (data.invoice_ref !== undefined) updateData.invoice_ref = data.invoice_ref;
  if (data.amount      !== undefined) updateData.amount      = data.amount;
  if (data.due_at      !== undefined) updateData.due_at      = data.due_at ? new Date(data.due_at) : null;
  if (data.notes       !== undefined) updateData.notes       = data.notes;

  return prisma.supplierInvoice.update({
    where:   { id },
    data:    updateData,
    include: INVOICE_INCLUDE,
  }) as unknown as SupplierInvoiceRow;
}

/**
 * Met à jour le statut d'une facture.
 * Passe paid_at à now() si opts.paid_at est vrai.
 */
export async function updateStatus(
  id: string,
  status: InvoiceStatus,
  opts: { paid_at?: boolean } = {},
): Promise<SupplierInvoiceRow> {
  return prisma.supplierInvoice.update({
    where:   { id },
    data:    {
      status,
      ...(opts.paid_at ? { paid_at: new Date() } : {}),
    },
    include: INVOICE_INCLUDE,
  }) as unknown as SupplierInvoiceRow;
}
