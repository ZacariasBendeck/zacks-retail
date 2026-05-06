import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { quoteIdent } from '../../../src/services/sync/typeMapping';
import { inventoryHistoryBackfill } from '../../../src/services/sync/inventoryHistoryBackfill';

const LOG_LABEL = 'import:inventory-history-from-csv-bundle';

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
  asOf: Date | null;
  optimizeBulkReplace: boolean;
}

function parseArgs(): Args {
  const args: Args = { manifestPath: null, asOf: null, optimizeBulkReplace: true };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--':
        break;
      case '--manifest':
        args.manifestPath = String(argv[++i] ?? '').trim() || null;
        break;
      case '--as-of': {
        const raw = String(argv[++i] ?? '').trim();
        const value = new Date(raw);
        if (!raw || Number.isNaN(value.getTime())) {
          throw new Error(`Invalid --as-of value: ${raw || '(empty)'}`);
        }
        args.asOf = value;
        break;
      }
      case '--no-bulk-index-rebuild':
        args.optimizeBulkReplace = false;
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
      'Usage: import:inventory-history-from-csv-bundle -- --manifest <path> [--as-of YYYY-MM-DD]',
      '',
      'Stages inv_his.csv into a temp table and rebuilds:',
      '  - app.inventory_history_snapshot',
      '  - app.inventory_history_month',
      '  - app.inventory_history_trend_week',
      '  - app.inventory_history_movement_bucket',
      '',
      'Options:',
      '  --no-bulk-index-rebuild  Keep secondary report indexes in place while inserting.',
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

async function createTempTable(client: Client, tableName: string, table: ArtifactTable): Promise<void> {
  const orderedColumns = table.columns
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((column) => {
      const nullClause = column.nullable ? '' : ' NOT NULL';
      return `${quoteIdent(column.targetColumn)} ${column.postgresType}${nullClause}`;
    })
    .join(',\n  ');

  await client.query(`DROP TABLE IF EXISTS ${quoteIdent(tableName)}`);
  await client.query(`CREATE TEMP TABLE ${quoteIdent(tableName)} (\n  ${orderedColumns}\n)`);
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

async function stageTable(client: Client, manifestDir: string, table: ArtifactTable): Promise<string> {
  const tableName = tempTableName(table.targetTable);
  const absoluteCsvPath = path.resolve(manifestDir, table.csvFile);
  if (!fs.existsSync(absoluteCsvPath)) {
    throw new Error(`CSV file missing for ${table.targetTable}: ${absoluteCsvPath}`);
  }

  await createTempTable(client, tableName, table);
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

async function main(): Promise<void> {
  const args = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');

  const { manifest, manifestDir } = loadManifest(args.manifestPath!);
  const invHisTable = requireTable(manifest, 'inv_his');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const stagedTable = await stageTable(client, manifestDir, invHisTable);
    const runId = randomUUID();

    console.log(
      `[${LOG_LABEL}] staged ${invHisTable.targetTable} ` +
        `rows=${fmtNum(invHisTable.rowCount)} as ${stagedTable}`,
    );

    const result = await inventoryHistoryBackfill({
      pgClient: client,
      runId,
      sourceTable: stagedTable,
      snapshotAsOf: args.asOf ?? new Date(),
      optimizeBulkReplace: args.optimizeBulkReplace,
    });

    console.log(
      `[${LOG_LABEL}] OK - snapshots=${fmtNum(result.importedSnapshots)} ` +
        `months=${fmtNum(result.importedMonths)} ` +
        `trendWeeks=${fmtNum(result.importedTrendWeeks)} ` +
        `movementBuckets=${fmtNum(result.importedMovementBuckets)} ` +
        `in ${fmtDuration(result.durationMs)}`,
    );

    if (result.unresolvedSkuRows > 0) {
      console.warn(
        `[${LOG_LABEL}] unresolved sku links=${fmtNum(result.unresolvedSkuRows)} ` +
          `(first ${Math.min(10, result.unresolvedSkuCodes.length)}: ${result.unresolvedSkuCodes.join(', ') || 'none'})`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[${LOG_LABEL}] FAILED - ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
