/**
 * Custom Pivot adapter — operator picks any 3 of 8 dimensions and the tree
 * renders as `<L1> → <L2> → <L3> → SKU`.
 *
 *   Allowed dimensions: buyer, sector, department, season, group, vendor,
 *   store, category. Category is valid at level 3 only (narrowest grouping
 *   above SKU); levels 1 & 2 take the other 7.
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
  SalesPivotLeafRow,
  SalesPivotReport,
  SalesPivotTotals,
} from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

const ON_HAND_SUM_SQL = Array.from({ length: 18 }, (_, i) =>
  `COALESCE(on_hand_${String(i + 1).padStart(2, '0')}, 0)`,
).join(' + ');

const L1_L2_DIMENSIONS: ReadonlySet<PivotDimension> = new Set([
  'buyer', 'sector', 'department', 'season', 'group', 'vendor', 'store',
]);
const L3_DIMENSIONS: ReadonlySet<PivotDimension> = new Set([
  ...L1_L2_DIMENSIONS,
  'category',
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
interface StoreRow { number: number | null; desc: string | null }
interface SeasonOverlayRow { code: string; description: string }
interface GroupRow { code: string; desc: string | null }

async function loadSalesAgg(p: {
  tyStart: string; tyEndExcl: string; lyStart: string; lyEndExcl: string;
  separateStore: boolean; storeNumbers?: number[];
  skuFilter?: string[];
}): Promise<SalesAggRow[]> {
  const args: unknown[] = [p.tyStart, p.tyEndExcl, p.lyStart, p.lyEndExcl];
  let storeClause = '';
  if (p.storeNumbers && p.storeNumbers.length > 0) {
    args.push(p.storeNumbers.map((n) => Number(n)));
    storeClause = ` AND h.store = ANY($${args.length}::int[])`;
  }
  let skuClause = '';
  if (p.skuFilter) {
    // Empty whitelist → explicit empty result. A filter that resolves to
    // zero SKUs must yield zero rows, not every row.
    if (p.skuFilter.length === 0) return [];
    args.push(p.skuFilter);
    skuClause = ` AND UPPER(TRIM(d.sku)) = ANY($${args.length}::text[])`;
  }
  const storeSelect = p.separateStore ? 'h.store' : 'NULL::int';
  const storeGroupBy = p.separateStore ? 'h.store,' : '';
  const sql = `
    SELECT
      ${storeSelect} AS store,
      d.sku AS sku,
      CASE
        WHEN h.real_date >= $1::date AND h.real_date < $2::date THEN 'TY'
        WHEN h.real_date >= $3::date AND h.real_date < $4::date THEN 'LY'
        ELSE NULL
      END AS year_bucket,
      SUM(COALESCE(d.qty, 0))::float8 AS qty,
      SUM(COALESCE(d.extension, 0))::float8 AS net_sales,
      SUM(COALESCE(d.extension, 0) - COALESCE(d.cost, 0) * COALESCE(d.qty, 0))::float8 AS profit
    FROM rics_mirror.ticket_header h
    INNER JOIN rics_mirror.ticket_detail d
      ON h.user_id    = d.user_id
     AND h.batch_date = d.batch_date
     AND h.terminal   = d.terminal
     AND h.store      = d.store
     AND h.ticket     = d.ticket
     AND h.real_date  = d.real_date
    WHERE
      h.trans_type = 1
      AND h.voided  = false
      AND (
        (h.real_date >= $1::date AND h.real_date < $2::date) OR
        (h.real_date >= $3::date AND h.real_date < $4::date)
      )${storeClause}${skuClause}
    GROUP BY ${storeGroupBy} d.sku,
      CASE
        WHEN h.real_date >= $1::date AND h.real_date < $2::date THEN 'TY'
        WHEN h.real_date >= $3::date AND h.real_date < $4::date THEN 'LY'
        ELSE NULL
      END
  `;
  return prisma.$queryRawUnsafe<SalesAggRow[]>(sql, ...args);
}

async function loadOnHandAgg(p: {
  separateStore: boolean; storeNumbers?: number[];
  skuFilter?: string[];
}): Promise<OnHandAggRow[]> {
  const args: unknown[] = [];
  const where: string[] = [];
  if (p.storeNumbers && p.storeNumbers.length > 0) {
    args.push(p.storeNumbers.map((n) => Number(n)));
    where.push(`iq.store = ANY($${args.length}::int[])`);
  }
  if (p.skuFilter) {
    if (p.skuFilter.length === 0) return [];
    args.push(p.skuFilter);
    where.push(`UPPER(TRIM(iq.sku)) = ANY($${args.length}::text[])`);
  }
  const whereClause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const storeSelect = p.separateStore ? 'iq.store' : 'NULL::int';
  const storeGroupBy = p.separateStore ? 'iq.store,' : '';
  const sql = `
    SELECT
      ${storeSelect} AS store,
      iq.sku AS sku,
      SUM(${ON_HAND_SUM_SQL})::float8 AS on_hand_qty,
      SUM((${ON_HAND_SUM_SQL}) * COALESCE(im.current_cost, 0))::float8 AS on_hand_cost_val
    FROM rics_mirror.inventory_quantities iq
    INNER JOIN rics_mirror.inventory_master im ON im.sku = iq.sku
    ${whereClause}
    GROUP BY ${storeGroupBy} iq.sku
    HAVING SUM(${ON_HAND_SUM_SQL}) <> 0
  `;
  return prisma.$queryRawUnsafe<OnHandAggRow[]>(sql, ...args);
}

async function loadMasterForSkus(skus: string[]): Promise<MasterRow[]> {
  if (skus.length === 0) return [];
  return prisma.$queryRawUnsafe<MasterRow[]>(
    `
      SELECT
        im.sku AS sku,
        im."desc" AS desc,
        im.category AS category,
        im.vendor AS vendor,
        COALESCE(NULLIF(TRIM(vm.short_name), ''), NULLIF(TRIM(vm.manu_name), '')) AS vendor_label,
        im.season AS season,
        im.group_code AS group_code
      FROM rics_mirror.inventory_master im
      LEFT JOIN rics_mirror.vendor_master vm ON vm.code = im.vendor
      WHERE UPPER(TRIM(im.sku)) = ANY($1::text[])
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
    FROM rics_mirror.categories c
    LEFT JOIN rics_mirror.departments d
      ON c.number BETWEEN d.beg_categ AND d.end_categ
    LEFT JOIN rics_mirror.sectors s
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

async function loadStores(): Promise<StoreRow[]> {
  return prisma.$queryRawUnsafe<StoreRow[]>(
    `SELECT number, "desc" FROM rics_mirror.store_master`,
  );
}

async function loadSeasonOverlay(): Promise<SeasonOverlayRow[]> {
  return prisma.$queryRawUnsafe<SeasonOverlayRow[]>(
    `SELECT code, description FROM public.season_overlay`,
  );
}

async function loadGroupMap(): Promise<GroupRow[]> {
  return prisma.$queryRawUnsafe<GroupRow[]>(
    `SELECT code, "desc" FROM rics_mirror.group_codes`,
  );
}

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toUpperCase();
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
      FROM rics_mirror.categories c
      LEFT JOIN rics_mirror.departments d ON c.number BETWEEN d.beg_categ AND d.end_categ
      LEFT JOIN rics_mirror.sectors s ON d.number BETWEEN s.beg_dept AND s.end_dept
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
    where.push(`im.category = ANY($${args.length}::int[])`);
  }
  if (anySeasons) {
    args.push(filters.seasons!.map((s) => s.trim().toUpperCase()));
    where.push(`UPPER(TRIM(im.season)) = ANY($${args.length}::text[])`);
  }
  let skuSet: Set<string> | null = null;
  if (where.length > 0) {
    const rows = await prisma.$queryRawUnsafe<{ sku: string | null }[]>(
      `SELECT im.sku FROM rics_mirror.inventory_master im WHERE ${where.join(' AND ')}`,
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
  levels: [PivotDimension, PivotDimension, PivotDimension];
  /** Criteria filters — all applied as intersection against the SKU
   *  universe before aggregation. */
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
  const [l1, l2, l3] = params.levels;
  if (!L1_L2_DIMENSIONS.has(l1)) {
    throw new Error(`Invalid level 1 dimension: ${l1}`);
  }
  if (!L1_L2_DIMENSIONS.has(l2)) {
    throw new Error(`Invalid level 2 dimension: ${l2}`);
  }
  if (!L3_DIMENSIONS.has(l3)) {
    throw new Error(`Invalid level 3 dimension: ${l3}`);
  }
  const set = new Set([l1, l2, l3]);
  if (set.size !== 3) {
    throw new Error('Pivot levels must be three distinct dimensions');
  }

  // Store splits grain whenever it's one of the three levels.
  const separateStore = set.has('store');

  const tyStart = params.startDate;
  const tyEndExcl = exclusiveEnd(params.endDate);
  const lyStart = shiftYear(tyStart, -1);
  const lyEndExcl = shiftYear(tyEndExcl, -1);

  // Resolve the SKU whitelist from sector/department/season/buyer criteria
  // before we run the expensive sales + on-hand aggregations. `null` means
  // "no filter" and the adapter runs over every SKU.
  const skuFilter = await resolveCriteriaSkuWhitelist({
    sectors: params.sectors,
    departments: params.departments,
    seasons: params.seasons,
    buyers: params.buyers,
  });

  const [salesRows, onHandRows, taxonomy, storeRows, seasonRows, groupRows] = await Promise.all([
    loadSalesAgg({
      tyStart, tyEndExcl, lyStart, lyEndExcl,
      separateStore,
      storeNumbers: params.storeNumbers,
      skuFilter: skuFilter ?? undefined,
    }),
    loadOnHandAgg({
      separateStore,
      storeNumbers: params.storeNumbers,
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
  const [masters, buyers] = await Promise.all([
    loadMasterForSkus(skus),
    loadBuyerForSkus(skus),
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
  const seasonLabelByCode = new Map<string, string>();
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
    levels: [l1, l2, l3],
    startDate: params.startDate,
    endDate: params.endDate,
    currentYear,
    priorYear: currentYear - 1,
    storeNumbers: params.storeNumbers ?? [],
    rows,
    totals,
  };
}
