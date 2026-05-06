import { prisma } from '../../db/prisma';
import { getOnHandTotals } from '../products/onHandTotalsService';
import { buildRicsImageUrl } from '../ricsImageUrl';
import type { SkuAttributeColumns } from './types';

/**
 * Build a SKU → attributes map for the SKUs in a SKU_DETAIL sales-analysis
 * result. Two sources:
 *
 *   Tier 1 — rics_mirror.inventory_master (with app.sku_attribute_override
 *   overlaid, same merge semantics as the SKU Lookup Index): description,
 *   vendor code, category description, style/color, current price, picture URL.
 *   A single indexed lookup query; cheap even for 10k-row reports.
 *
 *   Tier 2 — app.sku_attribute_assignment JOIN app.attribute_dimension JOIN
 *   app.attribute_value: any operator-assigned extended attributes (material,
 *   heel shape, target audience, etc.) keyed by dimension code. One extra
 *   query over the same SKU set.
 *
 * Returns a Map keyed by the upper-cased trimmed SKU code so callers match
 * the same normalisation the SkuLookupIndex uses.
 */
export async function loadSkuAttributesBySku(
  skuCodes: string[],
  options: {
    storeNumbers?: number[];
    reportEndDate?: string;
  } = {},
): Promise<Map<string, SkuAttributeColumns>> {
  const result = new Map<string, SkuAttributeColumns>();
  if (skuCodes.length === 0) return result;

  // Normalise once — rics_mirror.inventory_master.sku may have inconsistent
  // casing/whitespace, so we upper-trim both sides of the match.
  const normalised = skuCodes
    .map((s) => (typeof s === 'string' ? s.trim().toUpperCase() : ''))
    .filter(Boolean);
  if (normalised.length === 0) return result;
  const unique = Array.from(new Set(normalised));

  // ─────────────────────── Tier 1 ─────────────────────────
  // Joins:
  //   - app.sku_attribute_override (o) — operator-applied batch overrides
  //     (category, vendor, season); same merge semantics as SkuLookupIndex.
  //   - rics_mirror.categories (c) — for the category description/name.
  //   - rics_mirror.departments (d) — dept number + desc, matched by the
  //     category number falling within [beg_categ, end_categ].
  // Current cost is a SKU-level per-unit figure (distinct from the report's
  // row-level onHandAtCost = Σ(onHand × currentCost)).
  interface Tier1Row {
    sku_code: string;
    description: string | null;
    vendor_code: string | null;
    manufacturer: string | null;
    category_number: number | null;
    category_desc: string | null;
    department_number: number | null;
    department_desc: string | null;
    season: string | null;
    group_code: string | null;
    style_color: string | null;
    current_price: number | null;
    current_cost: number | null;
    picture_file_name: string | null;
    keywords: string | null;
    size_type: number | null;
    label_code: string | null;
    color_code: string | null;
    discount_code: string | null;
  }
  const tier1 = await prisma.$queryRawUnsafe<Tier1Row[]>(
    `
    SELECT
      UPPER(TRIM(s.code))                          AS sku_code,
      COALESCE(s.description_web, s.description_rics) AS description,
      COALESCE(o.vendor, s.vendor_id)              AS vendor_code,
      s.manufacturer                               AS manufacturer,
      COALESCE(o.category, s.category_number)      AS category_number,
      c."desc"                                     AS category_desc,
      d.number                                     AS department_number,
      d."desc"                                     AS department_desc,
      s.season                                     AS season,
      s.group_code                                 AS group_code,
      s.style_color                                AS style_color,
      s.retail_price::float8                       AS current_price,
      s.current_cost::float8                       AS current_cost,
      s.picture_file_name                          AS picture_file_name,
      s.keywords                                   AS keywords,
      s.size_type                                  AS size_type,
      s.label_code                                 AS label_code,
      s.color_code                                 AS color_code,
      s.discount_code                              AS discount_code
    FROM app.sku s
    LEFT JOIN app.sku_attribute_override o ON s.code = o.rics_sku_code
    LEFT JOIN app.taxonomy_category c ON c.number = COALESCE(o.category, s.category_number)
    LEFT JOIN app.taxonomy_department d
      ON COALESCE(o.category, s.category_number) BETWEEN d.beg_categ AND d.end_categ
    WHERE s.code IS NOT NULL
      AND UPPER(TRIM(s.code)) = ANY($1::text[])
      AND COALESCE(s.rics_status, '') <> 'D'
    `,
    unique,
  );

  for (const r of tier1) {
    const picture = buildRicsImageUrl(r.picture_file_name);
    result.set(r.sku_code, {
      description: r.description ?? null,
      vendorCode: r.vendor_code ?? null,
      manufacturer: r.manufacturer ?? null,
      categoryNumber: r.category_number ?? null,
      categoryDesc: r.category_desc ?? null,
      departmentNumber: r.department_number ?? null,
      departmentDesc: r.department_desc ?? null,
      season: r.season?.trim() || null,
      groupCode: r.group_code?.trim() || null,
      styleColor: r.style_color ?? null,
      currentPrice: r.current_price ?? null,
      currentCost: r.current_cost ?? null,
      unitsOnHand: null, // filled below
      pictureUrl: picture,
      keywords: r.keywords?.trim() || null,
      sizeType: r.size_type ?? null,
      labelCode: r.label_code?.trim() || null,
      colorCode: r.color_code?.trim() || null,
      discountCode: r.discount_code?.trim() || null,
      dateFirstReceived: null,
      dateLastReceived: null,
      ageDays: null,
      ageDaysByStore: {},
      extended: {},
    });
  }

  // Seed entries for any SKU that wasn't found in inventory_master — otherwise
  // tier-2 lookups for orphan SKUs would have nowhere to land.
  for (const code of unique) {
    if (!result.has(code)) {
      result.set(code, {
        description: null,
        vendorCode: null,
        manufacturer: null,
        categoryNumber: null,
        categoryDesc: null,
        departmentNumber: null,
        departmentDesc: null,
        season: null,
        groupCode: null,
        styleColor: null,
        currentPrice: null,
        currentCost: null,
        unitsOnHand: null,
        pictureUrl: null,
        keywords: null,
        sizeType: null,
        labelCode: null,
        colorCode: null,
        discountCode: null,
        dateFirstReceived: null,
        dateLastReceived: null,
        ageDays: null,
        ageDaysByStore: {},
        extended: {},
      });
    }
  }

  // ─────────────────────── On-hand units ──────────────────
  // Reuses the same 18-column sum logic the utilities workbench uses so the
  // number matches what operators see elsewhere in the app.
  const unitsBySku = await getOnHandTotals(unique);
  for (const [code, units] of unitsBySku) {
    const entry = result.get(code);
    if (entry) entry.unitsOnHand = units;
  }

  // ─────────────────────── Inventory age / receive dates ─────────────────
  // The picture report needs SKU age relative to the report end date. Keep
  // this behind includeAttributes so ordinary Sales Analysis responses stay
  // lean, and compute per-store age as an optional lookup for separate-store
  // rows.
  interface HistoryRow {
    sku_code: string;
    store_id: number;
    date_first_received: Date | string | null;
    date_last_received: Date | string | null;
  }
  const storeNumbers = (options.storeNumbers ?? [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));
  const historySqlParams: unknown[] = [unique];
  const historyWhere: string[] = ['UPPER(TRIM(sku_code)) = ANY($1::text[])'];
  if (storeNumbers.length > 0) {
    historySqlParams.push(storeNumbers);
    historyWhere.push(`store_id = ANY($${historySqlParams.length}::int[])`);
  }
  const historyRows = await prisma.$queryRawUnsafe<HistoryRow[]>(
    `
    SELECT
      UPPER(TRIM(sku_code))       AS sku_code,
      store_id                    AS store_id,
      MIN(date_first_received)    AS date_first_received,
      MAX(date_last_received)     AS date_last_received
    FROM app.inventory_history_snapshot
    WHERE ${historyWhere.join(' AND ')}
    GROUP BY UPPER(TRIM(sku_code)), store_id
    `,
    ...historySqlParams,
  );
  const reportEnd = parseIsoDate(options.reportEndDate) ?? new Date();
  const bySkuHistory = new Map<string, {
    first: string | null;
    last: string | null;
    ageDays: number | null;
    ageDaysByStore: Record<string, number | null>;
  }>();
  for (const r of historyRows) {
    const first = toDateOnly(r.date_first_received);
    const last = toDateOnly(r.date_last_received);
    const ageDays = first ? daysBetween(first, reportEnd) : null;
    const current = bySkuHistory.get(r.sku_code) ?? {
      first: null,
      last: null,
      ageDays: null,
      ageDaysByStore: {},
    };
    if (first && (!current.first || first < current.first)) {
      current.first = first;
      current.ageDays = ageDays;
    }
    if (last && (!current.last || last > current.last)) current.last = last;
    current.ageDaysByStore[String(r.store_id)] = ageDays;
    bySkuHistory.set(r.sku_code, current);
  }
  for (const [code, history] of bySkuHistory) {
    const entry = result.get(code);
    if (!entry) continue;
    entry.dateFirstReceived = history.first;
    entry.dateLastReceived = history.last;
    entry.ageDays = history.ageDays;
    entry.ageDaysByStore = history.ageDaysByStore;
  }

  // ─────────────────────── Tier 2 ─────────────────────────
  // Multi-value dimensions are flattened by concatenating values with ", " so
  // a single column can still display them. Single-value dimensions just win
  // the assignment (PK prevents duplicates per (sku, dim, value) anyway).
  interface Tier2Row {
    sku_code: string;
    dimension_code: string;
    value_label: string;
  }
  const tier2 = await prisma.$queryRawUnsafe<Tier2Row[]>(
    `
    SELECT
      UPPER(TRIM(saa.sku_code)) AS sku_code,
      ad.code                   AS dimension_code,
      av.label_es               AS value_label
    FROM app.sku_attribute_assignment saa
    JOIN app.attribute_dimension ad ON ad.id = saa.dimension_id
    JOIN app.attribute_value av ON av.id = saa.value_id
    WHERE UPPER(TRIM(saa.sku_code)) = ANY($1::text[])
    ORDER BY ad.sort_order, av.sort_order
    `,
    unique,
  );

  for (const r of tier2) {
    const entry = result.get(r.sku_code);
    if (!entry) continue;
    const existing = entry.extended[r.dimension_code];
    entry.extended[r.dimension_code] = existing
      ? `${existing}, ${r.value_label}`
      : r.value_label;
  }

  return result;
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateOnly(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function daysBetween(dateOnly: string, end: Date): number | null {
  const start = parseIsoDate(dateOnly);
  if (!start) return null;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
}

/**
 * Collect every distinct extended-attribute dimension that showed up on any
 * row. The viewer uses this to build its checkbox list — we only surface
 * dimensions that actually have data for the current report.
 */
export function collectExtendedDimensions(
  attrsBySku: Map<string, SkuAttributeColumns>,
): string[] {
  const seen = new Set<string>();
  for (const attrs of attrsBySku.values()) {
    for (const dim of Object.keys(attrs.extended)) seen.add(dim);
  }
  return Array.from(seen).sort();
}
