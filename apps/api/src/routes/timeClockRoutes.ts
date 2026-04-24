import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient, TimeClockEntry } from '../prismaClient';
import { requireAuth, requirePermission } from '../middleware/authMiddleware';
import { EmployeeNotFoundError } from '../services/employees/employeeService';
import { PERMISSIONS } from '../services/employees/permissions';
import {
  TimeClockAlreadyClockedInError,
  TimeClockEntryNotFoundError,
  TimeClockForbiddenError,
  TimeClockInvalidRangeError,
  TimeClockInvalidPinError,
  TimeClockNotClockedInError,
  TimeClockPinRequiredError,
  TimeClockPolicyDisabledError,
  TimeClockShiftTooLongError,
  TimeClockSelfServiceDisabledError,
  adjustTimeClockEntry,
  buildTimeClockReport,
  clockInEmployee,
  clockOutEmployee,
  getTimeClockPolicy,
  getTimeClockEntryStatus,
  hoursDecimalFromMinutes,
  listTimeClockEntryAdjustments,
  listOpenTimeClockEntries,
  listTimeClockReconciliationEntries,
  listTimeClockEntries,
  setTimeClockPolicy,
  workedMinutesForEntry,
} from '../services/employees/timeClockService';

const policyQuerySchema = z.object({
  storeId: z.coerce.number().int().positive(),
});

const patchPolicyBody = z.object({
  enabled: z.boolean(),
  requireClockInBeforeSale: z.boolean().optional(),
});

const clockInBody = z.object({
  storeId: z.number().int().positive(),
  employeeId: z.string().uuid().optional(),
  pin: z.string().regex(/^\d{4,12}$/).optional().nullable(),
  nonSales: z.boolean().optional(),
  at: z.coerce.date().optional(),
  note: z.string().max(1000).optional().nullable(),
});

const clockOutBody = z.object({
  employeeId: z.string().uuid().optional(),
  pin: z.string().regex(/^\d{4,12}$/).optional().nullable(),
  at: z.coerce.date().optional(),
  note: z.string().max(1000).optional().nullable(),
});

