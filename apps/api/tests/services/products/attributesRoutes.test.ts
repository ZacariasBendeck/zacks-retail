/**
 * Route tests for the SKU extended-attributes endpoints.
 *
 *   GET  /api/v1/products/attributes/dimensions
 *   GET  /api/v1/products/attributes/coverage
 *   GET  /api/v1/products/skus/:code/attributes
 *   PUT  /api/v1/products/skus/:code/attributes
 */

import request from 'supertest';
import { Err, Ok } from '../../../src/repositories/rics/repoResult';

const replaceMock = jest.fn();
const replaceDimensionMock = jest.fn();
const bulkAssignMock = jest.fn();
const findCodesMock = jest.fn();
const replaceMacroRulesMock = jest.fn();
const createValueMock = jest.fn();
const updateValueMock = jest.fn();

jest.mock('../../../src/repositories/products/AttributesRepository', () => {
  const DIMS_WITH_COUNTS = [
    {
      code: 'buyer',
      labelEs: 'Comprador',
      sortOrder: 10,
      isMultiValue: false,
      values: [
        { id: 1, code: 'zb', labelEs: 'Zacarias Bendeck', descriptionEs: 'Zack, Zacarias', sortOrder: 10, isActive: true, skuCount: 50 },
        { id: 2, code: 'ab', labelEs: 'AB', descriptionEs: null, sortOrder: 20, isActive: true, skuCount: 75 },
      ],
    },
    {
      code: 'discount_type',
      labelEs: 'Tipo de Descuento',
      sortOrder: 40,
      isMultiValue: true,
      values: [{ id: 3, code: 'pct_50', labelEs: '50% off', descriptionEs: null, sortOrder: 150, isActive: true, skuCount: 12 }],
    },
  ];
  const DIMS_BARE = DIMS_WITH_COUNTS.map((d) => ({
    ...d,
    values: d.values.map(({ skuCount: _skip, ...rest }) => rest),
  }));
  const SKU_ATTRS = {
    skuCode: 'ZB12345',
    byDimension: {
      buyer: {
        isMultiValue: false,
        values: [
          {
            code: 'zb',
            labelEs: 'Zacarias Bendeck',
            assignedBy: 'seed:keyword:abc',
            assignedAt: '2026-04-22T10:14:33.000Z',
          },
        ],
      },
      discount_type: { isMultiValue: true, values: [] },
    },
  };
  const COVERAGE = [
    {
      dimensionCode: 'buyer',
      labelEs: 'Comprador',
      totalSkus: 200000,
      classifiedSkus: 182916,
      coveragePct: 91.5,
      bySource: { keyword: 182916, excel: 0, operator: 0 },
    },
  ];
  const MACRO_SUMMARIES = [
    {
      sourceDimensionCode: 'color',
      sourceDimensionLabelEs: 'Color',
      targetDimensionCode: 'color_family',
      targetDimensionLabelEs: 'Familia de Color',
      mappedCount: 30,
      sourceValueCount: 30,
      updatedAt: '2026-04-28T00:00:00.000Z',
    },
  ];
  const MACRO_RULE_SET = {
    sourceDimensionCode: 'color',
    sourceDimensionLabelEs: 'Color',
    targetDimensionCode: 'color_family',
    targetDimensionLabelEs: 'Familia de Color',
    rules: [
      {
        sourceValueCode: '1',
        sourceLabelEs: 'Negro',
        targetValueCode: 'black',
        targetLabelEs: 'black',
        updatedAt: '2026-04-28T00:00:00.000Z',
        updatedBy: 'seed',
      },
    ],
  };
  return {
    AttributesRepository: {
      listDimensionsWithValues: jest.fn(async (opts: { withCounts?: boolean }) =>
        Ok(opts?.withCounts ? DIMS_WITH_COUNTS : DIMS_BARE)
      ),
      getSkuAttributes: jest.fn(async (sku: string) =>
        sku === 'MISSING'
          ? Err({ kind: 'NotFound', message: `SKU '${sku}' not found.` })
          : Ok(SKU_ATTRS)
      ),
      replaceSkuAttributes: (...args: unknown[]) => replaceMock(...args),
      replaceSkuAttributeDimension: (...args: unknown[]) => replaceDimensionMock(...args),
      findSkuCodesByAttributeFilters: (...args: unknown[]) => findCodesMock(...args),
      getCoverage: jest.fn(async () => Ok(COVERAGE)),
      listAttributeMacroRuleSummaries: jest.fn(async () => Ok(MACRO_SUMMARIES)),
      getAttributeMacroRuleSet: jest.fn(async () => Ok(MACRO_RULE_SET)),
      replaceAttributeMacroRules: (...args: unknown[]) => replaceMacroRulesMock(...args),
      bulkAssign: (...args: unknown[]) => bulkAssignMock(...args),
      createValue: (...args: unknown[]) => createValueMock(...args),
      updateValue: (...args: unknown[]) => updateValueMock(...args),
    },
  };
});

