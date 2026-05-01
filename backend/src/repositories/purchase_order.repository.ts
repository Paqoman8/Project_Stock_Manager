// src/repositories/purchase_order.repository.ts
//
// Couche d'accès aux données pour les commandes fournisseurs (PurchaseOrder).
//
// Responsabilités :
//   - CRUD Prisma pur — aucune logique métier ici
//   - Sélecteur partagé pour une forme de données constante
//   - Génération de référence séquentielle BC-YYYY-XXXX
//   - Transaction atomique pour la création (commande + lignes)

import { PurchaseOrderStatus } from '@prisma/client';
import { prisma } from '../config/database';

// ---------------------------------------------------------------------------
// Types exposés — contrat entre repository et service
// ---------------------------------------------------------------------------

/** Une ligne de commande fournisseur avec le détail du produit catalogue. */
export interface PurchaseOrderItemRow {
  id: string;
  order_id: string;
  supplier_product_id: string;
  ordered_qty: number;
  unit_price: string;    // Decimal Prisma — sérialisé en string par JSON.stringify
  supplier_product: {
    id: string;
    order_unit: string;
    units_per_order: number;
    product: { id: string; name: string; sku: string; unit: string };
  };
}

/** Une commande fournisseur complète telle que retournée par toutes les fonctions. */
export interface PurchaseOrderRow {
  id: string;
  reference: string;
  supplier_id: string;
  destination_store_id: string;
  ordered_by_id: string;
  status: PurchaseOrderStatus;
  notes: string | null;
  expected_at: Date | null;
  sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
  supplier: { id: string; name: string };
  destination_store: { id: string; name: string };
  ordered_by: { id: string; username: string };
  items: PurchaseOrderItemRow[];
}

/** Filtres acceptés par findAll. */
export interface PurchaseOrderFilters {
  supplier_id?: string;
  destination_store_id?: string;
  status?: PurchaseOrderStatus;
}

/** Données requises pour créer une commande fournisseur avec ses lignes. */
export interface CreatePurchaseOrderData {
  reference: string;
  supplier_id: string;
  destination_store_id: string;
  ordered_by_id: string;
  notes?: string;
  expected_at?: string;
  items: Array<{
    supplier_product_id: string;
    ordered_qty: number;
    unit_price: number;
  }>;
}

/** Données modifiables sur une commande en statut DRAFT. */
export interface UpdatePurchaseOrderData {
  notes?: string;
  expected_at?: string;
  destination_store_id?: string;
  items?: Array<{
    supplier_product_id: string;
    ordered_qty: number;
    unit_price: number;
  }>;
}

/** Données pour ajouter ou mettre à jour une ligne de commande. */
export interface OrderItemInput {
  supplier_product_id: string;
  ordered_qty: number;
  unit_price: number;
}

// ---------------------------------------------------------------------------
// Sélecteur Prisma partagé
// ---------------------------------------------------------------------------

