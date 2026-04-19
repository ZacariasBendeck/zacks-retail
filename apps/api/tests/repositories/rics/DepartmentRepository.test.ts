import { setupTestMdbs } from './testMdbSetup';

const ctx = setupTestMdbs();
const d = ctx.available ? describe : describe.skip;

// IMPORTANT: imports must come AFTER setupTestMdbs so RICS_DB_DIR is set
// before any module resolves a path.
import { DepartmentRepository } from '../../../src/repositories/rics/DepartmentRepository';

// Scope test data to a safe range far outside the live fixture data.
// Live Departments.Number runs 1..92; we use 95..99.
const TEST_NUMBER = 97;

d('DepartmentRepository (integration against .tmp/test-mdbs/)', () => {
  beforeEach(async () => {
    // Defensive cleanup — a previous aborted run could leave rows behind.
    await DepartmentRepository.delete(TEST_NUMBER);
  });

  afterAll(async () => {
    await DepartmentRepository.delete(TEST_NUMBER);
  });

  it('lists departments from RIDEPT.Departments', async () => {
    const result = await DepartmentRepository.list();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.value)).toBe(true);
    expect(result.value.length).toBeGreaterThan(0);
    const first = result.value[0];
    expect(typeof first.number).toBe('number');
    expect(typeof first.description).toBe('string');
    expect(typeof first.begCateg).toBe('number');
    expect(typeof first.endCateg).toBe('number');
  });

  it('creates a new department', async () => {
    const result = await DepartmentRepository.create({
      number: TEST_NUMBER,
      description: 'ZTEST DEPT',
      begCateg: 900,
      endCateg: 910,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.number).toBe(TEST_NUMBER);
    expect(result.value.description).toBe('ZTEST DEPT');
    expect(result.value.begCateg).toBe(900);
    expect(result.value.endCateg).toBe(910);
  });

  it('rejects a duplicate primary key', async () => {
    await DepartmentRepository.create({
      number: TEST_NUMBER,
      description: 'ZTEST DEPT',
      begCateg: 900,
      endCateg: 910,
    });
    const dup = await DepartmentRepository.create({
      number: TEST_NUMBER,
      description: 'OTHER',
      begCateg: 911,
      endCateg: 920,
    });
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.error.kind).toBe('DuplicatePrimaryKey');
  });

  it('rejects invalid range (endCateg < begCateg)', async () => {
    const result = await DepartmentRepository.create({
      number: TEST_NUMBER,
      description: 'ZTEST',
      begCateg: 950,
      endCateg: 940,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('ConstraintViolation');
  });

  it('updates a department', async () => {
    const seed = await DepartmentRepository.create({
      number: TEST_NUMBER,
      description: 'ZTEST',
      begCateg: 900,
      endCateg: 910,
    });
    expect(seed.ok).toBe(true);
    const updated = await DepartmentRepository.update(TEST_NUMBER, { description: 'ZTEST 2', endCateg: 920 });
    if (!updated.ok) {
      throw new Error('Update failed: ' + JSON.stringify(updated.error));
    }
    expect(updated.value.description).toBe('ZTEST 2');
    expect(updated.value.endCateg).toBe(920);
    expect(updated.value.begCateg).toBe(900); // unchanged
  });

  it('returns NotFound when updating a missing department', async () => {
    const result = await DepartmentRepository.update(999, { description: 'x' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NotFound');
  });

  it('deletes a department', async () => {
    await DepartmentRepository.create({
      number: TEST_NUMBER,
      description: 'ZTEST',
      begCateg: 900,
      endCateg: 910,
    });
    const del = await DepartmentRepository.delete(TEST_NUMBER);
    expect(del.ok).toBe(true);
    const after = await DepartmentRepository.getByNumber(TEST_NUMBER);
    expect(after.ok).toBe(false);
    if (after.ok) return;
    expect(after.error.kind).toBe('NotFound');
  });
});
