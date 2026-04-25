import type { Client } from 'pg';

const SUPPORTED_CHANGE_TYPES = ['TIN', 'TOU', 'POR', 'RET', 'PHY', 'REC'] as const;
const IMPORT_SOURCE_DOCUMENT_TYPE = 'RICS_INV_CHANGE';
const IMPORT_PERFORMED_BY = 'migration:sync-rics-stock-movements';

export interface StockMovementBackfillResult {
  runId: string;
  mirrorRowsRead: number;
  eligibleRows: number;
  replacedRows: number;
  importedRows: number;
  skippedMissingSkuRows: number;
  missingSkuCodes: string[];
  importedByType: Record<string, number>;
  durationMs: number;
}

export interface StockMovementBackfillOptions {
  pgClient: Client;
  runId: string;
  sourceTable?: string;
}

interface CountRow {
  count: string;
}

interface MissingSkuRow {
  skuCode: string;
  rowCount: string;
}

interface MovementTypeCountRow {
  movementType: string;
  count: string;
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

function buildSkuMapCte(sourceTable: string): string {
  const sourceRef = quoteQualifiedRef(sourceTable);
  return `
    WITH sku_map AS (
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
    ),
    source_rows AS (
      SELECT
        btrim(sku) AS sku_code,
        store::integer AS store_id,
        btrim(chg_type) AS chg_type,
        "date" AS movement_at,
        btrim(COALESCE(col, '')) AS column_label,
        btrim(COALESCE("row", '')) AS row_label,
        NULLIF(btrim(COALESCE(po, '')), '') AS po_number,
        COALESCE(oth_store, 0)::integer AS other_store_id,
        COALESCE(qty, 0)::integer AS qty,
        CASE
          WHEN cost IS NULL THEN NULL
          ELSE ROUND(cost::numeric, 2)::numeric(12, 2)
        END AS unit_cost_snapshot,
        NULLIF(btrim(COALESCE(rma_number, '')), '') AS rma_number,
        NULLIF(btrim(COALESCE(orig_sku, '')), '') AS orig_sku,
        ROW_NUMBER() OVER (
          PARTITION BY
            btrim(sku),
            store,
            btrim(chg_type),
            "date",
            btrim(COALESCE(col, '')),
            btrim(COALESCE("row", '')),
            NULLIF(btrim(COALESCE(po, '')), ''),
            COALESCE(oth_store, 0),
            COALESCE(qty, 0),
            CASE
              WHEN cost IS NULL THEN NULL
              ELSE ROUND(cost::numeric, 4)
            END,
            NULLIF(btrim(COALESCE(rma_number, '')), ''),
            NULLIF(btrim(COALESCE(orig_sku, '')), '')
          ORDER BY
            btrim(sku),
            store,
            btrim(chg_type),
            "date"
        ) AS duplicate_ordinal
      FROM ${sourceRef}
      WHERE COALESCE(qty, 0) <> 0
        AND store IS NOT NULL
        AND store > 0
        AND sku IS NOT NULL
        AND btrim(sku) <> ''
        AND chg_type IS NOT NULL
        AND btrim(chg_type) IN (${SUPPORTED_CHANGE_TYPES.map((value) => `'${value}'`).join(', ')})
    )
  `;
}

async function loadScalarCount(c: Client, sql: string): Promise<number> {
  const result = await c.query<CountRow>(sql);
  return Number(result.rows[0]?.count ?? 0);
}

async function loadMirrorRowsRead(c: Client): Promise<number> {
  return loadScalarCount(
    c,
    `
      SELECT count(*)::text AS count
      FROM ${quoteQualifiedRef(DEFAULT_SOURCE_TABLE)}
    `,
  );
}

const DEFAULT_SOURCE_TABLE = 'rics_mirror.inv_changes';

async function loadMirrorRowsReadFrom(c: Client, sourceTable: string): Promise<number> {
  return loadScalarCount(
    c,
    `
      SELECT count(*)::text AS count
      FROM ${quoteQualifiedRef(sourceTable)}
    `,
  );
}

async function loadEligibleRows(c: Client, sourceTable: string): Promise<number> {
  return loadScalarCount(
    c,
    `
      ${buildSkuMapCte(sourceTable)}
      SELECT count(*)::text AS count
      FROM source_rows
    `,
  );
}

async function loadMissingSkuSummary(
  c: Client,
  sourceTable: string,
): Promise<{ missingRows: number; missingSkuCodes: string[] }> {
  const rows = await c.query<MissingSkuRow>(
    `
      ${buildSkuMapCte(sourceTable)}
      SELECT
        source_rows.sku_code AS "skuCode",
        count(*)::text AS "rowCount"
      FROM source_rows
      LEFT JOIN sku_map ON sku_map.sku_code = source_rows.sku_code
      WHERE sku_map.id IS NULL
      GROUP BY source_rows.sku_code
      ORDER BY count(*) DESC, source_rows.sku_code ASC
      LIMIT 10
    `,
  );

  const missingRows = await loadScalarCount(
    c,
    `
      ${buildSkuMapCte(sourceTable)}
      SELECT count(*)::text AS count
      FROM source_rows
      LEFT JOIN sku_map ON sku_map.sku_code = source_rows.sku_code
      WHERE sku_map.id IS NULL
    `,
  );

  return {
    missingRows,
    missingSkuCodes: rows.rows.map((row) => row.skuCode),
  };
}

async function deleteImportedRows(c: Client): Promise<number> {
  const result = await c.query<CountRow>(
    `
      WITH deleted AS (
        DELETE FROM app.stock_movement
        WHERE source_document_type = $1
        RETURNING 1
      )
      SELECT count(*)::text AS count
      FROM deleted
    `,
    [IMPORT_SOURCE_DOCUMENT_TYPE],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function insertImportedRows(c: Client, sourceTable: string): Promise<number> {
  const result = await c.query<CountRow>(
    `
      ${buildSkuMapCte(sourceTable)}
      INSERT INTO app.stock_movement (
        id,
        store_id,
        sku_id,
        column_label,
        row_label,
        movement_type,
        quantity_delta,
        unit_cost_snapshot,
        retail_price_snapshot,
        source_document_type,
        source_document_id,
        reason_code,
        comment,
        performed_by,
        movement_at,
        created_at,
        idempotency_key
      )
      SELECT
        gen_random_uuid(),
        source_rows.store_id,
        sku_map.id,
        source_rows.column_label,
        source_rows.row_label,
        CASE source_rows.chg_type
          WHEN 'TIN' THEN 'TRANSFER_IN'
          WHEN 'TOU' THEN 'TRANSFER_OUT'
          WHEN 'POR' THEN 'PO_RECEIPT'
          WHEN 'RET' THEN 'MANUAL_RETURN'
          WHEN 'PHY' THEN 'PHYSICAL_COUNT'
          WHEN 'REC' THEN 'MANUAL_RECEIPT'
        END AS movement_type,
        CASE
          WHEN source_rows.chg_type IN ('TOU', 'RET') THEN -ABS(source_rows.qty)
          WHEN source_rows.chg_type = 'PHY' THEN source_rows.qty
          ELSE ABS(source_rows.qty)
        END AS quantity_delta,
        source_rows.unit_cost_snapshot,
        NULL,
        '${IMPORT_SOURCE_DOCUMENT_TYPE}',
        CONCAT(
          '${IMPORT_SOURCE_DOCUMENT_TYPE}:',
          md5(
            CONCAT_WS(
              '|',
              source_rows.sku_code,
              source_rows.store_id::text,
              source_rows.chg_type,
              source_rows.movement_at::text,
              source_rows.column_label,
              source_rows.row_label,
              COALESCE(source_rows.po_number, ''),
              source_rows.other_store_id::text,
              source_rows.qty::text,
              COALESCE(source_rows.unit_cost_snapshot::text, ''),
              COALESCE(source_rows.rma_number, ''),
              COALESCE(source_rows.orig_sku, ''),
              source_rows.duplicate_ordinal::text
            )
          )
        ) AS source_document_id,
        source_rows.chg_type AS reason_code,
        NULLIF(
          CONCAT_WS(
            ' | ',
            CASE WHEN source_rows.po_number IS NOT NULL THEN CONCAT('po=', source_rows.po_number) END,
            CASE WHEN source_rows.rma_number IS NOT NULL THEN CONCAT('rma=', source_rows.rma_number) END,
            CASE WHEN source_rows.other_store_id > 0 THEN CONCAT('otherStore=', source_rows.other_store_id::text) END,
            CASE
              WHEN source_rows.orig_sku IS NOT NULL AND source_rows.orig_sku <> source_rows.sku_code
                THEN CONCAT('origSku=', source_rows.orig_sku)
            END
          ),
          ''
        ) AS comment,
        '${IMPORT_PERFORMED_BY}',
        source_rows.movement_at::timestamp,
        NOW(),
        CONCAT(
          '${IMPORT_SOURCE_DOCUMENT_TYPE}:',
          md5(
            CONCAT_WS(
              '|',
              source_rows.sku_code,
              source_rows.store_id::text,
              source_rows.chg_type,
              source_rows.movement_at::text,
              source_rows.column_label,
              source_rows.row_label,
              COALESCE(source_rows.po_number, ''),
              source_rows.other_store_id::text,
              source_rows.qty::text,
              COALESCE(source_rows.unit_cost_snapshot::text, ''),
              COALESCE(source_rows.rma_number, ''),
              COALESCE(source_rows.orig_sku, ''),
              source_rows.duplicate_ordinal::text
            )
          )
        ) AS idempotency_key
      FROM source_rows
      INNER JOIN sku_map ON sku_map.sku_code = source_rows.sku_code
    `,
  );

  return Number(result.rowCount ?? result.rows[0]?.count ?? 0);
}

async function loadImportedTypeCounts(c: Client): Promise<Record<string, number>> {
  const result = await c.query<MovementTypeCountRow>(
    `
      SELECT
        movement_type AS "movementType",
        count(*)::text AS count
      FROM app.stock_movement
      WHERE source_document_type = $1
      GROUP BY movement_type
      ORDER BY movement_type ASC
    `,
    [IMPORT_SOURCE_DOCUMENT_TYPE],
  );

  const counts: Record<string, number> = {};
  for (const row of result.rows) {
    counts[row.movementType] = Number(row.count);
  }
  return counts;
}

export async function stockMovementBackfill(
  opts: StockMovementBackfillOptions,
): Promise<StockMovementBackfillResult> {
  const { pgClient: c, runId } = opts;
  const sourceTable = opts.sourceTable ?? DEFAULT_SOURCE_TABLE;
  const startedMs = Date.now();

  const mirrorRowsRead = await loadMirrorRowsReadFrom(c, sourceTable);

  await c.query('BEGIN');
  try {
    const eligibleRows = await loadEligibleRows(c, sourceTable);
    const missing = await loadMissingSkuSummary(c, sourceTable);
    const replacedRows = await deleteImportedRows(c);
    const importedRows = await insertImportedRows(c, sourceTable);
    const importedByType = await loadImportedTypeCounts(c);

    await c.query('COMMIT');

    return {
      runId,
      mirrorRowsRead,
      eligibleRows,
      replacedRows,
      importedRows,
      skippedMissingSkuRows: missing.missingRows,
      missingSkuCodes: missing.missingSkuCodes,
      importedByType,
      durationMs: Date.now() - startedMs,
    };
  } catch (err) {
    try {
      await c.query('ROLLBACK');
    } catch {
      // ignore rollback failure; surface original error
    }
    throw err;
  }
}
