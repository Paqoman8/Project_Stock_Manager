import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { resolveActorName } from '../services/audit.service';
import * as platformService from '../services/platform.service';
import { extractIp } from '../utils/request';

function isSlugConflict(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = (err.meta as { target?: string[] } | undefined)?.target ?? [];
    return target.includes('slug');
  }
  if (err instanceof Error && err.message.includes('deja utilise')) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function getOrganizations(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { page, limit, status } = req.validatedQuery as {
      page: number;
      limit: number;
      status?: string;
    };

    const result = await platformService.listOrganizations(page, limit, status);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[platform] getOrganizations:', err);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

export async function getOrganization(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const org = await platformService.getOrganization(req.params.id as string);
    if (!org) {
      res.status(404).json({ success: false, message: 'Organisation introuvable.' });
      return;
    }
    res.json({ success: true, organization: org });
  } catch (err) {
    console.error('[platform] getOrganization:', err);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

export async function createOrganization(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const input = req.validatedBody as { name: string; slug: string; adminEmail: string };
    const userId = req.user!.userId;
    const actorName = await resolveActorName(userId);

    const result = await platformService.createOrganization(input, userId, actorName, extractIp(req));

    res.status(201).json({
      success: true,
      organization: result.organization,
      adminPassword: result.adminPassword,
    });
  } catch (err) {
    if (isSlugConflict(err)) {
      res.status(409).json({ success: false, message: 'Ce slug est deja utilise.' });
      return;
    }
    if (err instanceof Error && err.message.includes('email est deja utilisee')) {
      res.status(409).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof Error && err.message.includes('introuvable')) {
      res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
      return;
    }
    console.error('[platform] createOrganization:', err);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

export async function updateOrganization(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const input = req.validatedBody as {
      name?: string;
      slug?: string;
      settings?: Record<string, unknown>;
    };
    const userId = req.user!.userId;
    const actorName = await resolveActorName(userId);

    const org = await platformService.updateOrganization(
      req.params.id as string,
      input,
      userId,
      actorName,
      extractIp(req),
    );

    res.json({ success: true, organization: org });
  } catch (err) {
    if (isSlugConflict(err)) {
      res.status(409).json({ success: false, message: 'Ce slug est deja utilise.' });
      return;
    }
    if (err instanceof Error && err.message.includes('introuvable')) {
      res.status(404).json({ success: false, message: err.message });
      return;
    }
    console.error('[platform] updateOrganization:', err);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

export async function deleteOrganization(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const actorName = await resolveActorName(userId);
    const confirmationSlug = (req.body.confirmation as string | undefined) ?? '';

    await platformService.deleteOrganization(
      req.params.id as string,
      userId,
      actorName,
      extractIp(req),
      confirmationSlug,
    );

    res.json({ success: true, message: 'Organisation supprimee avec succes.' });
  } catch (err) {
    if (err instanceof Error && err.message.includes('introuvable')) {
      res.status(404).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof Error && err.message === 'CONFIRMATION_REQUIRED') {
      res.status(422).json({
        success: false,
        message: 'Suppression non confirmée. Veuillez fournir le slug de l\'organisation dans le champ confirmation.',
      });
      return;
    }
    if (err instanceof Error && err.message === 'PROTECTED_ORGANIZATION') {
      res.status(403).json({
        success: false,
        message: 'Cette organisation est protégée et ne peut pas être supprimée.',
      });
      return;
    }
    console.error('[platform] deleteOrganization:', err);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

export async function suspendOrganization(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const actorName = await resolveActorName(userId);

    const org = await platformService.suspendOrganization(
      req.params.id as string,
      userId,
      actorName,
      extractIp(req),
    );

    res.json({ success: true, organization: org });
  } catch (err) {
    if (err instanceof Error && err.message.includes('introuvable')) {
      res.status(404).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof Error && err.message.includes('Impossible de suspendre')) {
      res.status(409).json({ success: false, message: err.message });
      return;
    }
    console.error('[platform] suspendOrganization:', err);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

export async function reactivateOrganization(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const actorName = await resolveActorName(userId);

    const org = await platformService.reactivateOrganization(
      req.params.id as string,
      userId,
      actorName,
      extractIp(req),
    );

    res.json({ success: true, organization: org });
  } catch (err) {
    if (err instanceof Error && err.message.includes('introuvable')) {
      res.status(404).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof Error && err.message.includes('deja active')) {
      res.status(409).json({ success: false, message: err.message });
      return;
    }
    console.error('[platform] reactivateOrganization:', err);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}
