// src/controllers/storeController.ts
//
// Handlers HTTP pour la gestion des établissements (Store).
// Toutes les routes sont protégées par requireAuth + requireRole('Super Administrateur').
//
// Validation des entrées : Zod inline (schémas définis dans ce fichier).
// Logique métier : déléguée à store.service.ts.

import { Response } from 'express';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { resolveActorName } from '../services/audit.service';
import * as storeService from '../services/store.service';
import { extractIp } from '../utils/request';
import { formatZodErrors } from '../utils/zod';

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

/**
 * Schéma de validation pour la création d'un établissement.
 * Tous les champs obligatoires doivent être présents.
 */
const createStoreSchema = z.object({
  name:        z.string().min(1, 'Le nom est obligatoire').max(100, 'Le nom ne peut pas dépasser 100 caractères'),
  type:        z.enum(['MAGASIN', 'BOUTIQUE', 'ENTREPOT'], 'Le type doit être MAGASIN, BOUTIQUE ou ENTREPOT'),
  color:       z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'La couleur doit être un code hexadécimal valide (ex: #1D4ED8)'),
  location:    z.string().max(200, 'La localisation ne peut pas dépasser 200 caractères').optional(),
  phone:       z.string().max(20,  'Le téléphone ne peut pas dépasser 20 caractères').optional(),
  description: z.string().max(500, 'La description ne peut pas dépasser 500 caractères').optional(),
});

/**
 * Schéma de validation pour la mise à jour d'un établissement.
 * Tous les champs sont optionnels — on ne met à jour que ce qui est fourni.
 */
