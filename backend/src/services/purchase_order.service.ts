// src/services/purchase_order.service.ts
//
// Service de gestion des commandes fournisseurs (PurchaseOrder).
//
// Responsabilités :
//   - Validation métier : existence des entités référencées, cohérence des statuts
//   - Génération automatique de la référence BC-YYYY-XXXX
//   - Cycle de vie : DRAFT → SENT → CANCELLED
//   - Journalisation de chaque action métier via audit.service (non-bloquant)

import { AuditAction, PurchaseOrderStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { logAction } from './audit.service';
import * as orderRepo from '../repositories/purchase_order.repository';
import type {
  PurchaseOrderRow,
  PurchaseOrderFilters,
  CreatePurchaseOrderData,
  UpdatePurchaseOrderData,
} from '../repositories/purchase_order.repository';

// Ré-export du type pour les controllers
export type { PurchaseOrderRow };

// ---------------------------------------------------------------------------
// Types internes du service
// ---------------------------------------------------------------------------

/** Données entrantes pour créer une commande (avant enrichissement par le service). */
export interface CreateOrderInput {
  supplier_id: string;
  destination_store_id: string;
  notes?: string;
  expected_at?: string;
  items: Array<{
    supplier_product_id: string;
    ordered_qty: number;
    unit_price: number;
    packaging_format_id?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Fonctions du service
// ---------------------------------------------------------------------------

/**
 * Retourne la liste des commandes fournisseurs avec filtres optionnels.
 * Délègue directement au repository.
 *
 * @param filters - { supplier_id?, destination_store_id?, status? }
 * @returns Tableau de PurchaseOrderRow
 */
export async function getPurchaseOrders(
  orgId: string,
  filters: PurchaseOrderFilters = {},
): Promise<PurchaseOrderRow[]> {
  return orderRepo.findAll(orgId, filters);
}

/**
 * Retourne une commande par son UUID.
 *
 * @param id - UUID de la commande
 * @returns La commande trouvée
 * @throws Error('ORDER_NOT_FOUND') si l'UUID ne correspond à aucun enregistrement
 */
export async function getPurchaseOrderById(orgId: string, id: string): Promise<PurchaseOrderRow> {
  const order = await orderRepo.findById(id, orgId);
  if (!order) {
    throw new Error('ORDER_NOT_FOUND');
  }
  return order;
}

/**
 * Crée une nouvelle commande fournisseur avec ses lignes.
 *
 * Règles métier vérifiées :
 *   - Le fournisseur doit exister et être actif.
 *   - Le magasin de destination doit exister.
 *   - Chaque supplier_product doit exister, être actif et appartenir au fournisseur.
 *
 * La référence est générée automatiquement au format BC-YYYY-XXXX.
 * L'ordered_by_id est toujours celui de l'utilisateur connecté (jamais du body).
 *
 * @param input      - Données de la commande (supplier_id, destination_store_id, items…)
 * @param actorId    - UUID de l'utilisateur connecté
 * @param actorName  - Nom de l'acteur (dénormalisé dans le log)
 * @param storeId    - UUID du magasin de l'acteur (contexte audit)
 * @param storeName  - Nom du magasin (dénormalisé dans le log)
 * @param ipAddress  - Adresse IP de l'acteur
 * @returns La commande créée
 * @throws Error('SUPPLIER_NOT_FOUND')         si le fournisseur n'existe pas ou est inactif
 * @throws Error('STORE_NOT_FOUND')            si le magasin de destination n'existe pas
 * @throws Error('SUPPLIER_PRODUCT_NOT_FOUND') si un supplier_product est invalide
 */
export async function createPurchaseOrder(
  orgId: string,
  input: CreateOrderInput,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<PurchaseOrderRow> {
  // Vérification du fournisseur
  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplier_id, organization_id: orgId } });
  if (!supplier || !supplier.is_active) {
    throw new Error('SUPPLIER_NOT_FOUND');
  }

  // Vérification du magasin de destination
  const store = await prisma.store.findUnique({ where: { id: input.destination_store_id, organization_id: orgId } });
  if (!store) {
    throw new Error('STORE_NOT_FOUND');
  }

  // Vérification de chaque supplier_product + cache des métadonnées
  const supplierProductCache = new Map<string, { product_id: string; defaultUnitsPerPackage: number }>();
  for (const item of input.items) {
    const sp = await prisma.supplierProduct.findUnique({
      where: { id: item.supplier_product_id },
      select: {
        product_id: true,
        is_active: true,
        supplier_id: true,
        packaging_format: { select: { units_per_package: true } },
      },
    });
    if (!sp || !sp.is_active || sp.supplier_id !== input.supplier_id) {
      throw new Error('SUPPLIER_PRODUCT_NOT_FOUND');
    }
    supplierProductCache.set(item.supplier_product_id, {
      product_id: sp.product_id,
      defaultUnitsPerPackage: sp.packaging_format?.units_per_package ?? 1,
    });
  }

  // Résolution des units_per_package pour chaque ligne (snapshot au moment de la création)
  const enrichedItems = await Promise.all(
    input.items.map(async (item) => {
      const cachedProduct = supplierProductCache.get(item.supplier_product_id);
      if (!cachedProduct) throw new Error('SUPPLIER_PRODUCT_NOT_FOUND');

      let unitsPerPackage = cachedProduct.defaultUnitsPerPackage;
      if (item.packaging_format_id) {
        const packagingFormat = await prisma.packagingFormat.findUnique({
          where: { id: item.packaging_format_id },
          select: { units_per_package: true, product_id: true },
        });
        if (packagingFormat) {
          if (packagingFormat.product_id !== cachedProduct.product_id) {
            throw new Error('PACKAGING_FORMAT_MISMATCH');
          }
          unitsPerPackage = packagingFormat.units_per_package;
        }
      }
      return { ...item, snapshotted_units_per_package: unitsPerPackage };
    }),
  );

  // Génération de la référence
  const reference = await orderRepo.getNextReference(orgId, new Date().getFullYear());

  const createData: CreatePurchaseOrderData = {
    reference,
    supplier_id:          input.supplier_id,
    destination_store_id: input.destination_store_id,
    ordered_by_id:        actorId,
    notes:                input.notes,
    expected_at:          input.expected_at,
    items:                enrichedItems,
  };

  const order = await orderRepo.create(createData, orgId);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.PURCHASE_ORDER_CREATED,
      targetType: 'PURCHASE_ORDER',
      targetId:   order.id,
      targetName: order.reference,
      orgId,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log PURCHASE_ORDER_CREATED :', err);
  }

  return order;
}

