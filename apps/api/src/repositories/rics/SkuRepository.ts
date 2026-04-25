/**
 * SKU repository - app-owned Postgres read surface over `app.sku`.
 *
 * Reads come from the imported app-owned SKU table plus the lightweight
 * override tables that sit on top of it. Queries are pushed down into SQL so
 * Render does not have to load the entire catalog just to answer `limit=1`.
 *
 * Write support for the old InventoryMaster + InvCatalog shape remains
 * disabled. The Access write path is gone, and a full app-owned replacement
 * for those legacy-only overlay fields is still pending.
 */

import { Pool } from 'pg';
import { Err, Ok, type Result } from './repoResult';
import { notFound } from './prismaErrors';

export type CurrentPriceSlot = 'LIST' | 'RETAIL' | 'MD1' | 'MD2';

export interface Sku {
  code: string;
  vendorSku: string | null;
  category: number | null;
  vendor: string | null;
  sizeType: number | null;
  description: string;
  styleColor: string | null;
  season: string | null;
  location: string | null;
  listPrice: number | null;
  retailPrice: number;
  mdPrice1: number | null;
  mdPrice2: number | null;
  currentPriceSlot: CurrentPriceSlot;
  currentCost: number | null;
  oversizeColumn: string | null;
  oversizeAmount: number | null;
  perks: number | null;
  manufacturer: string | null;
  labelCode: string | null;
  colorCode: string | null;
  comment: string | null;
  groupCode: string | null;
  keywords: string[];
  pictureFileName: string | null;
  coupon: boolean;
  lastPriceChange: Date | null;
  status: string | null;
  dateLastChanged: Date | null;
  orderMultiple: number | null;
  orderUom: string | null;
  longColor: string | null;
  boldDesc: string | null;
  paraDesc: string | null;
  catalogSku: string | null;
  bulletText: string[];
  pictureName01: string | null;
  pictureName02: string | null;
  sizeText: string | null;
  webFileName: string | null;
}

export interface SkuInput {
  code: string;
  vendorSku?: string | null;
  category: number;
  vendor: string;
  sizeType?: number | null;
  description: string;
  styleColor?: string | null;
  season?: string | null;
  location?: string | null;
  listPrice?: number | null;
  retailPrice: number;
  mdPrice1?: number | null;
  mdPrice2?: number | null;
  currentPriceSlot?: CurrentPriceSlot;
  currentCost?: number | null;
  oversizeColumn?: string | null;
  oversizeAmount?: number | null;
  perks?: number | null;
  manufacturer?: string | null;
  labelCode?: string | null;
  colorCode?: string | null;
  comment?: string | null;
  groupCode?: string | null;
  keywords?: string[];
  pictureFileName?: string | null;
  coupon?: boolean;
  status?: string | null;
  orderMultiple?: number | null;
  orderUom?: string | null;
  longColor?: string | null;
  boldDesc?: string | null;
  paraDesc?: string | null;
  catalogSku?: string | null;
  bulletText?: string[];
  pictureName01?: string | null;
  pictureName02?: string | null;
  sizeText?: string | null;
  webFileName?: string | null;
}

export interface FindAllOptions {
  q?: string;
  vendor?: string;
  category?: number;
  season?: string;
  group?: string;
  keyword?: string;
  vendors?: string[];
  categories?: number[];
  seasons?: string[];
  groups?: string[];
  keywords?: string[];
  codes?: string[];
  styleColor?: string;
  description?: string;
  limit?: number;
  offset?: number;
}

export const SKU_FIELD_LIMITS = {
  code: 15,
  vendorSku: 20,
  description: 30,
  styleColor: 20,
  season: 2,
  location: 10,
  oversizeColumn: 3,
  manufacturer: 20,
  labelCode: 1,
  colorCode: 3,
  comment: 30,
  groupCode: 3,
  keywordsJoined: 60,
  pictureFileName: 50,
  status: 1,
  orderUom: 10,
  longColor: 30,
  boldDesc: 60,
  paraDesc: 255,
  catalogSku: 20,
  bulletText: 80,
  pictureName: 50,
  webFileName: 50,
  sizeText: 30,
} as const;

