/**
 * Physical Inventory module — Phase 1.a (Slice 3) HTTP routes.
 *
 * Wave 1 surface: lifecycle (create / open / freeze / cancel), batches,
 * entries (single + bulk), and a small read surface (list / detail / running
 * totals). Variance / items-not-counted / export endpoints land in Wave 2.
 *
 * Validation is inline + lightweight here — Wave 2 wires Zod schemas through
 * the existing middleware/validation pattern.
 */

import { Router, Request, Response, IRouter } from 'express';
import * as physicalInventory from '../services/physicalInventoryService';
import { PhysicalInventoryError } from '../services/physicalInventoryService';
import {
  COUNT_SESSION_STATUSES,
  COUNT_MODES,
  COUNT_BATCH_SOURCES,
  VARIANCE_BANDS,
  REVIEW_STEPS,
  type CountBatchSource,
  type CountMode,
  type CountSessionStatus,
  type VarianceBand,
  type ReviewStep,
} from '../models/physicalInventory';

const router: IRouter = Router();

function mapError(err: unknown, res: Response): void {
  if (err instanceof PhysicalInventoryError) {
    const statusByCode: Record<string, number> = {
      SESSION_NOT_FOUND: 404,
      BATCH_NOT_FOUND_FOR_SESSION: 404,
      VARIANCE_NOT_FOUND: 404,
      INVALID_STATUS_TRANSITION: 409,
      INVALID_INDEPENDENT_VERIFICATION_N: 400,
      JOIN_CODE_EXHAUSTED: 503,
      SNAPSHOT_MISSING: 409,
      SETTINGS_MISSING: 500,
      INVALID_REVIEW_STEP: 400,
      INVALID_DEVICE_LABEL: 400,
      CSV_HEADER_INVALID: 400,
      REVIEW_ACKS_MISSING: 409,
      VARIANCES_UNACKNOWLEDGED: 409,
    };
    res.status(statusByCode[err.code] ?? 400).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }
  // eslint-disable-next-line no-console
  console.error('[physicalInventory] unhandled error:', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An internal server error occurred.' },
  });
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function asInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return parseInt(v, 10);
  return undefined;
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/count-sessions:
 *   post:
 *     summary: Create a DRAFT count session
 *     tags: [Physical Inventory]
 */
router.post('/', (req: Request, res: Response): void => {
  try {
    const body = req.body ?? {};
    const storeId = asInt(body.storeId);
    const openedBy = asString(body.openedBy);
    if (storeId == null || !openedBy) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'storeId (int) and openedBy (string) are required.' },
      });
      return;
    }
    const mode = (asString(body.mode) ?? 'ADDITIVE') as CountMode;
    if (!COUNT_MODES.includes(mode)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `mode must be one of ${COUNT_MODES.join(', ')}` },
      });
      return;
    }
    const session = physicalInventory.createSession({
      storeId,
      openedBy,
      scope: body.scope,
      mode,
      independentVerificationN: asInt(body.independentVerificationN),
      lockStoreDuringCount: body.lockStoreDuringCount === true,
      notes: asString(body.notes),
    });
    res.status(201).json(session);
  } catch (err) {
    mapError(err, res);
  }
});

/**
 * @openapi
 * /api/v1/count-sessions:
 *   get:
 *     summary: List count sessions
 *     tags: [Physical Inventory]
 */
router.get('/', (req: Request, res: Response): void => {
  try {
    const status = asString(req.query.status) as CountSessionStatus | undefined;
    if (status && !COUNT_SESSION_STATUSES.includes(status)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `status must be one of ${COUNT_SESSION_STATUSES.join(', ')}` },
      });
      return;
    }
    const sessions = physicalInventory.listSessions({
      storeId: asInt(req.query.storeId),
      status,
      fromDate: asString(req.query.fromDate),
      toDate: asString(req.query.toDate),
      limit: asInt(req.query.limit),
      offset: asInt(req.query.offset),
    });
    res.json({ data: sessions });
  } catch (err) {
    mapError(err, res);
  }
});

