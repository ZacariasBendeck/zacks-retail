import { setupTestMdbs } from './testMdbSetup';

const ctx = setupTestMdbs();
const d = ctx.available ? describe : describe.skip;

import { KeywordRepository } from '../../../src/repositories/rics/KeywordRepository';

const TEST_KEYWORD = 'ZTEST1';

d('KeywordRepository (integration)', () => {
  beforeEach(async () => {
    await KeywordRepository.delete(TEST_KEYWORD);
  });
  afterAll(async () => {
    await KeywordRepository.delete(TEST_KEYWORD);
  });

  it('creates, lists, updates, deletes', async () => {
    const create = await KeywordRepository.create({ keyword: TEST_KEYWORD, description: 'ztest kw' });
    expect(create.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const list = await KeywordRepository.list();
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.some((k) => k.keyword === TEST_KEYWORD)).toBe(true);

    const upd = await KeywordRepository.update(TEST_KEYWORD, { description: 'ztest kw 2' });
    if (!upd.ok) throw new Error('Update failed: ' + JSON.stringify(upd.error));

    const del = await KeywordRepository.delete(TEST_KEYWORD);
    expect(del.ok).toBe(true);
  });

  it('rejects keyword longer than 10 chars', async () => {
    const result = await KeywordRepository.create({ keyword: '12345678901', description: 'x' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('ConstraintViolation');
  });

  it('rejects keyword containing whitespace', async () => {
    const result = await KeywordRepository.create({ keyword: 'BAD KW', description: 'x' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('ConstraintViolation');
  });
});
