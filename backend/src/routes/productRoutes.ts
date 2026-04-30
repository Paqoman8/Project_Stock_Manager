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
const superAdminOnly = [requireAuth, requireRole('Super Administrateur')];

// GET /api/products — liste les produits (filtres : search, categoryId, isActive)
productRouter.get('/', requireAuth, getProducts);

// GET /api/products/:id — récupère un produit par son UUID
productRouter.get('/:id', requireAuth, getProductById);

// POST /api/products — crée un nouveau produit
productRouter.post('/', superAdminOnly, createProduct);

// PUT /api/products/:id — met à jour les champs fournis (sku exclu)
productRouter.put('/:id', superAdminOnly, updateProduct);

// PATCH /api/products/:id/deactivate — désactive un produit (soft delete)
productRouter.patch('/:id/deactivate', superAdminOnly, deactivateProduct);

// PATCH /api/products/:id/reactivate — réactive un produit désactivé
productRouter.patch('/:id/reactivate', superAdminOnly, reactivateProduct);

export default productRouter;
