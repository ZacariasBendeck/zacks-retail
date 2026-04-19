import { setupTestMdbs } from './testMdbSetup';

const ctx = setupTestMdbs();
const d = ctx.available ? describe : describe.skip;

import { SectorRepository } from '../../../src/repositories/rics/SectorRepository';

// Live Sectors.Number uses 1..9 for real sectors; we use 98.
const TEST_NUMBER = 98;

d('SectorRepository (integration)', () => {
  beforeEach(async () => {
    await SectorRepository.delete(TEST_NUMBER);
  });
  afterAll(async () => {
    await SectorRepository.delete(TEST_NUMBER);
  });

  it('creates, lists, updates, deletes', async () => {
    const create = await SectorRepository.create({
      number: TEST_NUMBER,
      description: 'ZTEST SEC',
      begDept: 90,
      endDept: 95,
    });
    expect(create.ok).toBe(true);

    const list = await SectorRepository.list();
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.some((s) => s.number === TEST_NUMBER)).toBe(true);

    const upd = await SectorRepository.update(TEST_NUMBER, { description: 'ZTEST SEC 2' });
    expect(upd.ok).toBe(true);

    const del = await SectorRepository.delete(TEST_NUMBER);
    expect(del.ok).toBe(true);
  });
});
