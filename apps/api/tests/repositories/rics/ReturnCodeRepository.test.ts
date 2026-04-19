import { setupTestMdbs } from './testMdbSetup';

const ctx = setupTestMdbs();
const d = ctx.available ? describe : describe.skip;

import { ReturnCodeRepository } from '../../../src/repositories/rics/ReturnCodeRepository';

const TEST_CODE = 95;

d('ReturnCodeRepository (integration)', () => {
  beforeEach(async () => {
    await ReturnCodeRepository.delete(TEST_CODE);
  });
  afterAll(async () => {
    await ReturnCodeRepository.delete(TEST_CODE);
  });

  it('creates, lists, updates, deletes', async () => {
    const create = await ReturnCodeRepository.create({
      code: TEST_CODE,
      description: 'ZTEST RET',
      trackable: true,
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;
    expect(create.value.trackable).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 400));

    const list = await ReturnCodeRepository.list();
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.some((r) => r.code === TEST_CODE)).toBe(true);

    const upd = await ReturnCodeRepository.update(TEST_CODE, { trackable: false });
    if (!upd.ok) throw new Error('Update failed: ' + JSON.stringify(upd.error));
    expect(upd.value.trackable).toBe(false);

    const del = await ReturnCodeRepository.delete(TEST_CODE);
    expect(del.ok).toBe(true);
  });
});
