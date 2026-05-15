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

const planningScopeSchema = z.object({
  type: z.enum(['CATEGORY', 'DEPARTMENT']),
  number: z.number().int().min(1).max(9999),
}).strict();

const planningFactorsSchema = z.object({
  historyMonths: z.number().int().min(1).max(60).optional(),
  modelCoverWeeks: z.number().min(0).max(52).optional(),
  modelDisplayFloor: z.number().min(0).max(50).optional(),
  maxModelQuantity: z.number().int().min(1).max(500).optional(),
  stockOnlyStoreWeightPct: z.number().min(0).max(100).optional(),
  unseenColorFallbackPct: z.number().min(0).max(100).optional(),
  waveWeights: z.array(z.object({
    releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'releaseDate must be YYYY-MM-DD'),
    weight: z.number().min(0).max(1000),
  }).strict()).max(96).optional(),
  storeModelOverrides: z.array(z.object({
    storeId: z.number().int().positive(),
    modelQuantity: z.number().int().min(0).max(200),
  }).strict()).max(250).optional(),
  colorOverrides: z.array(z.object({
    canonicalColor: z.string().trim().min(1).max(120),
    targetStyleCount: z.number().int().min(0).max(10000).optional(),
    weight: z.number().min(0).max(1000000).optional(),
  }).strict()).max(250).optional(),
  skuWaveOverrides: z.array(z.object({
    skuId: z.string().trim().min(1).max(80),
    releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'releaseDate must be YYYY-MM-DD').nullable(),
  }).strict()).max(5000).optional(),
}).strict();

const planRequestSchema = z
  .object({
    planningScope: planningScopeSchema.optional(),
    categoryNumber: z.number().int().min(1).max(9999).optional(),
    warehouseStoreId: z.number().int().positive().optional(),
    targetStoreIds: z.array(z.number().int().positive()).max(250).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD').optional(),
    horizonMonths: z.number().int().min(1).max(24).optional(),
    highSeasonMonths: z.array(z.number().int().min(1).max(12)).max(12).optional(),
    planningFactors: planningFactorsSchema.optional(),
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
