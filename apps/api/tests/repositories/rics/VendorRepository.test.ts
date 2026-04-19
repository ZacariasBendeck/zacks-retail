/**
 * Integration tests for VendorRepository against the .tmp/test-mdbs/ clone.
 *
 * Covers:
 *  - list + search (`?q=`) against live fixture rows
 *  - getByCode (NotFound + Ok)
 *  - create / update / delete round-trip for Vendor Master
 *  - LongComment 2 KB memo round-trip
 *  - DateLastChanged is stamped on every write
 *  - per-store account CRUD via Vendor Accounts
 *  - countSkusUsingVendor against InventoryMaster
 *
 * Test scope: ZTEST* codes so the live fixtures are never touched. Codes are
 * cleaned up via afterAll + defensive beforeEach deletes.
 */

import { setupTestMdbs } from './testMdbSetup';

const ctx = setupTestMdbs();
const d = ctx.available ? describe : describe.skip;

// IMPORTANT: imports must come AFTER setupTestMdbs so RICS_DB_DIR is set
// before any module resolves a path.
import { VendorRepository } from '../../../src/repositories/rics/VendorRepository';

const TEST_CODE = 'ZTST'; // 4-char, safely outside live fixture space
const TEST_CODE_2 = 'ZTS2';

async function cleanup(): Promise<void> {
  // Store accounts first (FK-ish), then vendor row, for both test codes.
  try {
    await VendorRepository.deleteStoreAccount(TEST_CODE, 1);
  } catch {
    /* ignore */
  }
  try {
    await VendorRepository.deleteStoreAccount(TEST_CODE, 2);
  } catch {
    /* ignore */
  }
  try {
    await VendorRepository.deleteStoreAccount(TEST_CODE_2, 1);
  } catch {
    /* ignore */
  }
  await VendorRepository.delete(TEST_CODE);
  await VendorRepository.delete(TEST_CODE_2);
}

