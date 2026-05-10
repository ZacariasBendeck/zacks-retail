/**
 * Custom Pivot adapter — operator picks any 3 dimensions and the tree
 * renders as `<L1> → <L2> → <L3> → SKU`.
 *
 *   Allowed dimensions: buyer, sector, department, season, group, vendor,
 *   store, category, attribute. Category can sit at level 2 so operators can
 *   run Department -> Category -> Attribute. Attribute is a dynamic deepest
 *   level backed by app.attribute_dimension assignments.
 *
 * Store is the one dimension that splits the aggregation grain — when it
 * appears in the chosen levels the leaves are keyed by `(store, sku)`;
 * otherwise stores are summed into `(sku)` leaves.
 *
 * Every row comes back in the unified `SalesPivotLeafRow` shape with all
 * dimension attributes populated (buyer / sector / dept / categ / vendor /
 * season / group) — the client groups by the caller's chosen levels.
 */

import { prisma } from '../../db/prisma';
import type {
  PivotDimension,
  SalesAnalysisCriteria,
  SalesPivotAttributeAssignment,
  SalesPivotAttributeDimension,
  SalesPivotLevels,
  SalesPivotLeafRow,
  SalesPivotReport,
  SalesPivotTotals,
} from './types';
import {
  resolveSharedProductCriteriaSkuWhitelist,
  resolveSharedStoreNumbers,
} from './sharedReportCriteria';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REPORT_TIME_ZONE = 'America/Tegucigalpa';

function assertDate(v: string, field: string): void {
  if (!DATE_RE.test(v)) throw new Error(`${field} must be YYYY-MM-DD, got ${v}`);
}

function shiftYear(iso: string, years: number): string {
  const y = Number(iso.slice(0, 4));
  const rest = iso.slice(4);
  return `${y + years}${rest}`;
}

