import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { CATEGORY_CODE_MAX, CATEGORY_CODE_MIN } from '../constants/domain';

type DbValue = null | number | bigint | string;
import {
  Sku, SkuRow, SkuSize, SkuSizeRow, SkuListParams, PaginationEnvelope,
  ReferenceItem, CategoryItem, ColorItem, SizeLabelItem, StyleColorLink, rowToSku
} from '../models/sku';

// Map camelCase API field → snake_case DB column for all updatable FK/scalar fields
const EXTENDED_FIELDS: Record<string, string> = {
  cost: 'cost',
  vendorSku: 'vendor_sku',
  comment: 'comment',
  keywords: 'keywords',
  season: 'season',
  manufacturer: 'manufacturer',
  pictureUrl: 'picture_url',
  brandId: 'brand_id',
  colorId: 'color_id',
  categoryId: 'category_id',
  heelMaterialId: 'heel_material_id',
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
  style: 'style',
  price: 'price',
  department: 'department',
  vendorId: 'vendor_id',
  barcode: 'barcode',
  ricsDescription: 'rics_description',
  webDescription: 'web_description',
  heelType: 'heel_type',
  material: 'material',
  active: 'active',
  ...EXTENDED_FIELDS,
};

type CanonicalHeelRow = {
  code: string;
  name: string;
};

type StyleColorRow = {
  style_color_id: string;
  brand_id: number;
  style: string;
  color_id: number;
  category_id: number;
  department: Sku['department'];
  heel_type_code: string | null;
  heel_material_type_code: string | null;
  season: string | null;
  active: number;
};

function normalizeCanonicalCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function resolveCanonicalHeelType(input: unknown): CanonicalHeelRow | null {
  const normalized = normalizeCanonicalCode(input);
  if (!normalized) return null;
  const db = getDb();
  const row = db.prepare(`
    SELECT code, name
    FROM ref_heel_types
    WHERE upper(code) = ? OR upper(name) = ?
    LIMIT 1
  `).get(normalized, normalized) as CanonicalHeelRow | undefined;
  return row ?? null;
}

function resolveCanonicalHeelMaterialType(input: unknown): CanonicalHeelRow | null {
  const normalized = normalizeCanonicalCode(input);
  if (!normalized) return null;
  const db = getDb();
  const row = db.prepare(`
    SELECT code, name
    FROM ref_heel_material_types
    WHERE upper(code) = ? OR upper(name) = ?
    LIMIT 1
  `).get(normalized, normalized) as CanonicalHeelRow | undefined;
  return row ?? null;
}

function normalizeCanonicalHeelInputs(data: Record<string, unknown>): void {
  const heelTypeFromCode = resolveCanonicalHeelType(data.heelTypeCode);
  if (heelTypeFromCode) {
    data.heelType = heelTypeFromCode.name;
  } else if (data.heelType != null) {
    const heelTypeFromName = resolveCanonicalHeelType(data.heelType);
    if (heelTypeFromName) {
      data.heelType = heelTypeFromName.name;
      data.heelTypeCode = heelTypeFromName.code;
    }
  }

  const heelMaterialFromCode = resolveCanonicalHeelMaterialType(data.heelMaterialTypeCode);
  if (heelMaterialFromCode) {
    data.material = heelMaterialFromCode.name;
  } else if (data.material != null) {
    const heelMaterialFromName = resolveCanonicalHeelMaterialType(data.material);
    if (heelMaterialFromName) {
      data.material = heelMaterialFromName.name;
      data.heelMaterialTypeCode = heelMaterialFromName.code;
    }
  }
}

function deriveColorFamilyId(colorId: number | null): number | null {
  if (!colorId) return null;
  const db = getDb();
  const row = db.prepare('SELECT color_family_id FROM ref_colors WHERE id = ?').get(colorId) as { color_family_id: number | null } | undefined;
  return row?.color_family_id ?? null;
}

function generateSkuCode(department: string, brandCode: string | null, colorCode: string | null): string {
  const db = getDb();
  const b = brandCode ?? 'NONE';
  const c = colorCode ?? 'XX';
  const prefix = `${department}-${b}-${c}`;

  const upsert = db.prepare(`
    INSERT INTO sku_code_seq (prefix, next_val) VALUES (?, 1)
    ON CONFLICT(prefix) DO UPDATE SET next_val = next_val + 1
  `);
  upsert.run(prefix);

  const row = db.prepare('SELECT next_val FROM sku_code_seq WHERE prefix = ?').get(prefix) as unknown as { next_val: number };
  return `${prefix}-${String(row.next_val).padStart(3, '0')}`;
}

