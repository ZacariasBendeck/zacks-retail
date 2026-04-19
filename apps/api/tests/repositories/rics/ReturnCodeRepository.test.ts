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

    const list = await ReturnCodeRepository.list();
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.some((r) => r.code === TEST_CODE)).toBe(true);

    const upd = await ReturnCodeRepository.update(TEST_CODE, { trackable: false });
    expect(upd.ok).toBe(true);
    if (!upd.ok) return;
    expect(upd.value.trackable).toBe(false);

    const del = await ReturnCodeRepository.delete(TEST_CODE);
    expect(del.ok).toBe(true);
  });
});