interface SkuRow {
  code: string;
  vendorSku: string | null;
  category: number | null;
  vendor: string | null;
  sizeType: number | null;
  description: string | null;
  styleColor: string | null;
  season: string | null;
  location: string | null;
  listPrice: number | string | null;
  retailPrice: number | string | null;
  mdPrice1: number | string | null;
  mdPrice2: number | string | null;
  currentPriceSlot: string | null;
  currentCost: number | string | null;
  perks: number | string | null;
  manufacturer: string | null;
  labelCode: string | null;
  colorCode: string | null;
  comment: string | null;
  groupCode: string | null;
  keywordsJoined: string | null;
  pictureFileName: string | null;
  coupon: boolean | null;
  status: string | null;
  dateLastChanged: Date | string | null;
  orderMultiple: number | null;
  orderUom: string | null;
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool == null) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function trimString(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCurrentPriceSlot(slot: string | null | undefined): CurrentPriceSlot {
  const normalized = (slot ?? '').trim().toUpperCase();
  if (normalized === 'LIST') return 'LIST';
  if (normalized === 'MD1' || normalized === 'MARKDOWN1') return 'MD1';
  if (normalized === 'MD2' || normalized === 'MARKDOWN2') return 'MD2';
  return 'RETAIL';
}

function numberOrNull(value: number | string | null | undefined): number | null {
  return value == null ? null : Number(value);
}

function keywordsFromString(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s+/)
    .map((keyword) => keyword.trim().toUpperCase())
    .filter((keyword) => keyword.length > 0);
}

function mapRow(row: SkuRow): Sku {
  const changedAt =
    row.dateLastChanged == null
      ? null
      : row.dateLastChanged instanceof Date
        ? row.dateLastChanged
        : new Date(row.dateLastChanged);

  return {
    code: row.code,
    vendorSku: trimString(row.vendorSku),
    category: row.category,
    vendor: trimString(row.vendor),
    sizeType: row.sizeType,
    description: trimString(row.description) ?? '',
    styleColor: trimString(row.styleColor),
    season: trimString(row.season),
    location: trimString(row.location),
    listPrice: numberOrNull(row.listPrice),
    retailPrice: numberOrNull(row.retailPrice) ?? 0,
    mdPrice1: numberOrNull(row.mdPrice1),
    mdPrice2: numberOrNull(row.mdPrice2),
    currentPriceSlot: normalizeCurrentPriceSlot(row.currentPriceSlot),
    currentCost: numberOrNull(row.currentCost),
    oversizeColumn: null,
    oversizeAmount: null,
    perks: numberOrNull(row.perks),
    manufacturer: trimString(row.manufacturer),
    labelCode: trimString(row.labelCode),
    colorCode: trimString(row.colorCode),
    comment: trimString(row.comment),
    groupCode: trimString(row.groupCode),
    keywords: keywordsFromString(row.keywordsJoined),
    pictureFileName: trimString(row.pictureFileName),
    coupon: Boolean(row.coupon),
    lastPriceChange: null,
    status: trimString(row.status),
    dateLastChanged: changedAt,
    orderMultiple: row.orderMultiple,
    orderUom: trimString(row.orderUom),
    longColor: null,
    boldDesc: null,
    paraDesc: null,
    catalogSku: null,
    bulletText: [],
    pictureName01: null,
    pictureName02: null,
    sizeText: null,
    webFileName: null,
  };
}

function pushClause(
  clauses: string[],
  params: unknown[],
  sql: string,
  value?: unknown,
): void {
  if (value === undefined) {
    clauses.push(sql);
    return;
  }
  params.push(value);
  clauses.push(sql.replace('?', `$${params.length}`));
}

function setOf(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeCode(String(value)))
        .filter((value) => value.length > 0),
    ),
  );
}

function numSet(values: number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value))));
}

function sqlLikePattern(pattern: string): string {
  if (pattern.includes('*')) {
    return pattern.toUpperCase().replace(/\*/g, '%');
  }
  return `%${pattern.toUpperCase()}%`;
}

