import { getDb } from '../db/database';
import { prisma } from '../db/prisma';
import { PaginationEnvelope } from '../models/sku';

export interface ReportPageParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface DepartmentOnHandRow {
  department: string;
  total_skus: number;
  total_units: number;
  total_cost_value: number;
}

export interface CategoryOnHandRow {
  category_id: number | null;
  department: string;
  total_skus: number;
  total_units: number;
  total_cost_value: number;
}

export interface OnHandDetailRow {
  sku_id: string;
  sku_code: string;
  brand_name: string | null;
  style: string;
  color_name: string | null;
  price: number;
  category_id: number | null;
  department: string;
  quantity_on_hand: number;
  cost_value: number;
}

export interface DepartmentSummary {
  department: string;
  totalSkus: number;
  totalUnits: number;
  totalCostValue: number;
}

export interface CategorySummary {
  categoryId: number | null;
  department: string;
  totalSkus: number;
  totalUnits: number;
  totalCostValue: number;
}

export interface OnHandDetail {
  skuId: string;
  skuCode: string;
  brand: string | null;
  style: string;
  color: string | null;
  price: number;
  categoryId: number | null;
  department: string;
  quantityOnHand: number;
  costValue: number;
}

export function getOnHandByDepartment(): DepartmentSummary[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT
      s.department,
      COUNT(DISTINCT s.id) AS total_skus,
      COALESCE(SUM(i.quantity_on_hand), 0) AS total_units,
      COALESCE(SUM(i.quantity_on_hand * s.price), 0) AS total_cost_value
    FROM skus s
    LEFT JOIN inventory i ON i.sku_id = s.id
    WHERE s.active = 1
    GROUP BY s.department
    ORDER BY s.department
  `).all() as unknown as DepartmentOnHandRow[];

  return rows.map((r) => ({
    department: r.department,
    totalSkus: r.total_skus,
    totalUnits: r.total_units,
    totalCostValue: r.total_cost_value,
  }));
}

export function getOnHandByCategory(department: string): CategorySummary[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT
      s.category_id,
      s.department,
      COUNT(DISTINCT s.id) AS total_skus,
      COALESCE(SUM(i.quantity_on_hand), 0) AS total_units,
      COALESCE(SUM(i.quantity_on_hand * s.price), 0) AS total_cost_value
    FROM skus s
    LEFT JOIN inventory i ON i.sku_id = s.id
    WHERE s.active = 1 AND s.department = ?
    GROUP BY s.category_id
    ORDER BY s.category_id
  `).all(department) as unknown as CategoryOnHandRow[];

  return rows.map((r) => ({
    categoryId: r.category_id,
    department: r.department,
    totalSkus: r.total_skus,
    totalUnits: r.total_units,
    totalCostValue: r.total_cost_value,
  }));
}

// ── Sales Performance Report ──────────────────────────────────────

export interface SalesDepartmentRow {
  department: string;
  total_units_sold: number;
  total_revenue: number;
  avg_selling_price: number;
}

export interface SalesDepartmentSummary {
  department: string;
  totalUnitsSold: number;
  totalRevenue: number;
  avgSellingPrice: number;
}

export interface SalesCategoryRow {
  category_id: number | null;
  department: string;
  total_units_sold: number;
  total_revenue: number;
  avg_selling_price: number;
}

export interface SalesCategorySummary {
  categoryId: number | null;
  department: string;
  totalUnitsSold: number;
  totalRevenue: number;
  avgSellingPrice: number;
}

export interface SalesDetailRow {
  sku_id: string;
  sku_code: string;
  brand_name: string | null;
  style: string;
  color_name: string | null;
  department: string;
  category_id: number | null;
  total_units_sold: number;
  total_revenue: number;
  avg_selling_price: number;
}

export interface SalesDetail {
  skuId: string;
  skuCode: string;
  brand: string | null;
  style: string;
  color: string | null;
  department: string;
  categoryId: number | null;
  totalUnitsSold: number;
  totalRevenue: number;
  avgSellingPrice: number;
}

export function getSalesPerformanceByDepartment(startDate: string, endDate: string): SalesDepartmentSummary[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT
      s.department,
      COALESCE(SUM(st.quantity), 0) AS total_units_sold,
      COALESCE(SUM(st.quantity * st.unit_price), 0) AS total_revenue,
      CASE WHEN SUM(st.quantity) > 0
        THEN SUM(st.quantity * st.unit_price) / SUM(st.quantity)
        ELSE 0
      END AS avg_selling_price
    FROM skus s
    INNER JOIN sales_transactions st ON st.sku_id = s.id
    WHERE st.sold_at >= ? AND st.sold_at < ?
    GROUP BY s.department
    ORDER BY total_revenue DESC
  `).all(startDate, endDate) as unknown as SalesDepartmentRow[];

  return rows.map((r) => ({
    department: r.department,
    totalUnitsSold: r.total_units_sold,
    totalRevenue: r.total_revenue,
    avgSellingPrice: r.avg_selling_price,
  }));
}

export function getSalesPerformanceByCategory(startDate: string, endDate: string, department: string): SalesCategorySummary[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT
      s.category_id,
      s.department,
      COALESCE(SUM(st.quantity), 0) AS total_units_sold,
      COALESCE(SUM(st.quantity * st.unit_price), 0) AS total_revenue,
      CASE WHEN SUM(st.quantity) > 0
        THEN SUM(st.quantity * st.unit_price) / SUM(st.quantity)
        ELSE 0
      END AS avg_selling_price
    FROM skus s
    INNER JOIN sales_transactions st ON st.sku_id = s.id
    WHERE st.sold_at >= ? AND st.sold_at < ? AND s.department = ?
    GROUP BY s.category_id
    ORDER BY total_revenue DESC
  `).all(startDate, endDate, department) as unknown as SalesCategoryRow[];

  return rows.map((r) => ({
    categoryId: r.category_id,
    department: r.department,
    totalUnitsSold: r.total_units_sold,
    totalRevenue: r.total_revenue,
    avgSellingPrice: r.avg_selling_price,
  }));
}

