// src/services/stock_reception.service.ts
//
// Service de gestion des réceptions de stock (StockReception).
//
// Responsabilités :
//   - Validation métier : statut de la commande, existence des produits
//   - Calcul de stock_units_added = received_qty × packaging_format.units_per_package
//   - Cycle de vie : PENDING → CONFIRMED | CANCELLED
//   - Journalisation de chaque action métier via audit.service (non-bloquant)

import { AuditAction, PurchaseOrderStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { logAction } from './audit.service';
import * as receptionRepo from '../repositories/stock_reception.repository';
import type { StockReceptionRow } from '../repositories/stock_reception.repository';

// Ré-export du type pour les controllers
export type { StockReceptionRow };

// ---------------------------------------------------------------------------
// Types internes du service
// ---------------------------------------------------------------------------

/** Données entrantes pour créer une réception (avant enrichissement par le service). */
export interface CreateReceptionInput {
  order_id: string;
  notes?: string;
  items: Array<{
    /** UUID de la ligne de commande (PurchaseOrderItem) — identifie le format exact. */
    order_item_id: string;
    received_qty: number;
  }>;
}

type ConfirmedReceptionSnapshot = {
  items: Array<{
    order_item_id?: string | null;
    received_qty: number;
  }>;
};

function assertSurplusHasNote(
  orderItems: Array<{ id: string; ordered_qty: number }>,
  requestedItems: Array<{ order_item_id: string; received_qty: number }>,
  confirmedReceptions: ConfirmedReceptionSnapshot[],
  notes: string | undefined,
): void {
  const confirmedQtyByOrderItem = new Map<string, number>();
  for (const reception of confirmedReceptions) {
    for (const item of reception.items) {
      if (!item.order_item_id) continue;
      confirmedQtyByOrderItem.set(
        item.order_item_id,
        (confirmedQtyByOrderItem.get(item.order_item_id) ?? 0) + item.received_qty,
      );
    }
  }

  // Agrégation par order_item_id : plusieurs lignes de la même requête portant sur la
  // même ligne de commande doivent être sommées avant comparaison au reliquat, sinon un
  // surplus peut être fractionné en plusieurs lignes sous le seuil pour contourner la garde.
  const requestedQtyByOrderItem = new Map<string, number>();
  for (const item of requestedItems) {
    requestedQtyByOrderItem.set(
      item.order_item_id,
      (requestedQtyByOrderItem.get(item.order_item_id) ?? 0) + item.received_qty,
    );
  }

  const hasSurplus = Array.from(requestedQtyByOrderItem.entries()).some(([orderItemId, totalRequestedQty]) => {
    const orderItem = orderItems.find((oi) => oi.id === orderItemId);
    if (!orderItem) return false;
    const confirmedQty = confirmedQtyByOrderItem.get(orderItemId) ?? 0;
    const remaining = Math.max(0, orderItem.ordered_qty - confirmedQty);
    return totalRequestedQty > remaining;
  });

  if (hasSurplus && !notes?.trim()) {
    throw new Error('SURPLUS_REQUIRES_NOTE');
  }
}

// ---------------------------------------------------------------------------
// Fonctions du service
// ---------------------------------------------------------------------------

/**
 * Retourne toutes les réceptions d'une commande.
 *
 * @param orderId - UUID de la commande parente
 * @returns Tableau de StockReceptionRow
 */
export async function getReceptionsByOrder(orgId: string, orderId: string): Promise<StockReceptionRow[]> {
  return receptionRepo.findByOrderId(orderId, orgId);
}

/**
 * Retourne une réception par son UUID.
 *
 * @param id - UUID de la réception
 * @returns La réception trouvée
 * @throws Error('RECEPTION_NOT_FOUND') si l'UUID ne correspond à aucun enregistrement
 */
export async function getReceptionById(orgId: string, id: string): Promise<StockReceptionRow> {
  const reception = await receptionRepo.findById(id, orgId);
  if (!reception) {
    throw new Error('RECEPTION_NOT_FOUND');
  }
  return reception;
}

/**
 * Crée une nouvelle réception de stock pour une commande existante.
 *
 * Règles métier vérifiées :
 *   - La commande doit être en statut SENT ou PARTIALLY_RECEIVED.
 *   - Pour chaque ligne reçue, le SupplierProduct correspondant est chargé
 *     afin de calculer stock_units_added = received_qty × packaging_format.units_per_package.
 *
 * @param input         - Données de la réception (order_id, items…)
 * @param actorId       - UUID de l'utilisateur connecté (received_by_id)
 * @param actorName     - Nom de l'acteur (dénormalisé dans le log)
 * @param storeId       - UUID du magasin de l'acteur (contexte audit + scope si restrictToOwnStore)
 * @param storeName     - Nom du magasin (dénormalisé dans le log)
 * @param ipAddress     - Adresse IP de l'acteur
 * @param restrictToOwnStore - Si vrai, la commande doit avoir pour destination le magasin de l'acteur (tout rôle hors SA/Admin)
 * @returns La réception créée
 * @throws Error('ORDER_NOT_FOUND')              si la commande n'existe pas
 * @throws Error('FORBIDDEN_STORE_SCOPE')        si l'acteur n'a pas accès au magasin de destination de la commande
 * @throws Error('INVALID_ORDER_STATUS')         si la commande n'est pas en SENT ou PARTIALLY_RECEIVED
 * @throws Error('SUPPLIER_PRODUCT_NOT_FOUND')   si aucun SupplierProduct ne lie le produit à la commande
 */
export async function createReception(
  orgId: string,
  input: CreateReceptionInput,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
  restrictToOwnStore = false,
): Promise<StockReceptionRow> {
  // Vérification de la commande
  const order = await prisma.purchaseOrder.findUnique({
    where: {
      id: input.order_id,
      AND: [
        {
          OR: [
            { supplier: { organization_id: orgId } },
            { destination_store: { organization_id: orgId } },
          ],
        },
      ],
    },
    include: {
      items: {
        select: {
          id: true,
          ordered_qty: true,
          snapshotted_units_per_package: true,
          supplier_product: {
            select: {
              product_id: true,
              packaging_format_id: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    throw new Error('ORDER_NOT_FOUND');
  }
  if (restrictToOwnStore && order.destination_store_id !== storeId) {
    throw new Error('FORBIDDEN_STORE_SCOPE');
  }
  if (
    order.status !== PurchaseOrderStatus.SENT &&
    order.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
  ) {
    throw new Error('INVALID_ORDER_STATUS');
  }

  const confirmedReceptions = await prisma.stockReception.findMany({
    where: {
      order_id: input.order_id,
      status: 'CONFIRMED',
      purchase_order: {
        OR: [
          { supplier: { organization_id: orgId } },
          { destination_store: { organization_id: orgId } },
        ],
      },
    },
    select: {
      items: {
        select: {
          order_item_id: true,
          received_qty: true,
        },
      },
    },
  });
  assertSurplusHasNote(order.items, input.items, confirmedReceptions, input.notes);

  // Construire un index order_item_id → { product_id, unitsPerPackage, packaging_format_id }
  // Clé par ligne de commande (et non par produit) pour traiter correctement un même
  // produit commandé sous plusieurs formats différents.
  // Utilise snapshotted_units_per_package figé à la création de la commande, pas le
  // catalogue live — évite les dérives si le format change après émission de la commande.
  const orderInfoByItem = new Map<string, {
    product_id:        string;
    unitsPerPackage:   number;
    packagingFormatId: string | null;
  }>();
  for (const oi of order.items) {
    orderInfoByItem.set(oi.id, {
      product_id:        oi.supplier_product.product_id,
      unitsPerPackage:   oi.snapshotted_units_per_package,
      packagingFormatId: oi.supplier_product.packaging_format_id ?? null,
    });
  }

  // Calculer stock_units_added + propager le format pour chaque ligne de réception
  const enrichedItems = input.items.map((item) => {
    const info = orderInfoByItem.get(item.order_item_id);
    if (!info) {
      throw new Error('SUPPLIER_PRODUCT_NOT_FOUND');
    }
    return {
      order_item_id:       item.order_item_id,
      product_id:          info.product_id,
      received_qty:        item.received_qty,
      stock_units_added:   item.received_qty * info.unitsPerPackage,
      packaging_format_id: info.packagingFormatId ?? undefined,
      packages_received:   info.packagingFormatId != null ? item.received_qty : undefined,
    };
  });

  const reception = await receptionRepo.create({
    order_id:       input.order_id,
    received_by_id: actorId,
    notes:          input.notes,
    items:          enrichedItems,
  });

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.RECEPTION_CREATED,
      targetType: 'STOCK_RECEPTION',
      targetId:   reception.id,
      targetName: `Réception #${order.reference}`,
      orgId,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log RECEPTION_CREATED :', err);
  }

  return reception;
}

/**
 * Confirme une réception PENDING.
 *
 * Délègue la transaction atomique à receptionRepo.confirm() qui :
 *   1. Passe la réception à CONFIRMED.
 *   2. Met à jour l'inventaire du magasin de destination.
 *   3. Met à jour le statut de la commande (RECEIVED ou PARTIALLY_RECEIVED).
 *
 * @param id         - UUID de la réception à confirmer
 * @param actorId    - UUID de l'utilisateur connecté
 * @param actorName  - Nom de l'acteur
 * @param storeId    - UUID du magasin de l'acteur
 * @param storeName  - Nom du magasin
 * @param ipAddress  - Adresse IP de l'acteur
 * @returns La réception confirmée
 * @throws Error('RECEPTION_NOT_FOUND')        si la réception n'existe pas
 * @throws Error('INVALID_STATUS_TRANSITION')  si la réception n'est pas PENDING
 */
export async function confirmReception(
  orgId: string,
  id: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<StockReceptionRow> {
  const existing = await receptionRepo.findById(id, orgId);
  if (!existing) {
    throw new Error('RECEPTION_NOT_FOUND');
  }
  if (existing.status !== 'PENDING') {
    throw new Error('INVALID_STATUS_TRANSITION');
  }

  const reception = await receptionRepo.confirm(orgId, id);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.RECEPTION_CONFIRMED,
      targetType: 'STOCK_RECEPTION',
      targetId:   reception.id,
      targetName: `Réception #${reception.order.reference}`,
      orgId,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log RECEPTION_CONFIRMED :', err);
  }

  return reception;
}

/**
 * Annule une réception PENDING.
 *
 * Règle métier : seule une réception en statut PENDING peut être annulée.
 * Une réception déjà CONFIRMED ne peut pas être annulée (le stock a déjà été mis à jour).
 *
 * @param id         - UUID de la réception à annuler
 * @param actorId    - UUID de l'utilisateur connecté
 * @param actorName  - Nom de l'acteur
 * @param storeId    - UUID du magasin de l'acteur
 * @param storeName  - Nom du magasin
 * @param ipAddress  - Adresse IP de l'acteur
 * @returns La réception annulée
 * @throws Error('RECEPTION_NOT_FOUND')        si la réception n'existe pas
 * @throws Error('INVALID_STATUS_TRANSITION')  si la réception n'est pas PENDING
 */
export async function cancelReception(
  orgId: string,
  id: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<StockReceptionRow> {
  const existing = await receptionRepo.findById(id, orgId);
  if (!existing) {
    throw new Error('RECEPTION_NOT_FOUND');
  }
  if (existing.status !== 'PENDING') {
    throw new Error('INVALID_STATUS_TRANSITION');
  }

  const reception = await receptionRepo.cancel(orgId, id);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.RECEPTION_CANCELLED,
      targetType: 'STOCK_RECEPTION',
      targetId:   reception.id,
      targetName: `Réception #${reception.order.reference}`,
      orgId,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log RECEPTION_CANCELLED :', err);
  }

  return reception;
}
