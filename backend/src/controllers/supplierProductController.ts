// src/controllers/supplierProductController.ts
//
// Handlers HTTP pour la gestion du catalogue fournisseur (SupplierProduct).
// Toutes les routes sont protégées par requireAuth + requireRole('Super Administrateur').
//
// Validation des entrées : Zod inline (schémas définis dans ce fichier).
// Logique métier : déléguée à supplier_product.service.ts.

import { Response } from 'express';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { resolveActorName, resolveStoreName } from '../services/audit.service';
import * as supplierProductService from '../services/supplier_product.service';
import { sendInternalError } from '../utils/httpError';

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
 * Exemple : ["purchase_price: Expected number, received string"]
 */
function formatZodErrors(err: ZodError): string[] {
  return err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

// ---------------------------------------------------------------------------
// Schémas Zod — inline, utilisés dans les handlers
// ---------------------------------------------------------------------------

/**
 * Schéma de validation pour la création d'un enregistrement du catalogue fournisseur.
 * supplier_id et product_id sont requis uniquement à la création.
 */
const supplierProductSchema = z.object({
  supplier_id:          z.string().uuid(),
  product_id:           z.string().uuid(),
  supplier_ref:         z.string().optional(),
  purchase_price:       z.number().positive(),
  packaging_format_id:  z.string().uuid('UUID de format de conditionnement invalide'),
  min_order_qty:        z.number().int().positive().optional(),
  is_preferred:         z.boolean().optional(),
});

/** Type inféré depuis le schéma de création. */
export type SupplierProductInput = z.infer<typeof supplierProductSchema>;

/**
 * Schéma partiel pour la mise à jour — supplier_id et product_id sont omis
 * (on ne peut pas changer la clé d'un catalogue), tous les autres champs
 * sont optionnels. is_active est exposé pour permettre la réactivation via PUT.
 */
const updateSupplierProductSchema = supplierProductSchema
  .omit({ supplier_id: true, product_id: true })
  .partial()
  .extend({ is_active: z.boolean().optional() });

/** Type inféré depuis le schéma de mise à jour. */
export type UpdateSupplierProductInput = z.infer<typeof updateSupplierProductSchema>;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/supplier-products
 *
 * Retourne la liste des enregistrements du catalogue fournisseur.
 * Filtres acceptés en query params :
 *   - supplier_id : UUID — filtre par fournisseur
 *   - product_id  : UUID — filtre par produit
 *   - isActive    : "true" | "false" — filtre sur le statut actif/inactif
 *
 * Réponse 200 : { success: true, supplierProducts: SupplierProductRow[] }
 *
 * Sécurité : réservé au Super Administrateur (middlewares sur le routeur).
 */
export async function getSupplierProducts(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const supplier_id  = req.query.supplier_id as string | undefined;
  const product_id   = req.query.product_id  as string | undefined;
  const isActiveRaw  = req.query.isActive    as string | undefined;

  let isActive: boolean | undefined;
  if (isActiveRaw === 'true')  isActive = true;
  if (isActiveRaw === 'false') isActive = false;

  try {
    const supplierProducts = await supplierProductService.getSupplierProducts({
      supplier_id,
      product_id,
      isActive,
    });

    res.status(200).json({
      success: true,
      supplierProducts,
    });
  } catch (error) {
    sendInternalError(res, error, 'getSupplierProducts');
  }
}

/**
 * GET /api/supplier-products/:id
 *
 * Retourne un enregistrement du catalogue fournisseur par son UUID.
 *
 * Params      : id — UUID de l'enregistrement
 * Réponse 200 : { success: true, supplierProduct: SupplierProductRow }
 * Réponse 404 : { success: false, message } si introuvable
 */
export async function getSupplierProductById(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const id = req.params.id as string;

  try {
    const supplierProduct = await supplierProductService.getSupplierProductById(id);

    res.status(200).json({
      success: true,
      supplierProduct,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'SUPPLIER_PRODUCT_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Entrée du catalogue fournisseur introuvable.',
      });
      return;
    }

    sendInternalError(res, error, 'getSupplierProductById');
  }
}

