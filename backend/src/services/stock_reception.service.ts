// src/services/stock_reception.service.ts
//
// Service de gestion des réceptions de stock (StockReception).
//
// Responsabilités :
//   - Validation métier : statut de la commande, existence des produits
//   - Calcul de stock_units_added = received_qty × units_per_order
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
    product_id: string;
    received_qty: number;
  }>;
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
export async function getReceptionsByOrder(orderId: string): Promise<StockReceptionRow[]> {
  return receptionRepo.findByOrderId(orderId);
}

/**
 * Retourne une réception par son UUID.
 *
 * @param id - UUID de la réception
 * @returns La réception trouvée
 * @throws Error('RECEPTION_NOT_FOUND') si l'UUID ne correspond à aucun enregistrement
 */
export async function getReceptionById(id: string): Promise<StockReceptionRow> {
  const reception = await receptionRepo.findById(id);
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
 *     afin de calculer stock_units_added = received_qty × units_per_order.
 *
 * @param input         - Données de la réception (order_id, items…)
 * @param actorId       - UUID de l'utilisateur connecté (received_by_id)
 * @param actorName     - Nom de l'acteur (dénormalisé dans le log)
 * @param storeId       - UUID du magasin de l'acteur (contexte audit)
 * @param storeName     - Nom du magasin (dénormalisé dans le log)
 * @param ipAddress     - Adresse IP de l'acteur
 * @returns La réception créée
 * @throws Error('ORDER_NOT_FOUND')              si la commande n'existe pas
 * @throws Error('INVALID_ORDER_STATUS')         si la commande n'est pas en SENT ou PARTIALLY_RECEIVED
 * @throws Error('SUPPLIER_PRODUCT_NOT_FOUND')   si aucun SupplierProduct ne lie le produit à la commande
 */
export async function createReception(
  input: CreateReceptionInput,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<StockReceptionRow> {
  // Vérification de la commande
  const order = await prisma.purchaseOrder.findUnique({
    where:   { id: input.order_id },
    include: {
      items: {
        include: { supplier_product: { select: { product_id: true, units_per_order: true } } },
      },
    },
  });

  if (!order) {
    throw new Error('ORDER_NOT_FOUND');
  }
  if (
    order.status !== PurchaseOrderStatus.SENT &&
    order.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
  ) {
    throw new Error('INVALID_ORDER_STATUS');
  }

  // Construire un index product_id → units_per_order depuis les lignes de commande
  const unitsPerOrderByProduct = new Map<string, number>();
  for (const oi of order.items) {
    unitsPerOrderByProduct.set(
      oi.supplier_product.product_id,
      oi.supplier_product.units_per_order,
    );
  }

  // Calculer stock_units_added pour chaque ligne de réception
  const enrichedItems = input.items.map((item) => {
    const unitsPerOrder = unitsPerOrderByProduct.get(item.product_id);
    if (unitsPerOrder === undefined) {
      throw new Error('SUPPLIER_PRODUCT_NOT_FOUND');
    }
    return {
      product_id:        item.product_id,
      received_qty:      item.received_qty,
      stock_units_added: item.received_qty * unitsPerOrder,
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
  id: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<StockReceptionRow> {
  const existing = await receptionRepo.findById(id);
  if (!existing) {
    throw new Error('RECEPTION_NOT_FOUND');
  }
  if (existing.status !== 'PENDING') {
    throw new Error('INVALID_STATUS_TRANSITION');
  }

  const reception = await receptionRepo.confirm(id);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.RECEPTION_CONFIRMED,
      targetType: 'STOCK_RECEPTION',
      targetId:   reception.id,
      targetName: `Réception #${reception.order.reference}`,
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
  id: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<StockReceptionRow> {
  const existing = await receptionRepo.findById(id);
  if (!existing) {
    throw new Error('RECEPTION_NOT_FOUND');
  }
  if (existing.status !== 'PENDING') {
    throw new Error('INVALID_STATUS_TRANSITION');
  }

  const reception = await receptionRepo.cancel(id);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.RECEPTION_CANCELLED,
      targetType: 'STOCK_RECEPTION',
      targetId:   reception.id,
      targetName: `Réception #${reception.order.reference}`,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log RECEPTION_CANCELLED :', err);
  }

  return reception;
}
