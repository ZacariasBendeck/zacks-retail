import { setupTestMdbs } from './testMdbSetup';

const ctx = setupTestMdbs();
const d = ctx.available ? describe : describe.skip;

import { SeasonRepository } from '../../../src/repositories/rics/SeasonRepository';

d('SeasonRepository (derived read-only, Phase 1)', () => {
  it('lists distinct season codes from InventoryMaster', async () => {
    const list = await SeasonRepository.list();
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.length).toBeGreaterThan(0);
    // Season codes are single characters.
    for (const s of list.value) {
      expect(s.code.length).toBe(1);
      expect(typeof s.skuCount).toBe('number');
    }
  });

  it('returns AccessConnectionError on write attempts in Phase 1', async () => {
    const create = await SeasonRepository.create({ code: 'Z', description: 'x' });
    expect(create.ok).toBe(false);
    if (create.ok) return;
    expect(create.error.kind).toBe('AccessConnectionError');
  });
});
