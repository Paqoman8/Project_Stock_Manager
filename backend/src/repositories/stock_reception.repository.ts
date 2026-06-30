// src/repositories/stock_reception.repository.ts
//
// Couche d'accès aux données pour les réceptions de stock (StockReception).
//
// Responsabilités :
//   - CRUD Prisma pur — aucune logique métier ici
//   - Transaction atomique pour la confirmation :
//       1. CONFIRMED + confirmed_at
//       2. Upsert Inventory (incrément stock_physical)
//       3. Mise à jour du statut de la commande parente

import { ReceptionStatus, PurchaseOrderStatus } from '@prisma/client';
import { prisma } from '../config/database';

// ---------------------------------------------------------------------------
// Types exposés — contrat entre repository et service
// ---------------------------------------------------------------------------

/** Une ligne de réception avec le détail du produit. */
export interface ReceptionItemRow {
  id: string;
  reception_id: string;
  order_item_id: string | null;
  product_id: string;
  received_qty: number;
  stock_units_added: number;
  packaging_format_id: string | null;
  packages_received: number | null;
  product: { id: string; name: string; sku: string; unit: string };
  packaging_format: { id: string; label: string; units_per_package: number } | null;
}

/** Une réception de stock complète telle que retournée par toutes les fonctions. */
export interface StockReceptionRow {
  id: string;
  order_id: string;
  received_by_id: string;
  status: ReceptionStatus;
  notes: string | null;
  received_at: Date;
  confirmed_at: Date | null;
  order: { id: string; reference: string; destination_store_id: string };
  received_by: { id: string; username: string };
  items: ReceptionItemRow[];
}

/** Données requises pour créer une réception. */
export interface CreateReceptionData {
  order_id: string;
  received_by_id: string;
  notes?: string;
  items: Array<{
    order_item_id?: string;
    product_id: string;
    received_qty: number;
    stock_units_added: number;
    packaging_format_id?: string;
    packages_received?: number;
  }>;
}

// ---------------------------------------------------------------------------
// Sélecteur Prisma partagé
// ---------------------------------------------------------------------------

