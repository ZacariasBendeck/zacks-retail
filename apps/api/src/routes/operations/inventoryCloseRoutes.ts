import { Client } from 'pg';
import { Router, type IRouter, type Request, type Response } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/authMiddleware';
import { PERMISSIONS } from '../../services/employees/permissions';
import {
  closeInventoryMonth,
  InventoryMonthCloseError,
  type InventoryMonthCloseResult,
} from '../../services/inventoryMonthCloseService';
import {
  closeInventoryWeek,
  InventoryWeekCloseError,
  type InventoryWeekCloseResult,
} from '../../services/inventoryWeekCloseService';

const router: IRouter = Router();

const monthCloseSchema = z.object({
  closeMonth: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'closeMonth must match YYYY-MM'),
  closedBy: z.string().trim().min(1).max(120).optional(),
  dryRun: z.boolean().optional(),
});

const weekCloseSchema = z.object({
  weekEndingDate: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'weekEndingDate must match YYYY-MM-DD'),
  closedBy: z.string().trim().min(1).max(120).optional(),
  dryRun: z.boolean().optional(),
});

const summaryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number | null;
}

interface PgClient {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
}

type MonthRunRow = {
  id: string;
  year_month: string;
  target_slot: number;
  snapshot_as_of: Date | string;
  closed_by: string;
  dry_run: boolean;
  status: string;
  validation_status: string | null;
  snapshots_scanned: number;
  months_upserted: number;
  snapshots_updated: number;
  nonzero_mtd_cells_before: number;
  sales_cells_reset: number;
  unpromoted_pos_tickets: number;
  sales_cell_mismatch_count: number;
  sales_cell_mismatch_qty_abs: number;
  total_qty_sales: number;
  total_net_sales: string | number | null;
  total_profit: string | number | null;
  inventory_value_total: string | number | null;
  error_text: string | null;
  started_at: Date | string;
  finished_at: Date | string | null;
};

type ClosedMonthRow = {
  year_month: string;
  run_id: string;
  target_slot: number;
  snapshot_as_of: Date | string;
  closed_by: string;
  closed_at: Date | string;
  snapshots_closed: number;
  month_rows_closed: number;
  sales_cells_reset: number;
  total_qty_sales: number;
  total_net_sales: string | number | null;
  total_profit: string | number | null;
  inventory_value_total: string | number | null;
};

type WeekRunRow = {
  id: string;
  week_ending_date: Date | string;
  week_start_date: Date | string;
  snapshot_as_of: Date | string;
  closed_by: string;
  dry_run: boolean;
  status: string;
  validation_status: string | null;
  snapshots_scanned: number;
  trend_rows_written: number;
  snapshots_updated: number;
  unpromoted_pos_tickets: number;
  week_sales_mismatch_count: number;
  week_sales_mismatch_qty_abs: number;
  total_week_qty_sales: number;
  total_week_net_sales: string | number | null;
  total_week_profit: string | number | null;
  error_text: string | null;
  started_at: Date | string;
  finished_at: Date | string | null;
};

type ClosedWeekRow = {
  week_ending_date: Date | string;
  run_id: string;
  week_start_date: Date | string;
  snapshot_as_of: Date | string;
  closed_by: string;
  closed_at: Date | string;
  snapshots_closed: number;
  trend_rows_closed: number;
  total_week_qty_sales: number;
  total_week_net_sales: string | number | null;
  total_week_profit: string | number | null;
};

router.use(requirePermission(PERMISSIONS.EMPLOYEES_MANAGE));

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to run inventory close operations');
  }
  return url;
}

async function withClient<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function actorFromRequest(req: Request, override?: string): string {
  if (override?.trim()) return override.trim();
  const user = (req as Request & { user?: { id?: string; email?: string; displayName?: string } }).user;
  return user?.displayName?.trim() || user?.email?.trim() || user?.id || 'web-operator';
}

