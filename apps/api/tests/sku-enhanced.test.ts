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

/** Helper: get all reference IDs for use in SKU creation. */
function getFirstRefIds(): Record<string, number> {
  const db = getDb();
  const tables: Record<string, string> = {
    colorFamilyId: 'ref_color_families',
    shoeTypeId: 'ref_shoe_types',
    heelShapeId: 'ref_heel_shapes',
    heelHeightId: 'ref_heel_heights',
    toeShapeId: 'ref_toe_shapes',
    closureTypeId: 'ref_closure_types',
    upperMaterialId: 'ref_upper_materials',
    outsoleMaterialId: 'ref_outsole_materials',
    finishId: 'ref_finishes',
    widthTypeId: 'ref_width_types',
    patternId: 'ref_patterns',
    occasionId: 'ref_occasions',
    targetAudienceId: 'ref_target_audiences',
    accessoryId: 'ref_accessories',
    seasonId: 'ref_seasons',
    sizeTypeId: 'ref_size_types',
    labelTypeId: 'ref_label_types',
  };
  const result: Record<string, number> = {};
  for (const [key, table] of Object.entries(tables)) {
    const row = db.prepare(`SELECT id FROM ${table} LIMIT 1`).get() as { id: number } | undefined;
    if (row) result[key] = row.id;
  }
  return result;
}

function getRefIdByField(table: string, field: string, value: string | number): number | null {
  const db = getDb();
  const row = db.prepare(`SELECT id FROM ${table} WHERE ${field} = ?`).get(value) as { id: number } | undefined;
  return row ? row.id : null;
}

function getBrandId(code: string): number | null { return getRefIdByField('ref_brands', 'code', code); }
function getColorId(code: string): number | null { return getRefIdByField('ref_colors', 'code', code); }
function getCategoryId(ricsCode: number): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_categories WHERE rics_code = ?').get(ricsCode) as { id: number } | undefined;
  return row ? row.id : null;
}

function makeBaseSku() {
  return {
    style: 'Air Max',
    price: 129.99,
    department: 'FORMAL' as const,
    vendorId: VENDOR_ID,
    brandId: getBrandId('KISS'),
    colorId: getColorId('BK'),
    categoryId: getCategoryId(560),
    sizes: ['9'],
  };
}

beforeEach(() => {
  resetDb();
  seedVendor();
});

afterAll(() => {
  resetDb();
});

// ─── Reference Table Endpoints ────────────────────────────────────────────

describe('GET /api/v1/skus/reference/all', () => {
  it('returns all 17 reference tables with seeded data', async () => {
    const res = await request(app).get('/api/v1/skus/reference/all');
    expect(res.status).toBe(200);

    const expectedTables = [
      'color-families', 'shoe-types', 'heel-shapes', 'heel-heights',
      'toe-shapes', 'closure-types', 'upper-materials', 'outsole-materials',
      'finishes', 'width-types', 'patterns', 'occasions', 'target-audiences',
      'accessories', 'seasons', 'size-types', 'label-types',
    ];
    for (const table of expectedTables) {
      expect(res.body).toHaveProperty(table);
      expect(Array.isArray(res.body[table])).toBe(true);
      expect(res.body[table].length).toBeGreaterThan(0);
    }
  });

  it('returns reference items with id, name, and active fields', async () => {
    const res = await request(app).get('/api/v1/skus/reference/all');
    expect(res.status).toBe(200);

    const firstItem = res.body['color-families'][0];
    expect(firstItem).toHaveProperty('id');
    expect(firstItem).toHaveProperty('name');
    expect(firstItem).toHaveProperty('active');
    expect(typeof firstItem.id).toBe('number');
    expect(typeof firstItem.name).toBe('string');
    expect(firstItem.active).toBe(true);
  });

  it('returns expected seeded color families', async () => {
    const res = await request(app).get('/api/v1/skus/reference/all');
    const names = res.body['color-families'].map((item: any) => item.name);
    expect(names).toContain('Negro');
    expect(names).toContain('Blanco');
    expect(names).toContain('Metalico');
  });

  it('returns expected seeded heel heights', async () => {
    const res = await request(app).get('/api/v1/skus/reference/all');
    const names = res.body['heel-heights'].map((item: any) => item.name);
    expect(names).toContain('Flat (0cm)');
    expect(names).toContain('Alto (7-9cm)');
    expect(names).toContain('Muy Alto (10+cm)');
  });
});

