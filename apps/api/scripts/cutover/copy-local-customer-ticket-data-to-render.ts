import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Client } from 'pg';
import { from as copyFrom, to as copyTo } from 'pg-copy-streams';

type Args = {
  sourceEnvPath: string;
  targetEnvPath: string;
  skipTruncate: boolean;
};

const TABLES_IN_COPY_ORDER = [
  'customer_import_batch',
  'customer_import_reject',
  'customer',
  'customer_identity',
  'customer_contact',
  'customer_address',
  'customer_legacy_profile',
  'customer_financial_profile',
  'customer_sales_summary_legacy',
  'activation_audience_members',
  'customer_brand_features',
  'customer_category_features',
  'customer_features_current',
  'customer_metrics',
  'customer_metrics_daily',
  'customer_segment_current',
  'customer_segment_history',
  'customer_size_profiles',
  'customer_transaction_fact',
  'customer_transaction_item',
  'sales_history_ticket',
  'sales_history_ticket_line',
  'ticket_header',
  'ticket_detail',
  'ticket_tender',
] as const;

function parseArgs(): Args {
  const args: Args = {
    sourceEnvPath: path.resolve(__dirname, '../../.env'),
    targetEnvPath: path.resolve(__dirname, '../../.env.render.local'),
    skipTruncate: false,
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
      case '--help':
      case '-h':
        console.info(
          [
            'Usage: copy-local-customer-ticket-data-to-render [options]',
            '',
            'Options:',
            '  --source-env <path>   Env file containing local DATABASE_URL',
            '  --target-env <path>   Env file containing Render DATABASE_URL',
            '  --skip-truncate       Append/copy without truncating target tables first',
          ].join('\n'),
        );
        process.exit(0);
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
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
    throw new Error(`Target table app.${tableName} has no columns or does not exist`);
  }
  return result.rows.map((row) => row.column_name);
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

async function truncateTargetTables(target: Client): Promise<void> {
  const tableList = TABLES_IN_COPY_ORDER.map((table) => `app.${qident(table)}`).join(', ');
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

async function copyTable(source: Client, target: Client, tableName: string): Promise<void> {
  const columns = await tableColumns(target, tableName);
  const columnList = columns.map(qident).join(', ');
  const sourceCount = await countRows(source, tableName);
  const started = Date.now();
  console.info(`[copy] app.${tableName}: source rows=${fmtNum(sourceCount)}`);

  await target.query('BEGIN');
  try {
    await target.query('SET LOCAL statement_timeout = 0');
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
  console.info(`[copy] app.${tableName}: copied ${fmtNum(targetCount)} rows in ${fmtDuration(Date.now() - started)}`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const source = new Client({ connectionString: loadDatabaseUrlFromEnvFile(args.sourceEnvPath) });
  const target = new Client({ connectionString: loadDatabaseUrlFromEnvFile(args.targetEnvPath) });
  await source.connect();
  await target.connect();
  await target.query('SET statement_timeout = 0');

  try {
    console.info('========================================');
    console.info('  copy-local-customer-ticket-data-to-render');
    console.info('========================================');
    if (!args.skipTruncate) {
      console.info('[copy] truncating Render customer/ticket tables');
      await truncateTargetTables(target);
    }

    for (const table of TABLES_IN_COPY_ORDER) {
      await copyTable(source, target, table);
    }

    console.info('========================================');
  } finally {
    await target.end().catch(() => undefined);
    await source.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`[copy-local-customer-ticket-data-to-render] ${(error as Error).message}`);
  if ((error as Error).stack) console.error((error as Error).stack);
  process.exit(1);
});
