import { getDb } from '../db/database';
import { SkuRow, SkuSizeRow } from '../models/sku';

type DbValue = null | number | bigint | string;

// ── Public-facing product types ────────────────────────────────────

export interface ProductCard {
  id: string;
  name: string;
  brand: string | null;
  price: number;
  mainImage: string | null;
  rating: number | null;
  colorSwatches: { colorId: number; name: string; code: string }[];
  department: string;
  style: string;
}

export interface ProductDetail {
  id: string;
  skuCode: string;
  name: string;
  brand: string | null;
  price: number;
  department: string;
  style: string;
  description: string | null;
  material: string | null;
  heelType: string | null;
  mainImage: string | null;
  rating: number | null;
  category: string | null;
  color: string | null;
  availableSizes: { id: string; label: string; inStock: boolean }[];
  availableColors: { colorId: number; name: string; code: string }[];
  specs: Record<string, string | null>;
}

export interface FacetValue {
  id: number;
  name: string;
  count: number;
}

export interface PriceRange {
  min: number;
  max: number;
}

export interface FacetsResult {
  brands: FacetValue[];
  colors: FacetValue[];
  sizes: { label: string; count: number }[];
  categories: FacetValue[];
  departments: { name: string; count: number }[];
  materials: { name: string; count: number }[];
  priceRange: PriceRange;
}

export interface ProductListParams {
  page: number;
  limit: number;
  sort: string;
  order: 'asc' | 'desc';
  brandId?: number;
  colorId?: number;
  sizeLabel?: string;
  categoryId?: number;
  department?: string;
  minPrice?: number;
  maxPrice?: number;
  materialId?: number;
  shoeTypeId?: number;
  q?: string;
}

