/**
 * Vendor repository — read-only projection over `rics_mirror.vendor_master`,
 * `rics_mirror.vendor_accounts`, and `rics_mirror.inventory_master` (for SKU
 * counts). Populated by `sync:rics` from RIVENDOR.MDB / RIINVMAS.MDB.
 *
 * Previously this repo read and wrote the Access MDB directly via OLE DB.
 * 2026-04-23: the MDB endpoint was deleted. All reads now come from Postgres;
 * writes are no longer supported through this service. A future sync agent
 * will carry Postgres-originated vendor changes back to RICS — until that
 * exists, vendor master-data changes must be made directly in RICS.
 *
 * Public read API (unchanged shape so services/products/vendorService.ts
 * doesn't have to know the source flipped):
 *   findAll({ q?, limit? })
 *   findByCode(code)
 *   findStoreAccounts(code)
 *   countSkusUsingVendor(code)
 *   countSkusPerVendor()
 *   warmup()  — no-op (Postgres reads are fast; no warm cache needed)
 *
 * Write API — throws `VendorWriteNotSupportedError`:
 *   create, update, delete
 *   upsertStoreAccount, deleteStoreAccount
 */

import { prisma } from '../../db/prisma';
import { Err, Ok, type Result, type RepoError } from './repoResult';

// ────────────── Domain types ──────────────

export interface Vendor {
  code: string;
  name: string;
  mailName: string;
  addr1: string | null;
  addr2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  fax: string | null;
  contact: string | null;
  terms: string | null;
  shipInst: string | null;
  comment: string | null;
  manuCode: string | null;
  manuName: string | null;
  qualifierId: string | null;
  qualifierCode: string | null;
  colorCode: boolean;
  longComment: string | null;
  email: string | null;
  dateLastChanged: Date | null;
}

export interface VendorInput {
  code: string;
  name: string;
  mailName: string;
  addr1?: string | null;
  addr2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  fax?: string | null;
  contact?: string | null;
  terms?: string | null;
  shipInst?: string | null;
  comment?: string | null;
  manuCode?: string | null;
  manuName?: string | null;
  qualifierId?: string | null;
  qualifierCode?: string | null;
  colorCode?: boolean;
  longComment?: string | null;
  email?: string | null;
}

export interface VendorStoreAccount {
  vendorCode: string;
  storeId: number;
  account: string;
  dateLastChanged: Date | null;
}

export interface FindAllOptions {
  q?: string;
  /** Hard cap on results when `q` is provided; default 100. No cap without `q`. */
  limit?: number;
}

// Pragmatic column caps retained so the service layer can keep its validation
// intact even though writes are disabled here. (They may move to a Postgres
// overlay table later.)
export const VENDOR_FIELD_LIMITS = {
  code: 4,
  name: 30,
  mailName: 30,
  addr1: 60,
  addr2: 60,
  city: 30,
  state: 4,
  zip: 12,
  phone: 20,
  fax: 20,
  contact: 40,
  terms: 30,
  shipInst: 50,
  comment: 120,
  manuCode: 8,
  manuName: 30,
  qualifierId: 4,
  qualifierCode: 12,
  email: 120,
  longComment: 32_768,
} as const;

// ────────────── Error type for disabled writes ──────────────

export class VendorWriteNotSupportedError extends Error {
  kind: 'WriteNotSupported' = 'WriteNotSupported';
  constructor() {
    super(
      'Vendor writes are not supported through the mirror-backed repository. ' +
        'The MDB write path was removed on 2026-04-23. Vendor master-data ' +
        'changes must be made directly in RICS until the Postgres→RICS sync ' +
        'agent is implemented.',
    );
    this.name = 'VendorWriteNotSupportedError';
  }
}

function writeNotSupported<T>(): Result<T> {
  return Err({
    kind: 'WriteNotSupported',
    message:
      'Vendor writes are disabled on this endpoint. Changes must be made ' +
      'directly in RICS until the Postgres→RICS sync agent is built.',
  } as RepoError);
}

