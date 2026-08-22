import { Response } from 'express';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { resolveActorName, resolveStoreName } from '../services/audit.service';
import * as authService from '../services/auth.service';
import * as transferService from '../services/transfer.service';
import { extractIp } from '../utils/request';
import { formatZodErrors } from '../utils/zod';

// PostgreSQL accepte n'importe quel format UUID (v1-v5 et UUID nil). La validation
// Zod .uuid() par défaut exige un UUID v4, ce qui rejetterait les identifiants
// historiques non v4 encore présents en base. On accepte donc tout UUID valide.
const UUID_ANY_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createTransferSchema = z.object({
  from_store_id: z.string().regex(UUID_ANY_REGEX, 'from_store_id invalide'),
  to_store_id: z.string().regex(UUID_ANY_REGEX, 'to_store_id invalide'),
  items: z.array(
    z.object({
      product_id: z.string().regex(UUID_ANY_REGEX, 'product_id invalide'),
      qty: z.number().int().min(1, 'qty doit être >= 1').optional(),
      packaging_format_id: z.string().regex(UUID_ANY_REGEX, 'packaging_format_id invalide').optional(),
      packages_count: z.number().int().min(1, 'packages_count doit être >= 1').optional(),
    }),
  ).min(1, 'Au moins un item est requis.')
    .refine(
      (items) => items.every((item) => (item.packaging_format_id ? item.packages_count !== undefined : item.qty !== undefined)),
      { message: 'Chaque ligne doit fournir qty (sans format) ou packages_count + packaging_format_id (avec format).' },
    ),
});

const listTransfersQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'page doit être >= 1').default(1),
  limit: z.coerce.number().int().min(1, 'limit doit être >= 1').max(100, 'limit doit être <= 100').default(10),
  search: z.string().trim().max(200, 'search doit faire 200 caractères max').optional(),
  status: z.enum(['PENDING', 'DONE', 'CANCEL']).optional(),
});

