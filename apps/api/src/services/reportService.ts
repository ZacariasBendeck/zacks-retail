import { getDb } from '../db/database';

export interface DepartmentOnHandRow {
  department: string;
  total_skus: number;
  total_units: number;
  total_cost_value: number;
}

export interface CategoryOnHandRow {
  category: number;
  department: string;
  total_skus: number;
  total_units: number;
  total_cost_value: number;
}

export interface OnHandDetailRow {
  sku_id: string;
  sku_code: string;
  brand: string;
  style: string;
  color: string;
  size: string;
  price: number;
  category: number;
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
  category: number;
  department: string;
  totalSkus: number;
  totalUnits: number;
  totalCostValue: number;
}

export interface OnHandDetail {
  skuId: string;
  skuCode: string;
  brand: string;
  style: string;
  color: string;
  size: string;
  price: number;
  category: number;
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
      s.category,
      s.department,
      COUNT(DISTINCT s.id) AS total_skus,
      COALESCE(SUM(i.quantity_on_hand), 0) AS total_units,
      COALESCE(SUM(i.quantity_on_hand * s.price), 0) AS total_cost_value
    FROM skus s
    LEFT JOIN inventory i ON i.sku_id = s.id
    WHERE s.active = 1 AND s.department = ?
    GROUP BY s.category
    ORDER BY s.category
  `).all(department) as unknown as CategoryOnHandRow[];

  return rows.map((r) => ({
    category: r.category,
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
  category: number;
  department: string;
  total_units_sold: number;
  total_revenue: number;
  avg_selling_price: number;
}

export interface SalesCategorySummary {
  category: number;
  department: string;
  totalUnitsSold: number;
  totalRevenue: number;
  avgSellingPrice: number;
}

export interface SalesDetailRow {
  sku_id: string;
  sku_code: string;
  brand: string;
  style: string;
  color: string;
  size: string;
  department: string;
  category: number;
  total_units_sold: number;
  total_revenue: number;
  avg_selling_price: number;
}

export interface SalesDetail {
  skuId: string;
  skuCode: string;
  brand: string;
  style: string;
  color: string;
  size: string;
  department: string;
  category: number;
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
      s.category,
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
    GROUP BY s.category
    ORDER BY total_revenue DESC
  `).all(startDate, endDate, department) as unknown as SalesCategoryRow[];

  return rows.map((r) => ({
    category: r.category,
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
    conditions.push('s.category = ?');
    params.push(filters.category);
  }

  const where = conditions.join(' AND ');

  const rows = db.prepare(`
    SELECT
      s.id AS sku_id,
      s.sku_code,
      s.brand,
      s.style,
      s.color,
      s.size,
      s.department,
      s.category,
      SUM(st.quantity) AS total_units_sold,
      SUM(st.quantity * st.unit_price) AS total_revenue,
      CASE WHEN SUM(st.quantity) > 0
        THEN SUM(st.quantity * st.unit_price) / SUM(st.quantity)
        ELSE 0
      END AS avg_selling_price
    FROM skus s
    INNER JOIN sales_transactions st ON st.sku_id = s.id
    WHERE ${where}
    GROUP BY s.id
    ORDER BY total_revenue DESC
  `).all(...params as any) as unknown as SalesDetailRow[];

  return rows.map((r) => ({
    skuId: r.sku_id,
    skuCode: r.sku_code,
    brand: r.brand,
    style: r.style,
    color: r.color,
    size: r.size,
    department: r.department,
    category: r.category,
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
  category: number;
  department: string;
  total_skus: number;
  total_cogs: number;
  total_inventory_value: number;
  turnover_ratio: number;
}

export interface TurnoverDetailRow {
  sku_id: string;
  sku_code: string;
  brand: string;
  style: string;
  color: string;
  size: string;
  price: number;
  category: number;
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
  category: number;
  department: string;
  totalSkus: number;
  totalCogs: number;
  totalInventoryValue: number;
  turnoverRatio: number;
}

export interface TurnoverDetail {
  skuId: string;
  skuCode: string;
  brand: string;
  style: string;
  color: string;
  size: string;
  price: number;
  category: number;
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
      s.category,
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
        s2.category,
        SUM(st.quantity * st.unit_price) AS total_cogs
      FROM sales_transactions st
      JOIN skus s2 ON s2.id = st.sku_id
      WHERE s2.active = 1 AND s2.department = ?${dateWhere}
      GROUP BY s2.category
    ) cogs_agg ON cogs_agg.category = s.category
    WHERE s.active = 1 AND s.department = ?
    GROUP BY s.category
    ORDER BY turnover_ratio ASC
  `).all(department, ...dateParams, department) as unknown as CategoryTurnoverRow[];

  return rows.map((r) => ({
    category: r.category,
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
    conditions.push('s.category = ?');
    mainParams.push(filters.category);
  }

  const where = conditions.join(' AND ');

  const rows = db.prepare(`
    SELECT
      s.id AS sku_id,
      s.sku_code,
      s.brand,
      s.style,
      s.color,
      s.size,
      s.price,
      s.category,
      s.department,
      COALESCE(i.quantity_on_hand, 0) AS quantity_on_hand,
      COALESCE(i.quantity_on_hand * s.price, 0) AS inventory_value,
      COALESCE(cogs_agg.cogs, 0) AS cogs,
      CASE
        WHEN COALESCE(i.quantity_on_hand * s.price, 0) = 0 THEN 0
        ELSE ROUND(COALESCE(cogs_agg.cogs, 0) / (i.quantity_on_hand * s.price), 2)
      END AS turnover_ratio
    FROM skus s
    LEFT JOIN inventory i ON i.sku_id = s.id
    LEFT JOIN (
      SELECT
        st.sku_id,
        SUM(st.quantity * st.unit_price) AS cogs
      FROM sales_transactions st
      WHERE 1=1${dateWhere}
      GROUP BY st.sku_id
    ) cogs_agg ON cogs_agg.sku_id = s.id
    WHERE ${where}
    ORDER BY turnover_ratio ASC, s.department, s.category, s.sku_code
  `).all(...dateParams, ...mainParams) as unknown as TurnoverDetailRow[];

  return rows.map((r) => ({
    skuId: r.sku_id,
    skuCode: r.sku_code,
    brand: r.brand,
    style: r.style,
    color: r.color,
    size: r.size,
    price: r.price,
    category: r.category,
    department: r.department,
    quantityOnHand: r.quantity_on_hand,
    inventoryValue: r.inventory_value,
    cogs: r.cogs,
    turnoverRatio: r.turnover_ratio,
  }));
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
    conditions.push('s.category = ?');
    params.push(filters.category);
  }

  const where = conditions.join(' AND ');

  const rows = db.prepare(`
    SELECT
      s.id AS sku_id,
      s.sku_code,
      s.brand,
      s.style,
      s.color,
      s.size,
      s.price,
      s.category,
      s.department,
      COALESCE(i.quantity_on_hand, 0) AS quantity_on_hand,
      COALESCE(i.quantity_on_hand * s.price, 0) AS cost_value
    FROM skus s
    LEFT JOIN inventory i ON i.sku_id = s.id
    WHERE ${where}
    ORDER BY s.department, s.category, s.brand, s.sku_code
  `).all(...params as any) as unknown as OnHandDetailRow[];

  return rows.map((r) => ({
    skuId: r.sku_id,
    skuCode: r.sku_code,
    brand: r.brand,
    style: r.style,
    color: r.color,
    size: r.size,
    price: r.price,
    category: r.category,
    department: r.department,
    quantityOnHand: r.quantity_on_hand,
    costValue: r.cost_value,
  }));
}
