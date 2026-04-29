/**
 * Effective-value adapter — merges app.sku_attribute_override +
 * app.sku_keyword_override on top of rics_mirror.inventory_master.
 *
 * Spec: docs/dev/specs/2026-04-21-utilities-batch-change-design.md
 * Module: docs/modules/utilities.md
 *
 * Every read path that needs to filter or list SKUs respecting operator-applied
 * batch changes goes through here. This is the only place the overlay-merge SQL
 * lives — the effective-value CTE is the single source of truth.
 *
 * Writes never happen from this file — see batchChangeService.ts.
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
  mirror_keywords: string | null;
  retail_price: string | number | null;
  description: string | null;
}

/**
 * Resolve an SkuCriteria to matching SKUs. Returns total count + sku codes +
 * a bounded sample of effective-value rows for preview UIs.
 *
 * Scan cost is O(n) over rics_mirror.inventory_master (~200-300k rows). The
 * mirror has no indexes by design; at dev scale this runs sub-second. If it
 * becomes a bottleneck, the sync ETL can append `CREATE INDEX` after the
 * schema swap — no app-layer change required.
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
  if (skuCodes.length === 0) return new Map();

  const rows = await prisma.$queryRawUnsafe<CriteriaLookupRow[]>(
    `
    SELECT
      im.sku,
      COALESCE(o.category, im.category)    AS category,
      COALESCE(o.vendor, im.vendor)        AS vendor,
      COALESCE(o.season, im.season)        AS season,
      COALESCE(o.group_code, im.group_code) AS group_code,
      im.style_color                        AS style_color,
      im.key_words                          AS mirror_keywords,
      im.retail_price                       AS retail_price,
      im."desc"                             AS description
    FROM rics_mirror.inventory_master im
    LEFT JOIN app.sku_attribute_override o ON im.sku = o.rics_sku_code
    WHERE im.sku = ANY($1::text[])
    `,
    skuCodes,
  );

  const effectiveKeywords = await loadEffectiveKeywordsForSkus(skuCodes);

  const map = new Map<string, EffectiveSku>();
  for (const r of rows) {
    map.set(r.sku, rowToEffectiveSku(r, effectiveKeywords.get(r.sku) ?? []));
  }
  return map;
}

/**
 * Load every SKU with effective values. Used by the SKU Lookup warmup index.
 * MUST cover every SKU — per CLAUDE.md hard rule (no capping).
 */
export async function loadAllEffectiveRows(): Promise<EffectiveSku[]> {
  const rows = await prisma.$queryRawUnsafe<CriteriaLookupRow[]>(
    `
    SELECT
      im.sku,
      COALESCE(o.category, im.category)    AS category,
      COALESCE(o.vendor, im.vendor)        AS vendor,
      COALESCE(o.season, im.season)        AS season,
      COALESCE(o.group_code, im.group_code) AS group_code,
      im.style_color                        AS style_color,
      im.key_words                          AS mirror_keywords,
      im.retail_price                       AS retail_price,
      im."desc"                             AS description
    FROM rics_mirror.inventory_master im
    LEFT JOIN app.sku_attribute_override o ON im.sku = o.rics_sku_code
    WHERE im.sku IS NOT NULL
    `,
  );

  // Keywords: compute in one pass to avoid N+1.
  const skuCodes = rows.map(r => r.sku);
  const effectiveKeywords = await loadEffectiveKeywordsForSkus(skuCodes);

  return rows.map(r => rowToEffectiveSku(r, effectiveKeywords.get(r.sku) ?? []));
}

// ─────────── internals ───────────

/**
 * Main criteria query. Returns effective rows that match every criterion.
 * Arrays combine OR within a field; boolean filters are AND across.
 * `stylesColors` does case-insensitive substring OR-match.
 */