function getSkuSizes(skuId: string): SkuSize[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT ss.id, ss.sku_id, ss.size_label, ss.sort_order, ss.active,
            COALESCE(i.quantity_on_hand, 0) as stock
     FROM sku_sizes ss
     LEFT JOIN inventory i ON i.sku_size_id = ss.id
     WHERE ss.sku_id = ?
     ORDER BY ss.sort_order`
  ).all(skuId) as unknown as (SkuSizeRow & { stock: number })[];

  return rows.map(r => ({
    id: r.id,
    skuId: r.sku_id,
    sizeLabel: r.size_label,
    sortOrder: r.sort_order,
    active: r.active === 1,
    stock: r.stock,
  }));
}

function getTotalStock(skuId: string): number {
  const db = getDb();
  const row = db.prepare('SELECT COALESCE(SUM(quantity_on_hand), 0) as total FROM inventory WHERE sku_id = ?').get(skuId) as { total: number };
  return row.total;
}

function getBrandCode(brandId: number | null): string | null {
  if (!brandId) return null;
  const db = getDb();
  const row = db.prepare('SELECT code FROM ref_brands WHERE id = ?').get(brandId) as { code: string } | undefined;
  return row?.code ?? null;
}

function getColorCode(colorId: number | null): string | null {
  if (!colorId) return null;
  const db = getDb();
  const row = db.prepare('SELECT code FROM ref_colors WHERE id = ?').get(colorId) as { code: string } | undefined;
  return row?.code ?? null;
}

function getCategoryRicsCode(categoryId: number | null): string | null {
  if (!categoryId) return null;
  const db = getDb();
  const row = db.prepare('SELECT rics_code FROM ref_categories WHERE id = ?').get(categoryId) as { rics_code: number } | undefined;
  return row ? String(row.rics_code) : null;
}

function generateRicsDescription(
  department: string,
  categoryId: number | null,
  brandId: number | null,
  colorId: number | null,
  style: string,
): string {
  const dept = (department || '').substring(0, 3).toUpperCase();
  const catCode = getCategoryRicsCode(categoryId) ?? '0';
  const brandCode = getBrandCode(brandId) ?? 'NONE';
  const colorCode = getColorCode(colorId) ?? 'XX';
  const styleShort = (style || '').substring(0, 10).toUpperCase();
  return `${dept}/${catCode}/${brandCode}/${colorCode}/${styleShort}`;
}

function mapStyleColorRow(row: StyleColorRow): StyleColorLink {
  return {
    styleColorId: row.style_color_id,
    brandId: row.brand_id,
    style: row.style,
    colorId: row.color_id,
    categoryId: row.category_id,
    department: row.department,
    heelTypeCode: row.heel_type_code,
    heelMaterialTypeCode: row.heel_material_type_code,
    season: row.season,
    active: row.active === 1,
  };
}

function getStyleColorBySkuId(skuId: string): StyleColorLink | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      sc.id AS style_color_id,
      sc.brand_id,
      sc.style,
      sc.color_id,
      sc.category_id,
      sc.department,
      sc.heel_type_code,
      sc.heel_material_type_code,
      sc.season,
      sc.active
    FROM sku_style_colors ssc
    JOIN style_colors sc ON sc.id = ssc.style_color_id
    WHERE ssc.sku_id = ?
  `).get(skuId) as StyleColorRow | undefined;
  return row ? mapStyleColorRow(row) : null;
}

