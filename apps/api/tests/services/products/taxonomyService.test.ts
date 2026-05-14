/**
 * Unit tests for the products taxonomy service.
 *
 * The Phase 1 taxonomy service is a thin pass-through over the per-entity RICS
 * repositories. These tests cover:
 *  - that every entity is reachable through `taxonomyService`
 *  - that Result<T, RepoError> values bubble up unchanged (no accidental re-wrap)
 *  - that nrf-codes exposes the `lookup` helper shape used by the route layer
 *
 * Repository calls are mocked — we never touch a real MDB file here.
 */

import { Ok, Err } from '../../../src/repositories/rics/repoResult';

// Mock every repo module BEFORE importing the service. The paths must match
// what taxonomyService imports exactly so jest module swap catches them.
jest.mock('../../../src/repositories/rics/DepartmentRepository', () => ({
  DepartmentRepository: {
    list: jest.fn(async () => Ok([{ number: 1, description: 'Dept 1', begCateg: 1, endCateg: 10, dateLastChanged: null, skuCount: 0 }])),
    getByNumber: jest.fn(async (n: number) =>
      n === 1
        ? Ok({ number: 1, description: 'Dept 1', begCateg: 1, endCateg: 10, dateLastChanged: null, skuCount: 0 })
        : Err({ kind: 'NotFound', message: `Department ${n} not found.` }),
    ),
    create: jest.fn(async (input: { number: number; description: string }) =>
      Ok({ number: input.number, description: input.description, begCateg: 1, endCateg: 10, dateLastChanged: null, skuCount: 0 }),
    ),
    update: jest.fn(async () =>
      Ok({ number: 1, description: 'Updated', begCateg: 1, endCateg: 10, dateLastChanged: null, skuCount: 0 }),
    ),
    delete: jest.fn(async () => Ok(undefined)),
  },
}));

jest.mock('../../../src/repositories/rics/CategoryRepository', () => ({
  CategoryRepository: {
    list: jest.fn(async () => Ok([])),
    getByNumber: jest.fn(async () => Err({ kind: 'NotFound', message: 'not found' })),
    create: jest.fn(async () => Ok({ number: 1, description: 'x', dateLastChanged: null, skuCount: 0 })),
    update: jest.fn(async () => Ok({ number: 1, description: 'x', dateLastChanged: null, skuCount: 0 })),
    bulkUpdateAssignments: jest.fn(async () => Ok({ updatedCount: 1, categories: [] })),
    delete: jest.fn(async () => Ok(undefined)),
    listBuyerOptions: jest.fn(async () => Ok([])),
  },
}));

jest.mock('../../../src/repositories/rics/GroupRepository', () => ({
  GroupRepository: {
    list: jest.fn(async () => Ok([])),
    getByCode: jest.fn(async () => Err({ kind: 'NotFound', message: 'not found' })),
    create: jest.fn(async () => Ok({ code: 'ABC', description: 'x', dateLastChanged: null, skuCount: 0 })),
    update: jest.fn(async () => Ok({ code: 'ABC', description: 'x', dateLastChanged: null, skuCount: 0 })),
    delete: jest.fn(async () => Ok(undefined)),
  },
}));

jest.mock('../../../src/repositories/rics/KeywordRepository', () => ({
  KeywordRepository: {
    list: jest.fn(async () => Ok([])),
    getByKeyword: jest.fn(async () => Err({ kind: 'NotFound', message: 'not found' })),
    create: jest.fn(async () => Ok({ keyword: 'ZTEST1', description: 'x', dateLastChanged: null, skuCount: 0 })),
    update: jest.fn(async () => Ok({ keyword: 'ZTEST1', description: 'x', dateLastChanged: null, skuCount: 0 })),
    delete: jest.fn(async () => Ok(undefined)),
  },
}));

jest.mock('../../../src/repositories/rics/NrfCodeRepository', () => ({
  NrfCodeRepository: {
    listForSizeType: jest.fn(async () => Ok([])),
    lookup: jest.fn(async (params: unknown) => Ok([{ ...params, nrfCode: 12345 } as any])),
  },
}));

jest.mock('../../../src/repositories/rics/PromotionCodeRepository', () => ({
  PromotionCodeRepository: {
    list: jest.fn(async () => Ok([])),
    getByCode: jest.fn(async () => Err({ kind: 'NotFound', message: 'not found' })),
    create: jest.fn(async () =>
      Ok({ code: 'PROMO1', description: 'x', date: null, pieces: null, cost: null, dateLastChanged: null }),
    ),
    update: jest.fn(async () =>
      Ok({ code: 'PROMO1', description: 'x', date: null, pieces: null, cost: null, dateLastChanged: null }),
    ),
    delete: jest.fn(async () => Ok(undefined)),
  },
}));

jest.mock('../../../src/repositories/rics/ReturnCodeRepository', () => ({
  ReturnCodeRepository: {
    list: jest.fn(async () => Ok([])),
    getByCode: jest.fn(async () => Err({ kind: 'NotFound', message: 'not found' })),
    create: jest.fn(async () => Ok({ code: 1, description: 'x', trackable: true, dateLastChanged: null })),
    update: jest.fn(async () => Ok({ code: 1, description: 'x', trackable: true, dateLastChanged: null })),
    delete: jest.fn(async () => Ok(undefined)),
  },
}));