async function loadEffectiveRows(c: SkuCriteria): Promise<CriteriaLookupRow[]> {
  // Bind-param indices must match the $N below.
  const params: unknown[] = [];
  const push = <T>(v: T): string => {
    params.push(v);
    return `$${params.length}`;
  };

  const skusParam      = c.skus?.length       ? push(c.skus)                  : null;
  const categoriesPar  = c.categories?.length ? push(c.categories)            : null;
  const vendorsParam   = c.vendors?.length    ? push(c.vendors)               : null;
  const seasonsParam   = c.seasons?.length    ? push(c.seasons)               : null;
  const groupsParam    = c.groups?.length     ? push(c.groups)                : null;
  const styleColorsPar = c.stylesColors?.length ? push(c.stylesColors)        : null;
  const keywordsParam  = c.keywords?.length   ? push(c.keywords)              : null;
  const attributeFilters = Object.entries(c.attributes ?? {})
    .map(([dimensionCode, valueCodes]) => ({
      dimensionCode: dimensionCode.trim(),
      valueCodes: Array.from(new Set(valueCodes.map((v) => v.trim()).filter(Boolean))),
    }))
    .filter((f) => f.dimensionCode && f.valueCodes.length > 0);

  const whereClauses: string[] = ['im.sku IS NOT NULL'];
  if (skusParam)      whereClauses.push(`im.sku = ANY(${skusParam}::text[])`);
  if (categoriesPar)  whereClauses.push(`COALESCE(o.category, im.category) = ANY(${categoriesPar}::int[])`);
  if (vendorsParam)   whereClauses.push(`COALESCE(o.vendor, im.vendor) = ANY(${vendorsParam}::text[])`);
  if (seasonsParam)   whereClauses.push(`COALESCE(o.season, im.season) = ANY(${seasonsParam}::text[])`);
  if (groupsParam)    whereClauses.push(`COALESCE(o.group_code, im.group_code) = ANY(${groupsParam}::text[])`);
  if (styleColorsPar) {
    whereClauses.push(
      `EXISTS (SELECT 1 FROM UNNEST(${styleColorsPar}::text[]) s WHERE im.style_color ILIKE '%' || s || '%')`,
    );
  }
  if (keywordsParam) {
    // Effective keywords: (mirror string split) ∪ ADD-overrides − REMOVE-overrides.
    // We check each requested keyword against that set for this sku.
    whereClauses.push(
      `(
        EXISTS (
          SELECT 1
          FROM UNNEST(string_to_array(COALESCE(im.key_words, ''), ' ')) AS kw
          WHERE TRIM(kw) = ANY(${keywordsParam}::text[])
            AND NOT EXISTS (
              SELECT 1 FROM app.sku_keyword_override r
              WHERE r.rics_sku_code = im.sku AND r.keyword = TRIM(kw) AND r.action = 'REMOVE'
            )
        )
        OR EXISTS (
          SELECT 1 FROM app.sku_keyword_override a
          WHERE a.rics_sku_code = im.sku AND a.action = 'ADD' AND a.keyword = ANY(${keywordsParam}::text[])
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
        WHERE a.sku_code = im.sku
          AND d.code = ${dimParam}
          AND v.code = ANY(${valuesParam}::text[])
      )`,
    );
  }

  const sql = `
    SELECT
      im.sku,
      COALESCE(o.category, im.category)    AS category,
      COALESCE(o.vendor, im.vendor)        AS vendor,
      COALESCE(o.season, im.season)        AS season,
      COALESCE(o.group_code, im.group_code) AS group_code,
      im.style_color                        AS style_color,
      im.key_words                          AS mirror_keywords,
      im.retail_price                       AS retail_price,
      im."desc"                             AS description
    FROM rics_mirror.inventory_master im
    LEFT JOIN app.sku_attribute_override o ON im.sku = o.rics_sku_code
    WHERE ${whereClauses.join(' AND ')}
  `;

  return prisma.$queryRawUnsafe<CriteriaLookupRow[]>(sql, ...params);
}

interface KeywordRow {
  sku: string;
  keyword: string;
}

/**
 * Compute effective keywords for a given set of SKUs.
 * Returns one row per (sku, keyword) pair after applying ADD/REMOVE overrides
 * on top of the RICS space-separated KeyWords string.
 */
async function loadEffectiveKeywordsForSkus(skuCodes: string[]): Promise<Map<string, string[]>> {
  if (skuCodes.length === 0) return new Map();

  const rows = await prisma.$queryRawUnsafe<KeywordRow[]>(
    `
    WITH mirror_words AS (
      SELECT im.sku, TRIM(kw) AS keyword
      FROM rics_mirror.inventory_master im,
           UNNEST(string_to_array(COALESCE(im.key_words, ''), ' ')) AS kw
      WHERE im.sku = ANY($1::text[]) AND TRIM(kw) <> ''
    ),
    combined AS (
      SELECT sku, keyword FROM mirror_words
      UNION
      SELECT rics_sku_code AS sku, keyword FROM app.sku_keyword_override
      WHERE rics_sku_code = ANY($1::text[]) AND action = 'ADD'
    )
    SELECT sku, keyword FROM combined
    EXCEPT
    SELECT rics_sku_code AS sku, keyword FROM app.sku_keyword_override
    WHERE rics_sku_code = ANY($1::text[]) AND action = 'REMOVE'
    `,
    skuCodes,
  );

  const map = new Map<string, string[]>();
  for (const r of rows) {
    const existing = map.get(r.sku);
    if (existing) existing.push(r.keyword);
    else map.set(r.sku, [r.keyword]);
  }
  return map;
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