function isoDate(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function dateOnly(value: Date | string | null | undefined): string | null {
  const iso = isoDate(value);
  return iso ? iso.slice(0, 10) : null;
}

function numberValue(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapMonthRun(row: MonthRunRow) {
  return {
    id: row.id,
    yearMonth: row.year_month,
    targetSlot: row.target_slot,
    snapshotAsOf: isoDate(row.snapshot_as_of),
    closedBy: row.closed_by,
    dryRun: row.dry_run,
    status: row.status,
    validationStatus: row.validation_status,
    snapshotsScanned: row.snapshots_scanned,
    monthsUpserted: row.months_upserted,
    snapshotsUpdated: row.snapshots_updated,
    nonzeroMtdCellsBefore: row.nonzero_mtd_cells_before,
    salesCellsReset: row.sales_cells_reset,
    unpromotedPosTickets: row.unpromoted_pos_tickets,
    salesCellMismatchCount: row.sales_cell_mismatch_count,
    salesCellMismatchQtyAbs: row.sales_cell_mismatch_qty_abs,
    totalQtySales: row.total_qty_sales,
    totalNetSales: numberValue(row.total_net_sales),
    totalProfit: numberValue(row.total_profit),
    inventoryValueTotal: numberValue(row.inventory_value_total),
    errorText: row.error_text,
    startedAt: isoDate(row.started_at),
    finishedAt: isoDate(row.finished_at),
  };
}

function mapClosedMonth(row: ClosedMonthRow) {
  return {
    yearMonth: row.year_month,
    runId: row.run_id,
    targetSlot: row.target_slot,
    snapshotAsOf: isoDate(row.snapshot_as_of),
    closedBy: row.closed_by,
    closedAt: isoDate(row.closed_at),
    snapshotsClosed: row.snapshots_closed,
    monthRowsClosed: row.month_rows_closed,
    salesCellsReset: row.sales_cells_reset,
    totalQtySales: row.total_qty_sales,
    totalNetSales: numberValue(row.total_net_sales),
    totalProfit: numberValue(row.total_profit),
    inventoryValueTotal: numberValue(row.inventory_value_total),
  };
}

function mapWeekRun(row: WeekRunRow) {
  return {
    id: row.id,
    weekEndingDate: dateOnly(row.week_ending_date),
    weekStartDate: dateOnly(row.week_start_date),
    snapshotAsOf: isoDate(row.snapshot_as_of),
    closedBy: row.closed_by,
    dryRun: row.dry_run,
    status: row.status,
    validationStatus: row.validation_status,
    snapshotsScanned: row.snapshots_scanned,
    trendRowsWritten: row.trend_rows_written,
    snapshotsUpdated: row.snapshots_updated,
    unpromotedPosTickets: row.unpromoted_pos_tickets,
    weekSalesMismatchCount: row.week_sales_mismatch_count,
    weekSalesMismatchQtyAbs: row.week_sales_mismatch_qty_abs,
    totalWeekQtySales: row.total_week_qty_sales,
    totalWeekNetSales: numberValue(row.total_week_net_sales),
    totalWeekProfit: numberValue(row.total_week_profit),
    errorText: row.error_text,
    startedAt: isoDate(row.started_at),
    finishedAt: isoDate(row.finished_at),
  };
}

function mapClosedWeek(row: ClosedWeekRow) {
  return {
    weekEndingDate: dateOnly(row.week_ending_date),
    runId: row.run_id,
    weekStartDate: dateOnly(row.week_start_date),
    snapshotAsOf: isoDate(row.snapshot_as_of),
    closedBy: row.closed_by,
    closedAt: isoDate(row.closed_at),
    snapshotsClosed: row.snapshots_closed,
    trendRowsClosed: row.trend_rows_closed,
    totalWeekQtySales: row.total_week_qty_sales,
    totalWeekNetSales: numberValue(row.total_week_net_sales),
    totalWeekProfit: numberValue(row.total_week_profit),
  };
}

function resultStatus(status: InventoryMonthCloseResult['status'] | InventoryWeekCloseResult['status']) {
  return status === 'DRY_RUN' ? 200 : 201;
}

function closeErrorStatus(error: unknown): number | null {
  if (error instanceof InventoryMonthCloseError || error instanceof InventoryWeekCloseError) {
    if (error.code.startsWith('INVALID_')) return 400;
    if (error.code === 'MONTH_ALREADY_CLOSED' || error.code === 'WEEK_ALREADY_CLOSED') return 409;
    if (error.code === 'PRE_CLOSE_VALIDATION_FAILED') return 409;
    return 400;
  }
  if (error instanceof z.ZodError) return 400;
  return null;
}

function sendCloseError(res: Response, error: unknown): boolean {
  const status = closeErrorStatus(error);
  if (!status) return false;
  const code =
    error instanceof InventoryMonthCloseError || error instanceof InventoryWeekCloseError
      ? error.code
      : 'INVALID_REQUEST';
  res.status(status).json({
    error: {
      code,
      message: error instanceof Error ? error.message : String(error),
    },
  });
  return true;
}

router.get('/summary', async (req: Request, res: Response, next) => {
  try {
    const parsed = summaryQuerySchema.parse(req.query);
    const limit = parsed.limit ?? 20;
    const summary = await withClient(async (client) => {
      const [monthRuns, closedMonths, weekRuns, closedWeeks] = await Promise.all([
        client.query<MonthRunRow>(
          `
            SELECT *
              FROM app.inventory_month_close_run
             ORDER BY started_at DESC
             LIMIT $1
          `,
          [limit],
        ),
        client.query<ClosedMonthRow>(
          `
            SELECT *
              FROM app.inventory_closed_month
             ORDER BY year_month DESC
             LIMIT $1
          `,
          [limit],
        ),
        client.query<WeekRunRow>(
          `
            SELECT *
              FROM app.inventory_week_close_run
             ORDER BY started_at DESC
             LIMIT $1
          `,
          [limit],
        ),
        client.query<ClosedWeekRow>(
          `
            SELECT *
              FROM app.inventory_closed_week
             ORDER BY week_ending_date DESC
             LIMIT $1
          `,
          [limit],
        ),
      ]);

      return {
        monthRuns: monthRuns.rows.map(mapMonthRun),
        closedMonths: closedMonths.rows.map(mapClosedMonth),
        weekRuns: weekRuns.rows.map(mapWeekRun),
        closedWeeks: closedWeeks.rows.map(mapClosedWeek),
      };
    });
    res.json(summary);
  } catch (error) {
    if (sendCloseError(res, error)) return;
    next(error);
  }
});

router.post('/month', async (req: Request, res: Response, next) => {
  try {
    const body = monthCloseSchema.parse(req.body);
    const result = await withClient((client) =>
      closeInventoryMonth({
        pgClient: client,
        closeMonth: body.closeMonth,
        closedBy: actorFromRequest(req, body.closedBy),
        dryRun: body.dryRun === true,
      }),
    );
    res.status(resultStatus(result.status)).json(result);
  } catch (error) {
    if (sendCloseError(res, error)) return;
    next(error);
  }
});

router.post('/week', async (req: Request, res: Response, next) => {
  try {
    const body = weekCloseSchema.parse(req.body);
    const result = await withClient((client) =>
      closeInventoryWeek({
        pgClient: client,
        weekEndingDate: body.weekEndingDate,
        closedBy: actorFromRequest(req, body.closedBy),
        dryRun: body.dryRun === true,
      }),
    );
    res.status(resultStatus(result.status)).json(result);
  } catch (error) {
    if (sendCloseError(res, error)) return;
    next(error);
  }
});

export default router;
