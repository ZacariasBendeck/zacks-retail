import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Client } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { randomUUID } from 'node:crypto';
import { inventorySalesCellBackfill } from '../../../src/services/sync/inventorySalesCellBackfill';
import { quoteIdent } from '../../../src/services/sync/typeMapping';

interface ArtifactColumn {
  targetColumn: string;
  ordinal: number;
  postgresType: string;
  nullable: boolean;
}

interface ArtifactTable {
  targetTable: string;
  csvFile: string;
  rowCount: number;
  columns: ArtifactColumn[];
}

interface ArtifactManifest {
  tables: ArtifactTable[];
}

interface Args {
  manifestPath: string | null;
}

function parseArgs(): Args {
  const args: Args = { manifestPath: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--':
        break;
      case '--manifest':
        args.manifestPath = String(argv[++i] ?? '').trim() || null;
        break;
      case '--help':
      case '-h':
        printHelpAndExit(0);
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  if (!args.manifestPath) {
    throw new Error('--manifest <path> is required');
  }
  return args;
}

function printHelpAndExit(code: number): never {
  console.log(
    [
      'Usage: import-app-stock-from-artifact --manifest <path>',
      '',
      'Loads inv_changes, size_types, and inventory_quantities from a CSV artifact pack',
      'into session temp tables, then rebuilds:',
      '  - app.stock_movement',
      '  - app.stock_level',
      '  - app.inventory_sales_cell',
      '',
      'No persistent writes land in rics_mirror.',
    ].join('\n'),
  );
  process.exit(code);
}

function loadManifest(manifestPath: string): { manifest: ArtifactManifest; manifestDir: string } {
  const absolute = path.resolve(manifestPath);
  const raw = fs.readFileSync(absolute, 'utf8');
  const manifest = JSON.parse(raw) as ArtifactManifest;
  if (!manifest || !Array.isArray(manifest.tables)) {
    throw new Error(`Invalid manifest: ${absolute}`);
  }
  return { manifest, manifestDir: path.dirname(absolute) };
}

function requireTable(manifest: ArtifactManifest, targetTable: string): ArtifactTable {
  const table = manifest.tables.find((entry) => entry.targetTable === targetTable);
  if (!table) {
    throw new Error(`Manifest is missing required table '${targetTable}'`);
  }
  return table;
}

function tempTableName(baseName: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(baseName)) {
    throw new Error(`Invalid temp table name: ${baseName}`);
  }
  return `tmp_${baseName}`;
}

async function createTempTable(
  client: Client,
  tableName: string,
  table: ArtifactTable,
  opts?: { addIdentity?: boolean },
): Promise<void> {
  const orderedColumns = table.columns
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((column) => {
      const nullClause = column.nullable ? '' : ' NOT NULL';
      return `${quoteIdent(column.targetColumn)} ${column.postgresType}${nullClause}`;
    })
    .join(',\n  ');
  const identityPrefix = opts?.addIdentity
    ? `"import_seq" BIGINT GENERATED ALWAYS AS IDENTITY,\n  `
    : '';

  await client.query(`DROP TABLE IF EXISTS ${quoteIdent(tableName)}`);
  await client.query(`CREATE TEMP TABLE ${quoteIdent(tableName)} (\n  ${identityPrefix}${orderedColumns}\n)`);
}

async function loadCsvIntoTempTable(
  client: Client,
  tableName: string,
  table: ArtifactTable,
  absoluteCsvPath: string,
): Promise<number> {
  const orderedColumns = table.columns
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((column) => quoteIdent(column.targetColumn))
    .join(', ');
  const copyStatement = `COPY ${quoteIdent(tableName)} (${orderedColumns}) FROM STDIN WITH (FORMAT csv, NULL '\\N')`;
  const copyStream = client.query(copyFrom(copyStatement));
  const fileStream = fs.createReadStream(absoluteCsvPath, { highWaterMark: 1 << 20 });
  await pipeline(fileStream, copyStream);

  const count = await client.query<{ row_count: string }>(
    `SELECT COUNT(*)::text AS row_count FROM ${quoteIdent(tableName)}`,
  );
  return Number(count.rows[0]?.row_count ?? 0);
}

