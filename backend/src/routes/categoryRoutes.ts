// src/routes/categoryRoutes.ts
//
// Routes de gestion des catégories (Category).
//
// Règles d'accès :
//   - GET  : requireAuth uniquement (tous les utilisateurs authentifiés)
//   - POST / PUT / DELETE : requireAuth + requireRole('Super Administrateur')

import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/categoryController';

const categoryRouter = Router();

// Raccourci pour la pile de middlewares réservée au Super Administrateur
const superAdminOnly = [requireAuth, requireRole('Super Administrateur')];

// GET /api/categories — liste toutes les catégories avec parent et compteurs
categoryRouter.get('/', requireAuth, getCategories);

// GET /api/categories/:id — récupère une catégorie par son UUID
categoryRouter.get('/:id', requireAuth, getCategoryById);

// POST /api/categories — crée une nouvelle catégorie
categoryRouter.post('/', superAdminOnly, createCategory);

// PUT /api/categories/:id — met à jour les champs fournis
categoryRouter.put('/:id', superAdminOnly, updateCategory);

// DELETE /api/categories/:id — supprime physiquement (gardée si pas en usage)
categoryRouter.delete('/:id', superAdminOnly, deleteCategory);

export default categoryRouter;
