/**
 * Integration tests for image analysis and auto-fill pipeline (ZAI-70)
 *
 * Covers:
 * - POST /api/v1/skus/analyze-image endpoint (mocked Anthropic API)
 * - matchReferenceValue edge cases (synonym coverage, substring, multi-map)
 * - mapAiResultsToReferenceIds with realistic shoe data
 * - Cross-module: AI mapped IDs used to create a valid SKU
 * - Error handling: missing image, invalid file type, malformed AI response
 */
import request from 'supertest';
import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';
import {
  matchReferenceValue,
  mapAiResultsToReferenceIds,
  getAiFillConfig,
  clearConfigCache,
} from '../src/services/aiFieldMappingService';
import * as imageAnalysisService from '../src/services/imageAnalysisService';

const VENDOR_ID = '00000000-0000-0000-0000-000000000001';

function seedVendor(): void {
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO vendors (id, name, contact_email) VALUES (?, 'Test Vendor', 'vendor@test.com')"
  ).run(VENDOR_ID);
}

/** Minimal valid PNG (1x1 pixel) for upload tests */
const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
  0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54,
  0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
  0xe2, 0x21, 0xbc, 0x33,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

/** Realistic AI response for a black leather pump */
const MOCK_AI_PUMP_RESULT: imageAnalysisService.ImageAnalysisResult = {
  shoe_type: 'Pump',
  heel_height: 'High (3-4in)',
  heel_shape: 'Stiletto',
  toe_shape: 'Pointed',
  color: 'Black',
  upper_material: 'Leather',
  outsole_material: null,
  heel_material: null,
  finish: 'Glossy',
  pattern: 'Solid',
  occasion: 'Formal',
  target_audience: 'Women',
  accessory: 'None',
  description: 'A classic black leather stiletto pump with pointed toe',
  category: 'Pump Formal',
};

/** Realistic AI response for a casual brown sandal */
const MOCK_AI_SANDAL_RESULT: imageAnalysisService.ImageAnalysisResult = {
  shoe_type: 'Sandal',
  heel_height: 'Flat',
  heel_shape: 'Flat',
  toe_shape: 'Open Toe',
  color: 'Tan',
  upper_material: 'Leather',
  outsole_material: 'Rubber',
  heel_material: null,
  finish: 'Natural',
  pattern: 'Solid',
  occasion: 'Casual',
  target_audience: 'Women',
  accessory: 'Buckle',
  description: 'A casual tan leather flat sandal with open toe',
  category: 'Sandal Flat',
};

/** AI response with partial nulls (ambiguous shoe) */
const MOCK_AI_PARTIAL_RESULT: imageAnalysisService.ImageAnalysisResult = {
  shoe_type: 'Ankle Boot',
  heel_height: null,
  heel_shape: null,
  toe_shape: 'Round',
  color: 'Burgundy',
  upper_material: 'Suede',
  outsole_material: null,
  heel_material: null,
  finish: null,
  pattern: null,
  occasion: null,
  target_audience: null,
  accessory: null,
  description: 'A red suede ankle boot',
  category: 'Ankle Boot',
};

beforeEach(() => {
  resetDb();
  clearConfigCache();
  getDb();
  seedVendor();
});

afterAll(() => {
  resetDb();
});

// ─── matchReferenceValue: Extended Edge Cases ────────────────────────────

