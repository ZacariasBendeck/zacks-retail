import {
  closeInventoryWeek,
  InventoryWeekCloseError,
  parseInventoryWeekEndingDate,
  type PgClientLike,
} from '../src/services/inventoryWeekCloseService';

type QueryCall = {
  text: string;
  values: unknown[];
};

class FakePgClient implements PgClientLike {
  calls: QueryCall[] = [];
  weekAlreadyClosed = false;
  validation = {
    unpromotedPosTickets: 0,
    weekSalesMismatchCount: 0,
    weekSalesMismatchQtyAbs: 0,
  };
  summary = {
    snapshotsScanned: 2,
    totalWeekQtySales: 7,
    totalWeekNetSales: 1234.56,
    totalWeekProfit: 789.1,
  };
  predictedTrendRows = 14;
  trendRowsWritten = 14;
  snapshotsUpdated = 2;

  async query<T = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<{ rows: T[]; rowCount: number | null }> {
    this.calls.push({ text, values });
    const compact = text.replace(/\s+/g, ' ').trim();

    if (compact === 'BEGIN' || compact === 'COMMIT' || compact === 'ROLLBACK') {
      return { rows: [], rowCount: null };
    }
    if (compact.includes('INSERT INTO app.inventory_week_close_run')) {
      return { rows: [], rowCount: 1 };
    }
    if (compact.includes('UPDATE app.inventory_week_close_run')) {
      return { rows: [], rowCount: 1 };
    }
    if (compact.includes('pg_advisory_xact_lock')) {
      return { rows: [], rowCount: 1 };
    }
    if (compact.includes('FROM app.inventory_closed_week')) {
      return { rows: [{ already_closed: this.weekAlreadyClosed } as T], rowCount: 1 };
    }
    if (compact.includes('FROM app.pos_ticket pt')) {
      return {
        rows: [{ unpromoted_pos_tickets: this.validation.unpromotedPosTickets } as T],
        rowCount: 1,
      };
    }
    if (compact.includes('WITH ticket_sales AS')) {
      return {
        rows: [{
          mismatch_count: this.validation.weekSalesMismatchCount,
          mismatch_qty_abs: this.validation.weekSalesMismatchQtyAbs,
        } as T],
        rowCount: 1,
      };
    }
    if (compact.includes('total_week_qty_sales') && compact.includes('FROM app.inventory_history_snapshot')) {
      return {
        rows: [{
          snapshots_scanned: this.summary.snapshotsScanned,
          total_week_qty_sales: this.summary.totalWeekQtySales,
          total_week_net_sales: this.summary.totalWeekNetSales,
          total_week_profit: this.summary.totalWeekProfit,
        } as T],
        rowCount: 1,
      };
    }
    if (compact.includes('predicted_trend_rows')) {
      return { rows: [{ predicted_trend_rows: this.predictedTrendRows } as T], rowCount: 1 };
    }
    if (compact.includes('CREATE TEMP TABLE tmp_inventory_week_close_state')) {
      return { rows: [], rowCount: null };
    }
    if (compact.includes('CREATE TEMP TABLE tmp_inventory_week_close_trend_rows')) {
      return { rows: [], rowCount: null };
    }
    if (compact.includes('DELETE FROM app.inventory_history_trend_week')) {
      return { rows: [], rowCount: 14 };
    }
    if (compact.includes('INSERT INTO app.inventory_history_trend_week')) {
      return { rows: [], rowCount: this.trendRowsWritten };
    }
    if (compact.includes('UPDATE app.inventory_history_snapshot s')) {
      return { rows: [], rowCount: this.snapshotsUpdated };
    }
    if (compact.includes('INSERT INTO app.inventory_closed_week')) {
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL in fake client: ${compact}`);
  }

  statementsContaining(fragment: string): QueryCall[] {
    return this.calls.filter((call) => call.text.includes(fragment));
  }

  commands(): string[] {
    return this.calls
      .map((call) => call.text.replace(/\s+/g, ' ').trim())
      .filter((text) => text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK');
  }
}

const RUN_ID = '00000000-0000-0000-0000-000000000002';

describe('inventoryWeekCloseService', () => {
  it('maps a week-ending date to a seven-day Guatemala close window', () => {
    const parsed = parseInventoryWeekEndingDate('2026-05-03');

    expect(parsed.weekEndingDate).toBe('2026-05-03');
    expect(parsed.weekStartDate).toBe('2026-04-27');
    expect(parsed.windowStart.toISOString()).toBe('2026-04-27T06:00:00.000Z');
    expect(parsed.snapshotAsOf.toISOString()).toBe('2026-05-04T06:00:00.000Z');
  });

  it('dry-runs validation and predicted trend counts without rotating trend rows', async () => {
    const pgClient = new FakePgClient();

    const result = await closeInventoryWeek({
      pgClient,
      weekEndingDate: '2026-05-03',
      closedBy: 'zbendeck',
      dryRun: true,
      runId: RUN_ID,
    });

    expect(result.status).toBe('DRY_RUN');
    expect(result.weekStartDate).toBe('2026-04-27');
    expect(result.trendRowsWritten).toBe(14);
    expect(result.snapshotsUpdated).toBe(2);
    expect(result.validation).toEqual({
      unpromotedPosTickets: 0,
      weekSalesMismatchCount: 0,
      weekSalesMismatchQtyAbs: 0,
    });
    expect(pgClient.commands()).toEqual(['BEGIN', 'ROLLBACK']);
    expect(pgClient.statementsContaining('CREATE TEMP TABLE tmp_inventory_week_close_state')).toHaveLength(0);
    expect(pgClient.statementsContaining('INSERT INTO app.inventory_history_trend_week')).toHaveLength(0);
    expect(pgClient.statementsContaining('UPDATE app.inventory_history_snapshot s')).toHaveLength(0);
    expect(pgClient.statementsContaining('INSERT INTO app.inventory_closed_week')).toHaveLength(0);
    expect(pgClient.statementsContaining('UPDATE app.inventory_week_close_run').at(-1)?.values[1]).toBe('DRY_RUN');
  });

  it('rotates stored weeks, writes current week into slot 7, and resets only weekly counters', async () => {
    const pgClient = new FakePgClient();

    const result = await closeInventoryWeek({
      pgClient,
      weekEndingDate: '2026-05-03',
      closedBy: 'zbendeck',
      runId: RUN_ID,
    });

    expect(result.status).toBe('SUCCEEDED');
    expect(result.snapshotAsOf.toISOString()).toBe('2026-05-04T06:00:00.000Z');
    expect(pgClient.commands()).toEqual(['BEGIN', 'COMMIT']);

    const trendRows = pgClient.statementsContaining('CREATE TEMP TABLE tmp_inventory_week_close_trend_rows')[0];
    expect(trendRows.text).toContain('(w.slot_number - 1)::smallint');
    expect(trendRows.text).toContain('7::smallint AS slot_number');
    expect(trendRows.text).toContain('state.current_begin_on_hand AS begin_on_hand');
    expect(trendRows.text).toContain('state.current_avail_week');
    expect(trendRows.text).toContain('state.week_qty_sales AS sales');

    const snapshotUpdate = pgClient.statementsContaining('UPDATE app.inventory_history_snapshot s')[0];
    expect(snapshotUpdate.text).toContain('trend_week_8_beg_on_hand');
    expect(snapshotUpdate.text).toContain('week_qty_sales = 0');
    expect(snapshotUpdate.text).toContain('week_dol_sales = 0');
    expect(snapshotUpdate.text).toContain('week_profit = 0');
    expect(snapshotUpdate.text).toContain('week_markdown = 0');
    expect(snapshotUpdate.text).not.toContain('month_qty_sales = 0');
    expect(snapshotUpdate.text).not.toContain('season_qty_sales = 0');
    expect(snapshotUpdate.text).not.toContain('year_qty_sales = 0');

    expect(pgClient.statementsContaining('DELETE FROM app.inventory_history_trend_week')).toHaveLength(1);
    expect(pgClient.statementsContaining('INSERT INTO app.inventory_history_trend_week')).toHaveLength(1);
    expect(pgClient.statementsContaining('INSERT INTO app.inventory_closed_week')).toHaveLength(1);
    expect(pgClient.statementsContaining('UPDATE app.inventory_week_close_run').at(-1)?.values[1]).toBe('SUCCEEDED');
  });

  it('rejects duplicate weekly closes before validation or trend mutations', async () => {
    const pgClient = new FakePgClient();
    pgClient.weekAlreadyClosed = true;

    await expect(closeInventoryWeek({
      pgClient,
      weekEndingDate: '2026-05-03',
      closedBy: 'zbendeck',
      runId: RUN_ID,
    })).rejects.toMatchObject({
      code: 'WEEK_ALREADY_CLOSED',
    } satisfies Partial<InventoryWeekCloseError>);

    expect(pgClient.commands()).toEqual(['BEGIN', 'ROLLBACK']);
    expect(pgClient.statementsContaining('FROM app.pos_ticket pt')).toHaveLength(0);
    expect(pgClient.statementsContaining('CREATE TEMP TABLE tmp_inventory_week_close_state')).toHaveLength(0);
    expect(pgClient.statementsContaining('UPDATE app.inventory_week_close_run').at(-1)?.values[1]).toBe('FAILED');
  });

  it('fails validation and rolls back before rotating trends when week counters disagree with sales history', async () => {
    const pgClient = new FakePgClient();
    pgClient.validation.weekSalesMismatchCount = 4;
    pgClient.validation.weekSalesMismatchQtyAbs = 12;

    await expect(closeInventoryWeek({
      pgClient,
      weekEndingDate: '2026-05-03',
      closedBy: 'zbendeck',
      runId: RUN_ID,
    })).rejects.toMatchObject({
      code: 'PRE_CLOSE_VALIDATION_FAILED',
    } satisfies Partial<InventoryWeekCloseError>);

    expect(pgClient.commands()).toEqual(['BEGIN', 'ROLLBACK']);
    expect(pgClient.statementsContaining('CREATE TEMP TABLE tmp_inventory_week_close_state')).toHaveLength(0);
    expect(pgClient.statementsContaining('INSERT INTO app.inventory_history_trend_week')).toHaveLength(0);
    const failedRunUpdate = pgClient.statementsContaining('UPDATE app.inventory_week_close_run').at(-1);
    expect(failedRunUpdate?.values[1]).toBe('FAILED');
    expect(failedRunUpdate?.values[2]).toBe('FAILED');
    expect(failedRunUpdate?.values[8]).toBe(12);
  });
});