const SALES_DETAIL_SORT_MAP: Record<string, string> = {
  skuCode: 's.sku_code',
  brand: 'rb.name',
  style: 's.style',
  department: 's.department',
  totalUnitsSold: 'total_units_sold',
  totalRevenue: 'total_revenue',
  avgSellingPrice: 'avg_selling_price',
};

export function getSalesPerformanceDetails(
  startDate: string,
  endDate: string,
  filters: { department?: string; category?: number },
  pagination?: ReportPageParams,
): PaginationEnvelope<SalesDetail> {
  const db = getDb();

  const conditions = ['st.sold_at >= ?', 'st.sold_at < ?'];
  const params: (string | number)[] = [startDate, endDate];

  if (filters.department) {
    conditions.push('s.department = ?');
    params.push(filters.department);
  }
  if (filters.category != null) {
    conditions.push('s.category_id = ?');
    params.push(filters.category);
  }

  const where = conditions.join(' AND ');

  const baseFrom = `
    FROM skus s
    INNER JOIN sales_transactions st ON st.sku_id = s.id
    LEFT JOIN ref_brands rb ON rb.id = s.brand_id
    LEFT JOIN ref_colors rc ON rc.id = s.color_id
    WHERE ${where}`;

  const countRow = db.prepare(`SELECT COUNT(DISTINCT s.id) as total ${baseFrom}`).get(...params as any) as unknown as { total: number };
  const totalItems = countRow.total;

  const page = pagination?.page ?? 1;
  const pageSize = pagination?.pageSize ?? (totalItems || 1);
  const totalPages = Math.ceil(totalItems / pageSize);
  const offset = (page - 1) * pageSize;

  const sortCol = SALES_DETAIL_SORT_MAP[pagination?.sort ?? 'totalRevenue'] || 'total_revenue';
  const sortDir = pagination?.order === 'asc' ? 'ASC' : 'DESC';

  const rows = db.prepare(`
    SELECT
      s.id AS sku_id,
      s.sku_code,
      rb.name AS brand_name,
      s.style,
      rc.name AS color_name,
      s.department,
      s.category_id,
      SUM(st.quantity) AS total_units_sold,
      SUM(st.quantity * st.unit_price) AS total_revenue,
      CASE WHEN SUM(st.quantity) > 0
        THEN SUM(st.quantity * st.unit_price) / SUM(st.quantity)
        ELSE 0
      END AS avg_selling_price
    ${baseFrom}
    GROUP BY s.id
    ORDER BY ${sortCol} ${sortDir}, s.sku_code ASC
    LIMIT ? OFFSET ?
  `).all(...params as any, pageSize, offset) as unknown as SalesDetailRow[];

  return {
    data: rows.map((r) => ({
      skuId: r.sku_id,
      skuCode: r.sku_code,
      brand: r.brand_name,
      style: r.style,
      color: r.color_name,
      department: r.department,
      categoryId: r.category_id,
      totalUnitsSold: r.total_units_sold,
      totalRevenue: r.total_revenue,
      avgSellingPrice: r.avg_selling_price,
    })),
    pagination: { page, pageSize, totalItems, totalPages },
  };
}

// ── Inventory Turnover Report ────────────────────────────────────

export interface TurnoverFilters {
  department?: string;
  category?: number;
  startDate?: string; // ISO date, e.g. '2026-01-01'
  endDate?: string;   // ISO date, e.g. '2026-03-31'
}

export interface DepartmentTurnoverRow {
  department: string;
  total_skus: number;
  total_cogs: number;
  total_inventory_value: number;
  turnover_ratio: number;
}

export interface CategoryTurnoverRow {
  category_id: number | null;
  department: string;
  total_skus: number;
  total_cogs: number;
  total_inventory_value: number;
  turnover_ratio: number;
}

export interface TurnoverDetailRow {
  sku_id: string;
  sku_code: string;
  brand_name: string | null;
  style: string;
  color_name: string | null;
  price: number;
  category_id: number | null;
  department: string;
  quantity_on_hand: number;
  inventory_value: number;
  cogs: number;
  turnover_ratio: number;
}

export interface DepartmentTurnover {
  department: string;
  totalSkus: number;
  totalCogs: number;
  totalInventoryValue: number;
  turnoverRatio: number;
}

export interface CategoryTurnover {
  categoryId: number | null;
  department: string;
  totalSkus: number;
  totalCogs: number;
  totalInventoryValue: number;
  turnoverRatio: number;
}

export interface TurnoverDetail {
  skuId: string;
  skuCode: string;
  brand: string | null;
  style: string;
  color: string | null;
  price: number;
  categoryId: number | null;
  department: string;
  quantityOnHand: number;
  inventoryValue: number;
  cogs: number;
  turnoverRatio: number;
}

function buildSalesDateWhere(filters: TurnoverFilters, alias: string): { clause: string; params: (string | number)[] } {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (filters.startDate) {
    conditions.push(`${alias}.sold_at >= ?`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`${alias}.sold_at <= ?`);
    params.push(filters.endDate + 'T23:59:59');
  }
  return {
    clause: conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '',
    params,
  };
}

