import type { Client } from 'pg';

const DEFAULT_SOURCE_TABLE = 'rics_mirror.inv_his';
const IMPORT_SOURCE = 'RICS_IMPORT';

export interface InventoryHistoryBackfillResult {
  runId: string;
  sourceRowsRead: number;
  eligibleRows: number;
  replacedSnapshots: number;
  importedSnapshots: number;
  importedMonths: number;
  importedTrendWeeks: number;
  importedMovementBuckets: number;
  unresolvedSkuRows: number;
  unresolvedSkuCodes: string[];
  durationMs: number;
}

export interface InventoryHistoryBackfillOptions {
  pgClient: Client;
  runId: string;
  sourceTable?: string;
  snapshotAsOf?: Date;
  optimizeBulkReplace?: boolean;
}

interface CountRow {
  count: string;
}

interface MissingSkuRow {
  skuCode: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function quoteQualifiedRef(ref: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(ref)) {
    throw new Error(`Invalid table reference: ${ref}`);
  }
  return ref
    .split('.')
    .map((part) => `"${part}"`)
    .join('.');
}

function moneyExpr(expression: string, precision = 14): string {
  return `
    CASE
      WHEN ${expression} IS NULL THEN NULL
      ELSE ROUND((${expression})::numeric, 2)::numeric(${precision}, 2)
    END
  `;
}

function currentPriceSlotCase(expression: string): string {
  return `
    CASE ${expression}
      WHEN 1 THEN 'LIST'
      WHEN 2 THEN 'RETAIL'
      WHEN 3 THEN 'MD1'
      WHEN 4 THEN 'MD2'
      ELSE NULL
    END
  `;
}

async function loadScalarCount(c: Client, sql: string, values: unknown[] = []): Promise<number> {
  const result = await c.query<CountRow>(sql, values);
  return Number(result.rows[0]?.count ?? 0);
}