function exclusiveEnd(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const L1_DIMENSIONS: ReadonlySet<PivotDimension> = new Set([
  'buyer', 'sector', 'department', 'season', 'group', 'vendor', 'store',
]);
const L2_DIMENSIONS: ReadonlySet<PivotDimension> = new Set([
  ...L1_DIMENSIONS,
  'category',
]);
const L3_DIMENSIONS: ReadonlySet<PivotDimension> = new Set([
  ...L2_DIMENSIONS,
  'attribute',
]);

interface SalesAggRow {
  store: number | null;
  sku: string | null;
  year_bucket: 'TY' | 'LY' | null;
  qty: number | null;
  net_sales: number | null;
  profit: number | null;
}
interface OnHandAggRow {
  store: number | null;
  sku: string | null;
  on_hand_qty: number | null;
  on_hand_cost_val: number | null;
}
interface MasterRow {
  sku: string | null;
  desc: string | null;
  picture_file_name: string | null;
  category: number | null;
  vendor: string | null;
  vendor_label: string | null;
  season: string | null;
  group_code: string | null;
}
interface TaxonomyRow {
  categ: number | null;
  categ_desc: string | null;
  dept: number | null;
  dept_desc: string | null;
  sector: number | null;
  sector_desc: string | null;
}
interface BuyerRow {
  sku_code: string | null;
  buyer_code: string | null;
  buyer_label: string | null;
}
interface AttributeAssignmentRow {
  sku_code: string | null;
  dimension_code: string | null;
  dimension_label: string | null;
  is_multi_value: boolean | null;
  dimension_sort_order: number | null;
  value_code: string | null;
  value_label: string | null;
}
interface StoreRow { number: number | null; desc: string | null }
interface SeasonOverlayRow { code: string; description: string | null }
interface GroupRow { code: string; desc: string | null }

async function loadSalesAgg(p: {
  tyStart: string; tyEndExcl: string; lyStart: string; lyEndExcl: string;
  separateStore: boolean; storeNumbers?: number[];
  skuFilter?: string[];
}): Promise<SalesAggRow[]> {
  if (p.storeNumbers && p.storeNumbers.length === 0) return [];
  const args: unknown[] = [p.tyStart, p.tyEndExcl, p.lyStart, p.lyEndExcl];
  let storeClause = '';
  if (p.storeNumbers && p.storeNumbers.length > 0) {
    args.push(p.storeNumbers.map((n) => Number(n)));
    storeClause = ` AND t.store_id = ANY($${args.length}::int[])`;
  }
  let skuClause = '';
  if (p.skuFilter) {
    // Empty whitelist → explicit empty result. A filter that resolves to
    // zero SKUs must yield zero rows, not every row.
    if (p.skuFilter.length === 0) return [];
    args.push(p.skuFilter);
    skuClause = ` AND UPPER(TRIM(s.code)) = ANY($${args.length}::text[])`;
  }
  const storeSelect = p.separateStore ? 't.store_id' : 'NULL::int';
  const storeGroupBy = p.separateStore ? 't.store_id,' : '';
  const tyStartExpr = `($1::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')`;
  const tyEndExpr = `($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')`;
  const lyStartExpr = `($3::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')`;
  const lyEndExpr = `($4::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')`;
  const sql = `
    SELECT
      ${storeSelect} AS store,
      UPPER(TRIM(s.code)) AS sku,
      CASE
        WHEN t.purchased_at >= ${tyStartExpr} AND t.purchased_at < ${tyEndExpr} THEN 'TY'
        WHEN t.purchased_at >= ${lyStartExpr} AND t.purchased_at < ${lyEndExpr} THEN 'LY'
        ELSE NULL
      END AS year_bucket,
      SUM(COALESCE(l.quantity, 0))::float8 AS qty,
      SUM(COALESCE(l.net_amount, 0))::float8 AS net_sales,
      SUM(COALESCE(l.net_amount, 0) - COALESCE(l.cost_amount, 0))::float8 AS profit
    FROM app.sales_history_ticket t
    INNER JOIN app.sales_history_ticket_line l ON t.id = l.ticket_id
    INNER JOIN app.sku s ON s.id = l.sku_id
    WHERE
      t.status = 'completed'
      AND COALESCE(BTRIM(s.code), '') <> ''
      AND (
        (t.purchased_at >= ${tyStartExpr} AND t.purchased_at < ${tyEndExpr}) OR
        (t.purchased_at >= ${lyStartExpr} AND t.purchased_at < ${lyEndExpr})
      )${storeClause}${skuClause}
    GROUP BY ${storeGroupBy} UPPER(TRIM(s.code)),
      CASE
        WHEN t.purchased_at >= ${tyStartExpr} AND t.purchased_at < ${tyEndExpr} THEN 'TY'
        WHEN t.purchased_at >= ${lyStartExpr} AND t.purchased_at < ${lyEndExpr} THEN 'LY'
        ELSE NULL
      END
  `;
  return prisma.$queryRawUnsafe<SalesAggRow[]>(sql, ...args);
}

async function loadOnHandAgg(p: {
  separateStore: boolean; storeNumbers?: number[];
  skuFilter?: string[];
}): Promise<OnHandAggRow[]> {
  if (p.storeNumbers && p.storeNumbers.length === 0) return [];
  const args: unknown[] = [];
  const where: string[] = [];
  if (p.storeNumbers && p.storeNumbers.length > 0) {
    args.push(p.storeNumbers.map((n) => Number(n)));
    where.push(`sl.store_id = ANY($${args.length}::int[])`);
  }
  if (p.skuFilter) {
    if (p.skuFilter.length === 0) return [];
    args.push(p.skuFilter);
    where.push(`UPPER(TRIM(s.code)) = ANY($${args.length}::text[])`);
  }
  const whereClause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const storeSelect = p.separateStore ? 'sl.store_id' : 'NULL::int';
  const storeGroupBy = p.separateStore ? 'sl.store_id,' : '';
  const sql = `
    SELECT
      ${storeSelect} AS store,
      UPPER(TRIM(s.code)) AS sku,
      SUM(COALESCE(sl.on_hand, 0))::float8 AS on_hand_qty,
      SUM(COALESCE(sl.on_hand, 0) * COALESCE(s.current_cost, 0))::float8 AS on_hand_cost_val
    FROM app.stock_level sl
    INNER JOIN app.sku s ON s.id = sl.sku_id
    ${whereClause}
    GROUP BY ${storeGroupBy} UPPER(TRIM(s.code))
    HAVING SUM(COALESCE(sl.on_hand, 0)) <> 0
  `;
  return prisma.$queryRawUnsafe<OnHandAggRow[]>(sql, ...args);
}

async function loadMasterForSkus(skus: string[]): Promise<MasterRow[]> {
  if (skus.length === 0) return [];
  return prisma.$queryRawUnsafe<MasterRow[]>(
    `
      SELECT
        UPPER(TRIM(s.code)) AS sku,
        s.description_rics AS desc,
        NULLIF(BTRIM(s.picture_file_name), '') AS picture_file_name,
        s.category_number AS category,
        s.vendor_id AS vendor,
        COALESCE(NULLIF(TRIM(v.short_name), ''), NULLIF(TRIM(v.manu_name), '')) AS vendor_label,
        s.season AS season,
        s.group_code AS group_code
      FROM app.sku s
      LEFT JOIN app.vendor v ON v.code = s.vendor_id
      WHERE UPPER(TRIM(s.code)) = ANY($1::text[])
    `,
    skus,
  );
}

async function loadTaxonomy(): Promise<TaxonomyRow[]> {
  return prisma.$queryRawUnsafe<TaxonomyRow[]>(`
    SELECT
      c.number AS categ,
      c."desc" AS categ_desc,
      d.number AS dept,
      d."desc" AS dept_desc,
      s.number AS sector,
      s."desc" AS sector_desc
    FROM app.taxonomy_category c
    LEFT JOIN app.taxonomy_department d
      ON c.number BETWEEN d.beg_categ AND d.end_categ
    LEFT JOIN app.taxonomy_sector s
      ON d.number BETWEEN s.beg_dept AND s.end_dept
  `);
}

async function loadBuyerForSkus(skus: string[]): Promise<BuyerRow[]> {
  if (skus.length === 0) return [];
  return prisma.$queryRawUnsafe<BuyerRow[]>(
    `
      SELECT
        UPPER(TRIM(saa.sku_code)) AS sku_code,
        av.code                   AS buyer_code,
        av.label_es               AS buyer_label
      FROM app.sku_attribute_assignment saa
      INNER JOIN app.attribute_dimension ad ON ad.id = saa.dimension_id
      INNER JOIN app.attribute_value    av ON av.id = saa.value_id
      WHERE ad.code = 'buyer'
        AND UPPER(TRIM(saa.sku_code)) = ANY($1::text[])
    `,
    skus,
  );
}

async function loadAttributeAssignmentsForSkus(skus: string[]): Promise<{
  dimensions: SalesPivotAttributeDimension[];
  assignmentsBySku: Map<string, Record<string, SalesPivotAttributeAssignment>>;
}> {
  const empty = {
    dimensions: [] as SalesPivotAttributeDimension[],
    assignmentsBySku: new Map<string, Record<string, SalesPivotAttributeAssignment>>(),
  };
  if (skus.length === 0) return empty;

  const rows = await prisma.$queryRawUnsafe<AttributeAssignmentRow[]>(
    `
      SELECT
        UPPER(TRIM(saa.sku_code)) AS sku_code,
        ad.code                   AS dimension_code,
        ad.label_es               AS dimension_label,
        ad.is_multi_value         AS is_multi_value,
        ad.sort_order             AS dimension_sort_order,
        av.code                   AS value_code,
        av.label_es               AS value_label
      FROM app.sku_attribute_assignment saa
      INNER JOIN app.attribute_dimension ad ON ad.id = saa.dimension_id
      INNER JOIN app.attribute_value av ON av.id = saa.value_id
      WHERE UPPER(TRIM(saa.sku_code)) = ANY($1::text[])
      ORDER BY ad.sort_order, ad.label_es, av.sort_order, av.label_es
    `,
    skus,
  );

  const dimensionsByCode = new Map<string, SalesPivotAttributeDimension>();
  const assignmentsBySku = new Map<string, Record<string, SalesPivotAttributeAssignment>>();

  for (const row of rows) {
    const sku = norm(row.sku_code);
    const dimensionCode = row.dimension_code?.trim();
    const valueCode = row.value_code?.trim();
    const valueLabel = row.value_label?.trim();
    if (!sku || !dimensionCode || !valueCode || !valueLabel) continue;

    if (!dimensionsByCode.has(dimensionCode)) {
      dimensionsByCode.set(dimensionCode, {
        code: dimensionCode,
        label: row.dimension_label?.trim() || dimensionCode,
        isMultiValue: row.is_multi_value === true,
        sortOrder: Number(row.dimension_sort_order ?? 0),
      });
    }

    const skuAssignments = assignmentsBySku.get(sku) ?? {};
    const current = skuAssignments[dimensionCode] ?? {
      valueCodes: [],
      valueLabels: [],
      label: '',
    };
    current.valueCodes.push(valueCode);
    current.valueLabels.push(valueLabel);
    current.label = current.valueLabels.join(', ');
    skuAssignments[dimensionCode] = current;
    assignmentsBySku.set(sku, skuAssignments);
  }

  const dimensions = [...dimensionsByCode.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));

  return { dimensions, assignmentsBySku };
}

