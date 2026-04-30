// src/controllers/supplierController.ts
//
// Handlers HTTP pour la gestion des fournisseurs (Supplier).
// Toutes les routes sont protégées par requireAuth + requireRole('Super Administrateur').
//
// Validation des entrées : Zod inline (schémas définis dans ce fichier).
// Logique métier : déléguée à supplier.service.ts.

import { Response } from 'express';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { resolveActorName, resolveStoreName } from '../services/audit.service';
import * as supplierService from '../services/supplier.service';

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/** Extrait l'IP réelle du client (gère les proxys via X-Forwarded-For). */
function extractIp(req: AuthenticatedRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim() || (req.ip ?? '');
  }
  return req.ip ?? '';
}

/**
 * Formate les erreurs Zod en tableau de messages lisibles pour le client.
 * Exemple : ["name: Le nom est obligatoire", "email: Email invalide"]
 */
function formatZodErrors(err: ZodError): string[] {
  return err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

// ---------------------------------------------------------------------------
// Schéma Zod partagé — utilisé pour create (complet) et update (partiel)
// ---------------------------------------------------------------------------

/**
 * Schéma de validation des données fournisseur.
 * Utilisé tel quel pour la création ; rendu entièrement optionnel pour la mise à jour.
 */
const supplierSchema = z.object({
  name:          z.string().min(1, 'Le nom est obligatoire'),
  contact_name:  z.string().optional(),
  email:         z.string().email('Email invalide').optional(),
  phone:         z.string().max(20, 'Le téléphone ne peut pas dépasser 20 caractères').optional(),
  address:       z.string().optional(),
  payment_terms: z.enum(['IMMEDIATE', 'NET30', 'NET60', 'NET90']).optional(),
});

/** Type inféré depuis le schéma Zod — utilisé pour créer un fournisseur. */
export type SupplierInput = z.infer<typeof supplierSchema>;

/** Schéma partiel pour la mise à jour : tous les champs deviennent optionnels. */
const updateSupplierSchema = supplierSchema.partial();

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/suppliers
 *
 * Retourne la liste des fournisseurs.
 * Filtres acceptés en query params :
 *   - isActive : "true" | "false" — filtre sur le statut actif/inactif
 *   - search   : chaîne libre — recherche sur name, contact_name, email
 *
 * Réponse 200 : { success: true, suppliers: SupplierRow[] }
 *
 * Sécurité : reserved au Super Administrateur (middlewares sur le routeur).
 */
export async function getSuppliers(req: AuthenticatedRequest, res: Response): Promise<void> {
  const isActiveRaw = req.query.isActive as string | undefined;
  const search      = req.query.search  as string | undefined;

  // Conversion de la chaîne "true"/"false" en booléen — undefined si absent
  let isActive: boolean | undefined;
  if (isActiveRaw === 'true')  isActive = true;
  if (isActiveRaw === 'false') isActive = false;

  try {
    const suppliers = await supplierService.getSuppliers({ isActive, search });

    res.status(200).json({
      success: true,
      suppliers,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des fournisseurs :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * GET /api/suppliers/:id
 *
 * Retourne un fournisseur par son UUID.
 *
 * Params   : id — UUID du fournisseur
 * Réponse 200 : { success: true, supplier: SupplierRow }
 * Réponse 404 : { success: false, message } si introuvable
 */
export async function getSupplierById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  try {
    const supplier = await supplierService.getSupplierById(id);

    res.status(200).json({
      success: true,
      supplier,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'SUPPLIER_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Fournisseur introuvable.',
      });
      return;
    }

    console.error('Erreur lors de la récupération du fournisseur :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * POST /api/suppliers
 *
 * Crée un nouveau fournisseur.
 *
 * Body attendu : { name, contact_name?, email?, phone?, address?, payment_terms? }
 * Réponse 201 : { success: true, message, supplier: SupplierRow }
 * Réponse 400 : { success: false, message, errors: string[] } si validation échoue
 * Réponse 409 : { success: false, message } si email déjà utilisé
 *
 * Sécurité : reserved au Super Administrateur. L'actorId est extrait du token JWT.
 */
export async function createSupplier(req: AuthenticatedRequest, res: Response): Promise<void> {
  // Validation Zod
  const parseResult = supplierSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      message: 'Données invalides.',
      errors:  formatZodErrors(parseResult.error),
    });
    return;
  }

  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const supplier = await supplierService.createSupplier(
      parseResult.data,
      actorId,
      actorName,
      storeId,
      storeName,
      ip,
    );

    res.status(201).json({
      success:  true,
      message:  `Le fournisseur "${supplier.name}" a été créé avec succès.`,
      supplier,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'EMAIL_ALREADY_EXISTS') {
      res.status(409).json({
        success: false,
        message: 'Un fournisseur avec cet email existe déjà.',
      });
      return;
    }

    console.error('Erreur lors de la création du fournisseur :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * PUT /api/suppliers/:id
 *
 * Met à jour les champs fournis d'un fournisseur existant.
 *
 * Params  : id — UUID du fournisseur
 * Body    : { name?, contact_name?, email?, phone?, address?, payment_terms? }
 * Réponse 200 : { success: true, message, supplier: SupplierRow }
 * Réponse 400 : { success: false, message, errors: string[] } si validation échoue
 * Réponse 404 : { success: false, message } si introuvable
 * Réponse 409 : { success: false, message } si email déjà utilisé
 */
export async function updateSupplier(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  // Validation Zod (schéma partiel)
  const parseResult = updateSupplierSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      message: 'Données invalides.',
      errors:  formatZodErrors(parseResult.error),
    });
    return;
  }

  // Au moins un champ doit être fourni
  if (Object.keys(parseResult.data).length === 0) {
    res.status(400).json({
      success: false,
      message: 'Au moins un champ doit être fourni pour la mise à jour.',
    });
    return;
  }

  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const supplier = await supplierService.updateSupplier(
      id,
      parseResult.data,
      actorId,
      actorName,
      storeId,
      storeName,
      ip,
    );

    res.status(200).json({
      success:  true,
      message:  `Le fournisseur "${supplier.name}" a été mis à jour avec succès.`,
      supplier,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'SUPPLIER_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Fournisseur introuvable.',
      });
      return;
    }

    if (error instanceof Error && error.message === 'EMAIL_ALREADY_EXISTS') {
      res.status(409).json({
        success: false,
        message: 'Un fournisseur avec cet email existe déjà.',
      });
      return;
    }

    console.error('Erreur lors de la mise à jour du fournisseur :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * PATCH /api/suppliers/:id/deactivate
 *
 * Désactive un fournisseur (soft delete — is_active = false).
 *
 * Params   : id — UUID du fournisseur
 * Réponse 200 : { success: true, message, supplier: SupplierRow }
 * Réponse 404 : { success: false, message } si introuvable
 */
export async function deactivateSupplier(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const supplier = await supplierService.deactivateSupplier(id, actorId, actorName, storeId, storeName, ip);

    res.status(200).json({
      success:  true,
      message:  `Le fournisseur "${supplier.name}" a été désactivé.`,
      supplier,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'SUPPLIER_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Fournisseur introuvable.',
      });
      return;
    }

    console.error('Erreur lors de la désactivation du fournisseur :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * PATCH /api/suppliers/:id/reactivate
 *
 * Réactive un fournisseur désactivé (is_active = true).
 *
 * Params   : id — UUID du fournisseur
 * Réponse 200 : { success: true, message, supplier: SupplierRow }
 * Réponse 404 : { success: false, message } si introuvable
 */
export async function reactivateSupplier(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const supplier = await supplierService.reactivateSupplier(id, actorId, actorName, storeId, storeName, ip);

    res.status(200).json({
      success:  true,
      message:  `Le fournisseur "${supplier.name}" a été réactivé.`,
      supplier,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'SUPPLIER_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Fournisseur introuvable.',
      });
      return;
    }

    console.error('Erreur lors de la réactivation du fournisseur :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}
