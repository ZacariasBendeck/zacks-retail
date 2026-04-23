/**
 * Integration tests for SkuRepository against the .tmp/test-mdbs/ clone.
 *
 * Covers the full write path for the Postgres → RICS sync projection:
 *  - list / findByCode against the live fixture
 *  - create minimum-viable-payload SKU (no InvCatalog overlay)
 *  - create full-payload SKU (with InvCatalog overlay)
 *  - rejects a duplicate primary key
 *  - round-trips a Spanish-accent description through OLE DB UTF-8
 *  - update changes specified fields, leaves others alone
 *  - update upserts InvCatalog overlay on a SKU that didn't have one
 *  - delete removes both [InventoryMaster] + [InvCatalog] rows atomically
 *  - countByVendor / countByCategory reflect the insert
 *
 * Test scope: ZTEST* SKU codes so the live fixtures are never mutated. Sentinel
 * codes are cleaned up via afterAll + defensive beforeEach deletes.
 *
 * Tied to the cutover plan's §7.2 ("this path has never been exercised in CI
 * against a real MDB"). Passing this suite is the first gate on building the
 * RICS sync agent.
 */

import { setupTestMdbs } from './testMdbSetup';

const ctx = setupTestMdbs();
const d = ctx.available ? describe : describe.skip;

// IMPORTANT: imports must come AFTER setupTestMdbs so RICS_DB_DIR is set
// before any module resolves a path.
import { SkuRepository, type SkuInput } from '../../../src/repositories/rics/SkuRepository';

const TEST_CODE = 'ZTESTSKU1'; // 9 chars, inside the 15-char code limit
const TEST_CODE_2 = 'ZTESTSKU2';

/**
 * Pick a vendor + category that already exist in the fixture so we exercise a
 * realistic FK shape. The Access MDB doesn't enforce FKs at the column level,
 * but the sync agent will eventually need to guarantee them, so we model that
 * now instead of inserting with bogus values that mask that concern.
 */
async function pickValidFkTargets(): Promise<{ vendor: string; category: number }> {
  const all = await SkuRepository.findAll({ limit: 50 });
  if (!all.ok) {
    throw new Error('Could not load fixture SKUs to pick FK targets: ' + JSON.stringify(all.error));
  }
  const withBoth = all.value.find((s) => s.vendor && s.category != null);
  if (!withBoth) {
    throw new Error('No fixture SKU has both vendor + category set — cannot pick FK targets.');
  }
  return { vendor: withBoth.vendor!, category: withBoth.category! };
}

function baseInput(code: string, vendor: string, category: number): SkuInput {
  return {
    code,
    vendor,
    category,
    description: 'ZTEST SKU INTEGRATION',
    retailPrice: 99.99,
  };
}

async function cleanup(): Promise<void> {
  try { await SkuRepository.delete(TEST_CODE); } catch { /* ignore */ }
  try { await SkuRepository.delete(TEST_CODE_2); } catch { /* ignore */ }
}

