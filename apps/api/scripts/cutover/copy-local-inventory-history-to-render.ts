import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Client } from 'pg';
import { from as copyFrom, to as copyTo } from 'pg-copy-streams';

type InventoryHistoryTable =
  | 'inventory_history_snapshot'
  | 'inventory_history_month'
  | 'inventory_history_trend_week'
  | 'inventory_history_movement_bucket';

type Args = {
  sourceEnvPath: string;
  targetEnvPath: string;
  skipTruncate: boolean;
  startAt: InventoryHistoryTable | null;
  only: InventoryHistoryTable | null;
};

const TABLES_IN_COPY_ORDER: readonly InventoryHistoryTable[] = [
  'inventory_history_snapshot',
  'inventory_history_month',
  'inventory_history_trend_week',
  'inventory_history_movement_bucket',
];

const TABLES_IN_TRUNCATE_ORDER: readonly InventoryHistoryTable[] = [
  'inventory_history_movement_bucket',
  'inventory_history_trend_week',
  'inventory_history_month',
  'inventory_history_snapshot',
];

function parseTableName(value: string): InventoryHistoryTable {
  if ((TABLES_IN_COPY_ORDER as readonly string[]).includes(value)) {
    return value as InventoryHistoryTable;
  }
  throw new Error(`Unknown inventory history table: ${value}`);
}

function parseArgs(): Args {
  const args: Args = {
    sourceEnvPath: path.resolve(__dirname, '../../.env'),
    targetEnvPath: path.resolve(__dirname, '../../.env.render.local'),
    skipTruncate: false,
    startAt: null,
    only: null,
  };

  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--source-env':
        args.sourceEnvPath = path.resolve(String(argv[++index] ?? ''));
        break;
      case '--target-env':
        args.targetEnvPath = path.resolve(String(argv[++index] ?? ''));
        break;
      case '--skip-truncate':
        args.skipTruncate = true;
        break;
      case '--start-at':
        args.startAt = parseTableName(String(argv[++index] ?? ''));
        break;
      case '--only':
        args.only = parseTableName(String(argv[++index] ?? ''));
        break;
      case '--help':
      case '-h':
        console.info(
          [
            'Usage: copy-local-inventory-history-to-render [options]',
            '',
            'Options:',
            '  --source-env <path>   Env file containing local DATABASE_URL',
            '  --target-env <path>   Env file containing Render DATABASE_URL',
            '  --skip-truncate       Copy without truncating target tables first',
            '  --start-at <table>    Start copying at the named table',
            '  --only <table>        Copy only the named table',
          ].join('\n'),
        );
        process.exit(0);
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }

  if (args.only && args.startAt) {
    throw new Error('--only and --start-at cannot be used together');
  }

  return args;
}

function qident(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function loadDatabaseUrlFromEnvFile(envPath: string): string {
  const raw = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^DATABASE_URL=(.*)$/.exec(trimmed);
    if (!match) continue;
    return match[1]!.replace(/^['"]|['"]$/g, '');
  }
  throw new Error(`DATABASE_URL not found in ${envPath}`);
}

async function tableColumns(client: Client, tableName: string): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'app'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName],
  );
  if (result.rows.length === 0) {
    throw new Error(`Table app.${tableName} has no columns or does not exist`);
  }
  return result.rows.map((row) => row.column_name);
}

async function assertColumnMatch(source: Client, target: Client, tableName: string): Promise<string[]> {
  const sourceColumns = await tableColumns(source, tableName);
  const targetColumns = await tableColumns(target, tableName);
  if (sourceColumns.join('\0') !== targetColumns.join('\0')) {
    throw new Error(
      [
        `Column mismatch for app.${tableName}`,
        `source=${sourceColumns.join(', ')}`,
        `target=${targetColumns.join(', ')}`,
      ].join('\n'),
    );
  }
  return targetColumns;
}