export function getTurnoverByDepartment(filters: TurnoverFilters = {}): DepartmentTurnover[] {
  const db = getDb();
  const { clause: dateWhere, params: dateParams } = buildSalesDateWhere(filters, 'st');

  const rows = db.prepare(`
    SELECT
      s.department,
      COUNT(DISTINCT s.id) AS total_skus,
      COALESCE(cogs_agg.total_cogs, 0) AS total_cogs,
      COALESCE(SUM(i.quantity_on_hand * s.price), 0) AS total_inventory_value,
      CASE
        WHEN COALESCE(SUM(i.quantity_on_hand * s.price), 0) = 0 THEN 0
        ELSE ROUND(COALESCE(cogs_agg.total_cogs, 0) / SUM(i.quantity_on_hand * s.price), 2)
      END AS turnover_ratio
    FROM skus s
    LEFT JOIN inventory i ON i.sku_id = s.id
    LEFT JOIN (
      SELECT
        s2.department,
        SUM(st.quantity * st.unit_price) AS total_cogs
      FROM sales_transactions st
      JOIN skus s2 ON s2.id = st.sku_id
      WHERE s2.active = 1${dateWhere}
      GROUP BY s2.department
    ) cogs_agg ON cogs_agg.department = s.department
    WHERE s.active = 1
    GROUP BY s.department
    ORDER BY turnover_ratio ASC
  `).all(...dateParams) as unknown as DepartmentTurnoverRow[];

  return rows.map((r) => ({
    department: r.department,
    totalSkus: r.total_skus,
    totalCogs: r.total_cogs,
    totalInventoryValue: r.total_inventory_value,
    turnoverRatio: r.turnover_ratio,
  }));
}

export function getTurnoverByCategory(department: string, filters: TurnoverFilters = {}): CategoryTurnover[] {
  const db = getDb();
  const { clause: dateWhere, params: dateParams } = buildSalesDateWhere(filters, 'st');

  const rows = db.prepare(`
    SELECT
      s.category_id,
      s.department,
      COUNT(DISTINCT s.id) AS total_skus,
      COALESCE(cogs_agg.total_cogs, 0) AS total_cogs,
      COALESCE(SUM(i.quantity_on_hand * s.price), 0) AS total_inventory_value,
      CASE
        WHEN COALESCE(SUM(i.quantity_on_hand * s.price), 0) = 0 THEN 0
        ELSE ROUND(COALESCE(cogs_agg.total_cogs, 0) / SUM(i.quantity_on_hand * s.price), 2)
      END AS turnover_ratio
    FROM skus s
    LEFT JOIN inventory i ON i.sku_id = s.id
    LEFT JOIN (
      SELECT
        s2.category_id,
        SUM(st.quantity * st.unit_price) AS total_cogs
      FROM sales_transactions st
      JOIN skus s2 ON s2.id = st.sku_id
      WHERE s2.active = 1 AND s2.department = ?${dateWhere}
      GROUP BY s2.category_id
    ) cogs_agg ON cogs_agg.category_id = s.category_id
    WHERE s.active = 1 AND s.department = ?
    GROUP BY s.category_id
    ORDER BY turnover_ratio ASC
  `).all(department, ...dateParams, department) as unknown as CategoryTurnoverRow[];

  return rows.map((r) => ({
    categoryId: r.category_id,
    department: r.department,
    totalSkus: r.total_skus,
    totalCogs: r.total_cogs,
    totalInventoryValue: r.total_inventory_value,
    turnoverRatio: r.turnover_ratio,
  }));
}

const TURNOVER_SORT_MAP: Record<string, string> = {
  skuCode: 's.sku_code',
  brand: 'rb.name',
  style: 's.style',
  department: 's.department',
  price: 's.price',
  quantityOnHand: 'quantity_on_hand',
  inventoryValue: 'inventory_value',
  cogs: 'cogs',
  turnoverRatio: 'turnover_ratio',
};

