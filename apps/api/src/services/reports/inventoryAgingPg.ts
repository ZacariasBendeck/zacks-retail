/**
 * Postgres-backed inventory aging report.
 *
 * Reads on-hand stock from `app.stock_level`, joins it to `app.sku` for
 * catalog metadata, and pulls the most recent receiving date from
 * `app.purchase_order_legacy` (per-SKU MAX of `last_received_at` across all
 * receiving lines). The report can be sliced by four dimensions — department,
 * sector, vendor, buyer — and filtered to a subset of stores. Bucket
 * boundaries come from one of three operator-selectable presets.
 *
 * SKUs that have no recorded receiving event fall back to `app.sku.created_at`
 * for the aging clock, matching the legacy semantics so a freshly imported
 * SKU does not appear as 90+ days old.
 */
import { prisma } from '../../db/prisma';
import type { PaginationEnvelope } from '../../models/sku';

export interface AgingBucketSummary {
  bucket: string;
  totalSkus: number;
  totalUnits: number;
  totalCostValue: number;
}

/**
 * One row per group key (department / sector / vendor / buyer label) in the
 * top-level summary. The `groupKey` is what the front end passes back as
 * the drill-down filter; `groupLabel` is what it shows in the UI. For the
 * department dimension the two are equal; for vendor they differ
 * (`groupKey` = `vendor.code`, `groupLabel` = `vendor.short_name`).
 */
export interface AgingGroupSummary {
  groupKey: string;
  groupLabel: string;
  buckets: AgingBucketSummary[];
  totalSkus: number;
  totalUnits: number;
  totalCostValue: number;
  flaggedUnits: number;
  flaggedValue: number;
}

export interface AgingDetail {
  skuId: string;
  skuCode: string;
  brand: string | null;
  style: string;
  color: string | null;
  size: string;
  price: number;
  category: number | null;
  department: string;
  quantityOnHand: number;
  costValue: number;
  daysOnHand: number;
  agingBucket: string;
  flagged: boolean;
  lastReceivedAt: string | null;
}

interface AgingDetailRow {
  sku_id: string;
  sku_code: string;
  brand: string | null;
  style: string | null;
  color: string | null;
  price: string | null;
  category: number | null;
  department: string | null;
  quantity_on_hand: string | number;
  cost_value: string | null;
  days_on_hand: string | number;
  last_received_at: Date | string | null;
}

interface GroupBucketRow {
  group_key: string | null;
  group_label: string | null;
  bucket: string;
  total_skus: string | number;
  total_units: string | number;
  total_cost_value: string | null;
}

interface GroupTotalsRow {
  group_key: string | null;
  group_label: string | null;
  total_skus: string | number;
  total_units: string | number;
  total_cost_value: string | null;
  flagged_units: string | number;
  flagged_value: string | null;
}

/**
 * The three bucket schemes the operator can pick from the page header. Every
 * label in `labels` is what shows in the column header AND what the API emits
 * on `agingBucket` for that row, so the front end can render with no extra
 * mapping. Threshold semantics: `[t1, t2, t3]` means buckets `0..t1`,
 * `t1+1..t2`, `t2+1..t3`, `t3+1+`. The "flagged" boundary is always the start
 * of the last bucket, i.e. `days > t3`.
 */
export const BUCKET_SCHEMES = {
  '30_60_90': {
    thresholds: [30, 60, 90] as const,
    labels: ['0-30', '31-60', '61-90', '90+'] as const,
  },
  '60_120_180': {
    thresholds: [60, 120, 180] as const,
    labels: ['0-60', '61-120', '121-180', '180+'] as const,
  },
  '90_180_270': {
    thresholds: [90, 180, 270] as const,
    labels: ['0-90', '91-180', '181-270', '270+'] as const,
  },
} as const;

export type BucketScheme = keyof typeof BUCKET_SCHEMES;

export const DEFAULT_BUCKET_SCHEME: BucketScheme = '30_60_90';

export type GroupBy = 'department' | 'sector' | 'vendor' | 'buyer';

export const DEFAULT_GROUP_BY: GroupBy = 'department';

