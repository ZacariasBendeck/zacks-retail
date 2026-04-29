/**
 * Department Pivot adapter — two sub-variants of the Sales Pivot family.
 *
 *   department               Sector → Dept → Category → SKU         (stores aggregated)
 *   department-separate-store  Store → Sector → Dept → Category → SKU
 *
 * Leaves are SKU-grained. Stores are aggregated in the default variant; the
 * `-separate-store` variant keeps the per-store split (one row per
 * `(store, sku)` pair). Emits the unified `SalesPivotLeafRow` shape.
 *
 * Reads the app-owned imported baselines (`app.sales_history_ticket*`,
 * `app.stock_level`, `app.sku`, taxonomy/store/vendor tables).
 */

import { prisma } from '../../db/prisma';
import type {
  SalesPivotLeafRow,
  SalesPivotReport,
  SalesPivotTotals,
  SalesPivotVariant,
} from './types';

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
  picture_file_name: string | null;
}

interface TaxonomyRow {
  categ: number | null;
  categ_desc: string | null;
  dept: number | null;
  dept_desc: string | null;
  sector: number | null;
  sector_desc: string | null;
}

interface StoreRow {
  number: number | null;
  desc: string | null;
}

async function loadSalesAgg(params: {
  tyStart: string;
  tyEndExcl: string;
  lyStart: string;
  lyEndExcl: string;
  separateStore: boolean;
  storeNumbers?: number[];
}): Promise<SalesAggRow[]> {
  const storeClause = params.storeNumbers && params.storeNumbers.length > 0
    ? ` AND t.store_id = ANY($5::int[])`
    : '';
  // `store` is grouped only when we keep stores separated; otherwise it's
  // always NULL on the returned row and the aggregator sums across stores.
  const storeSelect = params.separateStore ? 't.store_id' : 'NULL::int';
  const storeGroupBy = params.separateStore ? 't.store_id,' : '';
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
      )${storeClause}
    GROUP BY ${storeGroupBy} UPPER(TRIM(s.code)),
      CASE
        WHEN t.purchased_at >= ${tyStartExpr} AND t.purchased_at < ${tyEndExpr} THEN 'TY'
        WHEN t.purchased_at >= ${lyStartExpr} AND t.purchased_at < ${lyEndExpr} THEN 'LY'
        ELSE NULL
      END
  `;
  const args: unknown[] = [params.tyStart, params.tyEndExcl, params.lyStart, params.lyEndExcl];
  if (params.storeNumbers && params.storeNumbers.length > 0) {
    args.push(params.storeNumbers.map((n) => Number(n)));
  }
  return prisma.$queryRawUnsafe<SalesAggRow[]>(sql, ...args);
}

async function loadOnHandAgg(params: {
  separateStore: boolean;
  storeNumbers?: number[];
}): Promise<OnHandAggRow[]> {
  const storeClause = params.storeNumbers && params.storeNumbers.length > 0
    ? ` WHERE sl.store_id = ANY($1::int[])`
    : '';
  const storeSelect = params.separateStore ? 'sl.store_id' : 'NULL::int';
  const storeGroupBy = params.separateStore ? 'sl.store_id,' : '';
  const sql = `
    SELECT
      ${storeSelect} AS store,
      UPPER(TRIM(s.code)) AS sku,
      SUM(COALESCE(sl.on_hand, 0))::float8 AS on_hand_qty,
      SUM(COALESCE(sl.on_hand, 0) * COALESCE(s.current_cost, 0))::float8 AS on_hand_cost_val
    FROM app.stock_level sl
    INNER JOIN app.sku s ON s.id = sl.sku_id
    ${storeClause}
    GROUP BY ${storeGroupBy} UPPER(TRIM(s.code))
    HAVING SUM(COALESCE(sl.on_hand, 0)) <> 0
  `;
  const args: unknown[] = [];
  if (params.storeNumbers && params.storeNumbers.length > 0) {
    args.push(params.storeNumbers.map((n) => Number(n)));
  }
  return prisma.$queryRawUnsafe<OnHandAggRow[]>(sql, ...args);
}

async function loadMasterForSkus(skus: string[]): Promise<MasterRow[]> {
  if (skus.length === 0) return [];
  return prisma.$queryRawUnsafe<MasterRow[]>(
    `
      SELECT
        UPPER(TRIM(s.code)) AS sku,
        s.description_rics AS desc,
        s.category_number AS category,
        s.picture_file_name AS picture_file_name
      FROM app.sku s
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

