import { getDb, resetDb } from '../src/db/database';

beforeEach(() => {
  resetDb();
});

describe('migration 0021 — otb_plan_rows', () => {
  it('creates otb_plan_rows with the expected columns', () => {
    const db = getDb();
    const cols = db.prepare(`PRAGMA table_info(otb_plan_rows)`).all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    for (const expected of [
      'id', 'store_id', 'category_id', 'fiscal_year',
      'pct_change_ly_to_cy', 'pct_change_cy_to_ny',
      'planned_turnover_1h', 'planned_turnover_2h', 'planned_gp_pct',
      'ly_sales_m01', 'ly_sales_m12',
      'planned_sales_m01', 'planned_sales_m12',
      'markdown_pct_m01', 'markdown_pct_m12',
      'created_by', 'created_at', 'updated_at',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('enforces UNIQUE(store_id, category_id, fiscal_year)', () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO otb_plan_rows (id, store_id, category_id, fiscal_year, created_by) VALUES ('a', 's1', 'c1', 2026, 'sys')`
    ).run();
    expect(() =>
      db.prepare(
        `INSERT INTO otb_plan_rows (id, store_id, category_id, fiscal_year, created_by) VALUES ('b', 's1', 'c1', 2026, 'sys')`
      ).run()
    ).toThrow(/UNIQUE/);
  });

  it('rejects fiscal_year out of range', () => {
    const db = getDb();
    expect(() =>
      db.prepare(
        `INSERT INTO otb_plan_rows (id, store_id, category_id, fiscal_year, created_by) VALUES ('a', 's1', 'c1', 1999, 'sys')`
      ).run()
    ).toThrow(/CHECK/);
  });

  it('creates otb_plan_row_audit with expected columns', () => {
    const db = getDb();
    const cols = db.prepare(`PRAGMA table_info(otb_plan_row_audit)`).all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    for (const expected of ['id', 'otb_plan_row_id', 'field_changed', 'old_value', 'new_value', 'changed_by', 'created_at']) {
      expect(names).toContain(expected);
    }
  });

  it('creates company_settings with a seeded otb.entry_method row', () => {
    const db = getDb();
    const cols = db.prepare(`PRAGMA table_info(company_settings)`).all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toEqual(expect.arrayContaining(['key', 'value', 'updated_by', 'updated_at']));

    const seed = db.prepare(`SELECT value FROM company_settings WHERE key = 'otb.entry_method'`).get() as { value: string } | undefined;
    expect(seed?.value).toBe('"CHANGE_OVER_LAST_YEAR"');
  });
});
