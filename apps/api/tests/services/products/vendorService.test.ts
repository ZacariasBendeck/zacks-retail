/**
 * Unit tests for vendorService — the Phase 1 Vendor orchestration layer.
 *
 * Covers the service-level concerns (not the repository): EDI both-or-neither
 * validation, delete guard against SKU references, audit-log invocation, and
 * Result bubbling.
 *
 * The VendorRepository is injected via the `createVendorService` factory so
 * we don't need jest.mock module swap.
 */

import { Err, Ok, type Result } from '../../../src/repositories/rics/repoResult';
import { createVendorService } from '../../../src/services/products/vendorService';
import type { AuditLogger } from '../../../src/services/products/auditLog';
import type {
  Vendor,
  VendorInput,
  VendorStoreAccount,
} from '../../../src/repositories/rics/VendorRepository';

function makeVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    code: 'ABCD',
    name: 'ACME',
    mailName: 'ACME Inc.',
    addr1: null,
    addr2: null,
    city: null,
    state: null,
    zip: null,
    phone: null,
    fax: null,
    contact: null,
    terms: null,
    shipInst: null,
    comment: null,
    manuCode: null,
    manuName: null,
    qualifierId: null,
    qualifierCode: null,
    colorCode: false,
    longComment: null,
    email: null,
    dateLastChanged: null,
    ...overrides,
  };
}

function makeMockRepo() {
  const calls: string[] = [];
  const repo = {
    findAll: jest.fn(async (): Promise<Result<Vendor[]>> => {
      calls.push('findAll');
      return Ok([makeVendor()]);
    }),
    findByCode: jest.fn(async (code: string): Promise<Result<Vendor>> => {
      calls.push(`findByCode:${code}`);
      return code === 'ABCD' ? Ok(makeVendor()) : Err({ kind: 'NotFound', message: 'missing' });
    }),
    create: jest.fn(async (input: VendorInput): Promise<Result<Vendor>> => {
      calls.push(`create:${input.code}`);
      return Ok(makeVendor({ code: input.code, name: input.name, mailName: input.mailName }));
    }),
    update: jest.fn(
      async (code: string, _patch: Partial<VendorInput>): Promise<Result<Vendor>> => {
        calls.push(`update:${code}`);
        return Ok(makeVendor({ code }));
      },
    ),
    delete: jest.fn(async (code: string): Promise<Result<void>> => {
      calls.push(`delete:${code}`);
      return Ok(undefined);
    }),
    findStoreAccounts: jest.fn(async (code: string): Promise<Result<VendorStoreAccount[]>> => {
      calls.push(`findStoreAccounts:${code}`);
      return Ok([]);
    }),
    upsertStoreAccount: jest.fn(
      async (
        code: string,
        storeId: number,
        accountNo: string,
      ): Promise<Result<VendorStoreAccount>> => {
        calls.push(`upsertStoreAccount:${code}:${storeId}`);
        return Ok({ code, storeId, accountNo, dateLastChanged: null });
      },
    ),
    deleteStoreAccount: jest.fn(async (code: string, storeId: number): Promise<Result<void>> => {
      calls.push(`deleteStoreAccount:${code}:${storeId}`);
      return Ok(undefined);
    }),
    countSkusUsingVendor: jest.fn(async (_code: string): Promise<Result<number>> => {
      calls.push('countSkusUsingVendor');
      return Ok(0);
    }),
    countSkusPerVendor: jest.fn(async (): Promise<Result<Record<string, number>>> => {
      calls.push('countSkusPerVendor');
      return Ok({});
    }),
  };
  return { repo, calls };
}

function makeMockAudit() {
  const records: any[] = [];
  const audit: AuditLogger = { record: jest.fn(async (r) => void records.push(r)) };
  return { audit, records };
}

const VALID_INPUT: VendorInput = {
  code: 'ABCD',
  name: 'ACME',
  mailName: 'ACME Inc.',
};