describe('GET /api/v1/skus/reference/:tableName', () => {
  it('returns data for a valid reference table', async () => {
    const res = await request(app).get('/api/v1/skus/reference/shoe-types');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const names = res.body.map((item: any) => item.name);
    expect(names).toContain('Pump');
    expect(names).toContain('Sneaker');
    expect(names).toContain('Bota');
  });

  it('returns 404 for unknown reference table', async () => {
    const res = await request(app).get('/api/v1/skus/reference/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('UNKNOWN_TABLE');
  });

  it('returns items sorted by name', async () => {
    const res = await request(app).get('/api/v1/skus/reference/color-families');
    expect(res.status).toBe(200);
    const names = res.body.map((item: any) => item.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('only returns active items', async () => {
    // Deactivate one item directly in DB
    const db = getDb();
    db.prepare('UPDATE ref_color_families SET active = 0 WHERE name = ?').run('Negro');

    const res = await request(app).get('/api/v1/skus/reference/color-families');
    expect(res.status).toBe(200);
    const names = res.body.map((item: any) => item.name);
    expect(names).not.toContain('Negro');
  });

  it('works for all 17 reference table keys', async () => {
    const tables = [
      'color-families', 'shoe-types', 'heel-shapes', 'heel-heights',
      'toe-shapes', 'closure-types', 'upper-materials', 'outsole-materials',
      'finishes', 'width-types', 'patterns', 'occasions', 'target-audiences',
      'accessories', 'seasons', 'size-types', 'label-types',
    ];
    for (const table of tables) {
      const res = await request(app).get(`/api/v1/skus/reference/${table}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
    }
  });
});

// ─── SKU Lookup Endpoint ──────────────────────────────────────────────────

describe('GET /api/v1/skus/lookup', () => {
  it('finds an existing SKU by code', async () => {
    const created = await request(app).post('/api/v1/skus').send(makeBaseSku());
    expect(created.status).toBe(201);

    const res = await request(app).get(`/api/v1/skus/lookup?code=${created.body.skuCode}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.skuCode).toBe(created.body.skuCode);
    expect(res.body.brandId).toBe(getBrandId('KISS'));
  });

  it('returns 404 for non-existent SKU code', async () => {
    const res = await request(app).get('/api/v1/skus/lookup?code=DOES-NOT-EXIST-001');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when code parameter is missing', async () => {
    const res = await request(app).get('/api/v1/skus/lookup');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_CODE');
  });

  it('returns currentStock with the looked-up SKU', async () => {
    const created = await request(app).post('/api/v1/skus').send(makeBaseSku());
    const res = await request(app).get(`/api/v1/skus/lookup?code=${created.body.skuCode}`);
    expect(res.status).toBe(200);
    expect(res.body.currentStock).toBe(0);
  });

  it('finds SKU with manual skuCode', async () => {
    const res = await request(app).post('/api/v1/skus').send({
      ...makeBaseSku(),
      skuCode: 'MANUAL-TEST-001',
    });
    expect(res.status).toBe(201);
    expect(res.body.skuCode).toBe('MANUAL-TEST-001');

    const lookup = await request(app).get('/api/v1/skus/lookup?code=MANUAL-TEST-001');
    expect(lookup.status).toBe(200);
    expect(lookup.body.skuCode).toBe('MANUAL-TEST-001');
  });
});

// ─── Enhanced SKU Creation with New Attributes ────────────────────────────

describe('POST /api/v1/skus (enhanced attributes)', () => {
  it('creates a SKU with all reference table IDs', async () => {
    const refIds = getFirstRefIds();
    const skuData = {
      ...makeBaseSku(),
      ...refIds,
      cost: 65.50,
      vendorSku: 'VND-12345',
      comment: 'Test shoe with all attributes',
      keywords: 'test,pump,formal',
      season: 'SS2026',
      manufacturer: 'Nike Corp',
      pictureUrl: '/images/test-shoe.jpg',
    };

    const res = await request(app).post('/api/v1/skus').send(skuData);
    expect(res.status).toBe(201);

    // colorFamilyId is auto-derived from colorId, not from the sent value
    expect(res.body.colorFamilyId).toBeTruthy();
    expect(res.body.shoeTypeId).toBe(refIds.shoeTypeId);
    expect(res.body.heelShapeId).toBe(refIds.heelShapeId);
    expect(res.body.heelHeightId).toBe(refIds.heelHeightId);
    expect(res.body.toeShapeId).toBe(refIds.toeShapeId);
    expect(res.body.closureTypeId).toBe(refIds.closureTypeId);
    expect(res.body.upperMaterialId).toBe(refIds.upperMaterialId);
    expect(res.body.outsoleMaterialId).toBe(refIds.outsoleMaterialId);
    expect(res.body.finishId).toBe(refIds.finishId);
    expect(res.body.widthTypeId).toBe(refIds.widthTypeId);
    expect(res.body.patternId).toBe(refIds.patternId);
    expect(res.body.occasionId).toBe(refIds.occasionId);
    expect(res.body.targetAudienceId).toBe(refIds.targetAudienceId);
    expect(res.body.accessoryId).toBe(refIds.accessoryId);
    expect(res.body.seasonId).toBe(refIds.seasonId);
    expect(res.body.sizeTypeId).toBe(refIds.sizeTypeId);
    expect(res.body.labelTypeId).toBe(refIds.labelTypeId);

    // Verify extended text fields
    expect(res.body.cost).toBe(65.50);
    expect(res.body.vendorSku).toBe('VND-12345');
    expect(res.body.comment).toBe('Test shoe with all attributes');
    expect(res.body.keywords).toBe('test,pump,formal');
    expect(res.body.season).toBe('SS2026');
    expect(res.body.manufacturer).toBe('Nike Corp');
    expect(res.body.pictureUrl).toBe('/images/test-shoe.jpg');
  });

  it('creates a SKU without any extended attributes (all null)', async () => {
    // Send only the required fields — no brandId, colorId, categoryId, or other extended attrs
    const minimalSku = {
      style: 'Minimal Style',
      price: 50.00,
      department: 'CASUAL',
      vendorId: VENDOR_ID,
    };
    const res = await request(app).post('/api/v1/skus').send(minimalSku);
    expect(res.status).toBe(201);
    expect(res.body.colorFamilyId).toBeNull();
    expect(res.body.shoeTypeId).toBeNull();
    expect(res.body.cost).toBeNull();
    expect(res.body.vendorSku).toBeNull();
    expect(res.body.keywords).toBeNull();
    expect(res.body.manufacturer).toBeNull();
    expect(res.body.seasonId).toBeNull();
    expect(res.body.sizeTypeId).toBeNull();
    expect(res.body.labelTypeId).toBeNull();
  });

  it('creates a SKU with a manual skuCode', async () => {
    const res = await request(app).post('/api/v1/skus').send({
      ...makeBaseSku(),
      skuCode: 'CUSTOM-SKU-001',
    });
    expect(res.status).toBe(201);
    expect(res.body.skuCode).toBe('CUSTOM-SKU-001');
  });

  it('rejects negative cost', async () => {
    const res = await request(app).post('/api/v1/skus').send({
      ...makeBaseSku(),
      cost: -5.00,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts zero cost', async () => {
    const res = await request(app).post('/api/v1/skus').send({
      ...makeBaseSku(),
      cost: 0,
    });
    expect(res.status).toBe(201);
    expect(res.body.cost).toBe(0);
  });

  it('rejects cost with more than 2 decimal places', async () => {
    const res = await request(app).post('/api/v1/skus').send({
      ...makeBaseSku(),
      cost: 10.999,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects non-positive reference ID', async () => {
    const res = await request(app).post('/api/v1/skus').send({
      ...makeBaseSku(),
      shoeTypeId: 0,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects non-integer reference ID', async () => {
    const res = await request(app).post('/api/v1/skus').send({
      ...makeBaseSku(),
      shoeTypeId: 1.5,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ─── Enhanced SKU Update with New Attributes ──────────────────────────────

describe('PATCH /api/v1/skus/:skuId (enhanced attributes)', () => {
  it('updates reference table IDs', async () => {
    const created = await request(app).post('/api/v1/skus').send(makeBaseSku());
    expect(created.status).toBe(201);

    const refIds = getFirstRefIds();
    const res = await request(app).patch(`/api/v1/skus/${created.body.id}`).send({
      shoeTypeId: refIds.shoeTypeId,
      heelHeightId: refIds.heelHeightId,
    });
    expect(res.status).toBe(200);
    // colorFamilyId is auto-derived from colorId
    expect(res.body.colorFamilyId).toBeTruthy();
    expect(res.body.shoeTypeId).toBe(refIds.shoeTypeId);
    expect(res.body.heelHeightId).toBe(refIds.heelHeightId);
  });

  it('updates extended text fields', async () => {
    const created = await request(app).post('/api/v1/skus').send(makeBaseSku());
    const res = await request(app).patch(`/api/v1/skus/${created.body.id}`).send({
      cost: 75.00,
      vendorSku: 'VND-99999',
      manufacturer: 'Updated Mfg',
      keywords: 'updated,keywords',
    });
    expect(res.status).toBe(200);
    expect(res.body.cost).toBe(75.00);
    expect(res.body.vendorSku).toBe('VND-99999');
    expect(res.body.manufacturer).toBe('Updated Mfg');
    expect(res.body.keywords).toBe('updated,keywords');
  });

  it('clears nullable fields with null', async () => {
    const refIds = getFirstRefIds();
    const created = await request(app).post('/api/v1/skus').send({
      ...makeBaseSku(),
      cost: 50.00,
      shoeTypeId: refIds.shoeTypeId,
      vendorSku: 'VND-001',
    });
    expect(created.status).toBe(201);

    const res = await request(app).patch(`/api/v1/skus/${created.body.id}`).send({
      cost: null,
      shoeTypeId: null,
      vendorSku: null,
    });
    expect(res.status).toBe(200);
    expect(res.body.cost).toBeNull();
    expect(res.body.shoeTypeId).toBeNull();
    expect(res.body.vendorSku).toBeNull();
  });

  it('preserves existing fields when updating only one attribute', async () => {
    const refIds = getFirstRefIds();
    const created = await request(app).post('/api/v1/skus').send({
      ...makeBaseSku(),
      shoeTypeId: refIds.shoeTypeId,
      heelShapeId: refIds.heelShapeId,
    });
    expect(created.status).toBe(201);

    const res = await request(app).patch(`/api/v1/skus/${created.body.id}`).send({
      cost: 80.00,
    });
    expect(res.status).toBe(200);
    expect(res.body.cost).toBe(80.00);
    // original ref IDs should be preserved
    expect(res.body.shoeTypeId).toBe(refIds.shoeTypeId);
    expect(res.body.heelShapeId).toBe(refIds.heelShapeId);
  });
});

// ─── Enhanced SKU Retrieval ───────────────────────────────────────────────

describe('GET /api/v1/skus/:skuId (enhanced attributes)', () => {
  it('returns all extended attributes when fetching a SKU', async () => {
    const refIds = getFirstRefIds();
    const created = await request(app).post('/api/v1/skus').send({
      ...makeBaseSku(),
      ...refIds,
      cost: 45.00,
      vendorSku: 'V-100',
      comment: 'A test comment',
      keywords: 'formal,pump',
      season: 'FW2026',
      manufacturer: 'Test Corp',
      pictureUrl: '/img/shoe.png',
    });
    expect(created.status).toBe(201);

    const res = await request(app).get(`/api/v1/skus/${created.body.id}`);
    expect(res.status).toBe(200);

    // Check all the enhanced fields round-trip correctly
    expect(res.body.cost).toBe(45.00);
    expect(res.body.vendorSku).toBe('V-100');
    expect(res.body.comment).toBe('A test comment');
    expect(res.body.keywords).toBe('formal,pump');
    expect(res.body.season).toBe('FW2026');
    expect(res.body.manufacturer).toBe('Test Corp');
    expect(res.body.pictureUrl).toBe('/img/shoe.png');

    // Verify ref IDs match (colorFamilyId is auto-derived from colorId)
    expect(res.body.colorFamilyId).toBeTruthy();
    expect(res.body.shoeTypeId).toBe(refIds.shoeTypeId);
    expect(res.body.heelShapeId).toBe(refIds.heelShapeId);
    expect(res.body.heelHeightId).toBe(refIds.heelHeightId);
    expect(res.body.toeShapeId).toBe(refIds.toeShapeId);
    expect(res.body.closureTypeId).toBe(refIds.closureTypeId);
    expect(res.body.upperMaterialId).toBe(refIds.upperMaterialId);
    expect(res.body.outsoleMaterialId).toBe(refIds.outsoleMaterialId);
    expect(res.body.finishId).toBe(refIds.finishId);
    expect(res.body.widthTypeId).toBe(refIds.widthTypeId);
    expect(res.body.patternId).toBe(refIds.patternId);
    expect(res.body.occasionId).toBe(refIds.occasionId);
    expect(res.body.targetAudienceId).toBe(refIds.targetAudienceId);
    expect(res.body.accessoryId).toBe(refIds.accessoryId);
    expect(res.body.seasonId).toBe(refIds.seasonId);
    expect(res.body.sizeTypeId).toBe(refIds.sizeTypeId);
    expect(res.body.labelTypeId).toBe(refIds.labelTypeId);
  });
});

// ─── AI Image Analysis Endpoint ───────────────────────────────────────────

describe('POST /api/v1/skus/analyze-image', () => {
  it('returns 400 when no image is uploaded', async () => {
    const res = await request(app).post('/api/v1/skus/analyze-image');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_IMAGE');
  });

  it('rejects non-image file types', async () => {
    const res = await request(app)
      .post('/api/v1/skus/analyze-image')
      .attach('image', Buffer.from('not an image'), {
        filename: 'test.txt',
        contentType: 'text/plain',
      });
    expect(res.status).toBe(500); // multer throws error
  });

  it('accepts a valid image but fails without ANTHROPIC_API_KEY', async () => {
    // Create a minimal valid PNG (1x1 pixel)
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, // depth/color
      0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
      0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, // data
      0xe2, 0x21, 0xbc, 0x33,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND chunk
      0xae, 0x42, 0x60, 0x82,
    ]);

    // Save original env and ensure ANTHROPIC_API_KEY is not set
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const res = await request(app)
        .post('/api/v1/skus/analyze-image')
        .attach('image', pngHeader, {
          filename: 'test.png',
          contentType: 'image/png',
        });
      // Should return 500 with CONFIG_ERROR since no API key
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('CONFIG_ERROR');
    } finally {
      // Restore original key
      if (originalKey) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      }
    }
  });
});

// ─── Gross Margin Calculation Validation ──────────────────────────────────

describe('Financial field validation', () => {
  it('cost and price allow correct margin calculation', async () => {
    const res = await request(app).post('/api/v1/skus').send({
      ...makeBaseSku(),
      price: 200.00,
      cost: 80.00,
    });
    expect(res.status).toBe(201);
    expect(res.body.price).toBe(200.00);
    expect(res.body.cost).toBe(80.00);

    // Verify gross margin: (200 - 80) / 200 = 60%
    const grossMarginPct = ((res.body.price - res.body.cost) / res.body.price) * 100;
    expect(grossMarginPct).toBe(60);
  });

  it('handles cost higher than price (negative margin scenario)', async () => {
    const res = await request(app).post('/api/v1/skus').send({
      ...makeBaseSku(),
      price: 50.00,
      cost: 75.00,
    });
    expect(res.status).toBe(201);
    // Negative margin: (50 - 75) / 50 = -50%
    const grossMarginPct = ((res.body.price - res.body.cost) / res.body.price) * 100;
    expect(grossMarginPct).toBe(-50);
  });
});

// ─── Cross-Module: SKU + Inventory Integration ────────────────────────────

describe('SKU creation triggers correct inventory initialization', () => {
  it('SKU with all extended attributes still gets inventory record', async () => {
    const refIds = getFirstRefIds();
    const created = await request(app).post('/api/v1/skus').send({
      ...makeBaseSku(),
      ...refIds,
      cost: 100.00,
      vendorSku: 'VSKU-001',
    });
    expect(created.status).toBe(201);

    // Verify inventory via direct DB query
    const db = getDb();
    const inv = db.prepare('SELECT * FROM inventory WHERE sku_id = ?').get(created.body.id) as any;
    expect(inv).toBeTruthy();
    expect(inv.quantity_on_hand).toBe(0);
    expect(inv.quantity_reserved).toBe(0);
  });
});
