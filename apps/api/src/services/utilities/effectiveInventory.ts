/**
 * Effective-value adapter - merges app.sku_attribute_override +
 * app.sku_keyword_override on top of app.sku.
 *
 * Spec: docs/dev/specs/2026-04-21-utilities-batch-change-design.md
 * Module: docs/modules/utilities.md
 *
 * Every read path that needs to filter or list SKUs respecting operator-applied
 * batch changes goes through here. Writes never happen from this file; see
 * batchChangeService.ts.
 */

import { prisma } from '../../db/prisma';
import type { EffectiveSku, SkuCriteria } from './types';

const PREVIEW_DEFAULT = 20;

interface CriteriaLookupRow {
  sku: string;
  category: number | null;
  vendor: string | null;
  season: string | null;
  group_code: string | null;
  style_color: string | null;
  retail_price: string | number | null;
  description: string | null;
}

/**
 * Resolve an SkuCriteria to matching SKUs. Returns total count + sku codes +
 * a bounded sample of effective-value rows for preview UIs.
 */
export async function findSkusByCriteria(
  c: SkuCriteria,
  opts: { sampleLimit?: number } = {},
): Promise<{ count: number; skus: string[]; sample: EffectiveSku[] }> {
  const rows = await loadEffectiveRows(c);

  const sampleLimit = opts.sampleLimit ?? PREVIEW_DEFAULT;
  const sample: EffectiveSku[] = [];
  const effectiveKeywords = await loadEffectiveKeywordsForSkus(rows.slice(0, sampleLimit).map(r => r.sku));
  for (let i = 0; i < Math.min(sampleLimit, rows.length); i += 1) {
    const r = rows[i]!;
    sample.push(rowToEffectiveSku(r, effectiveKeywords.get(r.sku) ?? []));
  }

  return {
    count: rows.length,
    skus: rows.map(r => r.sku),
    sample,
  };
}

/**
 * Batch lookup: return effective values for a known set of SKUs. Used by the
 * before-snapshot logic in batchChangeService and by targeted warmup invalidation.
 */
export async function getEffectiveSkus(skuCodes: string[]): Promise<Map<string, EffectiveSku>> {
  const normalizedCodes = normalizeTextSet(skuCodes);
  if (normalizedCodes.length === 0) return new Map();

  const rows = await prisma.$queryRawUnsafe<CriteriaLookupRow[]>(
    `
    SELECT
      s.code AS sku,
      COALESCE(o.category, s.category_number) AS category,
      COALESCE(o.vendor, s.vendor_id) AS vendor,
      COALESCE(o.season, s.season) AS season,
      COALESCE(o.group_code, s.group_code) AS group_code,
      s.style_color AS style_color,
      s.retail_price AS retail_price,
      COALESCE(
        NULLIF(BTRIM(s.description_rics), ''),
        NULLIF(BTRIM(s.description_web), ''),
        s.provisional_code
      ) AS description
    FROM app.sku s
    LEFT JOIN app.sku_attribute_override o ON o.rics_sku_code = s.code
    WHERE s.code IS NOT NULL
      AND UPPER(s.code) = ANY($1::text[])
    `,
    normalizedCodes,
  );

  const effectiveKeywords = await loadEffectiveKeywordsForSkus(rows.map(r => r.sku));

  const map = new Map<string, EffectiveSku>();
  for (const r of rows) {
    map.set(r.sku, rowToEffectiveSku(r, effectiveKeywords.get(r.sku) ?? []));
  }
  return map;
}

/**
 * Load every SKU with effective values. Used by the SKU Lookup warmup index.
 * MUST cover every SKU - no capping.
 */