/**
 * @openapi
 * /api/v1/count-sessions/{id}:
 *   get:
 *     summary: Get session details with snapshot + counts aggregates
 *     tags: [Physical Inventory]
 */
router.get('/:id', (req: Request, res: Response): void => {
  try {
    const details = physicalInventory.getSessionDetails((req.params.id as string));
    if (!details) {
      res.status(404).json({ error: { code: 'SESSION_NOT_FOUND' } });
      return;
    }
    res.json(details);
  } catch (err) {
    mapError(err, res);
  }
});

router.post('/:id/open', (req: Request, res: Response): void => {
  try {
    res.json(physicalInventory.openSession((req.params.id as string)));
  } catch (err) {
    mapError(err, res);
  }
});

router.post('/:id/freeze', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await physicalInventory.freezeSession((req.params.id as string));
    res.json(result);
  } catch (err) {
    mapError(err, res);
  }
});

router.post('/:id/cancel', (req: Request, res: Response): void => {
  try {
    const body = req.body ?? {};
    const reason = asString(body.reason);
    const cancelledBy = asString(body.cancelledBy);
    if (!reason || !cancelledBy) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'reason and cancelledBy are required.' },
      });
      return;
    }
    res.json(physicalInventory.cancelSession((req.params.id as string), { reason, cancelledBy }));
  } catch (err) {
    mapError(err, res);
  }
});

// ── Batches ─────────────────────────────────────────────────────────────────

router.post('/:id/batches', (req: Request, res: Response): void => {
  try {
    const body = req.body ?? {};
    const source = asString(body.source) as CountBatchSource | undefined;
    if (!source || !COUNT_BATCH_SOURCES.includes(source)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `source must be one of ${COUNT_BATCH_SOURCES.join(', ')}` },
      });
      return;
    }
    const batch = physicalInventory.createBatch((req.params.id as string), source, {
      deviceLabel: asString(body.deviceLabel),
      deviceId: asString(body.deviceId),
      counterUserId: asString(body.counterUserId),
    });
    res.status(201).json(batch);
  } catch (err) {
    mapError(err, res);
  }
});

// ── Entries ─────────────────────────────────────────────────────────────────

router.post('/:id/entries', (req: Request, res: Response): void => {
  try {
    const body = req.body ?? {};
    const skuId = asString(body.skuId);
    if (!skuId) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'skuId is required.' },
      });
      return;
    }
    const entry = physicalInventory.addEntry((req.params.id as string), {
      batchId: asString(body.batchId),
      skuId,
      columnLabel: asString(body.columnLabel),
      rowLabel: asString(body.rowLabel),
      quantity: asInt(body.quantity),
      isZero: body.isZero === true,
      counterUserId: asString(body.counterUserId),
    });
    res.status(201).json(entry);
  } catch (err) {
    mapError(err, res);
  }
});

router.post('/:id/entries/bulk', (req: Request, res: Response): void => {
  try {
    const body = req.body ?? {};
    const skuId = asString(body.skuId);
    const batchId = asString(body.batchId);
    if (!skuId || !batchId || !Array.isArray(body.cells)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'skuId, batchId, and cells[] are required.',
        },
      });
      return;
    }
    const cells = (body.cells as Array<Record<string, unknown>>)
      .map((c) => ({
        columnLabel: asString(c.columnLabel),
        rowLabel: asString(c.rowLabel),
        quantity: asInt(c.quantity) ?? 0,
      }))
      .filter((c) => c.quantity != null);
    if (cells.length === 0) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'cells[] must contain at least one entry.' },
      });
      return;
    }
    const entries = physicalInventory.addBulkEntries((req.params.id as string), {
      batchId,
      skuId,
      cells,
      counterUserId: asString(body.counterUserId),
    });
    res.status(201).json({ data: entries });
  } catch (err) {
    mapError(err, res);
  }
});

router.get('/:id/cells/:skuId', (req: Request, res: Response): void => {
  try {
    const totals = physicalInventory.getRunningTotalsForSku(
      req.params.id as string,
      req.params.skuId as string,
    );
    res.json({ data: totals });
  } catch (err) {
    mapError(err, res);
  }
});

