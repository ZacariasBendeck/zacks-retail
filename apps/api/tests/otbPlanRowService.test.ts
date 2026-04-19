import { resetDb } from '../src/db/database';
import * as svc from '../src/services/otbPlanRowService';

const baseInput = {
  storeId: 'store-1',
  categoryId: 'cat-556',
  fiscalYear: 2026,
  pctChangeLyToCy: 7.5,
  pctChangeCyToNy: null,
  plannedTurnover1h: 2.5,
  plannedTurnover2h: 2.2,
  plannedGpPct: 48.0,
  lySales: Array(12).fill(10000) as (number | null)[],
  plannedSales: Array(12).fill(null) as (number | null)[],
  markdownPct: Array(12).fill(null) as (number | null)[],
  createdBy: 'buyer1',
};

beforeEach(() => {
  resetDb();
});

describe('createOtbPlanRow', () => {
  it('creates a plan row and returns it', () => {
    const r = svc.createOtbPlanRow(baseInput);
    if ('code' in r) throw new Error(`unexpected error ${r.code}`);
    expect(r.storeId).toBe('store-1');
    expect(r.categoryId).toBe('cat-556');
    expect(r.fiscalYear).toBe(2026);
    expect(r.pctChangeLyToCy).toBe(7.5);
    expect(r.lySales).toEqual(Array(12).fill(10000));
    expect(r.plannedSales).toEqual(Array(12).fill(null));
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects duplicate (storeId, categoryId, fiscalYear)', () => {
    svc.createOtbPlanRow(baseInput);
    const r = svc.createOtbPlanRow(baseInput);
    expect(r).toEqual({ code: 'DUPLICATE_KEY', storeId: 'store-1', categoryId: 'cat-556', fiscalYear: 2026 });
  });

  it('rejects monthly array with wrong length', () => {
    const r = svc.createOtbPlanRow({ ...baseInput, lySales: [1, 2, 3] });
    expect(r).toEqual({ code: 'INVALID_MONTHLY_ARRAY_LENGTH', field: 'lySales', expected: 12, actual: 3 });
  });

  it('rejects planned_gp_pct out of [-100, 100]', () => {
    const r = svc.createOtbPlanRow({ ...baseInput, plannedGpPct: 150 });
    expect(r).toEqual({ code: 'INVALID_GP_PCT', value: 150 });
  });
});

describe('getOtbPlanRow', () => {
  it('returns the row by id', () => {
    const created = svc.createOtbPlanRow(baseInput);
    if ('code' in created) throw new Error('unexpected');
    const got = svc.getOtbPlanRow(created.id);
    if ('code' in got) throw new Error('unexpected');
    expect(got.id).toBe(created.id);
  });

  it('returns NOT_FOUND for a missing id', () => {
    const got = svc.getOtbPlanRow('nope');
    expect(got).toEqual({ code: 'NOT_FOUND' });
  });
});

describe('listOtbPlanRows', () => {
  it('filters by storeId and fiscalYear', () => {
    svc.createOtbPlanRow(baseInput);
    svc.createOtbPlanRow({ ...baseInput, categoryId: 'cat-557' });
    svc.createOtbPlanRow({ ...baseInput, storeId: 'store-2' });

    const res = svc.listOtbPlanRows({ storeId: 'store-1', fiscalYear: 2026, page: 1, pageSize: 10 });
    expect(res.total).toBe(2);
    expect(res.items).toHaveLength(2);
    expect(res.items.every((r) => r.storeId === 'store-1')).toBe(true);
  });

  it('paginates', () => {
    for (let i = 0; i < 5; i++) svc.createOtbPlanRow({ ...baseInput, categoryId: `cat-55${i}` });
    const res = svc.listOtbPlanRows({ page: 1, pageSize: 2 });
    expect(res.items).toHaveLength(2);
    expect(res.total).toBe(5);
  });
});

describe('updateOtbPlanRow', () => {
  it('writes one audit row per changed scalar field', () => {
    const created = svc.createOtbPlanRow(baseInput);
    if ('code' in created) throw new Error('unexpected');

    const upd = svc.updateOtbPlanRow(created.id, {
      pctChangeLyToCy: 10.0,
      plannedGpPct: 50.0,
      changedBy: 'buyer2',
    });
    if ('code' in upd) throw new Error(`unexpected error ${upd.code}`);
    expect(upd.pctChangeLyToCy).toBe(10.0);
    expect(upd.plannedGpPct).toBe(50.0);

    const audit = svc.getOtbPlanRowAudit(created.id);
    const changed = audit.map((a) => a.fieldChanged).sort();
    expect(changed).toEqual(['pct_change_ly_to_cy', 'planned_gp_pct']);
    expect(audit.find((a) => a.fieldChanged === 'pct_change_ly_to_cy')?.oldValue).toBe('7.5');
    expect(audit.find((a) => a.fieldChanged === 'pct_change_ly_to_cy')?.newValue).toBe('10');
    expect(audit.find((a) => a.fieldChanged === 'pct_change_ly_to_cy')?.changedBy).toBe('buyer2');
  });

  it('writes one audit row per changed monthly cell', () => {
    const created = svc.createOtbPlanRow(baseInput);
    if ('code' in created) throw new Error('unexpected');
    const newLy = [...baseInput.lySales] as (number | null)[];
    newLy[0] = 11000;
    newLy[2] = 12500;

    svc.updateOtbPlanRow(created.id, { lySales: newLy, changedBy: 'buyer2' });

    const audit = svc.getOtbPlanRowAudit(created.id);
    const changed = audit.map((a) => a.fieldChanged).sort();
    expect(changed).toEqual(['ly_sales_m01', 'ly_sales_m03']);
  });

  it('writes zero audit rows when nothing changed', () => {
    const created = svc.createOtbPlanRow(baseInput);
    if ('code' in created) throw new Error('unexpected');
    svc.updateOtbPlanRow(created.id, { pctChangeLyToCy: 7.5, changedBy: 'buyer2' });
    const audit = svc.getOtbPlanRowAudit(created.id);
    expect(audit).toHaveLength(0);
  });

  it('returns NOT_FOUND for missing id', () => {
    expect(svc.updateOtbPlanRow('nope', { pctChangeLyToCy: 1 })).toEqual({ code: 'NOT_FOUND' });
  });

  it('validates monthly array length on update', () => {
    const created = svc.createOtbPlanRow(baseInput);
    if ('code' in created) throw new Error('unexpected');
    const r = svc.updateOtbPlanRow(created.id, { lySales: [1, 2] as unknown as (number | null)[] });
    expect(r).toEqual({ code: 'INVALID_MONTHLY_ARRAY_LENGTH', field: 'lySales', expected: 12, actual: 2 });
  });
});

