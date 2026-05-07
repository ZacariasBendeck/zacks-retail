import { Router, type IRouter, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  commitAssortmentWave,
  createAssortmentPlan,
  createAssortmentTransferDrafts,
  getAssortmentPlan,
  isAssortmentPlanningServiceError,
  listAssortmentPlans,
  previewAssortmentPlan,
} from '../services/assortmentPlanningService';

const router: IRouter = Router();

const planRequestSchema = z
  .object({
    categoryNumber: z.number().int().min(1).max(9999).optional(),
    warehouseStoreId: z.number().int().positive().optional(),
    targetStoreIds: z.array(z.number().int().positive()).max(250).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD').optional(),
    horizonMonths: z.number().int().min(1).max(24).optional(),
    highSeasonMonths: z.array(z.number().int().min(1).max(12)).max(12).optional(),
    label: z.string().trim().min(1).max(200).optional(),
    createdBy: z.string().trim().max(120).optional(),
  })
  .strict();

const listStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'COMMITTED', 'ARCHIVED', 'all']).optional();

function actorFromRequest(req: Request): string | null {
  const user = (req as Request & { user?: { id?: string; email?: string; displayName?: string } }).user;
  return user?.displayName?.trim() || user?.email?.trim() || user?.id || null;
}

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function sendZodError(res: Response, issues: z.ZodIssue[]): void {
  res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid assortment-planning request',
      issues,
    },
  });
}

function handleError(err: unknown, res: Response): void {
  if (isAssortmentPlanningServiceError(err)) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
}

router.post('/preview', async (req: Request, res: Response) => {
  const parsed = planRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    sendZodError(res, parsed.error.issues);
    return;
  }
  try {
    res.json(await previewAssortmentPlan(parsed.data));
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/plans', async (req: Request, res: Response) => {
  const parsed = planRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    sendZodError(res, parsed.error.issues);
    return;
  }
  try {
    const result = await createAssortmentPlan(parsed.data, actorFromRequest(req));
    res.status(201).json(result);
  } catch (err) {
    handleError(err, res);
  }
});

router.get('/plans', async (req: Request, res: Response) => {
  const parsed = listStatusSchema.safeParse(typeof req.query.status === 'string' ? req.query.status : undefined);
  if (!parsed.success) {
    sendZodError(res, parsed.error.issues);
    return;
  }
  try {
    const plans = await listAssortmentPlans({ status: parsed.data });
    res.json({ plans });
  } catch (err) {
    handleError(err, res);
  }
});

router.get('/plans/:id', async (req: Request, res: Response) => {
  try {
    res.json(await getAssortmentPlan(routeParam(req.params.id)));
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/plans/:id/waves/:waveId/create-transfer-drafts', async (req: Request, res: Response) => {
  try {
    res.json(await createAssortmentTransferDrafts(
      routeParam(req.params.id),
      routeParam(req.params.waveId),
      actorFromRequest(req) ?? 'system',
    ));
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/plans/:id/waves/:waveId/commit', async (req: Request, res: Response) => {
  try {
    res.json(await commitAssortmentWave(
      routeParam(req.params.id),
      routeParam(req.params.waveId),
      actorFromRequest(req) ?? 'system',
    ));
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