// ────────────── Internal row shapes (Postgres snake_case) ──────────────

interface VendorDbRow {
  code: string;
  short_name: string | null;
  mail_name: string | null;
  addr1: string | null;
  addr2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  fax: string | null;
  contact: string | null;
  terms: string | null;
  ship_inst: string | null;
  comment: string | null;
  manu_code: string | null;
  manu_name: string | null;
  qualifier_id: string | null;
  qualifier_code: string | null;
  color_code: boolean | null;
  long_comment: string | null;
  e_mail: string | null;
  date_last_changed: Date | null;
}

interface VendorAccountDbRow {
  code: string;
  store: number;
  account: string | null;
  date_last_changed: Date | null;
}

function trimOrNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function mapVendor(row: VendorDbRow): Vendor {
  return {
    code: row.code.trim(),
    name: (row.short_name ?? '').trim(),
    mailName: (row.mail_name ?? '').trim(),
    addr1: trimOrNull(row.addr1),
    addr2: trimOrNull(row.addr2),
    city: trimOrNull(row.city),
    state: trimOrNull(row.state),
    zip: trimOrNull(row.zip),
    phone: trimOrNull(row.phone),
    fax: trimOrNull(row.fax),
    contact: trimOrNull(row.contact),
    terms: trimOrNull(row.terms),
    shipInst: trimOrNull(row.ship_inst),
    comment: trimOrNull(row.comment),
    manuCode: trimOrNull(row.manu_code),
    manuName: trimOrNull(row.manu_name),
    qualifierId: trimOrNull(row.qualifier_id),
    qualifierCode: trimOrNull(row.qualifier_code),
    colorCode: row.color_code === true,
    // long_comment is a memo — preserve whitespace, but map empty string → null
    longComment: row.long_comment == null || row.long_comment === '' ? null : row.long_comment,
    email: trimOrNull(row.e_mail),
    dateLastChanged: row.date_last_changed ? new Date(row.date_last_changed) : null,
  };
}

function mapAccount(row: VendorAccountDbRow): VendorStoreAccount {
  return {
    vendorCode: row.code.trim(),
    storeId: Number(row.store),
    account: (row.account ?? '').trim(),
    dateLastChanged: row.date_last_changed ? new Date(row.date_last_changed) : null,
  };
}

function normalizeCode(raw: string): string {
  return String(raw ?? '').trim().toUpperCase();
}

function toPgError(err: unknown): RepoError {
  const message = err instanceof Error ? err.message : String(err ?? 'Postgres read failed');
  return { kind: 'AccessConnectionError', message, cause: err };
}

const VENDOR_COLS = `
  code, short_name, mail_name, addr1, addr2, city, state, zip,
  phone, fax, contact, terms, ship_inst, comment, manu_code, manu_name,
  qualifier_id, qualifier_code, color_code, long_comment, e_mail, date_last_changed
`;

// ────────────── Repository ──────────────

