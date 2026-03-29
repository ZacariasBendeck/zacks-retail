import { getDb } from '../db/database';

interface DashboardKpisRow {
  total_on_hand_units: number;
  total_on_hand_value: number;
  open_po_count: number;
}

interface SalesThisMonthRow {
  sales_this_month: number;
}

interface DepartmentSummaryRow {
  department: string;
  total_skus: number;
  total_units: number;
  total_value: number;
  average_price: number;
  sales_this_month: number;
  turnover_rate: number;
}

interface LowStockRow {
  id: string;
  sku_code: string;
  brand: string;
  style: string;
  color: string;
  size: string;
  department: string;
  current_stock: number;
}

export interface DashboardKpis {
  totalOnHandUnits: number;
  totalOnHandValue: number;
  salesThisMonth: number;
  averageTurnover: number;
  openPoCount: number;
}

export interface DepartmentSummary {
  department: string;
  totalSkus: number;
  totalUnits: number;
  totalValue: number;
  averagePrice: number;
  salesThisMonth: number;
  turnoverRate: number;
}

export interface LowStockItem {
  id: string;
  skuCode: string;
  brand: string;
  style: string;
  color: string;
  size: string;
  department: string;
  currentStock: number;
}

export function getDashboardKpis(): DashboardKpis {
  const db = getDb();

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;

  const inv = db.prepare(`
    SELECT
      COALESCE(SUM(i.quantity_on_hand), 0) AS total_on_hand_units,
      COALESCE(SUM(i.quantity_on_hand * s.price), 0) AS total_on_hand_value,
      (SELECT COUNT(*) FROM purchase_orders WHERE status IN ('DRAFT','SUBMITTED','CONFIRMED','PARTIALLY_RECEIVED')) AS open_po_count
    FROM skus s
    LEFT JOIN inventory i ON i.sku_id = s.id
    WHERE s.active = 1
  `).get() as unknown as DashboardKpisRow;

  const salesRow = db.prepare(`
    SELECT COALESCE(SUM(st.quantity), 0) AS sales_this_month
    FROM sales_transactions st
    WHERE st.sold_at >= ? AND st.sold_at < ?
  `).get(monthStart, monthEnd) as unknown as SalesThisMonthRow;

  const salesThisMonth = salesRow.sales_this_month;
  const totalOnHandValue = inv.total_on_hand_value;
  const averageTurnover = totalOnHandValue > 0
    ? Math.round((salesThisMonth / (totalOnHandValue / 100)) * 100) / 100
    : 0;

  return {
    totalOnHandUnits: inv.total_on_hand_units,
    totalOnHandValue: Math.round(totalOnHandValue * 100) / 100,
    salesThisMonth,
    averageTurnover,
    openPoCount: inv.open_po_count,
  };
}

export function getDepartmentSummary(): DepartmentSummary[] {
  const db = getDb();

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;

  const rows = db.prepare(`
    SELECT
      s.department,
      COUNT(DISTINCT s.id) AS total_skus,
      COALESCE(SUM(i.quantity_on_hand), 0) AS total_units,
      COALESCE(SUM(i.quantity_on_hand * s.price), 0) AS total_value,
      CASE WHEN COUNT(DISTINCT s.id) > 0
        THEN ROUND(SUM(s.price) / COUNT(DISTINCT s.id), 2)
        ELSE 0
      END AS average_price,
      COALESCE(sales_agg.dept_sales, 0) AS sales_this_month,
      CASE WHEN COALESCE(SUM(i.quantity_on_hand), 0) > 0
        THEN ROUND(CAST(COALESCE(sales_agg.dept_sales, 0) AS REAL) / SUM(i.quantity_on_hand), 2)
        ELSE 0
      END AS turnover_rate
    FROM skus s
    LEFT JOIN inventory i ON i.sku_id = s.id
    LEFT JOIN (
      SELECT s2.department, SUM(st.quantity) AS dept_sales
      FROM sales_transactions st
      JOIN skus s2 ON s2.id = st.sku_id
      WHERE st.sold_at >= ? AND st.sold_at < ?
      GROUP BY s2.department
    ) sales_agg ON sales_agg.department = s.department
    WHERE s.active = 1
    GROUP BY s.department
    ORDER BY s.department
  `).all(monthStart, monthEnd) as unknown as DepartmentSummaryRow[];

  return rows.map((r) => ({
    department: r.department,
    totalSkus: r.total_skus,
    totalUnits: r.total_units,
    totalValue: Math.round(r.total_value * 100) / 100,
    averagePrice: r.average_price,
    salesThisMonth: r.sales_this_month,
    turnoverRate: r.turnover_rate,
  }));
}

export function getLowStock(
  threshold: number,
  page: number,
  pageSize: number,
): { data: LowStockItem[]; pagination: { page: number; pageSize: number; totalItems: number; totalPages: number } } {
  const db = getDb();

  const countRow = db.prepare(`
    SELECT COUNT(*) AS total
    FROM skus s
    JOIN inventory i ON i.sku_id = s.id
    WHERE s.active = 1 AND i.quantity_on_hand <= ? AND i.quantity_on_hand >= 0
  `).get(threshold) as unknown as { total: number };

  const totalItems = countRow.total;
  const totalPages = Math.ceil(totalItems / pageSize);
  const offset = (page - 1) * pageSize;

  const rows = db.prepare(`
    SELECT
      s.id,
      s.sku_code,
      s.brand,
      s.style,
      s.color,
      s.size,
      s.department,
      i.quantity_on_hand AS current_stock
    FROM skus s
    JOIN inventory i ON i.sku_id = s.id
    WHERE s.active = 1 AND i.quantity_on_hand <= ? AND i.quantity_on_hand >= 0
    ORDER BY i.quantity_on_hand ASC, s.department, s.sku_code
    LIMIT ? OFFSET ?
  `).all(threshold, pageSize, offset) as unknown as LowStockRow[];

  return {
    data: rows.map((r) => ({
      id: r.id,
      skuCode: r.sku_code,
      brand: r.brand,
      style: r.style,
      color: r.color,
      size: r.size,
      department: r.department,
      currentStock: r.current_stock,
    })),
    pagination: { page, pageSize, totalItems, totalPages },
  };
}
