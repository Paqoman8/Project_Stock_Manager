// src/routes/storeRoutes.ts
//
// Routes de gestion des établissements.
// Toutes les routes sont protégées : requireAuth + requireRole('Super Administrateur').

import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import { requireOrg } from '../middlewares/orgMiddleware';
import {
  getStores,
  createStore,
  updateStore,
  closeStore,
  reopenStore,
  deleteStore,
} from '../controllers/storeController';

const storeRouter = Router();

// Raccourci pour la pile de middlewares partagée
const superAdminOnly = [requireAuth, requireOrg, requireRole('Super Administrateur')];

// GET /api/stores — liste tous les établissements (tous statuts)
storeRouter.get('/', superAdminOnly, getStores);

// POST /api/stores — crée un nouvel établissement
storeRouter.post('/', superAdminOnly, createStore);

// PATCH /api/stores/:id — met à jour les champs fournis
storeRouter.patch('/:id', superAdminOnly, updateStore);

// POST /api/stores/:id/close — ferme un établissement
storeRouter.post('/:id/close', superAdminOnly, closeStore);

// POST /api/stores/:id/reopen — réouvre un établissement fermé
storeRouter.post('/:id/reopen', superAdminOnly, reopenStore);

// DELETE /api/stores/:id — supprime définitivement (uniquement si vierge)
storeRouter.delete('/:id', superAdminOnly, deleteStore);

export default storeRouter;