router.get('/:id/entries', (req: Request, res: Response): void => {
  try {
    const skuId = asString(req.query.skuId);
    if (!skuId) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'skuId query param is required for Wave 1.' },
      });
      return;
    }
    const entries = physicalInventory.getEntriesForSku((req.params.id as string), skuId);
    res.json({ data: entries });
  } catch (err) {
    mapError(err, res);
  }
});

// ── Wave 2 — variance + review + export ─────────────────────────────────────

router.post('/:id/ready-for-review', (req: Request, res: Response): void => {
  try {
    const result = physicalInventory.readyForReview(req.params.id as string);
    res.status(200).json(result);
  } catch (err) {
    mapError(err, res);
  }
});

router.get('/:id/variance', (req: Request, res: Response): void => {
  try {
    const bandsParam = asString(req.query.bands);
    const bands = bandsParam
      ? (bandsParam.split(',').filter((b) => (VARIANCE_BANDS as readonly string[]).includes(b)) as VarianceBand[])
      : undefined;
    const onlyVarying = req.query.onlyVarying === 'true' || req.query.onlyVarying === '1';
    const limit = asInt(req.query.limit);
    const offset = asInt(req.query.offset);
    const data = physicalInventory.listVariances(req.params.id as string, {
      bands,
      onlyVarying,
      limit,
      offset,
    });
    res.json({ data });
  } catch (err) {
    mapError(err, res);
  }
});

router.get('/:id/variance.csv', (req: Request, res: Response): void => {
  try {
    const bandsParam = asString(req.query.bands);
    const bands = bandsParam
      ? (bandsParam.split(',').filter((b) => (VARIANCE_BANDS as readonly string[]).includes(b)) as VarianceBand[])
      : undefined;
    const onlyVarying = req.query.onlyVarying === 'true' || req.query.onlyVarying === '1';
    const csv = physicalInventory.buildVarianceCsv(req.params.id as string, {
      bands,
      onlyVarying,
    });
    res.type('text/csv').send(csv);
  } catch (err) {
    mapError(err, res);
  }
});

router.get('/:id/variance/summary', (req: Request, res: Response): void => {
  try {
    const summary = physicalInventory.getVarianceSummary(req.params.id as string);
    res.json(summary);
  } catch (err) {
    mapError(err, res);
  }
});

router.post('/:id/variance/:varianceId/acknowledge', (req: Request, res: Response): void => {
  try {
    const acknowledgedBy = asString(req.body?.acknowledgedBy);
    if (!acknowledgedBy) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'acknowledgedBy is required.' } });
      return;
    }
    const variance = physicalInventory.acknowledgeVariance(
      req.params.id as string,
      req.params.varianceId as string,
      acknowledgedBy,
    );
    res.json(variance);
  } catch (err) {
    mapError(err, res);
  }
});

router.get('/:id/items-not-counted', (req: Request, res: Response): void => {
  try {
    const includeZeroOnHand = req.query.includeZeroOnHand === 'true' || req.query.includeZeroOnHand === '1';
    const limit = asInt(req.query.limit);
    const offset = asInt(req.query.offset);
    const data = physicalInventory.getItemsNotCounted(req.params.id as string, {
      includeZeroOnHand,
      limit,
      offset,
    });
    res.json({ data });
  } catch (err) {
    mapError(err, res);
  }
});

router.get('/:id/items-not-counted.csv', (req: Request, res: Response): void => {
  try {
    const includeZeroOnHand = req.query.includeZeroOnHand === 'true' || req.query.includeZeroOnHand === '1';
    const csv = physicalInventory.buildItemsNotCountedCsv(req.params.id as string, {
      includeZeroOnHand,
    });
    res.type('text/csv').send(csv);
  } catch (err) {
    mapError(err, res);
  }
});

