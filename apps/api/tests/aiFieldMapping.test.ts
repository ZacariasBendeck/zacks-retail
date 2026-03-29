import request from 'supertest';
import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';
import {
  matchReferenceValue,
  mapAiResultsToReferenceIds,
  getAiFillConfig,
  clearConfigCache,
} from '../src/services/aiFieldMappingService';

beforeEach(() => {
  resetDb();
  clearConfigCache();
  // Ensure DB is initialized with reference data
  getDb();
});

afterAll(() => {
  resetDb();
});

describe('getAiFillConfig', () => {
  it('loads the config from disk', () => {
    const config = getAiFillConfig();
    expect(config.version).toBe(1);
    expect(config.attributes).toBeDefined();
    expect(Object.keys(config.attributes).length).toBe(12);
  });

  it('includes all expected attribute keys', () => {
    const config = getAiFillConfig();
    const expected = [
      'color', 'description', 'department', 'shoeTypeId', 'heelHeightId',
      'heelShapeId', 'toeShapeId', 'colorFamilyId', 'upperMaterialId',
      'finishId', 'patternId', 'occasionId',
    ];
    for (const key of expected) {
      expect(config.attributes[key]).toBeDefined();
      expect(config.attributes[key].enabled).toBe(true);
    }
  });

  it('has correct types for each attribute', () => {
    const config = getAiFillConfig();
    expect(config.attributes.color.type).toBe('text');
    expect(config.attributes.description.type).toBe('text');
    expect(config.attributes.department.type).toBe('enum');
    expect(config.attributes.shoeTypeId.type).toBe('reference');
    expect(config.attributes.shoeTypeId.refTable).toBe('shoe-types');
  });
});

describe('matchReferenceValue', () => {
  it('matches English to Spanish via mapping — shoe type', () => {
    const id = matchReferenceValue('shoe-types', 'Sandal');
    expect(id).not.toBeNull();
    expect(typeof id).toBe('number');
  });

  it('matches English to Spanish — color family', () => {
    const id = matchReferenceValue('color-families', 'Black');
    expect(id).not.toBeNull();
  });

  it('matches English to Spanish — heel height with parenthetical', () => {
    const id = matchReferenceValue('heel-heights', 'High (3-4in)');
    expect(id).not.toBeNull();
  });

  it('matches English to Spanish — upper material', () => {
    const id = matchReferenceValue('upper-materials', 'Leather');
    expect(id).not.toBeNull();
  });

  it('matches English to Spanish — toe shape', () => {
    const id = matchReferenceValue('toe-shapes', 'Pointed');
    expect(id).not.toBeNull();
  });

  it('handles loanwords that are the same in both languages', () => {
    const id = matchReferenceValue('heel-shapes', 'Stiletto');
    expect(id).not.toBeNull();
  });

  it('handles case-insensitive matching', () => {
    const id = matchReferenceValue('shoe-types', 'PUMP');
    expect(id).not.toBeNull();
  });

  it('returns null for null input', () => {
    const id = matchReferenceValue('shoe-types', null);
    expect(id).toBeNull();
  });

  it('returns null for unknown value', () => {
    const id = matchReferenceValue('shoe-types', 'Spaceshoe9000');
    expect(id).toBeNull();
  });

  it('returns null for unknown reference table', () => {
    const id = matchReferenceValue('nonexistent-table', 'Pump');
    expect(id).toBeNull();
  });

  it('matches occasion English to Spanish', () => {
    const id = matchReferenceValue('occasions', 'Business');
    expect(id).not.toBeNull();
  });

  it('matches finish English to Spanish', () => {
    const id = matchReferenceValue('finishes', 'Matte');
    expect(id).not.toBeNull();
  });

  it('matches pattern English to Spanish', () => {
    const id = matchReferenceValue('patterns', 'Animal Print');
    expect(id).not.toBeNull();
  });
});

describe('mapAiResultsToReferenceIds', () => {
  it('maps a full AI result to reference IDs', () => {
    const rawResults = {
      shoe_type: 'Pump',
      heel_height: 'High (3-4in)',
      heel_shape: 'Stiletto',
      toe_shape: 'Pointed',
      color_family: 'Black',
      upper_material: 'Leather',
      finish: 'Glossy',
      pattern: 'Solid',
      occasion: 'Formal',
      department: 'FORMAL',
      color: 'Black',
      description: 'A classic black leather pump',
    };

    const mapped = mapAiResultsToReferenceIds(rawResults);

    // Reference types should be numeric IDs or null
    expect(typeof mapped.shoeTypeId).toBe('number');
    expect(typeof mapped.heelHeightId).toBe('number');
    expect(typeof mapped.heelShapeId).toBe('number');
    expect(typeof mapped.toeShapeId).toBe('number');
    expect(typeof mapped.colorFamilyId).toBe('number');
    expect(typeof mapped.upperMaterialId).toBe('number');
    expect(typeof mapped.finishId).toBe('number');
    expect(typeof mapped.patternId).toBe('number');
    expect(typeof mapped.occasionId).toBe('number');

    // Text/enum types should be the raw string
    expect(mapped.color).toBe('Black');
    expect(mapped.description).toBe('A classic black leather pump');
    expect(mapped.department).toBe('FORMAL');
  });

  it('handles null AI values gracefully', () => {
    const rawResults = {
      shoe_type: null,
      heel_height: null,
      heel_shape: null,
      toe_shape: null,
      color_family: null,
      upper_material: null,
      finish: null,
      pattern: null,
      occasion: null,
      department: null,
      color: null,
      description: null,
    };

    const mapped = mapAiResultsToReferenceIds(rawResults);

    expect(mapped.shoeTypeId).toBeNull();
    expect(mapped.color).toBeNull();
    expect(mapped.department).toBeNull();
  });
});

describe('GET /api/v1/skus/ai-fill-config', () => {
  it('returns the AI fill config', async () => {
    const res = await request(app).get('/api/v1/skus/ai-fill-config');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.attributes).toBeDefined();
    expect(Object.keys(res.body.attributes).length).toBe(12);
    expect(res.body.attributes.shoeTypeId.type).toBe('reference');
    expect(res.body.attributes.shoeTypeId.refTable).toBe('shoe-types');
  });
});
