import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';

type DbValue = null | number | bigint | string;
import { Sku, SkuRow, SkuListParams, PaginationEnvelope, rowToSku } from '../models/sku';

function generateSkuCode(department: string, brand: string, color: string, size: string): string {
  const db = getDb();
  const prefix = `${department}-${brand.toUpperCase().slice(0, 5)}-${color.toUpperCase().slice(0, 3)}-${size}`;

  const upsert = db.prepare(`
    INSERT INTO sku_code_seq (prefix, next_val) VALUES (?, 1)
    ON CONFLICT(prefix) DO UPDATE SET next_val = next_val + 1
  `);
  upsert.run(prefix);

  const row = db.prepare('SELECT next_val FROM sku_code_seq WHERE prefix = ?').get(prefix) as unknown as { next_val: number };
  return `${prefix}-${String(row.next_val).padStart(3, '0')}`;
}

export function createSku(data: {
  brand: string;
  style: string;
  color: string;
  size: string;
  price: number;
  category: number;
  department: string;
  vendorId: string;
  barcode?: string | null;
  description?: string | null;
  heelType?: string | null;
  material?: string | null;
  active?: boolean;
}): Sku {
  const db = getDb();
  const id = uuidv4();
  const skuCode = generateSkuCode(data.department, data.brand, data.color, data.size);
  const active = data.active !== false ? 1 : 0;

  const stmt = db.prepare(`
    INSERT INTO skus (id, sku_code, brand, style, color, size, price, category, department, vendor_id, barcode, description, heel_type, material, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, skuCode, data.brand, data.style, data.color, data.size, data.price, data.category, data.department, data.vendorId, data.barcode ?? null, data.description ?? null, data.heelType ?? null, data.material ?? null, active);

  // Initialize inventory record
  db.prepare('INSERT INTO inventory (id, sku_id, quantity_on_hand, quantity_reserved) VALUES (?, ?, 0, 0)')
    .run(uuidv4(), id);

  const row = db.prepare('SELECT * FROM skus WHERE id = ?').get(id) as unknown as SkuRow;
  return rowToSku(row, 0);
}

export function getSkuById(id: string): Sku | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM skus WHERE id = ?').get(id) as unknown as SkuRow | undefined;
  if (!row) return null;

  const inv = db.prepare('SELECT quantity_on_hand FROM inventory WHERE sku_id = ?').get(id) as { quantity_on_hand: number } | undefined;
  return rowToSku(row, inv?.quantity_on_hand ?? 0);
}

export function updateSku(id: string, data: Record<string, unknown>): Sku | null {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM skus WHERE id = ?').get(id) as unknown as SkuRow | undefined;
  if (!existing) return null;

  const fieldMap: Record<string, string> = {
    brand: 'brand',
    style: 'style',
    color: 'color',
    size: 'size',
    price: 'price',
    category: 'category',
    department: 'department',
    vendorId: 'vendor_id',
    barcode: 'barcode',
    description: 'description',
    heelType: 'heel_type',
    material: 'material',
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

  if (setClauses.length === 0) return getSkuById(id);

  setClauses.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE skus SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

  return getSkuById(id);
}

export function deactivateSku(id: string): boolean {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM skus WHERE id = ?').get(id);
  if (!existing) return false;

  db.prepare("UPDATE skus SET active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  return true;
}

const SORT_COLUMN_MAP: Record<string, string> = {
  brand: 'brand',
  style: 'style',
  price: 'price',
  createdAt: 'created_at',
};

export function listSkus(params: SkuListParams): PaginationEnvelope<Sku> {
  const db = getDb();
  const conditions: string[] = [];
  const values: DbValue[] = [];

  // Filter: active (default true)
  if (params.active !== undefined) {
    conditions.push('s.active = ?');
    values.push(params.active ? 1 : 0);
  } else {
    conditions.push('s.active = 1');
  }

  // Filter: brand (exact match)
  if (params.brand) {
    conditions.push('s.brand = ?');
    values.push(params.brand);
  }

  // Filter: department
  if (params.department) {
    conditions.push('s.department = ?');
    values.push(params.department);
  }

  // Filter: category
  if (params.category !== undefined) {
    conditions.push('s.category = ?');
    values.push(params.category);
  }

  // Filter: vendorId
  if (params.vendorId) {
    conditions.push('s.vendor_id = ?');
    values.push(params.vendorId);
  }

  // Filter: size
  if (params.size) {
    conditions.push('s.size = ?');
    values.push(params.size);
  }

  // Filter: price range
  if (params.minPrice !== undefined) {
    conditions.push('s.price >= ?');
    values.push(params.minPrice);
  }
  if (params.maxPrice !== undefined) {
    conditions.push('s.price <= ?');
    values.push(params.maxPrice);
  }

  // Filter: full-text search across brand, style, color, barcode
  if (params.q) {
    const pattern = `%${params.q}%`;
    conditions.push('(s.brand LIKE ? OR s.style LIKE ? OR s.color LIKE ? OR s.sku_code LIKE ? OR s.barcode LIKE ?)');
    values.push(pattern, pattern, pattern, pattern, pattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total
  const countRow = db.prepare(`SELECT COUNT(*) as total FROM skus s ${whereClause}`).get(...values) as unknown as { total: number };
  const totalItems = countRow.total;

  // Sort
  const sortCol = SORT_COLUMN_MAP[params.sort] || 'brand';
  const sortDir = params.order === 'desc' ? 'DESC' : 'ASC';

  // Paginate
  const offset = (params.page - 1) * params.pageSize;
  const totalPages = Math.ceil(totalItems / params.pageSize);

  const rows = db.prepare(
    `SELECT s.*, COALESCE(i.quantity_on_hand, 0) as current_stock
     FROM skus s
     LEFT JOIN inventory i ON i.sku_id = s.id
     ${whereClause}
     ORDER BY s.${sortCol} ${sortDir}
     LIMIT ? OFFSET ?`
  ).all(...values, params.pageSize, offset) as unknown as (SkuRow & { current_stock: number })[];

  const data = rows.map((row) => rowToSku(row, row.current_stock));

  return {
    data,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
      totalPages,
    },
  };
}
