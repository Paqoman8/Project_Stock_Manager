// src/routes/productRoutes.ts
//
// Routes de gestion des produits (Product).
//
// Règles d'accès :
//   - GET  : requireAuth uniquement (tous les utilisateurs authentifiés)
//   - POST / PUT / PATCH : requireAuth + requireRole('Super Administrateur')

import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import { requireOrg } from '../middlewares/orgMiddleware';
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deactivateProduct,
  reactivateProduct,
} from '../controllers/productController';

const productRouter = Router();

// Raccourci pour la pile de middlewares réservée au Super Administrateur
const superAdminOnly = [requireAuth, requireOrg, requireRole('Super Administrateur')];

// GET /api/products — liste les produits (filtres : search, categoryId, isActive)
productRouter.get('/', requireAuth, requireOrg, getProducts);

// GET /api/products/:id — récupère un produit par son UUID
productRouter.get('/:id', requireAuth, requireOrg, getProductById);

// POST /api/products — crée un nouveau produit (SA + Admin)
productRouter.post('/', requireAuth, requireOrg, createProduct);

// PUT /api/products/:id — met à jour les champs fournis / sku exclu (SA + Admin)
productRouter.put('/:id', requireAuth, requireOrg, updateProduct);

// PATCH /api/products/:id/deactivate — désactive un produit (SA uniquement)
productRouter.patch('/:id/deactivate', superAdminOnly, deactivateProduct);

// PATCH /api/products/:id/reactivate — réactive un produit désactivé (SA uniquement)
productRouter.patch('/:id/reactivate', superAdminOnly, reactivateProduct);

export default productRouter;
