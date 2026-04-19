import { getDb } from '../db/database';
import { PaginationEnvelope } from '../models/sku';

export interface SalesLedgerRow {
  id: string;
  saleDate: string;
  channel: 'STORE' | 'ONLINE' | 'WHOLESALE';
  skuCode: string;
  style: string;
  department: string;
  category: number | null;
  unitsSold: number;
  netRevenue: number;
}

export interface SalesLedgerParams {
  page: number;
  pageSize: number;
  sort?: string;
  order?: 'asc' | 'desc';
  startDate?: string;
  endDate?: string;
  department?: string;
  category?: number;
  channel?: string;
  skuCode?: string;
  style?: string;
}

type DbValue = null | number | bigint | string;

const SORT_MAP: Record<string, string> = {
  saleDate: 'st.sold_at',
  channel: "'STORE'",
  skuCode: 's.sku_code',
  style: 's.style',
  department: 's.department',
  category: 'rc.rics_code',
  unitsSold: 'st.quantity',
  netRevenue: '(st.quantity * st.unit_price)',
};

export function listSalesLedger(params: SalesLedgerParams): PaginationEnvelope<SalesLedgerRow> {
  const db = getDb();
  const conditions: string[] = [];
  const values: DbValue[] = [];

  if (params.startDate) {
    conditions.push('st.sold_at >= ?');
    values.push(params.startDate);
  }
  if (params.endDate) {
    // endDate is inclusive — add one day for < comparison
    const endExclusive = new Date(params.endDate);
    endExclusive.setDate(endExclusive.getDate() + 1);
    conditions.push('st.sold_at < ?');
    values.push(endExclusive.toISOString().split('T')[0]);
  }
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
    FROM sales_transactions st
    JOIN skus s ON s.id = st.sku_id
    LEFT JOIN ref_categories rc ON rc.id = s.category_id
  `;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(
    `SELECT COUNT(*) as cnt ${fromClause} ${whereClause}`
  ).get(...values) as unknown as { cnt: number };
  const totalItems = countRow.cnt;

  const sortCol = SORT_MAP[params.sort ?? 'saleDate'] || 'st.sold_at';
  const sortDir = params.order === 'asc' ? 'ASC' : 'DESC';
  const offset = (params.page - 1) * params.pageSize;

  const rows = db.prepare(`
    SELECT
      st.id,
      st.sold_at AS sold_at,
      s.sku_code AS sku_code,
      s.style,
      s.department,
      rc.rics_code AS category,
      st.quantity AS units_sold,
      (st.quantity * st.unit_price) AS net_revenue
    ${fromClause}
    ${whereClause}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ? OFFSET ?
  `).all(...values, params.pageSize, offset) as unknown as Array<{
    id: string;
    sold_at: string;
    sku_code: string;
    style: string;
    department: string;
    category: number | null;
    units_sold: number;
    net_revenue: number;
  }>;

  return {
    data: rows.map((r) => ({
      id: r.id,
      saleDate: r.sold_at,
      channel: 'STORE' as const,
      skuCode: r.sku_code,
      style: r.style,
      department: r.department,
      category: r.category,
      unitsSold: r.units_sold,
      netRevenue: Math.round(r.net_revenue * 100) / 100,
    })),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
      totalPages: Math.max(Math.ceil(totalItems / params.pageSize), 1),
    },
  };
}