function upsertStyleColorLinkForSku(skuId: string): void {
  const db = getDb();
  const sku = db.prepare(`
    SELECT
      id,
      brand_id,
      style,
      color_id,
      category_id,
      department,
      heel_type,
      material,
      season,
      active
    FROM skus
    WHERE id = ?
  `).get(skuId) as {
    id: string;
    brand_id: number | null;
    style: string | null;
    color_id: number | null;
    category_id: number | null;
    department: string | null;
    heel_type: string | null;
    material: string | null;
    season: string | null;
    active: number;
  } | undefined;

  if (
    !sku
    || sku.brand_id == null
    || sku.color_id == null
    || sku.style == null
    || sku.category_id == null
    || sku.department == null
    || sku.style.trim().length === 0
  ) {
    db.prepare('DELETE FROM sku_style_colors WHERE sku_id = ?').run(skuId);
    return;
  }

  const heelTypeCode = resolveCanonicalHeelType(sku.heel_type)?.code ?? null;
  const heelMaterialTypeCode = resolveCanonicalHeelMaterialType(sku.material)?.code ?? null;
  const normalizedStyle = sku.style.trim();

  const existing = db.prepare(`
    SELECT id
    FROM style_colors
    WHERE brand_id = ?
      AND color_id = ?
      AND lower(trim(style)) = lower(trim(?))
    LIMIT 1
  `).get(sku.brand_id, sku.color_id, normalizedStyle) as { id: string } | undefined;

  let styleColorId = existing?.id ?? null;
  if (!styleColorId) {
    styleColorId = uuidv4();
    db.prepare(`
      INSERT INTO style_colors (
        id,
        brand_id,
        style,
        color_id,
        category_id,
        department,
        heel_type_code,
        heel_material_type_code,
        season,
        active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      styleColorId,
      sku.brand_id,
      normalizedStyle,
      sku.color_id,
      sku.category_id,
      sku.department,
      heelTypeCode,
      heelMaterialTypeCode,
      sku.season,
      sku.active,
    );
  } else {
    db.prepare(`
      UPDATE style_colors
      SET
        category_id = ?,
        department = ?,
        heel_type_code = ?,
        heel_material_type_code = ?,
        season = ?,
        active = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      sku.category_id,
      sku.department,
      heelTypeCode,
      heelMaterialTypeCode,
      sku.season,
      sku.active,
      styleColorId,
    );
  }

  db.prepare(`
    INSERT INTO sku_style_colors (sku_id, style_color_id)
    VALUES (?, ?)
    ON CONFLICT(sku_id) DO UPDATE SET style_color_id = excluded.style_color_id
  `).run(skuId, styleColorId);
}

function enrichSkuWithCanonicalFields(sku: Sku): Sku {
  const heelTypeCode = resolveCanonicalHeelType(sku.heelType)?.code ?? null;
  const heelMaterialTypeCode = resolveCanonicalHeelMaterialType(sku.material)?.code ?? null;
  return {
    ...sku,
    heelTypeCode,
    heelMaterialTypeCode,
    styleColor: getStyleColorBySkuId(sku.id),
  };
}

class ValidationError extends Error {
  status: number;
  code: string;
  details?: Record<string, string>[];

  constructor(
    message: string,
    status = 400,
    code = 'INVALID_FK',
    details?: Record<string, string>[],
  ) {
    super(message);
    this.name = 'ValidationError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function validateFkExists(table: string, id: number | string, label: string, code = 'INVALID_FK'): void {
  const db = getDb();
  const row = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id);
  if (!row) {
    throw new ValidationError(`Invalid ${label}: no record with id ${id} exists`, 400, code);
  }
}

const FK_VALIDATIONS: { field: string; table: string; label: string; code?: string }[] = [
  { field: 'vendorId', table: 'vendors', label: 'vendorId', code: 'INVALID_VENDOR' },
  { field: 'brandId', table: 'ref_brands', label: 'brandId' },
  { field: 'colorId', table: 'ref_colors', label: 'colorId' },
  { field: 'categoryId', table: 'ref_categories', label: 'categoryId' },
  { field: 'heelMaterialId', table: 'ref_heel_materials', label: 'heelMaterialId' },
];

function validateForeignKeys(data: Record<string, unknown>): void {
  for (const { field, table, label, code } of FK_VALIDATIONS) {
    const value = data[field];
    if (value != null && (typeof value === 'number' || typeof value === 'string')) {
      validateFkExists(table, value, label, code ?? 'INVALID_FK');
    }
  }
}

function validateCategoryRange(categoryId: number): void {
  const db = getDb();
  const row = db.prepare(
    'SELECT rics_code FROM ref_categories WHERE id = ?',
  ).get(categoryId) as { rics_code: number } | undefined;

  if (!row) {
    throw new ValidationError(`Invalid categoryId: no record with id ${categoryId} exists`);
  }

  if (row.rics_code < CATEGORY_CODE_MIN || row.rics_code > CATEGORY_CODE_MAX) {
    throw new ValidationError(
      `Category code must be between ${CATEGORY_CODE_MIN} and ${CATEGORY_CODE_MAX}.`,
      400,
      'VALIDATION_CATEGORY_RANGE',
      [
        { field: 'categoryId', value: String(categoryId) },
        { field: 'categoryCode', value: String(row.rics_code) },
      ],
    );
  }
}

