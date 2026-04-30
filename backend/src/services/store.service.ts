// src/services/store.service.ts
//
// Service de gestion des établissements (Store).
//
// Responsabilités :
//   - CRUD complet sur les établissements
//   - Gestion du cycle de vie (ouverture / fermeture)
//   - Suppression sécurisée (vérification des dépendances avant delete)
//   - Journalisation de chaque action via audit.service

import { AuditAction } from '@prisma/client';
import { prisma } from '../config/database';
import { logAction } from './audit.service';

// ---------------------------------------------------------------------------
// Types exposés — contrat entre service et controller
// ---------------------------------------------------------------------------

/**
 * Un établissement tel que retourné par toutes les fonctions du service.
 * Inclut le compteur d'accès utilisateurs pour l'affichage dans les listes.
 */
export interface StoreRow {
  id: string;
  name: string;
  location: string | null;
  color: string;
  phone: string | null;
  description: string | null;
  type: 'MAGASIN' | 'BOUTIQUE' | 'ENTREPOT';
  status: 'ACTIVE' | 'CLOSED';
  closed_at: Date | null;
  _count: { user_access: number };
}

/**
 * Données requises pour créer un nouvel établissement.
 */
export interface CreateStoreInput {
  name: string;
  type: 'MAGASIN' | 'BOUTIQUE' | 'ENTREPOT';
  location?: string;
  phone?: string;
  description?: string;
  color: string;
}

/**
 * Données pour la mise à jour d'un établissement — tous les champs sont optionnels.
 */
export interface UpdateStoreInput extends Partial<CreateStoreInput> {}

// ---------------------------------------------------------------------------
// Sélecteur Prisma partagé — garantit que toutes les fonctions retournent
// exactement la même forme de données (StoreRow).
// ---------------------------------------------------------------------------

const STORE_SELECT = {
  id: true,
  name: true,
  location: true,
  color: true,
  phone: true,
  description: true,
  type: true,
  status: true,
  closed_at: true,
  _count: {
    select: { user_access: true },
  },
} as const;

// ---------------------------------------------------------------------------
// Fonctions du service
// ---------------------------------------------------------------------------

/**
 * Retourne la liste complète de tous les établissements, tous statuts confondus.
 * Triés par ordre alphabétique.
 *
 * @returns Tableau de StoreRow, potentiellement vide
 */
export async function getAllStores(): Promise<StoreRow[]> {
  return prisma.store.findMany({
    select: STORE_SELECT,
    orderBy: { name: 'asc' },
  });
}

/**
 * Crée un nouvel établissement et journalise l'action STORE_CREATED.
 *
 * L'audit est non-bloquant : un échec d'écriture du log ne fait pas échouer
 * la création de l'établissement.
 *
 * @param data      - Données de l'établissement à créer
 * @param actorId   - UUID de l'utilisateur qui effectue l'action
 * @param actorName - Nom de l'acteur (dénormalisé dans le log)
 * @param ip        - Adresse IP de l'acteur
 * @returns L'établissement créé
 */
export async function createStore(
  data: CreateStoreInput,
  actorId: string,
  actorName: string,
  ip: string,
): Promise<StoreRow> {
  const store = await prisma.store.create({
    data: {
      name:        data.name,
      type:        data.type,
      color:       data.color,
      location:    data.location    ?? null,
      phone:       data.phone       ?? null,
      description: data.description ?? null,
    },
    select: STORE_SELECT,
  });

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.STORE_CREATED,
      targetType: 'STORE',
      targetId:   store.id,
      targetName: store.name,
      storeId:    store.id,
      storeName:  store.name,
      ipAddress:  ip,
    });
  } catch (err) {
    console.error('[audit] Échec du log STORE_CREATED :', err);
  }

  return store;
}

/**
 * Met à jour les champs fournis d'un établissement existant.
 * Journalise les champs modifiés dans les métadonnées de l'audit (STORE_UPDATED).
 *
 * @param id        - UUID de l'établissement à mettre à jour
 * @param data      - Champs à modifier (seuls les champs présents sont mis à jour)
 * @param actorId   - UUID de l'utilisateur qui effectue l'action
 * @param actorName - Nom de l'acteur (dénormalisé)
 * @param ip        - Adresse IP de l'acteur
 * @returns L'établissement mis à jour
 * @throws Error si l'établissement n'existe pas (Prisma P2025)
 */
export async function updateStore(
  id: string,
  data: UpdateStoreInput,
  actorId: string,
  actorName: string,
  ip: string,
): Promise<StoreRow> {
  // On construit l'objet de mise à jour en n'incluant que les champs fournis
  const updateData: Record<string, unknown> = {};
  if (data.name        !== undefined) updateData.name        = data.name;
  if (data.type        !== undefined) updateData.type        = data.type;
  if (data.color       !== undefined) updateData.color       = data.color;
  if (data.location    !== undefined) updateData.location    = data.location;
  if (data.phone       !== undefined) updateData.phone       = data.phone;
  if (data.description !== undefined) updateData.description = data.description;

  const store = await prisma.store.update({
    where:  { id },
    data:   updateData,
    select: STORE_SELECT,
  });

  // Audit — non-bloquant, avec liste des champs modifiés dans les métadonnées
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.STORE_UPDATED,
      targetType: 'STORE',
      targetId:   store.id,
      targetName: store.name,
      storeId:    store.id,
      storeName:  store.name,
      ipAddress:  ip,
      metadata:   { updated_fields: Object.keys(updateData) },
    });
  } catch (err) {
    console.error('[audit] Échec du log STORE_UPDATED :', err);
  }

  return store;
}

