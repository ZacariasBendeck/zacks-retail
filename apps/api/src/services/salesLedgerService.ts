import { prisma } from '../db/prisma';
import { PaginationEnvelope } from '../models/sku';

export interface SalesLedgerRow {
  id: string;
  saleDate: string;
  storeId: number | null;
  storeName: string | null;
  storeLabel: string;
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
  storeId?: number;
  startDate?: string;
  endDate?: string;
  department?: string;
  category?: number;
  channel?: string;
  skuCode?: string;
  style?: string;
}

type DbValue = number | string | number[];

const REPORT_TIME_ZONE = 'America/Tegucigalpa';

const SORT_MAP: Record<string, string> = {
  saleDate: 't.purchased_at',
  storeId: 't.store_id',
  channel: 'UPPER(COALESCE(NULLIF(BTRIM(t.channel), \'\'), \'store\'))',
  skuCode: 'COALESCE(NULLIF(BTRIM(l.sku_code), \'\'), NULLIF(BTRIM(s.code), \'\'), \'\')',
  style: 'COALESCE(NULLIF(BTRIM(s.style_color), \'\'), NULLIF(BTRIM(s.description_rics), \'\'), \'\')',
  department: 'COALESCE(NULLIF(BTRIM(td."desc"), \'\'), \'\')',
  category: 'cat.category_number',
  unitsSold: 'l.quantity',
  netRevenue: 'l.net_amount',
};

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value);
  if (
    value &&
    typeof value === 'object' &&
    'toNumber' in value &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function normalizeChannel(value: string | null): SalesLedgerRow['channel'] {
  const normalized = (value ?? 'STORE').trim().toUpperCase();
  if (normalized === 'ONLINE' || normalized === 'WHOLESALE') return normalized;
  return 'STORE';
}

function buildStoreLabel(storeId: number | null, storeName: string | null): string {
  if (storeId == null) return 'Unassigned';
  const trimmedName = storeName?.trim();
  return trimmedName ? `${storeId} - ${trimmedName}` : String(storeId);
}

function nextParam(values: DbValue[], value: DbValue): string {
  values.push(value);
  return `$${values.length}`;
}

export async function listSalesLedger(
  params: SalesLedgerParams,
): Promise<PaginationEnvelope<SalesLedgerRow>> {
  const conditions: string[] = [`t.status = 'completed'`];
  const values: DbValue[] = [];

  if (params.storeId != null) {
    const idx = nextParam(values, params.storeId);
    conditions.push(`t.store_id = ${idx}::int`);
  }
  if (params.startDate) {
    const idx = nextParam(values, params.startDate);
    conditions.push(
      `t.purchased_at >= (${idx}::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')`,
    );
  }
  if (params.endDate) {
    const idx = nextParam(values, params.endDate);
    conditions.push(
      `t.purchased_at < (((${idx}::date + INTERVAL '1 day')::timestamp) AT TIME ZONE '${REPORT_TIME_ZONE}')`,
    );
  }
  if (params.department) {
    const idx = nextParam(values, `%${params.department}%`);
    conditions.push(`COALESCE(td."desc", '') ILIKE ${idx}`);
  }
  if (params.category != null) {
    const idx = nextParam(values, params.category);
    conditions.push(`cat.category_number = ${idx}::int`);
  }
  if (params.channel) {
    const idx = nextParam(values, params.channel);
    conditions.push(`UPPER(COALESCE(NULLIF(BTRIM(t.channel), ''), 'store')) = ${idx}`);
  }
  if (params.skuCode) {
    const idx = nextParam(values, `%${params.skuCode}%`);
    conditions.push(`COALESCE(l.sku_code, s.code, '') ILIKE ${idx}`);
  }
  if (params.style) {
    const idx = nextParam(values, `%${params.style}%`);
    conditions.push(`COALESCE(s.style_color, s.description_rics, '') ILIKE ${idx}`);
  }

  const fromClause = `
    FROM app.sales_history_ticket t
    INNER JOIN app.sales_history_ticket_line l ON l.ticket_id = t.id
    LEFT JOIN app.sku s ON s.id = l.sku_id
    LEFT JOIN app.store_master sm ON sm.number = t.store_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        CASE WHEN l.category_key ~ '^[0-9]+$' THEN l.category_key::int END,
        s.category_number
      ) AS category_number
    ) cat ON true
    LEFT JOIN app.taxonomy_department td
      ON cat.category_number BETWEEN td.beg_categ AND td.end_categ
  `;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRows = await prisma.$queryRawUnsafe<Array<{ cnt: number | bigint | string }>>(
    `SELECT COUNT(*) AS cnt ${fromClause} ${whereClause}`,
    ...values,
  );
  const totalItems = toNumber(countRows[0]?.cnt);

  const sortCol = SORT_MAP[params.sort ?? 'saleDate'] || SORT_MAP.saleDate;
  const sortDir = params.order === 'asc' ? 'ASC' : 'DESC';
  const offset = (params.page - 1) * params.pageSize;
  const limitIdx = nextParam(values, params.pageSize);
  const offsetIdx = nextParam(values, offset);

  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    sold_at: string | Date | null;
    store_id: number | null;
    store_name: string | null;
    channel: string | null;
    sku_code: string | null;
    style: string | null;
    department: string | null;
    category: number | null;
    units_sold: number | string | null;
    net_revenue: number | string | null;
  }>>(
    `
    SELECT
      l.id::text AS id,
      t.purchased_at AS sold_at,
      t.store_id::int AS store_id,
      sm."desc" AS store_name,
      UPPER(COALESCE(NULLIF(BTRIM(t.channel), ''), 'store')) AS channel,
      COALESCE(NULLIF(BTRIM(l.sku_code), ''), NULLIF(BTRIM(s.code), ''), '') AS sku_code,
      COALESCE(NULLIF(BTRIM(s.style_color), ''), NULLIF(BTRIM(s.description_rics), ''), '') AS style,
      COALESCE(NULLIF(BTRIM(td."desc"), ''), '') AS department,
      cat.category_number AS category,
      l.quantity::int AS units_sold,
      l.net_amount::float8 AS net_revenue
    ${fromClause}
    ${whereClause}
    ORDER BY ${sortCol} ${sortDir}, l.id ASC
    LIMIT ${limitIdx}::int
    OFFSET ${offsetIdx}::int
    `,
    ...values,
  );

  return {
    data: rows.map((r) => {
      const storeId = r.store_id == null ? null : Number(r.store_id);
      const storeName = r.store_name?.trim() || null;
      return {
        id: r.id,
        saleDate: r.sold_at instanceof Date ? r.sold_at.toISOString() : String(r.sold_at ?? ''),
        storeId,
        storeName,
        storeLabel: buildStoreLabel(storeId, storeName),
        channel: normalizeChannel(r.channel),
        skuCode: r.sku_code?.trim() ?? '',
        style: r.style?.trim() ?? '',
        department: r.department?.trim() ?? '',
        category: r.category == null ? null : Number(r.category),
        unitsSold: toNumber(r.units_sold),
        netRevenue: Math.round(toNumber(r.net_revenue) * 100) / 100,
      };
    }),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
      totalPages: Math.max(Math.ceil(totalItems / params.pageSize), 1),
    },
  };
}