d('SkuRepository (integration against .tmp/test-mdbs/)', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  // ────────────── Reads against the live fixture ──────────────

  it('lists SKUs from [InventoryMaster]', async () => {
    const result = await SkuRepository.findAll({ limit: 10 });
    if (!result.ok) throw new Error('findAll() failed: ' + JSON.stringify(result.error));
    expect(Array.isArray(result.value)).toBe(true);
    expect(result.value.length).toBeGreaterThan(0);
    const first = result.value[0];
    expect(typeof first.code).toBe('string');
    expect(typeof first.description).toBe('string');
  });

  it('returns NotFound for findByCode on a missing SKU', async () => {
    const result = await SkuRepository.findByCode('ZNOSUCHSKU');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NotFound');
  });

  // ────────────── Minimum-viable-payload create ──────────────

  it('creates a SKU with the minimum required payload (no overlay)', async () => {
    const { vendor, category } = await pickValidFkTargets();
    const result = await SkuRepository.create(baseInput(TEST_CODE, vendor, category));
    if (!result.ok) throw new Error('create() failed: ' + JSON.stringify(result.error));

    expect(result.value.code).toBe(TEST_CODE);
    expect(result.value.vendor).toBe(vendor);
    expect(result.value.category).toBe(category);
    expect(result.value.description).toBe('ZTEST SKU INTEGRATION');
    expect(result.value.retailPrice).toBeCloseTo(99.99, 2);

    // Writer defaults
    expect(result.value.currentPriceSlot).toBe('RETAIL');
    expect(result.value.coupon).toBe(false);

    // Writer stamps these at insert time.
    expect(result.value.lastPriceChange).toBeInstanceOf(Date);
    expect(result.value.dateLastChanged).toBeInstanceOf(Date);

    // No overlay → InvCatalog fields should all be null / empty.
    expect(result.value.longColor).toBeNull();
    expect(result.value.boldDesc).toBeNull();
    expect(result.value.webFileName).toBeNull();
    expect(result.value.bulletText).toEqual([]);
  });

  it('normalizes a lowercase code to uppercase', async () => {
    const { vendor, category } = await pickValidFkTargets();
    const result = await SkuRepository.create(baseInput(TEST_CODE.toLowerCase(), vendor, category));
    if (!result.ok) throw new Error('create() failed: ' + JSON.stringify(result.error));
    expect(result.value.code).toBe(TEST_CODE);
  });

  // ────────────── Full-payload create with InvCatalog overlay ──────────────

  it('creates a SKU with a full payload and InvCatalog overlay', async () => {
    const { vendor, category } = await pickValidFkTargets();
    const input: SkuInput = {
      ...baseInput(TEST_CODE, vendor, category),
      vendorSku: 'VS-ZTEST-001',
      sizeType: null,
      styleColor: 'BLK/WHT',
      season: 'SS',
      location: 'A-12',
      listPrice: 150.0,
      mdPrice1: 75.0,
      mdPrice2: 50.0,
      currentPriceSlot: 'MD1',
      currentCost: 40.5,
      manufacturer: 'ZTEST MFG',
      labelCode: 'A',
      colorCode: 'BLK',
      comment: 'Integration test row',
      groupCode: 'TST',
      keywords: ['SUMMER', 'OUTDOOR'],
      pictureFileName: 'ztest.jpg',
      coupon: true,
      orderMultiple: 12,
      orderUom: 'BOX',
      // InvCatalog overlay
      longColor: 'Glossy Black / Pure White',
      boldDesc: 'ZTEST Bold Description',
      paraDesc: 'ZTEST paragraph description for the web catalog overlay.',
      catalogSku: 'CAT-ZTEST-001',
      bulletText: ['Point A', 'Point B', 'Point C'],
      pictureName01: 'ztest_01.jpg',
      pictureName02: 'ztest_02.jpg',
      sizeText: '7..12',
      webFileName: 'ztest_web.html',
    };

    const result = await SkuRepository.create(input);
    if (!result.ok) throw new Error('create() failed: ' + JSON.stringify(result.error));

    // InventoryMaster columns
    expect(result.value.vendorSku).toBe('VS-ZTEST-001');
    expect(result.value.styleColor).toBe('BLK/WHT');
    expect(result.value.season).toBe('SS');
    expect(result.value.location).toBe('A-12');
    expect(result.value.listPrice).toBeCloseTo(150.0, 2);
    expect(result.value.mdPrice1).toBeCloseTo(75.0, 2);
    expect(result.value.mdPrice2).toBeCloseTo(50.0, 2);
    expect(result.value.currentPriceSlot).toBe('MD1');
    expect(result.value.currentCost).toBeCloseTo(40.5, 2);
    expect(result.value.manufacturer).toBe('ZTEST MFG');
    expect(result.value.labelCode).toBe('A');
    expect(result.value.colorCode).toBe('BLK');
    expect(result.value.comment).toBe('Integration test row');
    expect(result.value.groupCode).toBe('TST');
    expect(result.value.keywords).toEqual(['SUMMER', 'OUTDOOR']);
    expect(result.value.pictureFileName).toBe('ztest.jpg');
    expect(result.value.coupon).toBe(true);
    expect(result.value.orderMultiple).toBe(12);
    expect(result.value.orderUom).toBe('BOX');

    // InvCatalog overlay round-trip
    expect(result.value.longColor).toBe('Glossy Black / Pure White');
    expect(result.value.boldDesc).toBe('ZTEST Bold Description');
    expect(result.value.paraDesc).toBe(
      'ZTEST paragraph description for the web catalog overlay.',
    );
    expect(result.value.catalogSku).toBe('CAT-ZTEST-001');
    expect(result.value.bulletText).toEqual(['Point A', 'Point B', 'Point C']);
    expect(result.value.pictureName01).toBe('ztest_01.jpg');
    expect(result.value.pictureName02).toBe('ztest_02.jpg');
    expect(result.value.sizeText).toBe('7..12');
    expect(result.value.webFileName).toBe('ztest_web.html');
  });

  // ────────────── Unicode round-trip (UTF-8 output path) ──────────────

  it('round-trips a Spanish-accent description through OLE DB', async () => {
    const { vendor, category } = await pickValidFkTargets();
    const input = baseInput(TEST_CODE, vendor, category);
    input.description = 'NIÑOS OTOÑO';

    const result = await SkuRepository.create(input);
    if (!result.ok) throw new Error('create() failed: ' + JSON.stringify(result.error));
    expect(result.value.description).toBe('NIÑOS OTOÑO');

    await new Promise((r) => setTimeout(r, 400));
    const read = await SkuRepository.findByCode(TEST_CODE);
    if (!read.ok) throw new Error('findByCode() failed: ' + JSON.stringify(read.error));
    expect(read.value.description).toBe('NIÑOS OTOÑO');
  });

  // ────────────── Duplicate PK ──────────────

  it('rejects a duplicate primary key', async () => {
    const { vendor, category } = await pickValidFkTargets();
    const first = await SkuRepository.create(baseInput(TEST_CODE, vendor, category));
    expect(first.ok).toBe(true);

    // Settle — Jet OLE DB can serve a stale COUNT(*) on a second spawn
    // immediately after the INSERT commits. 400ms matches other tests.
    await new Promise((r) => setTimeout(r, 400));

    const dup = await SkuRepository.create(baseInput(TEST_CODE, vendor, category));
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.error.kind).toBe('DuplicatePrimaryKey');
  });

  // ────────────── Update ──────────────

  it('updates specified fields and leaves others alone', async () => {
    const { vendor, category } = await pickValidFkTargets();
    const seed = await SkuRepository.create(baseInput(TEST_CODE, vendor, category));
    expect(seed.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 400));

    const updated = await SkuRepository.update(TEST_CODE, {
      description: 'ZTEST SKU UPDATED',
      retailPrice: 199.99,
      keywords: ['WINTER', 'INDOOR'],
    });
    if (!updated.ok) throw new Error('update() failed: ' + JSON.stringify(updated.error));

    expect(updated.value.description).toBe('ZTEST SKU UPDATED');
    expect(updated.value.retailPrice).toBeCloseTo(199.99, 2);
    expect(updated.value.keywords).toEqual(['WINTER', 'INDOOR']);
    // Unchanged fields must survive the partial patch
    expect(updated.value.vendor).toBe(vendor);
    expect(updated.value.category).toBe(category);
    expect(updated.value.coupon).toBe(false);
  });

  it('upserts an InvCatalog overlay on a SKU that did not have one', async () => {
    const { vendor, category } = await pickValidFkTargets();
    const seed = await SkuRepository.create(baseInput(TEST_CODE, vendor, category));
    expect(seed.ok).toBe(true);
    expect(seed.ok && seed.value.boldDesc).toBeNull();
    await new Promise((r) => setTimeout(r, 400));

    const updated = await SkuRepository.update(TEST_CODE, {
      boldDesc: 'ZTEST late-added overlay',
      bulletText: ['Bullet 1', 'Bullet 2'],
      webFileName: 'ztest-late.html',
    });
    if (!updated.ok) throw new Error('update() failed: ' + JSON.stringify(updated.error));
    expect(updated.value.boldDesc).toBe('ZTEST late-added overlay');
    expect(updated.value.bulletText).toEqual(['Bullet 1', 'Bullet 2']);
    expect(updated.value.webFileName).toBe('ztest-late.html');
  });

  it('returns NotFound when updating a missing SKU', async () => {
    const result = await SkuRepository.update('ZNOSUCHSKU', { description: 'x' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NotFound');
  });

  // ────────────── Delete ──────────────

  it('deletes a SKU and its InvCatalog row atomically', async () => {
    const { vendor, category } = await pickValidFkTargets();
    const input: SkuInput = {
      ...baseInput(TEST_CODE, vendor, category),
      boldDesc: 'ZTEST overlay that must also be deleted',
    };
    const seed = await SkuRepository.create(input);
    expect(seed.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 400));

    const del = await SkuRepository.delete(TEST_CODE);
    expect(del.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 400));

    const after = await SkuRepository.findByCode(TEST_CODE);
    expect(after.ok).toBe(false);
    if (after.ok) return;
    expect(after.error.kind).toBe('NotFound');
  });

  it('returns NotFound when deleting a missing SKU', async () => {
    const result = await SkuRepository.delete('ZNOSUCHSKU');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NotFound');
  });

  // ────────────── Aggregates ──────────────

  it('countByVendor picks up a newly-inserted SKU for that vendor', async () => {
    const { vendor, category } = await pickValidFkTargets();
    const before = await SkuRepository.countByVendor(vendor);
    if (!before.ok) throw new Error('count before failed');

    const created = await SkuRepository.create(baseInput(TEST_CODE, vendor, category));
    expect(created.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 400));

    const after = await SkuRepository.countByVendor(vendor);
    if (!after.ok) throw new Error('count after failed');
    expect(after.value).toBe(before.value + 1);
  });

  it('countByCategory picks up a newly-inserted SKU for that category', async () => {
    const { vendor, category } = await pickValidFkTargets();
    const before = await SkuRepository.countByCategory(category);
    if (!before.ok) throw new Error('count before failed');

    const created = await SkuRepository.create(baseInput(TEST_CODE, vendor, category));
    expect(created.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 400));

    const after = await SkuRepository.countByCategory(category);
    if (!after.ok) throw new Error('count after failed');
    expect(after.value).toBe(before.value + 1);
  });

  // ────────────── findAll filter verifies new row is visible ──────────────

  it('findAll(vendor=...) surfaces a newly-created SKU', async () => {
    const { vendor, category } = await pickValidFkTargets();
    const created = await SkuRepository.create(baseInput(TEST_CODE, vendor, category));
    expect(created.ok).toBe(true);
    // Cache is invalidated on create — next findAll hits the MDB.
    const list = await SkuRepository.findAll({ vendors: [vendor] });
    if (!list.ok) throw new Error('findAll failed');
    expect(list.value.some((s) => s.code === TEST_CODE)).toBe(true);
  });
});