export function getTurnoverDetails(
  filters: TurnoverFilters,
  pagination?: ReportPageParams,
): PaginationEnvelope<TurnoverDetail> {
  const db = getDb();
  const { clause: dateWhere, params: dateParams } = buildSalesDateWhere(filters, 'st');

  const conditions = ['s.active = 1'];
  const mainParams: (string | number)[] = [];

  if (filters.department) {
    conditions.push('s.department = ?');
    mainParams.push(filters.department);
  }
  if (filters.category != null) {
    conditions.push('s.category_id = ?');
    mainParams.push(filters.category);
  }

  const where = conditions.join(' AND ');

  const baseFrom = `
    FROM skus s
    LEFT JOIN (
      SELECT sku_id, SUM(quantity_on_hand) AS total_qty
      FROM inventory
      GROUP BY sku_id
    ) inv_agg ON inv_agg.sku_id = s.id
    LEFT JOIN ref_brands rb ON rb.id = s.brand_id
    LEFT JOIN ref_colors rc ON rc.id = s.color_id
    LEFT JOIN (
      SELECT
        st.sku_id,
        SUM(st.quantity * st.unit_price) AS cogs
      FROM sales_transactions st
      WHERE 1=1${dateWhere}
      GROUP BY st.sku_id
    ) cogs_agg ON cogs_agg.sku_id = s.id
    WHERE ${where}`;

  const countRow = db.prepare(`SELECT COUNT(*) as total ${baseFrom}`).get(...dateParams, ...mainParams) as unknown as { total: number };
  const totalItems = countRow.total;

  const page = pagination?.page ?? 1;
  const pageSize = pagination?.pageSize ?? (totalItems || 1);
  const totalPages = Math.ceil(totalItems / pageSize);
  const offset = (page - 1) * pageSize;

  const sortCol = TURNOVER_SORT_MAP[pagination?.sort ?? 'turnoverRatio'] || 'turnover_ratio';
  const sortDir = pagination?.order === 'desc' ? 'DESC' : 'ASC';

  const rows = db.prepare(`
    SELECT
      s.id AS sku_id,
      s.sku_code,
      rb.name AS brand_name,
      s.style,
      rc.name AS color_name,
      s.price,
      s.category_id,
      s.department,
      COALESCE(inv_agg.total_qty, 0) AS quantity_on_hand,
      COALESCE(inv_agg.total_qty * s.price, 0) AS inventory_value,
      COALESCE(cogs_agg.cogs, 0) AS cogs,
      CASE
        WHEN COALESCE(inv_agg.total_qty * s.price, 0) = 0 THEN 0
        ELSE ROUND(COALESCE(cogs_agg.cogs, 0) / (inv_agg.total_qty * s.price), 2)
      END AS turnover_ratio
    ${baseFrom}
    ORDER BY ${sortCol} ${sortDir}, s.sku_code ASC
    LIMIT ? OFFSET ?
  `).all(...dateParams, ...mainParams, pageSize, offset) as unknown as TurnoverDetailRow[];

  return {
    data: rows.map((r) => ({
      skuId: r.sku_id,
      skuCode: r.sku_code,
      brand: r.brand_name,
      style: r.style,
      color: r.color_name,
      price: r.price,
      categoryId: r.category_id,
      department: r.department,
      quantityOnHand: r.quantity_on_hand,
      inventoryValue: r.inventory_value,
      cogs: r.cogs,
      turnoverRatio: r.turnover_ratio,
    })),
    pagination: { page, pageSize, totalItems, totalPages },
  };
}

// ── Sell-Through Analysis Report ────────────────────────────────

export interface SellThroughFilters {
  department?: string;
  category?: number;
  startDate?: string;
  endDate?: string;
}

export interface SellThroughDepartmentRow {
  department: string;
  total_styles: number;
  total_units_sold: number;
  total_units_received: number;
  sell_through_pct: number;
}

export interface SellThroughDepartmentSummary {
  department: string;
  totalStyles: number;
  totalUnitsSold: number;
  totalUnitsReceived: number;
  sellThroughPct: number;
}

export interface SellThroughCategoryRow {
  category_id: number | null;
  department: string;
  total_styles: number;
  total_units_sold: number;
  total_units_received: number;
  sell_through_pct: number;
}

export interface SellThroughCategorySummary {
  categoryId: number | null;
  department: string;
  totalStyles: number;
  totalUnitsSold: number;
  totalUnitsReceived: number;
  sellThroughPct: number;
}

export interface SellThroughDetailRow {
  sku_id: string;
  sku_code: string;
  brand_name: string | null;
  style: string;
  color_name: string | null;
  price: number;
  category_id: number | null;
  department: string;
  units_sold: number;
  units_received: number;
  sell_through_pct: number;
}

export interface SellThroughDetail {
  skuId: string;
  skuCode: string;
  brand: string | null;
  style: string;
  color: string | null;
  price: number;
  categoryId: number | null;
  department: string;
  unitsSold: number;
  unitsReceived: number;
  sellThroughPct: number;
}

// Sell-through reads from Postgres (`app.*`), not the legacy SQLite `skus`/
// `sales_transactions`/`purchase_order_lines` tables. Sources:
//   - Sales:    app.sales_history_ticket + app.sales_history_ticket_line
//               (status='completed', dated by purchased_at)
//   - Received: app.purchase_order_legacy_line.received_qtys (int[]) summed
//               via unnest, paired with app.purchase_order_legacy.last_received_at
//   - SKUs:     app.sku (joined to legacy PO lines by sku_code, 100% coverage)
//   - Department label: app.taxonomy_department.desc, joined to
//               app.sku.category_number via BETWEEN beg_categ AND end_categ.
// Note on totalStyles: app.sku.style is sparsely populated, so we count
// distinct sku.id (one row per SKU) for the "Styles" column. The API contract
// keeps the field name to match the existing frontend.
function buildSellThroughDateExprs(filters: SellThroughFilters): {
  args: unknown[];
  salesDate: string;   // appended to sales WHERE — leading space included or empty
  recvDate: string;    // appended to recv  WHERE — leading space included or empty
} {
  const args: unknown[] = [];
  const sales: string[] = [];
  const recv: string[] = [];

  if (filters.startDate) {
    args.push(filters.startDate);
    const idx = `$${args.length}::timestamptz`;
    sales.push(`t.purchased_at >= ${idx}`);
    recv.push(`po.last_received_at >= ${idx}`);
  }
  if (filters.endDate) {
    args.push(filters.endDate + 'T23:59:59');
    const idx = `$${args.length}::timestamptz`;
    sales.push(`t.purchased_at <= ${idx}`);
    recv.push(`po.last_received_at <= ${idx}`);
  }

  return {
    args,
    salesDate: sales.length ? ` AND ${sales.join(' AND ')}` : '',
    recvDate: recv.length ? ` AND ${recv.join(' AND ')}` : '',
  };
}

interface PgDeptRow {
  department: string;
  total_styles: number;
  total_units_sold: number;
  total_units_received: number;
  sell_through_pct: number;
}

