jest.mock('../../../src/db/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../src/services/products/auditLog', () => ({
  auditLog: {
    record: jest.fn(async () => undefined),
  },
}));

import { prisma } from '../../../src/db/prisma';
import { Ok } from '../../../src/repositories/rics/repoResult';
import { matchingSetService } from '../../../src/services/products/matchingSetService';

const SET_ID = '00000000-0000-4000-8000-000000000001';
const SKU_1_ID = '10000000-0000-4000-8000-000000000001';
const SKU_2_ID = '10000000-0000-4000-8000-000000000002';

interface TestSku {
  id: string;
  code: string;
  provisionalCode: string;
}

interface TestSourceRow {
  sku_id: string;
  sku_code: string | null;
  provisional_code: string;
  vendor_id: string | null;
  vendor_sku: string | null;
  color_code: string | null;
  color_attribute_code: string | null;
  color_attribute_label: string | null;
  material_code: string | null;
  material_label: string | null;
  season: string | null;
}

function makeSet(overrides: Record<string, unknown> = {}) {
  return {
    id: SET_ID,
    code: 'MS-TEST',
    displayName: null,
    setTypeCode: 'suit',
    descriptionEs: null,
    vendorId: null,
    vendorStyle: null,
    materialCode: null,
    materialLabel: null,
    sharedColorCode: null,
    sharedColorLabel: null,
    season: null,
    chainId: null,
    sellMode: 'separates',
    planningActive: true,
    notes: null,
    active: true,
    createdBy: 'system',
    updatedBy: 'system',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeTx(args: {
  skus?: TestSku[];
  sourceRows?: TestSourceRow[];
  existingSet?: Record<string, unknown>;
  existingMemberCount?: number;
} = {}) {
  const skus = args.skus ?? [
    { id: SKU_1_ID, code: 'ST100-BKSU', provisionalCode: 'ST100-BKSU' },
  ];
  const sourceRows = args.sourceRows ?? [
    {
      sku_id: SKU_1_ID,
      sku_code: 'ST100-BKSU',
      provisional_code: 'ST100-BKSU',
      vendor_id: 'V001',
      vendor_sku: 'STYLE-PRIMARY',
      color_code: 'BK',
      color_attribute_code: 'bk',
      color_attribute_label: 'Negro',
      material_code: 'su',
      material_label: 'Suede',
      season: 'A',
    },
  ];
  const existingSet = makeSet(args.existingSet);

  const tx = {
    matchingSetType: {
      findUnique: jest.fn(async () => ({ code: 'suit', active: true })),
    },
    matchingSetRole: {
      findUnique: jest.fn(async (query) => ({
        setTypeCode: query.where.setTypeCode_code.setTypeCode,
        code: query.where.setTypeCode_code.code,
        active: true,
      })),
    },
    sku: {
      findFirst: jest.fn(async (query) => {
        const where = query.where;
        const value = where.id
          ?? where.OR?.map((item: { code?: string; provisionalCode?: string }) => item.code ?? item.provisionalCode)
            .find(Boolean);
        return skus.find((sku) => sku.id === value || sku.code === value || sku.provisionalCode === value) ?? null;
      }),
    },
    matchingSet: {
      create: jest.fn(async (query) => makeSet({ id: SET_ID, ...query.data })),
      findUnique: jest.fn(async () => existingSet),
      update: jest.fn(async (query) => ({ ...existingSet, ...query.data })),
    },
    matchingSetMember: {
      create: jest.fn(async (query) => query.data),
      count: jest.fn(async () => args.existingMemberCount ?? 0),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    $queryRawUnsafe: jest.fn(async (_sql: string, skuIds?: string[]) => {
      if (Array.isArray(skuIds)) return sourceRows.filter((row) => skuIds.includes(row.sku_id));
      return [{ code: 'MS-2026-000001' }];
    }),
    $executeRawUnsafe: jest.fn(async () => 1),
  };
  return tx;
}

function installTransaction(tx: ReturnType<typeof makeTx>) {
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback: (txArg: typeof tx) => unknown) => callback(tx));
  jest.spyOn(matchingSetService, 'get').mockResolvedValue(Ok(makeSet() as never));
}

describe('matchingSetService SKU-derived header fields', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('derives supplier, style, color, season, and material from the primary SKU on create', async () => {
    const tx = makeTx();
    installTransaction(tx);

    const result = await matchingSetService.create({
      code: 'MS-PRIMARY',
      setTypeCode: 'suit',
      members: [{ skuCode: 'ST100-BKSU', roleCode: 'jacket', isPrimary: true }],
    }, 'buyer@example.com');

    expect(result.ok).toBe(true);
    expect(tx.matchingSet.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        vendorId: 'V001',
        vendorStyle: 'STYLE-PRIMARY',
        sharedColorCode: 'BK',
        sharedColorLabel: 'Negro',
        season: 'A',
      }),
    }));
    expect(tx.$executeRawUnsafe.mock.calls[0]).toEqual(expect.arrayContaining(['su', 'Suede']));
    expect(tx.$executeRawUnsafe.mock.calls.at(-1)).toEqual(expect.arrayContaining([
      'Suit - V001 - STYLE-PRIMARY - Negro',
    ]));
  });

  it('does not overwrite explicit header values on create', async () => {
    const tx = makeTx();
    installTransaction(tx);

    const result = await matchingSetService.create({
      code: 'MS-EXPLICIT',
      setTypeCode: 'suit',
      vendorId: 'MANU',
      vendorStyle: 'MANUAL-STYLE',
      sharedColorCode: 'NV',
      sharedColorLabel: 'Manual Navy',
      materialCode: 'lt',
      materialLabel: 'Leather',
      season: 'B',
      members: [{ skuCode: 'ST100-BKSU', roleCode: 'jacket', isPrimary: true }],
    }, 'buyer@example.com');

    expect(result.ok).toBe(true);
    expect(tx.matchingSet.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        vendorId: 'MANU',
        vendorStyle: 'MANUAL-STYLE',
        sharedColorCode: 'NV',
        sharedColorLabel: 'Manual Navy',
        season: 'B',
      }),
    }));
    expect(tx.$executeRawUnsafe.mock.calls[0]).toEqual(expect.arrayContaining(['lt', 'Leather']));
  });

  it('leaves conflicting SKU-derived fields blank when no primary SKU is set', async () => {
    const tx = makeTx({
      skus: [
        { id: SKU_1_ID, code: 'ST100-BKSU', provisionalCode: 'ST100-BKSU' },
        { id: SKU_2_ID, code: 'ST200-RDPU', provisionalCode: 'ST200-RDPU' },
      ],
      sourceRows: [
        {
          sku_id: SKU_1_ID,
          sku_code: 'ST100-BKSU',
          provisional_code: 'ST100-BKSU',
          vendor_id: 'V001',
          vendor_sku: 'STYLE-1',
          color_code: 'BK',
          color_attribute_code: 'bk',
          color_attribute_label: 'Negro',
          material_code: 'su',
          material_label: 'Suede',
          season: 'A',
        },
        {
          sku_id: SKU_2_ID,
          sku_code: 'ST200-RDPU',
          provisional_code: 'ST200-RDPU',
          vendor_id: 'V002',
          vendor_sku: 'STYLE-2',
          color_code: 'RD',
          color_attribute_code: 'rd',
          color_attribute_label: 'Rojo',
          material_code: 'pu',
          material_label: 'PU',
          season: 'B',
        },
      ],
    });
    installTransaction(tx);

    const result = await matchingSetService.create({
      code: 'MS-CONFLICT',
      setTypeCode: 'suit',
      members: [
        { skuCode: 'ST100-BKSU', roleCode: 'jacket' },
        { skuCode: 'ST200-RDPU', roleCode: 'pant' },
      ],
    }, 'buyer@example.com');

    expect(result.ok).toBe(true);
    expect(tx.matchingSet.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        vendorId: null,
        vendorStyle: null,
        sharedColorCode: null,
        sharedColorLabel: null,
        season: null,
      }),
    }));
    expect(tx.$executeRawUnsafe.mock.calls[0]).toEqual(expect.arrayContaining([null, null]));
  });

  it('derives blank header fields when adding the first SKU to an empty set', async () => {
    const tx = makeTx({ existingSet: { displayName: null }, existingMemberCount: 0 });
    installTransaction(tx);

    const result = await matchingSetService.addMember(SET_ID, {
      skuCode: 'ST100-BKSU',
      roleCode: 'jacket',
      isPrimary: true,
    }, 'buyer@example.com');

    expect(result.ok).toBe(true);
    expect(tx.matchingSet.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: SET_ID },
      data: expect.objectContaining({
        vendorId: 'V001',
        vendorStyle: 'STYLE-PRIMARY',
        sharedColorCode: 'BK',
        sharedColorLabel: 'Negro',
        materialCode: 'su',
        materialLabel: 'Suede',
        season: 'A',
      }),
    }));
    expect(tx.$executeRawUnsafe.mock.calls.at(-1)).toEqual(expect.arrayContaining([
      'Suit - V001 - STYLE-PRIMARY - Negro',
    ]));
  });

  it('does not refresh header fields when adding later SKUs', async () => {
    const tx = makeTx({ existingMemberCount: 1 });
    installTransaction(tx);

    const result = await matchingSetService.addMember(SET_ID, {
      skuCode: 'ST100-BKSU',
      roleCode: 'pant',
    }, 'buyer@example.com');

    expect(result.ok).toBe(true);
    expect(tx.matchingSet.update).toHaveBeenCalledWith({
      where: { id: SET_ID },
      data: { updatedBy: 'buyer@example.com' },
    });
  });
});
