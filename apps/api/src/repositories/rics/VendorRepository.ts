/**
 * Vendor repository — RIVENDOR.MDB / `Vendor Master` + `Vendor Accounts`.
 *
 * Schema (from docs/rics-db-schema.md):
 *   Vendor Master (22 cols):
 *     Code WCHAR, Short Name WCHAR, Mail Name WCHAR, Addr1 WCHAR, Addr2 WCHAR,
 *     City WCHAR, State WCHAR, Zip WCHAR, Phone WCHAR, Fax WCHAR, Contact WCHAR,
 *     Terms WCHAR, Ship Inst WCHAR, Comment WCHAR, Manu Code WCHAR,
 *     Manu Name WCHAR, Qualifier ID WCHAR, Qualifier Code WCHAR,
 *     ColorCode BOOLEAN, LongComment WCHAR (memo), EMail WCHAR,
 *     DateLastChanged DATE
 *
 *   Vendor Accounts (4 cols):
 *     Code WCHAR, Store SMALLINT, Account WCHAR, DateLastChanged DATE
 *
 * RICS p. 153–154 — Vendor # convention is "first 4 letters of vendor name";
 * the physical column is just `WCHAR` and uniqueness isn't DB-enforced. We
 * treat it as up to 4 alphanumeric, uppercased on write, and enforce
 * uniqueness with an explicit pre-insert COUNT(*) check (same pattern as
 * DepartmentRepository).
 *
 * The "EDI enabled" toggle in the UI is derived: either `qualifierId` or
 * `qualifierCode` populated == EDI on. The service layer enforces
 * "both-or-neither" as a ConstraintViolation; the repository just writes
 * whatever it's handed.
 *
 * SKU reference count (`countSkusUsingVendor`) joins into InventoryMaster —
 * the service uses it to block deletion when SKUs point at this vendor.
 *
 * All reads go through `executeQuery`; all writes through `executeNonQuery`,
 * both with parameterized AccessParam — no value is ever inlined into SQL.
 *
 * Access-schema note: spaces are preserved in table/column names by bracketing,
 * e.g. `[Vendor Master]`, `[Short Name]`, `[Mail Name]`, `[Ship Inst]`,
 * `[Manu Code]`, `[Manu Name]`, `[Qualifier ID]`, `[Qualifier Code]`.
 */

import {
  executeQuery,
  executeNonQuery,
  type AccessParam,
} from '../../services/accessOleDb';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { openRicsDb, RicsDb, toRepoError, trimString, coerceNumber, coerceBoolean } from './ricsAccess';
import { createTtlCache } from '../../services/products/ttlCache';

// ────────────── Domain types ──────────────

export interface Vendor {
  code: string;
  name: string; // `Short Name` in the MDB, but RICS p. 153 calls it "Name"
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
  /** Hard cap on results when `q` is provided; default 100. */
  limit?: number;
}

// ────────────── Access row shapes (internal) ──────────────

interface VendorRow {
  Code: string | null;
  ['Short Name']: string | null;
  ['Mail Name']: string | null;
  Addr1: string | null;
  Addr2: string | null;
  City: string | null;
  State: string | null;
  Zip: string | null;
  Phone: string | null;
  Fax: string | null;
  Contact: string | null;
  Terms: string | null;
  ['Ship Inst']: string | null;
  Comment: string | null;
  ['Manu Code']: string | null;
  ['Manu Name']: string | null;
  ['Qualifier ID']: string | null;
  ['Qualifier Code']: string | null;
  ColorCode: boolean | number | string | null;
  LongComment: string | null;
  EMail: string | null;
  DateLastChanged: string | null;
}

interface VendorAccountRow {
  Code: string | null;
  Store: number | null;
  Account: string | null;
  DateLastChanged: string | null;
}

// ────────────── Helpers ──────────────

