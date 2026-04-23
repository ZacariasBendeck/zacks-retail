/**
 * VendorRepository tests — read-only projection over rics_mirror.vendor_master
 * (and vendor_accounts, inventory_master for counts). The MDB write path was
 * removed on 2026-04-23; all write methods now return WriteNotSupported.
 *
 * Prisma is mocked so this suite runs without a real Postgres connection.
 */

jest.mock('../../../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

import { prisma } from '../../../src/db/prisma';
import { VendorRepository } from '../../../src/repositories/rics/VendorRepository';

const mockQuery = prisma.$queryRawUnsafe as jest.MockedFunction<
  typeof prisma.$queryRawUnsafe
>;

const ROW_1 = {
  code: '03EV',
  short_name: '03 EVERLY',
  mail_name: '03 EVERLY',
  addr1: '1001 Crocker Street#2',
  addr2: null,
  city: 'Los Angeles',
  state: 'CA',
  zip: '90021',
  phone: '213-765-5333',
  fax: '213-765-718',
  contact: null,
  terms: null,
  ship_inst: null,
  comment: null,
  manu_code: null,
  manu_name: null,
  qualifier_id: null,
  qualifier_code: null,
  color_code: false,
  long_comment: null,
  e_mail: 'info@03everly.com',
  date_last_changed: new Date('2010-11-19T07:36:00Z'),
};

const ROW_2 = {
  ...ROW_1,
  code: '138I',
  short_name: '138 INTERNAT',
  mail_name: '138 INTERNATIONAL',
  addr1: null,
  city: 'MIAMI',
  state: null,
  zip: null,
  phone: null,
  e_mail: null,
  date_last_changed: new Date('2002-09-20T13:35:30Z'),
};

beforeEach(() => {
  mockQuery.mockReset();
});

// ────────────── Reads ──────────────

describe('VendorRepository.findAll', () => {
  it('pulls the whole vendor catalog when no filter is given', async () => {
    mockQuery.mockResolvedValueOnce([ROW_1, ROW_2] as never);

    const result = await VendorRepository.findAll();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    expect(result.value[0].code).toBe('03EV');
    expect(result.value[0].name).toBe('03 EVERLY');
    expect(result.value[0].city).toBe('Los Angeles');

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/FROM rics_mirror\.vendor_master/);
    expect(sql).toMatch(/ORDER BY code/);
  });

  it('applies an LIMIT when passed', async () => {
    mockQuery.mockResolvedValueOnce([ROW_1] as never);

    await VendorRepository.findAll({ limit: 5 });
    const call = mockQuery.mock.calls[0];
    expect(call[0]).toMatch(/LIMIT \$1/);
    expect(call[1]).toBe(5);
  });

  it('runs a case-insensitive LIKE filter across code/short_name/mail_name/manu_name', async () => {
    mockQuery.mockResolvedValueOnce([ROW_1] as never);

    const result = await VendorRepository.findAll({ q: 'Everly' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);

    const [sql, needle, limit] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/LOWER\(code\) LIKE \$1/);
    expect(sql).toMatch(/LOWER\(COALESCE\(short_name,''\)\) LIKE \$1/);
    expect(sql).toMatch(/LOWER\(COALESCE\(mail_name,''\)\)  LIKE \$1/);
    expect(sql).toMatch(/LOWER\(COALESCE\(manu_name,''\)\)  LIKE \$1/);
    expect(needle).toBe('%everly%');
    expect(limit).toBe(100); // default when q is set
  });

  it('returns AccessConnectionError when Postgres query throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const result = await VendorRepository.findAll();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('AccessConnectionError');
    expect(result.error.message).toMatch(/connection refused/);
  });
});

describe('VendorRepository.findByCode', () => {
  it('returns the vendor when Postgres has the code', async () => {
    mockQuery.mockResolvedValueOnce([ROW_1] as never);

    const result = await VendorRepository.findByCode('03EV');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.code).toBe('03EV');
    expect(result.value.email).toBe('info@03everly.com');

    const [sql, code] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/WHERE UPPER\(code\) = \$1/);
    expect(code).toBe('03EV');
  });

  it('normalizes lowercase codes to uppercase before querying', async () => {
    mockQuery.mockResolvedValueOnce([] as never);

    await VendorRepository.findByCode('03ev');
    const [, code] = mockQuery.mock.calls[0];
    expect(code).toBe('03EV');
  });

  it('returns NotFound for missing codes', async () => {
    mockQuery.mockResolvedValueOnce([] as never);

    const result = await VendorRepository.findByCode('ZZNOPE');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NotFound');
  });
});

describe('VendorRepository.findStoreAccounts', () => {
  it('pulls rows from rics_mirror.vendor_accounts', async () => {
    mockQuery.mockResolvedValueOnce([
      { code: '138I', store: 1, account: '67', date_last_changed: new Date('2002-09-20Z') },
      { code: '138I', store: 2, account: '67', date_last_changed: new Date('2002-09-20Z') },
    ] as never);

    const result = await VendorRepository.findStoreAccounts('138I');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    expect(result.value[0].storeId).toBe(1);
    expect(result.value[1].storeId).toBe(2);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/FROM rics_mirror\.vendor_accounts/);
  });
});

describe('VendorRepository.countSkusUsingVendor', () => {
  it('counts SKUs with matching vendor (case-insensitive)', async () => {
    mockQuery.mockResolvedValueOnce([{ n: 42n }] as never);

    const result = await VendorRepository.countSkusUsingVendor('03EV');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(42);

    const [sql, code] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/FROM rics_mirror\.inventory_master/);
    expect(sql).toMatch(/UPPER\(vendor\) = \$1/);
    expect(code).toBe('03EV');
  });
});

describe('VendorRepository.countSkusPerVendor', () => {
  it('returns a per-vendor code→count map with uppercased keys', async () => {
    mockQuery.mockResolvedValueOnce([
      { vendor: 'GRAN', n: 7079n },
      { vendor: 'kyiw', n: 4458n }, // lowercase in source — should be uppercased
      { vendor: null, n: 999n }, // should be filtered out
    ] as never);

    const result = await VendorRepository.countSkusPerVendor();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      GRAN: 7079,
      KYIW: 4458,
    });

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/GROUP BY vendor/);
  });
});

describe('VendorRepository.warmup', () => {
  it('is a no-op (no queries issued)', async () => {
    await expect(VendorRepository.warmup()).resolves.toBeUndefined();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

// ────────────── Writes — all disabled ──────────────

describe('VendorRepository writes are disabled (WriteNotSupported)', () => {
  it('create returns WriteNotSupported without touching Postgres', async () => {
    const result = await VendorRepository.create({
      code: 'ZTST',
      name: 'ZTEST',
      mailName: 'ZTEST',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('WriteNotSupported');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('update returns WriteNotSupported', async () => {
    const result = await VendorRepository.update('03EV', { name: 'X' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('WriteNotSupported');
  });

  it('delete returns WriteNotSupported', async () => {
    const result = await VendorRepository.delete('03EV');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('WriteNotSupported');
  });

  it('upsertStoreAccount returns WriteNotSupported', async () => {
    const result = await VendorRepository.upsertStoreAccount('03EV', 1, 'ACCT');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('WriteNotSupported');
  });

  it('deleteStoreAccount returns WriteNotSupported', async () => {
    const result = await VendorRepository.deleteStoreAccount('03EV', 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('WriteNotSupported');
  });
});
