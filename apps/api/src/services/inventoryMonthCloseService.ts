import { randomUUID } from 'node:crypto';

const APP_MONTH_CLOSE_SOURCE = 'APP_MONTH_CLOSE';
const COMPANY_TIME_ZONE = 'America/Guatemala';
const GUATEMALA_UTC_OFFSET_HOURS = 6;
const YEAR_MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

type QueryResult<T = Record<string, unknown>> = {
  rows: T[];
  rowCount: number | null;
};

export interface PgClientLike {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

export type InventoryMonthCloseStatus = 'DRY_RUN' | 'SUCCEEDED';

export interface InventoryMonthCloseOptions {
  pgClient: PgClientLike;
  closeMonth: string;
  closedBy: string;
  dryRun?: boolean;
  runId?: string;
}

export interface InventoryMonthCloseValidationSummary {
  unpromotedPosTickets: number;
  salesCellMismatchCount: number;
  salesCellMismatchQtyAbs: number;
}

export interface InventoryMonthCloseResult {
  runId: string;
  closeMonth: string;
  targetSlot: number;
  snapshotAsOf: Date;
  companyTimeZone: string;
  dryRun: boolean;
  status: InventoryMonthCloseStatus;
  snapshotsScanned: number;
  monthsUpserted: number;
  snapshotsUpdated: number;
  nonzeroMtdCellsBefore: number;
  salesCellsReset: number;
  totalQtySales: number;
  totalNetSales: number;
  totalProfit: number;
  inventoryValueTotal: number;
  validation: InventoryMonthCloseValidationSummary;
}

export class InventoryMonthCloseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'InventoryMonthCloseError';
    this.code = code;
  }
}

interface ParsedCloseMonth {
  yearMonth: string;
  year: number;
  month: number;
  targetSlot: number;
  windowStart: Date;
  windowEnd: Date;
  snapshotAsOf: Date;
}

interface CloseState {
  snapshotsScanned: number;
  monthsUpserted: number;
  snapshotsUpdated: number;
  nonzeroMtdCellsBefore: number;
  salesCellsReset: number;
  totalQtySales: number;
  totalNetSales: number;
  totalProfit: number;
  inventoryValueTotal: number;
  validation: InventoryMonthCloseValidationSummary;
  validationStatus: 'PASSED' | 'FAILED' | null;
}

function initialState(): CloseState {
  return {
    snapshotsScanned: 0,
    monthsUpserted: 0,
    snapshotsUpdated: 0,
    nonzeroMtdCellsBefore: 0,
    salesCellsReset: 0,
    totalQtySales: 0,
    totalNetSales: 0,
    totalProfit: 0,
    inventoryValueTotal: 0,
    validation: {
      unpromotedPosTickets: 0,
      salesCellMismatchCount: 0,
      salesCellMismatchQtyAbs: 0,
    },
    validationStatus: null,
  };
}

function guatemalaMidnightUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, GUATEMALA_UTC_OFFSET_HOURS, 0, 0, 0));
}

