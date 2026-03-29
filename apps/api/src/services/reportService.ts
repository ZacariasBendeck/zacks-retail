import { getDb } from '../db/database';

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

export function getSalesPerformanceDetails(startDate: string, endDate: string, filters: { department?: string; category?: number }): SalesDetail[] {
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
    FROM skus s
    INNER JOIN sales_transactions st ON st.sku_id = s.id
    LEFT JOIN ref_brands rb ON rb.id = s.brand_id
    LEFT JOIN ref_colors rc ON rc.id = s.color_id
    WHERE ${where}
    GROUP BY s.id
    ORDER BY total_revenue DESC
  `).all(...params as any) as unknown as SalesDetailRow[];

  return rows.map((r) => ({
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
  }));
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

export function getTurnoverDetails(filters: TurnoverFilters): TurnoverDetail[] {
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
    WHERE ${where}
    ORDER BY turnover_ratio ASC, s.department, s.category_id, s.sku_code
  `).all(...dateParams, ...mainParams) as unknown as TurnoverDetailRow[];

  return rows.map((r) => ({
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
  }));
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

function buildSellThroughDateClauses(filters: SellThroughFilters): {
  salesDateClause: string;
  salesDateParams: (string | number)[];
  poDateClause: string;
  poDateParams: (string | number)[];
} {
  const salesConds: string[] = [];
  const salesParams: (string | number)[] = [];
  const poConds: string[] = [];
  const poParams: (string | number)[] = [];

  if (filters.startDate) {
    salesConds.push('st.sold_at >= ?');
    salesParams.push(filters.startDate);
    poConds.push('po.created_at >= ?');
    poParams.push(filters.startDate);
  }
  if (filters.endDate) {
    salesConds.push('st.sold_at <= ?');
    salesParams.push(filters.endDate + 'T23:59:59');
    poConds.push('po.created_at <= ?');
    poParams.push(filters.endDate + 'T23:59:59');
  }

  return {
    salesDateClause: salesConds.length > 0 ? ' AND ' + salesConds.join(' AND ') : '',
    salesDateParams: salesParams,
    poDateClause: poConds.length > 0 ? ' AND ' + poConds.join(' AND ') : '',
    poDateParams: poParams,
  };
}

export function getSellThroughByDepartment(filters: SellThroughFilters = {}): SellThroughDepartmentSummary[] {
  const db = getDb();
  const { salesDateClause, salesDateParams, poDateClause, poDateParams } = buildSellThroughDateClauses(filters);

  const rows = db.prepare(`
    SELECT
      s.department,
      COUNT(DISTINCT s.style) AS total_styles,
      COALESCE(sales_agg.total_sold, 0) AS total_units_sold,
      COALESCE(recv_agg.total_received, 0) AS total_units_received,
      CASE
        WHEN COALESCE(recv_agg.total_received, 0) = 0 THEN 0
        ELSE ROUND(CAST(COALESCE(sales_agg.total_sold, 0) AS REAL) / recv_agg.total_received * 100, 1)
      END AS sell_through_pct
    FROM skus s
    LEFT JOIN (
      SELECT s2.department, SUM(st.quantity) AS total_sold
      FROM sales_transactions st
      JOIN skus s2 ON s2.id = st.sku_id
      WHERE s2.active = 1${salesDateClause}
      GROUP BY s2.department
    ) sales_agg ON sales_agg.department = s.department
    LEFT JOIN (
      SELECT s3.department, SUM(pol.quantity_received) AS total_received
      FROM purchase_order_lines pol
      JOIN skus s3 ON s3.id = pol.sku_id
      JOIN purchase_orders po ON po.id = pol.po_id
      WHERE s3.active = 1 AND po.status NOT IN ('DRAFT', 'CANCELLED')${poDateClause}
      GROUP BY s3.department
    ) recv_agg ON recv_agg.department = s.department
    WHERE s.active = 1
    GROUP BY s.department
    ORDER BY sell_through_pct ASC
  `).all(...salesDateParams, ...poDateParams) as unknown as SellThroughDepartmentRow[];

  return rows.map((r) => ({
    department: r.department,
    totalStyles: r.total_styles,
    totalUnitsSold: r.total_units_sold,
    totalUnitsReceived: r.total_units_received,
    sellThroughPct: r.sell_through_pct,
  }));
}