/**
 * Met à jour les champs modifiables d'une commande DRAFT :
 * notes, expected_at, destination_store_id, items (remplacement complet).
 * Le supplier_id est immuable et ne peut pas être modifié.
 *
 * Règles métier vérifiées :
 *   - La commande doit exister et être en statut DRAFT.
 *   - Si destination_store_id est fourni, le magasin doit exister.
 *   - Si items est fourni, chaque supplier_product doit exister, être actif
 *     et appartenir au même fournisseur que la commande.
 *
 * @param id         - UUID de la commande à modifier
 * @param data       - Champs à modifier (notes?, expected_at?, destination_store_id?, items?)
 * @param actorId    - UUID de l'utilisateur connecté
 * @param actorName  - Nom de l'acteur
 * @param storeId    - UUID du magasin de l'acteur
 * @param storeName  - Nom du magasin
 * @param ipAddress  - Adresse IP de l'acteur
 * @returns La commande mise à jour
 * @throws Error('ORDER_NOT_FOUND')            si la commande n'existe pas
 * @throws Error('INVALID_STATUS_TRANSITION')  si la commande n'est pas en DRAFT
 * @throws Error('STORE_NOT_FOUND')            si le magasin de destination n'existe pas
 * @throws Error('SUPPLIER_PRODUCT_NOT_FOUND') si un supplier_product est invalide
 */
