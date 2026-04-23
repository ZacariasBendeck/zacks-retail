import { prisma } from '../../db/prisma';
import { getOnHandTotals } from '../products/onHandTotalsService';
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
    style_color: string | null;
    current_price: number | null;
    current_cost: number | null;
    picture_file_name: string | null;
  }
  const tier1 = await prisma.$queryRawUnsafe<Tier1Row[]>(
    `
    SELECT
      UPPER(TRIM(im.sku))                          AS sku_code,
      im."desc"                                    AS description,
      COALESCE(o.vendor, im.vendor)                AS vendor_code,
      im.manufacturer                              AS manufacturer,
      COALESCE(o.category, im.category)            AS category_number,
      c."desc"                                     AS category_desc,
      d.number                                     AS department_number,
      d."desc"                                     AS department_desc,
      im.style_color                               AS style_color,
      im.current_price::float8                     AS current_price,
      im.current_cost::float8                      AS current_cost,
      im.picture_file_name                         AS picture_file_name
    FROM rics_mirror.inventory_master im
    LEFT JOIN app.sku_attribute_override o ON im.sku = o.rics_sku_code
    LEFT JOIN rics_mirror.categories c ON c.number = COALESCE(o.category, im.category)
    LEFT JOIN rics_mirror.departments d
      ON COALESCE(o.category, im.category) BETWEEN d.beg_categ AND d.end_categ
    WHERE UPPER(TRIM(im.sku)) = ANY($1::text[])
    `,
    unique,
  );

  for (const r of tier1) {
    const picture = r.picture_file_name
      ? `/rics-images/${r.picture_file_name}`
      : null;
    result.set(r.sku_code, {
      description: r.description ?? null,
      vendorCode: r.vendor_code ?? null,
      manufacturer: r.manufacturer ?? null,
      categoryNumber: r.category_number ?? null,
      categoryDesc: r.category_desc ?? null,
      departmentNumber: r.department_number ?? null,
      departmentDesc: r.department_desc ?? null,
      styleColor: r.style_color ?? null,
      currentPrice: r.current_price ?? null,
      currentCost: r.current_cost ?? null,
      unitsOnHand: null, // filled below
      pictureUrl: picture,
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
        styleColor: null,
        currentPrice: null,
        currentCost: null,
        unitsOnHand: null,
        pictureUrl: null,
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