const UNMAPPED_LABEL = 'Unmapped';

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getScheme(scheme?: BucketScheme) {
  return BUCKET_SCHEMES[scheme ?? DEFAULT_BUCKET_SCHEME];
}

function assignBucket(days: number, scheme?: BucketScheme): string {
  const { thresholds, labels } = getScheme(scheme);
  if (days <= thresholds[0]) return labels[0];
  if (days <= thresholds[1]) return labels[1];
  if (days <= thresholds[2]) return labels[2];
  return labels[3];
}

/**
 * Build the SQL CASE expression that emits the same bucket label for the
 * chosen scheme that `assignBucket()` returns in TS. Inlined into the CTE so
 * one query produces the bucket and we never have to rebucket on the Node side.
 */
function buildBucketCaseSql(scheme: BucketScheme): string {
  const { thresholds, labels } = BUCKET_SCHEMES[scheme];
  return `
    CASE
      WHEN days_on_hand <= ${thresholds[0]} THEN '${labels[0]}'
      WHEN days_on_hand <= ${thresholds[1]} THEN '${labels[1]}'
      WHEN days_on_hand <= ${thresholds[2]} THEN '${labels[2]}'
      ELSE '${labels[3]}'
    END
  `;
}

/**
 * Returns the SQL expressions for grouping by the chosen dimension. Each
 * returns `(groupKey, groupLabel)` — `groupKey` is the join/filter value
 * round-tripped through the API; `groupLabel` is what renders in the UI.
 *
 * Buyer is taken off the most-recently-receiving PO; that column is currently
 * always NULL in the imported data so buyer groupings will render a single
 * `Unmapped` bucket until the legacy backfill populates it.
 */
function buildGroupExpr(groupBy: GroupBy): { keyExpr: string; labelExpr: string } {
  switch (groupBy) {
    case 'sector':
      return {
        keyExpr: `COALESCE(sec.number::text, '${UNMAPPED_LABEL}')`,
        labelExpr: `COALESCE(sec."desc", '${UNMAPPED_LABEL}')`,
      };
    case 'vendor':
      return {
        keyExpr: `COALESCE(s.vendor_id, '${UNMAPPED_LABEL}')`,
        labelExpr: `COALESCE(NULLIF(v.short_name, ''), s.vendor_id, '${UNMAPPED_LABEL}')`,
      };
    case 'buyer':
      return {
        keyExpr: `COALESCE(NULLIF(buyer_pol.buyer, ''), '${UNMAPPED_LABEL}')`,
        labelExpr: `COALESCE(NULLIF(buyer_pol.buyer, ''), '${UNMAPPED_LABEL}')`,
      };
    case 'department':
    default:
      return {
        keyExpr: `COALESCE(td."desc", '${UNMAPPED_LABEL}')`,
        labelExpr: `COALESCE(td."desc", '${UNMAPPED_LABEL}')`,
      };
  }
}

/**
 * Build the JOIN clauses needed for a given groupBy dimension. department
 * needs `td`, sector needs `td` + `sec`, vendor needs `v`, buyer needs the
 * most-recent-buyer subquery `buyer_pol`. department always present so the
 * detail rows can show the dept column even when grouped by something else.
 */
function buildExtraJoins(groupBy: GroupBy): string {
  const joins = [
    `LEFT JOIN app.taxonomy_department td
       ON s.category_number BETWEEN td.beg_categ AND td.end_categ`,
  ];
  if (groupBy === 'sector') {
    joins.push(`
      LEFT JOIN app.taxonomy_sector sec
        ON td.number BETWEEN sec.beg_dept AND sec.end_dept
    `);
  }
  if (groupBy === 'vendor') {
    joins.push(`LEFT JOIN app.vendor v ON v.code = s.vendor_id`);
  }
  if (groupBy === 'buyer') {
    joins.push(`LEFT JOIN buyer_pol ON buyer_pol.sku_id = s.id`);
  }
  return joins.join('\n');
}

/**
 * Build the `on_hand`, `last_recv`, and (optionally) `buyer_pol` CTEs. Stock
 * filters live in `on_hand` so the aggregate is store-aware before any joins.
 */