export async function updatePurchaseOrder(
  orgId: string,
  id: string,
  data: UpdatePurchaseOrderData,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<PurchaseOrderRow> {
  const existing = await orderRepo.findById(id, orgId);
  if (!existing) {
    throw new Error('ORDER_NOT_FOUND');
  }
  if (existing.status !== PurchaseOrderStatus.DRAFT) {
    throw new Error('INVALID_STATUS_TRANSITION');
  }

  // Validate destination store if provided
  if (data.destination_store_id) {
    const store = await prisma.store.findUnique({ where: { id: data.destination_store_id, organization_id: orgId } });
    if (!store) throw new Error('STORE_NOT_FOUND');
  }

  // Validate supplier products if items are provided
  if (data.items) {
    const supplierProductCache = new Map<string, { product_id: string; defaultUnitsPerPackage: number }>();
    for (const item of data.items) {
      const sp = await prisma.supplierProduct.findUnique({
        where: { id: item.supplier_product_id },
        select: {
          product_id: true,
          is_active: true,
          supplier_id: true,
          packaging_format: { select: { units_per_package: true } },
        },
      });
      if (!sp || !sp.is_active || sp.supplier_id !== existing.supplier_id) {
        throw new Error('SUPPLIER_PRODUCT_NOT_FOUND');
      }
      supplierProductCache.set(item.supplier_product_id, {
        product_id: sp.product_id,
        defaultUnitsPerPackage: sp.packaging_format?.units_per_package ?? 1,
      });
    }

    // Snapshot units_per_package for each item
    data.items = await Promise.all(
      data.items.map(async (item) => {
        const cachedProduct = supplierProductCache.get(item.supplier_product_id);
        if (!cachedProduct) throw new Error('SUPPLIER_PRODUCT_NOT_FOUND');

        let unitsPerPackage = cachedProduct.defaultUnitsPerPackage;
        if (item.packaging_format_id) {
          const packagingFormat = await prisma.packagingFormat.findUnique({
            where: { id: item.packaging_format_id },
            select: { units_per_package: true, product_id: true },
          });
          if (packagingFormat) {
            if (packagingFormat.product_id !== cachedProduct.product_id) {
              throw new Error('PACKAGING_FORMAT_MISMATCH');
            }
            unitsPerPackage = packagingFormat.units_per_package;
          }
        }
        return { ...item, snapshotted_units_per_package: unitsPerPackage };
      }),
    );
  }

  const order = await orderRepo.update(orgId, id, data);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.PURCHASE_ORDER_UPDATED,
      targetType: 'PURCHASE_ORDER',
      targetId:   order.id,
      targetName: order.reference,
      orgId,
      storeId,
      storeName,
      ipAddress,
      metadata: {
        updated_fields: Object.keys(data),
        ...(data.destination_store_id ? { new_destination_store_id: data.destination_store_id } : {}),
        ...(data.items !== undefined ? { items_count: data.items.length } : {}),
      },
    });
  } catch (err) {
    console.error('[audit] Échec du log PURCHASE_ORDER_UPDATED :', err);
  }

  return order;
}

/**
 * Passe une commande DRAFT au statut SENT (enregistre sent_at).
 *
 * Règles métier vérifiées avant transition :
 *   1. Le fournisseur doit toujours être actif.
 *   2. Chaque ligne de commande doit référencer un supplier_product ET un produit actifs.
 *      Si au moins une ligne est invalide, la commande ne peut pas être envoyée.
 *
 * @param id         - UUID de la commande
 * @param actorId    - UUID de l'utilisateur connecté
 * @param actorName  - Nom de l'acteur
 * @param storeId    - UUID du magasin de l'acteur
 * @param storeName  - Nom du magasin
 * @param ipAddress  - Adresse IP de l'acteur
 * @returns La commande mise à jour
 * @throws Error('ORDER_NOT_FOUND')           si la commande n'existe pas
 * @throws Error('INVALID_STATUS_TRANSITION') si la commande n'est pas en DRAFT
 * @throws Error('SUPPLIER_INACTIVE')         si le fournisseur a été désactivé
 * @throws Error('INACTIVE_ORDER_ITEMS')      si au moins une ligne pointe vers un produit/catalogue désactivé
 */
