import { setupTestMdbs } from './testMdbSetup';

const ctx = setupTestMdbs();
const d = ctx.available ? describe : describe.skip;

import { PromotionCodeRepository } from '../../../src/repositories/rics/PromotionCodeRepository';

const TEST_CODE = 'ZTEST1';

d('PromotionCodeRepository (integration)', () => {
  beforeEach(async () => {
    await PromotionCodeRepository.delete(TEST_CODE);
  });
  afterAll(async () => {
    await PromotionCodeRepository.delete(TEST_CODE);
  });

  it('creates, lists, updates, deletes', async () => {
    const create = await PromotionCodeRepository.create({
      code: TEST_CODE,
      description: 'ZTEST Promotion',
      pieces: 100,
      cost: 25.5,
    });
    expect(create.ok).toBe(true);

    const list = await PromotionCodeRepository.list();
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.some((p) => p.code === TEST_CODE)).toBe(true);

    const upd = await PromotionCodeRepository.update(TEST_CODE, { pieces: 200 });
    expect(upd.ok).toBe(true);
    if (!upd.ok) return;
    expect(upd.value.pieces).toBe(200);

    const del = await PromotionCodeRepository.delete(TEST_CODE);
    expect(del.ok).toBe(true);
  });

  it('rejects code longer than 6 chars', async () => {
    const result = await PromotionCodeRepository.create({ code: '1234567', description: 'x' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('ConstraintViolation');
  });
});
