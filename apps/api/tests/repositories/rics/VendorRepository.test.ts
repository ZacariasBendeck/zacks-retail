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
    vendorOverlay: {
      create: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../../src/repositories/rics/taxonomySkuCounts', () => ({
  loadSkuCountsByVendor: jest.fn(),
}));

import { prisma } from '../../../src/db/prisma';
import { VendorRepository } from '../../../src/repositories/rics/VendorRepository';
import { loadSkuCountsByVendor } from '../../../src/repositories/rics/taxonomySkuCounts';

const mockQuery = prisma.$queryRawUnsafe as jest.MockedFunction<
  typeof prisma.$queryRawUnsafe
>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockOverlay = prisma.vendorOverlay as any as {
  create: jest.Mock;
  upsert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  findUnique: jest.Mock;
};
const mockLoadSkuCountsByVendor = loadSkuCountsByVendor as jest.MockedFunction<
  typeof loadSkuCountsByVendor
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
  mockOverlay.create.mockReset();
  mockOverlay.upsert.mockReset();
  mockOverlay.update.mockReset();
  mockOverlay.delete.mockReset();
  mockOverlay.findUnique.mockReset();
  mockLoadSkuCountsByVendor.mockReset();
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
    expect(sql).toMatch(/FROM app\.vendor v/);
    expect(sql).toMatch(/FULL OUTER JOIN app\.vendor_overlay/);
    expect(sql).toMatch(/ORDER BY code/);
  });

  it('applies an LIMIT when passed', async () => {
    mockQuery.mockResolvedValueOnce([ROW_1] as never);

    await VendorRepository.findAll({ limit: 5 });
    const call = mockQuery.mock.calls[0];
    expect(call[0]).toMatch(/LIMIT \$1/);
    expect(call[1]).toBe(5);
  });

  it('runs a case-insensitive LIKE filter via the overlay+mirror join', async () => {
    mockQuery.mockResolvedValueOnce([ROW_1] as never);

    const result = await VendorRepository.findAll({ q: 'Everly' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);

    const [sql, needle, limit] = mockQuery.mock.calls[0];
    // SQL pulls from the overlay FULL OUTER JOIN mirror projection,
    // filters tombstones, and applies a LOWER LIKE across code + name cols.
    expect(sql).toMatch(/FROM app\.vendor v/);
    expect(sql).toMatch(/FULL OUTER JOIN app\.vendor_overlay/);
    expect(sql).toMatch(/o\.source\s*!=\s*'tombstone'/);
    expect(sql).toMatch(/LIKE \$1/);
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
  it('returns the vendor when Postgres has the code (via overlay+mirror projection)', async () => {
    mockQuery.mockResolvedValueOnce([ROW_1] as never);

    const result = await VendorRepository.findByCode('03EV');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.code).toBe('03EV');
    expect(result.value.email).toBe('info@03everly.com');

    const [sql, code] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/FROM app\.vendor v/);
    expect(sql).toMatch(/FULL OUTER JOIN app\.vendor_overlay/);
    // Code is matched case-insensitively against the effective (overlay|mirror) code.
    expect(sql).toMatch(/UPPER\(COALESCE\(o\.code, v\.code\)\)\s*=\s*\$1/);
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
  it('pulls rows from app.vendor_store_account', async () => {
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
    expect(sql).toMatch(/FROM app\.vendor_store_account/);
  });
});

describe('VendorRepository.countSkusUsingVendor', () => {
  it('counts SKUs with matching vendor (case-insensitive)', async () => {
    mockLoadSkuCountsByVendor.mockResolvedValueOnce(
      new Map([
        ['03EV', 42],
        ['OTHER', 2],
      ]),
    );

    const result = await VendorRepository.countSkusUsingVendor('03EV');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(42);
    expect(mockLoadSkuCountsByVendor).toHaveBeenCalledTimes(1);
  });
});

describe('VendorRepository.countSkusPerVendor', () => {
  it('returns a per-vendor code→count map with uppercased keys', async () => {
    mockLoadSkuCountsByVendor.mockResolvedValueOnce(
      new Map([
        ['GRAN', 7079],
        ['KYIW', 4458],
      ]),
    );

    const result = await VendorRepository.countSkusPerVendor();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      GRAN: 7079,
      KYIW: 4458,
    });
    expect(mockLoadSkuCountsByVendor).toHaveBeenCalledTimes(1);
  });
});