export async function getSellThroughByDepartment(filters: SellThroughFilters = {}): Promise<SellThroughDepartmentSummary[]> {
  const { args, salesDate, recvDate } = buildSellThroughDateExprs(filters);

  const sql = `
    WITH sales AS (
      SELECT s.id AS sku_id,
             s.category_number,
             SUM(COALESCE(l.quantity, 0))::int AS units_sold
      FROM app.sales_history_ticket t
      JOIN app.sales_history_ticket_line l ON l.ticket_id = t.id
      JOIN app.sku s ON s.id = l.sku_id
      WHERE t.status = 'completed'${salesDate}
      GROUP BY s.id, s.category_number
    ),
    recv AS (
      SELECT s.id AS sku_id,
             s.category_number,
             SUM(line_units)::int AS units_received
      FROM (
        SELECT pol.sku_code,
               (SELECT COALESCE(SUM(q), 0) FROM unnest(pol.received_qtys) AS q) AS line_units,
               po.last_received_at
        FROM app.purchase_order_legacy_line pol
        JOIN app.purchase_order_legacy po ON po.po_number = pol.po_number
        WHERE 1=1${recvDate}
      ) sub
      JOIN app.sku s ON s.code = sub.sku_code
      WHERE sub.line_units > 0
      GROUP BY s.id, s.category_number
    ),
    combined AS (
      SELECT COALESCE(sales.sku_id, recv.sku_id) AS sku_id,
             COALESCE(sales.category_number, recv.category_number) AS category_number,
             COALESCE(sales.units_sold, 0) AS units_sold,
             COALESCE(recv.units_received, 0) AS units_received
      FROM sales
      FULL OUTER JOIN recv ON recv.sku_id = sales.sku_id
    )
    SELECT COALESCE(NULLIF(BTRIM(td."desc"), ''), '(Unmapped)') AS department,
           COUNT(DISTINCT c.sku_id)::int AS total_styles,
           COALESCE(SUM(c.units_sold), 0)::int AS total_units_sold,
           COALESCE(SUM(c.units_received), 0)::int AS total_units_received,
           CASE WHEN SUM(c.units_received) > 0
                THEN ROUND(SUM(c.units_sold)::numeric / SUM(c.units_received) * 100, 1)::float8
                ELSE 0::float8
           END AS sell_through_pct
    FROM combined c
    LEFT JOIN app.taxonomy_department td
      ON c.category_number BETWEEN td.beg_categ AND td.end_categ
    GROUP BY 1
    ORDER BY sell_through_pct ASC, department ASC
  `;

  const rows = await prisma.$queryRawUnsafe<PgDeptRow[]>(sql, ...args);
  return rows.map((r) => ({
    department: r.department,
    totalStyles: Number(r.total_styles),
    totalUnitsSold: Number(r.total_units_sold),
    totalUnitsReceived: Number(r.total_units_received),
    sellThroughPct: Number(r.sell_through_pct),
  }));
}

interface PgCategRow {
  category_id: number | null;
  department: string;
  total_styles: number;
  total_units_sold: number;
  total_units_received: number;
  sell_through_pct: number;
}

export async function getSellThroughByCategory(
  department: string,
  filters: SellThroughFilters = {},
): Promise<SellThroughCategorySummary[]> {
  const { args, salesDate, recvDate } = buildSellThroughDateExprs(filters);
  args.push(department);
  const deptIdx = `$${args.length}::text`;

  const sql = `
    WITH sales AS (
      SELECT s.id AS sku_id,
             s.category_number,
             SUM(COALESCE(l.quantity, 0))::int AS units_sold
      FROM app.sales_history_ticket t
      JOIN app.sales_history_ticket_line l ON l.ticket_id = t.id
      JOIN app.sku s ON s.id = l.sku_id
      WHERE t.status = 'completed'${salesDate}
      GROUP BY s.id, s.category_number
    ),
    recv AS (
      SELECT s.id AS sku_id,
             s.category_number,
             SUM(line_units)::int AS units_received
      FROM (
        SELECT pol.sku_code,
               (SELECT COALESCE(SUM(q), 0) FROM unnest(pol.received_qtys) AS q) AS line_units,
               po.last_received_at
        FROM app.purchase_order_legacy_line pol
        JOIN app.purchase_order_legacy po ON po.po_number = pol.po_number
        WHERE 1=1${recvDate}
      ) sub
      JOIN app.sku s ON s.code = sub.sku_code
      WHERE sub.line_units > 0
      GROUP BY s.id, s.category_number
    ),
    combined AS (
      SELECT COALESCE(sales.sku_id, recv.sku_id) AS sku_id,
             COALESCE(sales.category_number, recv.category_number) AS category_number,
             COALESCE(sales.units_sold, 0) AS units_sold,
             COALESCE(recv.units_received, 0) AS units_received
      FROM sales
      FULL OUTER JOIN recv ON recv.sku_id = sales.sku_id
    )
    SELECT c.category_number AS category_id,
           COALESCE(NULLIF(BTRIM(td."desc"), ''), '(Unmapped)') AS department,
           COUNT(DISTINCT c.sku_id)::int AS total_styles,
           COALESCE(SUM(c.units_sold), 0)::int AS total_units_sold,
           COALESCE(SUM(c.units_received), 0)::int AS total_units_received,
           CASE WHEN SUM(c.units_received) > 0
                THEN ROUND(SUM(c.units_sold)::numeric / SUM(c.units_received) * 100, 1)::float8
                ELSE 0::float8
           END AS sell_through_pct
    FROM combined c
    LEFT JOIN app.taxonomy_department td
      ON c.category_number BETWEEN td.beg_categ AND td.end_categ
    WHERE BTRIM(COALESCE(td."desc", '(Unmapped)')) = BTRIM(${deptIdx})
    GROUP BY c.category_number, td."desc"
    ORDER BY sell_through_pct ASC, c.category_number ASC
  `;

  const rows = await prisma.$queryRawUnsafe<PgCategRow[]>(sql, ...args);
  return rows.map((r) => ({
    categoryId: r.category_id == null ? null : Number(r.category_id),
    department: r.department,
    totalStyles: Number(r.total_styles),
    totalUnitsSold: Number(r.total_units_sold),
    totalUnitsReceived: Number(r.total_units_received),
    sellThroughPct: Number(r.sell_through_pct),
  }));
}