describe('matchReferenceValue — extended coverage', () => {
  it('matches all color family English synonyms', () => {
    // Test multiple English words that map to the same Spanish entry
    const brownId = matchReferenceValue('color-families', 'Brown');
    const tanId = matchReferenceValue('color-families', 'Tan');
    const camelId = matchReferenceValue('color-families', 'Camel');

    expect(brownId).not.toBeNull();
    expect(tanId).not.toBeNull();
    expect(camelId).not.toBeNull();
    // Brown, Tan, and Camel should all map to "café/camel"
    expect(brownId).toBe(tanId);
    expect(tanId).toBe(camelId);
  });

  it('matches beige and nude to the same ref entry', () => {
    const beigeId = matchReferenceValue('color-families', 'Beige');
    const nudeId = matchReferenceValue('color-families', 'Nude');
    expect(beigeId).not.toBeNull();
    expect(nudeId).not.toBeNull();
    expect(beigeId).toBe(nudeId);
  });

  it('matches red and burgundy to the same ref entry', () => {
    const redId = matchReferenceValue('color-families', 'Red');
    const burgundyId = matchReferenceValue('color-families', 'Burgundy');
    expect(redId).not.toBeNull();
    expect(burgundyId).not.toBeNull();
    expect(redId).toBe(burgundyId);
  });

  it('matches gray and grey to the same ref entry', () => {
    const grayId = matchReferenceValue('color-families', 'Gray');
    const greyId = matchReferenceValue('color-families', 'Grey');
    expect(grayId).not.toBeNull();
    expect(greyId).not.toBeNull();
    expect(grayId).toBe(greyId);
  });

  it('matches gold, silver, and metallic to metálico', () => {
    const goldId = matchReferenceValue('color-families', 'Gold');
    const silverId = matchReferenceValue('color-families', 'Silver');
    const metallicId = matchReferenceValue('color-families', 'Metallic');
    expect(goldId).not.toBeNull();
    expect(silverId).not.toBeNull();
    expect(metallicId).not.toBeNull();
    expect(goldId).toBe(silverId);
    expect(silverId).toBe(metallicId);
  });

  it('matches block and chunky heel shapes to same entry', () => {
    const blockId = matchReferenceValue('heel-shapes', 'Block');
    const chunkyId = matchReferenceValue('heel-shapes', 'Chunky');
    expect(blockId).not.toBeNull();
    expect(chunkyId).not.toBeNull();
    expect(blockId).toBe(chunkyId);
  });

  it('matches flat and none heel shapes to same entry', () => {
    const flatId = matchReferenceValue('heel-shapes', 'Flat');
    const noneId = matchReferenceValue('heel-shapes', 'None');
    expect(flatId).not.toBeNull();
    expect(noneId).not.toBeNull();
    expect(flatId).toBe(noneId);
  });

  it('matches heel height variants with parenthetical values', () => {
    // These are exact AI output formats from the prompt
    const lowShort = matchReferenceValue('heel-heights', 'Low');
    const lowFull = matchReferenceValue('heel-heights', 'Low (1-2in)');
    expect(lowShort).not.toBeNull();
    expect(lowFull).not.toBeNull();
    expect(lowShort).toBe(lowFull);
  });

  it('matches medium heel height variants', () => {
    const medShort = matchReferenceValue('heel-heights', 'Medium');
    const medFull = matchReferenceValue('heel-heights', 'Medium (2-3in)');
    expect(medShort).not.toBeNull();
    expect(medFull).not.toBeNull();
    expect(medShort).toBe(medFull);
  });

  it('matches all upper material English-to-Spanish pairs', () => {
    const materials: [string, boolean][] = [
      ['Leather', true],
      ['Synthetic', true],
      ['Fabric', true],
      ['Canvas', true],
      ['Patent Leather', true],
      ['Patent', true],
      ['Suede', true],
      ['Nubuck', true],
      ['Mesh', true],
      ['Satin', true],
      ['Velvet', true],
    ];
    for (const [material, shouldMatch] of materials) {
      const id = matchReferenceValue('upper-materials', material);
      if (shouldMatch) {
        expect(id).not.toBeNull();
      }
    }
  });

  it('matches patent and patent leather to same charol entry', () => {
    const patentId = matchReferenceValue('upper-materials', 'Patent');
    const patentLeatherId = matchReferenceValue('upper-materials', 'Patent Leather');
    expect(patentId).not.toBeNull();
    expect(patentLeatherId).not.toBeNull();
    expect(patentId).toBe(patentLeatherId);
  });

  it('matches evening and party occasions to same fiesta/gala entry', () => {
    const eveningId = matchReferenceValue('occasions', 'Evening');
    const partyId = matchReferenceValue('occasions', 'Party');
    expect(eveningId).not.toBeNull();
    expect(partyId).not.toBeNull();
    expect(eveningId).toBe(partyId);
  });

  it('handles whitespace in AI values', () => {
    const id = matchReferenceValue('shoe-types', '  Pump  ');
    expect(id).not.toBeNull();
  });

  it('returns null for empty string', () => {
    const id = matchReferenceValue('shoe-types', '');
    // empty string is falsy, should return null
    expect(id).toBeNull();
  });
});