/**
 * POST /api/supplier-products
 *
 * Crée un nouvel enregistrement dans le catalogue fournisseur.
 *
 * Body attendu : { supplier_id, product_id, purchase_price, packaging_format_id, supplier_ref?,
 *                  min_order_qty?, is_preferred? }
 * Réponse 201  : { success: true, message, supplierProduct: SupplierProductRow }
 * Réponse 400  : { success: false, message, errors: string[] } si validation Zod échoue
 * Réponse 404  : { success: false, message } si fournisseur ou produit introuvable
 * Réponse 409  : { success: false, message } si le couple (supplier_id, product_id) existe déjà
 *
 * Sécurité : l'actorId est extrait du token JWT — jamais depuis le body.
 */
export async function createSupplierProduct(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  // Validation Zod
  const parseResult = supplierProductSchema.safeParse(req.body);
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

    const supplierProduct = await supplierProductService.createSupplierProduct(
      parseResult.data,
      actorId,
      actorName,
      storeId,
      storeName,
      ip,
    );

    res.status(201).json({
      success:         true,
      message:         `Le catalogue "${supplierProduct.supplier.name} → ${supplierProduct.product.name}" a été créé avec succès.`,
      supplierProduct,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'SUPPLIER_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Fournisseur introuvable.',
      });
      return;
    }

    if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Produit introuvable.',
      });
      return;
    }

    if (error instanceof Error && error.message === 'PACKAGING_FORMAT_NOT_FOUND') {
      res.status(422).json({
        success: false,
        message: 'Le format de conditionnement est introuvable ou n\'appartient pas au produit sélectionné.',
      });
      return;
    }

    if (error instanceof Error && error.message === 'SUPPLIER_PRODUCT_ALREADY_EXISTS') {
      res.status(409).json({
        success: false,
        message: 'Une entrée de catalogue existe déjà pour ce fournisseur, ce produit et ce format.',
      });
      return;
    }

    sendInternalError(res, error, 'createSupplierProduct');
  }
}

/**
 * PUT /api/supplier-products/:id
 *
 * Met à jour les champs fournis d'un enregistrement existant.
 *
 * Params  : id — UUID de l'enregistrement
 * Body    : { supplier_ref?, purchase_price?, packaging_format_id?,
 *             min_order_qty?, is_preferred?, is_active? }
 * Réponse 200 : { success: true, message, supplierProduct: SupplierProductRow }
 * Réponse 400 : { success: false, message, errors: string[] } si validation Zod échoue
 * Réponse 404 : { success: false, message } si introuvable
 */
export async function updateSupplierProduct(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const id = req.params.id as string;

  // Validation Zod (schéma partiel)
  const parseResult = updateSupplierProductSchema.safeParse(req.body);
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

    const supplierProduct = await supplierProductService.updateSupplierProduct(
      id,
      parseResult.data,
      actorId,
      actorName,
      storeId,
      storeName,
      ip,
    );

    res.status(200).json({
      success:         true,
      message:         `Le catalogue "${supplierProduct.supplier.name} → ${supplierProduct.product.name}" a été mis à jour avec succès.`,
      supplierProduct,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'SUPPLIER_PRODUCT_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Entrée du catalogue fournisseur introuvable.',
      });
      return;
    }

    if (error instanceof Error && error.message === 'PACKAGING_FORMAT_NOT_FOUND') {
      res.status(422).json({
        success: false,
        message: 'Le format de conditionnement est introuvable ou n\'appartient pas au produit sélectionné.',
      });
      return;
    }

    sendInternalError(res, error, 'updateSupplierProduct');
  }
}

/**
 * DELETE /api/supplier-products/:id
 *
 * Désactive un enregistrement du catalogue fournisseur (soft delete — is_active = false).
 *
 * Params      : id — UUID de l'enregistrement
 * Réponse 200 : { success: true, message, supplierProduct: SupplierProductRow }
 * Réponse 404 : { success: false, message } si introuvable
 */
export async function deleteSupplierProduct(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const supplierProduct = await supplierProductService.deleteSupplierProduct(
      id,
      actorId,
      actorName,
      storeId,
      storeName,
      ip,
    );

    res.status(200).json({
      success:         true,
      message:         `Le catalogue "${supplierProduct.supplier.name} → ${supplierProduct.product.name}" a été désactivé.`,
      supplierProduct,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'SUPPLIER_PRODUCT_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Entrée du catalogue fournisseur introuvable.',
      });
      return;
    }

    sendInternalError(res, error, 'deleteSupplierProduct');
  }
}