describe('VendorRepository.warmup', () => {
  it('is a no-op (no queries issued)', async () => {
    await expect(VendorRepository.warmup()).resolves.toBeUndefined();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

// ────────────── Writes — app.vendor_overlay ──────────────
// Vendor master writes land in app.vendor_overlay as 'native' / 'override' /
// 'tombstone' rows. Store-account writes remain disabled.

describe('VendorRepository.create (overlay native row)', () => {
  it('rejects with DuplicatePrimaryKey if the code already exists in mirror or overlay', async () => {
    // Collision check query reports 'mirror'.
    mockQuery.mockResolvedValueOnce([{ source: 'mirror' }] as never);

    const result = await VendorRepository.create(
      { code: '03EV', name: 'try', mailName: 'try' },
      'tester',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('DuplicatePrimaryKey');
    expect(mockOverlay.upsert).not.toHaveBeenCalled();
  });

  it('upserts a native overlay row when the code is free', async () => {
    // 1. Collision check returns no conflict.
    mockQuery.mockResolvedValueOnce([{ source: null }] as never);
    // 2. Upsert succeeds.
    mockOverlay.upsert.mockResolvedValueOnce({} as never);
    // 3. findByCode read — returns the native row pulled back through the projection.
    mockQuery.mockResolvedValueOnce([
      { ...ROW_1, code: 'ZTST', short_name: 'ZTEST', mail_name: 'ZTEST', city: 'Tegucigalpa' },
    ] as never);

    const result = await VendorRepository.create(
      { code: 'ZTST', name: 'ZTEST', mailName: 'ZTEST', city: 'Tegucigalpa' },
      'tester',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.code).toBe('ZTST');

    expect(mockOverlay.upsert).toHaveBeenCalledTimes(1);
    const args = mockOverlay.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ code: 'ZTST' });
    expect(args.create).toMatchObject({
      code: 'ZTST',
      source: 'native',
      shortName: 'ZTEST',
      mailName: 'ZTEST',
      city: 'Tegucigalpa',
      createdBy: 'tester',
      updatedBy: 'tester',
    });
  });
});

describe('VendorRepository.update (override-vs-native)', () => {
  it('sparse-overrides a mirror-only vendor (source=override, only touched fields set)', async () => {
    // Status probe: code exists in mirror, no overlay yet.
    mockQuery.mockResolvedValueOnce([{ has_baseline: true, overlay_source: null }] as never);
    mockOverlay.create.mockResolvedValueOnce({} as never);
    // findByCode projection read.
    mockQuery.mockResolvedValueOnce([ROW_1] as never);

    const result = await VendorRepository.update(
      '03EV',
      { city: 'OVERRIDDEN', phone: 'OVERRIDDEN-PHONE' },
      'tester',
    );
    expect(result.ok).toBe(true);

    expect(mockOverlay.create).toHaveBeenCalledTimes(1);
    const payload = mockOverlay.create.mock.calls[0][0].data;
    expect(payload).toMatchObject({
      code: '03EV',
      source: 'override',
      city: 'OVERRIDDEN',
      phone: 'OVERRIDDEN-PHONE',
      createdBy: 'tester',
      updatedBy: 'tester',
    });
    // Untouched fields aren't in the sparse payload.
    expect(payload.shortName).toBeUndefined();
    expect(payload.mailName).toBeUndefined();
    expect(payload.addr1).toBeUndefined();
  });

  it('updates an existing native row in place (keeps source=native)', async () => {
    mockQuery.mockResolvedValueOnce([
      { has_baseline: false, overlay_source: 'native' },
    ] as never);
    mockOverlay.update.mockResolvedValueOnce({} as never);
    mockQuery.mockResolvedValueOnce([{ ...ROW_1, code: 'ZTST' }] as never);

    const result = await VendorRepository.update(
      'ZTST',
      { city: 'San Pedro Sula' },
      'tester',
    );
    expect(result.ok).toBe(true);

    expect(mockOverlay.update).toHaveBeenCalledTimes(1);
    const payload = mockOverlay.update.mock.calls[0][0].data;
    expect(payload.source).toBe('native');
    expect(payload.city).toBe('San Pedro Sula');
  });

  it('returns NotFound when neither mirror nor overlay has the code', async () => {
    mockQuery.mockResolvedValueOnce([
      { has_baseline: false, overlay_source: null },
    ] as never);

    const result = await VendorRepository.update('NOPE', { name: 'x' }, 'tester');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NotFound');
    expect(mockOverlay.create).not.toHaveBeenCalled();
    expect(mockOverlay.update).not.toHaveBeenCalled();
  });

  it('returns NotFound when the code is tombstoned', async () => {
    mockQuery.mockResolvedValueOnce([
      { has_baseline: true, overlay_source: 'tombstone' },
    ] as never);

    const result = await VendorRepository.update('1004', { name: 'x' }, 'tester');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NotFound');
  });
});

describe('VendorRepository.delete (overlay semantics)', () => {
  it('physically removes a native row', async () => {
    mockQuery.mockResolvedValueOnce([
      { has_baseline: false, overlay_source: 'native' },
    ] as never);
    mockOverlay.delete.mockResolvedValueOnce({} as never);

    const result = await VendorRepository.delete('ZTST', 'tester');
    expect(result.ok).toBe(true);
    expect(mockOverlay.delete).toHaveBeenCalledWith({ where: { code: 'ZTST' } });
    expect(mockOverlay.update).not.toHaveBeenCalled();
  });

  it('writes a tombstone row for a mirror-only vendor', async () => {
    mockQuery.mockResolvedValueOnce([
      { has_baseline: true, overlay_source: null },
    ] as never);
    mockOverlay.create.mockResolvedValueOnce({} as never);

    const result = await VendorRepository.delete('1004', 'tester');
    expect(result.ok).toBe(true);
    const payload = mockOverlay.create.mock.calls[0][0].data;
    expect(payload).toMatchObject({
      code: '1004',
      source: 'tombstone',
      createdBy: 'tester',
      updatedBy: 'tester',
    });
  });

  it('flips an existing override row to tombstone', async () => {
    mockQuery.mockResolvedValueOnce([
      { has_baseline: true, overlay_source: 'override' },
    ] as never);
    mockOverlay.update.mockResolvedValueOnce({} as never);

    const result = await VendorRepository.delete('03EV', 'tester');
    expect(result.ok).toBe(true);
    const payload = mockOverlay.update.mock.calls[0][0].data;
    expect(payload).toMatchObject({ source: 'tombstone', updatedBy: 'tester' });
  });

  it('returns NotFound for already-tombstoned vendors', async () => {
    mockQuery.mockResolvedValueOnce([
      { has_baseline: true, overlay_source: 'tombstone' },
    ] as never);

    const result = await VendorRepository.delete('1004', 'tester');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NotFound');
  });

  it('returns NotFound when neither mirror nor overlay has the code', async () => {
    mockQuery.mockResolvedValueOnce([
      { has_baseline: false, overlay_source: null },
    ] as never);

    const result = await VendorRepository.delete('NOPE', 'tester');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NotFound');
  });
});

describe('VendorRepository store-account writes (still disabled)', () => {
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