async function stageTable(
  client: Client,
  manifestDir: string,
  table: ArtifactTable,
  opts?: { addIdentity?: boolean },
): Promise<string> {
  const tableName = tempTableName(table.targetTable);
  const absoluteCsvPath = path.resolve(manifestDir, table.csvFile);
  if (!fs.existsSync(absoluteCsvPath)) {
    throw new Error(`CSV file missing for ${table.targetTable}: ${absoluteCsvPath}`);
  }

  await createTempTable(client, tableName, table, opts);
  const rowCount = await loadCsvIntoTempTable(client, tableName, table, absoluteCsvPath);
  if (rowCount !== table.rowCount) {
    throw new Error(
      `Row-count mismatch for ${table.targetTable}: manifest=${table.rowCount} loaded=${rowCount}`,
    );
  }
  return tableName;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds - minutes * 60)}s`;
}

const STOCK_MOVEMENT_SECONDARY_INDEX_DEFS = [
  `CREATE UNIQUE INDEX stock_movement_idempotency_key ON app.stock_movement USING btree (idempotency_key)`,
  `CREATE INDEX stock_movement_sku_store_movement_at_idx ON app.stock_movement USING btree (sku_id, store_id, movement_at DESC)`,
  `CREATE INDEX stock_movement_source_document_idx ON app.stock_movement USING btree (source_document_type, source_document_id)`,
  `CREATE INDEX stock_movement_store_movement_at_idx ON app.stock_movement USING btree (store_id, movement_at DESC)`,
  `CREATE INDEX stock_movement_type_movement_at_idx ON app.stock_movement USING btree (movement_type, movement_at DESC)`,
] as const;

const STOCK_LEVEL_SECONDARY_INDEX_DEFS = [
  `CREATE INDEX stock_level_sku_store_idx ON app.stock_level USING btree (sku_id, store_id)`,
  `CREATE INDEX stock_level_store_on_hand_idx ON app.stock_level USING btree (store_id, on_hand)`,
  `CREATE UNIQUE INDEX stock_level_store_sku_cell_key ON app.stock_level USING btree (store_id, sku_id, column_label, row_label)`,
] as const;

async function dropIndexes(client: Client, schema: string, indexNames: readonly string[]): Promise<void> {
  for (const indexName of indexNames) {
    await client.query(`DROP INDEX IF EXISTS ${quoteIdent(schema)}.${quoteIdent(indexName)}`);
  }
}

async function createIndexes(client: Client, definitions: readonly string[]): Promise<void> {
  for (const definition of definitions) {
    await client.query(definition);
  }
}

async function importStockMovementsBulk(client: Client, sourceTableName: string): Promise<{
  importedRows: number;
  replacedRows: number;
  durationMs: number;
}> {
  const started = Date.now();
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL synchronous_commit = OFF`);
    const replaced = await client.query(
      `DELETE FROM app.stock_movement WHERE source_document_type = 'RICS_INV_CHANGE'`,
    );

    await client.query(`
      CREATE TEMP TABLE tmp_sku_map ON COMMIT DROP AS
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
    await client.query(`CREATE INDEX ON tmp_sku_map (sku_code)`);

    const insertResult = await client.query(
      `
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
        src.store::integer,
        sku_map.id,
        btrim(COALESCE(src.col, '')),
        btrim(COALESCE(src."row", '')),
        CASE btrim(src.chg_type)
          WHEN 'TIN' THEN 'TRANSFER_IN'
          WHEN 'TOU' THEN 'TRANSFER_OUT'
          WHEN 'POR' THEN 'PO_RECEIPT'
          WHEN 'RET' THEN 'MANUAL_RETURN'
          WHEN 'PHY' THEN 'PHYSICAL_COUNT'
          WHEN 'REC' THEN 'MANUAL_RECEIPT'
        END AS movement_type,
        CASE
          WHEN btrim(src.chg_type) IN ('TOU', 'RET') THEN -ABS(COALESCE(src.qty, 0)::integer)
          WHEN btrim(src.chg_type) = 'PHY' THEN COALESCE(src.qty, 0)::integer
          ELSE ABS(COALESCE(src.qty, 0)::integer)
        END AS quantity_delta,
        CASE
          WHEN src.cost IS NULL THEN NULL
          ELSE ROUND(src.cost::numeric, 2)::numeric(12, 2)
        END AS unit_cost_snapshot,
        NULL,
        'RICS_INV_CHANGE',
        CONCAT(
          'RICS_INV_CHANGE:',
          md5(
            CONCAT_WS(
              '|',
              btrim(src.sku),
              src.store::text,
              btrim(src.chg_type),
              src."date"::text,
              btrim(COALESCE(src.col, '')),
              btrim(COALESCE(src."row", '')),
              COALESCE(NULLIF(btrim(COALESCE(src.po, '')), ''), ''),
              COALESCE(src.oth_store, 0)::text,
              COALESCE(src.qty, 0)::text,
              COALESCE(ROUND(src.cost::numeric, 4)::text, ''),
              COALESCE(NULLIF(btrim(COALESCE(src.rma_number, '')), ''), ''),
              COALESCE(NULLIF(btrim(COALESCE(src.orig_sku, '')), ''), ''),
              src.import_seq::text
            )
          )
        ) AS source_document_id,
        btrim(src.chg_type) AS reason_code,
        NULLIF(
          CONCAT_WS(
            ' | ',
            CASE WHEN NULLIF(btrim(COALESCE(src.po, '')), '') IS NOT NULL THEN CONCAT('po=', NULLIF(btrim(COALESCE(src.po, '')), '')) END,
            CASE WHEN NULLIF(btrim(COALESCE(src.rma_number, '')), '') IS NOT NULL THEN CONCAT('rma=', NULLIF(btrim(COALESCE(src.rma_number, '')), '')) END,
            CASE WHEN COALESCE(src.oth_store, 0) > 0 THEN CONCAT('otherStore=', src.oth_store::text) END,
            CASE
              WHEN NULLIF(btrim(COALESCE(src.orig_sku, '')), '') IS NOT NULL
                AND NULLIF(btrim(COALESCE(src.orig_sku, '')), '') <> btrim(src.sku)
                THEN CONCAT('origSku=', NULLIF(btrim(COALESCE(src.orig_sku, '')), ''))
            END
          ),
          ''
        ) AS comment,
        'migration:artifact-stock-movement',
        src."date"::timestamp,
        NOW(),
        CONCAT(
          'RICS_INV_CHANGE:',
          md5(
            CONCAT_WS(
              '|',
              btrim(src.sku),
              src.store::text,
              btrim(src.chg_type),
              src."date"::text,
              btrim(COALESCE(src.col, '')),
              btrim(COALESCE(src."row", '')),
              COALESCE(NULLIF(btrim(COALESCE(src.po, '')), ''), ''),
              COALESCE(src.oth_store, 0)::text,
              COALESCE(src.qty, 0)::text,
              COALESCE(ROUND(src.cost::numeric, 4)::text, ''),
              COALESCE(NULLIF(btrim(COALESCE(src.rma_number, '')), ''), ''),
              COALESCE(NULLIF(btrim(COALESCE(src.orig_sku, '')), ''), ''),
              src.import_seq::text
            )
          )
        ) AS idempotency_key
      FROM ${quoteIdent(sourceTableName)} src
      INNER JOIN tmp_sku_map sku_map
        ON sku_map.sku_code = btrim(src.sku)
      WHERE COALESCE(src.qty, 0) <> 0
        AND src.store IS NOT NULL
        AND src.store > 0
        AND src.sku IS NOT NULL
        AND btrim(src.sku) <> ''
        AND src.chg_type IS NOT NULL
        AND btrim(src.chg_type) IN ('TIN', 'TOU', 'POR', 'RET', 'PHY', 'REC')
      `,
    );

    await client.query('COMMIT');
    return {
      importedRows: Number(insertResult.rowCount ?? 0),
      replacedRows: Number(replaced.rowCount ?? 0),
      durationMs: Date.now() - started,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    throw error;
  }
}

async function rebuildStockLevelsBulk(
  client: Client,
  inventoryQuantitiesTable: string,
  sizeTypesTable: string,
): Promise<{ projectionRowsWritten: number; durationMs: number }> {
  const started = Date.now();
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL synchronous_commit = OFF`);
    await client.query(`TRUNCATE TABLE app.stock_level`);
    const insertResult = await client.query(
      `
      WITH sku_map AS (
        SELECT DISTINCT ON (sku_code)
          sku_code,
          id,
          size_type
        FROM (
          SELECT btrim(code) AS sku_code, id, size_type, 0 AS priority
          FROM app.sku
          WHERE code IS NOT NULL AND btrim(code) <> ''

          UNION ALL

          SELECT btrim(provisional_code) AS sku_code, id, size_type, 1 AS priority
          FROM app.sku
          WHERE provisional_code IS NOT NULL AND btrim(provisional_code) <> ''
        ) candidates
        ORDER BY sku_code, priority, id
      ),
      size_type_map AS (
        SELECT
          code,
          LEAST(54, GREATEST(0, COALESCE(max_columns, 0))) AS max_columns,
          ARRAY[
            columns_01, columns_02, columns_03, columns_04, columns_05, columns_06, columns_07, columns_08, columns_09, columns_10,
            columns_11, columns_12, columns_13, columns_14, columns_15, columns_16, columns_17, columns_18, columns_19, columns_20,
            columns_21, columns_22, columns_23, columns_24, columns_25, columns_26, columns_27, columns_28, columns_29, columns_30,
            columns_31, columns_32, columns_33, columns_34, columns_35, columns_36, columns_37, columns_38, columns_39, columns_40,
            columns_41, columns_42, columns_43, columns_44, columns_45, columns_46, columns_47, columns_48, columns_49, columns_50,
            columns_51, columns_52, columns_53, columns_54
          ]::text[] AS columns
        FROM ${quoteIdent(sizeTypesTable)}
      ),
      baseline_flat AS (
        SELECT
          sku_map.id AS sku_id,
          iq.store::integer AS store_id,
          CASE
            WHEN sku_map.size_type IS NULL THEN ''
            ELSE btrim(COALESCE(iq."row"::text, ''))
          END AS row_label,
          CASE
            WHEN sku_map.size_type IS NULL OR COALESCE(st.max_columns, 0) = 0 THEN
              CASE WHEN gs.idx = 1 THEN '' ELSE gs.idx::text END
            ELSE
              COALESCE(
                NULLIF(
                  btrim(
                    COALESCE(
                      st.columns[((GREATEST(1, COALESCE(iq.segment, 1)) - 1) * 18) + gs.idx],
                      ''
                    )
                  ),
                  ''
                ),
                (((GREATEST(1, COALESCE(iq.segment, 1)) - 1) * 18) + gs.idx)::text
              )
          END AS column_label,
          gs.qty AS on_hand
        FROM ${quoteIdent(inventoryQuantitiesTable)} iq
        INNER JOIN sku_map
          ON sku_map.sku_code = btrim(iq.sku)
        LEFT JOIN size_type_map st
          ON st.code = sku_map.size_type
        CROSS JOIN LATERAL (
          VALUES
            (1, COALESCE(iq.on_hand_01, 0)::integer),
            (2, COALESCE(iq.on_hand_02, 0)::integer),
            (3, COALESCE(iq.on_hand_03, 0)::integer),
            (4, COALESCE(iq.on_hand_04, 0)::integer),
            (5, COALESCE(iq.on_hand_05, 0)::integer),
            (6, COALESCE(iq.on_hand_06, 0)::integer),
            (7, COALESCE(iq.on_hand_07, 0)::integer),
            (8, COALESCE(iq.on_hand_08, 0)::integer),
            (9, COALESCE(iq.on_hand_09, 0)::integer),
            (10, COALESCE(iq.on_hand_10, 0)::integer),
            (11, COALESCE(iq.on_hand_11, 0)::integer),
            (12, COALESCE(iq.on_hand_12, 0)::integer),
            (13, COALESCE(iq.on_hand_13, 0)::integer),
            (14, COALESCE(iq.on_hand_14, 0)::integer),
            (15, COALESCE(iq.on_hand_15, 0)::integer),
            (16, COALESCE(iq.on_hand_16, 0)::integer),
            (17, COALESCE(iq.on_hand_17, 0)::integer),
            (18, COALESCE(iq.on_hand_18, 0)::integer)
        ) AS gs(idx, qty)
        WHERE iq.sku IS NOT NULL
          AND btrim(iq.sku) <> ''
          AND iq.store IS NOT NULL
          AND iq.store > 0
          AND gs.qty <> 0
          AND (
            sku_map.size_type IS NULL
            OR COALESCE(st.max_columns, 0) = 0
            OR (((GREATEST(1, COALESCE(iq.segment, 1)) - 1) * 18) + gs.idx) <= st.max_columns
          )
      ),
      baseline AS (
        SELECT
          sku_id,
          store_id,
          column_label,
          row_label,
          SUM(on_hand)::integer AS on_hand
        FROM baseline_flat
        GROUP BY sku_id, store_id, column_label, row_label
      ),
      movement_replay AS (
        SELECT
          sku_id,
          store_id,
          COALESCE(column_label, '') AS column_label,
          COALESCE(row_label, '') AS row_label,
          SUM(quantity_delta)::integer AS quantity_delta,
          MAX(movement_at) AS last_movement_at,
          MAX(CASE WHEN UPPER(TRIM(movement_type)) IN ('MANUAL_RECEIPT', 'PO_RECEIPT') THEN movement_at END) AS last_received_at,
          COUNT(*)::integer AS movement_count
        FROM app.stock_movement
        WHERE source_document_type <> 'RICS_INV_CHANGE'
        GROUP BY sku_id, store_id, COALESCE(column_label, ''), COALESCE(row_label, '')
      ),
      projection AS (
        SELECT
          COALESCE(b.sku_id, m.sku_id) AS sku_id,
          COALESCE(b.store_id, m.store_id) AS store_id,
          COALESCE(b.column_label, m.column_label) AS column_label,
          COALESCE(b.row_label, m.row_label) AS row_label,
          COALESCE(b.on_hand, 0) + COALESCE(m.quantity_delta, 0) AS on_hand,
          COALESCE(m.last_received_at, NULL) AS last_received_at,
          COALESCE(m.last_movement_at, NULL) AS last_movement_at,
          1 + COALESCE(m.movement_count, 0) AS version
        FROM baseline b
        FULL OUTER JOIN movement_replay m
          ON m.sku_id = b.sku_id
         AND m.store_id = b.store_id
         AND m.column_label = b.column_label
         AND m.row_label = b.row_label
      )
      INSERT INTO app.stock_level (
        id,
        store_id,
        sku_id,
        column_label,
        row_label,
        on_hand,
        reserved,
        last_received_at,
        last_movement_at,
        version,
        created_at,
        updated_at
      )
      SELECT
        gen_random_uuid(),
        store_id,
        sku_id,
        column_label,
        row_label,
        on_hand,
        0,
        last_received_at,
        last_movement_at,
        version,
        NOW(),
        COALESCE(last_movement_at, last_received_at, NOW())
      FROM projection
      WHERE on_hand <> 0 OR last_received_at IS NOT NULL OR last_movement_at IS NOT NULL
      `,
    );

    await client.query('COMMIT');
    return {
      projectionRowsWritten: Number(insertResult.rowCount ?? 0),
      durationMs: Date.now() - started,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL env var is required');
  }

  const { manifest, manifestDir } = loadManifest(args.manifestPath!);
  const invChanges = requireTable(manifest, 'inv_changes');
  const inventoryQuantities = requireTable(manifest, 'inventory_quantities');
  const sizeTypes = requireTable(manifest, 'size_types');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log('========================================');
    console.log('  import:app-stock-from-artifact');
    console.log('========================================');
    console.log(`manifest : ${args.manifestPath}`);
    console.log('----------------------------------------');

    console.log(`[1/4] staging ${invChanges.targetTable}...`);
    const invChangesTable = await stageTable(client, manifestDir, invChanges, { addIdentity: true });
    console.log(`      loaded ${fmtNum(invChanges.rowCount)} rows into ${invChangesTable}`);
    await client.query(`ANALYZE ${quoteIdent(invChangesTable)}`);

    console.log('[2/4] rebuilding app.stock_movement...');
    console.log('      dropping stock_movement secondary indexes...');
    await dropIndexes(client, 'app', [
      'stock_movement_idempotency_key',
      'stock_movement_sku_store_movement_at_idx',
      'stock_movement_source_document_idx',
      'stock_movement_store_movement_at_idx',
      'stock_movement_type_movement_at_idx',
    ]);
    let movementResult: Awaited<ReturnType<typeof importStockMovementsBulk>>;
    try {
      movementResult = await importStockMovementsBulk(client, invChangesTable);
    } finally {
      console.log('      recreating stock_movement secondary indexes...');
      await createIndexes(client, STOCK_MOVEMENT_SECONDARY_INDEX_DEFS);
    }
    console.log(
      `      imported ${fmtNum(movementResult.importedRows)} rows ` +
        `(${fmtDuration(movementResult.durationMs)})`,
    );
    await client.query(`DROP TABLE IF EXISTS ${quoteIdent(invChangesTable)}`);

    console.log(`[3/4] staging ${sizeTypes.targetTable} + ${inventoryQuantities.targetTable}...`);
    const sizeTypeTable = await stageTable(client, manifestDir, sizeTypes);
    const inventoryQuantitiesTable = await stageTable(client, manifestDir, inventoryQuantities);
    console.log(
      `      loaded ${fmtNum(sizeTypes.rowCount)} rows into ${sizeTypeTable} and ` +
        `${fmtNum(inventoryQuantities.rowCount)} rows into ${inventoryQuantitiesTable}`,
    );
    await client.query(`ANALYZE ${quoteIdent(sizeTypeTable)}`);
    await client.query(`ANALYZE ${quoteIdent(inventoryQuantitiesTable)}`);

    console.log('[4/4] rebuilding app.stock_level + app.inventory_sales_cell...');
    console.log('      dropping stock_level secondary indexes...');
    await dropIndexes(client, 'app', [
      'stock_level_sku_store_idx',
      'stock_level_store_on_hand_idx',
      'stock_level_store_sku_cell_key',
    ]);
    let stockLevelResult: Awaited<ReturnType<typeof rebuildStockLevelsBulk>>;
    try {
      stockLevelResult = await rebuildStockLevelsBulk(client, inventoryQuantitiesTable, sizeTypeTable);
    } finally {
      console.log('      recreating stock_level secondary indexes...');
      await createIndexes(client, STOCK_LEVEL_SECONDARY_INDEX_DEFS);
    }
    console.log(
      `      wrote ${fmtNum(stockLevelResult.projectionRowsWritten)} projection rows ` +
        `(${fmtDuration(stockLevelResult.durationMs)})`,
    );
    const salesCellRunId = randomUUID();
    const salesCellResult = await inventorySalesCellBackfill({
      pgClient: client,
      runId: salesCellRunId,
      sourceQuantityTable: inventoryQuantitiesTable,
      sourceSizeTypeTable: sizeTypeTable,
    });
    console.log(
      `      wrote ${fmtNum(salesCellResult.importedRows)} inquiry sales cell rows ` +
        `(${fmtDuration(salesCellResult.durationMs)})`,
    );
    await client.query(`DROP TABLE IF EXISTS ${quoteIdent(inventoryQuantitiesTable)}`);
    await client.query(`DROP TABLE IF EXISTS ${quoteIdent(sizeTypeTable)}`);

    console.log('----------------------------------------');
    console.log(`stock movement rows : ${fmtNum(movementResult.importedRows)}`);
    console.log(`stock level rows    : ${fmtNum(stockLevelResult.projectionRowsWritten)}`);
    console.log(`sales cell rows     : ${fmtNum(salesCellResult.importedRows)}`);
    console.log('========================================');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[import-app-stock-from-artifact] ${(error as Error).message}`);
  if ((error as Error).stack) {
    console.error((error as Error).stack);
  }
  process.exit(1);
});
