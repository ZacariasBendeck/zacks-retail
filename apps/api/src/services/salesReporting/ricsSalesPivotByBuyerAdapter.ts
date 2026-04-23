/**
 * Buyer Pivot adapter — three variants of the buyer-led hierarchy.
 *
 *   buyer                          Buyer → Dept → Category → SKU
 *   buyer-vendor                   Buyer → Vendor → SKU
 *   buyer-vendor-separate-store    Store → Buyer → Vendor → SKU
 *
 * Reads rics_mirror + app.sku_attribute_assignment (for buyer). Returns the
 * unified `SalesPivotLeafRow` shape; identity fields irrelevant to the
 * requested variant are null. The Dept/Category fields stay populated on
 * every variant — they're cheap to compute and let the UI show them as
 * a hover/secondary hint on buyer-vendor leaves without a second round trip.
 */

import { prisma } from '../../db/prisma';
import type { SalesPivotLeafRow, SalesPivotReport, SalesPivotTotals, SalesPivotVariant } from './types';

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
}

interface DeptMapRow {
  categ: number | null;
  categ_desc: string | null;
  dept: number | null;
  dept_desc: string | null;
}

interface BuyerRow {
  sku_code: string | null;
  buyer_code: string | null;
  buyer_label: string | null;
}

interface StoreRow {
  number: number | null;
  desc: string | null;
}

async function loadSalesAgg(params: {
  tyStart: string; tyEndExcl: string;
  lyStart: string; lyEndExcl: string;
  separateStore: boolean;
  storeNumbers?: number[];
}): Promise<SalesAggRow[]> {
  const storeClause = params.storeNumbers && params.storeNumbers.length > 0
    ? ` AND h.store = ANY($5::int[])`
    : '';
  const storeSelect = params.separateStore ? 'h.store' : 'NULL::int';
  const storeGroupBy = params.separateStore ? 'h.store,' : '';
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
      )${storeClause}
    GROUP BY ${storeGroupBy} d.sku,
      CASE
        WHEN h.real_date >= $1::date AND h.real_date < $2::date THEN 'TY'
        WHEN h.real_date >= $3::date AND h.real_date < $4::date THEN 'LY'
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
    ? ` WHERE iq.store = ANY($1::int[])`
    : '';
  const storeSelect = params.separateStore ? 'iq.store' : 'NULL::int';
  const storeGroupBy = params.separateStore ? 'iq.store,' : '';
  const sql = `
    SELECT
      ${storeSelect} AS store,
      iq.sku AS sku,
      SUM(${ON_HAND_SUM_SQL})::float8 AS on_hand_qty,
      SUM((${ON_HAND_SUM_SQL}) * COALESCE(im.current_cost, 0))::float8 AS on_hand_cost_val
    FROM rics_mirror.inventory_quantities iq
    INNER JOIN rics_mirror.inventory_master im ON im.sku = iq.sku
    ${storeClause}
    GROUP BY ${storeGroupBy} iq.sku
    HAVING SUM(${ON_HAND_SUM_SQL}) <> 0
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
        im.sku AS sku,
        im."desc" AS desc,
        im.category AS category,
        im.vendor AS vendor,
        COALESCE(NULLIF(TRIM(vm.short_name), ''), NULLIF(TRIM(vm.manu_name), '')) AS vendor_label
      FROM rics_mirror.inventory_master im
      LEFT JOIN rics_mirror.vendor_master vm ON vm.code = im.vendor
      WHERE UPPER(TRIM(im.sku)) = ANY($1::text[])
    `,
    skus,
  );
}

async function loadDeptMap(): Promise<DeptMapRow[]> {
  return prisma.$queryRawUnsafe<DeptMapRow[]>(`
    SELECT
      c.number AS categ,
      c."desc" AS categ_desc,
      d.number AS dept,
      d."desc" AS dept_desc
    FROM rics_mirror.categories c
    LEFT JOIN rics_mirror.departments d
      ON c.number BETWEEN d.beg_categ AND d.end_categ
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

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toUpperCase();
}

export async function getSalesPivotByBuyer(params: {
  startDate: string;
  endDate: string;
  storeNumbers?: number[];
  variant: SalesPivotVariant;   // one of the buyer* variants
}): Promise<SalesPivotReport> {
  assertDate(params.startDate, 'startDate');
  assertDate(params.endDate, 'endDate');
  if (params.startDate > params.endDate) {
    throw new Error('startDate must be <= endDate');
  }

  const separateStore = params.variant === 'buyer-vendor-separate-store';

  const tyStart = params.startDate;
  const tyEndExcl = exclusiveEnd(params.endDate);
  const lyStart = shiftYear(tyStart, -1);
  const lyEndExcl = shiftYear(tyEndExcl, -1);

  const [salesRows, onHandRows, deptMap, storeRows] = await Promise.all([
    loadSalesAgg({
      tyStart, tyEndExcl, lyStart, lyEndExcl,
      separateStore,
      storeNumbers: params.storeNumbers,
    }),
    loadOnHandAgg({ separateStore, storeNumbers: params.storeNumbers }),
    loadDeptMap(),
    separateStore ? loadStores() : Promise.resolve([] as StoreRow[]),
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
  const deptByCateg = new Map<number, DeptMapRow>();
  for (const d of deptMap) {
    if (d.categ == null) continue;
    deptByCateg.set(Number(d.categ), d);
  }
  const storeNameByNumber = new Map<number, string | null>();
  for (const s of storeRows) {
    if (s.number == null) continue;
    storeNameByNumber.set(Number(s.number), s.desc?.trim() || null);
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
    const tax = categNum != null ? deptByCateg.get(categNum) ?? null : null;
    const vendorCode = m?.vendor?.trim() || null;

    rows.push({
      storeNumber: leaf.store,
      storeName: leaf.store != null ? storeNameByNumber.get(leaf.store) ?? null : null,
      buyerCode: b?.buyer_code ?? null,
      buyerLabel: b?.buyer_label ?? null,
      vendorCode,
      vendorLabel: m?.vendor_label?.trim() || null,
      sector: null,
      sectorDesc: null,
      dept: tax?.dept != null ? Number(tax.dept) : null,
      deptDesc: tax?.dept_desc?.trim() || null,
      categ: categNum,
      categDesc: tax?.categ_desc?.trim() || m?.desc?.trim() || null,
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
    variant: params.variant,
    startDate: params.startDate,
    endDate: params.endDate,
    currentYear,
    priorYear: currentYear - 1,
    storeNumbers: params.storeNumbers ?? [],
    rows,
    totals,
  };
}
