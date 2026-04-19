/**
 * Unit tests for skuService — Phase 1 SKU orchestration layer.
 *
 * Covers service-level concerns (validation, rename guard, audit logging).
 * Repository is injected via factory so no MDB is opened.
 */

import { Err, Ok, type Result } from '../../../src/repositories/rics/repoResult';
import { createSkuService } from '../../../src/services/products/skuService';
import type { AuditLogger } from '../../../src/services/products/auditLog';
import type { Sku, SkuInput } from '../../../src/repositories/rics/SkuRepository';

function makeSku(overrides: Partial<Sku> = {}): Sku {
  return {
    code: 'ABC001',
    vendorSku: null,
    category: 100,
    vendor: 'ACME',
    sizeType: null,
    description: 'Widget',
    styleColor: null,
    season: null,
    location: null,
    listPrice: null,
    retailPrice: 19.99,
    mdPrice1: null,
    mdPrice2: null,
    currentPriceSlot: 'RETAIL',
    currentCost: null,
    oversizeColumn: null,
    oversizeAmount: null,
    perks: null,
    manufacturer: null,
    labelCode: null,
    colorCode: null,
    comment: null,
    groupCode: null,
    keywords: [],
    pictureFileName: null,
    coupon: false,
    lastPriceChange: null,
    status: null,
    dateLastChanged: null,
    orderMultiple: null,
    orderUom: null,
    longColor: null,
    boldDesc: null,
    paraDesc: null,
    catalogSku: null,
    bulletText: [],
    pictureName01: null,
    pictureName02: null,
    sizeText: null,
    webFileName: null,
    ...overrides,
  };
}

function makeMockRepo() {
  return {
    findAll: jest.fn(async (): Promise<Result<Sku[]>> => Ok([makeSku()])),
    findByCode: jest.fn(async (code: string): Promise<Result<Sku>> =>
      code === 'ABC001' ? Ok(makeSku()) : Err({ kind: 'NotFound', message: 'missing' }),
    ),
    create: jest.fn(async (input: SkuInput): Promise<Result<Sku>> =>
      Ok(makeSku({ code: input.code, description: input.description })),
    ),
    update: jest.fn(async (code: string): Promise<Result<Sku>> => Ok(makeSku({ code }))),
    delete: jest.fn(async (): Promise<Result<void>> => Ok(undefined)),
    countByVendor: jest.fn(async (): Promise<Result<number>> => Ok(0)),
    countByCategory: jest.fn(async (): Promise<Result<number>> => Ok(0)),
  };
}

function makeMockAudit() {
  const records: any[] = [];
  const audit: AuditLogger = { record: jest.fn(async (r) => void records.push(r)) };
  return { audit, records };
}

const VALID: SkuInput = {
  code: 'ABC001',
  category: 100,
  vendor: 'ACME',
  description: 'Widget',
  retailPrice: 19.99,
};

describe('skuService', () => {
  test('list passes through repo.findAll', async () => {
    const repo = makeMockRepo();
    const { audit } = makeMockAudit();
    const svc = createSkuService({ repo: repo as any, audit });
    const result = await svc.list();
    expect(result.ok).toBe(true);
    expect(repo.findAll).toHaveBeenCalledTimes(1);
  });

  test('get passes through repo.findByCode', async () => {
    const repo = makeMockRepo();
    const svc = createSkuService({ repo: repo as any, audit: makeMockAudit().audit });
    const result = await svc.get('ABC001');
    expect(result.ok).toBe(true);
    expect(repo.findByCode).toHaveBeenCalledWith('ABC001');
  });

  test('create rejects empty code with 422', async () => {
    const repo = makeMockRepo();
    const svc = createSkuService({ repo: repo as any, audit: makeMockAudit().audit });
    const result = await svc.create({ ...VALID, code: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ConstraintViolation');
    expect(repo.create).not.toHaveBeenCalled();
  });

  test('create rejects code longer than 15 chars', async () => {
    const repo = makeMockRepo();
    const svc = createSkuService({ repo: repo as any, audit: makeMockAudit().audit });
    const result = await svc.create({ ...VALID, code: 'A'.repeat(16) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/max length is 15/);
  });

  test('create rejects missing vendor', async () => {
    const repo = makeMockRepo();
    const svc = createSkuService({ repo: repo as any, audit: makeMockAudit().audit });
    const result = await svc.create({ ...VALID, vendor: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/Vendor is required/);
  });

  test('create rejects missing category', async () => {
    const repo = makeMockRepo();
    const svc = createSkuService({ repo: repo as any, audit: makeMockAudit().audit });
    const result = await svc.create({ ...VALID, category: null as any });
    expect(result.ok).toBe(false);
  });

  test('create rejects negative retail price', async () => {
    const repo = makeMockRepo();
    const svc = createSkuService({ repo: repo as any, audit: makeMockAudit().audit });
    const result = await svc.create({ ...VALID, retailPrice: -1 });
    expect(result.ok).toBe(false);
  });

  test('create happy path audits', async () => {
    const repo = makeMockRepo();
    const { audit, records } = makeMockAudit();
    const svc = createSkuService({ repo: repo as any, audit, actor: 'tester' });
    const result = await svc.create(VALID);
    expect(result.ok).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      actor: 'tester',
      action: 'CREATE',
      targetTable: 'InventoryMaster',
      targetPk: 'ABC001',
    });
  });

  test('update rejects body with code change (rename guard)', async () => {
    const repo = makeMockRepo();
    const svc = createSkuService({ repo: repo as any, audit: makeMockAudit().audit });
    const result = await svc.update('ABC001', { code: 'RENAMED' } as any);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/cannot be renamed/);
    expect(repo.update).not.toHaveBeenCalled();
  });

  test('update happy path audits without re-including code', async () => {
    const repo = makeMockRepo();
    const { audit, records } = makeMockAudit();
    const svc = createSkuService({ repo: repo as any, audit });
    const result = await svc.update('ABC001', { description: 'Updated' } as any);
    expect(result.ok).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0].action).toBe('UPDATE');
    expect(repo.update).toHaveBeenCalledWith('ABC001', { description: 'Updated' });
  });

  test('delete happy path audits', async () => {
    const repo = makeMockRepo();
    const { audit, records } = makeMockAudit();
    const svc = createSkuService({ repo: repo as any, audit });
    const result = await svc.delete('ABC001');
    expect(result.ok).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ action: 'DELETE', targetTable: 'InventoryMaster' });
  });

  test('delete propagates NotFound', async () => {
    const repo = makeMockRepo();
    repo.delete = jest.fn(async () => Err({ kind: 'NotFound', message: 'missing' }));
    const { audit, records } = makeMockAudit();
    const svc = createSkuService({ repo: repo as any, audit });
    const result = await svc.delete('MISSING');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NotFound');
    expect(records).toHaveLength(0);
  });

  test('countByVendor passes through', async () => {
    const repo = makeMockRepo();
    repo.countByVendor = jest.fn(async () => Ok(42));
    const svc = createSkuService({ repo: repo as any, audit: makeMockAudit().audit });
    const result = await svc.countByVendor('ACME');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });
});