export function parseInventoryCloseMonth(closeMonth: string): ParsedCloseMonth {
  const normalized = String(closeMonth ?? '').trim();
  const match = YEAR_MONTH_RE.exec(normalized);
  if (!match) {
    throw new InventoryMonthCloseError(
      'INVALID_CLOSE_MONTH',
      `closeMonth must match YYYY-MM, got: ${normalized || '(empty)'}`,
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const windowStart = guatemalaMidnightUtc(year, month, 1);
  const windowEnd = guatemalaMidnightUtc(nextYear, nextMonth, 1);

  return {
    yearMonth: normalized,
    year,
    month,
    targetSlot: month,
    windowStart,
    windowEnd,
    snapshotAsOf: windowEnd,
  };
}

function normalizeClosedBy(value: string): string {
  const closedBy = String(value ?? '').trim();
  if (!closedBy) {
    throw new InventoryMonthCloseError('INVALID_CLOSED_BY', 'closedBy is required');
  }
  if (closedBy.length > 120) {
    throw new InventoryMonthCloseError('INVALID_CLOSED_BY', 'closedBy must be 120 characters or fewer');
  }
  return closedBy;
}

function numberValue(value: unknown): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function rowCount(result: QueryResult): number {
  return Number(result.rowCount ?? 0);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function truncateErrorText(error: unknown): string {
  return errorMessage(error).slice(0, 8000);
}

async function insertRun(
  c: PgClientLike,
  args: {
    runId: string;
    parsed: ParsedCloseMonth;
    closedBy: string;
    dryRun: boolean;
  },
): Promise<void> {
  await c.query(
    `
      INSERT INTO app.inventory_month_close_run (
        id,
        year_month,
        target_slot,
        snapshot_as_of,
        closed_by,
        dry_run,
        status,
        started_at
      )
      VALUES ($1::uuid, $2, $3::smallint, $4::timestamptz, $5, $6, 'RUNNING', NOW())
    `,
    [args.runId, args.parsed.yearMonth, args.parsed.targetSlot, args.parsed.snapshotAsOf, args.closedBy, args.dryRun],
  );
}

async function finishRun(
  c: PgClientLike,
  args: {
    runId: string;
    status: 'DRY_RUN' | 'SUCCEEDED' | 'FAILED';
    state: CloseState;
    errorText?: string | null;
  },
): Promise<void> {
  await c.query(
    `
      UPDATE app.inventory_month_close_run
         SET status = $2,
             validation_status = $3,
             snapshots_scanned = $4,
             months_upserted = $5,
             snapshots_updated = $6,
             nonzero_mtd_cells_before = $7,
             sales_cells_reset = $8,
             unpromoted_pos_tickets = $9,
             sales_cell_mismatch_count = $10,
             sales_cell_mismatch_qty_abs = $11,
             total_qty_sales = $12,
             total_net_sales = $13::numeric,
             total_profit = $14::numeric,
             inventory_value_total = $15::numeric,
             error_text = $16,
             finished_at = NOW()
       WHERE id = $1::uuid
    `,
    [
      args.runId,
      args.status,
      args.state.validationStatus,
      args.state.snapshotsScanned,
      args.state.monthsUpserted,
      args.state.snapshotsUpdated,
      args.state.nonzeroMtdCellsBefore,
      args.state.salesCellsReset,
      args.state.validation.unpromotedPosTickets,
      args.state.validation.salesCellMismatchCount,
      args.state.validation.salesCellMismatchQtyAbs,
      args.state.totalQtySales,
      args.state.totalNetSales,
      args.state.totalProfit,
      args.state.inventoryValueTotal,
      args.errorText ?? null,
    ],
  );
}

async function acquireMonthCloseLock(c: PgClientLike): Promise<void> {
  await c.query(`SELECT pg_advisory_xact_lock(hashtext('app.inventory_month_close'))`);
}

async function assertMonthNotClosed(c: PgClientLike, closeMonth: string): Promise<void> {
  const result = await c.query<{ already_closed: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
          FROM app.inventory_closed_month
         WHERE year_month = $1
      ) AS already_closed
    `,
    [closeMonth],
  );
  if (result.rows[0]?.already_closed) {
    throw new InventoryMonthCloseError(
      'MONTH_ALREADY_CLOSED',
      `Inventory month ${closeMonth} has already been closed`,
    );
  }
}

async function loadPreCloseValidation(
  c: PgClientLike,
  parsed: ParsedCloseMonth,
): Promise<InventoryMonthCloseValidationSummary> {
  const posResult = await c.query<{ unpromoted_pos_tickets: string | number }>(
    `
      SELECT COUNT(*)::int AS unpromoted_pos_tickets
        FROM app.pos_ticket pt
       WHERE pt.status = 'COMPLETED'
         AND pt.completed_at >= $1::timestamptz
         AND pt.completed_at < $2::timestamptz
         AND NOT EXISTS (
           SELECT 1
             FROM app.sales_history_ticket sht
            WHERE sht.external_transaction_id = pt.id::text
              AND sht.source = 'pos_live'
              AND sht.status = 'completed'
         )
    `,
    [parsed.windowStart, parsed.windowEnd],
  );

  const cellResult = await c.query<{
    mismatch_count: string | number;
    mismatch_qty_abs: string | number;
  }>(
    `
      WITH ticket_cells AS (
        SELECT
          t.store_id::int AS store_id,
          l.sku_id,
          btrim(COALESCE(l.column_label, '')) AS column_label,
          btrim(COALESCE(l.row_label, '')) AS row_label,
          SUM(l.quantity)::int AS expected_mtd_sales
        FROM app.sales_history_ticket t
        INNER JOIN app.sales_history_ticket_line l ON l.ticket_id = t.id
        WHERE t.status = 'completed'
          AND t.purchased_at >= $1::timestamptz
          AND t.purchased_at < $2::timestamptz
          AND t.store_id IS NOT NULL
          AND l.sku_id IS NOT NULL
        GROUP BY t.store_id, l.sku_id, btrim(COALESCE(l.column_label, '')), btrim(COALESCE(l.row_label, ''))
      ),
      cell_compare AS (
        SELECT
          COALESCE(c.store_id, tc.store_id) AS store_id,
          COALESCE(c.sku_id, tc.sku_id) AS sku_id,
          COALESCE(c.column_label, tc.column_label) AS column_label,
          COALESCE(c.row_label, tc.row_label) AS row_label,
          COALESCE(c.mtd_sales, 0) AS actual_mtd_sales,
          COALESCE(tc.expected_mtd_sales, 0) AS expected_mtd_sales
        FROM app.inventory_sales_cell c
        FULL OUTER JOIN ticket_cells tc
          ON tc.store_id = c.store_id
         AND tc.sku_id = c.sku_id
         AND tc.column_label = c.column_label
         AND tc.row_label = c.row_label
      )
      SELECT
        COUNT(*)::int AS mismatch_count,
        COALESCE(SUM(ABS(actual_mtd_sales - expected_mtd_sales)), 0)::int AS mismatch_qty_abs
      FROM cell_compare
      WHERE actual_mtd_sales <> expected_mtd_sales
    `,
    [parsed.windowStart, parsed.windowEnd],
  );

  return {
    unpromotedPosTickets: numberValue(posResult.rows[0]?.unpromoted_pos_tickets),
    salesCellMismatchCount: numberValue(cellResult.rows[0]?.mismatch_count),
    salesCellMismatchQtyAbs: numberValue(cellResult.rows[0]?.mismatch_qty_abs),
  };
}

function assertValidationPassed(validation: InventoryMonthCloseValidationSummary): void {
  if (validation.unpromotedPosTickets > 0 || validation.salesCellMismatchCount > 0) {
    throw new InventoryMonthCloseError(
      'PRE_CLOSE_VALIDATION_FAILED',
      `Pre-close validation failed: ${validation.unpromotedPosTickets} completed POS tickets are not promoted ` +
        `to sales_history_ticket, and ${validation.salesCellMismatchCount} inventory_sales_cell MTD cells differ ` +
        `from ticket-line totals by ${validation.salesCellMismatchQtyAbs} units`,
    );
  }
}

async function loadPreCloseSummary(c: PgClientLike): Promise<Pick<
  CloseState,
  'snapshotsScanned' | 'totalQtySales' | 'totalNetSales' | 'totalProfit' | 'inventoryValueTotal'
>> {
  const result = await c.query<{
    snapshots_scanned: string | number;
    total_qty_sales: string | number;
    total_net_sales: string | number;
    total_profit: string | number;
    inventory_value_total: string | number;
  }>(
    `
      SELECT
        COUNT(*)::int AS snapshots_scanned,
        COALESCE(SUM(month_qty_sales), 0)::int AS total_qty_sales,
        COALESCE(ROUND(SUM(COALESCE(month_dol_sales, 0)), 2), 0)::numeric(14, 2) AS total_net_sales,
        COALESCE(ROUND(SUM(COALESCE(month_profit, 0)), 2), 0)::numeric(14, 2) AS total_profit,
        COALESCE(
          ROUND(
            SUM(
              CASE
                WHEN average_cost IS NULL THEN 0
                ELSE ROUND(on_hand::numeric * average_cost, 2)
              END
            ),
            2
          ),
          0
        )::numeric(14, 2) AS inventory_value_total
      FROM app.inventory_history_snapshot
    `,
  );
  const row = result.rows[0] ?? {};
  return {
    snapshotsScanned: numberValue(row.snapshots_scanned),
    totalQtySales: numberValue(row.total_qty_sales),
    totalNetSales: numberValue(row.total_net_sales),
    totalProfit: numberValue(row.total_profit),
    inventoryValueTotal: numberValue(row.inventory_value_total),
  };
}

async function loadSalesCellSummary(c: PgClientLike): Promise<number> {
  const result = await c.query<{ nonzero_mtd_cells_before: string | number }>(
    `
      SELECT COUNT(*)::int AS nonzero_mtd_cells_before
        FROM app.inventory_sales_cell
       WHERE mtd_sales <> 0
    `,
  );
  return numberValue(result.rows[0]?.nonzero_mtd_cells_before);
}

async function upsertClosedMonthRows(
  c: PgClientLike,
  args: {
    parsed: ParsedCloseMonth;
  },
): Promise<number> {
  const result = await c.query(
    `
      INSERT INTO app.inventory_history_month (
        id,
        snapshot_id,
        slot_number,
        calendar_month,
        stored_year,
        year_month,
        qty_sales,
        net_sales,
        profit,
        qty_on_hand,
        inventory_value
      )
      SELECT
        gen_random_uuid(),
        s.id,
        $1::smallint,
        $1::smallint,
        $2::int,
        $3,
        s.month_qty_sales,
        s.month_dol_sales,
        s.month_profit,
        s.last_month_on_hand,
        CASE
          WHEN s.average_cost IS NULL THEN NULL
          ELSE ROUND(s.on_hand::numeric * s.average_cost, 2)::numeric(14, 2)
        END
      FROM app.inventory_history_snapshot s
      ON CONFLICT ON CONSTRAINT inventory_history_month_snapshot_slot_key
      DO UPDATE SET
        calendar_month = EXCLUDED.calendar_month,
        stored_year = EXCLUDED.stored_year,
        year_month = EXCLUDED.year_month,
        qty_sales = EXCLUDED.qty_sales,
        net_sales = EXCLUDED.net_sales,
        profit = EXCLUDED.profit,
        qty_on_hand = EXCLUDED.qty_on_hand,
        inventory_value = EXCLUDED.inventory_value
    `,
    [args.parsed.targetSlot, args.parsed.year, args.parsed.yearMonth],
  );
  return rowCount(result);
}

async function updateSnapshotsAfterClose(
  c: PgClientLike,
  args: {
    runId: string;
    snapshotAsOf: Date;
  },
): Promise<number> {
  const result = await c.query(
    `
      UPDATE app.inventory_history_snapshot
         SET last_month_on_hand = on_hand,
             last_month_inv_value = CASE
               WHEN average_cost IS NULL THEN NULL
               ELSE ROUND(on_hand::numeric * average_cost, 2)::numeric(14, 2)
             END,
             month_qty_sales = 0,
             month_dol_sales = 0,
             month_profit = 0,
             month_markdown = 0,
             snapshot_as_of = $2::timestamptz,
             source = $3,
             source_run_id = $1::uuid,
             updated_at = NOW()
    `,
    [args.runId, args.snapshotAsOf, APP_MONTH_CLOSE_SOURCE],
  );
  return rowCount(result);
}

async function resetInventorySalesCellMtd(c: PgClientLike, runId: string): Promise<number> {
  const result = await c.query(
    `
      UPDATE app.inventory_sales_cell
         SET mtd_sales = 0,
             source = $2,
             source_run_id = $1::uuid,
             updated_at = NOW()
       WHERE mtd_sales <> 0
    `,
    [runId, APP_MONTH_CLOSE_SOURCE],
  );
  return rowCount(result);
}

async function insertClosedMonth(
  c: PgClientLike,
  args: {
    runId: string;
    parsed: ParsedCloseMonth;
    closedBy: string;
    state: CloseState;
  },
): Promise<void> {
  await c.query(
    `
      INSERT INTO app.inventory_closed_month (
        year_month,
        run_id,
        target_slot,
        snapshot_as_of,
        closed_by,
        closed_at,
        snapshots_closed,
        month_rows_closed,
        sales_cells_reset,
        total_qty_sales,
        total_net_sales,
        total_profit,
        inventory_value_total
      )
      VALUES (
        $1,
        $2::uuid,
        $3::smallint,
        $4::timestamptz,
        $5,
        NOW(),
        $6,
        $7,
        $8,
        $9,
        $10::numeric,
        $11::numeric,
        $12::numeric
      )
    `,
    [
      args.parsed.yearMonth,
      args.runId,
      args.parsed.targetSlot,
      args.parsed.snapshotAsOf,
      args.closedBy,
      args.state.snapshotsUpdated,
      args.state.monthsUpserted,
      args.state.salesCellsReset,
      args.state.totalQtySales,
      args.state.totalNetSales,
      args.state.totalProfit,
      args.state.inventoryValueTotal,
    ],
  );
}

function buildResult(
  args: {
    runId: string;
    parsed: ParsedCloseMonth;
    dryRun: boolean;
    status: InventoryMonthCloseStatus;
    state: CloseState;
  },
): InventoryMonthCloseResult {
  return {
    runId: args.runId,
    closeMonth: args.parsed.yearMonth,
    targetSlot: args.parsed.targetSlot,
    snapshotAsOf: args.parsed.snapshotAsOf,
    companyTimeZone: COMPANY_TIME_ZONE,
    dryRun: args.dryRun,
    status: args.status,
    snapshotsScanned: args.state.snapshotsScanned,
    monthsUpserted: args.state.monthsUpserted,
    snapshotsUpdated: args.state.snapshotsUpdated,
    nonzeroMtdCellsBefore: args.state.nonzeroMtdCellsBefore,
    salesCellsReset: args.state.salesCellsReset,
    totalQtySales: args.state.totalQtySales,
    totalNetSales: args.state.totalNetSales,
    totalProfit: args.state.totalProfit,
    inventoryValueTotal: args.state.inventoryValueTotal,
    validation: args.state.validation,
  };
}

export async function closeInventoryMonth(options: InventoryMonthCloseOptions): Promise<InventoryMonthCloseResult> {
  const parsed = parseInventoryCloseMonth(options.closeMonth);
  const closedBy = normalizeClosedBy(options.closedBy);
  const dryRun = options.dryRun === true;
  const runId = options.runId ?? randomUUID();
  const c = options.pgClient;
  const state = initialState();
  let transactionStarted = false;
  let runInserted = false;

  await insertRun(c, { runId, parsed, closedBy, dryRun });
  runInserted = true;

  try {
    await c.query('BEGIN');
    transactionStarted = true;

    await acquireMonthCloseLock(c);
    await assertMonthNotClosed(c, parsed.yearMonth);

    state.validation = await loadPreCloseValidation(c, parsed);
    state.validationStatus = 'PASSED';
    try {
      assertValidationPassed(state.validation);
    } catch (error) {
      state.validationStatus = 'FAILED';
      throw error;
    }

    Object.assign(state, await loadPreCloseSummary(c));
    state.nonzeroMtdCellsBefore = await loadSalesCellSummary(c);

    if (dryRun) {
      state.monthsUpserted = state.snapshotsScanned;
      state.snapshotsUpdated = state.snapshotsScanned;
      state.salesCellsReset = state.nonzeroMtdCellsBefore;

      await c.query('ROLLBACK');
      transactionStarted = false;

      await finishRun(c, { runId, status: 'DRY_RUN', state });
      return buildResult({ runId, parsed, dryRun, status: 'DRY_RUN', state });
    }

    state.monthsUpserted = await upsertClosedMonthRows(c, { parsed });
    state.snapshotsUpdated = await updateSnapshotsAfterClose(c, {
      runId,
      snapshotAsOf: parsed.snapshotAsOf,
    });
    state.salesCellsReset = await resetInventorySalesCellMtd(c, runId);

    await insertClosedMonth(c, { runId, parsed, closedBy, state });

    await c.query('COMMIT');
    transactionStarted = false;

    await finishRun(c, { runId, status: 'SUCCEEDED', state });
    return buildResult({ runId, parsed, dryRun, status: 'SUCCEEDED', state });
  } catch (error) {
    if (transactionStarted) {
      try {
        await c.query('ROLLBACK');
      } catch {
        // Preserve the original close failure.
      }
    }
    if (runInserted) {
      try {
        await finishRun(c, {
          runId,
          status: 'FAILED',
          state,
          errorText: truncateErrorText(error),
        });
      } catch {
        // Preserve the original close failure.
      }
    }
    throw error;
  }
}
