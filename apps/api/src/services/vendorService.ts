/**
 * Legacy vendor service — now a read-only projection over the app-owned vendor
 * baseline (`app.vendor`) plus `app.vendor_overlay`.
 *
 * Historical: this service used to CRUD the SQLite `vendors` table in
 * `inventory.db`. The SQLite vendor table held only synthetic test rows (5) and
 * the real vendor catalog now lives in the imported app-owned baseline
 * `app.vendor` (rebuilt from RICS by `sync:rics-reference-baselines`).
 *
 * Writes now go through the RICS-backed products module at
 * `/api/v1/products/vendors/*` (see [services/products/vendorService.ts]). This
 * legacy service's create/update/delete paths throw a clear error to redirect
 * callers.
 *
 * The read shape is preserved so the one remaining consumer
 * (`apps/web/src/services/skuApi.ts#fetchVendors`, a dropdown feed for the
 * legacy SKU list) continues working against the real RICS vendor catalog.
 *
 * Shape adapter — app vendor baseline columns → legacy `Vendor`:
 *   code              → id            (string; was UUID, now RICS code)
 *   short_name        → name          (falls back to mail_name, then code)
 *   e_mail            → contactEmail
 *   phone             → phone
 *   — (no RICS equiv) → paymentTerms  (null)
 *   — (no RICS equiv) → leadTimeDays  (null)
 *   — (no RICS equiv) → active        (true — every mirror row is current)
 *   date_last_changed → createdAt/updatedAt  (ISO string)
 */

import { prisma } from '../db/prisma';
import { Vendor } from '../models/vendor';
import { PaginationEnvelope } from '../models/sku';

interface VendorProjectionRow {
  code: string;
  short_name: string | null;
  mail_name: string | null;
  e_mail: string | null;
  phone: string | null;
  date_last_changed: Date | null;
}

function rowToLegacyVendor(row: VendorProjectionRow): Vendor {
  const iso = row.date_last_changed
    ? new Date(row.date_last_changed).toISOString()
    : new Date(0).toISOString();
  const rawName = (row.short_name ?? row.mail_name ?? '').trim();
  return {
    id: row.code,
    name: rawName.length > 0 ? rawName : row.code,
    contactEmail: (row.e_mail ?? '').trim() || null,
    phone: (row.phone ?? '').trim() || null,
    paymentTerms: null, // RICS doesn't track NET_30/60/90
    leadTimeDays: null, // RICS doesn't track lead time here
    active: true, // RICS mirror has no "inactive" flag — every row is current
    createdAt: iso,
    updatedAt: iso,
  };
}

export class VendorWriteNotSupportedError extends Error {
  code = 'WRITE_NOT_SUPPORTED';
  constructor() {
    super(
      'Legacy /api/v1/vendors is now a read-only projection over ' +
        'app.vendor/app.vendor_overlay. Writes are not supported here — use ' +
        '/api/v1/products/vendors/* which goes through the RICS write path with ' +
        'EDI validation and SKU-reference guards.',
    );
    this.name = 'VendorWriteNotSupportedError';
  }
}

export function createVendor(_data: unknown): never {
  throw new VendorWriteNotSupportedError();
}

export function updateVendor(_id: string, _data: unknown): never {
  throw new VendorWriteNotSupportedError();
}

export function deleteVendor(_id: string): never {
  throw new VendorWriteNotSupportedError();
}

function buildVendorEffectiveCte(): string {
  return `
    WITH vendor_effective AS (
      SELECT
        COALESCE(o.code, v.code) AS code,
        COALESCE(o.short_name, v.short_name) AS short_name,
        COALESCE(o.mail_name, v.mail_name) AS mail_name,
        COALESCE(o.e_mail, v.e_mail) AS e_mail,
        COALESCE(o.phone, v.phone) AS phone,
        COALESCE(o.updated_at, v.date_last_changed) AS date_last_changed
      FROM app.vendor v
      FULL OUTER JOIN app.vendor_overlay o ON o.code = v.code
      WHERE (o.source IS NULL OR o.source <> 'tombstone')
        AND (v.code IS NOT NULL OR o.code IS NOT NULL)
    )
  `;
}

export async function getVendorById(code: string): Promise<Vendor | null> {
  const rows = await prisma.$queryRawUnsafe<VendorProjectionRow[]>(
    `
      ${buildVendorEffectiveCte()}
      SELECT code, short_name, mail_name, e_mail, phone, date_last_changed
      FROM vendor_effective
      WHERE UPPER(code) = $1
      LIMIT 1
    `,
    code.trim().toUpperCase(),
  );
  if (rows.length === 0) return null;
  return rowToLegacyVendor(rows[0]);
}

const VENDOR_SORT_MAP: Record<string, string> = {
  name: 'short_name',
  createdAt: 'date_last_changed',
  // leadTimeDays has no RICS equivalent; fall through to default sort
};

export async function listVendors(params: {
  page: number;
  pageSize: number;
  sort?: string;
  order?: 'asc' | 'desc';
  active?: boolean; // accepted for back-compat; ignored (all mirror rows are active)
  q?: string;
}): Promise<PaginationEnvelope<Vendor>> {
  const values: unknown[] = [];
  const where: string[] = [];

  if (params.q && params.q.trim().length > 0) {
    values.push(`%${params.q.trim().toLowerCase()}%`);
    const i = values.length;
    where.push(
      `(LOWER(COALESCE(short_name,'')) LIKE $${i} OR ` +
        `LOWER(COALESCE(mail_name,'')) LIKE $${i} OR ` +
        `LOWER(COALESCE(e_mail,'')) LIKE $${i} OR ` +
        `LOWER(COALESCE(phone,'')) LIKE $${i})`,
    );
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const sortCol = VENDOR_SORT_MAP[params.sort ?? 'name'] ?? 'short_name';
  const sortDir = params.order === 'desc' ? 'DESC' : 'ASC';
  const offset = (params.page - 1) * params.pageSize;

  const countRows = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
    `
      ${buildVendorEffectiveCte()}
      SELECT COUNT(*)::bigint AS total
      FROM vendor_effective
      ${whereClause}
    `,
    ...values,
  );
  const totalItems = Number(countRows[0]?.total ?? 0n);
  const totalPages = Math.max(1, Math.ceil(totalItems / params.pageSize));

  const limitIdx = values.length + 1;
  const offsetIdx = values.length + 2;
  const rows = await prisma.$queryRawUnsafe<VendorProjectionRow[]>(
    `
      ${buildVendorEffectiveCte()}
      SELECT code, short_name, mail_name, e_mail, phone, date_last_changed
      FROM vendor_effective
      ${whereClause}
      ORDER BY ${sortCol} ${sortDir} NULLS LAST, code ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    ...values,
    params.pageSize,
    offset,
  );

  return {
    data: rows.map(rowToLegacyVendor),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
      totalPages,
    },
  };
}
