import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { Vendor, VendorRow, rowToVendor } from '../models/vendor';
import { PaginationEnvelope } from '../models/sku';

type DbValue = null | number | bigint | string;

export function createVendor(data: {
  name: string;
  contactEmail?: string | null;
  phone?: string | null;
  paymentTerms?: string | null;
  leadTimeDays?: number | null;
}): Vendor {
  const db = getDb();
  const id = uuidv4();

  db.prepare(
    'INSERT INTO vendors (id, name, contact_email, phone, payment_terms, lead_time_days) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    data.name,
    data.contactEmail ?? null,
    data.phone ?? null,
    data.paymentTerms ?? null,
    data.leadTimeDays ?? null
  );

  const row = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as unknown as VendorRow;
  return rowToVendor(row);
}

export function getVendorById(id: string): Vendor | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as unknown as VendorRow | undefined;
  if (!row) return null;
  return rowToVendor(row);
}

export function updateVendor(id: string, data: Record<string, unknown>): Vendor | null {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM vendors WHERE id = ?').get(id);
  if (!existing) return null;

  const fieldMap: Record<string, string> = {
    name: 'name',
    contactEmail: 'contact_email',
    phone: 'phone',
    paymentTerms: 'payment_terms',
    leadTimeDays: 'lead_time_days',
    active: 'active',
  };

  const setClauses: string[] = [];
  const values: DbValue[] = [];

  for (const [key, value] of Object.entries(data)) {
    const col = fieldMap[key];
    if (!col) continue;
    setClauses.push(`${col} = ?`);
    values.push(key === 'active' ? (value ? 1 : 0) : value as DbValue);
  }

  if (setClauses.length === 0) return getVendorById(id);

  setClauses.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE vendors SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
  return getVendorById(id);
}

export function deleteVendor(id: string): { deleted: boolean; blocked?: boolean } {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM vendors WHERE id = ?').get(id);
  if (!existing) return { deleted: false };

  // Check if vendor has associated SKUs (acting as PO proxy since PO table doesn't exist yet)
  const skuCount = db.prepare(
    'SELECT COUNT(*) as total FROM skus WHERE vendor_id = ?'
  ).get(id) as unknown as { total: number };

  if (skuCount.total > 0) {
    return { deleted: false, blocked: true };
  }

  db.prepare('DELETE FROM vendors WHERE id = ?').run(id);
  return { deleted: true };
}

const VENDOR_SORT_MAP: Record<string, string> = {
  name: 'name',
  createdAt: 'created_at',
  leadTimeDays: 'lead_time_days',
};

export function listVendors(params: {
  page: number;
  pageSize: number;
  sort?: string;
  order?: 'asc' | 'desc';
  active?: boolean;
  q?: string;
}): PaginationEnvelope<Vendor> {
  const db = getDb();
  const conditions: string[] = [];
  const values: DbValue[] = [];

  if (params.active !== undefined) {
    conditions.push('active = ?');
    values.push(params.active ? 1 : 0);
  }

  if (params.q) {
    const pattern = `%${params.q}%`;
    conditions.push('(name LIKE ? OR contact_email LIKE ? OR phone LIKE ?)');
    values.push(pattern, pattern, pattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(
    `SELECT COUNT(*) as total FROM vendors ${whereClause}`
  ).get(...values) as unknown as { total: number };

  const totalItems = countRow.total;
  const totalPages = Math.ceil(totalItems / params.pageSize);
  const offset = (params.page - 1) * params.pageSize;

  const sortCol = VENDOR_SORT_MAP[params.sort ?? 'name'] || 'name';
  const sortDir = params.order === 'desc' ? 'DESC' : 'ASC';

  const rows = db.prepare(
    `SELECT * FROM vendors ${whereClause} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`
  ).all(...values, params.pageSize, offset) as unknown as VendorRow[];

  return {
    data: rows.map(rowToVendor),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
      totalPages,
    },
  };
}
