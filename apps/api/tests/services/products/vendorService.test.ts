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
    // Writes now return WriteNotSupported — the MDB endpoint was removed
    // 2026-04-23 and Postgres has no vendor write target yet.
    create: jest.fn(async (input: VendorInput): Promise<Result<Vendor>> => {
      calls.push(`create:${input.code}`);
      return Err({ kind: 'WriteNotSupported', message: 'writes disabled' });
    }),
    update: jest.fn(
      async (code: string, _patch: Partial<VendorInput>): Promise<Result<Vendor>> => {
        calls.push(`update:${code}`);
        return Err({ kind: 'WriteNotSupported', message: 'writes disabled' });
      },
    ),
    delete: jest.fn(async (code: string): Promise<Result<void>> => {
      calls.push(`delete:${code}`);
      return Err({ kind: 'WriteNotSupported', message: 'writes disabled' });
    }),
    findStoreAccounts: jest.fn(async (code: string): Promise<Result<VendorStoreAccount[]>> => {
      calls.push(`findStoreAccounts:${code}`);
      return Ok([]);
    }),
    upsertStoreAccount: jest.fn(
      async (
        code: string,
        storeId: number,
        _accountNo: string,
      ): Promise<Result<VendorStoreAccount>> => {
        calls.push(`upsertStoreAccount:${code}:${storeId}`);
        return Err({ kind: 'WriteNotSupported', message: 'writes disabled' });
      },
    ),
    deleteStoreAccount: jest.fn(async (code: string, storeId: number): Promise<Result<void>> => {
      calls.push(`deleteStoreAccount:${code}:${storeId}`);
      return Err({ kind: 'WriteNotSupported', message: 'writes disabled' });
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

  test('create propagates WriteNotSupported from repo; no audit written', async () => {
    const { repo } = makeMockRepo();
    const { audit, records } = makeMockAudit();
    const svc = createVendorService({ repo: repo as any, audit, actor: 'tester' });
    const result = await svc.create(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('WriteNotSupported');
    // audit only records on success — the write failed, so no log
    expect(records).toHaveLength(0);
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

  test('create with both qualifier fields set passes EDI check then fails at write', async () => {
    // EDI validation passes, so the service calls repo.create — which returns
    // WriteNotSupported. The point of this test is that the service doesn't
    // short-circuit the EDI check when writes are disabled; full validation
    // still runs before reaching the repo layer.
    const { repo } = makeMockRepo();
    const svc = createVendorService({ repo: repo as any, audit: makeMockAudit().audit });
    const result = await svc.create({
      ...VALID_INPUT,
      qualifierId: '01',
      qualifierCode: '025',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('WriteNotSupported');
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  test('update propagates WriteNotSupported from repo; no audit written', async () => {
    const { repo } = makeMockRepo();
    const { audit, records } = makeMockAudit();
    const svc = createVendorService({ repo: repo as any, audit });
    const result = await svc.update('ABCD', { name: 'Renamed' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('WriteNotSupported');
    expect(records).toHaveLength(0);
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

  test('update with qualifierId when existing already has qualifierCode passes EDI check', async () => {
    // EDI check passes (existing has qualifierCode, patch adds qualifierId);
    // the actual update then fails at the repo with WriteNotSupported. This
    // test asserts EDI validation runs before the repo call, not that writes
    // succeed.
    const { repo } = makeMockRepo();
    repo.findByCode = jest.fn(async () =>
      Ok(makeVendor({ qualifierId: null, qualifierCode: '025' })),
    );
    const svc = createVendorService({ repo: repo as any, audit: makeMockAudit().audit });
    const result = await svc.update('ABCD', { qualifierId: '01' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('WriteNotSupported');
    expect(repo.update).toHaveBeenCalled();
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

  test('delete propagates WriteNotSupported from repo when no SKUs block it', async () => {
    // Guard passes (0 SKUs), repo.delete is called, but returns WriteNotSupported.
    const { repo } = makeMockRepo();
    const { audit, records } = makeMockAudit();
    const svc = createVendorService({ repo: repo as any, audit });
    const result = await svc.delete('ABCD');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('WriteNotSupported');
    expect(repo.delete).toHaveBeenCalledWith('ABCD');
    expect(records).toHaveLength(0);
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

  test('upsertStoreAccount propagates WriteNotSupported; no audit written', async () => {
    const { repo } = makeMockRepo();
    const { audit, records } = makeMockAudit();
    const svc = createVendorService({ repo: repo as any, audit });
    const result = await svc.upsertStoreAccount('ABCD', 1, 'ACCT-001');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('WriteNotSupported');
    expect(records).toHaveLength(0);
  });

  test('deleteStoreAccount propagates WriteNotSupported; no audit written', async () => {
    const { repo } = makeMockRepo();
    const { audit, records } = makeMockAudit();
    const svc = createVendorService({ repo: repo as any, audit });
    const result = await svc.deleteStoreAccount('ABCD', 2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('WriteNotSupported');
    expect(records).toHaveLength(0);
  });
});
