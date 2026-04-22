/**
 * Unit tests for createAttributesService — actor threading, audit, bulkAssign.
 */

import { Err, Ok } from '../../../src/repositories/rics/repoResult';
import { createAttributesService } from '../../../src/services/products/attributesService';

function fakeRepo() {
  return {
    listDimensionsWithValues: jest.fn(async () => Ok([])),
    getSkuAttributes: jest.fn(async () => Ok({ skuCode: 'X', byDimension: {} })),
    replaceSkuAttributes: jest.fn(async () => Ok({ previous: [], next: [] })),
    findSkuCodesByAttributeFilters: jest.fn(async () => Ok(new Set<string>())),
    getCoverage: jest.fn(async () => Ok([])),
    bulkAssign: jest.fn(async () => Ok(0)),
  };
}

function fakeAudit() {
  return { record: jest.fn(async () => undefined) };
}

describe('attributesService.setForSku', () => {
  it('passes the configured actor into the repository call', async () => {
    const repo = fakeRepo();
    const audit = fakeAudit();
    const service = createAttributesService({
      actor: 'operator@example',
      audit,
      repo: repo as unknown as typeof import('../../../src/repositories/products/AttributesRepository').AttributesRepository,
    });
    await service.setForSku('ABC', [{ dimensionCode: 'buyer', valueCode: 'zb' }]);
    expect(repo.replaceSkuAttributes).toHaveBeenCalledWith(
      'ABC',
      [{ dimensionCode: 'buyer', valueCode: 'zb' }],
      'operator@example'
    );
  });

  it('writes an audit entry on success with previous + next diff', async () => {
    const repo = fakeRepo();
    repo.replaceSkuAttributes.mockResolvedValueOnce(
      Ok({
        previous: [{ code: 'ab', labelEs: 'AB', assignedBy: 'u1', assignedAt: '2026-04-20T00:00:00.000Z' }],
        next: [{ code: 'zb', labelEs: 'ZB', assignedBy: 'u2', assignedAt: '2026-04-22T00:00:00.000Z' }],
      })
    );
    const audit = fakeAudit();
    const service = createAttributesService({
      actor: 'u2',
      audit,
      repo: repo as unknown as typeof import('../../../src/repositories/products/AttributesRepository').AttributesRepository,
    });
    await service.setForSku('ABC', [{ dimensionCode: 'buyer', valueCode: 'zb' }]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'u2',
        action: 'sku_attributes_set',
        targetTable: 'app.sku_attribute_assignment',
        targetPk: 'ABC',
      })
    );
  });

  it('does not audit on repo failure', async () => {
    const repo = fakeRepo();
    repo.replaceSkuAttributes.mockResolvedValueOnce(Err({ kind: 'NotFound', message: 'missing' }));
    const audit = fakeAudit();
    const service = createAttributesService({
      actor: 'u',
      audit,
      repo: repo as unknown as typeof import('../../../src/repositories/products/AttributesRepository').AttributesRepository,
    });
    const r = await service.setForSku('MISSING', []);
    expect(r.ok).toBe(false);
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('attributesService.bulkAssign', () => {
  it('audits the batch with affected count', async () => {
    const repo = fakeRepo();
    repo.bulkAssign.mockResolvedValueOnce(Ok(42));
    const audit = fakeAudit();
    const service = createAttributesService({
      audit,
      repo: repo as unknown as typeof import('../../../src/repositories/products/AttributesRepository').AttributesRepository,
    });
    const r = await service.bulkAssign({
      skuCodes: ['A', 'B', 'C'],
      dimensionCode: 'buyer',
      valueCodes: ['zb'],
      actor: 'batch-runner',
    });
    expect(r.ok).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'batch-runner',
        action: 'sku_attributes_bulk_assign',
        targetTable: 'app.sku_attribute_assignment',
        targetPk: 'bulk:buyer',
      })
    );
  });

  it('propagates single-value-cap violation from the repo', async () => {
    const repo = fakeRepo();
    repo.bulkAssign.mockResolvedValueOnce(
      Err({ kind: 'ConstraintViolation', message: "Dimension 'buyer' is single-value; received 2 values." })
    );
    const audit = fakeAudit();
    const service = createAttributesService({
      audit,
      repo: repo as unknown as typeof import('../../../src/repositories/products/AttributesRepository').AttributesRepository,
    });
    const r = await service.bulkAssign({
      skuCodes: ['A'],
      dimensionCode: 'buyer',
      valueCodes: ['zb', 'ab'],
      actor: 'x',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('ConstraintViolation');
    expect(audit.record).not.toHaveBeenCalled();
  });
});