/**
 * Ferme un établissement : passe le statut à CLOSED et enregistre la date de fermeture.
 * Journalise l'action STORE_CLOSED.
 *
 * @param id        - UUID de l'établissement à fermer
 * @param actorId   - UUID de l'utilisateur qui effectue l'action
 * @param actorName - Nom de l'acteur (dénormalisé)
 * @param ip        - Adresse IP de l'acteur
 * @returns L'établissement mis à jour
 */
export async function closeStore(
  id: string,
  actorId: string,
  actorName: string,
  ip: string,
): Promise<StoreRow> {
  const store = await prisma.store.update({
    where:  { id },
    data:   { status: 'CLOSED', closed_at: new Date() },
    select: STORE_SELECT,
  });

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.STORE_CLOSED,
      targetType: 'STORE',
      targetId:   store.id,
      targetName: store.name,
      storeId:    store.id,
      storeName:  store.name,
      ipAddress:  ip,
    });
  } catch (err) {
    console.error('[audit] Échec du log STORE_CLOSED :', err);
  }

  return store;
}

/**
 * Réouvre un établissement fermé : passe le statut à ACTIVE et efface closed_at.
 * Journalise l'action STORE_REOPENED.
 *
 * @param id        - UUID de l'établissement à réouvrir
 * @param actorId   - UUID de l'utilisateur qui effectue l'action
 * @param actorName - Nom de l'acteur (dénormalisé)
 * @param ip        - Adresse IP de l'acteur
 * @returns L'établissement mis à jour
 */
export async function reopenStore(
  id: string,
  actorId: string,
  actorName: string,
  ip: string,
): Promise<StoreRow> {
  const store = await prisma.store.update({
    where:  { id },
    data:   { status: 'ACTIVE', closed_at: null },
    select: STORE_SELECT,
  });

  // Audit — non-bloquant
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.STORE_REOPENED,
      targetType: 'STORE',
      targetId:   store.id,
      targetName: store.name,
      storeId:    store.id,
      storeName:  store.name,
      ipAddress:  ip,
    });
  } catch (err) {
    console.error('[audit] Échec du log STORE_REOPENED :', err);
  }

  return store;
}

/**
 * Supprime définitivement un établissement — UNIQUEMENT s'il est vierge de données.
 *
 * Un établissement est considéré "vierge" si et seulement si :
 *  - 0 transactions associées
 *  - 0 transferts (from_store ou to_store)
 *  - 0 lignes d'inventaire avec stock_physical > 0 OU stock_reserved > 0
 *
 * Si l'établissement possède des données liées → throw Error('STORE_HAS_DEPENDENCIES')
 *
 * Si vierge :
 *  - Les enregistrements UserStoreAccess sont supprimés en cascade (onDelete: Cascade)
 *  - Les lignes d'inventaire à 0 sont supprimées explicitement avant le delete
 *  - L'audit STORE_DELETED est journalisé avant la suppression physique
 *    pour conserver le nom dans le log même après disparition de la ligne DB
 *
 * Sécurité : ne jamais exposer les détails de l'erreur Prisma au client.
 *
 * @param id        - UUID de l'établissement à supprimer
 * @param actorId   - UUID de l'utilisateur qui effectue l'action
 * @param actorName - Nom de l'acteur (dénormalisé)
 * @param ip        - Adresse IP de l'acteur
 * @throws Error('STORE_HAS_DEPENDENCIES') si des données liées existent
 */
export async function deleteStore(
  id: string,
  actorId: string,
  actorName: string,
  ip: string,
): Promise<void> {
  // Récupération du nom pour l'audit (avant la suppression)
  const storeRecord = await prisma.store.findUnique({
    where:  { id },
    select: { name: true },
  });
  const storeName = storeRecord?.name ?? 'inconnu';

  // --- Vérification des dépendances ---

  // 1. Transactions
  const nbTransactions = await prisma.transaction.count({
    where: { store_id: id },
  });

  // 2. Transferts (dans les deux sens)
  const nbTransfers = await prisma.transfer.count({
    where: {
      OR: [
        { from_store_id: id },
        { to_store_id:   id },
      ],
    },
  });

  // 3. Inventaire avec du stock réel ou réservé
  const nbInventory = await prisma.inventory.count({
    where: {
      store_id: id,
      OR: [
        { stock_physical: { gt: 0 } },
        { stock_reserved: { gt: 0 } },
      ],
    },
  });

  if (nbTransactions > 0 || nbTransfers > 0 || nbInventory > 0) {
    throw new Error('STORE_HAS_DEPENDENCIES');
  }

  // --- Suppression ---

  // Audit avant la suppression physique pour conserver storeName dans le log
  try {
    await logAction({
      actorId,
      actorName,
      action:     AuditAction.STORE_DELETED,
      targetType: 'STORE',
      targetId:   id,
      targetName: storeName,
      // On ne met PAS storeId ici car la FK AuditLog → Store serait invalide
      // après la suppression. On met juste le nom dénormalisé.
      storeName,
      ipAddress:  ip,
    });
  } catch (err) {
    console.error('[audit] Échec du log STORE_DELETED :', err);
  }

  // Suppression des lignes d'inventaire à zéro (non-cascade dans le schéma)
  await prisma.inventory.deleteMany({
    where: { store_id: id },
  });

  // Suppression de l'établissement
  // UserStoreAccess est supprimé en cascade (onDelete: Cascade dans le schéma)
  await prisma.store.delete({ where: { id } });
}