export function createSku(data: Record<string, unknown>): Sku {
  normalizeCanonicalHeelInputs(data);
  validateForeignKeys(data);
  if (typeof data.categoryId === 'number') {
    validateCategoryRange(data.categoryId);
  }

  const db = getDb();
  const id = uuidv4();

  const brandId = (data.brandId as number) ?? null;
  const colorId = (data.colorId as number) ?? null;
  const colorFamilyId = deriveColorFamilyId(colorId);

  // Auto-generate ricsDescription if not provided
  if (!data.ricsDescription) {
    data.ricsDescription = generateRicsDescription(
      data.department as string,
      (data.categoryId as number) ?? null,
      brandId,
      colorId,
      data.style as string,
    );
  }

  const skuCode = (data.skuCode as string) || generateSkuCode(
    data.department as string,
    getBrandCode(brandId),
    getColorCode(colorId)
  );
  const active = data.active !== false ? 1 : 0;

  const columns = [
    'id', 'sku_code', 'style', 'price', 'cost', 'category_id', 'department',
    'vendor_id', 'vendor_sku', 'barcode', 'rics_description', 'web_description',
    'heel_type', 'material', 'active',
    'brand_id', 'color_id', 'color_family_id', 'heel_material_id',
    'comment', 'keywords', 'season', 'manufacturer', 'picture_url',
    'shoe_type_id', 'heel_shape_id', 'heel_height_id', 'toe_shape_id',
    'closure_type_id', 'upper_material_id', 'outsole_material_id', 'finish_id', 'width_type_id',
    'pattern_id', 'occasion_id', 'target_audience_id', 'accessory_id', 'season_id',
    'size_type_id', 'label_type_id',
  ];

  const values: DbValue[] = [
    id, skuCode, data.style as string, data.price as number,
    (data.cost as number) ?? null,
    (data.categoryId as number) ?? null,
    data.department as string,
    data.vendorId as string,
    (data.vendorSku as string) ?? null,
    (data.barcode as string) ?? null,
    (data.ricsDescription as string) ?? null,
    (data.webDescription as string) ?? null,
    (data.heelType as string) ?? null,
    (data.material as string) ?? null,
    active,
    brandId, colorId, colorFamilyId,
    (data.heelMaterialId as number) ?? null,
    (data.comment as string) ?? null,
    (data.keywords as string) ?? null,
    (data.season as string) ?? null,
    (data.manufacturer as string) ?? null,
    (data.pictureUrl as string) ?? null,
    (data.shoeTypeId as number) ?? null,
    (data.heelShapeId as number) ?? null,
    (data.heelHeightId as number) ?? null,
    (data.toeShapeId as number) ?? null,
    (data.closureTypeId as number) ?? null,
    (data.upperMaterialId as number) ?? null,
    (data.outsoleMaterialId as number) ?? null,
    (data.finishId as number) ?? null,
    (data.widthTypeId as number) ?? null,
    (data.patternId as number) ?? null,
    (data.occasionId as number) ?? null,
    (data.targetAudienceId as number) ?? null,
    (data.accessoryId as number) ?? null,
    (data.seasonId as number) ?? null,
    (data.sizeTypeId as number) ?? null,
    (data.labelTypeId as number) ?? null,
  ];

  const placeholders = columns.map(() => '?').join(', ');
  db.prepare(`INSERT INTO skus (${columns.join(', ')}) VALUES (${placeholders})`).run(...values);

  // Create sizes + per-size inventory
  const sizes = data.sizes as string[] | undefined;
  if (sizes && sizes.length > 0) {
    for (let i = 0; i < sizes.length; i++) {
      const sizeId = uuidv4();
      db.prepare('INSERT INTO sku_sizes (id, sku_id, size_label, sort_order) VALUES (?, ?, ?, ?)').run(sizeId, id, sizes[i], i + 1);
      db.prepare('INSERT INTO inventory (id, sku_id, sku_size_id, quantity_on_hand, quantity_reserved) VALUES (?, ?, ?, 0, 0)').run(uuidv4(), id, sizeId);
    }
  } else {
    // No sizes — create a single aggregate inventory record
    db.prepare('INSERT INTO inventory (id, sku_id, quantity_on_hand, quantity_reserved) VALUES (?, ?, 0, 0)').run(uuidv4(), id);
  }

  const row = db.prepare('SELECT * FROM skus WHERE id = ?').get(id) as unknown as SkuRow;
  const skuSizes = getSkuSizes(id);
  upsertStyleColorLinkForSku(id);
  return enrichSkuWithCanonicalFields(rowToSku(row, 0, skuSizes));
}