export async function loadAllEffectiveRows(): Promise<EffectiveSku[]> {
  const rows = await prisma.$queryRawUnsafe<CriteriaLookupRow[]>(
    `
    SELECT
      s.code AS sku,
      COALESCE(o.category, s.category_number) AS category,
      COALESCE(o.vendor, s.vendor_id) AS vendor,
      COALESCE(o.season, s.season) AS season,
      COALESCE(o.group_code, s.group_code) AS group_code,
      s.style_color AS style_color,
      s.retail_price AS retail_price,
      COALESCE(
        NULLIF(BTRIM(s.description_rics), ''),
        NULLIF(BTRIM(s.description_web), ''),
        s.provisional_code
      ) AS description
    FROM app.sku s
    LEFT JOIN app.sku_attribute_override o ON o.rics_sku_code = s.code
    WHERE s.code IS NOT NULL
    ORDER BY s.code
    `,
  );

  const skuCodes = rows.map(r => r.sku);
  const effectiveKeywords = await loadEffectiveKeywordsForSkus(skuCodes);

  return rows.map(r => rowToEffectiveSku(r, effectiveKeywords.get(r.sku) ?? []));
}

// ---------------- internals ----------------

/**
 * Main criteria query. Returns effective rows that match every criterion.
 * Arrays combine OR within a field; boolean filters are AND across.
 * styleColor does case-insensitive substring OR-match.
 */
async function loadEffectiveRows(c: SkuCriteria): Promise<CriteriaLookupRow[]> {
  const params: unknown[] = [];
  const push = <T>(v: T): string => {
    params.push(v);
    return `$${params.length}`;
  };

  const skusParam = c.skus?.length ? push(normalizeTextSet(c.skus)) : null;
  const categoriesParam = c.categories?.length ? push(c.categories) : null;
  const vendorsParam = c.vendors?.length ? push(normalizeTextSet(c.vendors)) : null;
  const seasonsParam = c.seasons?.length ? push(normalizeTextSet(c.seasons)) : null;
  const groupsParam = c.groups?.length ? push(normalizeTextSet(c.groups)) : null;
  const styleColorsParam = c.stylesColors?.length ? push(c.stylesColors) : null;
  const keywordsParam = c.keywords?.length ? push(normalizeTextSet(c.keywords)) : null;
  const attributeFilters = Object.entries(c.attributes ?? {})
    .map(([dimensionCode, valueCodes]) => ({
      dimensionCode: dimensionCode.trim(),
      valueCodes: Array.from(new Set(valueCodes.map((v) => v.trim()).filter(Boolean))),
    }))
    .filter((f) => f.dimensionCode && f.valueCodes.length > 0);

  const whereClauses: string[] = ['s.code IS NOT NULL'];
  if (skusParam) whereClauses.push(`UPPER(s.code) = ANY(${skusParam}::text[])`);
  if (categoriesParam) whereClauses.push(`COALESCE(o.category, s.category_number) = ANY(${categoriesParam}::int[])`);
  if (vendorsParam) whereClauses.push(`UPPER(COALESCE(o.vendor, s.vendor_id, '')) = ANY(${vendorsParam}::text[])`);
  if (seasonsParam) whereClauses.push(`UPPER(COALESCE(o.season, s.season, '')) = ANY(${seasonsParam}::text[])`);
  if (groupsParam) whereClauses.push(`UPPER(COALESCE(o.group_code, s.group_code, '')) = ANY(${groupsParam}::text[])`);
  if (styleColorsParam) {
    whereClauses.push(
      `EXISTS (
        SELECT 1
        FROM UNNEST(${styleColorsParam}::text[]) needle
        WHERE s.style_color ILIKE '%' || needle || '%'
      )`,
    );
  }
  if (keywordsParam) {
    whereClauses.push(
      `(
        EXISTS (
          SELECT 1
          FROM UNNEST(string_to_array(COALESCE(s.keywords, ''), ' ')) AS kw(keyword)
          WHERE UPPER(BTRIM(kw.keyword)) = ANY(${keywordsParam}::text[])
            AND NOT EXISTS (
              SELECT 1
              FROM app.sku_keyword_override r
              WHERE UPPER(r.rics_sku_code) = UPPER(s.code)
                AND UPPER(r.keyword) = UPPER(BTRIM(kw.keyword))
                AND r.action = 'REMOVE'
            )
        )
        OR EXISTS (
          SELECT 1
          FROM app.sku_keyword_override a
          WHERE UPPER(a.rics_sku_code) = UPPER(s.code)
            AND a.action = 'ADD'
            AND UPPER(a.keyword) = ANY(${keywordsParam}::text[])
        )
      )`,
    );
  }
  for (const f of attributeFilters) {
    const dimParam = push(f.dimensionCode);
    const valuesParam = push(f.valueCodes);
    whereClauses.push(
      `EXISTS (
        SELECT 1
        FROM app.sku_attribute_assignment a
        JOIN app.attribute_value v ON v.id = a.value_id
        JOIN app.attribute_dimension d ON d.id = a.dimension_id
        WHERE a.sku_code = s.code
          AND d.code = ${dimParam}
          AND v.code = ANY(${valuesParam}::text[])
      )`,
    );
  }

  const sql = `
    SELECT
      s.code AS sku,
      COALESCE(o.category, s.category_number) AS category,
      COALESCE(o.vendor, s.vendor_id) AS vendor,
      COALESCE(o.season, s.season) AS season,
      COALESCE(o.group_code, s.group_code) AS group_code,
      s.style_color AS style_color,
      s.retail_price AS retail_price,
      COALESCE(
        NULLIF(BTRIM(s.description_rics), ''),
        NULLIF(BTRIM(s.description_web), ''),
        s.provisional_code
      ) AS description
    FROM app.sku s
    LEFT JOIN app.sku_attribute_override o ON o.rics_sku_code = s.code
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY s.code
  `;

  return prisma.$queryRawUnsafe<CriteriaLookupRow[]>(sql, ...params);
}