function buildWhere(opts: FindAllOptions): { clauses: string[]; params: unknown[] } {
  const clauses = ['s.code IS NOT NULL'];
  const params: unknown[] = [];

  if (opts.q && opts.q.trim().length > 0) {
    const needle = `%${opts.q.trim().toUpperCase()}%`;
    params.push(needle);
    const ref = `$${params.length}`;
    clauses.push(
      `(
        UPPER(s.code) LIKE ${ref}
        OR UPPER(COALESCE(NULLIF(BTRIM(s.description_rics), ''), NULLIF(BTRIM(s.description_web), ''), s.provisional_code, '')) LIKE ${ref}
        OR UPPER(COALESCE(s.style_color, '')) LIKE ${ref}
      )`,
    );
  }

  if (opts.description && opts.description.trim().length > 0) {
    pushClause(
      clauses,
      params,
      `UPPER(COALESCE(NULLIF(BTRIM(s.description_rics), ''), NULLIF(BTRIM(s.description_web), ''), s.provisional_code, '')) LIKE ?`,
      sqlLikePattern(opts.description.trim()),
    );
  }

  const vendors = setOf(opts.vendors ?? (opts.vendor ? [opts.vendor] : []));
  if (vendors.length > 0) {
    pushClause(
      clauses,
      params,
      `UPPER(COALESCE(o.vendor, s.vendor_id, '')) = ANY(?::text[])`,
      vendors,
    );
  }

  const categories = numSet(opts.categories ?? (opts.category != null ? [opts.category] : []));
  if (categories.length > 0) {
    pushClause(
      clauses,
      params,
      `COALESCE(o.category, s.category_number) = ANY(?::int[])`,
      categories,
    );
  }

  const seasons = setOf(opts.seasons ?? (opts.season ? [opts.season] : []));
  if (seasons.length > 0) {
    pushClause(
      clauses,
      params,
      `UPPER(COALESCE(o.season, s.season, '')) = ANY(?::text[])`,
      seasons,
    );
  }

  const groups = setOf(opts.groups ?? (opts.group ? [opts.group] : []));
  if (groups.length > 0) {
    pushClause(
      clauses,
      params,
      `UPPER(COALESCE(o.group_code, s.group_code, '')) = ANY(?::text[])`,
      groups,
    );
  }

  const keywords = setOf(opts.keywords ?? (opts.keyword ? [opts.keyword] : []));
  if (keywords.length > 0) {
    pushClause(
      clauses,
      params,
      `EXISTS (
         SELECT 1
         FROM unnest(string_to_array(COALESCE(s.keywords, ''), ' ')) AS kw(keyword)
         WHERE UPPER(BTRIM(kw.keyword)) = ANY(?::text[])
       )`,
      keywords,
    );
  }

  if (opts.styleColor && opts.styleColor.trim().length > 0) {
    pushClause(
      clauses,
      params,
      `UPPER(COALESCE(s.style_color, '')) LIKE ?`,
      `%${opts.styleColor.trim().toUpperCase()}%`,
    );
  }

  if (opts.codes && opts.codes.length > 0) {
    const codes = setOf(opts.codes);
    pushClause(clauses, params, `UPPER(s.code) = ANY(?::text[])`, codes);
  }

  return { clauses, params };
}