jest.mock('../../../src/repositories/rics/SeasonRepository', () => ({
  SeasonRepository: {
    list: jest.fn(async () => Ok([{ code: 'A', description: null, skuCount: 42 }])),
    getByCode: jest.fn(async (code: string) =>
      code === 'A'
        ? Ok({ code: 'A', description: null, skuCount: 42 })
        : Err({ kind: 'NotFound', message: `Season '${code}' not found.` }),
    ),
    create: jest.fn(async () => Err({ kind: 'AccessConnectionError', message: 'Season master not writable' })),
    update: jest.fn(async () => Err({ kind: 'AccessConnectionError', message: 'Season master not writable' })),
    delete: jest.fn(async () => Err({ kind: 'AccessConnectionError', message: 'Season master not writable' })),
  },
}));

jest.mock('../../../src/repositories/rics/SectorRepository', () => ({
  SectorRepository: {
    list: jest.fn(async () => Ok([])),
    getByNumber: jest.fn(async () => Err({ kind: 'NotFound', message: 'not found' })),
    create: jest.fn(async (input: { number: number; description: string }) =>
      Ok({
        number: input.number,
        description: input.description,
        begDept: 1,
        endDept: 2,
        dateLastChanged: null,
        skuCount: 0,
      }),
    ),
    update: jest.fn(async () =>
      Ok({ number: 1, description: 'x', begDept: 1, endDept: 2, dateLastChanged: null, skuCount: 0 }),
    ),
    delete: jest.fn(async () => Ok(undefined)),
  },
}));

jest.mock('../../../src/repositories/rics/SizeTypeRepository', () => ({
  SizeTypeRepository: {
    list: jest.fn(async () => Ok([])),
    getByCode: jest.fn(async () => Err({ kind: 'NotFound', message: 'not found' })),
    create: jest.fn(async () =>
      Ok({
        code: 1,
        description: 'st',
        columnDescription: 'SIZE',
        rowDescription: 'WDT',
        tableType: null,
        columns: ['7', '8'],
        rows: ['M'],
        maxColumns: 2,
        maxRows: 1,
        dateLastChanged: null,
        skuCount: 0,
      }),
    ),
    update: jest.fn(async () =>
      Ok({
        code: 1,
        description: 'st',
        columnDescription: 'SIZE',
        rowDescription: 'WDT',
        tableType: null,
        columns: ['7', '8', '9'],
        rows: ['M'],
        maxColumns: 3,
        maxRows: 1,
        dateLastChanged: null,
        skuCount: 0,
      }),
    ),
    delete: jest.fn(async () => Ok(undefined)),
  },
}));

import { taxonomyService } from '../../../src/services/products/taxonomyService';

describe('taxonomyService', () => {
  it('exposes every taxonomy entity', () => {
    expect(taxonomyService.departments).toBeDefined();
    expect(taxonomyService.categories).toBeDefined();
    expect(taxonomyService.groups).toBeDefined();
    expect(taxonomyService.keywords).toBeDefined();
    expect(taxonomyService.seasons).toBeDefined();
    expect(taxonomyService.sectors).toBeDefined();
    expect(taxonomyService.returnCodes).toBeDefined();
    expect(taxonomyService.promotionCodes).toBeDefined();
    expect(taxonomyService.sizeTypes).toBeDefined();
    expect(taxonomyService.nrfCodes).toBeDefined();
  });

  describe('departments', () => {
    it('list returns Ok with an array', async () => {
      const result = await taxonomyService.departments.list();
      expect(result.ok).toBe(true);
      if (result.ok) expect(Array.isArray(result.value)).toBe(true);
    });

    it('getByNumber returns NotFound for missing', async () => {
      const result = await taxonomyService.departments.getByNumber(9999);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('NotFound');
    });

    it('create passes the input through to the repo', async () => {
      const result = await taxonomyService.departments.create({
        number: 42,
        description: 'ZTEST_DEPT',
        begCateg: 100,
        endCateg: 110,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.number).toBe(42);
    });
  });

  describe('seasons (read-only)', () => {
    it('rejects create with AccessConnectionError (RISEMF not writable)', async () => {
      const result = await taxonomyService.seasons.create({
        code: 'X',
        description: 'test',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('AccessConnectionError');
    });

    it('list returns Season rows with skuCount', async () => {
      const result = await taxonomyService.seasons.list();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].code).toBe('A');
        expect(result.value[0].skuCount).toBe(42);
      }
    });
  });

  describe('nrfCodes', () => {
    it('lookup filters by sizeTypeCode + rowLabel + columnPosition', async () => {
      const result = await taxonomyService.nrfCodes.lookup({
        sizeTypeCode: 10,
        rowLabel: 1,
        columnPosition: 3,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]).toMatchObject({
          sizeTypeCode: 10,
          rowLabel: 1,
          columnPosition: 3,
          nrfCode: 12345,
        });
      }
    });
  });

  describe('sizeTypes', () => {
    it('create returns a fully-hydrated SizeType', async () => {
      const result = await taxonomyService.sizeTypes.create({
        code: 1,
        description: 'ZTEST_SIZETYPE',
        columnDescription: 'SIZE',
        rowDescription: 'WDT',
        columns: ['7', '8'],
        rows: ['M'],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.columns).toEqual(['7', '8']);
        expect(result.value.rows).toEqual(['M']);
        expect(result.value.maxColumns).toBe(2);
      }
    });
  });
});