jest.mock('../../../src/services/products/auditLog', () => ({
  auditLog: { record: jest.fn(async () => undefined) },
  createAuditLogger: () => ({ record: jest.fn(async () => undefined) }),
}));

// SKU list route depends on SkuRepository — stub it so unrelated list-route
// tests in the file don't touch Access.
jest.mock('../../../src/repositories/rics/SkuRepository', () => ({
  SkuRepository: {
    findAll: jest.fn(async () => Ok([])),
    findByCode: jest.fn(async () => Ok(null)),
    create: jest.fn(async () => Ok({})),
    update: jest.fn(async () => Ok({})),
    delete: jest.fn(async () => Ok(undefined)),
    countByVendor: jest.fn(async () => Ok(0)),
    countByCategory: jest.fn(async () => Ok(0)),
  },
}));

import app from '../../../src/app';
import { SkuRepository } from '../../../src/repositories/rics/SkuRepository';

beforeEach(() => {
  replaceMock.mockReset();
  replaceDimensionMock.mockReset();
  bulkAssignMock.mockReset();
  findCodesMock.mockReset();
  replaceMacroRulesMock.mockReset();
  createValueMock.mockReset();
  updateValueMock.mockReset();
});

describe('GET /api/v1/products/attributes/dimensions', () => {
  it('returns dims without counts by default', async () => {
    const res = await request(app).get('/api/v1/products/attributes/dimensions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].code).toBe('buyer');
    expect(res.body[0].values[0].descriptionEs).toBe('Zack, Zacarias');
    expect(res.body[0].values[0].skuCount).toBeUndefined();
  });

  it('returns counts when withCounts=true', async () => {
    const res = await request(app).get('/api/v1/products/attributes/dimensions?withCounts=true');
    expect(res.status).toBe(200);
    expect(res.body[0].values[0].skuCount).toBe(50);
  });
});

describe('value admin routes', () => {
  it('creates a value with selection guidance', async () => {
    createValueMock.mockResolvedValue(
      Ok({
        id: 99,
        code: 'espadrille',
        labelEs: 'Espadrille',
        descriptionEs: 'Yute, alpargata; usar para forro de tacón tejido.',
        sortOrder: 10,
        isActive: true,
      }),
    );

    const res = await request(app)
      .post('/api/v1/products/attributes/dimensions/heel_material/values')
      .send({
        code: 'espadrille',
        labelEs: 'Espadrille',
        descriptionEs: ' Yute, alpargata; usar para forro de tacón tejido. ',
        sortOrder: 10,
      });

    expect(res.status).toBe(201);
    expect(createValueMock).toHaveBeenCalledWith(
      'heel_material',
      {
        code: 'espadrille',
        labelEs: 'Espadrille',
        descriptionEs: 'Yute, alpargata; usar para forro de tacón tejido.',
        sortOrder: 10,
      },
    );
    expect(res.body.descriptionEs).toContain('alpargata');
  });

  it('updates and clears value guidance', async () => {
    updateValueMock.mockResolvedValue(
      Ok({
        id: 99,
        code: 'espadrille',
        labelEs: 'Espadrille',
        descriptionEs: null,
        sortOrder: 10,
        isActive: true,
      }),
    );

    const res = await request(app)
      .patch('/api/v1/products/attributes/values/99')
      .send({ descriptionEs: '   ' });

    expect(res.status).toBe(200);
    expect(updateValueMock).toHaveBeenCalledWith(
      99,
      { descriptionEs: null },
    );
    expect(res.body.descriptionEs).toBeNull();
  });
});

describe('GET /api/v1/products/attributes/coverage', () => {
  it('returns per-dim coverage rows', async () => {
    const res = await request(app).get('/api/v1/products/attributes/coverage');
    expect(res.status).toBe(200);
    expect(res.body[0].dimensionCode).toBe('buyer');
    expect(res.body[0].coveragePct).toBe(91.5);
  });
});

describe('GET/PUT /api/v1/products/attributes/macros', () => {
  it('lists macro category mappings', async () => {
    const res = await request(app).get('/api/v1/products/attributes/macros');
    expect(res.status).toBe(200);
    expect(res.body[0].sourceDimensionCode).toBe('color');
    expect(res.body[0].targetDimensionCode).toBe('color_family');
  });

  it('returns the editable rule set for a source-target pair', async () => {
    const res = await request(app).get('/api/v1/products/attributes/macros/color/color_family');
    expect(res.status).toBe(200);
    expect(res.body.rules[0].sourceValueCode).toBe('1');
    expect(res.body.rules[0].targetValueCode).toBe('black');
  });

  it('replaces macro rules', async () => {
    replaceMacroRulesMock.mockResolvedValue(
      Ok({
        sourceDimensionCode: 'color',
        sourceDimensionLabelEs: 'Color',
        targetDimensionCode: 'color_family',
        targetDimensionLabelEs: 'Familia de Color',
        rules: [],
      }),
    );
    const res = await request(app)
      .put('/api/v1/products/attributes/macros/color/color_family')
      .send({ rules: [{ sourceValueCode: '1', targetValueCode: 'black' }] });

    expect(res.status).toBe(200);
    expect(replaceMacroRulesMock).toHaveBeenCalledWith(
      'color',
      'color_family',
      [{ sourceValueCode: '1', targetValueCode: 'black' }],
      expect.any(String),
    );
  });
});

describe('GET /api/v1/products/skus/:code/attributes', () => {
  it('returns uniform by_dimension even for unclassified dims', async () => {
    const res = await request(app).get('/api/v1/products/skus/ZB12345/attributes');
    expect(res.status).toBe(200);
    expect(res.body.skuCode).toBe('ZB12345');
    expect(res.body.byDimension.buyer.values[0].code).toBe('zb');
    expect(res.body.byDimension.discount_type.values).toEqual([]);
  });

  it('returns 404 for an unknown SKU', async () => {
    const res = await request(app).get('/api/v1/products/skus/MISSING/attributes');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/products/skus/:code/attributes', () => {
  it('atomic-replaces operator + excel rows and returns the fresh set', async () => {
    replaceMock.mockResolvedValue(Ok({ previous: [], next: [{ code: 'zb', labelEs: 'Z', assignedBy: 'u', assignedAt: '2026-04-22T00:00:00.000Z' }] }));
    const res = await request(app)
      .put('/api/v1/products/skus/ZB12345/attributes')
      .send({ assignments: [{ dimension_code: 'buyer', value_code: 'zb' }] });
    expect(res.status).toBe(200);
    expect(replaceMock).toHaveBeenCalledWith(
      'ZB12345',
      [{ dimensionCode: 'buyer', valueCode: 'zb' }],
      expect.any(String),
      undefined
    );
  });

  it('422 on malformed assignment row', async () => {
    const res = await request(app)
      .put('/api/v1/products/skus/ZB12345/attributes')
      .send({ assignments: [{ dimension_code: 'buyer' /* no value_code */ }] });
    expect(res.status).toBe(422);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('422 when repo reports a value-belongs-to-wrong-dim violation', async () => {
    replaceMock.mockResolvedValue(
      Err({ kind: 'ConstraintViolation', message: "Value 'pct_50' does not belong to dimension 'buyer'." })
    );
    const res = await request(app)
      .put('/api/v1/products/skus/ZB12345/attributes')
      .send({ assignments: [{ dimension_code: 'buyer', value_code: 'pct_50' }] });
    expect(res.status).toBe(422);
  });

  it('404 when repo reports SKU not found', async () => {
    replaceMock.mockResolvedValue(Err({ kind: 'NotFound', message: 'missing' }));
    const res = await request(app)
      .put('/api/v1/products/skus/MISSING/attributes')
      .send({ assignments: [] });
    expect(res.status).toBe(404);
  });

  it('replaces one dimension from the inline inquiry editor', async () => {
    replaceDimensionMock.mockResolvedValue(
      Ok({
        previous: [{ code: 'old', labelEs: 'Old', assignedBy: 'seed:keyword:x', assignedAt: '2026-04-20T00:00:00.000Z' }],
        next: [{ code: 'blue', labelEs: 'Azul', assignedBy: 'u', assignedAt: '2026-04-22T00:00:00.000Z' }],
      })
    );

    const res = await request(app)
      .put('/api/v1/products/skus/ZB12345/attributes/color')
      .send({ value_codes: ['blue'] });

    expect(res.status).toBe(200);
    expect(replaceDimensionMock).toHaveBeenCalledWith(
      'ZB12345',
      'color',
      ['blue'],
      expect.any(String),
    );
  });

  it('422 on malformed single-dimension value list', async () => {
    const res = await request(app)
      .put('/api/v1/products/skus/ZB12345/attributes/color')
      .send({ value_codes: ['blue', 123] });

    expect(res.status).toBe(422);
    expect(replaceDimensionMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/products/skus (attr.* filter)', () => {
  it('translates attr.<dim>=<value>[,<v>] into an attributesService call', async () => {
    findCodesMock.mockResolvedValue(Ok(new Set(['ZB001'])));
    const res = await request(app).get(
      '/api/v1/products/skus?attr.buyer=zb,ab&attr.discount_type=pct_50'
    );
    expect(res.status).toBe(200);
    expect(findCodesMock).toHaveBeenCalledWith([
      { dimensionCode: 'buyer', valueCodes: ['zb', 'ab'] },
      { dimensionCode: 'discount_type', valueCodes: ['pct_50'] },
    ]);
  });

  it('returns an empty list without a Postgres sentinel when attr filters match no SKUs', async () => {
    findCodesMock.mockResolvedValue(Ok(new Set<string>()));
    (SkuRepository.findAll as jest.Mock).mockClear();

    const res = await request(app).get('/api/v1/products/skus?attr.buyer=missing');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(SkuRepository.findAll).not.toHaveBeenCalled();
  });

  it('returns empty list without invoking attributesService when no attr filters present', async () => {
    const res = await request(app).get('/api/v1/products/skus?vendor=ACME');
    expect(res.status).toBe(200);
    expect(findCodesMock).not.toHaveBeenCalled();
  });
});