d('VendorRepository (integration against .tmp/test-mdbs/)', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it('lists vendors from RIVENDOR.Vendor Master', async () => {
    const result = await VendorRepository.findAll();
    if (!result.ok) throw new Error('findAll() failed: ' + JSON.stringify(result.error));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.value)).toBe(true);
    expect(result.value.length).toBeGreaterThan(0);
    const first = result.value[0];
    expect(typeof first.code).toBe('string');
    expect(typeof first.name).toBe('string');
  });

  it('creates a new vendor with all 22 fields', async () => {
    const result = await VendorRepository.create({
      code: TEST_CODE,
      name: 'ZTEST VENDOR',
      mailName: 'ZTEST MAIL NAME',
      addr1: '123 Main St',
      addr2: 'Suite 200',
      city: 'Chicago',
      state: 'IL',
      zip: '60601',
      phone: '312-555-0101',
      fax: '312-555-0102',
      contact: 'J. Doe',
      terms: 'NET30',
      shipInst: 'FOB destination',
      comment: 'short comment',
      manuCode: 'MNU1',
      manuName: 'ZTEST MANU',
      qualifierId: 'ZZ',
      qualifierCode: 'ZTQC',
      colorCode: true,
      longComment: 'long comment',
      email: 'zt@example.com',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.code).toBe(TEST_CODE);
    expect(result.value.name).toBe('ZTEST VENDOR');
    expect(result.value.mailName).toBe('ZTEST MAIL NAME');
    expect(result.value.colorCode).toBe(true);
    expect(result.value.email).toBe('zt@example.com');
    expect(result.value.dateLastChanged).toBeInstanceOf(Date);
  });

  it('rejects a duplicate primary key', async () => {
    const first = await VendorRepository.create({
      code: TEST_CODE,
      name: 'ZTEST',
      mailName: 'ZTEST',
    });
    expect(first.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 400));

    const dup = await VendorRepository.create({
      code: TEST_CODE,
      name: 'OTHER',
      mailName: 'OTHER',
    });
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.error.kind).toBe('DuplicatePrimaryKey');
  });

  it('round-trips a 2 KB LongComment memo field', async () => {
    // 2 KB of varied content to exercise the memo column encoding.
    const longText = Array.from({ length: 2048 })
      .map((_, i) => String.fromCharCode(33 + (i % 94)))
      .join('');

    const created = await VendorRepository.create({
      code: TEST_CODE,
      name: 'ZTEST LONG',
      mailName: 'ZTEST LONG',
      longComment: longText,
    });
    expect(created.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 400));

    const read = await VendorRepository.findByCode(TEST_CODE);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.longComment).toBe(longText);
  });

  it('returns NotFound for findByCode on a missing vendor', async () => {
    const result = await VendorRepository.findByCode('ZNOP');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NotFound');
  });

  it('updates a vendor', async () => {
    const seed = await VendorRepository.create({
      code: TEST_CODE,
      name: 'ZTEST',
      mailName: 'ZTEST',
      city: 'CHICAGO',
    });
    expect(seed.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 400));

    const updated = await VendorRepository.update(TEST_CODE, {
      name: 'ZTEST UPDATED',
      city: 'BOSTON',
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.name).toBe('ZTEST UPDATED');
    expect(updated.value.city).toBe('BOSTON');
    expect(updated.value.mailName).toBe('ZTEST'); // unchanged
  });

  it('returns NotFound when updating a missing vendor', async () => {
    const result = await VendorRepository.update('ZNOP', { name: 'x' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NotFound');
  });

  it('deletes a vendor', async () => {
    await VendorRepository.create({ code: TEST_CODE, name: 'ZTEST', mailName: 'ZTEST' });
    await new Promise((r) => setTimeout(r, 400));
    const del = await VendorRepository.delete(TEST_CODE);
    expect(del.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 400));
    const after = await VendorRepository.findByCode(TEST_CODE);
    expect(after.ok).toBe(false);
    if (after.ok) return;
    expect(after.error.kind).toBe('NotFound');
  });

  it('findAll(q) filters case-insensitively on code/name/manuName', async () => {
    await VendorRepository.create({
      code: TEST_CODE,
      name: 'UNIQUE ZTEST VENDOR MARK',
      mailName: 'MARK',
      manuName: 'UNIQUE MANU MARK',
    });
    await new Promise((r) => setTimeout(r, 400));

    const byName = await VendorRepository.findAll({ q: 'UNIQUE ZTEST' });
    expect(byName.ok).toBe(true);
    if (!byName.ok) return;
    expect(byName.value.some((v) => v.code === TEST_CODE)).toBe(true);

    const byLowercaseName = await VendorRepository.findAll({ q: 'unique ztest' });
    expect(byLowercaseName.ok).toBe(true);
    if (!byLowercaseName.ok) return;
    expect(byLowercaseName.value.some((v) => v.code === TEST_CODE)).toBe(true);

    const byCode = await VendorRepository.findAll({ q: TEST_CODE });
    expect(byCode.ok).toBe(true);
    if (!byCode.ok) return;
    expect(byCode.value.some((v) => v.code === TEST_CODE)).toBe(true);
  });

  // ────────────── Store accounts ──────────────

  it('findStoreAccounts returns [] for a vendor with no accounts', async () => {
    await VendorRepository.create({ code: TEST_CODE, name: 'ZTEST', mailName: 'ZTEST' });
    await new Promise((r) => setTimeout(r, 400));
    const res = await VendorRepository.findStoreAccounts(TEST_CODE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([]);
  });

  it('upsertStoreAccount creates and updates a per-store account', async () => {
    await VendorRepository.create({ code: TEST_CODE, name: 'ZTEST', mailName: 'ZTEST' });
    await new Promise((r) => setTimeout(r, 400));

    const created = await VendorRepository.upsertStoreAccount(TEST_CODE, 1, 'ACCT-001');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.account).toBe('ACCT-001');
    expect(created.value.storeId).toBe(1);
    expect(created.value.dateLastChanged).toBeInstanceOf(Date);

    await new Promise((r) => setTimeout(r, 400));

    const updated = await VendorRepository.upsertStoreAccount(TEST_CODE, 1, 'ACCT-002');
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.account).toBe('ACCT-002');

    await new Promise((r) => setTimeout(r, 400));

    const list = await VendorRepository.findStoreAccounts(TEST_CODE);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value).toHaveLength(1);
    expect(list.value[0].account).toBe('ACCT-002');
  });

  it('deleteStoreAccount removes only the targeted row', async () => {
    await VendorRepository.create({ code: TEST_CODE, name: 'ZTEST', mailName: 'ZTEST' });
    await new Promise((r) => setTimeout(r, 400));
    await VendorRepository.upsertStoreAccount(TEST_CODE, 1, 'A1');
    await new Promise((r) => setTimeout(r, 400));
    await VendorRepository.upsertStoreAccount(TEST_CODE, 2, 'A2');
    await new Promise((r) => setTimeout(r, 400));

    const del = await VendorRepository.deleteStoreAccount(TEST_CODE, 1);
    expect(del.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 400));

    const list = await VendorRepository.findStoreAccounts(TEST_CODE);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value).toHaveLength(1);
    expect(list.value[0].storeId).toBe(2);
  });

  // ────────────── SKU usage ──────────────

  it('countSkusUsingVendor returns 0 for a newly-created vendor', async () => {
    await VendorRepository.create({ code: TEST_CODE, name: 'ZTEST', mailName: 'ZTEST' });
    await new Promise((r) => setTimeout(r, 400));
    const res = await VendorRepository.countSkusUsingVendor(TEST_CODE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toBe(0);
  });

  it('countSkusUsingVendor returns >0 for a vendor referenced by real SKUs', async () => {
    // Pick a real vendor from the live fixture data. We trust findAll to
    // surface one that has SKUs in InventoryMaster; if the first row has 0,
    // we walk forward until we find one that does (bounded to a reasonable
    // number of round-trips so a fully-empty DB still exits cleanly).
    const vendors = await VendorRepository.findAll();
    expect(vendors.ok).toBe(true);
    if (!vendors.ok) return;

    let hit = false;
    for (const v of vendors.value.slice(0, 20)) {
      const count = await VendorRepository.countSkusUsingVendor(v.code);
      if (count.ok && count.value > 0) {
        hit = true;
        break;
      }
    }
    expect(hit).toBe(true);
  });
});