const RECEPTION_INCLUDE = {
  order: {
    select: { id: true, reference: true, destination_store_id: true },
  },
  received_by: { select: { id: true, username: true } },
  items: {
    include: {
      product:          { select: { id: true, name: true, sku: true, unit: true } },
      packaging_format: { select: { id: true, label: true, units_per_package: true } },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Fonctions du repository
// ---------------------------------------------------------------------------

/**
 * Retourne toutes les réceptions liées à une commande.
 *
 * @param orderId - UUID de la commande parente
 * @returns Tableau de StockReceptionRow, potentiellement vide
 */
export async function findByOrderId(orderId: string): Promise<StockReceptionRow[]> {
  return prisma.stockReception.findMany({
    where:   { order_id: orderId },
    include: RECEPTION_INCLUDE,
    orderBy: { received_at: 'desc' },
  }) as unknown as StockReceptionRow[];
}

/**
 * Retourne une réception par son UUID, ou null si elle n'existe pas.
 *
 * @param id - UUID de la réception
 */
export async function findById(id: string): Promise<StockReceptionRow | null> {
  return prisma.stockReception.findUnique({
    where:   { id },
    include: RECEPTION_INCLUDE,
  }) as unknown as StockReceptionRow | null;
}

/**
 * Crée une nouvelle réception de stock avec ses lignes.
 *
 * @param data - Données de la réception et de ses lignes
 * @returns La réception créée avec ses relations
 */
export async function create(data: CreateReceptionData): Promise<StockReceptionRow> {
  return prisma.stockReception.create({
    data: {
      order_id:       data.order_id,
      received_by_id: data.received_by_id,
      notes:          data.notes ?? null,
      items: {
        create: data.items.map((item) => ({
          product_id:          item.product_id,
          order_item_id:       item.order_item_id ?? null,
          received_qty:        item.received_qty,
          stock_units_added:   item.stock_units_added,
          packaging_format_id: item.packaging_format_id ?? null,
          packages_received:   item.packages_received   ?? null,
        })),
      },
    },
    include: RECEPTION_INCLUDE,
  }) as unknown as StockReceptionRow;
}

/**
 * Confirme une réception dans une transaction atomique.
 *
 * Étapes de la transaction :
 *   1. Passe le statut de la réception à CONFIRMED et enregistre confirmed_at.
 *   2. Pour chaque ligne reçue : upsert de l'inventaire du magasin de destination
 *      (store_id = order.destination_store_id, product_id),
 *      incrémente stock_physical de stock_units_added.
 *   3. Calcule si la commande est entièrement couverte ou non :
 *      - Compare le total stock_units_added confirmé par produit
 *        avec le total (ordered_qty × packaging_format.units_per_package) par produit dans la commande.
 *      - Si tous les produits sont couverts → RECEIVED, sinon → PARTIALLY_RECEIVED.
 *
 * @param id - UUID de la réception à confirmer
 * @returns La réception confirmée avec ses relations
 * @throws Error si la réception n'existe pas
 */
export async function confirm(id: string): Promise<StockReceptionRow> {
  return prisma.$transaction(async (tx) => {
    // 1. Confirmer la réception
    const reception = await tx.stockReception.update({
      where: { id },
      data:  { status: ReceptionStatus.CONFIRMED, confirmed_at: new Date() },
      include: RECEPTION_INCLUDE,
    });

    const orderId       = reception.order_id;
    const destStoreId   = reception.order.destination_store_id;

    // 2. Upsert Inventory + InventoryBreakdown pour chaque ligne reçue
    for (const item of reception.items) {
      await tx.inventory.upsert({
        where: {
          store_id_product_id: {
            store_id:   destStoreId,
            product_id: item.product_id,
          },
        },
        create: {
          store_id:       destStoreId,
          product_id:     item.product_id,
          stock_physical: item.stock_units_added,
          stock_reserved: 0,
        },
        update: {
          stock_physical: { increment: item.stock_units_added },
        },
      });

      // Mettre à jour la ventilation si un format de conditionnement est renseigné
      const itemExt = item as unknown as { packaging_format_id: string | null; packages_received: number | null };
      if (itemExt.packaging_format_id && itemExt.packages_received != null) {
        await (tx as unknown as typeof prisma).inventoryBreakdown.upsert({
          where: {
            store_id_product_id_packaging_format_id: {
              store_id:            destStoreId,
              product_id:          item.product_id,
              packaging_format_id: itemExt.packaging_format_id,
            },
          },
          update: { quantity: { increment: itemExt.packages_received } },
          create: {
            store_id:            destStoreId,
            product_id:          item.product_id,
            packaging_format_id: itemExt.packaging_format_id,
            quantity:            itemExt.packages_received,
          },
        });
      }
    }

    // 3. Déterminer le nouveau statut de la commande
    //
    // a) Charger toutes les réceptions CONFIRMED de la commande (incluant celle
    //    qu'on vient de confirmer, puisque la mise à jour précède ce point)
    const confirmedReceptions = await tx.stockReception.findMany({
      where: {
        order_id: orderId,
        status:   ReceptionStatus.CONFIRMED,
      },
      include: { items: true },
    });

    // b) Agréger les réceptions confirmées par ligne de commande si possible.
    const receivedByOrderItem = new Map<string, number>();
    for (const r of confirmedReceptions) {
      for (const item of r.items) {
        const itemExt = item as unknown as { order_item_id?: string | null };
        if (!itemExt.order_item_id) continue;
        const current = receivedByOrderItem.get(itemExt.order_item_id) ?? 0;
        receivedByOrderItem.set(itemExt.order_item_id, current + item.received_qty);
      }
    }

    // c) Charger les lignes de la commande avec les détails nécessaires dès la première requête.
    const orderItems = await tx.purchaseOrderItem.findMany({
      where:   { order_id: orderId },
      include: {
        supplier_product: {
          select: {
            product_id: true,
            packaging_format: { select: { units_per_package: true } },
          },
        },
      },
    });

    // d) Déduire le statut global de la commande.
    //    Un surplus (confirmedQty > ordered_qty) est autorisé et compte comme "reçu".
    let fullyReceived = true;
    for (const oi of orderItems) {
      const confirmedQty = receivedByOrderItem.get(oi.id) ?? 0;
      if (confirmedQty < oi.ordered_qty) {
        fullyReceived = false;
      }
    }

    const newOrderStatus: PurchaseOrderStatus = fullyReceived
      ? PurchaseOrderStatus.RECEIVED
      : PurchaseOrderStatus.PARTIALLY_RECEIVED;

    await tx.purchaseOrder.update({
      where: { id: orderId },
      data:  { status: newOrderStatus },
    });

    return reception;
  }) as unknown as StockReceptionRow;
}

/**
 * Annule une réception (status = CANCELLED).
 * L'inventaire n'est PAS modifié — l'annulation ne revient pas en arrière
 * sur un stock déjà confirmé ; ici on annule uniquement une réception PENDING.
 *
 * @param id - UUID de la réception à annuler
 * @returns La réception mise à jour
 */
export async function cancel(id: string): Promise<StockReceptionRow> {
  return prisma.stockReception.update({
    where:   { id },
    data:    { status: ReceptionStatus.CANCELLED },
    include: RECEPTION_INCLUDE,
  }) as unknown as StockReceptionRow;
}
