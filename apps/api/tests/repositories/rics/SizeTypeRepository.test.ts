import { setupTestMdbs } from './testMdbSetup';

const ctx = setupTestMdbs();
const d = ctx.available ? describe : describe.skip;

import { SizeTypeRepository } from '../../../src/repositories/rics/SizeTypeRepository';

// Live SizeTypes go up to ~309; we use 9000 so we're clear of real data.
const TEST_CODE = 9000;

d('SizeTypeRepository (integration, wide-column segment codec)', () => {
  beforeEach(async () => {
    await SizeTypeRepository.delete(TEST_CODE);
  });
  afterAll(async () => {
    await SizeTypeRepository.delete(TEST_CODE);
  });

  it('lists size types and unwinds columns/rows', async () => {
    const list = await SizeTypeRepository.list();
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.length).toBeGreaterThan(0);
    const withCols = list.value.find((s) => s.columns.length > 0);
    expect(withCols).toBeDefined();
    // Live data sanity: labels should be short (≤ 3 chars per manual).
    for (const c of withCols?.columns ?? []) {
      expect(c.length).toBeLessThanOrEqual(3);
    }
  });

  it('creates a size type with an explicit column/row grid and round-trips through getByCode', async () => {
    const create = await SizeTypeRepository.create({
      code: TEST_CODE,
      description: 'ZTEST ST',
      columnDescription: 'SIZE',
      rowDescription: 'WDT',
      tableType: '',
      columns: ['060', '065', '070'],
      rows: ['M', 'W'],
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;
    expect(create.value.columns).toEqual(['060', '065', '070']);
    expect(create.value.rows).toEqual(['M', 'W']);
    expect(create.value.maxColumns).toBe(3);
    expect(create.value.maxRows).toBe(2);

    const get = await SizeTypeRepository.getByCode(TEST_CODE);
    expect(get.ok).toBe(true);
    if (!get.ok) return;
    expect(get.value.columnDescription).toBe('SIZE');
    expect(get.value.rowDescription).toBe('WDT');

    const upd = await SizeTypeRepository.update(TEST_CODE, {
      columns: ['060', '065', '070', '075'],
    });
    expect(upd.ok).toBe(true);
    if (!upd.ok) return;
    expect(upd.value.columns).toEqual(['060', '065', '070', '075']);
    expect(upd.value.maxColumns).toBe(4);

    const del = await SizeTypeRepository.delete(TEST_CODE);
    expect(del.ok).toBe(true);
  });

  it('rejects column label longer than 3 chars', async () => {
    const result = await SizeTypeRepository.create({
      code: TEST_CODE,
      description: 'x',
      columnDescription: 'SIZE',
      rowDescription: '',
      columns: ['TOOLONG'],
      rows: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('ConstraintViolation');
  });
});