async function loadStores(): Promise<StoreRow[]> {
  return prisma.$queryRawUnsafe<StoreRow[]>(
    `SELECT number, "desc" FROM app.store_master`,
  );
}

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toUpperCase();
}

export async function getSalesPivotByDepartment(params: {
  startDate: string;
  endDate: string;
  storeNumbers?: number[];
  separateStore?: boolean;
}): Promise<SalesPivotReport> {
  assertDate(params.startDate, 'startDate');
  assertDate(params.endDate, 'endDate');
  if (params.startDate > params.endDate) {
    throw new Error('startDate must be <= endDate');
  }

  const separateStore = params.separateStore === true;
  const variant: SalesPivotVariant = separateStore
    ? 'department-separate-store'
    : 'department';

  const tyStart = params.startDate;
  const tyEndExcl = exclusiveEnd(params.endDate);
  const lyStart = shiftYear(tyStart, -1);
  const lyEndExcl = shiftYear(tyEndExcl, -1);

  const [salesRows, onHandRows, taxonomy, storeRows] = await Promise.all([
    loadSalesAgg({
      tyStart, tyEndExcl, lyStart, lyEndExcl,
      separateStore,
      storeNumbers: params.storeNumbers,
    }),
    loadOnHandAgg({ separateStore, storeNumbers: params.storeNumbers }),
    loadTaxonomy(),
    separateStore ? loadStores() : Promise.resolve([] as StoreRow[]),
  ]);

  // Collect every SKU that shows up in either aggregate, normalized.
  const skuSet = new Set<string>();
  for (const s of salesRows) {
    const k = norm(s.sku);
    if (k) skuSet.add(k);
  }
  for (const o of onHandRows) {
    const k = norm(o.sku);
    if (k) skuSet.add(k);
  }
  const masters = await loadMasterForSkus([...skuSet]);
  const masterBySku = new Map<string, MasterRow>();
  for (const m of masters) {
    const k = norm(m.sku);
    if (k) masterBySku.set(k, m);
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

  interface LeafAcc {
    store: number | null;
    sku: string;
    onHandQty: number;
    onHandCostVal: number;
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
    const categNum = m?.category != null ? Number(m.category) : null;
    const tax = categNum != null ? taxonomyByCateg.get(categNum) ?? null : null;

    rows.push({
      storeNumber: leaf.store,
      storeName: leaf.store != null ? storeNameByNumber.get(leaf.store) ?? null : null,
      buyerCode: null,
      buyerLabel: null,
      vendorCode: null,
      vendorLabel: null,
      sector: tax?.sector != null ? Number(tax.sector) : null,
      sectorDesc: tax?.sector_desc?.trim() || null,
      dept: tax?.dept != null ? Number(tax.dept) : null,
      deptDesc: tax?.dept_desc?.trim() || null,
      categ: categNum,
      categDesc: tax?.categ_desc?.trim() || m?.desc?.trim() || null,
      season: null,
      seasonDesc: null,
      groupCode: null,
      groupDesc: null,
      sku: leaf.sku,
      skuDescription: m?.desc?.trim() || null,
      pictureFileName: m?.picture_file_name?.trim() || null,
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
    variant,
    startDate: params.startDate,
    endDate: params.endDate,
    currentYear,
    priorYear: currentYear - 1,
    storeNumbers: params.storeNumbers ?? [],
    rows,
    totals,
  };
}