describe('recalculatePlannedSales', () => {
  it('fills plannedSales[m] = lySales[m] * (1 + pct/100) for each non-null cell', () => {
    const created = svc.createOtbPlanRow({
      ...baseInput,
      lySales: [10000, 12000, 8000, null, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000],
      pctChangeLyToCy: 10,
    });
    if ('code' in created) throw new Error('unexpected');

    const r = svc.recalculatePlannedSales(created.id);
    if ('code' in r) throw new Error(`unexpected error ${r.code}`);
    expect(r.plannedSales[0]).toBe(11000);
    expect(r.plannedSales[1]).toBe(13200);
    expect(r.plannedSales[2]).toBe(8800);
    expect(r.plannedSales[3]).toBeNull();
  });

  it('handles negative percent (decrease)', () => {
    const created = svc.createOtbPlanRow({
      ...baseInput,
      lySales: Array(12).fill(10000) as (number | null)[],
      pctChangeLyToCy: -15,
    });
    if ('code' in created) throw new Error('unexpected');
    const r = svc.recalculatePlannedSales(created.id);
    if ('code' in r) throw new Error('unexpected');
    expect(r.plannedSales[0]).toBe(8500);
  });

  it('leaves plannedSales unchanged when pctChangeLyToCy is null', () => {
    const created = svc.createOtbPlanRow({
      ...baseInput,
      pctChangeLyToCy: null,
      plannedSales: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as (number | null)[],
    });
    if ('code' in created) throw new Error('unexpected');
    const r = svc.recalculatePlannedSales(created.id);
    if ('code' in r) throw new Error('unexpected');
    expect(r.plannedSales).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('writes one audit row per changed monthly cell', () => {
    const created = svc.createOtbPlanRow({
      ...baseInput,
      lySales: Array(12).fill(10000) as (number | null)[],
      pctChangeLyToCy: 10,
    });
    if ('code' in created) throw new Error('unexpected');
    svc.recalculatePlannedSales(created.id, 'buyer3');
    const audit = svc.getOtbPlanRowAudit(created.id);
    const planned = audit.filter((a) => a.fieldChanged.startsWith('planned_sales_m'));
    expect(planned).toHaveLength(12);
    expect(planned.every((a) => a.changedBy === 'buyer3')).toBe(true);
  });

  it('returns NOT_FOUND', () => {
    expect(svc.recalculatePlannedSales('nope')).toEqual({ code: 'NOT_FOUND' });
  });
});

describe('copyOtbPlanRow', () => {
  it('copies scalar + monthly fields to a new (store, category) row', () => {
    const created = svc.createOtbPlanRow(baseInput);
    if ('code' in created) throw new Error('unexpected');
    const copied = svc.copyOtbPlanRow(created.id, 'store-2', 'cat-557', 'buyer4');
    if ('code' in copied) throw new Error(`unexpected error ${copied.code}`);
    expect(copied.id).not.toBe(created.id);
    expect(copied.storeId).toBe('store-2');
    expect(copied.categoryId).toBe('cat-557');
    expect(copied.fiscalYear).toBe(2026);
    expect(copied.pctChangeLyToCy).toBe(7.5);
    expect(copied.lySales).toEqual(Array(12).fill(10000));
    expect(copied.createdBy).toBe('buyer4');
  });

  it('returns DUPLICATE_KEY when target (store, category, year) already exists', () => {
    const created = svc.createOtbPlanRow(baseInput);
    if ('code' in created) throw new Error('unexpected');
    svc.createOtbPlanRow({ ...baseInput, storeId: 'store-2', categoryId: 'cat-557' });
    const r = svc.copyOtbPlanRow(created.id, 'store-2', 'cat-557');
    expect(r).toEqual({ code: 'DUPLICATE_KEY', storeId: 'store-2', categoryId: 'cat-557', fiscalYear: 2026 });
  });

  it('returns NOT_FOUND for missing source id', () => {
    expect(svc.copyOtbPlanRow('nope', 'store-2', 'cat-557')).toEqual({ code: 'NOT_FOUND' });
  });
});

describe('deleteOtbPlanRow', () => {
  it('deletes an existing row', () => {
    const created = svc.createOtbPlanRow(baseInput);
    if ('code' in created) throw new Error('unexpected');
    const r = svc.deleteOtbPlanRow(created.id);
    expect(r).toEqual({ ok: true });
    expect(svc.getOtbPlanRow(created.id)).toEqual({ code: 'NOT_FOUND' });
  });

  it('returns NOT_FOUND for missing row', () => {
    expect(svc.deleteOtbPlanRow('nope')).toEqual({ code: 'NOT_FOUND' });
  });
});