const entryQuerySchema = z.object({
  storeId: z.coerce.number().int().positive().optional(),
  employeeId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const entryParamSchema = z.object({
  id: z.string().uuid(),
});

const adjustEntryBody = z.object({
  storeId: z.number().int().positive().optional(),
  clockedInAt: z.coerce.date().optional(),
  clockedOutAt: z.union([z.coerce.date(), z.null()]).optional(),
  nonSales: z.boolean().optional(),
  note: z.string().max(1000).optional().nullable(),
  reason: z.string().trim().min(1).max(1000),
});

const reconciliationQuerySchema = entryQuerySchema.extend({
  status: z.enum(['OPEN', 'AUTO_CLOSED', 'ALL']).default('ALL'),
});

const booleanQueryField = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const listQueryField = <T extends z.ZodTypeAny>(itemSchema: T) => z.preprocess((value) => {
  if (value == null || value === '') {
    return undefined;
  }
  const parts = (Array.isArray(value) ? value : [value])
    .flatMap((item) => `${item}`.split(','))
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}, z.array(itemSchema).optional());

const reportQuerySchema = z.object({
  storeId: z.coerce.number().int().positive().optional(),
  employeeId: z.string().uuid().optional(),
  storeIds: listQueryField(z.coerce.number().int().positive()),
  employeeIds: listQueryField(z.string().uuid()),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  detail: booleanQueryField.default(false),
  format: z.enum(['json', 'csv']).default('json'),
});

function serializeEntry<T extends TimeClockEntry>(entry: T) {
  const workedMinutes = workedMinutesForEntry(entry);
  return {
    ...entry,
    status: getTimeClockEntryStatus(entry),
    workedMinutes,
    workedHoursDecimal: hoursDecimalFromMinutes(workedMinutes),
  };
}

function escapeCsv(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function asIso(value: Date | null): string {
  return value ? value.toISOString() : '';
}

function serializeAdjustment(adjustment: any) {
  return adjustment;
}

function buildTimeClockReportCsv(report: any): string {
  if (report.detail) {
    const header = [
      'entryId',
      'employeeId',
      'salespersonCode',
      'employeeName',
      'storeId',
      'clockedInAt',
      'clockedOutAt',
      'workedMinutes',
      'workedHoursDecimal',
      'nonSales',
      'status',
      'note',
    ].join(',');
    const rows = report.rows.map((row: any) => [
      escapeCsv(row.entryId),
      escapeCsv(row.employeeId),
      escapeCsv(row.salespersonCode),
      escapeCsv(row.employeeName),
      row.storeId,
      escapeCsv(asIso(row.clockedInAt)),
      escapeCsv(asIso(row.clockedOutAt)),
      row.workedMinutes,
      row.workedHoursDecimal,
      row.nonSales,
      escapeCsv(row.status),
      escapeCsv(row.note),
    ].join(','));
    const totals = [
      'TOTALS',
      '',
      '',
      '',
      '',
      '',
      '',
      report.totals.totalMinutes,
      report.totals.totalHoursDecimal,
      '',
      '',
      '',
    ].join(',');
    return [header, ...rows, totals].join('\n');
  }

  const header = [
    'employeeId',
    'salespersonCode',
    'employeeName',
    'totalEntries',
    'totalMinutes',
    'totalHoursDecimal',
    'salesMinutes',
    'salesHoursDecimal',
    'nonSalesMinutes',
    'nonSalesHoursDecimal',
    'openEntries',
    'autoClosedEntries',
  ].join(',');
  const rows = report.rows.map((row: any) => [
    escapeCsv(row.employeeId),
    escapeCsv(row.salespersonCode),
    escapeCsv(row.employeeName),
    row.totalEntries,
    row.totalMinutes,
    row.totalHoursDecimal,
    row.salesMinutes,
    row.salesHoursDecimal,
    row.nonSalesMinutes,
    row.nonSalesHoursDecimal,
    row.openEntries,
    row.autoClosedEntries,
  ].join(','));
  const totals = [
    'TOTALS',
    '',
    '',
    report.totals.totalEntries,
    report.totals.totalMinutes,
    report.totals.totalHoursDecimal,
    '',
    '',
    '',
    '',
    '',
    '',
  ].join(',');
  return [header, ...rows, totals].join('\n');
}

function handleTimeClockError(res: any, err: unknown): boolean {
  if (err instanceof EmployeeNotFoundError) {
    res.status(404).json({ error: { code: err.code, message: err.message } });
    return true;
  }
  if (err instanceof TimeClockEntryNotFoundError) {
    res.status(404).json({ error: { code: err.code, message: err.message } });
    return true;
  }
  if (err instanceof TimeClockPolicyDisabledError) {
    res.status(409).json({ error: { code: err.code, message: err.message } });
    return true;
  }
  if (err instanceof TimeClockForbiddenError || err instanceof TimeClockSelfServiceDisabledError) {
    res.status(403).json({ error: { code: err.code, message: err.message } });
    return true;
  }
  if (err instanceof TimeClockPinRequiredError) {
    res.status(400).json({ error: { code: err.code, message: err.message } });
    return true;
  }
  if (err instanceof TimeClockInvalidPinError) {
    res.status(401).json({ error: { code: err.code, message: err.message } });
    return true;
  }
  if (err instanceof TimeClockInvalidRangeError || err instanceof TimeClockShiftTooLongError) {
    res.status(400).json({ error: { code: err.code, message: err.message } });
    return true;
  }
  if (err instanceof TimeClockAlreadyClockedInError) {
    res.status(409).json({
      error: { code: err.code, message: err.message },
      entry: serializeEntry(err.entry),
    });
    return true;
  }
  if (err instanceof TimeClockNotClockedInError) {
    res.status(404).json({ error: { code: err.code, message: err.message } });
    return true;
  }
  return false;
}

export function createTimeClockRoutes(prisma: PrismaClient): Router {
  const router = Router();

  router.get(
    '/time-clock-policy',
    requirePermission(PERMISSIONS.TIME_CLOCK_MANAGE),
    async (req, res, next) => {
      try {
        const parsed = policyQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return res.status(400).json({
            error: { code: 'INVALID_QUERY', message: parsed.error.message },
          });
        }
        const policy = await getTimeClockPolicy(prisma, parsed.data.storeId);
        res.json({ policy });
      } catch (err) {
        if (handleTimeClockError(res, err)) return;
        next(err);
      }
    },
  );

  router.patch(
    '/time-clock-policy',
    requirePermission(PERMISSIONS.TIME_CLOCK_MANAGE),
    async (req, res, next) => {
      try {
        const parsedQuery = policyQuerySchema.safeParse(req.query);
        const parsedBody = patchPolicyBody.safeParse(req.body);
        if (!parsedQuery.success) {
          return res.status(400).json({
            error: {
              code: 'INVALID_REQUEST',
              message: parsedQuery.error.message,
            },
          });
        }
        if (!parsedBody.success) {
          return res.status(400).json({
            error: {
              code: 'INVALID_REQUEST',
              message: parsedBody.error.message,
            },
          });
        }
        const policy = await setTimeClockPolicy(prisma, {
          storeId: parsedQuery.data.storeId,
          enabled: parsedBody.data.enabled,
          requireClockInBeforeSale: parsedBody.data.requireClockInBeforeSale,
        });
        res.json({ policy });
      } catch (err) {
        if (handleTimeClockError(res, err)) return;
        next(err);
      }
    },
  );

  router.post('/employees/time-clock/clock-in', requireAuth, async (req, res, next) => {
    try {
      const parsed = clockInBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }
      const entry = await clockInEmployee(prisma, {
        actorUserId: req.user!.id,
        permissions: req.permissions,
        storeId: parsed.data.storeId,
        targetEmployeeId: parsed.data.employeeId,
        pin: parsed.data.pin,
        nonSales: parsed.data.nonSales,
        at: parsed.data.at,
        note: parsed.data.note,
      });
      res.status(201).json({ entry: serializeEntry(entry) });
    } catch (err) {
      if (handleTimeClockError(res, err)) return;
      next(err);
    }
  });

  router.post('/employees/time-clock/clock-out', requireAuth, async (req, res, next) => {
    try {
      const parsed = clockOutBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }
      const entry = await clockOutEmployee(prisma, {
        actorUserId: req.user!.id,
        permissions: req.permissions,
        targetEmployeeId: parsed.data.employeeId,
        pin: parsed.data.pin,
        at: parsed.data.at,
        note: parsed.data.note,
      });
      res.json({ entry: serializeEntry(entry) });
    } catch (err) {
      if (handleTimeClockError(res, err)) return;
      next(err);
    }
  });

  router.get(
    '/employees/time-clock/open',
    requirePermission(PERMISSIONS.TIME_CLOCK_MANAGE),
    async (req, res, next) => {
      try {
        const parsed = entryQuerySchema.pick({ storeId: true, employeeId: true }).safeParse(req.query);
        if (!parsed.success) {
          return res.status(400).json({
            error: { code: 'INVALID_QUERY', message: parsed.error.message },
          });
        }
        const entries = await listOpenTimeClockEntries(prisma, parsed.data);
        res.json({ entries: entries.map(serializeEntry) });
      } catch (err) {
        if (handleTimeClockError(res, err)) return;
        next(err);
      }
    },
  );

  router.get(
    '/employees/time-clock/entries',
    requirePermission(PERMISSIONS.TIME_CLOCK_MANAGE),
    async (req, res, next) => {
      try {
        const parsed = entryQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return res.status(400).json({
            error: { code: 'INVALID_QUERY', message: parsed.error.message },
          });
        }
        const entries = await listTimeClockEntries(prisma, parsed.data);
        res.json({ entries: entries.map(serializeEntry) });
      } catch (err) {
        if (handleTimeClockError(res, err)) return;
        next(err);
      }
    },
  );

  router.post(
    '/employees/time-clock/entries/:id/adjust',
    requirePermission(PERMISSIONS.TIME_CLOCK_MANAGE),
    async (req, res, next) => {
      try {
        const parsedParams = entryParamSchema.safeParse(req.params);
        const parsedBody = adjustEntryBody.safeParse(req.body);
        if (!parsedParams.success) {
          return res.status(400).json({
            error: { code: 'INVALID_REQUEST', message: parsedParams.error.message },
          });
        }
        if (!parsedBody.success) {
          return res.status(400).json({
            error: { code: 'INVALID_BODY', message: parsedBody.error.message },
          });
        }
        const result = await adjustTimeClockEntry(prisma, {
          actorUserId: req.user!.id,
          permissions: req.permissions,
          entryId: parsedParams.data.id,
          storeId: parsedBody.data.storeId,
          clockedInAt: parsedBody.data.clockedInAt,
          clockedOutAt: parsedBody.data.clockedOutAt,
          nonSales: parsedBody.data.nonSales,
          note: parsedBody.data.note,
          reason: parsedBody.data.reason,
        });
        res.json({
          entry: serializeEntry(result.entry),
          adjustment: serializeAdjustment(result.adjustment),
        });
      } catch (err) {
        if (handleTimeClockError(res, err)) return;
        next(err);
      }
    },
  );

  router.get(
    '/employees/time-clock/entries/:id/adjustments',
    requirePermission(PERMISSIONS.TIME_CLOCK_MANAGE),
    async (req, res, next) => {
      try {
        const parsed = entryParamSchema.safeParse(req.params);
        if (!parsed.success) {
          return res.status(400).json({
            error: { code: 'INVALID_REQUEST', message: parsed.error.message },
          });
        }
        const adjustments = await listTimeClockEntryAdjustments(prisma, {
          entryId: parsed.data.id,
        });
        res.json({ adjustments: adjustments.map(serializeAdjustment) });
      } catch (err) {
        if (handleTimeClockError(res, err)) return;
        next(err);
      }
    },
  );

  router.get(
    '/employees/time-clock/reconciliation',
    requirePermission(PERMISSIONS.TIME_CLOCK_MANAGE),
    async (req, res, next) => {
      try {
        const parsed = reconciliationQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return res.status(400).json({
            error: { code: 'INVALID_QUERY', message: parsed.error.message },
          });
        }
        const entries = await listTimeClockReconciliationEntries(prisma, parsed.data);
        res.json({ entries: entries.map(serializeEntry) });
      } catch (err) {
        if (handleTimeClockError(res, err)) return;
        next(err);
      }
    },
  );

  router.get(
    '/reports/time-clock',
    requirePermission(PERMISSIONS.TIME_CLOCK_MANAGE),
    async (req, res, next) => {
      try {
        const parsed = reportQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return res.status(400).json({
            error: { code: 'INVALID_QUERY', message: parsed.error.message },
          });
        }
        const storeIds = [
          ...(parsed.data.storeId !== undefined ? [parsed.data.storeId] : []),
          ...(parsed.data.storeIds ?? []),
        ];
        const employeeIds = [
          ...(parsed.data.employeeId ? [parsed.data.employeeId] : []),
          ...(parsed.data.employeeIds ?? []),
        ];
        const report = await buildTimeClockReport(prisma, {
          storeIds: storeIds.length ? Array.from(new Set(storeIds)) : undefined,
          employeeIds: employeeIds.length ? Array.from(new Set(employeeIds)) : undefined,
          from: parsed.data.from,
          to: parsed.data.to,
          detail: parsed.data.detail,
        });

        if (parsed.data.format === 'csv') {
          const csv = buildTimeClockReportCsv(report);
          const filename = parsed.data.detail ? 'time-clock-detail.csv' : 'time-clock-summary.csv';
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          return res.send(csv);
        }

        res.json({ report });
      } catch (err) {
        if (handleTimeClockError(res, err)) return;
        next(err);
      }
    },
  );

  return router;
}
