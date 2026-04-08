import request from 'supertest';
import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';

const VENDOR_ID = '00000000-0000-0000-0000-000000000001';

function seedVendor(): void {
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO vendors (id, name, contact_email) VALUES (?, 'Test Vendor', 'vendor@test.com')"
  ).run(VENDOR_ID);
}

function getCategoryId(ricsCode: number): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_categories WHERE rics_code = ?').get(ricsCode) as { id: number } | undefined;
  return row ? row.id : null;
}

function getBrandId(code: string): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_brands WHERE code = ?').get(code) as { id: number } | undefined;
  return row ? row.id : null;
}

function getColorId(code: string): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_colors WHERE code = ?').get(code) as { id: number } | undefined;
  return row ? row.id : null;
}

let skuCounter = 0;

/** Create a SKU and seed its inventory row with a given quantity. */
async function createSkuWithStock(
  style: string,
  department: string,
  quantity: number,
): Promise<string> {
  skuCounter++;
  const categoryId = getCategoryId(560);
  const brandId = getBrandId('KISS');
  const colorId = getColorId('BK');
  const res = await request(app).post('/api/v1/skus').send({
    style: `${style}-${skuCounter}`,
    price: 99.99,
    department,
    vendorId: VENDOR_ID,
    categoryId,
    brandId,
    colorId,
  });
  if (res.status !== 201) {
    throw new Error(`SKU creation failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const skuId = res.body.id;
  if (quantity > 0) {
    const adj = await request(app)
      .post(`/api/v1/skus/${skuId}/inventory/adjustments`)
      .send({ adjustment: quantity, reason: 'seed' });
    if (adj.status !== 200) {
      throw new Error(`Adjustment failed: ${adj.status} ${JSON.stringify(adj.body)}`);
    }
  }
  return skuId;
}

beforeEach(() => {
  resetDb();
  seedVendor();
  skuCounter = 0;
});

afterAll(() => {
  resetDb();
});

describe('GET /api/v1/inventory (cursor pagination contract)', () => {
  it('returns empty data with null nextCursor when no inventory exists', async () => {
    const res = await request(app).get('/api/v1/inventory');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.limit).toBe(50);
    expect(res.body.appliedSort).toEqual({ field: 'updatedAt', order: 'desc' });
    expect(res.body.appliedFilters).toEqual({});
  });

  it('echoes appliedSort and appliedFilters exactly as enforced', async () => {
    await createSkuWithStock('StyleA', 'FORMAL', 5);

    const res = await request(app).get(
      '/api/v1/inventory?sort=quantityOnHand&order=asc&department=FORMAL&limit=10'
    );
    expect(res.status).toBe(200);
    expect(res.body.appliedSort).toEqual({ field: 'quantityOnHand', order: 'asc' });
    expect(res.body.appliedFilters).toEqual({ department: 'FORMAL' });
    expect(res.body.limit).toBe(10);
  });

  it('rejects sort fields not in allowlist', async () => {
    const res = await request(app).get('/api/v1/inventory?sort=price');
    expect(res.status).toBe(400);
  });

  it('returns paginated results with stable ordering across pages', async () => {
    // Create 5 SKUs with different stock levels
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const id = await createSkuWithStock(`PagStyle${i}`, 'CASUAL', i * 10);
      ids.push(id);
    }

    // Page 1: limit 2, sorted by quantityOnHand asc
    const page1 = await request(app).get(
      '/api/v1/inventory?sort=quantityOnHand&order=asc&limit=2'
    );
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.nextCursor).not.toBeNull();
    expect(page1.body.data[0].quantityOnHand).toBeLessThanOrEqual(
      page1.body.data[1].quantityOnHand
    );

    // Page 2: use cursor
    const page2 = await request(app).get(
      `/api/v1/inventory?sort=quantityOnHand&order=asc&limit=2&cursor=${page1.body.nextCursor}`
    );
    expect(page2.status).toBe(200);
    expect(page2.body.data).toHaveLength(2);
    expect(page2.body.nextCursor).not.toBeNull();

    // Page 2 items must come after page 1 items in sort order
    const lastPage1Qty = page1.body.data[1].quantityOnHand;
    expect(page2.body.data[0].quantityOnHand).toBeGreaterThanOrEqual(lastPage1Qty);

    // Page 3: last page
    const page3 = await request(app).get(
      `/api/v1/inventory?sort=quantityOnHand&order=asc&limit=2&cursor=${page2.body.nextCursor}`
    );
    expect(page3.status).toBe(200);
    expect(page3.body.data).toHaveLength(1);
    expect(page3.body.nextCursor).toBeNull(); // no more pages

    // All 5 items collected, no duplicates
    const allSkuIds = [
      ...page1.body.data.map((d: any) => d.skuId),
      ...page2.body.data.map((d: any) => d.skuId),
      ...page3.body.data.map((d: any) => d.skuId),
    ];
    expect(new Set(allSkuIds).size).toBe(5);
  });

  it('deterministic secondary sort by id prevents duplicate rows', async () => {
    // Create 3 SKUs with SAME quantity to force secondary sort tiebreaker
    for (let i = 0; i < 3; i++) {
      await createSkuWithStock(`SameQty${i}`, 'FORMAL', 10);
    }

    const page1 = await request(app).get(
      '/api/v1/inventory?sort=quantityOnHand&order=desc&limit=1'
    );
    expect(page1.body.data).toHaveLength(1);
    expect(page1.body.nextCursor).not.toBeNull();

    const page2 = await request(app).get(
      `/api/v1/inventory?sort=quantityOnHand&order=desc&limit=1&cursor=${page1.body.nextCursor}`
    );
    expect(page2.body.data).toHaveLength(1);

    // Must be a different item (secondary sort by id breaks tie)
    expect(page2.body.data[0].inventoryId).not.toBe(page1.body.data[0].inventoryId);
  });

  it('filters by department correctly', async () => {
    await createSkuWithStock('FormalShoe', 'FORMAL', 5);
    await createSkuWithStock('CasualShoe', 'CASUAL', 10);

    const res = await request(app).get('/api/v1/inventory?department=FORMAL');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].department).toBe('FORMAL');
    expect(res.body.appliedFilters).toEqual({ department: 'FORMAL' });
  });

  it('includes inventory fields in response items', async () => {
    await createSkuWithStock('DetailShoe', 'BOOTS', 25);

    const res = await request(app).get('/api/v1/inventory?limit=1');
    expect(res.status).toBe(200);
    const item = res.body.data[0];
    expect(item).toHaveProperty('inventoryId');
    expect(item).toHaveProperty('skuId');
    expect(item).toHaveProperty('skuCode');
    expect(item).toHaveProperty('style');
    expect(item).toHaveProperty('department');
    expect(item).toHaveProperty('quantityOnHand');
    expect(item).toHaveProperty('quantityReserved');
    expect(item).toHaveProperty('quantityAvailable');
    expect(item).toHaveProperty('version');
    expect(item).toHaveProperty('updatedAt');
    expect(item.quantityOnHand).toBe(25);
  });
});