// ─── mapAiResultsToReferenceIds: Realistic Shoe Scenarios ────────────────

describe('mapAiResultsToReferenceIds — realistic scenarios', () => {
  it('maps a classic black pump correctly', () => {
    const mapped = mapAiResultsToReferenceIds(
      MOCK_AI_PUMP_RESULT as unknown as Record<string, string | null>,
    );

    // All reference fields should resolve to numeric IDs
    expect(typeof mapped.shoeTypeId).toBe('number');
    expect(typeof mapped.heelHeightId).toBe('number');
    expect(typeof mapped.heelShapeId).toBe('number');
    expect(typeof mapped.toeShapeId).toBe('number');
    expect(typeof mapped.colorId).toBe('number');
    expect(typeof mapped.upperMaterialId).toBe('number');
    expect(typeof mapped.finishId).toBe('number');
    expect(typeof mapped.patternId).toBe('number');
    expect(typeof mapped.occasionId).toBe('number');

    // Text/enum fields preserved as-is
    expect(mapped.color).toBe('Black');
    expect(mapped.description).toBe('A classic black leather stiletto pump with pointed toe');
  });

  it('maps a casual brown sandal correctly', () => {
    const mapped = mapAiResultsToReferenceIds(
      MOCK_AI_SANDAL_RESULT as unknown as Record<string, string | null>,
    );

    expect(typeof mapped.shoeTypeId).toBe('number');
    expect(typeof mapped.colorId).toBe('number');
    expect(typeof mapped.upperMaterialId).toBe('number');
    expect(mapped.color).toBe('Tan');
  });

  it('handles partial nulls from AI (ambiguous shoe)', () => {
    const mapped = mapAiResultsToReferenceIds(
      MOCK_AI_PARTIAL_RESULT as unknown as Record<string, string | null>,
    );

    // Non-null fields should resolve
    expect(typeof mapped.shoeTypeId).toBe('number');
    expect(typeof mapped.toeShapeId).toBe('number');
    expect(typeof mapped.colorId).toBe('number');
    expect(typeof mapped.upperMaterialId).toBe('number');

    // Null fields should stay null
    expect(mapped.heelHeightId).toBeNull();
    expect(mapped.heelShapeId).toBeNull();
    expect(mapped.finishId).toBeNull();
    expect(mapped.patternId).toBeNull();
    expect(mapped.occasionId).toBeNull();

    // Text/enum should be preserved
    expect(mapped.color).toBe('Burgundy');
  });

  it('returns only enabled attributes from config', () => {
    const config = getAiFillConfig();
    const mapped = mapAiResultsToReferenceIds(
      MOCK_AI_PUMP_RESULT as unknown as Record<string, string | null>,
    );

    // Only keys present in config.attributes should appear in mapped
    for (const key of Object.keys(mapped)) {
      expect(config.attributes[key]).toBeDefined();
      expect(config.attributes[key].enabled).toBe(true);
    }
  });
});

// ─── POST /api/v1/skus/analyze-image: Integration with mocked AI ────────