function buildBaseCtes(stores: number[] | undefined, includeBuyerCte: boolean, storesParamIdx: number | null): string {
  const onHandWhere = stores && stores.length > 0
    ? `WHERE on_hand > 0 AND store_id = ANY($${storesParamIdx}::int[])`
    : `WHERE on_hand > 0`;

  const buyerCte = includeBuyerCte
    ? `,
    buyer_pol AS (
      SELECT DISTINCT ON (pol.sku_id)
        pol.sku_id,
        po.buyer
      FROM app.purchase_order_legacy_line pol
      JOIN app.purchase_order_legacy po ON po.po_number = pol.po_number
      WHERE pol.sku_id IS NOT NULL AND po.last_received_at IS NOT NULL
      ORDER BY pol.sku_id, po.last_received_at DESC
    )`
    : '';

  return `
    WITH on_hand AS (
      SELECT sku_id, SUM(on_hand)::bigint AS qty
      FROM app.stock_level
      ${onHandWhere}
      GROUP BY sku_id
    ),
    last_recv AS (
      SELECT pol.sku_id, MAX(po.last_received_at) AS last_received_at
      FROM app.purchase_order_legacy_line pol
      JOIN app.purchase_order_legacy po ON po.po_number = pol.po_number
      WHERE po.last_received_at IS NOT NULL AND pol.sku_id IS NOT NULL
      GROUP BY pol.sku_id
    )${buyerCte}
  `;
}

export interface AgingGroupOptions {
  groupBy?: GroupBy;
  stores?: number[];
  scheme?: BucketScheme;
}

/**
 * Top-level summary: one row per group key (department / sector / vendor /
 * buyer label) with the aging-bucket breakdown plus the flagged rollup. Two
 * round-trips to Postgres — one for the bucket grid, one for the per-group
 * totals — joined back together by group key in Node.
 */
export async function getAgingByGroup(
  options: AgingGroupOptions = {},
): Promise<AgingGroupSummary[]> {
  const groupBy = options.groupBy ?? DEFAULT_GROUP_BY;
  const scheme = options.scheme ?? DEFAULT_BUCKET_SCHEME;
  const stores = options.stores;
  const { thresholds, labels } = BUCKET_SCHEMES[scheme];
  const flagThreshold = thresholds[2];
  const bucketCase = buildBucketCaseSql(scheme);
  const { keyExpr, labelExpr } = buildGroupExpr(groupBy);
  const extraJoins = buildExtraJoins(groupBy);

  const params: unknown[] = [];
  let storesParamIdx: number | null = null;
  if (stores && stores.length > 0) {
    params.push(stores);
    storesParamIdx = params.length;
  }

  const cte = buildBaseCtes(stores, groupBy === 'buyer', storesParamIdx);

  const rowsCte = `
    ${cte},
    rows AS (
      SELECT
        s.id AS sku_id,
        oh.qty,
        oh.qty * COALESCE(s.current_cost, 0) AS cost_value,
        ${keyExpr} AS group_key,
        ${labelExpr} AS group_label,
        GREATEST(
          EXTRACT(DAY FROM NOW() - COALESCE(lr.last_received_at, s.created_at))::int,
          0
        ) AS days_on_hand
      FROM on_hand oh
      JOIN app.sku s ON s.id = oh.sku_id
      LEFT JOIN last_recv lr ON lr.sku_id = s.id
      ${extraJoins}
      WHERE s.sku_state = 'ACTIVE'
    )
  `;

  const bucketSql = `
    ${rowsCte}
    SELECT
      group_key,
      MIN(group_label) AS group_label,
      ${bucketCase} AS bucket,
      COUNT(DISTINCT sku_id)::bigint AS total_skus,
      SUM(qty)::bigint AS total_units,
      SUM(cost_value)::numeric(18,2) AS total_cost_value
    FROM rows
    GROUP BY group_key, bucket
  `;

  const totalsSql = `
    ${rowsCte}
    SELECT
      group_key,
      MIN(group_label) AS group_label,
      COUNT(DISTINCT sku_id)::bigint AS total_skus,
      SUM(qty)::bigint AS total_units,
      SUM(cost_value)::numeric(18,2) AS total_cost_value,
      SUM(CASE WHEN days_on_hand > ${flagThreshold} THEN qty ELSE 0 END)::bigint AS flagged_units,
      SUM(CASE WHEN days_on_hand > ${flagThreshold} THEN cost_value ELSE 0 END)::numeric(18,2) AS flagged_value
    FROM rows
    GROUP BY group_key
  `;

  const [bucketRows, totalsRows] = await Promise.all([
    prisma.$queryRawUnsafe<GroupBucketRow[]>(bucketSql, ...params),
    prisma.$queryRawUnsafe<GroupTotalsRow[]>(totalsSql, ...params),
  ]);

  const totalsByKey = new Map<string, GroupTotalsRow>();
  for (const r of totalsRows) {
    totalsByKey.set(r.group_key ?? UNMAPPED_LABEL, r);
  }

  const bucketsByKey = new Map<string, Map<string, AgingBucketSummary>>();
  for (const r of bucketRows) {
    const key = r.group_key ?? UNMAPPED_LABEL;
    let m = bucketsByKey.get(key);
    if (!m) {
      m = new Map();
      bucketsByKey.set(key, m);
    }
    m.set(r.bucket, {
      bucket: r.bucket,
      totalSkus: toNumber(r.total_skus),
      totalUnits: toNumber(r.total_units),
      totalCostValue: toNumber(r.total_cost_value),
    });
  }

  const groups: AgingGroupSummary[] = [];
  for (const [key, totals] of totalsByKey) {
    const bucketMap = bucketsByKey.get(key) ?? new Map<string, AgingBucketSummary>();
    const buckets: AgingBucketSummary[] = labels.map((label) =>
      bucketMap.get(label) ?? {
        bucket: label,
        totalSkus: 0,
        totalUnits: 0,
        totalCostValue: 0,
      },
    );
    groups.push({
      groupKey: key,
      groupLabel: totals.group_label ?? key,
      buckets,
      totalSkus: toNumber(totals.total_skus),
      totalUnits: toNumber(totals.total_units),
      totalCostValue: toNumber(totals.total_cost_value),
      flaggedUnits: toNumber(totals.flagged_units),
      flaggedValue: toNumber(totals.flagged_value),
    });
  }

  return groups.sort((a, b) => a.groupLabel.localeCompare(b.groupLabel));
}