function parseAccessDate(value: string | null): Date | null {
  if (!value) return null;
  const m = typeof value === 'string' ? value.match(/\/Date\((-?\d+)\)\//) : null;
  if (m) return new Date(Number(m[1]));
  const parsed = new Date(value as unknown as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapVendor(row: VendorRow): Vendor {
  return {
    code: trimString(row.Code) ?? '',
    // trimString returns null for empty strings; for name/mailName we want an
    // empty string rather than null because they're semantically required.
    name: trimString(row['Short Name']) ?? '',
    mailName: trimString(row['Mail Name']) ?? '',
    addr1: trimString(row.Addr1),
    addr2: trimString(row.Addr2),
    city: trimString(row.City),
    state: trimString(row.State),
    zip: trimString(row.Zip),
    phone: trimString(row.Phone),
    fax: trimString(row.Fax),
    contact: trimString(row.Contact),
    terms: trimString(row.Terms),
    shipInst: trimString(row['Ship Inst']),
    comment: trimString(row.Comment),
    manuCode: trimString(row['Manu Code']),
    manuName: trimString(row['Manu Name']),
    qualifierId: trimString(row['Qualifier ID']),
    qualifierCode: trimString(row['Qualifier Code']),
    colorCode: coerceBoolean(row.ColorCode),
    // LongComment is a memo — preserve whitespace (trimString nulls empty-after-trim).
    longComment: row.LongComment == null || row.LongComment === '' ? null : String(row.LongComment),
    email: trimString(row.EMail),
    dateLastChanged: parseAccessDate(row.DateLastChanged),
  };
}

function mapAccount(row: VendorAccountRow): VendorStoreAccount {
  return {
    vendorCode: trimString(row.Code) ?? '',
    storeId: coerceNumber(row.Store) ?? 0,
    account: trimString(row.Account) ?? '',
    dateLastChanged: parseAccessDate(row.DateLastChanged),
  };
}

/** Null-safe string param. Empty/missing → null DBNull. */
function strParam(v: string | null | undefined): AccessParam {
  if (v == null) return { value: null, type: 'null' };
  return { value: v, type: 'string' };
}

function boolParam(v: boolean | null | undefined): AccessParam {
  return { value: v === true, type: 'boolean' };
}

function normalizeCode(raw: string): string {
  return String(raw ?? '').trim().toUpperCase();
}

// ────────────── Repository ──────────────

/**
 * Pragmatic column caps applied at the service layer (the physical MDB column
 * type is WCHAR with no declared length, so we don't know the exact maximum).
 * These match the observed sample data in `docs/rics-db-schema.md` sized up
 * by a comfortable margin.
 */
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

function allColumnsSql(): string {
  return [
    '[Code]',
    '[Short Name]',
    '[Mail Name]',
    '[Addr1]',
    '[Addr2]',
    '[City]',
    '[State]',
    '[Zip]',
    '[Phone]',
    '[Fax]',
    '[Contact]',
    '[Terms]',
    '[Ship Inst]',
    '[Comment]',
    '[Manu Code]',
    '[Manu Name]',
    '[Qualifier ID]',
    '[Qualifier Code]',
    '[ColorCode]',
    '[LongComment]',
    '[EMail]',
    '[DateLastChanged]',
  ].join(', ');
}

function insertParams(input: VendorInput, nowIso: Date): AccessParam[] {
  return [
    { value: normalizeCode(input.code), type: 'string' },
    strParam(input.name),
    strParam(input.mailName),
    strParam(input.addr1 ?? null),
    strParam(input.addr2 ?? null),
    strParam(input.city ?? null),
    strParam(input.state ?? null),
    strParam(input.zip ?? null),
    strParam(input.phone ?? null),
    strParam(input.fax ?? null),
    strParam(input.contact ?? null),
    strParam(input.terms ?? null),
    strParam(input.shipInst ?? null),
    strParam(input.comment ?? null),
    strParam(input.manuCode ?? null),
    strParam(input.manuName ?? null),
    strParam(input.qualifierId ?? null),
    strParam(input.qualifierCode ?? null),
    boolParam(input.colorCode ?? false),
    strParam(input.longComment ?? null),
    strParam(input.email ?? null),
    { value: nowIso, type: 'date' },
  ];
}

// 5-minute TTL snapshot + in-memory filter — same trick as SkuRepository.
// Vendor Master has ~2 254 rows; loading it once is fast, and repeated
// searches (typical admin workflow) serve from RAM.
const VENDOR_LIST_TTL_MS = 5 * 60 * 1000;
const vendorListCache = createTtlCache<Vendor[]>(VENDOR_LIST_TTL_MS);

async function loadFullVendorList(): Promise<Vendor[]> {
  const { path, password } = openRicsDb(RicsDb.Vendors);
  const cols = allColumnsSql();
  const rows = await executeQuery<VendorRow>(
    path,
    password,
    `SELECT ${cols} FROM [Vendor Master] ORDER BY [Code]`,
  );
  return rows.map(mapVendor);
}

export const VendorRepository = {
  async findAll(opts: FindAllOptions = {}): Promise<Result<Vendor[]>> {
    try {
      const all = await vendorListCache.get(loadFullVendorList);
      let filtered = all;
      if (opts.q && opts.q.trim().length > 0) {
        const needle = opts.q.trim().toUpperCase();
        filtered = all.filter(
          (v) =>
            v.code.toUpperCase().includes(needle) ||
            v.name.toUpperCase().includes(needle) ||
            v.mailName.toUpperCase().includes(needle) ||
            (v.manuName ?? '').toUpperCase().includes(needle),
        );
      }
      const limit = opts.limit ?? (opts.q ? 100 : filtered.length);
      return Ok(filtered.slice(0, limit));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  /** Preload the full vendor list into cache. Called from startup warmup. */
  async warmup(): Promise<void> {
    await vendorListCache.get(loadFullVendorList);
  },

  async findByCode(code: string): Promise<Result<Vendor>> {
    try {
      const { path, password } = openRicsDb(RicsDb.Vendors);
      const normalized = normalizeCode(code);
      const rows = await executeQuery<VendorRow>(
        path,
        password,
        `SELECT ${allColumnsSql()} FROM [Vendor Master] WHERE [Code] = ?`,
        [{ value: normalized, type: 'string' }],
      );
      if (rows.length === 0) {
        return Err({ kind: 'NotFound', message: `Vendor '${normalized}' not found.` });
      }
      return Ok(mapVendor(rows[0]));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async create(input: VendorInput): Promise<Result<Vendor>> {
    try {
      const { path, password } = openRicsDb(RicsDb.Vendors);
      const normalized = normalizeCode(input.code);

      // Uniqueness check (mirrors DepartmentRepository pattern — Code isn't a
      // declared PK, so we can't rely on a DB constraint violation).
      const existing = await executeQuery<{ n: number }>(
        path,
        password,
        'SELECT COUNT(*) AS n FROM [Vendor Master] WHERE [Code] = ?',
        [{ value: normalized, type: 'string' }],
      );
      if ((existing[0]?.n ?? 0) > 0) {
        return Err({
          kind: 'DuplicatePrimaryKey',
          message: `Vendor '${normalized}' already exists.`,
        });
      }

      const params = insertParams({ ...input, code: normalized }, new Date());
      await executeNonQuery(
        path,
        password,
        `INSERT INTO [Vendor Master] (${allColumnsSql()}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params,
      );
      vendorListCache.invalidate();
      return this.findByCode(normalized);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async update(
    code: string,
    patch: Partial<Omit<VendorInput, 'code'>>,
  ): Promise<Result<Vendor>> {
    const existing = await this.findByCode(code);
    if (!existing.ok) return existing;

    const merged: VendorInput = {
      code: existing.value.code,
      name: patch.name ?? existing.value.name,
      mailName: patch.mailName ?? existing.value.mailName,
      addr1: patch.addr1 !== undefined ? patch.addr1 : existing.value.addr1,
      addr2: patch.addr2 !== undefined ? patch.addr2 : existing.value.addr2,
      city: patch.city !== undefined ? patch.city : existing.value.city,
      state: patch.state !== undefined ? patch.state : existing.value.state,
      zip: patch.zip !== undefined ? patch.zip : existing.value.zip,
      phone: patch.phone !== undefined ? patch.phone : existing.value.phone,
      fax: patch.fax !== undefined ? patch.fax : existing.value.fax,
      contact: patch.contact !== undefined ? patch.contact : existing.value.contact,
      terms: patch.terms !== undefined ? patch.terms : existing.value.terms,
      shipInst: patch.shipInst !== undefined ? patch.shipInst : existing.value.shipInst,
      comment: patch.comment !== undefined ? patch.comment : existing.value.comment,
      manuCode: patch.manuCode !== undefined ? patch.manuCode : existing.value.manuCode,
      manuName: patch.manuName !== undefined ? patch.manuName : existing.value.manuName,
      qualifierId:
        patch.qualifierId !== undefined ? patch.qualifierId : existing.value.qualifierId,
      qualifierCode:
        patch.qualifierCode !== undefined
          ? patch.qualifierCode
          : existing.value.qualifierCode,
      colorCode: patch.colorCode ?? existing.value.colorCode,
      longComment:
        patch.longComment !== undefined ? patch.longComment : existing.value.longComment,
      email: patch.email !== undefined ? patch.email : existing.value.email,
    };

    try {
      const { path, password } = openRicsDb(RicsDb.Vendors);
      const params: AccessParam[] = [
        strParam(merged.name),
        strParam(merged.mailName),
        strParam(merged.addr1 ?? null),
        strParam(merged.addr2 ?? null),
        strParam(merged.city ?? null),
        strParam(merged.state ?? null),
        strParam(merged.zip ?? null),
        strParam(merged.phone ?? null),
        strParam(merged.fax ?? null),
        strParam(merged.contact ?? null),
        strParam(merged.terms ?? null),
        strParam(merged.shipInst ?? null),
        strParam(merged.comment ?? null),
        strParam(merged.manuCode ?? null),
        strParam(merged.manuName ?? null),
        strParam(merged.qualifierId ?? null),
        strParam(merged.qualifierCode ?? null),
        boolParam(merged.colorCode ?? false),
        strParam(merged.longComment ?? null),
        strParam(merged.email ?? null),
        { value: new Date(), type: 'date' },
        { value: merged.code, type: 'string' },
      ];
      await executeNonQuery(
        path,
        password,
        `UPDATE [Vendor Master] SET
           [Short Name] = ?,
           [Mail Name] = ?,
           [Addr1] = ?,
           [Addr2] = ?,
           [City] = ?,
           [State] = ?,
           [Zip] = ?,
           [Phone] = ?,
           [Fax] = ?,
           [Contact] = ?,
           [Terms] = ?,
           [Ship Inst] = ?,
           [Comment] = ?,
           [Manu Code] = ?,
           [Manu Name] = ?,
           [Qualifier ID] = ?,
           [Qualifier Code] = ?,
           [ColorCode] = ?,
           [LongComment] = ?,
           [EMail] = ?,
           [DateLastChanged] = ?
         WHERE [Code] = ?`,
        params,
      );
      // Flaky-rowcount note (see DepartmentRepository.update): re-read and
      // return the row rather than trust rowsAffected from Jet.
      vendorListCache.invalidate();
      return this.findByCode(merged.code);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async delete(code: string): Promise<Result<void>> {
    try {
      const { path, password } = openRicsDb(RicsDb.Vendors);
      const normalized = normalizeCode(code);
      const rows = await executeNonQuery(
        path,
        password,
        'DELETE FROM [Vendor Master] WHERE [Code] = ?',
        [{ value: normalized, type: 'string' }],
      );
      if (rows === 0) {
        // Could be a legit Jet-rowcount flake; double-check with a SELECT.
        const check = await executeQuery<{ n: number }>(
          path,
          password,
          'SELECT COUNT(*) AS n FROM [Vendor Master] WHERE [Code] = ?',
          [{ value: normalized, type: 'string' }],
        );
        if ((check[0]?.n ?? 0) > 0) {
          return Err({
            kind: 'AccessConnectionError',
            message: `DELETE reported 0 rows affected but vendor '${normalized}' still present.`,
          });
        }
        return Err({ kind: 'NotFound', message: `Vendor '${normalized}' not found.` });
      }
      vendorListCache.invalidate();
      return Ok(undefined);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  // ────────────── Per-store accounts ──────────────

  async findStoreAccounts(code: string): Promise<Result<VendorStoreAccount[]>> {
    try {
      const { path, password } = openRicsDb(RicsDb.Vendors);
      const rows = await executeQuery<VendorAccountRow>(
        path,
        password,
        'SELECT [Code], [Store], [Account], [DateLastChanged] FROM [Vendor Accounts] WHERE [Code] = ? ORDER BY [Store]',
        [{ value: normalizeCode(code), type: 'string' }],
      );
      return Ok(rows.map(mapAccount));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async upsertStoreAccount(
    code: string,
    storeId: number,
    account: string,
  ): Promise<Result<VendorStoreAccount>> {
    if (!Number.isInteger(storeId) || storeId < 1) {
      return Err({
        kind: 'ConstraintViolation',
        message: 'storeId must be a positive integer.',
      });
    }
    try {
      const { path, password } = openRicsDb(RicsDb.Vendors);
      const normalizedCode = normalizeCode(code);

      // Existence check. Jet has no native UPSERT; we do it in two spawns
      // (separated by a SELECT) because wrapping it in a transaction would
      // require callers to hold one MDB connection open and we'd rather keep
      // the PowerShell-per-op model consistent with the rest of Phase 1.
      const existing = await executeQuery<{ n: number }>(
        path,
        password,
        'SELECT COUNT(*) AS n FROM [Vendor Accounts] WHERE [Code] = ? AND [Store] = ?',
        [
          { value: normalizedCode, type: 'string' },
          { value: storeId, type: 'integer' },
        ],
      );
      const now = new Date();
      if ((existing[0]?.n ?? 0) > 0) {
        await executeNonQuery(
          path,
          password,
          'UPDATE [Vendor Accounts] SET [Account] = ?, [DateLastChanged] = ? WHERE [Code] = ? AND [Store] = ?',
          [
            strParam(account),
            { value: now, type: 'date' },
            { value: normalizedCode, type: 'string' },
            { value: storeId, type: 'integer' },
          ],
        );
      } else {
        await executeNonQuery(
          path,
          password,
          'INSERT INTO [Vendor Accounts] ([Code], [Store], [Account], [DateLastChanged]) VALUES (?, ?, ?, ?)',
          [
            { value: normalizedCode, type: 'string' },
            { value: storeId, type: 'integer' },
            strParam(account),
            { value: now, type: 'date' },
          ],
        );
      }
      const rows = await executeQuery<VendorAccountRow>(
        path,
        password,
        'SELECT [Code], [Store], [Account], [DateLastChanged] FROM [Vendor Accounts] WHERE [Code] = ? AND [Store] = ?',
        [
          { value: normalizedCode, type: 'string' },
          { value: storeId, type: 'integer' },
        ],
      );
      if (rows.length === 0) {
        return Err({
          kind: 'AccessConnectionError',
          message: 'Failed to read back the upserted store account.',
        });
      }
      return Ok(mapAccount(rows[0]));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async deleteStoreAccount(code: string, storeId: number): Promise<Result<void>> {
    if (!Number.isInteger(storeId) || storeId < 1) {
      return Err({
        kind: 'ConstraintViolation',
        message: 'storeId must be a positive integer.',
      });
    }
    try {
      const { path, password } = openRicsDb(RicsDb.Vendors);
      const rows = await executeNonQuery(
        path,
        password,
        'DELETE FROM [Vendor Accounts] WHERE [Code] = ? AND [Store] = ?',
        [
          { value: normalizeCode(code), type: 'string' },
          { value: storeId, type: 'integer' },
        ],
      );
      if (rows === 0) {
        return Err({
          kind: 'NotFound',
          message: `Vendor account (${code}, store ${storeId}) not found.`,
        });
      }
      return Ok(undefined);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  // ────────────── Cross-DB helper: SKU usage ──────────────

  /**
   * Count SKUs in InventoryMaster pointing at this vendor code. Opens
   * RIINVMAS.MDB (not RIVENDOR.MDB) — we deliberately keep per-DB queries
   * separated because OLE DB connections are single-database at a time.
   */
  async countSkusUsingVendor(code: string): Promise<Result<number>> {
    try {
      const { path, password } = openRicsDb(RicsDb.InventoryMaster);
      const rows = await executeQuery<{ n: number }>(
        path,
        password,
        'SELECT COUNT(*) AS n FROM [InventoryMaster] WHERE [Vendor] = ?',
        [{ value: normalizeCode(code), type: 'string' }],
      );
      return Ok(coerceNumber(rows[0]?.n) ?? 0);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  /**
   * Single-spawn SKU count grouped by vendor. Used by list views to populate
   * the "SKU count" column without an N+1 of `countSkusUsingVendor` spawns.
   * Returns a map from vendor code (uppercased) to count. Empty map on error
   * — the caller should treat this as a soft-fail and render 0s rather than
   * block the page.
   */
  async countSkusPerVendor(): Promise<Result<Record<string, number>>> {
    try {
      const { path, password } = openRicsDb(RicsDb.InventoryMaster);
      const rows = await executeQuery<{ Vendor: string | null; n: number }>(
        path,
        password,
        'SELECT [Vendor], COUNT(*) AS n FROM [InventoryMaster] WHERE [Vendor] IS NOT NULL GROUP BY [Vendor]',
      );
      const out: Record<string, number> = {};
      for (const r of rows) {
        const key = normalizeCode(r.Vendor ?? '');
        if (!key) continue;
        out[key] = coerceNumber(r.n) ?? 0;
      }
      return Ok(out);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },
};
