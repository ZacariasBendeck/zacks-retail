/**
 * Vendor repository — Postgres-backed reads + writes using the `app.vendor_overlay`
 * overlay pattern. The MDB read/write path was deleted 2026-04-23.
 *
 * Storage layout
 * ──────────────
 *   `rics_mirror.vendor_master`        mirrored RICS data (read-only; rebuilt by sync:rics)
 *   `rics_mirror.vendor_accounts`      per-store account numbers (read-only)
 *   `rics_mirror.inventory_master`     source for countSkusUsingVendor / countSkusPerVendor
 *   `app.vendor_overlay`               write surface — three roles via `source`:
 *                                        'native'    — born in Postgres, no RICS twin
 *                                        'override'  — sparse per-column override of a mirror row
 *                                                      (NULL = use mirror, non-NULL = override)
 *                                        'tombstone' — hide a mirror row from reads
 *
 * Read path: rics_mirror.vendor_master FULL OUTER JOIN app.vendor_overlay ON code,
 * filtering source='tombstone', with COALESCE(overlay.col, mirror.col) per column.
 *
 * Delete semantics
 * ────────────────
 *   native vendor in overlay              → DELETE row
 *   override of mirror vendor             → flip to tombstone (mirror still exists; tombstone hides it)
 *   mirror vendor with no overlay row     → INSERT tombstone row
 *   already tombstoned                    → NotFound
 *
 * Until the Postgres→RICS sync agent is implemented, overlay rows don't reach
 * RICS — the warehouse still sees only mirror data.
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
  /** Hard cap on results when `q` is provided; default 100. */
  limit?: number;
}

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

// ────────────── Internal helpers ──────────────

interface VendorEffectiveRow {
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

function mapEffective(row: VendorEffectiveRow): Vendor {
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
    longComment:
      row.long_comment == null || row.long_comment === '' ? null : row.long_comment,
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
  const message = err instanceof Error ? err.message : String(err ?? 'Postgres operation failed');
  // Heuristic: Postgres raises 23505 unique_violation on PK collision.
  if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
    return { kind: 'DuplicatePrimaryKey', message, cause: err };
  }
  return { kind: 'AccessConnectionError', message, cause: err };
}

/**
 * Effective-vendor projection. Combines the RICS mirror with the overlay:
 *   - mirror only, no overlay           → mirror row as-is
 *   - mirror + overlay source='override' → sparse COALESCE(overlay, mirror)
 *   - mirror + overlay source='tombstone' → filtered out
 *   - overlay source='native', no mirror → overlay row as-is (with last_changed from overlay.updated_at)
 *
 * A WHERE clause can be injected via `whereSql` (uses m./o. aliases + $N params).
 * `params` is appended to the base SELECT; `$N` placeholders start from `paramOffset+1`.
 */
function buildEffectiveSelect(whereSql = '', extraSql = ''): string {
  return `
SELECT
  COALESCE(o.code, m.code) AS code,
  COALESCE(o.short_name,    m.short_name)    AS short_name,
  COALESCE(o.mail_name,     m.mail_name)     AS mail_name,
  COALESCE(o.addr1,         m.addr1)         AS addr1,
  COALESCE(o.addr2,         m.addr2)         AS addr2,
  COALESCE(o.city,          m.city)          AS city,
  COALESCE(o.state,         m.state)         AS state,
  COALESCE(o.zip,           m.zip)           AS zip,
  COALESCE(o.phone,         m.phone)         AS phone,
  COALESCE(o.fax,           m.fax)           AS fax,
  COALESCE(o.contact,       m.contact)       AS contact,
  COALESCE(o.terms,         m.terms)         AS terms,
  COALESCE(o.ship_inst,     m.ship_inst)     AS ship_inst,
  COALESCE(o.comment,       m.comment)       AS comment,
  COALESCE(o.manu_code,     m.manu_code)     AS manu_code,
  COALESCE(o.manu_name,     m.manu_name)     AS manu_name,
  COALESCE(o.qualifier_id,  m.qualifier_id)  AS qualifier_id,
  COALESCE(o.qualifier_code, m.qualifier_code) AS qualifier_code,
  COALESCE(o.color_code,    m.color_code)    AS color_code,
  COALESCE(o.long_comment,  m.long_comment)  AS long_comment,
  COALESCE(o.e_mail,        m.e_mail)        AS e_mail,
  COALESCE(o.updated_at,    m.date_last_changed) AS date_last_changed
FROM rics_mirror.vendor_master m
FULL OUTER JOIN app.vendor_overlay o ON o.code = m.code
WHERE (o.source IS NULL OR o.source != 'tombstone')
  AND (m.code IS NOT NULL OR o.code IS NOT NULL)
  ${whereSql}
${extraSql}
`;
}