router.post('/:id/items-not-counted/zero-out-bulk', (req: Request, res: Response): void => {
  try {
    const skuIds = Array.isArray(req.body?.skuIds) ? (req.body.skuIds as unknown[]).filter((s): s is string => typeof s === 'string' && s.length > 0) : [];
    const performedBy = asString(req.body?.performedBy);
    if (skuIds.length === 0 || !performedBy) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'skuIds[] and performedBy are required.' },
      });
      return;
    }
    const entries = physicalInventory.bulkZeroOut(req.params.id as string, skuIds, performedBy);
    res.status(201).json({ data: entries });
  } catch (err) {
    mapError(err, res);
  }
});

router.post('/:id/review-acks', (req: Request, res: Response): void => {
  try {
    const step = req.body?.step;
    const acknowledgedBy = asString(req.body?.acknowledgedBy);
    if (!step || !(REVIEW_STEPS as readonly string[]).includes(step)) {
      res.status(400).json({
        error: { code: 'INVALID_REVIEW_STEP', message: 'step must be a valid ReviewStep.' },
      });
      return;
    }
    if (!acknowledgedBy) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'acknowledgedBy is required.' },
      });
      return;
    }
    const ack = physicalInventory.recordReviewAck(req.params.id as string, step as ReviewStep, acknowledgedBy);
    res.status(201).json(ack);
  } catch (err) {
    mapError(err, res);
  }
});

router.get('/:id/review-acks', (req: Request, res: Response): void => {
  try {
    const data = physicalInventory.listReviewAcks(req.params.id as string);
    res.json({ data });
  } catch (err) {
    mapError(err, res);
  }
});

router.post('/:id/export', (req: Request, res: Response): void => {
  try {
    const exportedBy = asString(req.body?.exportedBy);
    if (!exportedBy) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'exportedBy is required.' },
      });
      return;
    }
    const result = physicalInventory.markSessionExported(req.params.id as string, exportedBy);
    res.json(result);
  } catch (err) {
    mapError(err, res);
  }
});

// ── Wave 3 — mobile join + batch ingestion + conflicts ──────────────────────

router.post('/by-join-code/:code', (req: Request, res: Response): void => {
  try {
    const result = physicalInventory.joinSessionByCode(req.params.code as string);
    if (!result) {
      res.status(404).json({
        error: { code: 'JOIN_CODE_INVALID', message: 'Join code is invalid or session is not active.' },
      });
      return;
    }
    res.json(result);
  } catch (err) {
    mapError(err, res);
  }
});

router.post('/:id/devices', (req: Request, res: Response): void => {
  try {
    const deviceLabel = asString(req.body?.deviceLabel);
    const counterUserId = asString(req.body?.counterUserId);
    if (!deviceLabel) {
      res.status(400).json({
        error: { code: 'INVALID_DEVICE_LABEL', message: 'deviceLabel is required.' },
      });
      return;
    }
    const batch = physicalInventory.registerDevice(req.params.id as string, {
      deviceLabel,
      counterUserId,
    });
    res.status(201).json(batch);
  } catch (err) {
    mapError(err, res);
  }
});

router.post('/:id/batches/:batchId/acknowledge', (req: Request, res: Response): void => {
  try {
    const batch = physicalInventory.acknowledgeBatch(
      req.params.id as string,
      req.params.batchId as string,
    );
    res.json(batch);
  } catch (err) {
    mapError(err, res);
  }
});

router.post('/:id/batches/:batchId/import-csv', (req: Request, res: Response): void => {
  try {
    const csvText = typeof req.body === 'string' ? req.body : asString(req.body?.csv);
    const performedBy = asString(req.body?.performedBy);
    if (!csvText) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'csv text body is required (string or {csv}).' },
      });
      return;
    }
    if (!performedBy) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'performedBy is required.' },
      });
      return;
    }
    const result = physicalInventory.importBatchCsv(
      req.params.id as string,
      req.params.batchId as string,
      csvText,
      performedBy,
    );
    res.status(201).json(result);
  } catch (err) {
    mapError(err, res);
  }
});

router.get('/:id/conflicts', (req: Request, res: Response): void => {
  try {
    const windowMinutes = asInt(req.query.windowMinutes);
    const data = physicalInventory.computeConflicts(req.params.id as string, windowMinutes);
    res.json({ data });
  } catch (err) {
    mapError(err, res);
  }
});

export default router;