export async function createTransfer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsed = createTransferSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({
      success: false,
      message: 'Données invalides.',
      errors: formatZodErrors(parsed.error),
    });
  }

  const actorId = req.user!.userId;
  const actorStoreId = req.user!.storeId;
  const orgId = req.user!.orgId;
  const ip = extractIp(req);

  try {
    const roleName = req.user!.roleName;
    const accessibleSourceStores = await authService.getAccessibleStores(
      orgId,
      actorId,
      roleName === 'Super Administrateur',
    );
    if (!accessibleSourceStores.some((store) => store.id === parsed.data.from_store_id)) {
      return void res.status(403).json({
        success: false,
        message: 'Le magasin source sélectionné ne fait pas partie de vos établissements autorisés.',
      });
    }

    const [actorName, actorStoreName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(actorStoreId),
    ]);

    const transfer = await transferService.createTransfer(orgId, parsed.data, actorId, actorName, actorStoreId, actorStoreName, ip);
    res.status(201).json({ success: true, transfer });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'SAME_STORE_TRANSFER_FORBIDDEN')
        return void res.status(409).json({ success: false, message: 'Le magasin source et destination doivent être différents.' });
      if (error.message === 'STORE_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Magasin introuvable.' });
      if (error.message === 'PRODUCT_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Produit introuvable.' });
      if (error.message === 'FORMAT_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Format de conditionnement introuvable ou non associé au produit.' });
      if (error.message === 'PACKAGES_COUNT_REQUIRED' || error.message === 'QTY_REQUIRED')
        return void res.status(400).json({ success: false, message: 'Chaque ligne doit fournir qty (sans format) ou packages_count + packaging_format_id (avec format).' });
      if (error.message === 'INSUFFICIENT_STOCK')
        return void res.status(409).json({ success: false, message: 'Stock insuffisant dans le magasin source.' });
    }
    console.error('Erreur createTransfer:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

export async function listTransfers(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsedQuery = listTransfersQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return void res.status(400).json({
      success: false,
      message: 'Paramètres de requête invalides.',
      errors: formatZodErrors(parsedQuery.error),
    });
  }

  const { page, limit, search, status } = parsedQuery.data;
  const orgId = req.user!.orgId;

  try {
    const roleName = req.user!.roleName;
    const forceRequesterScope = roleName === 'Manager Magasin';
    const result = await transferService.listTransfers(orgId, {
      status,
      requesterStoreId: req.user!.storeId,
      forceRequesterScope,
      search,
      page,
      limit,
    });

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Erreur listTransfers:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

export async function getTransferById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId = req.user!.orgId;
  const id = req.params.id as string;
  try {
    const roleName = req.user!.roleName;
    const transfer = await transferService.getTransferById(
      orgId,
      id,
      req.user!.storeId,
      roleName === 'Manager Magasin',
    );
    res.status(200).json({ success: true, transfer });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'TRANSFER_NOT_FOUND') {
        return void res.status(404).json({ success: false, message: 'Transfert introuvable.' });
      }
      if (error.message === 'FORBIDDEN_TRANSFER_ACCESS') {
        return void res.status(403).json({ success: false, message: 'Ce transfert n’appartient pas à votre magasin.' });
      }
    }
    console.error('Erreur getTransferById:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

export async function confirmTransfer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const actorId = req.user!.userId;
  const actorStoreId = req.user!.storeId;
  const orgId = req.user!.orgId;
  const ip = extractIp(req);

  try {
    const roleName = req.user!.roleName;
    const [actorName, actorStoreName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(actorStoreId),
    ]);

    const transfer = await transferService.confirmTransfer(
      orgId,
      id,
      actorId,
      actorName,
      actorStoreId,
      actorStoreName,
      ip,
      actorStoreId,
      roleName === 'Manager Magasin',
    );
    res.status(200).json({ success: true, transfer });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'TRANSFER_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Transfert introuvable.' });
      if (error.message === 'FORBIDDEN_TRANSFER_ACCESS')
        return void res.status(403).json({ success: false, message: 'Ce transfert n’appartient pas à votre magasin.' });
      if (error.message === 'TRANSFER_NOT_CONFIRMABLE')
        return void res.status(409).json({ success: false, message: 'Seuls les transferts PENDING peuvent être confirmés.' });
      if (error.message === 'INSUFFICIENT_STOCK')
        return void res.status(409).json({ success: false, message: 'Stock insuffisant pour confirmer ce transfert.' });
    }
    console.error('Erreur confirmTransfer:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

export async function cancelTransfer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const actorId = req.user!.userId;
  const actorStoreId = req.user!.storeId;
  const orgId = req.user!.orgId;
  const ip = extractIp(req);

  try {
    const roleName = req.user!.roleName;
    const [actorName, actorStoreName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(actorStoreId),
    ]);

    const transfer = await transferService.cancelTransfer(
      orgId,
      id,
      actorId,
      actorName,
      actorStoreId,
      actorStoreName,
      ip,
      actorStoreId,
      roleName === 'Manager Magasin',
    );
    res.status(200).json({ success: true, transfer });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'TRANSFER_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Transfert introuvable.' });
      if (error.message === 'FORBIDDEN_TRANSFER_ACCESS')
        return void res.status(403).json({ success: false, message: 'Ce transfert n’appartient pas à votre magasin.' });
      if (error.message === 'TRANSFER_NOT_CANCELLABLE')
        return void res.status(409).json({ success: false, message: 'Seuls les transferts PENDING peuvent être annulés.' });
    }
    console.error('Erreur cancelTransfer:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

export async function listTransferDestinationStores(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId = req.user!.orgId;
  try {
    const roleName = req.user!.roleName;
    const sourceStores = await authService.getAccessibleStores(
      req.user!.orgId,
      req.user!.userId,
      roleName === 'Super Administrateur',
    );
    const destinationStores = await transferService.listDestinationStores(orgId);
    res.status(200).json({
      success: true,
      source_stores: sourceStores,
      destination_stores: destinationStores,
    });
  } catch (error) {
    console.error('Erreur listTransferDestinationStores:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}