export const VendorRepository = {
  async findAll(opts: FindAllOptions = {}): Promise<Result<Vendor[]>> {
    try {
      const rows =
        opts.q && opts.q.trim().length > 0
          ? await findAllFiltered(opts.q.trim(), opts.limit ?? 100)
          : await findAllUnfiltered(opts.limit);
      return Ok(rows.map(mapVendor));
    } catch (err) {
      return Err(toPgError(err));
    }
  },

  /** No-op. Postgres reads are fast enough that the old in-memory TTL cache
   * was dropped. Retained so the startup warmup in `services/products/warmup.ts`
   * still resolves. */
  async warmup(): Promise<void> {
    // intentional no-op
  },

  async findByCode(code: string): Promise<Result<Vendor>> {
    try {
      const normalized = normalizeCode(code);
      const rows = await prisma.$queryRawUnsafe<VendorDbRow[]>(
        `SELECT ${VENDOR_COLS} FROM rics_mirror.vendor_master WHERE UPPER(code) = $1 LIMIT 1`,
        normalized,
      );
      if (rows.length === 0) {
        return Err({ kind: 'NotFound', message: `Vendor '${normalized}' not found.` });
      }
      return Ok(mapVendor(rows[0]));
    } catch (err) {
      return Err(toPgError(err));
    }
  },

  // Writes are disabled — the MDB endpoint was removed 2026-04-23.
  async create(_input: VendorInput): Promise<Result<Vendor>> {
    return writeNotSupported<Vendor>();
  },
  async update(
    _code: string,
    _patch: Partial<Omit<VendorInput, 'code'>>,
  ): Promise<Result<Vendor>> {
    return writeNotSupported<Vendor>();
  },
  async delete(_code: string): Promise<Result<void>> {
    return writeNotSupported<void>();
  },

  // ────────────── Per-store accounts ──────────────

  async findStoreAccounts(code: string): Promise<Result<VendorStoreAccount[]>> {
    try {
      const rows = await prisma.$queryRawUnsafe<VendorAccountDbRow[]>(
        `SELECT code, store, account, date_last_changed
         FROM rics_mirror.vendor_accounts
         WHERE UPPER(code) = $1
         ORDER BY store`,
        normalizeCode(code),
      );
      return Ok(rows.map(mapAccount));
    } catch (err) {
      return Err(toPgError(err));
    }
  },

  async upsertStoreAccount(
    _code: string,
    _storeId: number,
    _account: string,
  ): Promise<Result<VendorStoreAccount>> {
    return writeNotSupported<VendorStoreAccount>();
  },

  async deleteStoreAccount(_code: string, _storeId: number): Promise<Result<void>> {
    return writeNotSupported<void>();
  },

  // ────────────── SKU usage (against rics_mirror.inventory_master) ──────────────

  async countSkusUsingVendor(code: string): Promise<Result<number>> {
    try {
      const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT COUNT(*)::bigint AS n
         FROM rics_mirror.inventory_master
         WHERE UPPER(vendor) = $1`,
        normalizeCode(code),
      );
      return Ok(Number(rows[0]?.n ?? 0n));
    } catch (err) {
      return Err(toPgError(err));
    }
  },

  async countSkusPerVendor(): Promise<Result<Record<string, number>>> {
    try {
      const rows = await prisma.$queryRawUnsafe<{ vendor: string | null; n: bigint }[]>(
        `SELECT vendor, COUNT(*)::bigint AS n
         FROM rics_mirror.inventory_master
         WHERE vendor IS NOT NULL AND vendor <> ''
         GROUP BY vendor`,
      );
      const out: Record<string, number> = {};
      for (const r of rows) {
        const key = normalizeCode(r.vendor ?? '');
        if (!key) continue;
        out[key] = Number(r.n ?? 0n);
      }
      return Ok(out);
    } catch (err) {
      return Err(toPgError(err));
    }
  },
};

// ────────────── Internal queries ──────────────

async function findAllUnfiltered(limit?: number): Promise<VendorDbRow[]> {
  if (limit != null) {
    return prisma.$queryRawUnsafe<VendorDbRow[]>(
      `SELECT ${VENDOR_COLS}
       FROM rics_mirror.vendor_master
       ORDER BY code
       LIMIT $1`,
      limit,
    );
  }
  return prisma.$queryRawUnsafe<VendorDbRow[]>(
    `SELECT ${VENDOR_COLS} FROM rics_mirror.vendor_master ORDER BY code`,
  );
}

async function findAllFiltered(q: string, limit: number): Promise<VendorDbRow[]> {
  const needle = `%${q.toLowerCase()}%`;
  return prisma.$queryRawUnsafe<VendorDbRow[]>(
    `SELECT ${VENDOR_COLS}
     FROM rics_mirror.vendor_master
     WHERE LOWER(code) LIKE $1
        OR LOWER(COALESCE(short_name,'')) LIKE $1
        OR LOWER(COALESCE(mail_name,''))  LIKE $1
        OR LOWER(COALESCE(manu_name,''))  LIKE $1
     ORDER BY code
     LIMIT $2`,
    needle,
    limit,
  );
}