export function getSellThroughByCategory(department: string, filters: SellThroughFilters = {}): SellThroughCategorySummary[] {
  const db = getDb();
  const { salesDateClause, salesDateParams, poDateClause, poDateParams } = buildSellThroughDateClauses(filters);

  const rows = db.prepare(`
    SELECT
      s.category_id,
      s.department,
      COUNT(DISTINCT s.style) AS total_styles,
      COALESCE(sales_agg.total_sold, 0) AS total_units_sold,
      COALESCE(recv_agg.total_received, 0) AS total_units_received,
      CASE
        WHEN COALESCE(recv_agg.total_received, 0) = 0 THEN 0
        ELSE ROUND(CAST(COALESCE(sales_agg.total_sold, 0) AS REAL) / recv_agg.total_received * 100, 1)
      END AS sell_through_pct
    FROM skus s
    LEFT JOIN (
      SELECT s2.category_id, SUM(st.quantity) AS total_sold
      FROM sales_transactions st
      JOIN skus s2 ON s2.id = st.sku_id
      WHERE s2.active = 1 AND s2.department = ?${salesDateClause}
      GROUP BY s2.category_id
    ) sales_agg ON sales_agg.category_id = s.category_id
    LEFT JOIN (
      SELECT s3.category_id, SUM(pol.quantity_received) AS total_received
      FROM purchase_order_lines pol
      JOIN skus s3 ON s3.id = pol.sku_id
      JOIN purchase_orders po ON po.id = pol.po_id
      WHERE s3.active = 1 AND s3.department = ? AND po.status NOT IN ('DRAFT', 'CANCELLED')${poDateClause}
      GROUP BY s3.category_id
    ) recv_agg ON recv_agg.category_id = s.category_id
    WHERE s.active = 1 AND s.department = ?
    GROUP BY s.category_id
    ORDER BY sell_through_pct ASC
  `).all(department, ...salesDateParams, department, ...poDateParams, department) as unknown as SellThroughCategoryRow[];

  return rows.map((r) => ({
    categoryId: r.category_id,
    department: r.department,
    totalStyles: r.total_styles,
    totalUnitsSold: r.total_units_sold,
    totalUnitsReceived: r.total_units_received,
    sellThroughPct: r.sell_through_pct,
  }));
}

export function getSellThroughDetails(filters: SellThroughFilters): SellThroughDetail[] {
  const db = getDb();
  const { salesDateClause, salesDateParams, poDateClause, poDateParams } = buildSellThroughDateClauses(filters);

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
      COALESCE(sales_agg.units_sold, 0) AS units_sold,
      COALESCE(recv_agg.units_received, 0) AS units_received,
      CASE
        WHEN COALESCE(recv_agg.units_received, 0) = 0 THEN 0
        ELSE ROUND(CAST(COALESCE(sales_agg.units_sold, 0) AS REAL) / recv_agg.units_received * 100, 1)
      END AS sell_through_pct
    FROM skus s
    LEFT JOIN ref_brands rb ON rb.id = s.brand_id
    LEFT JOIN ref_colors rc ON rc.id = s.color_id
    LEFT JOIN (
      SELECT st.sku_id, SUM(st.quantity) AS units_sold
      FROM sales_transactions st
      WHERE 1=1${salesDateClause}
      GROUP BY st.sku_id
    ) sales_agg ON sales_agg.sku_id = s.id
    LEFT JOIN (
      SELECT pol.sku_id, SUM(pol.quantity_received) AS units_received
      FROM purchase_order_lines pol
      JOIN purchase_orders po ON po.id = pol.po_id
      WHERE po.status NOT IN ('DRAFT', 'CANCELLED')${poDateClause}
      GROUP BY pol.sku_id
    ) recv_agg ON recv_agg.sku_id = s.id
    WHERE ${where}
    ORDER BY sell_through_pct ASC, s.department, s.category_id, s.sku_code
  `).all(...salesDateParams, ...poDateParams, ...mainParams) as unknown as SellThroughDetailRow[];

  return rows.map((r) => ({
    skuId: r.sku_id,
    skuCode: r.sku_code,
    brand: r.brand_name,
    style: r.style,
    color: r.color_name,
    price: r.price,
    categoryId: r.category_id,
    department: r.department,
    unitsSold: r.units_sold,
    unitsReceived: r.units_received,
    sellThroughPct: r.sell_through_pct,
  }));
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

function getAgingBaseRows(filters: { department?: string; category?: number }): AgingDetail[] {
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
    FROM skus s
    LEFT JOIN (
      SELECT sku_id, SUM(quantity_on_hand) AS total_qty, MIN(created_at) AS earliest_created_at
      FROM inventory
      GROUP BY sku_id
    ) inv_agg ON inv_agg.sku_id = s.id
    LEFT JOIN ref_brands rb ON rb.id = s.brand_id
    LEFT JOIN ref_colors rc ON rc.id = s.color_id
    WHERE ${where}
    ORDER BY days_on_hand DESC, s.department, s.category_id, s.sku_code
  `).all(...params) as unknown as AgingDetailRow[];

  return rows.map((r) => {
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
  });
}

export function getAgingByDepartment(): AgingDepartmentSummary[] {
  const details = getAgingBaseRows({});
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

export function getAgingDetails(filters: { department?: string; category?: number }): AgingDetail[] {
  return getAgingBaseRows(filters);
}

export function getOnHandDetails(filters: { department?: string; category?: number }): OnHandDetail[] {
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
    FROM skus s
    LEFT JOIN (
      SELECT sku_id, SUM(quantity_on_hand) AS total_qty
      FROM inventory
      GROUP BY sku_id
    ) inv_agg ON inv_agg.sku_id = s.id
    LEFT JOIN ref_brands rb ON rb.id = s.brand_id
    LEFT JOIN ref_colors rc ON rc.id = s.color_id
    WHERE ${where}
    ORDER BY s.department, s.category_id, rb.name, s.sku_code
  `).all(...params as any) as unknown as OnHandDetailRow[];

  return rows.map((r) => ({
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
  }));
}
