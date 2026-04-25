/**
 * SKU-count aggregators used by taxonomy list pages and reference screens.
 *
 * These counts now come from the app-owned SKU surface:
 *   app.sku + app.sku_attribute_override + app.sku_keyword_override
 *
 * This keeps taxonomy reads on the app-side Postgres model instead of
 * re-querying `rics_mirror.inventory_master` or MDB files at request time.
 * If `app.sku` is missing or has not been backfilled yet, every helper returns
 * an empty map so the UI still renders with 0 counts.
 */

import { Pool } from 'pg';

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool == null) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

async function appTableExists(schema: string, table: string): Promise<boolean> {
  try {
    const res = await getPool().query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = $2
       ) AS exists`,
      [schema, table],
    );
    return res.rows[0]?.exists === true;
  } catch {
    return false;
  }
}

async function appSkuReady(): Promise<boolean> {
  return appTableExists('app', 'sku');
}

function liveSkuWhere(alias: string): string {
  return `${alias}.code IS NOT NULL AND ${alias}.sku_state = 'ACTIVE'`;
}

export async function loadSkuCountsByCategory(): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!(await appSkuReady())) return out;
  try {
    const res = await getPool().query<{ category: number | null; n: string }>(
      `
      SELECT COALESCE(o.category, s.category_number) AS category, COUNT(*)::bigint AS n
      FROM app.sku s
      LEFT JOIN app.sku_attribute_override o ON o.rics_sku_code = s.code
      WHERE ${liveSkuWhere('s')}
        AND COALESCE(o.category, s.category_number) IS NOT NULL
      GROUP BY COALESCE(o.category, s.category_number)
      `,
    );
    for (const r of res.rows) {
      const category = Number(r.category);
      if (Number.isFinite(category)) out.set(category, Number(r.n));
    }
  } catch {
    // leave counts at 0
  }
  return out;
}

export async function loadSkuCountsByGroup(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!(await appSkuReady())) return out;
  try {
    const res = await getPool().query<{ group_code: string | null; n: string }>(
      `
      SELECT COALESCE(o.group_code, s.group_code) AS group_code, COUNT(*)::bigint AS n
      FROM app.sku s
      LEFT JOIN app.sku_attribute_override o ON o.rics_sku_code = s.code
      WHERE ${liveSkuWhere('s')}
        AND COALESCE(o.group_code, s.group_code) IS NOT NULL
        AND COALESCE(o.group_code, s.group_code) <> ''
      GROUP BY COALESCE(o.group_code, s.group_code)
      `,
    );
    for (const r of res.rows) {
      const code = (r.group_code ?? '').trim().toUpperCase();
      if (code) out.set(code, Number(r.n));
    }
  } catch {
    // leave counts at 0
  }
  return out;
}

export async function loadSkuCountsByKeyword(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!(await appSkuReady())) return out;
  try {
    const res = await getPool().query<{ keyword: string | null; n: string }>(
      `
      WITH live_skus AS (
        SELECT s.code, s.keywords
        FROM app.sku s
        WHERE ${liveSkuWhere('s')}
      ),
      base_keywords AS (
        SELECT s.code AS sku, TRIM(kw) AS keyword
        FROM live_skus s,
             UNNEST(string_to_array(COALESCE(s.keywords, ''), ' ')) AS kw
        WHERE TRIM(kw) <> ''
      ),
      combined AS (
        SELECT sku, keyword FROM base_keywords
        UNION
        SELECT o.rics_sku_code AS sku, o.keyword
        FROM app.sku_keyword_override o
        JOIN live_skus s ON s.code = o.rics_sku_code
        WHERE o.action = 'ADD'
      ),
      effective AS (
        SELECT sku, keyword FROM combined
        EXCEPT
        SELECT o.rics_sku_code AS sku, o.keyword
        FROM app.sku_keyword_override o
        JOIN live_skus s ON s.code = o.rics_sku_code
        WHERE o.action = 'REMOVE'
      )
      SELECT keyword, COUNT(DISTINCT sku)::bigint AS n
      FROM effective
      GROUP BY keyword
      `,
    );
    for (const r of res.rows) {
      const keyword = (r.keyword ?? '').trim().toUpperCase();
      if (keyword) out.set(keyword, Number(r.n));
    }
  } catch {
    // leave counts at 0
  }
  return out;
}

export async function loadSkuCountsBySeason(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!(await appSkuReady())) return out;
  try {
    const res = await getPool().query<{ season: string | null; n: string }>(
      `
      SELECT COALESCE(o.season, s.season) AS season, COUNT(*)::bigint AS n
      FROM app.sku s
      LEFT JOIN app.sku_attribute_override o ON o.rics_sku_code = s.code
      WHERE ${liveSkuWhere('s')}
        AND COALESCE(o.season, s.season) IS NOT NULL
        AND COALESCE(o.season, s.season) <> ''
      GROUP BY COALESCE(o.season, s.season)
      `,
    );
    for (const r of res.rows) {
      const season = (r.season ?? '').trim().toUpperCase();
      if (season) out.set(season, Number(r.n));
    }
  } catch {
    // leave counts at 0
  }
  return out;
}

export async function loadSkuCountsBySizeType(): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!(await appSkuReady())) return out;
  try {
    const res = await getPool().query<{ size_type: number | null; n: string }>(
      `
      SELECT s.size_type, COUNT(*)::bigint AS n
      FROM app.sku s
      WHERE ${liveSkuWhere('s')}
        AND s.size_type IS NOT NULL
      GROUP BY s.size_type
      `,
    );
    for (const r of res.rows) {
      const code = Number(r.size_type);
      if (Number.isFinite(code)) out.set(code, Number(r.n));
    }
  } catch {
    // leave counts at 0
  }
  return out;
}

export async function loadSkuCountsByVendor(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!(await appSkuReady())) return out;
  try {
    const res = await getPool().query<{ vendor_id: string | null; n: string }>(
      `
      SELECT COALESCE(o.vendor, s.vendor_id) AS vendor_id, COUNT(*)::bigint AS n
      FROM app.sku s
      LEFT JOIN app.sku_attribute_override o ON o.rics_sku_code = s.code
      WHERE ${liveSkuWhere('s')}
        AND COALESCE(o.vendor, s.vendor_id) IS NOT NULL
        AND COALESCE(o.vendor, s.vendor_id) <> ''
      GROUP BY COALESCE(o.vendor, s.vendor_id)
      `,
    );
    for (const r of res.rows) {
      const vendorId = (r.vendor_id ?? '').trim().toUpperCase();
      if (vendorId) out.set(vendorId, Number(r.n));
    }
  } catch {
    // leave counts at 0
  }
  return out;
}

export async function totalSkuCount(): Promise<number> {
  if (!(await appSkuReady())) return 0;
  try {
    const res = await getPool().query<{ n: string }>(
      `SELECT COUNT(*)::bigint AS n FROM app.sku s WHERE ${liveSkuWhere('s')}`,
    );
    return Number(res.rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}