export function getSkuById(id: string): Sku | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM skus WHERE id = ?').get(id) as unknown as SkuRow | undefined;
  if (!row) return null;

  const totalStock = getTotalStock(id);
  const sizes = getSkuSizes(id);
  return enrichSkuWithCanonicalFields(rowToSku(row, totalStock, sizes));
}

export function lookupSkuByCode(code: string): Sku | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM skus WHERE sku_code = ?').get(code) as unknown as SkuRow | undefined;
  if (!row) return null;

  const totalStock = getTotalStock(row.id);
  const sizes = getSkuSizes(row.id);
  return enrichSkuWithCanonicalFields(rowToSku(row, totalStock, sizes));
}

export function updateSku(id: string, data: Record<string, unknown>): Sku | null {
  normalizeCanonicalHeelInputs(data);
  validateForeignKeys(data);
  if (typeof data.categoryId === 'number') {
    validateCategoryRange(data.categoryId);
  }

  const db = getDb();
  const existing = db.prepare('SELECT * FROM skus WHERE id = ?').get(id) as unknown as SkuRow | undefined;
  if (!existing) return null;

  const setClauses: string[] = [];
  const values: DbValue[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === 'sizes') continue; // handled separately
    const col = ALL_FIELD_MAP[key];
    if (!col) continue;
    setClauses.push(`${col} = ?`);
    values.push(key === 'active' ? (value ? 1 : 0) : value as DbValue);
  }

  // Auto-derive color_family_id when colorId changes
  if ('colorId' in data) {
    const newColorFamilyId = deriveColorFamilyId(data.colorId as number | null);
    setClauses.push('color_family_id = ?');
    values.push(newColorFamilyId);
  }

  if (setClauses.length > 0) {
    setClauses.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE skus SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
  }

  upsertStyleColorLinkForSku(id);

  // Update sizes if provided
  const sizes = data.sizes as string[] | undefined;
  if (sizes) {
    // Remove old sizes and their inventory
    db.prepare('DELETE FROM inventory WHERE sku_size_id IN (SELECT id FROM sku_sizes WHERE sku_id = ?)').run(id);
    db.prepare('DELETE FROM sku_sizes WHERE sku_id = ?').run(id);
    // Create new sizes
    for (let i = 0; i < sizes.length; i++) {
      const sizeId = uuidv4();
      db.prepare('INSERT INTO sku_sizes (id, sku_id, size_label, sort_order) VALUES (?, ?, ?, ?)').run(sizeId, id, sizes[i], i + 1);
      db.prepare('INSERT INTO inventory (id, sku_id, sku_size_id, quantity_on_hand, quantity_reserved) VALUES (?, ?, ?, 0, 0)').run(uuidv4(), id, sizeId);
    }
  }

  return getSkuById(id);
}