interface KeywordRow {
  sku: string;
  keyword: string;
}

/**
 * Compute effective keywords for a given set of SKUs.
 * Effective keywords = app.sku.keywords tokens union ADD overrides minus
 * REMOVE overrides.
 */
async function loadEffectiveKeywordsForSkus(skuCodes: string[]): Promise<Map<string, string[]>> {
  const normalizedCodes = normalizeTextSet(skuCodes);
  if (normalizedCodes.length === 0) return new Map();

  const rows = await prisma.$queryRawUnsafe<KeywordRow[]>(
    `
    WITH sku_scope AS (
      SELECT code, keywords
      FROM app.sku
      WHERE code IS NOT NULL
        AND UPPER(code) = ANY($1::text[])
    ),
    base_words AS (
      SELECT s.code AS sku, UPPER(BTRIM(kw.keyword)) AS keyword
      FROM sku_scope s,
           UNNEST(string_to_array(COALESCE(s.keywords, ''), ' ')) AS kw(keyword)
      WHERE BTRIM(kw.keyword) <> ''
    ),
    combined AS (
      SELECT sku, keyword FROM base_words
      UNION
      SELECT s.code AS sku, UPPER(a.keyword) AS keyword
      FROM sku_scope s
      JOIN app.sku_keyword_override a ON UPPER(a.rics_sku_code) = UPPER(s.code)
      WHERE a.action = 'ADD'
    )
    SELECT sku, keyword FROM combined
    EXCEPT
    SELECT s.code AS sku, UPPER(r.keyword) AS keyword
    FROM sku_scope s
    JOIN app.sku_keyword_override r ON UPPER(r.rics_sku_code) = UPPER(s.code)
    WHERE r.action = 'REMOVE'
    ORDER BY sku, keyword
    `,
    normalizedCodes,
  );

  const map = new Map<string, string[]>();
  for (const r of rows) {
    const existing = map.get(r.sku);
    if (existing) existing.push(r.keyword);
    else map.set(r.sku, [r.keyword]);
  }
  return map;
}

function normalizeTextSet(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value).trim().toUpperCase())
        .filter((value) => value.length > 0),
    ),
  );
}

function rowToEffectiveSku(r: CriteriaLookupRow, keywords: string[]): EffectiveSku {
  return {
    sku: r.sku,
    category: r.category,
    vendor: r.vendor?.trim() || null,
    season: r.season?.trim() || null,
    groupCode: r.group_code?.trim() || null,
    styleColor: r.style_color?.trim() || null,
    keywords,
    retailPrice: r.retail_price == null ? null : Number(r.retail_price),
    description: r.description?.trim() || null,
  };
}