// Allow-list mapping detail-row sort fields onto SQL expressions.
const SELL_THROUGH_SORT_MAP: Record<string, string> = {
  skuCode: 's.code',
  brand: 'brand_name',
  style: 's.style',
  department: 'department',
  price: 's.retail_price',
  unitsSold: 'units_sold',
  unitsReceived: 'units_received',
  sellThroughPct: 'sell_through_pct',
};

interface PgDetailRow {
  sku_id: string;
  sku_code: string;
  brand_name: string | null;
  style: string | null;
  color_name: string | null;
  price: string | number;
  category_id: number | null;
  department: string;
  units_sold: number;
  units_received: number;
  sell_through_pct: number;
}

export async function getSellThroughDetails(
  filters: SellThroughFilters,
  pagination?: ReportPageParams,
): Promise<PaginationEnvelope<SellThroughDetail>> {
  const { args, salesDate, recvDate } = buildSellThroughDateExprs(filters);

  const filterConds: string[] = [];
  if (filters.department) {
    args.push(filters.department);
    filterConds.push(`BTRIM(COALESCE(td."desc", '(Unmapped)')) = BTRIM($${args.length}::text)`);
  }
  if (filters.category != null) {
    args.push(filters.category);
    filterConds.push(`s.category_number = $${args.length}::int`);
  }
  const filterClause = filterConds.length ? ` AND ${filterConds.join(' AND ')}` : '';

  const sortKey = pagination?.sort ?? 'sellThroughPct';
  const sortCol = SELL_THROUGH_SORT_MAP[sortKey] ?? 'sell_through_pct';
  const sortDir = pagination?.order === 'desc' ? 'DESC' : 'ASC';

  const baseSelect = `
    WITH sales_agg AS (
      SELECT l.sku_id,
             SUM(COALESCE(l.quantity, 0))::int AS units_sold
      FROM app.sales_history_ticket t
      JOIN app.sales_history_ticket_line l ON l.ticket_id = t.id
      WHERE t.status = 'completed' AND l.sku_id IS NOT NULL${salesDate}
      GROUP BY l.sku_id
    ),
    recv_agg AS (
      SELECT s.id AS sku_id,
             SUM(line_units)::int AS units_received
      FROM (
        SELECT pol.sku_code,
               (SELECT COALESCE(SUM(q), 0) FROM unnest(pol.received_qtys) AS q) AS line_units,
               po.last_received_at
        FROM app.purchase_order_legacy_line pol
        JOIN app.purchase_order_legacy po ON po.po_number = pol.po_number
        WHERE 1=1${recvDate}
      ) sub
      JOIN app.sku s ON s.code = sub.sku_code
      WHERE sub.line_units > 0
      GROUP BY s.id
    ),
    base AS (
      SELECT s.id,
             s.code,
             s.style,
             s.color_code,
             s.retail_price,
             s.category_number,
             COALESCE(NULLIF(BTRIM(td."desc"), ''), '(Unmapped)') AS department,
             NULL::text AS brand_name,
             COALESCE(sales_agg.units_sold, 0)::int AS units_sold,
             COALESCE(recv_agg.units_received, 0)::int AS units_received,
             CASE WHEN COALESCE(recv_agg.units_received, 0) > 0
                  THEN ROUND(COALESCE(sales_agg.units_sold, 0)::numeric / recv_agg.units_received * 100, 1)::float8
                  ELSE 0::float8
             END AS sell_through_pct
      FROM app.sku s
      LEFT JOIN app.taxonomy_department td
        ON s.category_number BETWEEN td.beg_categ AND td.end_categ
      LEFT JOIN sales_agg ON sales_agg.sku_id = s.id
      LEFT JOIN recv_agg ON recv_agg.sku_id = s.id
      WHERE (sales_agg.units_sold IS NOT NULL OR recv_agg.units_received IS NOT NULL)${filterClause}
    )
  `;

  const countSql = `${baseSelect} SELECT COUNT(*)::int AS total FROM base`;
  const countRow = (await prisma.$queryRawUnsafe<{ total: number }[]>(countSql, ...args))[0];
  const totalItems = Number(countRow?.total ?? 0);

  const page = pagination?.page ?? 1;
  const pageSize = pagination?.pageSize ?? (totalItems || 1);
  const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 0;
  const offset = (page - 1) * pageSize;

  // sortCol may reference `s.code`, `s.style`, etc.; in the outer SELECT we
  // expose those as the unprefixed column names from the CTE — translate.
  const outerSortCol = ({
    's.code': 'code',
    's.style': 'style',
    's.retail_price': 'retail_price',
    'brand_name': 'brand_name',
    'department': 'department',
    'units_sold': 'units_sold',
    'units_received': 'units_received',
    'sell_through_pct': 'sell_through_pct',
  } as Record<string, string>)[sortCol] ?? 'sell_through_pct';

  args.push(pageSize);
  const limitIdx = `$${args.length}::int`;
  args.push(offset);
  const offsetIdx = `$${args.length}::int`;

  const dataSql = `${baseSelect}
    SELECT id AS sku_id,
           code AS sku_code,
           brand_name,
           style,
           color_code AS color_name,
           retail_price AS price,
           category_number AS category_id,
           department,
           units_sold,
           units_received,
           sell_through_pct
    FROM base
    ORDER BY ${outerSortCol} ${sortDir} NULLS LAST, code ASC
    LIMIT ${limitIdx} OFFSET ${offsetIdx}
  `;

  const rows = await prisma.$queryRawUnsafe<PgDetailRow[]>(dataSql, ...args);

  return {
    data: rows.map((r) => ({
      skuId: r.sku_id,
      skuCode: r.sku_code,
      brand: r.brand_name,
      style: r.style ?? '',
      color: r.color_name,
      price: typeof r.price === 'number' ? r.price : Number(r.price),
      categoryId: r.category_id == null ? null : Number(r.category_id),
      department: r.department,
      unitsSold: Number(r.units_sold),
      unitsReceived: Number(r.units_received),
      sellThroughPct: Number(r.sell_through_pct),
    })),
    pagination: { page, pageSize, totalItems, totalPages },
  };
}