function fmtNum(value: number): string {
  return value.toLocaleString('en-US');
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds - minutes * 60)}s`;
}

async function runPhase<T>(label: string, fn: () => Promise<T>, summarize?: (result: T) => string): Promise<T> {
  const startedAt = Date.now();
  console.log(`[inventory-history] ${label}...`);
  const result = await fn();
  const summary = summarize ? ` ${summarize(result)}` : '';
  console.log(`[inventory-history] ${label} done in ${fmtDuration(Date.now() - startedAt)}${summary}`);
  return result;
}

async function loadSourceRowsRead(c: Client, sourceTable: string): Promise<number> {
  return loadScalarCount(
    c,
    `SELECT COUNT(*)::text AS count FROM ${quoteQualifiedRef(sourceTable)}`,
  );
}

async function createSkuMapTempTable(c: Client): Promise<void> {
  await c.query(`
    CREATE TEMP TABLE tmp_inventory_history_sku_map ON COMMIT DROP AS
    SELECT DISTINCT ON (sku_code)
      sku_code,
      id
    FROM (
      SELECT btrim(code) AS sku_code, id, 0 AS priority
      FROM app.sku
      WHERE code IS NOT NULL AND btrim(code) <> ''

      UNION ALL

      SELECT btrim(provisional_code) AS sku_code, id, 1 AS priority
      FROM app.sku
      WHERE provisional_code IS NOT NULL AND btrim(provisional_code) <> ''
    ) candidates
    ORDER BY sku_code, priority, id
  `);
  await c.query(`CREATE INDEX ON tmp_inventory_history_sku_map (sku_code)`);
}

async function createSourceTempTable(c: Client, sourceTable: string): Promise<void> {
  const sourceRef = quoteQualifiedRef(sourceTable);

  const monthColumns = Array.from({ length: 12 }, (_, index) => {
    const n = pad2(index + 1);
    return [
      `COALESCE(src.ly_month_qty_sales_${n}, 0)::integer AS ly_month_qty_sales_${n}`,
      `${moneyExpr(`src.ly_month_dol_sales_${n}`)} AS ly_month_dol_sales_${n}`,
      `${moneyExpr(`src.ly_month_profit_${n}`)} AS ly_month_profit_${n}`,
      `COALESCE(src.ly_month_qty_oh_${n}, 0)::integer AS ly_month_qty_oh_${n}`,
      `${moneyExpr(`src.ly_month_on_hand_${n}`)} AS ly_month_on_hand_${n}`,
    ].join(',\n        ');
  }).join(',\n        ');

  const trendColumns = Array.from({ length: 7 }, (_, index) => {
    const n = pad2(index + 1);
    return [
      `COALESCE(src.trend_begin_oh_${n}, 0)::integer AS trend_begin_oh_${n}`,
      `COALESCE(src.trend_oh_constant_${n}, 0)::integer AS trend_oh_constant_${n}`,
      `COALESCE(src.trend_sales_${n}, 0)::integer AS trend_sales_${n}`,
    ].join(',\n        ');
  }).join(',\n        ');

  const movementColumns = Array.from({ length: 3 }, (_, index) => {
    const n = pad2(index + 1);
    return [
      `COALESCE(src.rmsa_rec_qty_${n}, 0)::integer AS rmsa_rec_qty_${n}`,
      `${moneyExpr(`src.rmsa_rec_dol_${n}`)} AS rmsa_rec_dol_${n}`,
      `COALESCE(src.rmsa_ret_qty_${n}, 0)::integer AS rmsa_ret_qty_${n}`,
      `${moneyExpr(`src.rmsa_ret_dol_${n}`)} AS rmsa_ret_dol_${n}`,
      `COALESCE(src.rmsa_tran_in_qty_${n}, 0)::integer AS rmsa_tran_in_qty_${n}`,
      `${moneyExpr(`src.rmsa_tran_in_dol_${n}`)} AS rmsa_tran_in_dol_${n}`,
      `COALESCE(src.rmsa_tran_out_qty_${n}, 0)::integer AS rmsa_tran_out_qty_${n}`,
      `${moneyExpr(`src.rmsa_tran_out_dol_${n}`)} AS rmsa_tran_out_dol_${n}`,
      `COALESCE(src.rmsa_phy_inv_qty_${n}, 0)::integer AS rmsa_phy_inv_qty_${n}`,
      `${moneyExpr(`src.rmsa_phy_inv_dol_${n}`)} AS rmsa_phy_inv_dol_${n}`,
      `${moneyExpr(`src.rmsa_beg_dol_${n}`)} AS rmsa_beg_dol_${n}`,
    ].join(',\n        ');
  }).join(',\n        ');

  await c.query(`
    CREATE TEMP TABLE tmp_inventory_history_source ON COMMIT DROP AS
    SELECT
      sku_map.id AS sku_id,
      btrim(src.sku) AS sku_code,
      src.store::integer AS store_id,
      src.date_last_received AS date_last_received,
      ${moneyExpr('src.average_cost', 12)} AS average_cost,
      ${moneyExpr('src.season_inv_value')} AS season_inv_value,
      ${moneyExpr('src.year_inv_value')} AS year_inv_value,
      ${moneyExpr('src.last_month_inv_value')} AS last_month_inv_value,
      COALESCE(src.on_hand, 0)::integer AS on_hand,
      COALESCE(src.current_on_order, 0)::integer AS current_on_order,
      COALESCE(src.future_on_order, 0)::integer AS future_on_order,
      COALESCE(src.model, 0)::integer AS model_qty,
      COALESCE(src.week_qty_sales, 0)::integer AS week_qty_sales,
      COALESCE(src.month_qty_sales, 0)::integer AS month_qty_sales,
      COALESCE(src.season_qty_sales, 0)::integer AS season_qty_sales,
      COALESCE(src.year_qty_sales, 0)::integer AS year_qty_sales,
      COALESCE(src.ly_season_qty_sales, 0)::integer AS ly_season_qty_sales,
      COALESCE(src.ly_year_qty_sales, 0)::integer AS ly_year_qty_sales,
      ${moneyExpr('src.week_dol_sales')} AS week_dol_sales,
      ${moneyExpr('src.month_dol_sales')} AS month_dol_sales,
      ${moneyExpr('src.season_dol_sales')} AS season_dol_sales,
      ${moneyExpr('src.year_dol_sales')} AS year_dol_sales,
      ${moneyExpr('src.ly_season_dol_sales')} AS ly_season_dol_sales,
      ${moneyExpr('src.ly_year_dol_sales')} AS ly_year_dol_sales,
      ${moneyExpr('src.week_profit')} AS week_profit,
      ${moneyExpr('src.month_profit')} AS month_profit,
      ${moneyExpr('src.season_profit')} AS season_profit,
      ${moneyExpr('src.year_profit')} AS year_profit,
      ${moneyExpr('src.ly_season_profit')} AS ly_season_profit,
      ${moneyExpr('src.ly_year_profit')} AS ly_year_profit,
      ${moneyExpr('src.week_markdown')} AS week_markdown,
      ${moneyExpr('src.month_markdown')} AS month_markdown,
      ${moneyExpr('src.season_markdown')} AS season_markdown,
      ${moneyExpr('src.year_markdown')} AS year_markdown,
      ${monthColumns},
      COALESCE(src.last_month_on_hand, 0)::integer AS last_month_on_hand,
      COALESCE(src.last_season_on_hand, 0)::integer AS last_season_on_hand,
      COALESCE(src.last_year_on_hand, 0)::integer AS last_year_on_hand,
      ${trendColumns},
      COALESCE(src.trend_wk8_beg_oh, 0)::integer AS trend_week_8_beg_on_hand,
      ${movementColumns},
      ${moneyExpr('src.last_month_retail', 12)} AS last_month_retail,
      ${moneyExpr('src.retail_price', 12)} AS retail_price,
      ${moneyExpr('src.mark_down_price1', 12)} AS mark_down_price_1,
      ${moneyExpr('src.mark_down_price2', 12)} AS mark_down_price_2,
      CASE
        WHEN src.current_price IS NULL THEN NULL
        ELSE src.current_price::smallint
      END AS current_price_slot_raw,
      ${currentPriceSlotCase('src.current_price')} AS current_price_slot,
      ${moneyExpr('src.perks', 12)} AS perks,
      src.date_first_rec AS date_first_received,
      src.last_price_change AS last_price_change_at,
      src.date_last_changed AS source_date_last_changed
    FROM ${sourceRef} src
    LEFT JOIN tmp_inventory_history_sku_map sku_map
      ON sku_map.sku_code = btrim(src.sku)
    WHERE src.sku IS NOT NULL
      AND btrim(src.sku) <> ''
      AND src.store IS NOT NULL
      AND src.store > 0
  `);

  await c.query(`CREATE INDEX ON tmp_inventory_history_source (store_id, sku_code)`);
  await c.query(`CREATE INDEX ON tmp_inventory_history_source (sku_id)`);
  await c.query(`ANALYZE tmp_inventory_history_source`);
}

async function loadUnresolvedSkuSummary(
  c: Client,
): Promise<{ unresolvedSkuRows: number; unresolvedSkuCodes: string[] }> {
  const unresolvedSkuRows = await loadScalarCount(
    c,
    `
      SELECT COUNT(*)::text AS count
      FROM tmp_inventory_history_source
      WHERE sku_id IS NULL
    `,
  );

  const codes = await c.query<MissingSkuRow>(
    `
      SELECT sku_code AS "skuCode"
      FROM tmp_inventory_history_source
      WHERE sku_id IS NULL
      ORDER BY sku_code ASC
      LIMIT 10
    `,
  );

  return {
    unresolvedSkuRows,
    unresolvedSkuCodes: codes.rows.map((row) => row.skuCode),
  };
}

async function replaceImportedSnapshots(c: Client): Promise<number> {
  const counts = await c.query<{ total: string; imported: string }>(
    `
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE source = $1)::text AS imported
      FROM app.inventory_history_snapshot
    `,
    [IMPORT_SOURCE],
  );
  const total = Number(counts.rows[0]?.total ?? 0);
  const imported = Number(counts.rows[0]?.imported ?? 0);

  if (total === imported) {
    await c.query(`
      TRUNCATE TABLE
        app.inventory_history_movement_bucket,
        app.inventory_history_trend_week,
        app.inventory_history_month,
        app.inventory_history_snapshot
    `);
    return imported;
  }

  return loadScalarCount(
    c,
    `
      WITH deleted AS (
        DELETE FROM app.inventory_history_snapshot
        WHERE source = $1
        RETURNING 1
      )
      SELECT COUNT(*)::text AS count
      FROM deleted
    `,
    [IMPORT_SOURCE],
  );
}

const BULK_REBUILD_INDEXES = [
  {
    name: 'inventory_history_snapshot_sku_store_idx',
    createSql: 'CREATE INDEX inventory_history_snapshot_sku_store_idx ON app.inventory_history_snapshot (sku_id, store_id)',
  },
  {
    name: 'inventory_history_snapshot_store_idx',
    createSql: 'CREATE INDEX inventory_history_snapshot_store_idx ON app.inventory_history_snapshot (store_id)',
  },
  {
    name: 'inventory_history_snapshot_source_run_idx',
    createSql: 'CREATE INDEX inventory_history_snapshot_source_run_idx ON app.inventory_history_snapshot (source_run_id)',
  },
  {
    name: 'inventory_history_snapshot_snapshot_as_of_idx',
    createSql: 'CREATE INDEX inventory_history_snapshot_snapshot_as_of_idx ON app.inventory_history_snapshot (snapshot_as_of)',
  },
  {
    name: 'inventory_history_month_year_month_idx',
    createSql: 'CREATE INDEX inventory_history_month_year_month_idx ON app.inventory_history_month (year_month)',
  },
  {
    name: 'inventory_history_month_snapshot_year_month_idx',
    createSql: 'CREATE INDEX inventory_history_month_snapshot_year_month_idx ON app.inventory_history_month (snapshot_id, year_month)',
  },
  {
    name: 'inventory_history_month_sales_activity_idx',
    createSql: `
      CREATE INDEX inventory_history_month_sales_activity_idx
      ON app.inventory_history_month (year_month, snapshot_id)
      WHERE qty_sales <> 0
         OR COALESCE(net_sales, 0) <> 0
         OR COALESCE(profit, 0) <> 0
    `,
  },
  {
    name: 'inventory_history_trend_week_snapshot_idx',
    createSql: 'CREATE INDEX inventory_history_trend_week_snapshot_idx ON app.inventory_history_trend_week (snapshot_id)',
  },
  {
    name: 'inventory_history_bucket_snapshot_idx',
    createSql: 'CREATE INDEX inventory_history_bucket_snapshot_idx ON app.inventory_history_movement_bucket (snapshot_id)',
  },
] as const;

async function configureBulkImportSession(c: Client): Promise<void> {
  await c.query(`SET LOCAL statement_timeout = 0`);
  await c.query(`SET LOCAL synchronous_commit = off`);
  await c.query(`SET LOCAL work_mem = '128MB'`);
  await c.query(`SET LOCAL maintenance_work_mem = '512MB'`);
}

async function dropBulkRebuildIndexes(c: Client): Promise<void> {
  for (const index of BULK_REBUILD_INDEXES) {
    await c.query(`DROP INDEX IF EXISTS app.${index.name}`);
  }
}

async function recreateBulkRebuildIndexes(c: Client): Promise<void> {
  for (const index of BULK_REBUILD_INDEXES) {
    await c.query(index.createSql);
  }
}

async function analyzeInventoryHistoryTables(c: Client): Promise<void> {
  await c.query('ANALYZE app.inventory_history_snapshot');
  await c.query('ANALYZE app.inventory_history_month');
  await c.query('ANALYZE app.inventory_history_trend_week');
  await c.query('ANALYZE app.inventory_history_movement_bucket');
}

async function insertSnapshots(c: Client, runId: string, snapshotAsOf: Date): Promise<number> {
  await c.query(`
    CREATE TEMP TABLE tmp_inventory_history_snapshot_map ON COMMIT DROP AS
    WITH inserted AS (
      INSERT INTO app.inventory_history_snapshot (
        id,
        sku_id,
        sku_code,
        store_id,
        source,
        source_run_id,
        snapshot_as_of,
        date_last_received,
        average_cost,
        season_inv_value,
        year_inv_value,
        last_month_inv_value,
        on_hand,
        current_on_order,
        future_on_order,
        model_qty,
        week_qty_sales,
        month_qty_sales,
        season_qty_sales,
        year_qty_sales,
        ly_season_qty_sales,
        ly_year_qty_sales,
        week_dol_sales,
        month_dol_sales,
        season_dol_sales,
        year_dol_sales,
        ly_season_dol_sales,
        ly_year_dol_sales,
        week_profit,
        month_profit,
        season_profit,
        year_profit,
        ly_season_profit,
        ly_year_profit,
        week_markdown,
        month_markdown,
        season_markdown,
        year_markdown,
        last_month_on_hand,
        last_season_on_hand,
        last_year_on_hand,
        trend_week_8_beg_on_hand,
        last_month_retail,
        retail_price,
        mark_down_price_1,
        mark_down_price_2,
        current_price_slot_raw,
        current_price_slot,
        perks,
        date_first_received,
        last_price_change_at,
        source_date_last_changed,
        created_at,
        updated_at
      )
      SELECT
        gen_random_uuid(),
        src.sku_id,
        src.sku_code,
        src.store_id,
        $1,
        $2::uuid,
        $3::timestamp,
        src.date_last_received,
        src.average_cost,
        src.season_inv_value,
        src.year_inv_value,
        src.last_month_inv_value,
        src.on_hand,
        src.current_on_order,
        src.future_on_order,
        src.model_qty,
        src.week_qty_sales,
        src.month_qty_sales,
        src.season_qty_sales,
        src.year_qty_sales,
        src.ly_season_qty_sales,
        src.ly_year_qty_sales,
        src.week_dol_sales,
        src.month_dol_sales,
        src.season_dol_sales,
        src.year_dol_sales,
        src.ly_season_dol_sales,
        src.ly_year_dol_sales,
        src.week_profit,
        src.month_profit,
        src.season_profit,
        src.year_profit,
        src.ly_season_profit,
        src.ly_year_profit,
        src.week_markdown,
        src.month_markdown,
        src.season_markdown,
        src.year_markdown,
        src.last_month_on_hand,
        src.last_season_on_hand,
        src.last_year_on_hand,
        src.trend_week_8_beg_on_hand,
        src.last_month_retail,
        src.retail_price,
        src.mark_down_price_1,
        src.mark_down_price_2,
        src.current_price_slot_raw,
        src.current_price_slot,
        src.perks,
        src.date_first_received,
        src.last_price_change_at,
        src.source_date_last_changed,
        NOW(),
        NOW()
      FROM tmp_inventory_history_source src
      RETURNING id, sku_code, store_id
    )
    SELECT id, sku_code, store_id
    FROM inserted
  `, [IMPORT_SOURCE, runId, snapshotAsOf]);

  await c.query(`
    CREATE INDEX ON tmp_inventory_history_snapshot_map (store_id, sku_code)
  `);

  return loadScalarCount(
    c,
    `SELECT COUNT(*)::text AS count FROM tmp_inventory_history_snapshot_map`,
  );
}

async function insertMonths(c: Client, snapshotAsOf: Date): Promise<number> {
  const snapshotYear = snapshotAsOf.getFullYear();
  const snapshotMonth = snapshotAsOf.getMonth() + 1;

  const valuesSql = Array.from({ length: 12 }, (_, index) => {
    const n = pad2(index + 1);
    return `(
      ${index + 1},
      src.ly_month_qty_sales_${n},
      src.ly_month_dol_sales_${n},
      src.ly_month_profit_${n},
      src.ly_month_qty_oh_${n},
      src.ly_month_on_hand_${n}
    )`;
  }).join(',\n            ');

  const result = await c.query(
    `
      INSERT INTO app.inventory_history_month (
        id,
        snapshot_id,
        slot_number,
        calendar_month,
        stored_year,
        year_month,
        qty_sales,
        net_sales,
        profit,
        qty_on_hand,
        inventory_value
      )
      SELECT
        gen_random_uuid(),
        snap.id,
        month_slot.slot_number,
        month_slot.slot_number,
        CASE
          WHEN month_slot.slot_number < $1::integer THEN $2::integer
          ELSE $2::integer - 1
        END AS stored_year,
        CONCAT(
          CASE
            WHEN month_slot.slot_number < $1::integer THEN $2::integer
            ELSE $2::integer - 1
          END,
          '-',
          LPAD(month_slot.slot_number::text, 2, '0')
        ) AS year_month,
        month_slot.qty_sales,
        month_slot.net_sales,
        month_slot.profit,
        month_slot.qty_on_hand,
        month_slot.inventory_value
      FROM tmp_inventory_history_source src
      INNER JOIN tmp_inventory_history_snapshot_map snap
        ON snap.store_id = src.store_id
       AND snap.sku_code = src.sku_code
      CROSS JOIN LATERAL (
        VALUES
          ${valuesSql}
      ) AS month_slot (
        slot_number,
        qty_sales,
        net_sales,
        profit,
        qty_on_hand,
        inventory_value
      )
    `,
    [snapshotMonth, snapshotYear],
  );

  return Number(result.rowCount ?? 0);
}

async function insertTrendWeeks(c: Client): Promise<number> {
  const valuesSql = Array.from({ length: 7 }, (_, index) => {
    const n = pad2(index + 1);
    return `(
      ${index + 1},
      src.trend_begin_oh_${n},
      src.trend_oh_constant_${n},
      src.trend_sales_${n}
    )`;
  }).join(',\n            ');

  const result = await c.query(`
    INSERT INTO app.inventory_history_trend_week (
      id,
      snapshot_id,
      slot_number,
      begin_on_hand,
      on_hand_constant,
      sales
    )
    SELECT
      gen_random_uuid(),
      snap.id,
      trend_slot.slot_number,
      trend_slot.begin_on_hand,
      trend_slot.on_hand_constant,
      trend_slot.sales
    FROM tmp_inventory_history_source src
    INNER JOIN tmp_inventory_history_snapshot_map snap
      ON snap.store_id = src.store_id
     AND snap.sku_code = src.sku_code
    CROSS JOIN LATERAL (
      VALUES
        ${valuesSql}
    ) AS trend_slot (
      slot_number,
      begin_on_hand,
      on_hand_constant,
      sales
    )
  `);

  return Number(result.rowCount ?? 0);
}

async function insertMovementBuckets(c: Client): Promise<number> {
  const valuesSql = Array.from({ length: 3 }, (_, index) => {
    const n = pad2(index + 1);
    return `(
      ${index + 1},
      src.rmsa_rec_qty_${n},
      src.rmsa_rec_dol_${n},
      src.rmsa_ret_qty_${n},
      src.rmsa_ret_dol_${n},
      src.rmsa_tran_in_qty_${n},
      src.rmsa_tran_in_dol_${n},
      src.rmsa_tran_out_qty_${n},
      src.rmsa_tran_out_dol_${n},
      src.rmsa_phy_inv_qty_${n},
      src.rmsa_phy_inv_dol_${n},
      src.rmsa_beg_dol_${n}
    )`;
  }).join(',\n            ');

  const result = await c.query(`
    INSERT INTO app.inventory_history_movement_bucket (
      id,
      snapshot_id,
      bucket_number,
      received_qty,
      received_value,
      returned_qty,
      returned_value,
      transfer_in_qty,
      transfer_in_value,
      transfer_out_qty,
      transfer_out_value,
      physical_qty,
      physical_value,
      beginning_value
    )
    SELECT
      gen_random_uuid(),
      snap.id,
      bucket_slot.bucket_number,
      bucket_slot.received_qty,
      bucket_slot.received_value,
      bucket_slot.returned_qty,
      bucket_slot.returned_value,
      bucket_slot.transfer_in_qty,
      bucket_slot.transfer_in_value,
      bucket_slot.transfer_out_qty,
      bucket_slot.transfer_out_value,
      bucket_slot.physical_qty,
      bucket_slot.physical_value,
      bucket_slot.beginning_value
    FROM tmp_inventory_history_source src
    INNER JOIN tmp_inventory_history_snapshot_map snap
      ON snap.store_id = src.store_id
     AND snap.sku_code = src.sku_code
    CROSS JOIN LATERAL (
      VALUES
        ${valuesSql}
    ) AS bucket_slot (
      bucket_number,
      received_qty,
      received_value,
      returned_qty,
      returned_value,
      transfer_in_qty,
      transfer_in_value,
      transfer_out_qty,
      transfer_out_value,
      physical_qty,
      physical_value,
      beginning_value
    )
  `);

  return Number(result.rowCount ?? 0);
}

export async function inventoryHistoryBackfill(
  options: InventoryHistoryBackfillOptions,
): Promise<InventoryHistoryBackfillResult> {
  const startedAt = Date.now();
  const sourceTable = options.sourceTable ?? DEFAULT_SOURCE_TABLE;
  const snapshotAsOf = options.snapshotAsOf ?? new Date();
  const optimizeBulkReplace = options.optimizeBulkReplace !== false;
  const c = options.pgClient;

  const sourceRowsRead = await loadSourceRowsRead(c, sourceTable);

  await c.query('BEGIN');
  try {
    await runPhase('configure bulk import session', () => configureBulkImportSession(c));
    await runPhase('create SKU map', () => createSkuMapTempTable(c));
    await runPhase('normalize source rows', () => createSourceTempTable(c, sourceTable));

    const eligibleRows = await runPhase(
      'count eligible source rows',
      () => loadScalarCount(c, `SELECT COUNT(*)::text AS count FROM tmp_inventory_history_source`),
      (count) => `rows=${fmtNum(count)}`,
    );
    const unresolved = await runPhase(
      'summarize unresolved SKU links',
      () => loadUnresolvedSkuSummary(c),
      (result) => `unresolved=${fmtNum(result.unresolvedSkuRows)}`,
    );
    const replacedSnapshots = await runPhase(
      'replace prior imported snapshots',
      () => replaceImportedSnapshots(c),
      (count) => `replaced=${fmtNum(count)}`,
    );
    if (optimizeBulkReplace) {
      await runPhase('drop secondary inventory-history indexes', () => dropBulkRebuildIndexes(c));
    }
    const importedSnapshots = await runPhase(
      'insert inventory history snapshots',
      () => insertSnapshots(c, options.runId, snapshotAsOf),
      (count) => `inserted=${fmtNum(count)}`,
    );
    const importedMonths = await runPhase(
      'insert monthly history rows',
      () => insertMonths(c, snapshotAsOf),
      (count) => `inserted=${fmtNum(count)}`,
    );
    const importedTrendWeeks = await runPhase(
      'insert trend-week rows',
      () => insertTrendWeeks(c),
      (count) => `inserted=${fmtNum(count)}`,
    );
    const importedMovementBuckets = await runPhase(
      'insert movement-bucket rows',
      () => insertMovementBuckets(c),
      (count) => `inserted=${fmtNum(count)}`,
    );
    if (optimizeBulkReplace) {
      await runPhase('recreate secondary inventory-history indexes', () => recreateBulkRebuildIndexes(c));
    }
    await runPhase('analyze inventory-history tables', () => analyzeInventoryHistoryTables(c));

    await c.query('COMMIT');

    return {
      runId: options.runId,
      sourceRowsRead,
      eligibleRows,
      replacedSnapshots,
      importedSnapshots,
      importedMonths,
      importedTrendWeeks,
      importedMovementBuckets,
      unresolvedSkuRows: unresolved.unresolvedSkuRows,
      unresolvedSkuCodes: unresolved.unresolvedSkuCodes,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  }
}