async function loadStores(): Promise<StoreRow[]> {
  return prisma.$queryRawUnsafe<StoreRow[]>(
    `SELECT number, "desc" FROM app.store_master`,
  );
}

async function loadSeasonOverlay(): Promise<SeasonOverlayRow[]> {
  const [{ present }] = await prisma.$queryRawUnsafe<Array<{ present: boolean }>>(
    `SELECT to_regclass('public.season_overlay') IS NOT NULL AS present`,
  );
  if (present) {
    return prisma.$queryRawUnsafe<SeasonOverlayRow[]>(
      `SELECT code, description FROM public.season_overlay`,
    );
  }
  return prisma.$queryRawUnsafe<SeasonOverlayRow[]>(
    `
      SELECT DISTINCT TRIM(season) AS code, NULL::text AS description
      FROM app.sku
      WHERE COALESCE(TRIM(season), '') <> ''
      ORDER BY TRIM(season)
    `,
  );
}

async function loadGroupMap(): Promise<GroupRow[]> {
  return prisma.$queryRawUnsafe<GroupRow[]>(
    `SELECT code, "desc" FROM app.taxonomy_group`,
  );
}

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toUpperCase();
}

async function resolveStoreNumbersForChains(filters: {
  storeNumbers?: number[];
  chains?: string[];
}): Promise<number[] | undefined> {
  const explicitStores = (filters.storeNumbers ?? [])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0);
  const chains = (filters.chains ?? [])
    .map((c) => c.trim())
    .filter(Boolean);

  if (chains.length === 0) {
    return explicitStores.length > 0 ? [...new Set(explicitStores)].sort((a, b) => a - b) : undefined;
  }

  const rows = await prisma.$queryRawUnsafe<{ store_number: number | null }[]>(
    `
      SELECT sgm.store_number
      FROM app.store_group_member sgm
      INNER JOIN app.store_group sg ON sg.code = sgm.group_code
      WHERE sg.active = true
        AND sgm.group_code = ANY($1::text[])
    `,
    chains,
  );

  const out = new Set<number>(explicitStores);
  for (const row of rows) {
    const storeNumber = Number(row.store_number);
    if (Number.isInteger(storeNumber) && storeNumber > 0) {
      out.add(storeNumber);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Resolve the SKU whitelist for the criteria filters. Returns `null` if no
 * filter narrows the universe (run over every SKU), or an array — possibly
 * empty — of normalized SKU codes that match. An empty array is meaningful:
 * the filter combination resolved to zero SKUs and the report must emit
 * zero rows.
 *
 * Pipeline:
 *   1. Sector → dept range → category set
 *   2. Department → category set (UNION with above)
 *   3. Category ∩ season filter → SKU set via inventory_master
 *   4. Intersect with buyer-assignment SKU set
 */
async function resolveCriteriaSkuWhitelist(filters: {
  sectors?: number[];
  departments?: number[];
  seasons?: string[];
  buyers?: string[];
}): Promise<string[] | null> {
  const anySectors = (filters.sectors?.length ?? 0) > 0;
  const anyDepts = (filters.departments?.length ?? 0) > 0;
  const anySeasons = (filters.seasons?.length ?? 0) > 0;
  const anyBuyers = (filters.buyers?.length ?? 0) > 0;
  if (!anySectors && !anyDepts && !anySeasons && !anyBuyers) return null;

  // Resolve categories from sector + department choices. Union-of-selections.
  let allowedCategories: number[] | null = null;
  if (anySectors || anyDepts) {
    const taxRows = await prisma.$queryRawUnsafe<TaxonomyRow[]>(`
      SELECT
        c.number AS categ,
        c."desc" AS categ_desc,
        d.number AS dept,
        d."desc" AS dept_desc,
        s.number AS sector,
        s."desc" AS sector_desc
      FROM app.taxonomy_category c
      LEFT JOIN app.taxonomy_department d ON c.number BETWEEN d.beg_categ AND d.end_categ
      LEFT JOIN app.taxonomy_sector s ON d.number BETWEEN s.beg_dept AND s.end_dept
    `);
    const sectorSet = anySectors ? new Set(filters.sectors!.map(Number)) : null;
    const deptSet = anyDepts ? new Set(filters.departments!.map(Number)) : null;
    const cats = new Set<number>();
    for (const t of taxRows) {
      if (t.categ == null) continue;
      const categ = Number(t.categ);
      const matchesSector = sectorSet && t.sector != null && sectorSet.has(Number(t.sector));
      const matchesDept = deptSet && t.dept != null && deptSet.has(Number(t.dept));
      if (matchesSector || matchesDept) cats.add(categ);
    }
    allowedCategories = [...cats];
    if (allowedCategories.length === 0) return [];
  }

  // Query the SKU universe that matches category + season.
  const args: unknown[] = [];
  const where: string[] = [];
  if (allowedCategories) {
    args.push(allowedCategories);
    where.push(`s.category_number = ANY($${args.length}::int[])`);
  }
  if (anySeasons) {
    args.push(filters.seasons!.map((s) => s.trim().toUpperCase()));
    where.push(`UPPER(TRIM(s.season)) = ANY($${args.length}::text[])`);
  }
  let skuSet: Set<string> | null = null;
  if (where.length > 0) {
    const rows = await prisma.$queryRawUnsafe<{ sku: string | null }[]>(
      `SELECT s.code AS sku FROM app.sku s WHERE ${where.join(' AND ')}`,
      ...args,
    );
    skuSet = new Set(rows.map((r) => norm(r.sku)).filter(Boolean));
    if (skuSet.size === 0) return [];
  }

  // Intersect with buyer-assignment SKUs.
  if (anyBuyers) {
    const buyerRows = await prisma.$queryRawUnsafe<{ sku_code: string | null }[]>(
      `
        SELECT UPPER(TRIM(saa.sku_code)) AS sku_code
        FROM app.sku_attribute_assignment saa
        INNER JOIN app.attribute_dimension ad ON ad.id = saa.dimension_id
        INNER JOIN app.attribute_value    av ON av.id = saa.value_id
        WHERE ad.code = 'buyer' AND av.code = ANY($1::text[])
      `,
      filters.buyers!,
    );
    const buyerSkus = new Set<string>();
    for (const r of buyerRows) {
      const k = norm(r.sku_code);
      if (k) buyerSkus.add(k);
    }
    if (buyerSkus.size === 0) return [];
    skuSet = skuSet ? new Set([...skuSet].filter((s) => buyerSkus.has(s))) : buyerSkus;
    if (skuSet.size === 0) return [];
  }

  return skuSet ? [...skuSet] : null;
}

export async function getSalesPivotCustom(params: {
  startDate: string;
  endDate: string;
  storeNumbers?: number[];
  levels: SalesPivotLevels;
  criteria?: SalesAnalysisCriteria;
  chains?: string[];
  sectors?: number[];
  departments?: number[];
  seasons?: string[];
  buyers?: string[];
}): Promise<SalesPivotReport> {
  assertDate(params.startDate, 'startDate');
  assertDate(params.endDate, 'endDate');
  if (params.startDate > params.endDate) {
    throw new Error('startDate must be <= endDate');
  }
  if (params.levels.length < 2 || params.levels.length > 3) {
    throw new Error('Pivot levels must contain two or three dimensions');
  }
  params.levels.forEach((level, index) => {
    const isDeepest = index === params.levels.length - 1;
    const allowed = index === 0
      ? L1_DIMENSIONS
      : isDeepest
        ? L3_DIMENSIONS
        : L2_DIMENSIONS;
    if (!allowed.has(level)) {
      throw new Error(`Invalid level ${index + 1} dimension: ${level}`);
    }
  });
  const set = new Set(params.levels);
  if (set.size !== params.levels.length) {
    throw new Error('Pivot levels must be distinct dimensions');
  }

  // Store splits grain whenever it's one of the three levels.
  const separateStore = set.has('store');

  const tyStart = params.startDate;
  const tyEndExcl = exclusiveEnd(params.endDate);
  const lyStart = shiftYear(tyStart, -1);
  const lyEndExcl = shiftYear(tyEndExcl, -1);
  const effectiveStoreNumbers = await resolveSharedStoreNumbers(params.criteria, params.storeNumbers);

  // Resolve the SKU whitelist from sector/department/season/buyer criteria
  // before we run the expensive sales + on-hand aggregations. `null` means
  // "no filter" and the adapter runs over every SKU.
  const skuFilter = await resolveSharedProductCriteriaSkuWhitelist(params.criteria);

  const [salesRows, onHandRows, taxonomy, storeRows, seasonRows, groupRows] = await Promise.all([
    loadSalesAgg({
      tyStart, tyEndExcl, lyStart, lyEndExcl,
      separateStore,
      storeNumbers: effectiveStoreNumbers,
      skuFilter: skuFilter ?? undefined,
    }),
    loadOnHandAgg({
      separateStore,
      storeNumbers: effectiveStoreNumbers,
      skuFilter: skuFilter ?? undefined,
    }),
    loadTaxonomy(),
    loadStores(),
    loadSeasonOverlay().catch(() => [] as SeasonOverlayRow[]),
    loadGroupMap(),
  ]);

  const skuSet = new Set<string>();
  for (const s of salesRows) {
    const k = norm(s.sku);
    if (k) skuSet.add(k);
  }
  for (const o of onHandRows) {
    const k = norm(o.sku);
    if (k) skuSet.add(k);
  }
  const skus = [...skuSet];
  const includeAttributeLevel = set.has('attribute');
  const [masters, buyers, attributeLoad] = await Promise.all([
    loadMasterForSkus(skus),
    loadBuyerForSkus(skus),
    includeAttributeLevel
      ? loadAttributeAssignmentsForSkus(skus)
      : Promise.resolve({
          dimensions: [] as SalesPivotAttributeDimension[],
          assignmentsBySku: new Map<string, Record<string, SalesPivotAttributeAssignment>>(),
        }),
  ]);

  const masterBySku = new Map<string, MasterRow>();
  for (const m of masters) {
    const k = norm(m.sku);
    if (k) masterBySku.set(k, m);
  }
  const buyerBySku = new Map<string, BuyerRow>();
  for (const b of buyers) {
    const k = norm(b.sku_code);
    if (k) buyerBySku.set(k, b);
  }
  const taxonomyByCateg = new Map<number, TaxonomyRow>();
  for (const t of taxonomy) {
    if (t.categ == null) continue;
    taxonomyByCateg.set(Number(t.categ), t);
  }
  const storeNameByNumber = new Map<number, string | null>();
  for (const s of storeRows) {
    if (s.number == null) continue;
    storeNameByNumber.set(Number(s.number), s.desc?.trim() || null);
  }
  const seasonLabelByCode = new Map<string, string | null>();
  for (const s of seasonRows) {
    if (!s.code) continue;
    seasonLabelByCode.set(s.code.trim().toUpperCase(), s.description);
  }
  const groupLabelByCode = new Map<string, string | null>();
  for (const g of groupRows) {
    if (!g.code) continue;
    groupLabelByCode.set(g.code.trim().toUpperCase(), g.desc?.trim() || null);
  }

  interface LeafAcc {
    store: number | null;
    sku: string;
    onHandQty: number; onHandCostVal: number;
    qtyTY: number; netSalesTY: number; profitTY: number;
    qtyLY: number; netSalesLY: number; profitLY: number;
  }
  const leaves = new Map<string, LeafAcc>();
  const keyOf = (store: number | null, sku: string): string =>
    `${store ?? 'ALL'}|${sku}`;
  const ensure = (store: number | null, sku: string): LeafAcc => {
    const k = keyOf(store, sku);
    let r = leaves.get(k);
    if (!r) {
      r = {
        store, sku,
        onHandQty: 0, onHandCostVal: 0,
        qtyTY: 0, netSalesTY: 0, profitTY: 0,
        qtyLY: 0, netSalesLY: 0, profitLY: 0,
      };
      leaves.set(k, r);
    }
    return r;
  };

  for (const s of salesRows) {
    const k = norm(s.sku);
    if (!k || s.year_bucket == null) continue;
    const store = separateStore ? (s.store == null ? null : Number(s.store)) : null;
    const row = ensure(store, k);
    const qty = Number(s.qty ?? 0);
    const net = Number(s.net_sales ?? 0);
    const prof = Number(s.profit ?? 0);
    if (s.year_bucket === 'TY') {
      row.qtyTY += qty; row.netSalesTY += net; row.profitTY += prof;
    } else {
      row.qtyLY += qty; row.netSalesLY += net; row.profitLY += prof;
    }
  }
  for (const o of onHandRows) {
    const k = norm(o.sku);
    if (!k) continue;
    const store = separateStore ? (o.store == null ? null : Number(o.store)) : null;
    const row = ensure(store, k);
    row.onHandQty += Number(o.on_hand_qty ?? 0);
    row.onHandCostVal += Number(o.on_hand_cost_val ?? 0);
  }

  const rows: SalesPivotLeafRow[] = [];
  const totals: SalesPivotTotals = {
    onHandQty: 0, onHandCostVal: 0,
    qtyTY: 0, netSalesTY: 0, profitTY: 0,
    qtyLY: 0, netSalesLY: 0, profitLY: 0,
  };

  for (const leaf of leaves.values()) {
    const m = masterBySku.get(leaf.sku);
    const b = buyerBySku.get(leaf.sku);
    const categNum = m?.category != null ? Number(m.category) : null;
    const tax = categNum != null ? taxonomyByCateg.get(categNum) ?? null : null;
    const seasonCode = m?.season?.trim() || null;
    const seasonKey = seasonCode ? seasonCode.toUpperCase() : null;
    const groupCode = m?.group_code?.trim() || null;
    const groupKey = groupCode ? groupCode.toUpperCase() : null;

    rows.push({
      storeNumber: leaf.store,
      storeName: leaf.store != null ? storeNameByNumber.get(leaf.store) ?? null : null,
      buyerCode: b?.buyer_code ?? null,
      buyerLabel: b?.buyer_label ?? null,
      vendorCode: m?.vendor?.trim() || null,
      vendorLabel: m?.vendor_label?.trim() || null,
      sector: tax?.sector != null ? Number(tax.sector) : null,
      sectorDesc: tax?.sector_desc?.trim() || null,
      dept: tax?.dept != null ? Number(tax.dept) : null,
      deptDesc: tax?.dept_desc?.trim() || null,
      categ: categNum,
      categDesc: tax?.categ_desc?.trim() || m?.desc?.trim() || null,
      season: seasonCode,
      seasonDesc: seasonKey ? seasonLabelByCode.get(seasonKey) ?? null : null,
      groupCode,
      groupDesc: groupKey ? groupLabelByCode.get(groupKey) ?? null : null,
      sku: leaf.sku,
      skuDescription: m?.desc?.trim() || null,
      pictureFileName: m?.picture_file_name?.trim() || null,
      ...(includeAttributeLevel
        ? { attributeAssignments: attributeLoad.assignmentsBySku.get(leaf.sku) ?? {} }
        : {}),
      onHandQty: leaf.onHandQty,
      onHandCostVal: leaf.onHandCostVal,
      qtyTY: leaf.qtyTY,
      netSalesTY: leaf.netSalesTY,
      profitTY: leaf.profitTY,
      qtyLY: leaf.qtyLY,
      netSalesLY: leaf.netSalesLY,
      profitLY: leaf.profitLY,
    });
    totals.onHandQty += leaf.onHandQty;
    totals.onHandCostVal += leaf.onHandCostVal;
    totals.qtyTY += leaf.qtyTY;
    totals.netSalesTY += leaf.netSalesTY;
    totals.profitTY += leaf.profitTY;
    totals.qtyLY += leaf.qtyLY;
    totals.netSalesLY += leaf.netSalesLY;
    totals.profitLY += leaf.profitLY;
  }

  const currentYear = Number(params.startDate.slice(0, 4));
  return {
    variant: 'custom',
    levels: params.levels,
    startDate: params.startDate,
    endDate: params.endDate,
    currentYear,
    priorYear: currentYear - 1,
    storeNumbers: effectiveStoreNumbers ?? [],
    ...(includeAttributeLevel ? { attributeDimensions: attributeLoad.dimensions } : {}),
    rows,
    totals,
  };
}
