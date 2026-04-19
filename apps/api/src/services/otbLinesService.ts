import { getDb } from '../db/database';
import { PaginationEnvelope } from '../models/sku';

export interface OtbSkuLineRow {
  id: string;
  skuCode: string;
  style: string;
  department: string;
  category: number | null;
  budgetUnits: number;
  actualUnits: number;
  onOrderUnits: number;
  openToBuyUnits: number;
}

export interface OtbLinesParams {
  page: number;
  pageSize: number;
  sort?: string;
  order?: 'asc' | 'desc';
  year?: number;
  month?: number;
  department?: string;
  category?: number;
  skuCode?: string;
  style?: string;
}

type DbValue = null | number | bigint | string;

const SORT_MAP: Record<string, string> = {
  skuCode: 'sku_code',
  style: 'style',
  department: 'department',
  category: 'category',
  budgetUnits: 'budget_units',
  actualUnits: 'actual_units',
  onOrderUnits: 'on_order_units',
  openToBuyUnits: 'open_to_buy_units',
};

export function listOtbLines(params: OtbLinesParams): PaginationEnvelope<OtbSkuLineRow> {
  const db = getDb();

  // Default to current year/month
  const now = new Date();
  const year = params.year ?? now.getFullYear();
  const month = params.month ?? (now.getMonth() + 1);

  // Build the query inline rather than relying on the view, so we can
  // apply filters directly and get accurate pagination.
  const conditions: string[] = ['ob.year = ?', 'ob.month = ?'];
  const values: DbValue[] = [year, month];

  if (params.department) {
    conditions.push('s.department = ?');
    values.push(params.department);
  }
  if (params.category != null) {
    conditions.push('rc.rics_code = ?');
    values.push(params.category);
  }
  if (params.skuCode) {
    conditions.push('s.sku_code LIKE ?');
    values.push(`%${params.skuCode}%`);
  }
  if (params.style) {
    conditions.push('LOWER(s.style) LIKE ?');
    values.push(`%${params.style.toLowerCase()}%`);
  }

  const fromClause = `
    FROM otb_sku_plan_lines opl
    JOIN otb_budgets ob ON ob.id = opl.otb_budget_id
    JOIN skus s ON s.id = opl.sku_id
    LEFT JOIN ref_categories rc ON rc.id = s.category_id
    LEFT JOIN (
      SELECT
        st.sku_id,
        strftime('%Y', st.sold_at) AS yr,
        CAST(strftime('%m', st.sold_at) AS INTEGER) AS mo,
        SUM(st.quantity) AS total_sold
      FROM sales_transactions st
      GROUP BY st.sku_id, strftime('%Y', st.sold_at), CAST(strftime('%m', st.sold_at) AS INTEGER)
    ) sold ON sold.sku_id = opl.sku_id
          AND CAST(sold.yr AS INTEGER) = ob.year
          AND sold.mo = ob.month
    LEFT JOIN (
      SELECT
        pol.sku_id,
        strftime('%Y', po.created_at) AS yr,
        CAST(strftime('%m', po.created_at) AS INTEGER) AS mo,
        SUM(pol.quantity_ordered - COALESCE(pol.quantity_received, 0)) AS total_on_order
      FROM purchase_order_lines pol
      JOIN purchase_orders po ON po.id = pol.po_id
      WHERE po.status IN ('SUBMITTED', 'CONFIRMED', 'PARTIALLY_RECEIVED')
      GROUP BY pol.sku_id, strftime('%Y', po.created_at), CAST(strftime('%m', po.created_at) AS INTEGER)
    ) ordered ON ordered.sku_id = opl.sku_id
             AND CAST(ordered.yr AS INTEGER) = ob.year
             AND ordered.mo = ob.month
  `;

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countRow = db.prepare(
    `SELECT COUNT(*) as cnt ${fromClause} ${whereClause}`
  ).get(...values) as unknown as { cnt: number };
  const totalItems = countRow.cnt;

  const sortCol = SORT_MAP[params.sort ?? 'openToBuyUnits'] || 'open_to_buy_units';
  const sortDir = params.order === 'desc' ? 'DESC' : 'ASC';
  const offset = (params.page - 1) * params.pageSize;

  const rows = db.prepare(`
    SELECT
      opl.otb_budget_id || ':' || opl.sku_id AS id,
      s.sku_code,
      s.style,
      s.department,
      rc.rics_code AS category,
      opl.budget_units,
      COALESCE(sold.total_sold, 0) AS actual_units,
      COALESCE(ordered.total_on_order, 0) AS on_order_units,
      opl.budget_units - COALESCE(sold.total_sold, 0) - COALESCE(ordered.total_on_order, 0) AS open_to_buy_units
    ${fromClause}
    ${whereClause}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ? OFFSET ?
  `).all(...values, params.pageSize, offset) as unknown as Array<{
    id: string;
    sku_code: string;
    style: string;
    department: string;
    category: number | null;
    budget_units: number;
    actual_units: number;
    on_order_units: number;
    open_to_buy_units: number;
  }>;

  return {
    data: rows.map((r) => ({
      id: r.id,
      skuCode: r.sku_code,
      style: r.style,
      department: r.department,
      category: r.category,
      budgetUnits: r.budget_units,
      actualUnits: r.actual_units,
      onOrderUnits: r.on_order_units,
      openToBuyUnits: r.open_to_buy_units,
    })),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
      totalPages: Math.max(Math.ceil(totalItems / params.pageSize), 1),
    },
  };
}