export interface PaginatedProducts {
  data: ProductCard[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

// ── Sort mapping ───────────────────────────────────────────────────

const SORT_MAP: Record<string, string> = {
  price: 's.price',
  newest: 's.created_at',
  name: 's.style',
};

// ── Helpers ────────────────────────────────────────────────────────

function getBrandName(brandId: number | null): string | null {
  if (!brandId) return null;
  const db = getDb();
  const row = db.prepare('SELECT name FROM ref_brands WHERE id = ?').get(brandId) as { name: string } | undefined;
  return row?.name ?? null;
}

function getColorSwatchesForStyle(style: string): { colorId: number; name: string; code: string }[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT rc.id as colorId, rc.name, rc.code
    FROM skus s
    JOIN ref_colors rc ON rc.id = s.color_id
    WHERE s.style = ? AND s.active = 1 AND s.color_id IS NOT NULL
    ORDER BY rc.name
  `).all(style) as unknown as { colorId: number; name: string; code: string }[];
  return rows;
}

function skuToProductCard(row: SkuRow): ProductCard {
  return {
    id: row.id,
    name: row.style,
    brand: getBrandName(row.brand_id),
    price: row.price,
    mainImage: row.picture_url,
    rating: null,
    colorSwatches: getColorSwatchesForStyle(row.style),
    department: row.department,
    style: row.style,
  };
}

// ── List products ──────────────────────────────────────────────────

export function listProducts(params: ProductListParams): PaginatedProducts {
  const db = getDb();
  const conditions: string[] = ['s.active = 1'];
  const values: DbValue[] = [];

  if (params.brandId) {
    conditions.push('s.brand_id = ?');
    values.push(params.brandId);
  }
  if (params.colorId) {
    conditions.push('s.color_id = ?');
    values.push(params.colorId);
  }
  if (params.categoryId) {
    conditions.push('s.category_id = ?');
    values.push(params.categoryId);
  }
  if (params.department) {
    conditions.push('s.department = ?');
    values.push(params.department);
  }
  if (params.minPrice !== undefined) {
    conditions.push('s.price >= ?');
    values.push(params.minPrice);
  }
  if (params.maxPrice !== undefined) {
    conditions.push('s.price <= ?');
    values.push(params.maxPrice);
  }
  if (params.materialId) {
    conditions.push('s.upper_material_id = ?');
    values.push(params.materialId);
  }
  if (params.shoeTypeId) {
    conditions.push('s.shoe_type_id = ?');
    values.push(params.shoeTypeId);
  }
  if (params.sizeLabel) {
    conditions.push('EXISTS (SELECT 1 FROM sku_sizes ss WHERE ss.sku_id = s.id AND ss.size_label = ? AND ss.active = 1)');
    values.push(params.sizeLabel);
  }
  if (params.q) {
    const pattern = `%${params.q}%`;
    conditions.push('(s.style LIKE ? OR s.web_description LIKE ? OR s.sku_code LIKE ?)');
    values.push(pattern, pattern, pattern);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // Count
  const countRow = db.prepare(`SELECT COUNT(*) as total FROM skus s ${whereClause}`).get(...values) as unknown as { total: number };
  const totalItems = countRow.total;

  // Sort
  const sortCol = SORT_MAP[params.sort] || 's.style';
  const sortDir = params.order === 'desc' ? 'DESC' : 'ASC';

  const offset = (params.page - 1) * params.limit;
  const totalPages = Math.ceil(totalItems / params.limit);

  const rows = db.prepare(`
    SELECT s.* FROM skus s
    ${whereClause}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ? OFFSET ?
  `).all(...values, params.limit, offset) as unknown as SkuRow[];

  const data = rows.map(skuToProductCard);

  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      totalItems,
      totalPages,
    },
  };
}

// ── Product detail ─────────────────────────────────────────────────

function getRefName(table: string, id: number | null): string | null {
  if (!id) return null;
  const db = getDb();
  const row = db.prepare(`SELECT name FROM ${table} WHERE id = ?`).get(id) as { name: string } | undefined;
  return row?.name ?? null;
}

export function getProductById(id: string): ProductDetail | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM skus WHERE id = ? AND active = 1').get(id) as unknown as SkuRow | undefined;
  if (!row) return null;

  // Get sizes with stock info
  const sizeRows = db.prepare(`
    SELECT ss.id, ss.sku_id, ss.size_label, ss.sort_order, ss.active,
           COALESCE(i.quantity_on_hand, 0) as stock
    FROM sku_sizes ss
    LEFT JOIN inventory i ON i.sku_size_id = ss.id
    WHERE ss.sku_id = ? AND ss.active = 1
    ORDER BY ss.sort_order
  `).all(id) as unknown as (SkuSizeRow & { stock: number })[];

  const availableSizes = sizeRows.map(sr => ({
    id: sr.id,
    label: sr.size_label,
    inStock: sr.stock > 0,
  }));

  // Get available colors for this style
  const availableColors = getColorSwatchesForStyle(row.style);

  // Build specs from reference data
  const specs: Record<string, string | null> = {
    shoeType: getRefName('ref_shoe_types', row.shoe_type_id),
    heelShape: getRefName('ref_heel_shapes', row.heel_shape_id),
    heelHeight: getRefName('ref_heel_heights', row.heel_height_id),
    toeShape: getRefName('ref_toe_shapes', row.toe_shape_id),
    closureType: getRefName('ref_closure_types', row.closure_type_id),
    upperMaterial: getRefName('ref_upper_materials', row.upper_material_id),
    outsoleMaterial: getRefName('ref_outsole_materials', row.outsole_material_id),
    finish: getRefName('ref_finishes', row.finish_id),
    widthType: getRefName('ref_width_types', row.width_type_id),
    pattern: getRefName('ref_patterns', row.pattern_id),
    occasion: getRefName('ref_occasions', row.occasion_id),
    heelType: row.heel_type,
    material: row.material,
  };

  // Get category name
  let categoryName: string | null = null;
  if (row.category_id) {
    const catRow = db.prepare('SELECT name FROM ref_categories WHERE id = ?').get(row.category_id) as { name: string } | undefined;
    categoryName = catRow?.name ?? null;
  }

  return {
    id: row.id,
    skuCode: row.sku_code,
    name: row.style,
    brand: getBrandName(row.brand_id),
    price: row.price,
    department: row.department,
    style: row.style,
    description: row.web_description,
    material: row.material,
    heelType: row.heel_type,
    mainImage: row.picture_url,
    rating: null,
    category: categoryName,
    color: getRefName('ref_colors', row.color_id),
    availableSizes,
    availableColors,
    specs,
  };
}

// ── Facets ──────────────────────────────────────────────────────────

export interface FacetFilterParams {
  department?: string;
  categoryId?: number;
  brandId?: number;
  colorId?: number;
  size?: string;
  material?: string;
}

/**
 * Build WHERE conditions from active filters, optionally excluding one dimension.
 * This enables cross-dimensional counting: for each facet, we apply all OTHER
 * active filters but not the one being counted.
 */
function buildFacetConditions(
  filters: FacetFilterParams,
  exclude?: keyof FacetFilterParams,
): { conditions: string[]; values: DbValue[] } {
  const conditions: string[] = ['s.active = 1'];
  const values: DbValue[] = [];

  if (exclude !== 'department' && filters.department) {
    conditions.push('s.department = ?');
    values.push(filters.department);
  }
  if (exclude !== 'categoryId' && filters.categoryId) {
    conditions.push('s.category_id = ?');
    values.push(filters.categoryId);
  }
  if (exclude !== 'brandId' && filters.brandId) {
    conditions.push('s.brand_id = ?');
    values.push(filters.brandId);
  }
  if (exclude !== 'colorId' && filters.colorId) {
    conditions.push('s.color_id = ?');
    values.push(filters.colorId);
  }
  if (exclude !== 'size' && filters.size) {
    conditions.push('EXISTS (SELECT 1 FROM sku_sizes ss2 WHERE ss2.sku_id = s.id AND ss2.size_label = ? AND ss2.active = 1)');
    values.push(filters.size);
  }
  if (exclude !== 'material' && filters.material) {
    conditions.push('s.upper_material_id IN (SELECT id FROM ref_upper_materials WHERE name = ?)');
    values.push(filters.material);
  }

  return { conditions, values };
}

export function getProductFacets(filters: FacetFilterParams = {}): FacetsResult {
  const db = getDb();

  // Brands — exclude brandId filter
  const brandWhere = buildFacetConditions(filters, 'brandId');
  const brands = db.prepare(`
    SELECT rb.id, rb.name, COUNT(DISTINCT s.style) as count
    FROM skus s
    JOIN ref_brands rb ON rb.id = s.brand_id
    WHERE ${brandWhere.conditions.join(' AND ')}
    GROUP BY rb.id, rb.name
    HAVING count > 0
    ORDER BY count DESC
  `).all(...brandWhere.values) as unknown as FacetValue[];

  // Colors — exclude colorId filter
  const colorWhere = buildFacetConditions(filters, 'colorId');
  const colors = db.prepare(`
    SELECT rc.id, rc.name, COUNT(DISTINCT s.style) as count
    FROM skus s
    JOIN ref_colors rc ON rc.id = s.color_id
    WHERE ${colorWhere.conditions.join(' AND ')}
    GROUP BY rc.id, rc.name
    HAVING count > 0
    ORDER BY count DESC
  `).all(...colorWhere.values) as unknown as FacetValue[];

  // Sizes — exclude size filter
  const sizeWhere = buildFacetConditions(filters, 'size');
  const sizes = db.prepare(`
    SELECT ss.size_label as label, COUNT(DISTINCT s.style) as count
    FROM sku_sizes ss
    JOIN skus s ON s.id = ss.sku_id
    WHERE ${sizeWhere.conditions.join(' AND ')} AND ss.active = 1
    GROUP BY ss.size_label
    HAVING count > 0
    ORDER BY ss.size_label
  `).all(...sizeWhere.values) as unknown as { label: string; count: number }[];

  // Categories — exclude categoryId filter
  const catWhere = buildFacetConditions(filters, 'categoryId');
  const categories = db.prepare(`
    SELECT rc.id, rc.name, COUNT(DISTINCT s.style) as count
    FROM skus s
    JOIN ref_categories rc ON rc.id = s.category_id
    WHERE ${catWhere.conditions.join(' AND ')}
    GROUP BY rc.id, rc.name
    HAVING count > 0
    ORDER BY count DESC
  `).all(...catWhere.values) as unknown as FacetValue[];

  // Departments — exclude department filter
  const deptWhere = buildFacetConditions(filters, 'department');
  const departments = db.prepare(`
    SELECT s.department as name, COUNT(DISTINCT s.style) as count
    FROM skus s
    WHERE ${deptWhere.conditions.join(' AND ')}
    GROUP BY s.department
    HAVING count > 0
    ORDER BY count DESC
  `).all(...deptWhere.values) as unknown as { name: string; count: number }[];

  // Materials — exclude material filter
  const matWhere = buildFacetConditions(filters, 'material');
  const materials = db.prepare(`
    SELECT rum.name, COUNT(DISTINCT s.style) as count
    FROM skus s
    JOIN ref_upper_materials rum ON rum.id = s.upper_material_id
    WHERE ${matWhere.conditions.join(' AND ')}
    GROUP BY rum.name
    HAVING count > 0
    ORDER BY count DESC
  `).all(...matWhere.values) as unknown as { name: string; count: number }[];

  // Price range — apply ALL filters (no exclusion)
  const priceWhere = buildFacetConditions(filters);
  const priceRow = db.prepare(`
    SELECT COALESCE(MIN(s.price), 0) as min, COALESCE(MAX(s.price), 0) as max
    FROM skus s
    WHERE ${priceWhere.conditions.join(' AND ')}
  `).get(...priceWhere.values) as unknown as PriceRange;

  return {
    brands,
    colors,
    sizes,
    categories,
    departments,
    materials,
    priceRange: priceRow,
  };
}