const DETAIL_SORT_MAP: Record<string, string> = {
  skuCode: 's.code',
  brand: 's.vendor_id',
  style: 's.style',
  department: 'department',
  price: 'price_num',
  quantityOnHand: 'quantity_on_hand',
  costValue: 'cost_value',
  daysOnHand: 'days_on_hand',
};

export interface AgingDetailFilters {
  /** Group-key value the user drilled into. Interpreted by `groupBy`. */
  groupKey?: string;
  /** Department drill-down only — narrow further by category number. */
  category?: number;
  /** Optional store filter — restricts on-hand and cost rollups. */
  stores?: number[];
}

export interface AgingDetailPagination {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

/**
 * Per-SKU aging detail rows, paginated. One row per active SKU with on-hand
 * stock anywhere in the chain. The query computes `days_on_hand` and the
 * bucket label server-side so the same Postgres expression that drives the
 * group summary also drives the drill-down — the two views stay consistent
 * without a second pass through Node.
 */
export async function getAgingDetails(
  filters: AgingDetailFilters = {},
  pagination: AgingDetailPagination = {},
  scheme: BucketScheme = DEFAULT_BUCKET_SCHEME,
  groupBy: GroupBy = DEFAULT_GROUP_BY,
): Promise<PaginationEnvelope<AgingDetail>> {
  const { thresholds } = BUCKET_SCHEMES[scheme];
  const flagThreshold = thresholds[2];
  const sortCol = DETAIL_SORT_MAP[pagination.sort ?? 'daysOnHand'] ?? 'days_on_hand';
  const sortDir = pagination.order === 'asc' ? 'ASC' : 'DESC';

  const params: unknown[] = [];
  let storesParamIdx: number | null = null;
  if (filters.stores && filters.stores.length > 0) {
    params.push(filters.stores);
    storesParamIdx = params.length;
  }

  const conditions: string[] = [`s.sku_state = 'ACTIVE'`];
  const { keyExpr } = buildGroupExpr(groupBy);

  if (filters.groupKey) {
    if (filters.groupKey === UNMAPPED_LABEL) {
      conditions.push(`${keyExpr} = '${UNMAPPED_LABEL}'`);
    } else {
      params.push(filters.groupKey);
      conditions.push(`${keyExpr} = $${params.length}`);
    }
  }
  if (filters.category != null && groupBy === 'department') {
    params.push(filters.category);
    conditions.push(`s.category_number = $${params.length}`);
  }

  const where = conditions.join(' AND ');
  const cte = buildBaseCtes(filters.stores, groupBy === 'buyer', storesParamIdx);
  const extraJoins = buildExtraJoins(groupBy);

  const fromAndWhere = `
    FROM on_hand oh
    JOIN app.sku s ON s.id = oh.sku_id
    LEFT JOIN last_recv lr ON lr.sku_id = s.id
    ${extraJoins}
    WHERE ${where}
  `;

  const countSql = `${cte} SELECT COUNT(*)::bigint AS total ${fromAndWhere}`;
  const countResult = await prisma.$queryRawUnsafe<{ total: string | number }[]>(
    countSql,
    ...params,
  );
  const totalItems = toNumber(countResult[0]?.total ?? 0);

  const page = pagination.page ?? 1;
  const pageSize = pagination.pageSize ?? (totalItems || 1);
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
  const offset = (page - 1) * pageSize;

  const limitParamIdx = params.length + 1;
  const offsetParamIdx = params.length + 2;
  const detailParams = [...params, pageSize, offset];

  const detailSql = `
    ${cte}
    SELECT
      s.id::text AS sku_id,
      s.code AS sku_code,
      s.vendor_id AS brand,
      s.style,
      COALESCE(s.color_code, s.style_color) AS color,
      s.retail_price::text AS price,
      s.category_number AS category,
      td."desc" AS department,
      oh.qty AS quantity_on_hand,
      (oh.qty * COALESCE(s.current_cost, 0))::numeric(18,2) AS cost_value,
      GREATEST(
        EXTRACT(DAY FROM NOW() - COALESCE(lr.last_received_at, s.created_at))::int,
        0
      ) AS days_on_hand,
      COALESCE(lr.last_received_at, s.created_at) AS last_received_at,
      s.retail_price::float AS price_num
    ${fromAndWhere}
    ORDER BY ${sortCol} ${sortDir} NULLS LAST, s.code ASC
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
  `;

  const rows = await prisma.$queryRawUnsafe<AgingDetailRow[]>(detailSql, ...detailParams);

  const data: AgingDetail[] = rows.map((r) => {
    const days = toNumber(r.days_on_hand);
    const lastReceivedIso =
      r.last_received_at instanceof Date
        ? r.last_received_at.toISOString()
        : typeof r.last_received_at === 'string'
          ? r.last_received_at
          : null;
    return {
      skuId: r.sku_id,
      skuCode: r.sku_code,
      brand: r.brand,
      style: r.style ?? '',
      color: r.color,
      size: '',
      price: toNumber(r.price),
      category: r.category ?? null,
      department: r.department ?? UNMAPPED_LABEL,
      quantityOnHand: toNumber(r.quantity_on_hand),
      costValue: toNumber(r.cost_value),
      daysOnHand: days,
      agingBucket: assignBucket(days, scheme),
      flagged: days > flagThreshold,
      lastReceivedAt: lastReceivedIso,
    };
  });

  return {
    data,
    pagination: { page, pageSize, totalItems, totalPages },
  };
}

/**
 * Stores currently holding any on-hand stock, joined to `app.store_master` for
 * the human-friendly description. Powers the "limit to stores" multi-select on
 * the report page.
 */
export async function getStoresWithStock(): Promise<{ number: number; name: string | null }[]> {
  const rows = await prisma.$queryRawUnsafe<{ number: number; name: string | null }[]>(`
    SELECT DISTINCT sm.number AS number, sm."desc" AS name
    FROM app.stock_level sl
    JOIN app.store_master sm ON sm.number = sl.store_id
    WHERE sl.on_hand > 0
    ORDER BY sm.number
  `);
  return rows;
}
