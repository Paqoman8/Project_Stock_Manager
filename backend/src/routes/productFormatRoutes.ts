// src/routes/productFormatRoutes.ts
//
// Routes de gestion des formats de produit (ProductFormat).
//
// Règles d'accès :
//   - GET  : requireAuth uniquement (tous les utilisateurs authentifiés)
//   - POST / PUT / DELETE : requireAuth + requireRole('Super Administrateur', 'Administrateur')

import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import {
  getProductFormats,
  createProductFormat,
  updateProductFormat,
  deleteProductFormat,
} from '../controllers/productFormatController';

const productFormatRouter = Router();

// Raccourci pour la pile de middlewares réservée aux admins (SA + Admin)
const adminOnly = [requireAuth, requireRole('Super Administrateur', 'Administrateur')];

// GET /api/product-formats — liste tous les formats triés par label ASC
productFormatRouter.get('/', requireAuth, getProductFormats);

// POST /api/product-formats — crée un nouveau format
productFormatRouter.post('/', adminOnly, createProductFormat);

// PUT /api/product-formats/:id — met à jour le label d'un format existant
productFormatRouter.put('/:id', adminOnly, updateProductFormat);

// DELETE /api/product-formats/:id — supprime un format (interdit si en usage)
productFormatRouter.delete('/:id', adminOnly, deleteProductFormat);

export default productFormatRouter;