// ────────────── Repository ──────────────

export const VendorRepository = {
  async findAll(opts: FindAllOptions = {}): Promise<Result<Vendor[]>> {
    try {
      if (opts.q && opts.q.trim().length > 0) {
        const needle = `%${opts.q.trim().toLowerCase()}%`;
        const limit = opts.limit ?? 100;
        const sql = buildEffectiveSelect(
          `AND (
             LOWER(COALESCE(o.code, m.code)) LIKE $1
             OR LOWER(COALESCE(o.short_name, m.short_name, '')) LIKE $1
             OR LOWER(COALESCE(o.mail_name, m.mail_name, ''))  LIKE $1
             OR LOWER(COALESCE(o.manu_name, m.manu_name, ''))  LIKE $1
           )`,
          'ORDER BY code LIMIT $2',
        );
        const rows = await prisma.$queryRawUnsafe<VendorEffectiveRow[]>(sql, needle, limit);
        return Ok(rows.map(mapEffective));
      }

      const sql = buildEffectiveSelect(
        '',
        opts.limit != null ? 'ORDER BY code LIMIT $1' : 'ORDER BY code',
      );
      const rows =
        opts.limit != null
          ? await prisma.$queryRawUnsafe<VendorEffectiveRow[]>(sql, opts.limit)
          : await prisma.$queryRawUnsafe<VendorEffectiveRow[]>(sql);
      return Ok(rows.map(mapEffective));
    } catch (err) {
      return Err(toPgError(err));
    }
  },

  /** No-op. Postgres reads are fast enough that the old in-memory TTL cache
   * was dropped. Retained so the startup warmup still resolves. */
  async warmup(): Promise<void> {
    // intentional no-op
  },

  async findByCode(code: string): Promise<Result<Vendor>> {
    try {
      const normalized = normalizeCode(code);
      const sql = buildEffectiveSelect(
        'AND UPPER(COALESCE(o.code, m.code)) = $1',
        'LIMIT 1',
      );
      const rows = await prisma.$queryRawUnsafe<VendorEffectiveRow[]>(sql, normalized);
      if (rows.length === 0) {
        return Err({ kind: 'NotFound', message: `Vendor '${normalized}' not found.` });
      }
      return Ok(mapEffective(rows[0]));
    } catch (err) {
      return Err(toPgError(err));
    }
  },

  async create(input: VendorInput, actor = 'system'): Promise<Result<Vendor>> {
    const code = normalizeCode(input.code);
    try {
      // Duplicate check: either the mirror has this code (can't create — use update
      // instead) or the overlay already has a live (non-tombstone) row.
      const collision = await prisma.$queryRawUnsafe<{ source: string | null }[]>(
        `SELECT
           CASE
             WHEN m.code IS NOT NULL AND (o.source IS NULL OR o.source != 'tombstone') THEN 'mirror'
             WHEN o.code IS NOT NULL AND o.source IN ('native', 'override') THEN 'overlay'
             ELSE NULL
           END AS source
         FROM (SELECT $1::text AS code) c
         LEFT JOIN rics_mirror.vendor_master m ON m.code = c.code
         LEFT JOIN app.vendor_overlay o ON o.code = c.code
         LIMIT 1`,
        code,
      );
      if (collision[0]?.source) {
        return Err({
          kind: 'DuplicatePrimaryKey',
          message: `Vendor '${code}' already exists (${collision[0].source}). Use update instead.`,
        });
      }

      // If a tombstone row is already there for this code (orphan from a prior
      // delete), flip it to native with fresh column values via UPSERT.
      await prisma.vendorOverlay.upsert({
        where: { code },
        create: {
          code,
          source: 'native',
          shortName: input.name,
          mailName: input.mailName,
          addr1: input.addr1 ?? null,
          addr2: input.addr2 ?? null,
          city: input.city ?? null,
          state: input.state ?? null,
          zip: input.zip ?? null,
          phone: input.phone ?? null,
          fax: input.fax ?? null,
          contact: input.contact ?? null,
          terms: input.terms ?? null,
          shipInst: input.shipInst ?? null,
          comment: input.comment ?? null,
          manuCode: input.manuCode ?? null,
          manuName: input.manuName ?? null,
          qualifierId: input.qualifierId ?? null,
          qualifierCode: input.qualifierCode ?? null,
          colorCode: input.colorCode ?? false,
          longComment: input.longComment ?? null,
          eMail: input.email ?? null,
          createdBy: actor,
          updatedBy: actor,
        },
        update: {
          source: 'native',
          shortName: input.name,
          mailName: input.mailName,
          addr1: input.addr1 ?? null,
          addr2: input.addr2 ?? null,
          city: input.city ?? null,
          state: input.state ?? null,
          zip: input.zip ?? null,
          phone: input.phone ?? null,
          fax: input.fax ?? null,
          contact: input.contact ?? null,
          terms: input.terms ?? null,
          shipInst: input.shipInst ?? null,
          comment: input.comment ?? null,
          manuCode: input.manuCode ?? null,
          manuName: input.manuName ?? null,
          qualifierId: input.qualifierId ?? null,
          qualifierCode: input.qualifierCode ?? null,
          colorCode: input.colorCode ?? false,
          longComment: input.longComment ?? null,
          eMail: input.email ?? null,
          updatedBy: actor,
        },
      });

      return this.findByCode(code);
    } catch (err) {
      return Err(toPgError(err));
    }
  },

  async update(
    code: string,
    patch: Partial<Omit<VendorInput, 'code'>>,
    actor = 'system',
  ): Promise<Result<Vendor>> {
    const normalized = normalizeCode(code);
    try {
      // Figure out whether this is a mirror row (→ override), an existing native
      // row (→ update in place), or missing (→ NotFound).
      const status = await prisma.$queryRawUnsafe<
        { has_mirror: boolean; overlay_source: string | null }[]
      >(
        `SELECT
           (m.code IS NOT NULL) AS has_mirror,
           o.source AS overlay_source
         FROM (SELECT $1::text AS code) c
         LEFT JOIN rics_mirror.vendor_master m ON m.code = c.code
         LEFT JOIN app.vendor_overlay o ON o.code = c.code`,
        normalized,
      );
      const row = status[0] ?? { has_mirror: false, overlay_source: null };

      if (row.overlay_source === 'tombstone' || (!row.has_mirror && row.overlay_source == null)) {
        return Err({ kind: 'NotFound', message: `Vendor '${normalized}' not found.` });
      }

      // Target source: native stays native; override/(missing over mirror) → override.
      const nextSource =
        row.overlay_source === 'native' ? 'native' : 'override';

      // Build the overlay payload. Only provided fields are written; unspecified
      // fields keep their existing value if the overlay row already exists, or
      // remain NULL so the mirror shows through (for 'override' rows).
      const payload: Record<string, unknown> = { updatedBy: actor };
      if (patch.name !== undefined) payload.shortName = patch.name;
      if (patch.mailName !== undefined) payload.mailName = patch.mailName;
      if (patch.addr1 !== undefined) payload.addr1 = patch.addr1;
      if (patch.addr2 !== undefined) payload.addr2 = patch.addr2;
      if (patch.city !== undefined) payload.city = patch.city;
      if (patch.state !== undefined) payload.state = patch.state;
      if (patch.zip !== undefined) payload.zip = patch.zip;
      if (patch.phone !== undefined) payload.phone = patch.phone;
      if (patch.fax !== undefined) payload.fax = patch.fax;
      if (patch.contact !== undefined) payload.contact = patch.contact;
      if (patch.terms !== undefined) payload.terms = patch.terms;
      if (patch.shipInst !== undefined) payload.shipInst = patch.shipInst;
      if (patch.comment !== undefined) payload.comment = patch.comment;
      if (patch.manuCode !== undefined) payload.manuCode = patch.manuCode;
      if (patch.manuName !== undefined) payload.manuName = patch.manuName;
      if (patch.qualifierId !== undefined) payload.qualifierId = patch.qualifierId;
      if (patch.qualifierCode !== undefined) payload.qualifierCode = patch.qualifierCode;
      if (patch.colorCode !== undefined) payload.colorCode = patch.colorCode;
      if (patch.longComment !== undefined) payload.longComment = patch.longComment;
      if (patch.email !== undefined) payload.eMail = patch.email;

      if (row.overlay_source == null) {
        // No overlay row yet — insert a fresh override (or native if the code
        // was never in the mirror, which the guard above already ruled out).
        await prisma.vendorOverlay.create({
          data: {
            code: normalized,
            source: nextSource,
            createdBy: actor,
            ...payload,
          } as any,
        });
      } else {
        await prisma.vendorOverlay.update({
          where: { code: normalized },
          data: { source: nextSource, ...payload } as any,
        });
      }

      return this.findByCode(normalized);
    } catch (err) {
      return Err(toPgError(err));
    }
  },

  async delete(code: string, actor = 'system'): Promise<Result<void>> {
    const normalized = normalizeCode(code);
    try {
      const status = await prisma.$queryRawUnsafe<
        { has_mirror: boolean; overlay_source: string | null }[]
      >(
        `SELECT
           (m.code IS NOT NULL) AS has_mirror,
           o.source AS overlay_source
         FROM (SELECT $1::text AS code) c
         LEFT JOIN rics_mirror.vendor_master m ON m.code = c.code
         LEFT JOIN app.vendor_overlay o ON o.code = c.code`,
        normalized,
      );
      const row = status[0] ?? { has_mirror: false, overlay_source: null };

      if (row.overlay_source === 'tombstone' || (!row.has_mirror && row.overlay_source == null)) {
        return Err({ kind: 'NotFound', message: `Vendor '${normalized}' not found.` });
      }

      if (row.overlay_source === 'native') {
        await prisma.vendorOverlay.delete({ where: { code: normalized } });
        return Ok(undefined);
      }

      // has_mirror = true here (either overlay=null+mirror, or overlay='override'+mirror)
      if (row.overlay_source == null) {
        await prisma.vendorOverlay.create({
          data: {
            code: normalized,
            source: 'tombstone',
            createdBy: actor,
            updatedBy: actor,
          },
        });
      } else {
        await prisma.vendorOverlay.update({
          where: { code: normalized },
          data: { source: 'tombstone', updatedBy: actor },
        });
      }
      return Ok(undefined);
    } catch (err) {
      return Err(toPgError(err));
    }
  },

  // ────────────── Per-store accounts ──────────────
  // Store-account reads hit rics_mirror.vendor_accounts only. Writes still disabled
  // pending a separate app.vendor_store_account_overlay design.

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
    return Err({
      kind: 'WriteNotSupported',
      message:
        'Vendor store-account writes are not supported yet. The vendor_overlay was ' +
        'added 2026-04-23 for vendor master data; a separate store-account overlay is pending.',
    });
  },

  async deleteStoreAccount(_code: string, _storeId: number): Promise<Result<void>> {
    return Err({
      kind: 'WriteNotSupported',
      message:
        'Vendor store-account writes are not supported yet. The vendor_overlay was ' +
        'added 2026-04-23 for vendor master data; a separate store-account overlay is pending.',
    });
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
