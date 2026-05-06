import {
  closeInventoryMonth,
  InventoryMonthCloseError,
  parseInventoryCloseMonth,
  type PgClientLike,
} from '../src/services/inventoryMonthCloseService';

type QueryCall = {
  text: string;
  values: unknown[];
};

class FakePgClient implements PgClientLike {
  calls: QueryCall[] = [];
  monthAlreadyClosed = false;
  validation = {
    unpromotedPosTickets: 0,
    salesCellMismatchCount: 0,
    salesCellMismatchQtyAbs: 0,
  };
  summary = {
    snapshotsScanned: 2,
    totalQtySales: 22,
    totalNetSales: 49643.44,
    totalProfit: 36024.78,
    inventoryValueTotal: 4952.24,
  };
  nonzeroMtdCellsBefore = 3;
  monthRowsRowCount = 2;
  snapshotUpdateRowCount = 2;
  salesCellUpdateRowCount = 3;

  async query<T = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<{ rows: T[]; rowCount: number | null }> {
    this.calls.push({ text, values });
    const compact = text.replace(/\s+/g, ' ').trim();

    if (compact === 'BEGIN' || compact === 'COMMIT' || compact === 'ROLLBACK') {
      return { rows: [], rowCount: null };
    }
    if (compact.includes('INSERT INTO app.inventory_month_close_run')) {
      return { rows: [], rowCount: 1 };
    }
    if (compact.includes('UPDATE app.inventory_month_close_run')) {
      return { rows: [], rowCount: 1 };
    }
    if (compact.includes('pg_advisory_xact_lock')) {
      return { rows: [], rowCount: 1 };
    }
    if (compact.includes('FROM app.inventory_closed_month')) {
      return { rows: [{ already_closed: this.monthAlreadyClosed } as T], rowCount: 1 };
    }
    if (compact.includes('FROM app.pos_ticket pt')) {
      return {
        rows: [{ unpromoted_pos_tickets: this.validation.unpromotedPosTickets } as T],
        rowCount: 1,
      };
    }
    if (compact.includes('WITH ticket_cells AS')) {
      return {
        rows: [{
          mismatch_count: this.validation.salesCellMismatchCount,
          mismatch_qty_abs: this.validation.salesCellMismatchQtyAbs,
        } as T],
        rowCount: 1,
      };
    }
    if (compact.includes('snapshots_scanned') && compact.includes('FROM app.inventory_history_snapshot')) {
      return {
        rows: [{
          snapshots_scanned: this.summary.snapshotsScanned,
          total_qty_sales: this.summary.totalQtySales,
          total_net_sales: this.summary.totalNetSales,
          total_profit: this.summary.totalProfit,
          inventory_value_total: this.summary.inventoryValueTotal,
        } as T],
        rowCount: 1,
      };
    }
    if (compact.includes('nonzero_mtd_cells_before')) {
      return {
        rows: [{ nonzero_mtd_cells_before: this.nonzeroMtdCellsBefore } as T],
        rowCount: 1,
      };
    }
    if (compact.includes('INSERT INTO app.inventory_history_month')) {
      return { rows: [], rowCount: this.monthRowsRowCount };
    }
    if (compact.includes('UPDATE app.inventory_history_snapshot')) {
      return { rows: [], rowCount: this.snapshotUpdateRowCount };
    }
    if (compact.includes('UPDATE app.inventory_sales_cell')) {
      return { rows: [], rowCount: this.salesCellUpdateRowCount };
    }
    if (compact.includes('INSERT INTO app.inventory_closed_month')) {
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

const RUN_ID = '00000000-0000-0000-0000-000000000001';

describe('inventoryMonthCloseService', () => {
  it('maps the close month to the RICS calendar slot and Guatemala close boundary', () => {
    const parsed = parseInventoryCloseMonth('2026-04');

    expect(parsed.yearMonth).toBe('2026-04');
    expect(parsed.targetSlot).toBe(4);
    expect(parsed.windowStart.toISOString()).toBe('2026-04-01T06:00:00.000Z');
    expect(parsed.snapshotAsOf.toISOString()).toBe('2026-05-01T06:00:00.000Z');
  });

  it('dry-runs validation and predicted counts without mutating close projection tables', async () => {
    const pgClient = new FakePgClient();

    const result = await closeInventoryMonth({
      pgClient,
      closeMonth: '2026-04',
      closedBy: 'zbendeck',
      dryRun: true,
      runId: RUN_ID,
    });

    expect(result.status).toBe('DRY_RUN');
    expect(result.monthsUpserted).toBe(2);
    expect(result.snapshotsUpdated).toBe(2);
    expect(result.salesCellsReset).toBe(3);
    expect(result.validation).toEqual({
      unpromotedPosTickets: 0,
      salesCellMismatchCount: 0,
      salesCellMismatchQtyAbs: 0,
    });
    expect(pgClient.commands()).toEqual(['BEGIN', 'ROLLBACK']);
    expect(pgClient.statementsContaining('INSERT INTO app.inventory_history_month')).toHaveLength(0);
    expect(pgClient.statementsContaining('UPDATE app.inventory_history_snapshot')).toHaveLength(0);
    expect(pgClient.statementsContaining('UPDATE app.inventory_sales_cell')).toHaveLength(0);
    expect(pgClient.statementsContaining('INSERT INTO app.inventory_closed_month')).toHaveLength(0);
    expect(pgClient.statementsContaining('UPDATE app.inventory_month_close_run').at(-1)?.values[1]).toBe('DRY_RUN');
  });

  it('rolls current RIINVHIS month counters into the calendar slot and resets only MTD surfaces', async () => {
    const pgClient = new FakePgClient();

    const result = await closeInventoryMonth({
      pgClient,
      closeMonth: '2026-04',
      closedBy: 'zbendeck',
      runId: RUN_ID,
    });

    expect(result.status).toBe('SUCCEEDED');
    expect(result.targetSlot).toBe(4);
    expect(result.snapshotAsOf.toISOString()).toBe('2026-05-01T06:00:00.000Z');
    expect(pgClient.commands()).toEqual(['BEGIN', 'COMMIT']);

    const monthInsert = pgClient.statementsContaining('INSERT INTO app.inventory_history_month')[0];
    expect(monthInsert.values).toEqual([4, 2026, '2026-04']);
    expect(monthInsert.text).toContain('s.month_qty_sales');
    expect(monthInsert.text).toContain('s.month_dol_sales');
    expect(monthInsert.text).toContain('s.month_profit');
    expect(monthInsert.text).toContain('s.last_month_on_hand');
    expect(monthInsert.text).toContain('ROUND(s.on_hand::numeric * s.average_cost, 2)');

    const snapshotUpdate = pgClient.statementsContaining('UPDATE app.inventory_history_snapshot')[0];
    expect(snapshotUpdate.text).toContain('last_month_on_hand = on_hand');
    expect(snapshotUpdate.text).toContain('month_qty_sales = 0');
    expect(snapshotUpdate.text).toContain('month_dol_sales = 0');
    expect(snapshotUpdate.text).toContain('month_profit = 0');
    expect(snapshotUpdate.text).toContain('month_markdown = 0');
    expect(snapshotUpdate.text).not.toContain('season_qty_sales = 0');
    expect(snapshotUpdate.text).not.toContain('year_qty_sales = 0');

    const salesCellUpdate = pgClient.statementsContaining('UPDATE app.inventory_sales_cell')[0];
    expect(salesCellUpdate.text).toContain('mtd_sales = 0');
    expect(salesCellUpdate.text).not.toContain('std_sales');
    expect(salesCellUpdate.text).not.toContain('ytd_sales');
    expect(salesCellUpdate.text).not.toContain('ly_sales');
    expect(pgClient.statementsContaining('INSERT INTO app.inventory_closed_month')).toHaveLength(1);
    expect(pgClient.statementsContaining('UPDATE app.inventory_month_close_run').at(-1)?.values[1]).toBe('SUCCEEDED');
  });

  it('rejects duplicate closes before validation or projection mutations', async () => {
    const pgClient = new FakePgClient();
    pgClient.monthAlreadyClosed = true;

    await expect(closeInventoryMonth({
      pgClient,
      closeMonth: '2026-04',
      closedBy: 'zbendeck',
      runId: RUN_ID,
    })).rejects.toMatchObject({
      code: 'MONTH_ALREADY_CLOSED',
    } satisfies Partial<InventoryMonthCloseError>);

    expect(pgClient.commands()).toEqual(['BEGIN', 'ROLLBACK']);
    expect(pgClient.statementsContaining('FROM app.pos_ticket pt')).toHaveLength(0);
    expect(pgClient.statementsContaining('INSERT INTO app.inventory_history_month')).toHaveLength(0);
    expect(pgClient.statementsContaining('UPDATE app.inventory_month_close_run').at(-1)?.values[1]).toBe('FAILED');
  });

  it('fails validation and rolls back before changing history when ticket-derived MTD cells disagree', async () => {
    const pgClient = new FakePgClient();
    pgClient.validation.salesCellMismatchCount = 2;
    pgClient.validation.salesCellMismatchQtyAbs = 14;

    await expect(closeInventoryMonth({
      pgClient,
      closeMonth: '2026-04',
      closedBy: 'zbendeck',
      runId: RUN_ID,
    })).rejects.toMatchObject({
      code: 'PRE_CLOSE_VALIDATION_FAILED',
    } satisfies Partial<InventoryMonthCloseError>);

    expect(pgClient.commands()).toEqual(['BEGIN', 'ROLLBACK']);
    expect(pgClient.statementsContaining('INSERT INTO app.inventory_history_month')).toHaveLength(0);
    expect(pgClient.statementsContaining('UPDATE app.inventory_history_snapshot')).toHaveLength(0);
    expect(pgClient.statementsContaining('UPDATE app.inventory_sales_cell')).toHaveLength(0);
    const failedRunUpdate = pgClient.statementsContaining('UPDATE app.inventory_month_close_run').at(-1);
    expect(failedRunUpdate?.values[1]).toBe('FAILED');
    expect(failedRunUpdate?.values[2]).toBe('FAILED');
    expect(failedRunUpdate?.values[10]).toBe(14);
  });
});
