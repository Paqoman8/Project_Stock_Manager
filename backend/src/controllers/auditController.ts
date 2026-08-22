// src/controllers/auditController.ts
//
// GET /api/audit — retourne les logs d'audit paginés avec filtres.
//
// Règle d'accès :
//   SA  → tous les logs sans restriction
//   Admin → uniquement les logs dont store_id ∈ ses magasins associés
//           (les logs sans store_id, ex : USER_LOGIN_FAILED, ne lui sont pas exposés)

import { Response } from 'express';
import { AuditAction } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import * as auditService from '../services/audit.service';
import { prisma } from '../config/database';

const ROLE_SUPER_ADMIN = 'Super Administrateur';

export async function getAuditLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { userId, roleId, orgId } = req.user!;

  // --- Pagination ---
  const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

  // --- Filtres ---
  // req.query.action peut être une string (1 valeur) ou string[] (plusieurs valeurs)
  // selon qu'Express reçoit ?action=X ou ?action=X&action=Y
  const rawActions = req.query.action;
  const actionList: string[] = Array.isArray(rawActions)
    ? rawActions as string[]
    : typeof rawActions === 'string' && rawActions
      ? [rawActions]
      : [];
  // On ne garde que les valeurs qui correspondent à un AuditAction valide
  const validActions = actionList.filter(
    (a): a is AuditAction => Object.values(AuditAction).includes(a as AuditAction),
  );
  const actions = validActions.length > 0 ? validActions : undefined;

  const actorId   = typeof req.query.actorId === 'string' ? req.query.actorId : undefined;
  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
  const endDate   = req.query.endDate   ? new Date(req.query.endDate   as string) : undefined;

  // Dates invalides → on les ignore plutôt que de planter
  const startDateValide = startDate && !isNaN(startDate.getTime()) ? startDate : undefined;
  const endDateValide   = endDate   && !isNaN(endDate.getTime())   ? endDate   : undefined;

  try {
    // --- Restriction par magasin pour les Admins ---
    let allowedStoreIds: string[] | null = null; // null = SA = pas de restriction

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { name: true },
    });

    if (role?.name !== ROLE_SUPER_ADMIN) {
      // Admin : on récupère ses magasins associés
      const accès = await prisma.userStoreAccess.findMany({
        where: { user_id: userId },
        select: { store_id: true },
      });
      allowedStoreIds = accès.map((a) => a.store_id);
    }

    // --- Filtre explicite par magasin (choix de l'utilisateur dans l'UI) ---
    // Sécurité : on vérifie que le storeId demandé est dans la liste autorisée.
    // Pour le SA (allowedStoreIds === null), tout storeId est accepté.
    // Pour un Admin, on rejette silencieusement les storeIds hors de sa liste.
    const storeIdParam = typeof req.query.storeId === 'string' && req.query.storeId
      ? req.query.storeId
      : undefined;

    const filtreStoreId = storeIdParam && (
      allowedStoreIds === null || allowedStoreIds.includes(storeIdParam)
    ) ? storeIdParam : undefined;

    const résultat = await auditService.getAuditLogs(orgId, {
      actions,
      actorId,
      storeId:   filtreStoreId,
      startDate: startDateValide,
      endDate:   endDateValide,
      allowedStoreIds,
      page,
      limit,
    });

    res.status(200).json({
      success: true,
      ...résultat,
    });
  } catch (erreur) {
    console.error('Erreur lors de la récupération des logs d\'audit :', erreur);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}
