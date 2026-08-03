import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { requirePlatformManager } from '../middlewares/platformMiddleware';
import { validate } from '../middlewares/validate';
import {
  getOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  suspendOrganization,
  reactivateOrganization,
} from '../controllers/platformController';
import {
  listOrganizationsQuerySchema,
  createOrganizationSchema,
  updateOrganizationSchema,
  organizationIdParamsSchema,
} from '../schemas/organization.schema';

const platformRouter = Router();

const platformGuard = [requireAuth, requirePlatformManager];

platformRouter.get(
  '/organizations',
  ...platformGuard,
  validate({ query: listOrganizationsQuerySchema }),
  getOrganizations,
);

platformRouter.get(
  '/organizations/:id',
  ...platformGuard,
  validate({ params: organizationIdParamsSchema }),
  getOrganization,
);

platformRouter.post(
  '/organizations',
  ...platformGuard,
  validate({ body: createOrganizationSchema }),
  createOrganization,
);

platformRouter.patch(
  '/organizations/:id',
  ...platformGuard,
  validate({ params: organizationIdParamsSchema, body: updateOrganizationSchema }),
  updateOrganization,
);

platformRouter.delete(
  '/organizations/:id',
  ...platformGuard,
  validate({ params: organizationIdParamsSchema }),
  deleteOrganization,
);

platformRouter.patch(
  '/organizations/:id/suspend',
  ...platformGuard,
  validate({ params: organizationIdParamsSchema }),
  suspendOrganization,
);

platformRouter.patch(
  '/organizations/:id/reactivate',
  ...platformGuard,
  validate({ params: organizationIdParamsSchema }),
  reactivateOrganization,
);

export default platformRouter;
