import { setupTestMdbs } from './testMdbSetup';

const ctx = setupTestMdbs();
const d = ctx.available ? describe : describe.skip;

import { GroupRepository } from '../../../src/repositories/rics/GroupRepository';

const TEST_CODE = 'ZZT';

d('GroupRepository (integration)', () => {
  beforeEach(async () => {
    await GroupRepository.delete(TEST_CODE);
  });
  afterAll(async () => {
    await GroupRepository.delete(TEST_CODE);
  });

  it('creates, lists, updates, and deletes a group', async () => {
    const create = await GroupRepository.create({ code: TEST_CODE, description: 'ZTEST GRP' });
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    await new Promise((resolve) => setTimeout(resolve, 400));

    const list = await GroupRepository.list();
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.some((g) => g.code === TEST_CODE)).toBe(true);

    const update = await GroupRepository.update(TEST_CODE, { description: 'ZTEST GRP 2' });
    if (!update.ok) throw new Error('Update failed: ' + JSON.stringify(update.error));
    expect(update.value.description).toBe('ZTEST GRP 2');

    const del = await GroupRepository.delete(TEST_CODE);
    expect(del.ok).toBe(true);
  });

  it('rejects code longer than 3 chars', async () => {
    const result = await GroupRepository.create({ code: 'TOOLONG', description: 'x' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('ConstraintViolation');
  });
});