export async function sendPurchaseOrder(
  orgId: string,
  id: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<PurchaseOrderRow> {
  const existing = await orderRepo.findById(id, orgId);
  if (!existing) {
    throw new Error('ORDER_NOT_FOUND');
  }
  if (existing.status !== PurchaseOrderStatus.DRAFT) {
    throw new Error('INVALID_STATUS_TRANSITION');
  }

  // Vérification 1 : le fournisseur est toujours actif
  const supplier = await prisma.supplier.findUnique({
    where:  { id: existing.supplier_id },
    select: { is_active: true, name: true },
  });
  if (!supplier || !supplier.is_active) {
    throw new Error('SUPPLIER_INACTIVE');
  }

  // Vérification 2 : chaque ligne référence un supplier_product ET un produit actifs
  const supplierProductIds = existing.items.map((i) => i.supplier_product_id);
  const supplierProducts = await prisma.supplierProduct.findMany({
    where:  { id: { in: supplierProductIds } },
    select: {
      id:        true,
      is_active: true,
      product:   { select: { name: true, is_active: true } },
    },
  });

  const inactiveItems: string[] = [];
  for (const sp of supplierProducts) {
    if (!sp.is_active || !sp.product.is_active) {
      inactiveItems.push(sp.product.name);
    }
  }

  if (inactiveItems.length > 0) {
    const err = new Error('INACTIVE_ORDER_ITEMS') as Error & { items: string[] };
    err.items = inactiveItems;
    throw err;
  }

  const order = await orderRepo.updateStatus(orgId, id, PurchaseOrderStatus.SENT, { sent_at: true });

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.PURCHASE_ORDER_SENT,
      targetType: 'PURCHASE_ORDER',
      targetId:   order.id,
      targetName: order.reference,
      orgId,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log PURCHASE_ORDER_SENT :', err);
  }

  return order;
}

/**
 * Clôture définitivement une commande PARTIALLY_RECEIVED.
 *
 * Utilisé quand une entente à l'amiable a été trouvée avec le fournisseur
 * et que le stock manquant ne sera jamais reçu.
 * La commande passe de PARTIALLY_RECEIVED → RECEIVED (état terminal).
 *
 * @throws Error('ORDER_NOT_FOUND')           si la commande n'existe pas
 * @throws Error('INVALID_STATUS_TRANSITION') si la commande n'est pas PARTIALLY_RECEIVED
 */
export async function closePurchaseOrder(
  orgId: string,
  id: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<PurchaseOrderRow> {
  const existing = await orderRepo.findById(id, orgId);
  if (!existing) throw new Error('ORDER_NOT_FOUND');
  if (existing.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED) {
    throw new Error('INVALID_STATUS_TRANSITION');
  }

  const order = await orderRepo.updateStatus(orgId, id, PurchaseOrderStatus.RECEIVED);

  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.PURCHASE_ORDER_CLOSED,
      targetType: 'PURCHASE_ORDER',
      targetId:   order.id,
      targetName: order.reference,
      orgId,
      storeId,
      storeName,
      ipAddress,
      metadata:   { reason: 'Clôture manuelle — stock partiellement reçu accepté' },
    });
  } catch (err) {
    console.error('[audit] Échec du log PURCHASE_ORDER_CLOSED :', err);
  }

  return order;
}

/**
 * Annule une commande en statut DRAFT ou SENT.
 *
 * Règle métier : seule une commande en DRAFT ou SENT peut être annulée.
 *
 * @param id         - UUID de la commande
 * @param actorId    - UUID de l'utilisateur connecté
 * @param actorName  - Nom de l'acteur
 * @param storeId    - UUID du magasin de l'acteur
 * @param storeName  - Nom du magasin
 * @param ipAddress  - Adresse IP de l'acteur
 * @returns La commande annulée
 * @throws Error('ORDER_NOT_FOUND')           si la commande n'existe pas
 * @throws Error('INVALID_STATUS_TRANSITION') si la commande n'est pas en DRAFT ou SENT
 */
export async function cancelPurchaseOrder(
  orgId: string,
  id: string,
  actorId: string,
  actorName: string,
  storeId?: string,
  storeName?: string,
  ipAddress?: string,
): Promise<PurchaseOrderRow> {
  const existing = await orderRepo.findById(id, orgId);
  if (!existing) {
    throw new Error('ORDER_NOT_FOUND');
  }
  if (
    existing.status !== PurchaseOrderStatus.DRAFT &&
    existing.status !== PurchaseOrderStatus.SENT
  ) {
    throw new Error('INVALID_STATUS_TRANSITION');
  }

  const order = await orderRepo.updateStatus(orgId, id, PurchaseOrderStatus.CANCELLED);

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.PURCHASE_ORDER_CANCELLED,
      targetType: 'PURCHASE_ORDER',
      targetId:   order.id,
      targetName: order.reference,
      orgId,
      storeId,
      storeName,
      ipAddress,
    });
  } catch (err) {
    console.error('[audit] Échec du log PURCHASE_ORDER_CANCELLED :', err);
  }

  return order;
}
