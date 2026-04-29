// src/services/audit.service.ts
//
// Service de journalisation des actions métier (audit trail).
//
// Deux responsabilités :
//   1. logAction()      — écrit un événement en base, non-bloquant
//   2. getAuditLogs()   — interroge les logs avec filtres et pagination,
//                         avec restriction par magasin pour les Admins

import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../config/database';

// ---------------------------------------------------------------------------
// Types exposés
// ---------------------------------------------------------------------------

export type { AuditAction };

export type LogActionInput = {
  actorId: string | null;    // null pour les connexions échouées (user inconnu)
  actorName: string;         // Nom au moment du fait (dénormalisé)
  action: AuditAction;
  targetType?: string;       // ex : "USER", "STORE", "PRODUCT"
  targetId?: string;
  targetName?: string;       // Nom au moment du fait (dénormalisé)
  storeId?: string;
  storeName?: string;        // Nom au moment du fait (dénormalisé)
  metadata?: Prisma.InputJsonValue;
};

export type AuditLogRow = {
  id: string;
  created_at: Date;
  actor_id: string | null;
  actor_name: string;
  action: AuditAction;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  store_id: string | null;
  store_name: string | null;
  metadata: Prisma.JsonValue | null;
};

export type GetAuditLogsOptions = {
  // Filtres
  action?: AuditAction;
  actorId?: string;
  startDate?: Date;
  endDate?: Date;
  // Restriction par magasin pour les Admins (null = pas de restriction = SA)
  allowedStoreIds?: string[] | null;
  // Pagination
  page: number;
  limit: number;
};

export type AuditLogsResult = {
  logs: AuditLogRow[];
  total: number;
  page: number;
  totalPages: number;
};

// ---------------------------------------------------------------------------
// logAction — écriture d'un événement (non-bloquant)
// ---------------------------------------------------------------------------

/**
 * Écrit un événement d'audit en base.
 * Non-bloquant : un échec d'écriture est loggué en console mais ne propage
 * pas d'erreur — l'opération principale ne doit jamais échouer à cause de l'audit.
 */
export async function logAction(input: LogActionInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actor_id:    input.actorId   ?? null,
        actor_name:  input.actorName,
        action:      input.action,
        target_type: input.targetType  ?? null,
        target_id:   input.targetId   ?? null,
        target_name: input.targetName  ?? null,
        store_id:    input.storeId    ?? null,
        store_name:  input.storeName  ?? null,
        metadata:    input.metadata   ?? undefined,
      },
    });
  } catch (err) {
    // On ne propage jamais l'erreur — l'audit ne doit pas bloquer le métier
    console.error('[audit] Échec de la journalisation :', err);
  }
}

// ---------------------------------------------------------------------------
// getAuditLogs — lecture paginée avec filtres
// ---------------------------------------------------------------------------

/**
 * Retourne les logs d'audit paginés avec filtres optionnels.
 *
 * Règle d'accès :
 *  - SA (allowedStoreIds === null)  → tous les logs sans restriction
 *  - Admin (allowedStoreIds = [])   → logs dont store_id ∈ ses magasins
 *    Les logs sans store_id (ex : USER_LOGIN_FAILED) ne sont visibles
 *    que par le SA car ils n'appartiennent à aucun magasin.
 */
export async function getAuditLogs(options: GetAuditLogsOptions): Promise<AuditLogsResult> {
  const { action, actorId, startDate, endDate, allowedStoreIds, page, limit } = options;

  const where: Prisma.AuditLogWhereInput = {};

  // Filtre par type d'action
  if (action) {
    where.action = action;
  }

  // Filtre par acteur
  if (actorId) {
    where.actor_id = actorId;
  }

  // Filtre par plage de dates
  if (startDate || endDate) {
    where.created_at = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate   ? { lte: endDate   } : {}),
    };
  }

  // Restriction par magasin pour les Admins
  // null = SA → pas de restriction
  // string[] = Admin → logs dont store_id est dans la liste (les logs sans store
  // ne sont pas exposés aux Admins car ils n'ont pas de contexte magasin)
  if (allowedStoreIds !== null) {
    where.store_id = { in: allowedStoreIds };
  }

  const skip = (page - 1) * limit;

  // Compte total et logs en parallèle pour la pagination
  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
      select: {
        id:          true,
        created_at:  true,
        actor_id:    true,
        actor_name:  true,
        action:      true,
        target_type: true,
        target_id:   true,
        target_name: true,
        store_id:    true,
        store_name:  true,
        metadata:    true,
      },
    }),
  ]);

  return {
    logs,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

// ---------------------------------------------------------------------------
// Helpers internes — résolution de noms pour la dénormalisation
// ---------------------------------------------------------------------------

/**
 * Retourne le username d'un utilisateur par son ID.
 * Utilisé pour dénormaliser actor_name au moment du log.
 */
export async function resolveActorName(actorId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: { username: true },
  });
  return user?.username ?? 'inconnu';
}

/**
 * Retourne le nom d'un magasin par son ID.
 * Utilisé pour dénormaliser store_name au moment du log.
 */
export async function resolveStoreName(storeId: string): Promise<string> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { name: true },
  });
  return store?.name ?? 'inconnu';
}