describe('POST /api/v1/skus/analyze-image (mocked AI)', () => {
  let analyzeSpy: jest.SpyInstance;

  afterEach(() => {
    if (analyzeSpy) analyzeSpy.mockRestore();
  });

  it('returns raw, mapped, and config for a valid image', async () => {
    analyzeSpy = jest.spyOn(imageAnalysisService, 'analyzeShoeImage')
      .mockResolvedValue({ raw: MOCK_AI_PUMP_RESULT, resolution: null, warning: null });

    const res = await request(app)
      .post('/api/v1/skus/analyze-image')
      .field('family', 'zapatos')
      .attach('image', VALID_PNG, { filename: 'shoe.png', contentType: 'image/png' });

    expect(res.status).toBe(200);

    // Response structure
    expect(res.body).toHaveProperty('raw');
    expect(res.body).toHaveProperty('mapped');
    expect(res.body).toHaveProperty('config');

    // Raw should contain AI output
    expect(res.body.raw.shoe_type).toBe('Pump');
    expect(res.body.raw.heel_shape).toBe('Stiletto');
    expect(res.body.raw.color).toBe('Black');

    // Mapped should have numeric IDs for reference fields
    expect(typeof res.body.mapped.shoeTypeId).toBe('number');
    expect(typeof res.body.mapped.heelShapeId).toBe('number');
    expect(typeof res.body.mapped.colorId).toBe('number');
    expect(res.body.mapped.genderId).toBe(res.body.mapped.targetAudienceId);

    // Text/enum preserved
    expect(res.body.mapped.color).toBe('Black');

    // Config should have version and attributes
    expect(res.body.config.version).toBe(1);
    expect(Object.keys(res.body.config.attributes).length).toBe(16);
  });

  it('returns correct mapping for a sandal image', async () => {
    analyzeSpy = jest.spyOn(imageAnalysisService, 'analyzeShoeImage')
      .mockResolvedValue({ raw: MOCK_AI_SANDAL_RESULT, resolution: null, warning: null });

    const res = await request(app)
      .post('/api/v1/skus/analyze-image')
      .field('family', 'zapatos')
      .attach('image', VALID_PNG, { filename: 'sandal.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.raw.shoe_type).toBe('Sandal');
    expect(typeof res.body.mapped.shoeTypeId).toBe('number');
    expect(res.body.mapped.categoryId).toBeNull();
  });

  it('handles partial null AI response gracefully', async () => {
    analyzeSpy = jest.spyOn(imageAnalysisService, 'analyzeShoeImage')
      .mockResolvedValue({ raw: MOCK_AI_PARTIAL_RESULT, resolution: null, warning: null });

    const res = await request(app)
      .post('/api/v1/skus/analyze-image')
      .field('family', 'zapatos')
      .attach('image', VALID_PNG, { filename: 'boot.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.mapped.heelHeightId).toBeNull();
    expect(res.body.mapped.heelShapeId).toBeNull();
    expect(typeof res.body.mapped.shoeTypeId).toBe('number');
  });

  it('returns 400 when no image field is sent', async () => {
    const res = await request(app).post('/api/v1/skus/analyze-image');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_IMAGE');
  });

  it('returns 500 when AI service throws a general error', async () => {
    analyzeSpy = jest.spyOn(imageAnalysisService, 'analyzeShoeImage')
      .mockRejectedValue(new Error('Claude API timeout'));

    const res = await request(app)
      .post('/api/v1/skus/analyze-image')
      .field('family', 'zapatos')
      .attach('image', VALID_PNG, { filename: 'shoe.png', contentType: 'image/png' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('ANALYSIS_FAILED');
  });

  it('returns CONFIG_ERROR when ANTHROPIC_API_KEY is missing', async () => {
    analyzeSpy = jest.spyOn(imageAnalysisService, 'analyzeShoeImage')
      .mockRejectedValue(new Error('ANTHROPIC_API_KEY environment variable is not set'));

    const res = await request(app)
      .post('/api/v1/skus/analyze-image')
      .field('family', 'zapatos')
      .attach('image', VALID_PNG, { filename: 'shoe.png', contentType: 'image/png' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('CONFIG_ERROR');
  });

  it('accepts WebP images', async () => {
    analyzeSpy = jest.spyOn(imageAnalysisService, 'analyzeShoeImage')
      .mockResolvedValue({ raw: MOCK_AI_PUMP_RESULT, resolution: null, warning: null });

    const res = await request(app)
      .post('/api/v1/skus/analyze-image')
      .field('family', 'zapatos')
      .attach('image', VALID_PNG, { filename: 'shoe.webp', contentType: 'image/webp' });

    expect(res.status).toBe(200);
  });

  it('accepts GIF images', async () => {
    analyzeSpy = jest.spyOn(imageAnalysisService, 'analyzeShoeImage')
      .mockResolvedValue({ raw: MOCK_AI_PUMP_RESULT, resolution: null, warning: null });

    const res = await request(app)
      .post('/api/v1/skus/analyze-image')
      .field('family', 'zapatos')
      .attach('image', VALID_PNG, { filename: 'shoe.gif', contentType: 'image/gif' });

    expect(res.status).toBe(200);
  });

  it('rejects non-image MIME types', async () => {
    const res = await request(app)
      .post('/api/v1/skus/analyze-image')
      .attach('image', Buffer.from('not an image'), {
        filename: 'test.pdf',
        contentType: 'application/pdf',
      });
    // multer file filter should reject
    expect(res.status).toBe(500);
  });
});

// ─── Cross-Module: AI Analysis → SKU Creation Pipeline ──────────────────

describe('AI analysis → SKU creation integration', () => {
  it('creates a valid SKU using AI mapped reference IDs', () => {
    // Simulate the full flow: AI returns result → map to ref IDs → create SKU
    const mapped = mapAiResultsToReferenceIds(
      MOCK_AI_PUMP_RESULT as unknown as Record<string, string | null>,
    );

    const db = getDb();
    const catRow = db.prepare('SELECT id FROM ref_categories WHERE rics_code = ?').get(560) as { id: number } | undefined;
    const categoryId = catRow ? catRow.id : null;
    const brandRow = db.prepare("SELECT id FROM ref_brands WHERE code = 'KISS'").get() as { id: number } | undefined;
    const colorRow = db.prepare("SELECT id FROM ref_colors WHERE code = 'BK'").get() as { id: number } | undefined;

    const skuData = {
      style: 'So Kate',
      price: 795.00,
      cost: 350.00,
      categoryId,
      brandId: brandRow?.id ?? null,
      colorId: colorRow?.id ?? null,
      department: 'FORMAL',
      vendorId: VENDOR_ID,
      sizes: ['7.5'],
      shoeTypeId: mapped.shoeTypeId,
      heelHeightId: mapped.heelHeightId,
      heelShapeId: mapped.heelShapeId,
      toeShapeId: mapped.toeShapeId,
      upperMaterialId: mapped.upperMaterialId,
      finishId: mapped.finishId,
      patternId: mapped.patternId,
      occasionId: mapped.occasionId,
      comment: mapped.description as string,
    };

    return request(app)
      .post('/api/v1/skus')
      .send(skuData)
      .then((res) => {
        expect(res.status).toBe(201);

        // Verify all reference IDs round-trip correctly
        expect(res.body.shoeTypeId).toBe(mapped.shoeTypeId);
        expect(res.body.heelHeightId).toBe(mapped.heelHeightId);
        expect(res.body.heelShapeId).toBe(mapped.heelShapeId);
        expect(res.body.toeShapeId).toBe(mapped.toeShapeId);
        // colorFamilyId is auto-derived from colorId (BK → Negro)
        expect(res.body.colorFamilyId).toBeDefined();
        expect(res.body.upperMaterialId).toBe(mapped.upperMaterialId);
        expect(res.body.finishId).toBe(mapped.finishId);
        expect(res.body.patternId).toBe(mapped.patternId);
        expect(res.body.occasionId).toBe(mapped.occasionId);
        expect(res.body.department).toBe('FORMAL');
        expect(res.body.cost).toBe(350.00);

        // Verify margin calculation: (795 - 350) / 795 = 55.97%
        const margin = ((res.body.price - res.body.cost) / res.body.price) * 100;
        expect(margin).toBeCloseTo(55.97, 1);
      });
  });

  it('creates a valid SKU with partial AI data (nulls allowed)', () => {
    const mapped = mapAiResultsToReferenceIds(
      MOCK_AI_PARTIAL_RESULT as unknown as Record<string, string | null>,
    );

    const db = getDb();
    const catRow = db.prepare('SELECT id FROM ref_categories WHERE rics_code = ?').get(570) as { id: number } | undefined;
    const categoryId = catRow ? catRow.id : null;
    const brandRow2 = db.prepare("SELECT id FROM ref_brands WHERE code = 'FLEX'").get() as { id: number } | undefined;
    const colorRow2 = db.prepare("SELECT id FROM ref_colors WHERE code = 'BR'").get() as { id: number } | undefined;

    const skuData = {
      style: 'Chelsea Boot',
      price: 180.00,
      cost: 90.00,
      categoryId,
      brandId: brandRow2?.id ?? null,
      colorId: colorRow2?.id ?? null,
      department: 'BOOTS',
      vendorId: VENDOR_ID,
      sizes: ['8'],
      shoeTypeId: mapped.shoeTypeId,
      toeShapeId: mapped.toeShapeId,
      upperMaterialId: mapped.upperMaterialId,
      // null fields omitted — they should default to null
    };

    return request(app)
      .post('/api/v1/skus')
      .send(skuData)
      .then((res) => {
        expect(res.status).toBe(201);
        expect(res.body.shoeTypeId).toBe(mapped.shoeTypeId);
        expect(res.body.heelHeightId).toBeNull();
        expect(res.body.heelShapeId).toBeNull();
        expect(res.body.department).toBe('BOOTS');
      });
  });
});

// ─── AI Fill Config Endpoint ────────────────────────────────────────────

describe('GET /api/v1/skus/ai-fill-config — extended', () => {
  it('all reference-type attributes have a refTable field', async () => {
    const res = await request(app).get('/api/v1/skus/ai-fill-config');
    expect(res.status).toBe(200);

    for (const [key, attr] of Object.entries(res.body.attributes) as [string, any][]) {
      if (attr.type === 'reference') {
        expect(attr.refTable).toBeDefined();
        expect(typeof attr.refTable).toBe('string');
        expect(attr.refTable.length).toBeGreaterThan(0);
      }
    }
  });

  it('all attributes have an aiKey field', async () => {
    const res = await request(app).get('/api/v1/skus/ai-fill-config');
    expect(res.status).toBe(200);

    for (const [key, attr] of Object.entries(res.body.attributes) as [string, any][]) {
      expect(attr.aiKey).toBeDefined();
      expect(typeof attr.aiKey).toBe('string');
    }
  });

  it('reference table names in config match valid reference endpoints', async () => {
    const configRes = await request(app).get('/api/v1/skus/ai-fill-config');
    expect(configRes.status).toBe(200);

    for (const [key, attr] of Object.entries(configRes.body.attributes) as [string, any][]) {
      if (attr.type === 'reference' && attr.refTable) {
        const refRes = await request(app).get(`/api/v1/skus/reference/${attr.refTable}`);
        expect(refRes.status).toBe(200);
        expect(refRes.body.length).toBeGreaterThan(0);
      }
    }
  });
});

// ─── English-to-Spanish Mapping Completeness ─────────────────────────────

describe('English-to-Spanish mapping — completeness for all AI prompt values', () => {
  // These are the exact values the AI prompt tells Claude to return
  const AI_PROMPT_VALUES: Record<string, string[]> = {
    'shoe-types': ['Oxford', 'Pump', 'Sandal', 'Boot', 'Loafer', 'Sneaker', 'Flat', 'Mule', 'Wedge', 'Espadrille'],
    'heel-heights': ['Flat', 'Low (1-2in)', 'Medium (2-3in)', 'High (3-4in)', 'Very High (4in+)'],
    'heel-shapes': ['Flat', 'Block', 'Stiletto', 'Kitten', 'Wedge', 'Platform', 'Cone', 'Spool', 'Stacked'],
    'toe-shapes': ['Pointed', 'Round', 'Square', 'Almond', 'Peep Toe', 'Open Toe'],
    'color-families': ['Black', 'Brown', 'Tan', 'White', 'Red', 'Blue', 'Pink', 'Green', 'Gold', 'Silver', 'Multi', 'Nude', 'Navy', 'Burgundy'],
    'upper-materials': ['Leather', 'Suede', 'Patent Leather', 'Synthetic', 'Canvas', 'Satin', 'Mesh', 'Velvet', 'Fabric'],
    'outsole-materials': ['Rubber', 'TPR', 'PU', 'Leather', 'Synthetic', 'EVA'],
    'heel-materials': ['Plastic', 'Wrapped', 'Rubber', 'Espadrille', 'Stacked Leather'],
    'finishes': ['Matte', 'Glossy', 'Patent', 'Metallic', 'Distressed', 'Brushed', 'Natural'],
    'patterns': ['Solid', 'Two-Tone', 'Animal Print', 'Floral', 'Striped', 'Plaid', 'Embossed', 'Studded', 'Woven'],
    'occasions': ['Formal', 'Business', 'Casual', 'Evening', 'Party', 'Bridal', 'Athletic', 'Outdoor'],
    'target-audiences': ['Women', 'Men', 'Girls', 'Boys'],
    'accessories': ['None', 'Buckle', 'Studs', 'Bows', 'Fringe', 'Embroidery', 'Rhinestones', 'Chain'],
  };

  for (const [table, values] of Object.entries(AI_PROMPT_VALUES)) {
    for (const value of values) {
      it(`${table}: "${value}" resolves to a reference ID`, () => {
        const id = matchReferenceValue(table, value);
        expect(id).not.toBeNull();
      });
    }
  }
});