export function deactivateSku(id: string): boolean {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM skus WHERE id = ?').get(id);
  if (!existing) return false;

  db.prepare("UPDATE skus SET active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  upsertStyleColorLinkForSku(id);
  return true;
}

const SORT_COLUMN_MAP: Record<string, string> = {
  style: 'style',
  price: 'price',
  createdAt: 'created_at',
};

export function listSkus(params: SkuListParams): PaginationEnvelope<Sku> {
  const db = getDb();
  const conditions: string[] = [];
  const values: DbValue[] = [];

  if (params.active !== undefined) {
    conditions.push('s.active = ?');
    values.push(params.active ? 1 : 0);
  } else {
    conditions.push('s.active = 1');
  }

  if (params.brandId) {
    conditions.push('s.brand_id = ?');
    values.push(params.brandId);
  }

  if (params.department) {
    conditions.push('s.department = ?');
    values.push(params.department);
  }

  if (params.categoryId !== undefined) {
    conditions.push('s.category_id = ?');
    values.push(params.categoryId);
  }

  if (params.vendorId) {
    conditions.push('s.vendor_id = ?');
    values.push(params.vendorId);
  }

  if (params.minPrice !== undefined) {
    conditions.push('s.price >= ?');
    values.push(params.minPrice);
  }
  if (params.maxPrice !== undefined) {
    conditions.push('s.price <= ?');
    values.push(params.maxPrice);
  }

  if (params.q) {
    const pattern = `%${params.q}%`;
    conditions.push('(s.style LIKE ? OR s.sku_code LIKE ? OR s.barcode LIKE ? OR s.web_description LIKE ? OR s.rics_description LIKE ?)');
    values.push(pattern, pattern, pattern, pattern, pattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM skus s ${whereClause}`).get(...values) as unknown as { total: number };
  const totalItems = countRow.total;

  const sortCol = SORT_COLUMN_MAP[params.sort] || 'style';
  const sortDir = params.order === 'desc' ? 'DESC' : 'ASC';

  const offset = (params.page - 1) * params.pageSize;
  const totalPages = Math.ceil(totalItems / params.pageSize);

  const rows = db.prepare(
    `SELECT s.*
     FROM skus s
     ${whereClause}
     ORDER BY s.${sortCol} ${sortDir}
     LIMIT ? OFFSET ?`
  ).all(...values, params.pageSize, offset) as unknown as SkuRow[];

  const data = rows.map((row) => {
    const totalStock = getTotalStock(row.id);
    const sizes = getSkuSizes(row.id);
    return enrichSkuWithCanonicalFields(rowToSku(row, totalStock, sizes));
  });

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

// ── Reference data ──────────────────────────────────────────

// Simple ref tables (id, name, active)
const SIMPLE_REF_TABLES: Record<string, string> = {
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

// Tables with code column
const CODED_REF_TABLES: Record<string, string> = {
  'brands': 'ref_brands',
  'heel-materials': 'ref_heel_materials',
};

const CANONICAL_CODE_REF_TABLES: Record<string, string> = {
  'heel-types': 'ref_heel_types',
  'heel-material-types': 'ref_heel_material_types',
};

export function getReferenceTableNames(): string[] {
  return [
    ...Object.keys(SIMPLE_REF_TABLES),
    ...Object.keys(CODED_REF_TABLES),
    ...Object.keys(CANONICAL_CODE_REF_TABLES),
    'categories',
    'colors',
    'size-labels',
  ];
}

export function getReferenceData(tableName: string): ReferenceItem[] | CategoryItem[] | ColorItem[] | SizeLabelItem[] | null {
  const db = getDb();

  // Simple tables
  if (SIMPLE_REF_TABLES[tableName]) {
    const table = SIMPLE_REF_TABLES[tableName];
    const rows = db.prepare(`SELECT id, name, active FROM ${table} WHERE active = 1 ORDER BY name`).all() as unknown as { id: number; name: string; active: number }[];
    return rows.map(r => ({ id: r.id, name: r.name, active: r.active === 1 }));
  }

  // Coded tables (brands, heel-materials)
  if (CODED_REF_TABLES[tableName]) {
    const table = CODED_REF_TABLES[tableName];
    const extraWhere = tableName === 'heel-materials'
      ? " AND upper(code) <> 'PLAN' AND lower(trim(name)) <> 'plano'"
      : '';
    const rows = db.prepare(`SELECT id, code, name, active FROM ${table} WHERE active = 1${extraWhere} ORDER BY name`).all() as unknown as { id: number; code: string; name: string; active: number }[];
    return rows.map(r => ({ id: r.id, code: r.code, name: r.name, active: r.active === 1 }));
  }

  // Canonical code tables do not have integer ids, so we emit a stable synthetic ordinal id.
  if (CANONICAL_CODE_REF_TABLES[tableName]) {
    const table = CANONICAL_CODE_REF_TABLES[tableName];
    const rows = db.prepare(`SELECT code, name, active FROM ${table} WHERE active = 1 ORDER BY name`).all() as unknown as { code: string; name: string; active: number }[];
    return rows.map((r, idx) => ({ id: idx + 1, code: r.code, name: r.name, active: r.active === 1 }));
  }

  // Categories (includes rics_code and dept_macro)
  if (tableName === 'categories') {
    const rows = db.prepare('SELECT id, rics_code, name, dept_macro, active FROM ref_categories WHERE active = 1 ORDER BY rics_code').all() as unknown as { id: number; rics_code: number; name: string; dept_macro: string; active: number }[];
    return rows.map(r => ({
      id: r.id,
      ricsCode: r.rics_code,
      name: r.name,
      deptMacro: r.dept_macro as CategoryItem['deptMacro'],
      active: r.active === 1,
    }));
  }

  // Colors (includes code and color_family_id)
  if (tableName === 'colors') {
    const rows = db.prepare('SELECT id, code, name, color_family_id, active FROM ref_colors WHERE active = 1 ORDER BY name').all() as unknown as { id: number; code: string; name: string; color_family_id: number | null; active: number }[];
    return rows.map(r => ({ id: r.id, code: r.code, name: r.name, colorFamilyId: r.color_family_id, active: r.active === 1 }));
  }

  // Size labels (all, grouped by size type)
  if (tableName === 'size-labels') {
    const rows = db.prepare('SELECT id, size_type_id, label, sort_order, active FROM ref_size_labels WHERE active = 1 ORDER BY size_type_id, sort_order').all() as unknown as { id: number; size_type_id: number; label: string; sort_order: number; active: number }[];
    return rows.map(r => ({ id: r.id, sizeTypeId: r.size_type_id, label: r.label, sortOrder: r.sort_order, active: r.active === 1 }));
  }

  return null;
}

export function getSizeLabelsBySizeType(sizeTypeId: number): SizeLabelItem[] {
  const db = getDb();
  const rows = db.prepare('SELECT id, size_type_id, label, sort_order, active FROM ref_size_labels WHERE size_type_id = ? AND active = 1 ORDER BY sort_order').all(sizeTypeId) as unknown as { id: number; size_type_id: number; label: string; sort_order: number; active: number }[];
  return rows.map(r => ({ id: r.id, sizeTypeId: r.size_type_id, label: r.label, sortOrder: r.sort_order, active: r.active === 1 }));
}

export function autocompleteSkus(prefix: string): { skuCode: string; style: string; brandName: string }[] {
  if (!prefix) return [];
  const db = getDb();
  const rows = db.prepare(`
    SELECT s.sku_code, s.style, COALESCE(b.name, '') as brand_name
    FROM skus s
    LEFT JOIN ref_brands b ON b.id = s.brand_id
    WHERE s.active = 1 AND s.sku_code LIKE ? COLLATE NOCASE
    ORDER BY s.sku_code ASC
    LIMIT 10
  `).all(`${prefix}%`) as unknown as { sku_code: string; style: string; brand_name: string }[];
  return rows.map(r => ({ skuCode: r.sku_code, style: r.style, brandName: r.brand_name }));
}

export function getSkuStyleColorLink(skuId: string): StyleColorLink | null {
  return getStyleColorBySkuId(skuId);
}

export function listStyleColors(params?: {
  brandId?: number;
  colorId?: number;
  department?: Sku['department'];
  active?: boolean;
}): StyleColorLink[] {
  const db = getDb();
  const conditions: string[] = [];
  const values: DbValue[] = [];

  if (params?.brandId != null) {
    conditions.push('sc.brand_id = ?');
    values.push(params.brandId);
  }
  if (params?.colorId != null) {
    conditions.push('sc.color_id = ?');
    values.push(params.colorId);
  }
  if (params?.department != null) {
    conditions.push('sc.department = ?');
    values.push(params.department);
  }
  if (params?.active != null) {
    conditions.push('sc.active = ?');
    values.push(params.active ? 1 : 0);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT
      sc.id AS style_color_id,
      sc.brand_id,
      sc.style,
      sc.color_id,
      sc.category_id,
      sc.department,
      sc.heel_type_code,
      sc.heel_material_type_code,
      sc.season,
      sc.active
    FROM style_colors sc
    ${whereClause}
    ORDER BY sc.department ASC, sc.style ASC
  `).all(...values) as StyleColorRow[];

  return rows.map(mapStyleColorRow);
}

export function getAllReferenceData(): Record<string, unknown[]> {
  const result: Record<string, unknown[]> = {};
  for (const key of getReferenceTableNames()) {
    result[key] = getReferenceData(key) || [];
  }
  return result;
}
