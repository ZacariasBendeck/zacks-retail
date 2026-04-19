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
  type CountBatchSource,
  type CountMode,
  type CountSessionStatus,
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

export default router;