function baseSelect(): string {
  return `
    SELECT
      s.code AS "code",
      s.vendor_sku AS "vendorSku",
      COALESCE(o.category, s.category_number) AS "category",
      COALESCE(o.vendor, s.vendor_id) AS "vendor",
      s.size_type AS "sizeType",
      COALESCE(NULLIF(BTRIM(s.description_rics), ''), NULLIF(BTRIM(s.description_web), ''), s.provisional_code) AS "description",
      s.style_color AS "styleColor",
      COALESCE(o.season, s.season) AS "season",
      s.location AS "location",
      s.list_price::float8 AS "listPrice",
      s.retail_price::float8 AS "retailPrice",
      s.mark_down_price1::float8 AS "mdPrice1",
      s.mark_down_price2::float8 AS "mdPrice2",
      s.current_price_slot AS "currentPriceSlot",
      s.current_cost::float8 AS "currentCost",
      s.perks::float8 AS "perks",
      s.manufacturer AS "manufacturer",
      s.label_code AS "labelCode",
      s.color_code AS "colorCode",
      s.comment AS "comment",
      COALESCE(o.group_code, s.group_code) AS "groupCode",
      s.keywords AS "keywordsJoined",
      s.picture_file_name AS "pictureFileName",
      s.coupon AS "coupon",
      COALESCE(s.rics_status, CASE WHEN UPPER(s.sku_state) = 'DISCONTINUED' THEN 'D' ELSE NULL END) AS "status",
      COALESCE(s.updated_at, s.rics_last_synced_at, s.created_at) AS "dateLastChanged",
      s.order_multiple AS "orderMultiple",
      s.order_uom AS "orderUom"
    FROM app.sku s
    LEFT JOIN app.sku_attribute_override o ON o.rics_sku_code = s.code
  `;
}

const WRITE_NOT_SUPPORTED_MESSAGE =
  'Legacy SKU writes through /api/v1/products/skus are disabled after retirement of the MDB ' +
  'path. The read surface is now app-owned in Postgres, but the old InventoryMaster/InvCatalog ' +
  'write contract has not been fully replaced yet.';

export const SkuRepository = {
  async findAll(opts: FindAllOptions = {}): Promise<Result<Sku[]>> {
    const { clauses, params } = buildWhere(opts);
    const sql = `
      ${baseSelect()}
      WHERE ${clauses.join(' AND ')}
      ORDER BY s.code
      ${opts.limit != null ? `LIMIT ${Math.max(0, opts.limit)}` : ''}
      ${opts.offset != null ? `OFFSET ${Math.max(0, opts.offset)}` : ''}
    `;
    const rows = await getPool().query<SkuRow>(sql, params);
    return Ok(rows.rows.map(mapRow));
  },

  async warmup(): Promise<void> {
    return;
  },

  async findByCode(code: string): Promise<Result<Sku>> {
    const normalized = normalizeCode(code);
    const sql = `
      ${baseSelect()}
      WHERE s.code = $1
      LIMIT 1
    `;
    const rows = await getPool().query<SkuRow>(sql, [normalized]);
    const row = rows.rows[0];
    if (!row) {
      return Err(notFound(`SKU '${normalized}' not found.`));
    }
    return Ok(mapRow(row));
  },

  async create(_input: SkuInput): Promise<Result<Sku>> {
    return Err({ kind: 'WriteNotSupported', message: WRITE_NOT_SUPPORTED_MESSAGE });
  },

  async update(
    _code: string,
    _patch: Partial<Omit<SkuInput, 'code'>>,
  ): Promise<Result<Sku>> {
    return Err({ kind: 'WriteNotSupported', message: WRITE_NOT_SUPPORTED_MESSAGE });
  },

  async delete(_code: string): Promise<Result<void>> {
    return Err({ kind: 'WriteNotSupported', message: WRITE_NOT_SUPPORTED_MESSAGE });
  },

  async countByVendor(vendorCode: string): Promise<Result<number>> {
    const normalized = normalizeCode(vendorCode);
    const sql = `
      SELECT COUNT(*)::bigint AS n
      FROM app.sku s
      LEFT JOIN app.sku_attribute_override o ON o.rics_sku_code = s.code
      WHERE s.code IS NOT NULL
        AND UPPER(COALESCE(o.vendor, s.vendor_id, '')) = $1
    `;
    const res = await getPool().query<{ n: string }>(sql, [normalized]);
    return Ok(Number(res.rows[0]?.n ?? 0));
  },

  async countByCategory(category: number): Promise<Result<number>> {
    const sql = `
      SELECT COUNT(*)::bigint AS n
      FROM app.sku s
      LEFT JOIN app.sku_attribute_override o ON o.rics_sku_code = s.code
      WHERE s.code IS NOT NULL
        AND COALESCE(o.category, s.category_number) = $1
    `;
    const res = await getPool().query<{ n: string }>(sql, [category]);
    return Ok(Number(res.rows[0]?.n ?? 0));
  },
};
