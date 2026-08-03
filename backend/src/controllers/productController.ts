// src/controllers/productController.ts
//
// Handlers HTTP pour la gestion des produits (Product).
// Toutes les routes de lecture sont protégées par requireAuth.
// Les routes de mutation requièrent requireAuth + requireRole('Super Administrateur').
//
// Validation des entrées : Zod inline (schémas définis dans ce fichier).
// Logique métier : déléguée à product.service.ts.

import { Response } from 'express';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { resolveActorName, resolveStoreName } from '../services/audit.service';
import * as productService from '../services/product.service';
import { extractIp } from '../utils/request';
import { formatZodErrors } from '../utils/zod';

// ---------------------------------------------------------------------------
// Schéma Zod — utilisé pour create (complet) et update (partiel)
// ---------------------------------------------------------------------------

/**
 * Schéma de validation des données produit.
 * Utilisé tel quel pour la création ; rendu entièrement optionnel pour la mise à jour.
 */
const PRODUCT_UNITS = ['PIECE', 'KG', 'G', 'L', 'CL', 'ML', 'BOUTEILLE', 'SACHET', 'BOITE'] as const;

const productSchema = z.object({
  /** SKU (Stock Keeping Unit) — obligatoire, non vide */
  sku:         z.string().min(1, 'Le SKU est obligatoire'),
  /** Nom commercial du produit — obligatoire, non vide */
  name:        z.string().min(1, 'Le nom est obligatoire'),
  /** Prix de vente — doit être strictement positif */
  price:       z.number().positive('Le prix doit être positif'),
  /** Unité de stock — optionnelle, défaut PIECE en base */
  unit:        z.enum(PRODUCT_UNITS).optional(),
  /** UUID de la catégorie parente — obligatoire */
  category_id: z.string().uuid('UUID de catégorie invalide'),
  /** Description libre — optionnelle */
  description: z.string().optional(),
});

/** Schéma de création : étend le schéma de base avec le format de base obligatoire. */
const createProductSchema = productSchema.extend({
  initial_format: z.object({
    label: z.string().min(1, 'Le libellé du format de base est obligatoire.').max(50),
  }),
});

/** Type inféré depuis le schéma Zod — utilisé pour créer un produit. */
export type ProductInput = z.infer<typeof productSchema>;

/**
 * Schéma partiel pour la mise à jour : tous les champs deviennent optionnels.
 * Le SKU est exclu car il est immuable après création.
 */
const updateProductSchema = productSchema.omit({ sku: true }).partial();

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/products
 *
 * Retourne la liste des produits avec filtres optionnels.
 * Query params :
 *   - search     : chaîne libre — recherche sur name ou sku
 *   - categoryId : UUID — filtre par catégorie
 *   - isActive   : "true" | "false" — filtre par statut
 *
 * Réponse 200 : { success: true, products: ProductRow[] }
 *
 * Sécurité : requireAuth.
 */