async function countRows(client: Client, tableName: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM app.${qident(tableName)}`,
  );
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

function tablesToCopy(args: Args): readonly InventoryHistoryTable[] {
  if (args.only) return [args.only];
  if (!args.startAt) return TABLES_IN_COPY_ORDER;
  const startIndex = TABLES_IN_COPY_ORDER.indexOf(args.startAt);
  return TABLES_IN_COPY_ORDER.slice(startIndex);
}

async function configureSession(client: Client): Promise<void> {
  await client.query('SET statement_timeout = 0');
  await client.query('SET idle_in_transaction_session_timeout = 0');
}

async function truncateTargetTables(target: Client): Promise<void> {
  const tableList = TABLES_IN_TRUNCATE_ORDER.map((table) => `app.${qident(table)}`).join(', ');
  await target.query('BEGIN');
  try {
    await target.query('SET LOCAL statement_timeout = 0');
    await target.query(`TRUNCATE TABLE ${tableList}`);
    await target.query('COMMIT');
  } catch (error) {
    await target.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function copyTable(source: Client, target: Client, tableName: InventoryHistoryTable): Promise<void> {
  if (tableName === 'inventory_history_snapshot') {
    await copySnapshotTableWithSkuRemap(source, target);
    return;
  }

  const columns = await assertColumnMatch(source, target, tableName);
  const columnList = columns.map(qident).join(', ');
  const sourceCount = await countRows(source, tableName);
  const started = Date.now();
  console.info(`[inventory-copy] app.${tableName}: source rows=${fmtNum(sourceCount)}`);

  await target.query('BEGIN');
  try {
    await target.query('SET LOCAL statement_timeout = 0');
    await target.query('SET LOCAL idle_in_transaction_session_timeout = 0');
    await target.query('SET LOCAL synchronous_commit = OFF');
    const copyOut = source.query(
      copyTo(`COPY (SELECT ${columnList} FROM app.${qident(tableName)}) TO STDOUT WITH (FORMAT csv, NULL '\\N')`),
    );
    const copyIn = target.query(
      copyFrom(`COPY app.${qident(tableName)} (${columnList}) FROM STDIN WITH (FORMAT csv, NULL '\\N')`),
    );
    await pipeline(copyOut, copyIn);
    await target.query('COMMIT');
  } catch (error) {
    await target.query('ROLLBACK').catch(() => undefined);
    throw error;
  }

  const targetCount = await countRows(target, tableName);
  if (targetCount !== sourceCount) {
    throw new Error(`Row-count mismatch for app.${tableName}: source=${sourceCount} target=${targetCount}`);
  }
  console.info(
    `[inventory-copy] app.${tableName}: copied ${fmtNum(targetCount)} rows in ${fmtDuration(Date.now() - started)}`,
  );
}

async function copySnapshotTableWithSkuRemap(source: Client, target: Client): Promise<void> {
  const tableName = 'inventory_history_snapshot';
  const columns = await assertColumnMatch(source, target, tableName);
  const columnList = columns.map(qident).join(', ');
  const sourceCount = await countRows(source, tableName);
  const tempTable = qident(`tmp_${tableName}_${process.pid}`);
  const started = Date.now();
  console.info(`[inventory-copy] app.${tableName}: source rows=${fmtNum(sourceCount)}; remapping sku_id by sku_code`);

  await target.query('BEGIN');
  try {
    await target.query('SET LOCAL statement_timeout = 0');
    await target.query('SET LOCAL idle_in_transaction_session_timeout = 0');
    await target.query('SET LOCAL synchronous_commit = OFF');
    await target.query(
      `CREATE TEMP TABLE ${tempTable} (LIKE app.${qident(tableName)} INCLUDING DEFAULTS) ON COMMIT DROP`,
    );

    const copyOut = source.query(
      copyTo(`COPY (SELECT ${columnList} FROM app.${qident(tableName)}) TO STDOUT WITH (FORMAT csv, NULL '\\N')`),
    );
    const copyIn = target.query(
      copyFrom(`COPY ${tempTable} (${columnList}) FROM STDIN WITH (FORMAT csv, NULL '\\N')`),
    );
    await pipeline(copyOut, copyIn);

    const stagedCount = await target.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${tempTable}`);
    if (Number(stagedCount.rows[0]?.count ?? 0) !== sourceCount) {
      throw new Error(
        `Staged row-count mismatch for app.${tableName}: source=${sourceCount} staged=${stagedCount.rows[0]?.count ?? 0}`,
      );
    }

    const missingSkuCodes = await target.query<{ missing_rows: string; missing_codes: string }>(
      `
        SELECT COUNT(*)::text AS missing_rows,
               COUNT(DISTINCT tmp.sku_code)::text AS missing_codes
        FROM ${tempTable} tmp
        LEFT JOIN app.sku target_sku ON target_sku.code = tmp.sku_code
        WHERE tmp.sku_id IS NOT NULL
          AND target_sku.id IS NULL
      `,
    );
    if (Number(missingSkuCodes.rows[0]?.missing_rows ?? 0) > 0) {
      const samples = await target.query<{ sku_code: string }>(
        `
          SELECT DISTINCT tmp.sku_code
          FROM ${tempTable} tmp
          LEFT JOIN app.sku target_sku ON target_sku.code = tmp.sku_code
          WHERE tmp.sku_id IS NOT NULL
            AND target_sku.id IS NULL
          ORDER BY tmp.sku_code
          LIMIT 20
        `,
      );
      throw new Error(
        [
          `Cannot remap app.${tableName}: ${missingSkuCodes.rows[0]?.missing_rows ?? 0} rows across ${
            missingSkuCodes.rows[0]?.missing_codes ?? 0
          } SKU codes are missing on Render`,
          `sample sku_code values=${samples.rows.map((row) => row.sku_code).join(', ')}`,
        ].join('\n'),
      );
    }

    const duplicateSkuCodes = await target.query<{ sku_code: string; matches: string }>(
      `
        SELECT codes.sku_code, COUNT(*)::text AS matches
        FROM (SELECT DISTINCT sku_code FROM ${tempTable} WHERE sku_id IS NOT NULL) codes
        JOIN app.sku target_sku ON target_sku.code = codes.sku_code
        GROUP BY codes.sku_code
        HAVING COUNT(*) > 1
        ORDER BY codes.sku_code
        LIMIT 20
      `,
    );
    if (duplicateSkuCodes.rows.length > 0) {
      throw new Error(
        [
          `Cannot remap app.${tableName}: Render has duplicate app.sku.code values used by inventory history`,
          `sample duplicate sku_code values=${duplicateSkuCodes.rows
            .map((row) => `${row.sku_code} (${row.matches})`)
            .join(', ')}`,
        ].join('\n'),
      );
    }

    const selectList = columns
      .map((column) => {
        if (column === 'sku_id') {
          return `CASE WHEN tmp.${qident(column)} IS NULL THEN NULL ELSE target_sku.id END`;
        }
        return `tmp.${qident(column)}`;
      })
      .join(', ');
    await target.query(
      `
        INSERT INTO app.${qident(tableName)} (${columnList})
        SELECT ${selectList}
        FROM ${tempTable} tmp
        LEFT JOIN app.sku target_sku ON target_sku.code = tmp.sku_code
      `,
    );
    await target.query('COMMIT');
  } catch (error) {
    await target.query('ROLLBACK').catch(() => undefined);
    throw error;
  }

  const targetCount = await countRows(target, tableName);
  if (targetCount !== sourceCount) {
    throw new Error(`Row-count mismatch for app.${tableName}: source=${sourceCount} target=${targetCount}`);
  }
  console.info(
    `[inventory-copy] app.${tableName}: copied ${fmtNum(targetCount)} rows in ${fmtDuration(Date.now() - started)}`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs();
  const source = new Client({
    application_name: 'zacks_inventory_history_copy_source',
    connectionString: loadDatabaseUrlFromEnvFile(args.sourceEnvPath),
  });
  const target = new Client({
    application_name: 'zacks_inventory_history_copy_render',
    connectionString: loadDatabaseUrlFromEnvFile(args.targetEnvPath),
  });

  await source.connect();
  await target.connect();
  await configureSession(source);
  await configureSession(target);

  try {
    console.info('========================================');
    console.info('  copy-local-inventory-history-to-render');
    console.info('========================================');
    if (!args.skipTruncate) {
      console.info('[inventory-copy] truncating Render inventory history tables');
      await truncateTargetTables(target);
    }

    for (const table of tablesToCopy(args)) {
      await copyTable(source, target, table);
    }

    console.info('========================================');
  } finally {
    await target.end().catch(() => undefined);
    await source.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`[copy-local-inventory-history-to-render] ${(error as Error).message}`);
  if ((error as Error).stack) console.error((error as Error).stack);
  process.exit(1);
});
