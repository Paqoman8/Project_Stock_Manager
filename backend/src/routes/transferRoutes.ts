import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';
import { requireOrg } from '../middlewares/orgMiddleware';
import {
  cancelTransfer,
  confirmTransfer,
  createTransfer,
  getTransferById,
  listTransferDestinationStores,
  listTransfers,
} from '../controllers/transferController';

const transferRouter = Router();
const TRANSFER_ROLES = ['Super Administrateur', 'Administrateur', 'Manager Magasin'] as const;

transferRouter.get('/', requireAuth, requireOrg, requireRole(...TRANSFER_ROLES), listTransfers);
transferRouter.get('/options/stores', requireAuth, requireOrg, requireRole(...TRANSFER_ROLES), listTransferDestinationStores);
transferRouter.get('/:id', requireAuth, requireOrg, requireRole(...TRANSFER_ROLES), getTransferById);
transferRouter.post('/', requireAuth, requireOrg, requireRole(...TRANSFER_ROLES), createTransfer);
transferRouter.put('/:id/confirm', requireAuth, requireOrg, requireRole(...TRANSFER_ROLES), confirmTransfer);
transferRouter.put('/:id/cancel', requireAuth, requireOrg, requireRole(...TRANSFER_ROLES), cancelTransfer);

export default transferRouter;
