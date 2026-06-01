import { Response } from 'express';
import { TransferStatus } from '@prisma/client';
import { z, ZodError } from 'zod';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { resolveActorName, resolveStoreName } from '../services/audit.service';
import * as transferService from '../services/transfer.service';

const createTransferSchema = z.object({
  from_store_id: z.string().uuid('from_store_id invalide'),
  to_store_id: z.string().uuid('to_store_id invalide'),
  items: z.array(
    z.object({
      product_id: z.string().uuid('product_id invalide'),
      qty: z.number().int().min(1, 'qty doit être >= 1').optional(),
      packaging_format_id: z.string().uuid('packaging_format_id invalide').optional(),
      packages_count: z.number().int().min(1, 'packages_count doit être >= 1').optional(),
    }),
  ).min(1, 'Au moins un item est requis.')
    .refine(
      (items) => items.every((item) => (item.packaging_format_id ? item.packages_count !== undefined : item.qty !== undefined)),
      { message: 'Chaque ligne doit fournir qty (sans format) ou packages_count + packaging_format_id (avec format).' },
    ),
});

function formatZodErrors(err: ZodError): string[] {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

function extractIp(req: AuthenticatedRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim() || (req.ip ?? '');
  return req.ip ?? '';
}

async function getRoleNameFromRequest(req: AuthenticatedRequest): Promise<string> {
  const role = await prisma.role.findUnique({
    where: { id: req.user!.roleId },
    select: { name: true },
  });
  return role?.name ?? '';
}

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
  const ip = extractIp(req);

  try {
    const [actorName, actorStoreName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(actorStoreId),
    ]);

    const transfer = await transferService.createTransfer(parsed.data, actorId, actorName, actorStoreId, actorStoreName, ip);
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
  const statusRaw = req.query.status as string | undefined;
  const status = statusRaw && Object.values(TransferStatus).includes(statusRaw as TransferStatus)
    ? (statusRaw as TransferStatus)
    : undefined;

  try {
    const roleName = await getRoleNameFromRequest(req);
    const forceRequesterScope = roleName === 'Manager Magasin';
    const transfers = await transferService.listTransfers({
      status,
      requesterStoreId: req.user!.storeId,
      forceRequesterScope,
    });

    res.status(200).json({ success: true, transfers });
  } catch (error) {
    console.error('Erreur listTransfers:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

export async function getTransferById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  try {
    const transfer = await transferService.getTransferById(id);
    res.status(200).json({ success: true, transfer });
  } catch (error) {
    if (error instanceof Error && error.message === 'TRANSFER_NOT_FOUND') {
      return void res.status(404).json({ success: false, message: 'Transfert introuvable.' });
    }
    console.error('Erreur getTransferById:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

export async function confirmTransfer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const actorId = req.user!.userId;
  const actorStoreId = req.user!.storeId;
  const ip = extractIp(req);

  try {
    const [actorName, actorStoreName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(actorStoreId),
    ]);

    const transfer = await transferService.confirmTransfer(id, actorId, actorName, actorStoreId, actorStoreName, ip);
    res.status(200).json({ success: true, transfer });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'TRANSFER_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Transfert introuvable.' });
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
  const ip = extractIp(req);

  try {
    const [actorName, actorStoreName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(actorStoreId),
    ]);

    const transfer = await transferService.cancelTransfer(id, actorId, actorName, actorStoreId, actorStoreName, ip);
    res.status(200).json({ success: true, transfer });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'TRANSFER_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Transfert introuvable.' });
      if (error.message === 'TRANSFER_NOT_CANCELLABLE')
        return void res.status(409).json({ success: false, message: 'Seuls les transferts PENDING peuvent être annulés.' });
    }
    console.error('Erreur cancelTransfer:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

export async function listTransferDestinationStores(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const stores = await transferService.listDestinationStores(req.user!.storeId);
    res.status(200).json({ success: true, stores });
  } catch (error) {
    console.error('Erreur listTransferDestinationStores:', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}
