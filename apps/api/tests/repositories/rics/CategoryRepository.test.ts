import { setupTestMdbs } from './testMdbSetup';

const ctx = setupTestMdbs();
const d = ctx.available ? describe : describe.skip;

import { CategoryRepository } from '../../../src/repositories/rics/CategoryRepository';

// Live Categories.Number runs up to ~900; we use 950..959.
const TEST_NUMBER = 955;

d('CategoryRepository (integration)', () => {
  beforeEach(async () => {
    await CategoryRepository.delete(TEST_NUMBER);
  });
  afterAll(async () => {
    await CategoryRepository.delete(TEST_NUMBER);
  });

  it('lists categories', async () => {
    const result = await CategoryRepository.list();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
    expect(typeof result.value[0].number).toBe('number');
    expect(typeof result.value[0].description).toBe('string');
  });

  it('creates, updates, and deletes a category', async () => {
    const create = await CategoryRepository.create({ number: TEST_NUMBER, description: 'ZTEST CAT' });
    expect(create.ok).toBe(true);
    if (!create.ok) return;
    expect(create.value.description).toBe('ZTEST CAT');

    // Pause so the UPDATE's read-before-write sees the row we just inserted.
    await new Promise((resolve) => setTimeout(resolve, 400));

    const update = await CategoryRepository.update(TEST_NUMBER, { description: 'ZTEST CAT 2' });
    if (!update.ok) throw new Error('Update failed: ' + JSON.stringify(update.error));
    expect(update.value.description).toBe('ZTEST CAT 2');

    const del = await CategoryRepository.delete(TEST_NUMBER);
    expect(del.ok).toBe(true);
  });

  it('rejects duplicate category number', async () => {
    await CategoryRepository.create({ number: TEST_NUMBER, description: 'ZTEST' });
    // Jet OLE DB occasionally serves stale COUNT(*) on a second spawn; pause
    // briefly so the pre-insert existence check reflects the prior INSERT.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const dup = await CategoryRepository.create({ number: TEST_NUMBER, description: 'OTHER' });
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.error.kind).toBe('DuplicatePrimaryKey');
  });

  it('rejects invalid category number', async () => {
    const result = await CategoryRepository.create({ number: 0, description: 'x' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('ConstraintViolation');
  });
});