// ── Inventory Aging Report ──────────────────────────────────────

export interface AgingBucket {
  bucket: string;
  totalSkus: number;
  totalUnits: number;
  totalCostValue: number;
}

export interface AgingDepartmentSummary {
  department: string;
  buckets: AgingBucket[];
  totalSkus: number;
  totalUnits: number;
  totalCostValue: number;
  flaggedUnits: number;
  flaggedValue: number;
}

export interface AgingDetailRow {
  sku_id: string;
  sku_code: string;
  brand_name: string | null;
  style: string;
  color_name: string | null;
  price: number;
  category_id: number | null;
  department: string;
  quantity_on_hand: number;
  cost_value: number;
  days_on_hand: number;
  last_received_at: string | null;
}

export interface AgingDetail {
  skuId: string;
  skuCode: string;
  brand: string | null;
  style: string;
  color: string | null;
  price: number;
  categoryId: number | null;
  department: string;
  quantityOnHand: number;
  costValue: number;
  daysOnHand: number;
  agingBucket: string;
  flagged: boolean;
  lastReceivedAt: string | null;
}

function assignBucket(days: number): string {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

const AGING_SORT_MAP: Record<string, string> = {
  skuCode: 's.sku_code',
  brand: 'rb.name',
  style: 's.style',
  department: 's.department',
  price: 's.price',
  quantityOnHand: 'quantity_on_hand',
  costValue: 'cost_value',
  daysOnHand: 'days_on_hand',
};

function getAgingBaseRows(
  filters: { department?: string; category?: number },
  pagination?: ReportPageParams,
): PaginationEnvelope<AgingDetail> {
  const db = getDb();

  const conditions = ['s.active = 1', 'COALESCE(inv_agg.total_qty, 0) > 0'];
  const params: (string | number)[] = [];

  if (filters.department) {
    conditions.push('s.department = ?');
    params.push(filters.department);
  }
  if (filters.category != null) {
    conditions.push('s.category_id = ?');
    params.push(filters.category);
  }

  const where = conditions.join(' AND ');

  const baseFrom = `
    FROM skus s
    LEFT JOIN (
      SELECT sku_id, SUM(quantity_on_hand) AS total_qty, MIN(created_at) AS earliest_created_at
      FROM inventory
      GROUP BY sku_id
    ) inv_agg ON inv_agg.sku_id = s.id
    LEFT JOIN ref_brands rb ON rb.id = s.brand_id
    LEFT JOIN ref_colors rc ON rc.id = s.color_id
    WHERE ${where}`;

  const countRow = db.prepare(`SELECT COUNT(*) as total ${baseFrom}`).get(...params) as unknown as { total: number };
  const totalItems = countRow.total;

  const page = pagination?.page ?? 1;
  const pageSize = pagination?.pageSize ?? (totalItems || 1);
  const totalPages = Math.ceil(totalItems / pageSize);
  const offset = (page - 1) * pageSize;

  const sortCol = AGING_SORT_MAP[pagination?.sort ?? 'daysOnHand'] || 'days_on_hand';
  const sortDir = pagination?.order === 'asc' ? 'ASC' : 'DESC';

  const rows = db.prepare(`
    SELECT
      s.id AS sku_id,
      s.sku_code,
      rb.name AS brand_name,
      s.style,
      rc.name AS color_name,
      s.price,
      s.category_id,
      s.department,
      COALESCE(inv_agg.total_qty, 0) AS quantity_on_hand,
      COALESCE(inv_agg.total_qty * s.price, 0) AS cost_value,
      COALESCE(
        (SELECT MAX(ial.created_at) FROM inventory_audit_log ial
         WHERE ial.sku_id = s.id AND ial.adjustment > 0),
        inv_agg.earliest_created_at,
        s.created_at
      ) AS last_received_at,
      CAST(julianday('now') - julianday(
        COALESCE(
          (SELECT MAX(ial.created_at) FROM inventory_audit_log ial
           WHERE ial.sku_id = s.id AND ial.adjustment > 0),
          inv_agg.earliest_created_at,
          s.created_at
        )
      ) AS INTEGER) AS days_on_hand
    ${baseFrom}
    ORDER BY ${sortCol} ${sortDir}, s.sku_code ASC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset) as unknown as AgingDetailRow[];

  return {
    data: rows.map((r) => {
      const days = Math.max(r.days_on_hand, 0);
      return {
        skuId: r.sku_id,
        skuCode: r.sku_code,
        brand: r.brand_name,
        style: r.style,
        color: r.color_name,
        price: r.price,
        categoryId: r.category_id,
        department: r.department,
        quantityOnHand: r.quantity_on_hand,
        costValue: r.cost_value,
        daysOnHand: days,
        agingBucket: assignBucket(days),
        flagged: days > 90,
        lastReceivedAt: r.last_received_at,
      };
    }),
    pagination: { page, pageSize, totalItems, totalPages },
  };
}

export function getAgingByDepartment(): AgingDepartmentSummary[] {
  const { data: details } = getAgingBaseRows({});
  const deptMap = new Map<string, AgingDetail[]>();

  for (const d of details) {
    const list = deptMap.get(d.department) || [];
    list.push(d);
    deptMap.set(d.department, list);
  }

  const result: AgingDepartmentSummary[] = [];
  for (const [department, items] of deptMap) {
    const bucketMap = new Map<string, { skus: Set<string>; units: number; value: number }>();
    for (const label of ['0-30', '31-60', '61-90', '90+']) {
      bucketMap.set(label, { skus: new Set(), units: 0, value: 0 });
    }

    const skuSet = new Set<string>();
    let totalUnits = 0;
    let totalValue = 0;
    let flaggedUnits = 0;
    let flaggedValue = 0;

    for (const item of items) {
      const b = bucketMap.get(item.agingBucket)!;
      b.skus.add(item.skuId);
      b.units += item.quantityOnHand;
      b.value += item.costValue;

      skuSet.add(item.skuId);
      totalUnits += item.quantityOnHand;
      totalValue += item.costValue;

      if (item.flagged) {
        flaggedUnits += item.quantityOnHand;
        flaggedValue += item.costValue;
      }
    }

    result.push({
      department,
      buckets: ['0-30', '31-60', '61-90', '90+'].map((label) => ({
        bucket: label,
        totalSkus: bucketMap.get(label)!.skus.size,
        totalUnits: bucketMap.get(label)!.units,
        totalCostValue: bucketMap.get(label)!.value,
      })),
      totalSkus: skuSet.size,
      totalUnits,
      totalCostValue: totalValue,
      flaggedUnits,
      flaggedValue,
    });
  }

  return result.sort((a, b) => a.department.localeCompare(b.department));
}

export function getAgingDetails(
  filters: { department?: string; category?: number },
  pagination?: ReportPageParams,
): PaginationEnvelope<AgingDetail> {
  return getAgingBaseRows(filters, pagination);
}

const ON_HAND_SORT_MAP: Record<string, string> = {
  skuCode: 's.sku_code',
  brand: 'rb.name',
  style: 's.style',
  department: 's.department',
  price: 's.price',
  quantityOnHand: 'quantity_on_hand',
  costValue: 'cost_value',
};

export function getOnHandDetails(
  filters: { department?: string; category?: number },
  pagination?: ReportPageParams,
): PaginationEnvelope<OnHandDetail> {
  const db = getDb();

  const conditions = ['s.active = 1'];
  const params: (string | number)[] = [];

  if (filters.department) {
    conditions.push('s.department = ?');
    params.push(filters.department);
  }
  if (filters.category != null) {
    conditions.push('s.category_id = ?');
    params.push(filters.category);
  }

  const where = conditions.join(' AND ');

  const baseFrom = `
    FROM skus s
    LEFT JOIN (
      SELECT sku_id, SUM(quantity_on_hand) AS total_qty
      FROM inventory
      GROUP BY sku_id
    ) inv_agg ON inv_agg.sku_id = s.id
    LEFT JOIN ref_brands rb ON rb.id = s.brand_id
    LEFT JOIN ref_colors rc ON rc.id = s.color_id
    WHERE ${where}`;

  const countRow = db.prepare(`SELECT COUNT(*) as total ${baseFrom}`).get(...params as any) as unknown as { total: number };
  const totalItems = countRow.total;

  const page = pagination?.page ?? 1;
  const pageSize = pagination?.pageSize ?? (totalItems || 1);
  const totalPages = Math.ceil(totalItems / pageSize);
  const offset = (page - 1) * pageSize;

  const sortCol = ON_HAND_SORT_MAP[pagination?.sort ?? 'department'] || 's.department';
  const sortDir = pagination?.order === 'desc' ? 'DESC' : 'ASC';

  const rows = db.prepare(`
    SELECT
      s.id AS sku_id,
      s.sku_code,
      rb.name AS brand_name,
      s.style,
      rc.name AS color_name,
      s.price,
      s.category_id,
      s.department,
      COALESCE(inv_agg.total_qty, 0) AS quantity_on_hand,
      COALESCE(inv_agg.total_qty * s.price, 0) AS cost_value
    ${baseFrom}
    ORDER BY ${sortCol} ${sortDir}, s.sku_code ASC
    LIMIT ? OFFSET ?
  `).all(...params as any, pageSize, offset) as unknown as OnHandDetailRow[];

  return {
    data: rows.map((r) => ({
      skuId: r.sku_id,
      skuCode: r.sku_code,
      brand: r.brand_name,
      style: r.style,
      color: r.color_name,
      price: r.price,
      categoryId: r.category_id,
      department: r.department,
      quantityOnHand: r.quantity_on_hand,
      costValue: r.cost_value,
    })),
    pagination: { page, pageSize, totalItems, totalPages },
  };
}
