import { randomUUID } from 'node:crypto';

const APP_WEEK_CLOSE_SOURCE = 'APP_WEEK_CLOSE';
const COMPANY_TIME_ZONE = 'America/Guatemala';
const GUATEMALA_UTC_OFFSET_HOURS = 6;
const ISO_DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

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

export type InventoryWeekCloseStatus = 'DRY_RUN' | 'SUCCEEDED';

export interface InventoryWeekCloseOptions {
  pgClient: PgClientLike;
  weekEndingDate: string;
  closedBy: string;
  dryRun?: boolean;
  runId?: string;
}

export interface InventoryWeekCloseValidationSummary {
  unpromotedPosTickets: number;
  weekSalesMismatchCount: number;
  weekSalesMismatchQtyAbs: number;
}

export interface InventoryWeekCloseResult {
  runId: string;
  weekEndingDate: string;
  weekStartDate: string;
  snapshotAsOf: Date;
  companyTimeZone: string;
  dryRun: boolean;
  status: InventoryWeekCloseStatus;
  snapshotsScanned: number;
  trendRowsWritten: number;
  snapshotsUpdated: number;
  totalWeekQtySales: number;
  totalWeekNetSales: number;
  totalWeekProfit: number;
  validation: InventoryWeekCloseValidationSummary;
}

export class InventoryWeekCloseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'InventoryWeekCloseError';
    this.code = code;
  }
}

interface ParsedWeekEndingDate {
  weekEndingDate: string;
  weekStartDate: string;
  windowStart: Date;
  windowEnd: Date;
  snapshotAsOf: Date;
}

interface CloseState {
  snapshotsScanned: number;
  trendRowsWritten: number;
  snapshotsUpdated: number;
  totalWeekQtySales: number;
  totalWeekNetSales: number;
  totalWeekProfit: number;
  validation: InventoryWeekCloseValidationSummary;
  validationStatus: 'PASSED' | 'FAILED' | null;
}

function initialState(): CloseState {
  return {
    snapshotsScanned: 0,
    trendRowsWritten: 0,
    snapshotsUpdated: 0,
    totalWeekQtySales: 0,
    totalWeekNetSales: 0,
    totalWeekProfit: 0,
    validation: {
      unpromotedPosTickets: 0,
      weekSalesMismatchCount: 0,
      weekSalesMismatchQtyAbs: 0,
    },
    validationStatus: null,
  };
}

function guatemalaMidnightUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, GUATEMALA_UTC_OFFSET_HOURS, 0, 0, 0));
}

function addLocalDays(date: Date, days: number): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + days,
    GUATEMALA_UTC_OFFSET_HOURS,
    0,
    0,
    0,
  ));
}

function localDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseInventoryWeekEndingDate(weekEndingDate: string): ParsedWeekEndingDate {
  const normalized = String(weekEndingDate ?? '').trim();
  const match = ISO_DATE_RE.exec(normalized);
  if (!match) {
    throw new InventoryWeekCloseError(
      'INVALID_WEEK_ENDING_DATE',
      `weekEndingDate must match YYYY-MM-DD, got: ${normalized || '(empty)'}`,
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const endDay = guatemalaMidnightUtc(year, month, day);
  if (
    endDay.getUTCFullYear() !== year ||
    endDay.getUTCMonth() !== month - 1 ||
    endDay.getUTCDate() !== day
  ) {
    throw new InventoryWeekCloseError(
      'INVALID_WEEK_ENDING_DATE',
      `weekEndingDate is not a valid calendar date: ${normalized}`,
    );
  }

  const windowStart = addLocalDays(endDay, -6);
  const windowEnd = addLocalDays(endDay, 1);
  return {
    weekEndingDate: normalized,
    weekStartDate: localDateString(windowStart),
    windowStart,
    windowEnd,
    snapshotAsOf: windowEnd,
  };
}

function normalizeClosedBy(value: string): string {
  const closedBy = String(value ?? '').trim();
  if (!closedBy) {
    throw new InventoryWeekCloseError('INVALID_CLOSED_BY', 'closedBy is required');
  }
  if (closedBy.length > 120) {
    throw new InventoryWeekCloseError('INVALID_CLOSED_BY', 'closedBy must be 120 characters or fewer');
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
    parsed: ParsedWeekEndingDate;
    closedBy: string;
    dryRun: boolean;
  },
): Promise<void> {
  await c.query(
    `
      INSERT INTO app.inventory_week_close_run (
        id,
        week_ending_date,
        week_start_date,
        snapshot_as_of,
        closed_by,
        dry_run,
        status,
        started_at
      )
      VALUES ($1::uuid, $2::date, $3::date, $4::timestamptz, $5, $6, 'RUNNING', NOW())
    `,
    [
      args.runId,
      args.parsed.weekEndingDate,
      args.parsed.weekStartDate,
      args.parsed.snapshotAsOf,
      args.closedBy,
      args.dryRun,
    ],
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
      UPDATE app.inventory_week_close_run
         SET status = $2,
             validation_status = $3,
             snapshots_scanned = $4,
             trend_rows_written = $5,
             snapshots_updated = $6,
             unpromoted_pos_tickets = $7,
             week_sales_mismatch_count = $8,
             week_sales_mismatch_qty_abs = $9,
             total_week_qty_sales = $10,
             total_week_net_sales = $11::numeric,
             total_week_profit = $12::numeric,
             error_text = $13,
             finished_at = NOW()
       WHERE id = $1::uuid
    `,
    [
      args.runId,
      args.status,
      args.state.validationStatus,
      args.state.snapshotsScanned,
      args.state.trendRowsWritten,
      args.state.snapshotsUpdated,
      args.state.validation.unpromotedPosTickets,
      args.state.validation.weekSalesMismatchCount,
      args.state.validation.weekSalesMismatchQtyAbs,
      args.state.totalWeekQtySales,
      args.state.totalWeekNetSales,
      args.state.totalWeekProfit,
      args.errorText ?? null,
    ],
  );
}

async function acquireWeekCloseLock(c: PgClientLike): Promise<void> {
  await c.query(`SELECT pg_advisory_xact_lock(hashtext('app.inventory_week_close'))`);
}

async function assertWeekNotClosed(c: PgClientLike, weekEndingDate: string): Promise<void> {
  const result = await c.query<{ already_closed: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
          FROM app.inventory_closed_week
         WHERE week_ending_date = $1::date
      ) AS already_closed
    `,
    [weekEndingDate],
  );
  if (result.rows[0]?.already_closed) {
    throw new InventoryWeekCloseError(
      'WEEK_ALREADY_CLOSED',
      `Inventory week ending ${weekEndingDate} has already been closed`,
    );
  }
}

async function loadPreCloseValidation(
  c: PgClientLike,
  parsed: ParsedWeekEndingDate,
): Promise<InventoryWeekCloseValidationSummary> {
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

  const mismatchResult = await c.query<{
    mismatch_count: string | number;
    mismatch_qty_abs: string | number;
  }>(
    `
      WITH ticket_sales AS (
        SELECT
          t.store_id::int AS store_id,
          UPPER(BTRIM(COALESCE(sk.code, sk.provisional_code, l.sku_code))) AS sku_code,
          SUM(l.quantity)::int AS expected_week_qty_sales
        FROM app.sales_history_ticket t
        INNER JOIN app.sales_history_ticket_line l ON l.ticket_id = t.id
        LEFT JOIN app.sku sk ON sk.id = l.sku_id
        WHERE t.status = 'completed'
          AND t.purchased_at >= $1::timestamptz
          AND t.purchased_at < $2::timestamptz
          AND t.store_id IS NOT NULL
          AND COALESCE(sk.code, sk.provisional_code, l.sku_code) IS NOT NULL
        GROUP BY t.store_id, UPPER(BTRIM(COALESCE(sk.code, sk.provisional_code, l.sku_code)))
      ),
      snapshot_sales AS (
        SELECT
          s.store_id,
          UPPER(BTRIM(s.sku_code)) AS sku_code,
          SUM(s.week_qty_sales)::int AS actual_week_qty_sales
        FROM app.inventory_history_snapshot s
        GROUP BY s.store_id, UPPER(BTRIM(s.sku_code))
      ),
      compared AS (
        SELECT
          COALESCE(ss.store_id, ts.store_id) AS store_id,
          COALESCE(ss.sku_code, ts.sku_code) AS sku_code,
          COALESCE(ss.actual_week_qty_sales, 0) AS actual_week_qty_sales,
          COALESCE(ts.expected_week_qty_sales, 0) AS expected_week_qty_sales
        FROM snapshot_sales ss
        FULL OUTER JOIN ticket_sales ts
          ON ts.store_id = ss.store_id
         AND ts.sku_code = ss.sku_code
      )
      SELECT
        COUNT(*)::int AS mismatch_count,
        COALESCE(SUM(ABS(actual_week_qty_sales - expected_week_qty_sales)), 0)::int AS mismatch_qty_abs
      FROM compared
      WHERE actual_week_qty_sales <> expected_week_qty_sales
        AND (actual_week_qty_sales <> 0 OR expected_week_qty_sales <> 0)
    `,
    [parsed.windowStart, parsed.windowEnd],
  );

  return {
    unpromotedPosTickets: numberValue(posResult.rows[0]?.unpromoted_pos_tickets),
    weekSalesMismatchCount: numberValue(mismatchResult.rows[0]?.mismatch_count),
    weekSalesMismatchQtyAbs: numberValue(mismatchResult.rows[0]?.mismatch_qty_abs),
  };
}

function assertValidationPassed(validation: InventoryWeekCloseValidationSummary): void {
  if (validation.unpromotedPosTickets > 0 || validation.weekSalesMismatchCount > 0) {
    throw new InventoryWeekCloseError(
      'PRE_CLOSE_VALIDATION_FAILED',
      `Pre-close validation failed: ${validation.unpromotedPosTickets} completed POS tickets are not promoted ` +
        `to sales_history_ticket, and ${validation.weekSalesMismatchCount} inventory_history_snapshot week counters ` +
        `differ from ticket-line totals by ${validation.weekSalesMismatchQtyAbs} units`,
    );
  }
}

async function loadPreCloseSummary(c: PgClientLike): Promise<Pick<
  CloseState,
  'snapshotsScanned' | 'totalWeekQtySales' | 'totalWeekNetSales' | 'totalWeekProfit'
>> {
  const result = await c.query<{
    snapshots_scanned: string | number;
    total_week_qty_sales: string | number;
    total_week_net_sales: string | number;
    total_week_profit: string | number;
  }>(
    `
      SELECT
        COUNT(*)::int AS snapshots_scanned,
        COALESCE(SUM(week_qty_sales), 0)::int AS total_week_qty_sales,
        COALESCE(ROUND(SUM(COALESCE(week_dol_sales, 0)), 2), 0)::numeric(14, 2) AS total_week_net_sales,
        COALESCE(ROUND(SUM(COALESCE(week_profit, 0)), 2), 0)::numeric(14, 2) AS total_week_profit
      FROM app.inventory_history_snapshot
    `,
  );
  const row = result.rows[0] ?? {};
  return {
    snapshotsScanned: numberValue(row.snapshots_scanned),
    totalWeekQtySales: numberValue(row.total_week_qty_sales),
    totalWeekNetSales: numberValue(row.total_week_net_sales),
    totalWeekProfit: numberValue(row.total_week_profit),
  };
}

async function loadPredictedTrendRows(c: PgClientLike): Promise<number> {
  const result = await c.query<{ predicted_trend_rows: string | number }>(
    `
      SELECT (
        (SELECT COUNT(*) FROM app.inventory_history_snapshot) +
        (
          SELECT COUNT(*)
            FROM app.inventory_history_trend_week
           WHERE slot_number BETWEEN 2 AND 7
        )
      )::int AS predicted_trend_rows
    `,
  );
  return numberValue(result.rows[0]?.predicted_trend_rows);
}

async function createWeeklyCloseTempTables(c: PgClientLike): Promise<void> {
  await c.query(`
    CREATE TEMP TABLE tmp_inventory_week_close_state ON COMMIT DROP AS
    SELECT
      s.id AS snapshot_id,
      s.on_hand,
      s.week_qty_sales,
      CASE
        WHEN w7.snapshot_id IS NULL THEN s.trend_week_8_beg_on_hand
        ELSE (CASE WHEN w7.on_hand_constant <> 0 THEN w7.on_hand_constant ELSE w7.begin_on_hand END) - w7.sales
      END AS current_begin_on_hand,
      (s.on_hand + s.week_qty_sales) AS current_avail_week,
      w1.begin_on_hand AS outgoing_begin_on_hand
    FROM app.inventory_history_snapshot s
    LEFT JOIN app.inventory_history_trend_week w7
      ON w7.snapshot_id = s.id
     AND w7.slot_number = 7
    LEFT JOIN app.inventory_history_trend_week w1
      ON w1.snapshot_id = s.id
     AND w1.slot_number = 1
  `);

  await c.query(`
    CREATE TEMP TABLE tmp_inventory_week_close_trend_rows ON COMMIT DROP AS
    SELECT
      w.snapshot_id,
      (w.slot_number - 1)::smallint AS slot_number,
      w.begin_on_hand,
      w.on_hand_constant,
      w.sales
    FROM app.inventory_history_trend_week w
    WHERE w.slot_number BETWEEN 2 AND 7

    UNION ALL

    SELECT
      state.snapshot_id,
      7::smallint AS slot_number,
      state.current_begin_on_hand AS begin_on_hand,
      CASE
        WHEN state.current_avail_week <> state.current_begin_on_hand THEN state.current_avail_week
        ELSE 0
      END AS on_hand_constant,
      state.week_qty_sales AS sales
    FROM tmp_inventory_week_close_state state
  `);
}

async function replaceTrendRows(c: PgClientLike): Promise<number> {
  await c.query(`
    DELETE FROM app.inventory_history_trend_week
     WHERE snapshot_id IN (
       SELECT snapshot_id
       FROM tmp_inventory_week_close_state
     )
  `);

  const result = await c.query(`
    INSERT INTO app.inventory_history_trend_week (
      id,
      snapshot_id,
      slot_number,
      begin_on_hand,
      on_hand_constant,
      sales
    )
    SELECT
      gen_random_uuid(),
      snapshot_id,
      slot_number,
      begin_on_hand,
      on_hand_constant,
      sales
    FROM tmp_inventory_week_close_trend_rows
  `);
  return rowCount(result);
}

async function updateSnapshotsAfterClose(c: PgClientLike, runId: string): Promise<number> {
  const result = await c.query(
    `
      UPDATE app.inventory_history_snapshot s
         SET trend_week_8_beg_on_hand = COALESCE(state.outgoing_begin_on_hand, s.trend_week_8_beg_on_hand),
             week_qty_sales = 0,
             week_dol_sales = 0,
             week_profit = 0,
             week_markdown = 0,
             source = $2,
             source_run_id = $1::uuid,
             updated_at = NOW()
        FROM tmp_inventory_week_close_state state
       WHERE state.snapshot_id = s.id
    `,
    [runId, APP_WEEK_CLOSE_SOURCE],
  );
  return rowCount(result);
}

async function insertClosedWeek(
  c: PgClientLike,
  args: {
    runId: string;
    parsed: ParsedWeekEndingDate;
    closedBy: string;
    state: CloseState;
  },
): Promise<void> {
  await c.query(
    `
      INSERT INTO app.inventory_closed_week (
        week_ending_date,
        run_id,
        week_start_date,
        snapshot_as_of,
        closed_by,
        closed_at,
        snapshots_closed,
        trend_rows_closed,
        total_week_qty_sales,
        total_week_net_sales,
        total_week_profit
      )
      VALUES (
        $1::date,
        $2::uuid,
        $3::date,
        $4::timestamptz,
        $5,
        NOW(),
        $6,
        $7,
        $8,
        $9::numeric,
        $10::numeric
      )
    `,
    [
      args.parsed.weekEndingDate,
      args.runId,
      args.parsed.weekStartDate,
      args.parsed.snapshotAsOf,
      args.closedBy,
      args.state.snapshotsUpdated,
      args.state.trendRowsWritten,
      args.state.totalWeekQtySales,
      args.state.totalWeekNetSales,
      args.state.totalWeekProfit,
    ],
  );
}

function buildResult(
  args: {
    runId: string;
    parsed: ParsedWeekEndingDate;
    dryRun: boolean;
    status: InventoryWeekCloseStatus;
    state: CloseState;
  },
): InventoryWeekCloseResult {
  return {
    runId: args.runId,
    weekEndingDate: args.parsed.weekEndingDate,
    weekStartDate: args.parsed.weekStartDate,
    snapshotAsOf: args.parsed.snapshotAsOf,
    companyTimeZone: COMPANY_TIME_ZONE,
    dryRun: args.dryRun,
    status: args.status,
    snapshotsScanned: args.state.snapshotsScanned,
    trendRowsWritten: args.state.trendRowsWritten,
    snapshotsUpdated: args.state.snapshotsUpdated,
    totalWeekQtySales: args.state.totalWeekQtySales,
    totalWeekNetSales: args.state.totalWeekNetSales,
    totalWeekProfit: args.state.totalWeekProfit,
    validation: args.state.validation,
  };
}

export async function closeInventoryWeek(options: InventoryWeekCloseOptions): Promise<InventoryWeekCloseResult> {
  const parsed = parseInventoryWeekEndingDate(options.weekEndingDate);
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

    await acquireWeekCloseLock(c);
    await assertWeekNotClosed(c, parsed.weekEndingDate);

    state.validation = await loadPreCloseValidation(c, parsed);
    state.validationStatus = 'PASSED';
    try {
      assertValidationPassed(state.validation);
    } catch (error) {
      state.validationStatus = 'FAILED';
      throw error;
    }

    Object.assign(state, await loadPreCloseSummary(c));

    if (dryRun) {
      state.trendRowsWritten = await loadPredictedTrendRows(c);
      state.snapshotsUpdated = state.snapshotsScanned;

      await c.query('ROLLBACK');
      transactionStarted = false;

      await finishRun(c, { runId, status: 'DRY_RUN', state });
      return buildResult({ runId, parsed, dryRun, status: 'DRY_RUN', state });
    }

    await createWeeklyCloseTempTables(c);
    state.trendRowsWritten = await replaceTrendRows(c);
    state.snapshotsUpdated = await updateSnapshotsAfterClose(c, runId);

    await insertClosedWeek(c, { runId, parsed, closedBy, state });

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
