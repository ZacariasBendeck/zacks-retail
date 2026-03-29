import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';

type DbValue = null | number | bigint | string;
import { Sku, SkuRow, SkuListParams, PaginationEnvelope, ReferenceItem, rowToSku } from '../models/sku';

// All new nullable fields on the SKU
const EXTENDED_FIELDS: Record<string, string> = {
  cost: 'cost',
  vendorSku: 'vendor_sku',
  comment: 'comment',
  keywords: 'keywords',
  season: 'season',
  manufacturer: 'manufacturer',
  pictureUrl: 'picture_url',
  colorFamilyId: 'color_family_id',
  shoeTypeId: 'shoe_type_id',
  heelShapeId: 'heel_shape_id',
  heelHeightId: 'heel_height_id',
  toeShapeId: 'toe_shape_id',
  closureTypeId: 'closure_type_id',
  upperMaterialId: 'upper_material_id',
  outsoleMaterialId: 'outsole_material_id',
  finishId: 'finish_id',
  widthTypeId: 'width_type_id',
  patternId: 'pattern_id',
  occasionId: 'occasion_id',
  targetAudienceId: 'target_audience_id',
  accessoryId: 'accessory_id',
  seasonId: 'season_id',
  sizeTypeId: 'size_type_id',
  labelTypeId: 'label_type_id',
};

const ALL_FIELD_MAP: Record<string, string> = {
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
  ...EXTENDED_FIELDS,
};

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

export function createSku(data: Record<string, unknown>): Sku {
  const db = getDb();
  const id = uuidv4();
  const skuCode = (data.skuCode as string) || generateSkuCode(
    data.department as string, data.brand as string, data.color as string, data.size as string
  );
  const active = data.active !== false ? 1 : 0;

  const columns = [
    'id', 'sku_code', 'brand', 'style', 'color', 'size', 'price', 'category', 'department',
    'vendor_id', 'barcode', 'description', 'heel_type', 'material', 'active',
    'cost', 'vendor_sku', 'comment', 'keywords', 'season', 'manufacturer', 'picture_url',
    'color_family_id', 'shoe_type_id', 'heel_shape_id', 'heel_height_id', 'toe_shape_id',
    'closure_type_id', 'upper_material_id', 'outsole_material_id', 'finish_id', 'width_type_id',
    'pattern_id', 'occasion_id', 'target_audience_id', 'accessory_id', 'season_id',
    'size_type_id', 'label_type_id',
  ];

  const values: DbValue[] = [
    id, skuCode, data.brand as string, data.style as string, data.color as string,
    data.size as string, data.price as number, data.category as number, data.department as string,
    data.vendorId as string, (data.barcode as string) ?? null, (data.description as string) ?? null,
    (data.heelType as string) ?? null, (data.material as string) ?? null, active,
    (data.cost as number) ?? null, (data.vendorSku as string) ?? null, (data.comment as string) ?? null,
    (data.keywords as string) ?? null, (data.season as string) ?? null, (data.manufacturer as string) ?? null,
    (data.pictureUrl as string) ?? null,
    (data.colorFamilyId as number) ?? null, (data.shoeTypeId as number) ?? null,
    (data.heelShapeId as number) ?? null, (data.heelHeightId as number) ?? null,
    (data.toeShapeId as number) ?? null, (data.closureTypeId as number) ?? null,
    (data.upperMaterialId as number) ?? null, (data.outsoleMaterialId as number) ?? null,
    (data.finishId as number) ?? null, (data.widthTypeId as number) ?? null,
    (data.patternId as number) ?? null, (data.occasionId as number) ?? null,
    (data.targetAudienceId as number) ?? null, (data.accessoryId as number) ?? null,
    (data.seasonId as number) ?? null, (data.sizeTypeId as number) ?? null,
    (data.labelTypeId as number) ?? null,
  ];

  const placeholders = columns.map(() => '?').join(', ');
  const stmt = db.prepare(`INSERT INTO skus (${columns.join(', ')}) VALUES (${placeholders})`);
  stmt.run(...values);

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

export function lookupSkuByCode(code: string): Sku | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM skus WHERE sku_code = ?').get(code) as unknown as SkuRow | undefined;
  if (!row) return null;

  const inv = db.prepare('SELECT quantity_on_hand FROM inventory WHERE sku_id = ?').get(row.id) as { quantity_on_hand: number } | undefined;
  return rowToSku(row, inv?.quantity_on_hand ?? 0);
}

export function updateSku(id: string, data: Record<string, unknown>): Sku | null {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM skus WHERE id = ?').get(id) as unknown as SkuRow | undefined;
  if (!existing) return null;

  const setClauses: string[] = [];
  const values: DbValue[] = [];

  for (const [key, value] of Object.entries(data)) {
    const col = ALL_FIELD_MAP[key];
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

// Reference data
const REFERENCE_TABLES: Record<string, string> = {
  'color-families': 'ref_color_families',
  'shoe-types': 'ref_shoe_types',
  'heel-shapes': 'ref_heel_shapes',
  'heel-heights': 'ref_heel_heights',
  'toe-shapes': 'ref_toe_shapes',
  'closure-types': 'ref_closure_types',
  'upper-materials': 'ref_upper_materials',
  'outsole-materials': 'ref_outsole_materials',
  'finishes': 'ref_finishes',
  'width-types': 'ref_width_types',
  'patterns': 'ref_patterns',
  'occasions': 'ref_occasions',
  'target-audiences': 'ref_target_audiences',
  'accessories': 'ref_accessories',
  'seasons': 'ref_seasons',
  'size-types': 'ref_size_types',
  'label-types': 'ref_label_types',
};

export function getReferenceTableNames(): string[] {
  return Object.keys(REFERENCE_TABLES);
}

export function getReferenceData(tableName: string): ReferenceItem[] | null {
  const table = REFERENCE_TABLES[tableName];
  if (!table) return null;

  const db = getDb();
  const rows = db.prepare(`SELECT id, name, active FROM ${table} WHERE active = 1 ORDER BY name`).all() as unknown as { id: number; name: string; active: number }[];
  return rows.map(r => ({ id: r.id, name: r.name, active: r.active === 1 }));
}

export function getAllReferenceData(): Record<string, ReferenceItem[]> {
  const result: Record<string, ReferenceItem[]> = {};
  for (const key of Object.keys(REFERENCE_TABLES)) {
    result[key] = getReferenceData(key) || [];
  }
  return result;
}
