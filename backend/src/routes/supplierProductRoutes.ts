// src/routes/supplierProductRoutes.ts
//
// Routes de gestion du catalogue fournisseur (SupplierProduct).
// Toutes les routes sont protégées : requireAuth + requireRole('Super Administrateur').

import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import { requireOrg } from '../middlewares/orgMiddleware';
import {
  getSupplierProducts,
  getSupplierProductById,
  createSupplierProduct,
  updateSupplierProduct,
  deleteSupplierProduct,
} from '../controllers/supplierProductController';

const supplierProductRouter = Router();

// Raccourci pour la pile de middlewares partagée
const superAdminOnly = [requireAuth, requireOrg, requireRole('Super Administrateur')];

// GET /api/supplier-products — liste (filtres : supplier_id, product_id, isActive)
supplierProductRouter.get('/', superAdminOnly, getSupplierProducts);

// GET /api/supplier-products/:id — récupère une entrée par son UUID
supplierProductRouter.get('/:id', superAdminOnly, getSupplierProductById);

// POST /api/supplier-products — crée une nouvelle entrée du catalogue
supplierProductRouter.post('/', superAdminOnly, createSupplierProduct);

// PUT /api/supplier-products/:id — met à jour les champs fournis
supplierProductRouter.put('/:id', superAdminOnly, updateSupplierProduct);

// DELETE /api/supplier-products/:id — soft delete (is_active = false)
supplierProductRouter.delete('/:id', superAdminOnly, deleteSupplierProduct);

export default supplierProductRouter;