const updateStoreSchema = z.object({
  name:        z.string().min(1, 'Le nom est obligatoire').max(100, 'Le nom ne peut pas dépasser 100 caractères').optional(),
  type:        z.enum(['MAGASIN', 'BOUTIQUE', 'ENTREPOT'], 'Le type doit être MAGASIN, BOUTIQUE ou ENTREPOT').optional(),
  color:       z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'La couleur doit être un code hexadécimal valide (ex: #1D4ED8)').optional(),
  location:    z.string().max(200, 'La localisation ne peut pas dépasser 200 caractères').optional(),
  phone:       z.string().max(20,  'Le téléphone ne peut pas dépasser 20 caractères').optional(),
  description: z.string().max(500, 'La description ne peut pas dépasser 500 caractères').optional(),
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/stores
 *
 * Retourne la liste de tous les établissements (tous statuts).
 * Réservé au Super Administrateur.
 *
 * Réponse 200 : { success: true, stores: StoreRow[] }
 */
export async function getStores(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId = req.user!.orgId;
  try {
    const stores = await storeService.getAllStores(orgId);

    res.status(200).json({
      success: true,
      stores,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des établissements :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * POST /api/stores
 *
 * Crée un nouvel établissement.
 * Réservé au Super Administrateur.
 *
 * Body attendu : { name, type, color, location?, phone?, description? }
 * Réponse 201 : { success: true, message, store: StoreRow }
 * Réponse 400 : { success: false, message, errors: string[] } si validation échoue
 */
export async function createStore(req: AuthenticatedRequest, res: Response): Promise<void> {
  // Validation Zod
  const parseResult = createStoreSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      message: 'Données invalides.',
      errors:  formatZodErrors(parseResult.error),
    });
    return;
  }

  const actorId = req.user!.userId;
  const orgId   = req.user!.orgId;
  const ip      = extractIp(req);

  try {
    // Résolution du nom de l'acteur pour la dénormalisation dans les logs d'audit
    const actorName = await resolveActorName(actorId);

    const store = await storeService.createStore(
      { ...parseResult.data, orgId },
      actorId,
      actorName,
      ip,
    );

    res.status(201).json({
      success: true,
      message: `L'établissement "${store.name}" a été créé avec succès.`,
      store,
    });
  } catch (error) {
    console.error('Erreur lors de la création de l\'établissement :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * PATCH /api/stores/:id
 *
 * Met à jour un établissement existant.
 * Réservé au Super Administrateur.
 *
 * Params : id — UUID de l'établissement
 * Body   : champs à modifier (au moins un champ requis)
 * Réponse 200 : { success: true, message, store: StoreRow }
 */
export async function updateStore(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  // Validation Zod
  const parseResult = updateStoreSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      message: 'Données invalides.',
      errors:  formatZodErrors(parseResult.error),
    });
    return;
  }

  // Vérification qu'au moins un champ est fourni
  if (Object.keys(parseResult.data).length === 0) {
    res.status(400).json({
      success: false,
      message: 'Au moins un champ doit être fourni pour la mise à jour.',
    });
    return;
  }

  const actorId = req.user!.userId;
  const orgId   = req.user!.orgId;
  const ip      = extractIp(req);

  try {
    const actorName = await resolveActorName(actorId);

    const store = await storeService.updateStore(
      orgId,
      id,
      parseResult.data,
      actorId,
      actorName,
      ip,
    );

    res.status(200).json({
      success: true,
      message: `L'établissement "${store.name}" a été mis à jour avec succès.`,
      store,
    });
  } catch (error) {
    // Gestion du cas "établissement introuvable" (erreur Prisma P2025)
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      res.status(404).json({
        success: false,
        message: 'Établissement introuvable.',
      });
      return;
    }

    console.error('Erreur lors de la mise à jour de l\'établissement :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * POST /api/stores/:id/close
 *
 * Ferme un établissement (status → CLOSED, closed_at = maintenant).
 * Réservé au Super Administrateur.
 *
 * Params   : id — UUID de l'établissement
 * Réponse 200 : { success: true, message, store: StoreRow }
 */
export async function closeStore(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const orgId   = req.user!.orgId;
  const ip      = extractIp(req);

  try {
    const actorName = await resolveActorName(actorId);
    const store = await storeService.closeStore(orgId, id, actorId, actorName, ip);

    res.status(200).json({
      success: true,
      message: `L'établissement "${store.name}" a été fermé.`,
      store,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'STORE_PROTECTED') {
      res.status(403).json({
        success: false,
        message: 'Cet établissement est protégé et ne peut pas être fermé.',
      });
      return;
    }

    if (error instanceof Error && error.message.includes('Record to update not found')) {
      res.status(404).json({
        success: false,
        message: 'Établissement introuvable.',
      });
      return;
    }

    console.error('Erreur lors de la fermeture de l\'établissement :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * POST /api/stores/:id/reopen
 *
 * Réouvre un établissement fermé (status → ACTIVE, closed_at = null).
 * Réservé au Super Administrateur.
 *
 * Params   : id — UUID de l'établissement
 * Réponse 200 : { success: true, message, store: StoreRow }
 */
export async function reopenStore(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const orgId   = req.user!.orgId;
  const ip      = extractIp(req);

  try {
    const actorName = await resolveActorName(actorId);
    const store = await storeService.reopenStore(orgId, id, actorId, actorName, ip);

    res.status(200).json({
      success: true,
      message: `L'établissement "${store.name}" a été réouvert.`,
      store,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      res.status(404).json({
        success: false,
        message: 'Établissement introuvable.',
      });
      return;
    }

    console.error('Erreur lors de la réouverture de l\'établissement :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * DELETE /api/stores/:id
 *
 * Supprime définitivement un établissement vierge de données.
 * Réservé au Super Administrateur.
 *
 * Retourne HTTP 409 si l'établissement possède des données liées
 * (transactions, transferts, ou stock non nul).
 *
 * Params   : id — UUID de l'établissement
 * Réponse 200 : { success: true, message }
 * Réponse 409 : { success: false, message } si données liées détectées
 */
export async function deleteStore(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const orgId   = req.user!.orgId;
  const ip      = extractIp(req);

  try {
    const actorName = await resolveActorName(actorId);
    await storeService.deleteStore(orgId, id, actorId, actorName, ip);

    res.status(200).json({
      success: true,
      message: 'L\'établissement a été supprimé avec succès.',
    });
  } catch (error) {
    // Cas métier : des données liées empêchent la suppression
    if (error instanceof Error && error.message === 'STORE_HAS_DEPENDENCIES') {
      res.status(409).json({
        success: false,
        message: 'Cet établissement ne peut pas être supprimé car il possède des données liées.',
      });
      return;
    }

    // Cas métier : établissement protégé (ex: Hub Central) — non supprimable
    if (error instanceof Error && error.message === 'STORE_PROTECTED') {
      res.status(403).json({
        success: false,
        message: 'Cet établissement est protégé et ne peut pas être supprimé.',
      });
      return;
    }

    // Cas "introuvable" — Prisma P2025
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      res.status(404).json({
        success: false,
        message: 'Établissement introuvable.',
      });
      return;
    }

    console.error('Erreur lors de la suppression de l\'établissement :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}