export async function getProducts(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId       = req.user!.orgId;
  const search      = req.query.search     as string | undefined;
  const categoryId  = req.query.categoryId as string | undefined;
  const isActiveRaw = req.query.isActive   as string | undefined;

  // Conversion de la chaîne "true"/"false" en booléen — undefined si absent
  let isActive: boolean | undefined;
  if (isActiveRaw === 'true')  isActive = true;
  if (isActiveRaw === 'false') isActive = false;

  try {
    const products = await productService.getProducts(orgId, { search, categoryId, isActive });

    res.status(200).json({
      success: true,
      products,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des produits :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * GET /api/products/:id
 *
 * Retourne un produit par son UUID.
 *
 * Params   : id — UUID du produit
 * Réponse 200 : { success: true, product: ProductRow }
 * Réponse 404 : { success: false, message } si introuvable
 *
 * Sécurité : requireAuth.
 */
export async function getProductById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId = req.user!.orgId;
  const id = req.params.id as string;

  try {
    const product = await productService.getProductById(orgId, id);

    res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Produit introuvable.',
      });
      return;
    }

    console.error('Erreur lors de la récupération du produit :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * POST /api/products
 *
 * Crée un nouveau produit.
 *
 * Body attendu : { sku, name, price, category_id, description? }
 * Réponse 201 : { success: true, message, product: ProductRow }
 * Réponse 400 : { success: false, message, errors: string[] } si validation échoue
 * Réponse 409 : { success: false, message } si SKU déjà utilisé
 * Réponse 422 : { success: false, message } si catégorie introuvable
 *
 * Sécurité : requireAuth + requireRole('Super Administrateur').
 * L'actorId et le storeId sont extraits du token JWT — jamais du body.
 */
export async function createProduct(req: AuthenticatedRequest, res: Response): Promise<void> {
  // Validation Zod
  const parseResult = createProductSchema.safeParse(req.body);
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
  const orgId   = req.user!.orgId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const product = await productService.createProduct(
      orgId,
      parseResult.data,
      actorId,
      actorName,
      storeId,
      storeName,
      ip,
      parseResult.data.initial_format?.label,
    );

    res.status(201).json({
      success:  true,
      message:  `Le produit "${product.name}" a été créé avec succès.`,
      product,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'SKU_ALREADY_EXISTS') {
      res.status(409).json({
        success: false,
        message: 'Un produit avec ce SKU existe déjà.',
      });
      return;
    }

    if (error instanceof Error && error.message === 'CATEGORY_NOT_FOUND') {
      res.status(422).json({
        success: false,
        message: 'La catégorie référencée est introuvable.',
      });
      return;
    }

    console.error('Erreur lors de la création du produit :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * PUT /api/products/:id
 *
 * Met à jour les champs fournis d'un produit existant (sku exclu — immuable).
 *
 * Params  : id — UUID du produit
 * Body    : { name?, price?, category_id?, description? }
 * Réponse 200 : { success: true, message, product: ProductRow }
 * Réponse 400 : { success: false, message, errors: string[] } si validation échoue
 * Réponse 404 : { success: false, message } si introuvable
 * Réponse 422 : { success: false, message } si nouvelle catégorie introuvable
 *
 * Sécurité : requireAuth + requireRole('Super Administrateur').
 */
export async function updateProduct(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  // Validation Zod (schéma partiel sans sku)
  const parseResult = updateProductSchema.safeParse(req.body);
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
  const orgId   = req.user!.orgId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const product = await productService.updateProduct(
      orgId,
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
      message:  `Le produit "${product.name}" a été mis à jour avec succès.`,
      product,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Produit introuvable.',
      });
      return;
    }

    if (error instanceof Error && error.message === 'CATEGORY_NOT_FOUND') {
      res.status(422).json({
        success: false,
        message: 'La catégorie référencée est introuvable.',
      });
      return;
    }

    console.error('Erreur lors de la mise à jour du produit :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * PATCH /api/products/:id/deactivate
 *
 * Désactive un produit (soft delete — is_active = false).
 *
 * Params   : id — UUID du produit
 * Réponse 200 : { success: true, message, product: ProductRow }
 * Réponse 404 : { success: false, message } si introuvable
 *
 * Sécurité : requireAuth + requireRole('Super Administrateur').
 */
export async function deactivateProduct(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId   = req.user!.orgId;
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const product = await productService.deactivateProduct(orgId, id, actorId, actorName, storeId, storeName, ip);

    res.status(200).json({
      success:  true,
      message:  `Le produit "${product.name}" a été désactivé.`,
      product,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Produit introuvable.',
      });
      return;
    }

    console.error('Erreur lors de la désactivation du produit :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}

/**
 * PATCH /api/products/:id/reactivate
 *
 * Réactive un produit désactivé (is_active = true).
 *
 * Params   : id — UUID du produit
 * Réponse 200 : { success: true, message, product: ProductRow }
 * Réponse 404 : { success: false, message } si introuvable
 *
 * Sécurité : requireAuth + requireRole('Super Administrateur').
 */
export async function reactivateProduct(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId   = req.user!.orgId;
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const product = await productService.reactivateProduct(orgId, id, actorId, actorName, storeId, storeName, ip);

    res.status(200).json({
      success:  true,
      message:  `Le produit "${product.name}" a été réactivé.`,
      product,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Produit introuvable.',
      });
      return;
    }

    console.error('Erreur lors de la réactivation du produit :', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue.',
    });
  }
}
