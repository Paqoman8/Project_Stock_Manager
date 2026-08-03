// src/routes/supplierRoutes.ts
//
// Routes de gestion des fournisseurs (Supplier).
// Toutes les routes sont protégées : requireAuth + requireRole('Super Administrateur').

import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import { requireOrg } from '../middlewares/orgMiddleware';
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deactivateSupplier,
  reactivateSupplier,
} from '../controllers/supplierController';

const supplierRouter = Router();

// Raccourci pour la pile de middlewares partagée
const superAdminOnly = [requireAuth, requireOrg, requireRole('Super Administrateur')];

// GET /api/suppliers — liste les fournisseurs (filtres : isActive, search)
supplierRouter.get('/', superAdminOnly, getSuppliers);

// GET /api/suppliers/:id — récupère un fournisseur par son UUID
supplierRouter.get('/:id', superAdminOnly, getSupplierById);

// POST /api/suppliers — crée un nouveau fournisseur
supplierRouter.post('/', superAdminOnly, createSupplier);

// PUT /api/suppliers/:id — met à jour les champs fournis
supplierRouter.put('/:id', superAdminOnly, updateSupplier);

// PATCH /api/suppliers/:id/deactivate — désactive un fournisseur (soft delete)
supplierRouter.patch('/:id/deactivate', superAdminOnly, deactivateSupplier);

// PATCH /api/suppliers/:id/reactivate — réactive un fournisseur désactivé
supplierRouter.patch('/:id/reactivate', superAdminOnly, reactivateSupplier);

export default supplierRouter;