const PURCHASE_ORDER_INCLUDE = {
  supplier:          { select: { id: true, name: true } },
  destination_store: { select: { id: true, name: true } },
  ordered_by:        { select: { id: true, username: true } },
  items: {
    include: {
      supplier_product: {
        select: {
          id:              true,
          order_unit:      true,
          units_per_order: true,
          product: { select: { id: true, name: true, sku: true, unit: true } },
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Fonctions du repository
// ---------------------------------------------------------------------------

/**
 * Retourne la liste des commandes fournisseurs avec filtres optionnels.
 * Triées de la plus récente à la plus ancienne.
 *
 * @param filters - { supplier_id?, destination_store_id?, status? }
 * @returns Tableau de PurchaseOrderRow, potentiellement vide
 */
export async function findAll(filters: PurchaseOrderFilters = {}): Promise<PurchaseOrderRow[]> {
  return prisma.purchaseOrder.findMany({
    where: {
      ...(filters.supplier_id          ? { supplier_id:          filters.supplier_id }          : {}),
      ...(filters.destination_store_id ? { destination_store_id: filters.destination_store_id } : {}),
      ...(filters.status               ? { status:               filters.status }               : {}),
    },
    include:  PURCHASE_ORDER_INCLUDE,
    orderBy:  { created_at: 'desc' },
  }) as unknown as PurchaseOrderRow[];
}

/**
 * Retourne une commande par son UUID, ou null si elle n'existe pas.
 *
 * @param id - UUID de la commande
 */
export async function findById(id: string): Promise<PurchaseOrderRow | null> {
  return prisma.purchaseOrder.findUnique({
    where:   { id },
    include: PURCHASE_ORDER_INCLUDE,
  }) as unknown as PurchaseOrderRow | null;
}

/**
 * Génère la prochaine référence séquentielle au format BC-YYYY-XXXXXX.
 *
 * Utilise un upsert atomique PostgreSQL sur la table `purchase_order_sequences`
 * pour garantir qu'aucun doublon ne peut être produit même sous charge concurrente.
 * L'opération INSERT ... ON CONFLICT DO UPDATE ... RETURNING est atomique nativement
 * par PostgreSQL — aucun verrou applicatif n'est nécessaire.
 *
 * @param year - Année sur 4 chiffres (ex : 2026)
 * @returns Référence formatée, ex : "BC-2026-000001"
 */
export async function getNextReference(year: number): Promise<string> {
  const rows = await prisma.$queryRaw<{ last_seq: bigint }[]>`
    INSERT INTO "purchase_order_sequences" ("year", "last_seq")
    VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE
      SET "last_seq" = "purchase_order_sequences"."last_seq" + 1
    RETURNING "last_seq"
  `;

  const seq = Number(rows[0].last_seq);
  return `BC-${year}-${String(seq).padStart(6, '0')}`;
}

/**
 * Crée une commande fournisseur et ses lignes dans une transaction atomique.
 * Si l'une des insertions échoue, toute la transaction est annulée.
 *
 * @param data - Données de la commande et de ses lignes
 * @returns La commande créée avec ses relations
 */
export async function create(data: CreatePurchaseOrderData): Promise<PurchaseOrderRow> {
  // La création imbriquée (commande + lignes) est atomique nativement par Prisma —
  // pas besoin de $transaction explicite, ce qui évite le conflit pg sur le pool.
  return prisma.purchaseOrder.create({
    data: {
      reference:            data.reference,
      supplier_id:          data.supplier_id,
      destination_store_id: data.destination_store_id,
      ordered_by_id:        data.ordered_by_id,
      notes:                data.notes     ?? null,
      expected_at:          data.expected_at ? new Date(data.expected_at) : null,
      items: {
        create: data.items.map((item) => ({
          supplier_product_id: item.supplier_product_id,
          ordered_qty:         item.ordered_qty,
          unit_price:          item.unit_price,
        })),
      },
    },
    include: PURCHASE_ORDER_INCLUDE,
  }) as unknown as PurchaseOrderRow;
}

/**
 * Met à jour les champs modifiables d'une commande (notes, expected_at,
 * destination_store_id, items). Quand items est fourni, les lignes existantes
 * sont supprimées et remplacées atomiquement par le nouveau jeu.
 * À appeler uniquement sur une commande en statut DRAFT (vérifié côté service).
 *
 * @param id   - UUID de la commande
 * @param data - Champs à modifier (tous optionnels)
 * @returns La commande mise à jour avec ses relations
 */
export async function update(id: string, data: UpdatePurchaseOrderData): Promise<PurchaseOrderRow> {
  const updateData: Record<string, unknown> = {};
  if (data.notes                !== undefined) updateData.notes                = data.notes;
  if (data.expected_at          !== undefined) updateData.expected_at          = data.expected_at ? new Date(data.expected_at) : null;
  if (data.destination_store_id !== undefined) updateData.destination_store_id = data.destination_store_id;

  if (data.items !== undefined) {
    return prisma.purchaseOrder.update({
      where: { id },
      data:  {
        ...updateData,
        items: {
          deleteMany: {},
          create: data.items.map((item) => ({
            supplier_product_id: item.supplier_product_id,
            ordered_qty:         item.ordered_qty,
            unit_price:          item.unit_price,
          })),
        },
      },
      include: PURCHASE_ORDER_INCLUDE,
    }) as unknown as PurchaseOrderRow;
  }

  return prisma.purchaseOrder.update({
    where:   { id },
    data:    updateData,
    include: PURCHASE_ORDER_INCLUDE,
  }) as unknown as PurchaseOrderRow;
}

/**
 * Met à jour le statut d'une commande.
 * Passe sent_at à now() si opts.sent_at est vrai.
 *
 * @param id     - UUID de la commande
 * @param status - Nouveau statut
 * @param opts   - Options supplémentaires (sent_at pour SENT)
 */
export async function updateStatus(
  id: string,
  status: PurchaseOrderStatus,
  opts: { sent_at?: boolean } = {},
): Promise<PurchaseOrderRow> {
  return prisma.purchaseOrder.update({
    where:   { id },
    data:    {
      status,
      ...(opts.sent_at ? { sent_at: new Date() } : {}),
    },
    include: PURCHASE_ORDER_INCLUDE,
  }) as unknown as PurchaseOrderRow;
}

/**
 * Ajoute une ligne à une commande existante.
 * À appeler uniquement sur une commande en statut DRAFT (vérifié côté service).
 *
 * @param orderId - UUID de la commande
 * @param item    - Données de la nouvelle ligne
 */
export async function addItem(orderId: string, item: OrderItemInput): Promise<PurchaseOrderRow> {
  await prisma.purchaseOrderItem.create({
    data: {
      order_id:            orderId,
      supplier_product_id: item.supplier_product_id,
      ordered_qty:         item.ordered_qty,
      unit_price:          item.unit_price,
    },
  });

  return findById(orderId) as Promise<PurchaseOrderRow>;
}

/**
 * Supprime une ligne de commande par son UUID.
 * À appeler uniquement sur une commande en statut DRAFT (vérifié côté service).
 *
 * @param itemId - UUID de la ligne à supprimer
 */
export async function removeItem(itemId: string): Promise<void> {
  await prisma.purchaseOrderItem.delete({ where: { id: itemId } });
}

/**
 * Met à jour la quantité et/ou le prix unitaire d'une ligne de commande.
 * À appeler uniquement sur une commande en statut DRAFT (vérifié côté service).
 *
 * @param itemId - UUID de la ligne à modifier
 * @param data   - { ordered_qty?, unit_price? }
 */
export async function updateItem(
  itemId: string,
  data: { ordered_qty?: number; unit_price?: number },
): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (data.ordered_qty !== undefined) updateData.ordered_qty = data.ordered_qty;
  if (data.unit_price  !== undefined) updateData.unit_price  = data.unit_price;

  await prisma.purchaseOrderItem.update({
    where: { id: itemId },
    data:  updateData,
  });
}