describe('vendorService', () => {
  test('list passes through repo.findAll', async () => {
    const { repo } = makeMockRepo();
    const { audit } = makeMockAudit();
    const svc = createVendorService({ repo: repo as any, audit });
    const result = await svc.list();
    expect(result.ok).toBe(true);
    expect(repo.findAll).toHaveBeenCalledTimes(1);
  });

  test('get passes through repo.findByCode', async () => {
    const { repo } = makeMockRepo();
    const { audit } = makeMockAudit();
    const svc = createVendorService({ repo: repo as any, audit });
    const result = await svc.get('ABCD');
    expect(result.ok).toBe(true);
    expect(repo.findByCode).toHaveBeenCalledWith('ABCD');
  });

  test('create happy path writes audit log', async () => {
    const { repo } = makeMockRepo();
    const { audit, records } = makeMockAudit();
    const svc = createVendorService({ repo: repo as any, audit, actor: 'tester' });
    const result = await svc.create(VALID_INPUT);
    expect(result.ok).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      actor: 'tester',
      action: 'CREATE',
      targetTable: 'Vendor Master',
      targetPk: 'ABCD',
    });
  });

  test('create with only qualifierId set returns ConstraintViolation', async () => {
    const { repo } = makeMockRepo();
    const { audit, records } = makeMockAudit();
    const svc = createVendorService({ repo: repo as any, audit });
    const result = await svc.create({ ...VALID_INPUT, qualifierId: '01', qualifierCode: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ConstraintViolation');
    expect(repo.create).not.toHaveBeenCalled();
    expect(records).toHaveLength(0);
  });

  test('create with only qualifierCode set returns ConstraintViolation', async () => {
    const { repo } = makeMockRepo();
    const svc = createVendorService({ repo: repo as any, audit: makeMockAudit().audit });
    const result = await svc.create({ ...VALID_INPUT, qualifierId: null, qualifierCode: '025' });
    expect(result.ok).toBe(false);
    expect(repo.create).not.toHaveBeenCalled();
  });

  test('create with both qualifier fields set passes', async () => {
    const { repo } = makeMockRepo();
    const svc = createVendorService({ repo: repo as any, audit: makeMockAudit().audit });
    const result = await svc.create({
      ...VALID_INPUT,
      qualifierId: '01',
      qualifierCode: '025',
    });
    expect(result.ok).toBe(true);
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  test('update writes audit log on success', async () => {
    const { repo } = makeMockRepo();
    const { audit, records } = makeMockAudit();
    const svc = createVendorService({ repo: repo as any, audit });
    await svc.update('ABCD', { name: 'Renamed' });
    expect(records).toHaveLength(1);
    expect(records[0].action).toBe('UPDATE');
  });

  test('update with qualifierId but no qualifierCode (existing has neither) fails EDI', async () => {
    const { repo } = makeMockRepo();
    repo.findByCode = jest.fn(async () =>
      Ok(makeVendor({ qualifierId: null, qualifierCode: null })),
    );
    const svc = createVendorService({ repo: repo as any, audit: makeMockAudit().audit });
    const result = await svc.update('ABCD', { qualifierId: '01' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ConstraintViolation');
  });

  test('update with qualifierId when existing already has qualifierCode passes', async () => {
    const { repo } = makeMockRepo();
    repo.findByCode = jest.fn(async () =>
      Ok(makeVendor({ qualifierId: null, qualifierCode: '025' })),
    );
    const svc = createVendorService({ repo: repo as any, audit: makeMockAudit().audit });
    const result = await svc.update('ABCD', { qualifierId: '01' });
    expect(result.ok).toBe(true);
  });

  test('delete blocks when SKUs reference the vendor', async () => {
    const { repo } = makeMockRepo();
    repo.countSkusUsingVendor = jest.fn(async () => Ok(3));
    const svc = createVendorService({ repo: repo as any, audit: makeMockAudit().audit });
    const result = await svc.delete('ABCD');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('ConstraintViolation');
      expect(result.error.message).toMatch(/3 SKU/);
    }
    expect(repo.delete).not.toHaveBeenCalled();
  });

  test('delete proceeds and audits when no SKUs reference the vendor', async () => {
    const { repo } = makeMockRepo();
    const { audit, records } = makeMockAudit();
    const svc = createVendorService({ repo: repo as any, audit });
    const result = await svc.delete('ABCD');
    expect(result.ok).toBe(true);
    expect(repo.delete).toHaveBeenCalledWith('ABCD');
    expect(records).toHaveLength(1);
    expect(records[0].action).toBe('DELETE');
  });

  test('delete propagates AccessConnectionError from count', async () => {
    const { repo } = makeMockRepo();
    repo.countSkusUsingVendor = jest.fn(async () =>
      Err({ kind: 'AccessConnectionError', message: 'MDB locked' }),
    );
    const svc = createVendorService({ repo: repo as any, audit: makeMockAudit().audit });
    const result = await svc.delete('ABCD');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('AccessConnectionError');
  });

  test('upsertStoreAccount audits on success', async () => {
    const { repo } = makeMockRepo();
    const { audit, records } = makeMockAudit();
    const svc = createVendorService({ repo: repo as any, audit });
    await svc.upsertStoreAccount('ABCD', 1, 'ACCT-001');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      action: 'UPSERT_STORE_ACCOUNT',
      targetTable: 'Vendor Accounts',
      targetPk: 'ABCD:1',
    });
  });

  test('deleteStoreAccount audits on success', async () => {
    const { repo } = makeMockRepo();
    const { audit, records } = makeMockAudit();
    const svc = createVendorService({ repo: repo as any, audit });
    await svc.deleteStoreAccount('ABCD', 2);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      action: 'DELETE_STORE_ACCOUNT',
      targetPk: 'ABCD:2',
    });
  });
});
