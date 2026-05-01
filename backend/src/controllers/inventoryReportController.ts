// src/controllers/inventoryReportController.ts
//
// Handlers HTTP pour les rapports d'inventaire.

import { Response } from 'express';
import { z, ZodError } from 'zod';
import { ReportStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { resolveActorName, resolveStoreName } from '../services/audit.service';
import * as reportService from '../services/inventory_report.service';

function formatZodErrors(err: ZodError): string[] {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

function extractIp(req: AuthenticatedRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim() || (req.ip ?? '');
  return req.ip ?? '';
}

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

const createReportSchema = z.object({
  store_id:     z.string().uuid('UUID établissement invalide'),
  period_start: z.string().datetime({ message: 'Date de début invalide.' }),
  period_end:   z.string().datetime({ message: 'Date de fin invalide.' }),
  notes:        z.string().optional(),
});

const updateLinesSchema = z.object({
  lines: z.array(
    z.object({
      product_id:    z.string().uuid(),
      stock_counted: z.number().int().min(0, 'La quantité comptée doit être ≥ 0.'),
      note:          z.string().optional(),
    }),
  ).min(1, 'Au moins une ligne est requise.'),
});

const rejectSchema = z.object({
  reason: z.string().min(1, 'Le motif de rejet est obligatoire.'),
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** GET /api/inventory-reports */
export async function getReports(req: AuthenticatedRequest, res: Response): Promise<void> {
  const store_id = req.query.store_id as string | undefined;
  const statusRaw = req.query.status as string | undefined;

  const status = statusRaw && Object.values(ReportStatus).includes(statusRaw as ReportStatus)
    ? (statusRaw as ReportStatus)
    : undefined;

  try {
    const reports = await reportService.getReports({ store_id, status });
    res.status(200).json({ success: true, reports });
  } catch (err) {
    console.error('Erreur récupération rapports :', err);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/** GET /api/inventory-reports/:id */
export async function getReportById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  try {
    const report = await reportService.getReportById(id);
    res.status(200).json({ success: true, report });
  } catch (error) {
    if (error instanceof Error && error.message === 'REPORT_NOT_FOUND')
      return void res.status(404).json({ success: false, message: 'Rapport introuvable.' });
    console.error('Erreur récupération rapport :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/** POST /api/inventory-reports */
export async function createReport(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parseResult = createReportSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ success: false, message: 'Données invalides.', errors: formatZodErrors(parseResult.error) });
    return;
  }

  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);

    const report = await reportService.createReport(
      {
        store_id:      parseResult.data.store_id,
        period_start:  new Date(parseResult.data.period_start),
        period_end:    new Date(parseResult.data.period_end),
        notes:         parseResult.data.notes,
        created_by_id: actorId,
      },
      actorId,
      actorName,
      storeName,
      ip,
    );

    res.status(201).json({ success: true, message: `Rapport ${report.reference} créé.`, report });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'STORE_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Établissement introuvable.' });
      if (error.message === 'REPORT_ALREADY_EXISTS')
        return void res.status(409).json({ success: false, message: 'Un rapport existe déjà pour cet établissement et cette semaine.' });
      if (error.message === 'NO_INVENTORY_ENTRIES')
        return void res.status(422).json({ success: false, message: 'Cet établissement n\'a aucune entrée d\'inventaire.' });
    }
    console.error('Erreur création rapport :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/** PUT /api/inventory-reports/:id/lines */
export async function updateLines(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  const parseResult = updateLinesSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ success: false, message: 'Données invalides.', errors: formatZodErrors(parseResult.error) });
    return;
  }

  try {
    const report = await reportService.updateLines(id, parseResult.data);
    res.status(200).json({ success: true, message: 'Lignes mises à jour.', report });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'REPORT_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Rapport introuvable.' });
      if (error.message === 'REPORT_NOT_EDITABLE')
        return void res.status(409).json({ success: false, message: 'Ce rapport ne peut plus être modifié.' });
    }
    console.error('Erreur mise à jour lignes :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/** PATCH /api/inventory-reports/:id/submit */
export async function submitReport(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);
    const report = await reportService.submitReport(id, actorId, actorName, storeId, storeName, ip);
    res.status(200).json({ success: true, message: 'Rapport soumis pour validation.', report });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'REPORT_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Rapport introuvable.' });
      if (error.message === 'REPORT_NOT_SUBMITTABLE')
        return void res.status(409).json({ success: false, message: 'Ce rapport ne peut pas être soumis dans son état actuel.' });
    }
    console.error('Erreur soumission rapport :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/** PATCH /api/inventory-reports/:id/validate */
export async function validateReport(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);
    const report = await reportService.validateReport(id, actorId, actorId, actorName, storeId, storeName, ip);
    res.status(200).json({ success: true, message: 'Rapport validé.', report });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'REPORT_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Rapport introuvable.' });
      if (error.message === 'REPORT_NOT_VALIDATABLE')
        return void res.status(409).json({ success: false, message: 'Seuls les rapports soumis peuvent être validés.' });
    }
    console.error('Erreur validation rapport :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/** PATCH /api/inventory-reports/:id/reject */
export async function rejectReport(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  const parseResult = rejectSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ success: false, message: 'Le motif de rejet est obligatoire.', errors: formatZodErrors(parseResult.error) });
    return;
  }

  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);
    const report = await reportService.rejectReport(id, parseResult.data.reason, actorId, actorName, storeId, storeName, ip);
    res.status(200).json({ success: true, message: 'Rapport rejeté.', report });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'REPORT_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Rapport introuvable.' });
      if (error.message === 'REPORT_NOT_REJECTABLE')
        return void res.status(409).json({ success: false, message: 'Seuls les rapports soumis peuvent être rejetés.' });
    }
    console.error('Erreur rejet rapport :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}

/** PATCH /api/inventory-reports/:id/apply-adjustments */
export async function applyAdjustments(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id      = req.params.id as string;
  const actorId = req.user!.userId;
  const storeId = req.user!.storeId;
  const ip      = extractIp(req);

  try {
    const [actorName, storeName] = await Promise.all([
      resolveActorName(actorId),
      resolveStoreName(storeId),
    ]);
    const result = await reportService.applyAdjustments(id, actorId, actorName, storeId, storeName, ip);
    res.status(200).json({ success: true, message: `${result.adjustments_count} ajustement(s) appliqué(s).`, ...result });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'REPORT_NOT_FOUND')
        return void res.status(404).json({ success: false, message: 'Rapport introuvable.' });
      if (error.message === 'REPORT_NOT_VALIDATED')
        return void res.status(409).json({ success: false, message: 'Les ajustements ne peuvent être appliqués que sur un rapport validé.' });
    }
    console.error('Erreur application ajustements :', error);
    res.status(500).json({ success: false, message: 'Une erreur interne est survenue.' });
  }
}
