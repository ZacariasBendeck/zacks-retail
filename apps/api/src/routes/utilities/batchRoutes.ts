/**
 * Utilities routes — batch-change primitive, batch history, undo.
 *
 * Mount at /api/v1/utilities. Spec: docs/dev/specs/2026-04-21-utilities-batch-change-design.md
 *
 *   POST /batch           → applyBatchChange
 *   GET  /batch           → list ops (paginated)
 *   GET  /batch/:id       → one op + items
 *   POST /batch/:id/undo  → undoBatch
 */

import { Router, type IRouter, type Request, type Response } from 'express';
import { requirePermission } from '../../middleware/authMiddleware';
import { PERMISSIONS } from '../../services/identityAccess/permissions';
import { prisma } from '../../db/prisma';
import {
  applyBatchChange,
  undoBatch,
  BatchChangeValidationError,
} from '../../services/utilities/batchChangeService';
import type {
  AttributeChange,
  BatchOperationType,
  SkuCriteria,
} from '../../services/utilities/types';

const router: IRouter = Router();

router.use(requirePermission(PERMISSIONS.PRODUCTS_SKU_BULK_WRITE));

const VALID_OPS: readonly BatchOperationType[] = [
  'CHANGE_KEYWORDS_ADD',
  'CHANGE_KEYWORDS_REMOVE',
  'CHANGE_CATEGORY',
  'CHANGE_VENDOR',
  'CHANGE_SEASON',
  'CHANGE_GROUP_CODE',
  'CHANGE_SKU_ATTRIBUTE',
  'CHANGE_SIZE_COLUMN',
  'CHANGE_SIZE_TYPE_STRUCTURE',
];

router.post('/batch', async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const operationType = body.operationType;
  if (!VALID_OPS.includes(operationType)) {
    return res.status(400).json({
      error: { code: 'ValidationError', message: `operationType must be one of ${VALID_OPS.join(', ')}.` },
    });
  }
  const criteria: SkuCriteria = body.criteria ?? {};
  const change = body.change as AttributeChange | undefined;
  if (!change || typeof change !== 'object') {
    return res.status(400).json({ error: { code: 'ValidationError', message: 'change is required.' } });
  }
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const actor = (req as Request & { user?: { id?: string; email?: string } }).user?.email
    ?? (req as Request & { user?: { id?: string; email?: string } }).user?.id
    ?? 'system';

  try {
    const result = await applyBatchChange({
      operationType: operationType as BatchOperationType,
      criteria,
      change,
      actor,
      dryRun,
    });
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof BatchChangeValidationError) {
      return res.status(422).json({ error: { code: 'ValidationError', message: err.message } });
    }
    res.status(500).json({ error: { code: 'InternalError', message: (err as Error).message } });
  }
});

router.get('/batch', async (req: Request, res: Response) => {
  const limit = clampInt(req.query.limit, 50, 1, 200);
  const offset = clampInt(req.query.offset, 0, 0, 100_000);
  const opType = typeof req.query.operationType === 'string' ? req.query.operationType : undefined;
  const where = opType && VALID_OPS.includes(opType as BatchOperationType)
    ? { operationType: opType }
    : {};

  const [total, rows] = await prisma.$transaction([
    prisma.productsBatchOperation.count({ where }),
    prisma.productsBatchOperation.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: offset,
      take: limit,
    }),
  ]);

  res.json({ total, rows });
});

router.get('/batch/:id', async (req: Request, res: Response) => {
  const op = await prisma.productsBatchOperation.findUnique({
    where: { id: String(req.params.id ?? '') },
    include: { items: true },
  });
  if (!op) return res.status(404).json({ error: { code: 'NotFound', message: 'Batch operation not found.' } });
  res.json(op);
});

router.post('/batch/:id/undo', async (req: Request, res: Response) => {
  const actor = (req as Request & { user?: { id?: string; email?: string } }).user?.email
    ?? (req as Request & { user?: { id?: string; email?: string } }).user?.id
    ?? 'system';
  try {
    const result = await undoBatch(String(req.params.id ?? ''), actor);
    res.json(result);
  } catch (err) {
    if (err instanceof BatchChangeValidationError) {
      return res.status(422).json({ error: { code: 'ValidationError', message: err.message } });
    }
    res.status(500).json({ error: { code: 'InternalError', message: (err as Error).message } });
  }
});

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  if (raw == null) return fallback;
  const n = typeof raw === 'number' ? raw : Number(raw as string);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export default router;
