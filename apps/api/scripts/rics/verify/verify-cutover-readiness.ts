/**
 * Cutover-readiness audit for migration rehearsals and migration day.
 *
 *   pnpm --filter @benlow-rics/api verify:cutover-readiness
 *   pnpm --filter @benlow-rics/api verify:cutover-readiness -- --max-sync-age-hours 6
 *
 * Verifies the data-side prerequisites for a clean migration window:
 *   1. Required schemas exist and Prisma migrations are applied.
 *   2. A current attribute-catalog snapshot is available for bootstrap/replay.
 *   3. No sync is currently in flight, and the latest sync finished cleanly.
 *   4. Every canonical mirror table exists in `rics_mirror`.
 *   5. Bootstrap/app-side tables line up with mirror data:
 *        - `app.sku` ACTIVE RICS rows match the active mirror SKU count
 *        - product-family mappings cover every RICS category
 *        - no orphaned attribute assignments remain
 *        - no operator-created SKU collides with a mirrored RICS SKU code
 *
 * Exit code:
 *   0 -> all blocking checks passed
 *   1 -> one or more blocking checks failed
 *   2 -> invalid CLI usage / missing env
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { CANONICAL_MDBS, toSnakeCase } from '../../../src/services/sync/canonicalRicsTables';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'apps', 'api', 'prisma', 'migrations');
const SNAPSHOT_DIRS = [
  path.join(REPO_ROOT, 'docs', 'Important-Final-Docs'),
  REPO_ROOT,
  path.join(REPO_ROOT, 'apps', 'api'),
];
const DEFAULT_MAX_SYNC_AGE_HOURS = 24;
const DEFAULT_MAX_SNAPSHOT_AGE_HOURS = 72;
const REQUIRED_SCHEMAS = ['rics_mirror', 'public', 'app', 'platform'] as const;

type CheckStatus = 'PASS' | 'FAIL';

interface Args {
  maxSyncAgeHours: number;
  maxSnapshotAgeHours: number;
}

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

interface SnapshotInfo {
  filePath: string;
  mtimeMs: number;
}

interface PrismaMigrationRow {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

interface LatestRunRow {
  id: string;
  status: string;
  started_at: Date | null;
  finished_at: Date | null;
  table_count: string | null;
  total_rows: string | null;
  error_text: string | null;
}

interface BlockingRunRow {
  id: string;
  started_at: Date | null;
}

interface AggregateCounts {
  inventory_master_total: string;
  mirror_active_skus: string;
  app_active_rics_skus: string;
  product_families: string;
  category_mappings: string;
  attribute_dimensions: string;
  category_family_orphans: string;
  sku_attribute_orphan_assignments: string;
  operator_collisions: string;
}

function parseArgs(): Args {
  const out: Args = {
    maxSyncAgeHours: DEFAULT_MAX_SYNC_AGE_HOURS,
    maxSnapshotAgeHours: DEFAULT_MAX_SNAPSHOT_AGE_HOURS,
  };

  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--max-sync-age-hours':
        out.maxSyncAgeHours = parsePositiveNumber(argv[++i], '--max-sync-age-hours');
        break;
      case '--max-snapshot-age-hours':
        out.maxSnapshotAgeHours = parsePositiveNumber(argv[++i], '--max-snapshot-age-hours');
        break;
      case '--help':
      case '-h':
        printHelpAndExit(0);
        break;
      default:
        console.error(`Unknown flag: ${arg}`);
        printHelpAndExit(2);
    }
  }
  return out;
}

function parsePositiveNumber(raw: string | undefined, flag: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`${flag} requires a positive number. Got: ${String(raw)}`);
    printHelpAndExit(2);
  }
  return value;
}

function printHelpAndExit(code: number): never {
  console.log(
    [
      'Usage: verify-cutover-readiness [options]',
      '',
      'Options:',
      `  --max-sync-age-hours <n>       Freshness gate for latest etl_run (default ${DEFAULT_MAX_SYNC_AGE_HOURS})`,
      `  --max-snapshot-age-hours <n>   Freshness gate for attribute snapshot (default ${DEFAULT_MAX_SNAPSHOT_AGE_HOURS})`,
      '  --help                        Show this help',
    ].join('\n'),
  );
  process.exit(code);
}

function fmtNum(value: number): string {
  return value.toLocaleString('en-US');
}

function fmtDate(value: Date | null): string {
  return value ? value.toISOString() : 'n/a';
}

function fmtAge(ms: number): string {
  const absMs = Math.max(ms, 0);
  const totalMinutes = Math.floor(absMs / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 48) {
    const mins = totalMinutes % 60;
    return mins === 0 ? `${totalHours}h` : `${totalHours}h ${mins}m`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}

function hoursSince(timestampMs: number): number {
  return (Date.now() - timestampMs) / 3_600_000;
}

function latestSnapshot(): SnapshotInfo | null {
  const pattern = /^attribute-catalog-export-.*\.json$/;
  let best: SnapshotInfo | null = null;

  for (const dir of SNAPSHOT_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !pattern.test(entry.name)) continue;
      const filePath = path.join(dir, entry.name);
      const stat = fs.statSync(filePath);
      if (!best || stat.mtimeMs > best.mtimeMs) {
        best = { filePath, mtimeMs: stat.mtimeMs };
      }
    }
  }

  return best;
}

function migrationFolders(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function fail(name: string, detail: string): CheckResult {
  return { name, status: 'FAIL', detail };
}

function pass(name: string, detail: string): CheckResult {
  return { name, status: 'PASS', detail };
}

function summarizeList(values: string[], limit = 5): string {
  if (values.length === 0) return 'none';
  const shown = values.slice(0, limit);
  const suffix = values.length > limit ? ` (+${values.length - limit} more)` : '';
  return `${shown.join(', ')}${suffix}`;
}

async function requiredSchemasCheck(client: Client): Promise<CheckResult> {
  const { rows } = await client.query<{ schema_name: string }>(
    `SELECT schema_name
     FROM information_schema.schemata
     WHERE schema_name = ANY($1::text[])
     ORDER BY schema_name`,
    [REQUIRED_SCHEMAS],
  );

  const present = new Set(rows.map((row) => row.schema_name));
  const missing = REQUIRED_SCHEMAS.filter((schema) => !present.has(schema));
  if (missing.length > 0) {
    return fail('Required schemas', `missing ${missing.join(', ')}`);
  }

  return pass('Required schemas', `present: ${REQUIRED_SCHEMAS.join(', ')}`);
}

async function migrationsCheck(client: Client): Promise<CheckResult> {
  const disk = migrationFolders();
  const { rows } = await client.query<PrismaMigrationRow>(
    `SELECT migration_name,
            finished_at,
            rolled_back_at
     FROM public."_prisma_migrations"
     ORDER BY migration_name`,
  );

  const completed = new Set(
    rows
      .filter((row) => row.finished_at != null && row.rolled_back_at == null)
      .map((row) => row.migration_name),
  );
  const unfinished = rows
    .filter((row) => row.finished_at == null && row.rolled_back_at == null)
    .map((row) => row.migration_name);
  const rolledBack = rows
    .filter((row) => row.rolled_back_at != null)
    .map((row) => row.migration_name);
  const missingFromDb = disk.filter((name) => !completed.has(name));

  if (unfinished.length > 0 || rolledBack.length > 0 || missingFromDb.length > 0) {
    return fail(
      'Prisma migrations',
      [
        `disk=${disk.length}`,
        `applied=${completed.size}`,
        `pending=${missingFromDb.length ? summarizeList(missingFromDb) : 'none'}`,
        `unfinished=${unfinished.length ? summarizeList(unfinished) : 'none'}`,
        `rolled_back=${rolledBack.length ? summarizeList(rolledBack) : 'none'}`,
      ].join(' | '),
    );
  }

  return pass('Prisma migrations', `${completed.size}/${disk.length} migration folders applied`);
}

function snapshotCheck(args: Args): CheckResult {
  const snapshot = latestSnapshot();
  if (!snapshot) {
    return fail(
      'Attribute snapshot',
      'no attribute-catalog-export-*.json found; run `pnpm --filter @benlow-rics/api export:attributes` first',
    );
  }

  const ageHours = hoursSince(snapshot.mtimeMs);
  const relativeAge = fmtAge(Date.now() - snapshot.mtimeMs);
  const relPath = path.relative(REPO_ROOT, snapshot.filePath).replace(/\\/g, '/');
  if (ageHours > args.maxSnapshotAgeHours) {
    return fail(
      'Attribute snapshot',
      `${relPath} is stale (${relativeAge} old; threshold ${args.maxSnapshotAgeHours}h)`,
    );
  }

  return pass('Attribute snapshot', `${relPath} updated ${new Date(snapshot.mtimeMs).toISOString()} (${relativeAge} old)`);
}

async function concurrentSyncCheck(client: Client): Promise<CheckResult> {
  const { rows } = await client.query<BlockingRunRow>(
    `SELECT id, "startedAt" AS started_at
     FROM platform.etl_run
     WHERE status = 'running'
       AND "startedAt" > now() - interval '30 minutes'
     ORDER BY "startedAt" DESC
     LIMIT 1`,
  );

  if (rows.length > 0) {
    const row = rows[0];
    return fail('Concurrent sync', `run ${row.id} still marked running since ${fmtDate(row.started_at)}`);
  }

  return pass('Concurrent sync', 'no in-flight sync run found');
}

async function latestSyncCheck(client: Client, args: Args): Promise<CheckResult> {
  const { rows } = await client.query<LatestRunRow>(
    `SELECT id,
            status,
            "startedAt" AS started_at,
            "finishedAt" AS finished_at,
            "tableCount" AS table_count,
            "totalRows" AS total_rows,
            "errorText" AS error_text
     FROM platform.etl_run
     ORDER BY "startedAt" DESC
     LIMIT 1`,
  );

  if (rows.length === 0) {
    return fail('Latest ETL run', 'platform.etl_run is empty; run `pnpm --filter @benlow-rics/api sync:rics`');
  }

  const row = rows[0];
  if (row.status !== 'ok') {
    return fail(
      'Latest ETL run',
      `run ${row.id} status=${row.status} started=${fmtDate(row.started_at)} error=${row.error_text ?? 'n/a'}`,
    );
  }

  const finishedAt = row.finished_at ?? row.started_at;
  if (!finishedAt) {
    return fail('Latest ETL run', `run ${row.id} has status=ok but no timestamps`);
  }

  const ageHours = hoursSince(finishedAt.getTime());
  const relativeAge = fmtAge(Date.now() - finishedAt.getTime());
  if (ageHours > args.maxSyncAgeHours) {
    return fail(
      'Latest ETL run',
      `run ${row.id} is stale (${relativeAge} old; threshold ${args.maxSyncAgeHours}h)`,
    );
  }

  return pass(
    'Latest ETL run',
    `run ${row.id} finished ${fmtDate(row.finished_at)} (${relativeAge} old), tables=${row.table_count ?? 'n/a'}, rows=${row.total_rows ?? 'n/a'}`,
  );
}

async function mirrorCoverageCheck(client: Client): Promise<CheckResult> {
  const expected = CANONICAL_MDBS.flatMap((mdb) => mdb.tables.map((table) => toSnakeCase(table))).sort();
  const { rows } = await client.query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'rics_mirror'
       AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [expected],
  );

  const present = new Set(rows.map((row) => row.table_name));
  const missing = expected.filter((table) => !present.has(table));
  if (missing.length > 0) {
    return fail('Mirror table coverage', `missing ${missing.length}/${expected.length}: ${summarizeList(missing)}`);
  }

  return pass('Mirror table coverage', `${expected.length}/${expected.length} canonical tables present`);
}

async function aggregateCounts(client: Client): Promise<AggregateCounts> {
  const { rows } = await client.query<AggregateCounts>(
    `SELECT
        (SELECT COUNT(*)::text FROM rics_mirror.inventory_master) AS inventory_master_total,
        (SELECT COUNT(*)::text
           FROM rics_mirror.inventory_master
          WHERE sku IS NOT NULL
            AND (status IS NULL OR status <> 'D')) AS mirror_active_skus,
        (SELECT COUNT(*)::text
           FROM app.sku
          WHERE source = 'rics'
            AND sku_state = 'ACTIVE') AS app_active_rics_skus,
        (SELECT COUNT(*)::text FROM app.product_family) AS product_families,
        (SELECT COUNT(*)::text FROM app.category_product_family) AS category_mappings,
        (SELECT COUNT(*)::text FROM app.attribute_dimension) AS attribute_dimensions,
        (SELECT COUNT(*)::text
           FROM rics_mirror.categories c
          WHERE NOT EXISTS (
                SELECT 1
                  FROM app.category_product_family cpf
                 WHERE cpf.category_number = c.number
          )) AS category_family_orphans,
        (SELECT COUNT(*)::text
           FROM app.sku_attribute_assignment a
          WHERE NOT EXISTS (
                SELECT 1 FROM rics_mirror.inventory_master im WHERE im.sku = a.sku_code
          )
            AND NOT EXISTS (
                SELECT 1
                  FROM app.sku s
                 WHERE s.code = a.sku_code
                    OR s.provisional_code = a.sku_code
          )) AS sku_attribute_orphan_assignments,
        (SELECT COUNT(*)::text
           FROM app.sku s
           JOIN rics_mirror.inventory_master im ON im.sku = s.code
          WHERE s.source = 'app') AS operator_collisions`,
  );

  return rows[0];
}

function toInt(raw: string): number {
  return Number(raw);
}

function dataChecks(counts: AggregateCounts): CheckResult[] {
  const inventoryMasterTotal = toInt(counts.inventory_master_total);
  const mirrorActiveSkus = toInt(counts.mirror_active_skus);
  const appActiveRicsSkus = toInt(counts.app_active_rics_skus);
  const productFamilies = toInt(counts.product_families);
  const categoryMappings = toInt(counts.category_mappings);
  const attributeDimensions = toInt(counts.attribute_dimensions);
  const categoryFamilyOrphans = toInt(counts.category_family_orphans);
  const skuAttributeOrphans = toInt(counts.sku_attribute_orphan_assignments);
  const operatorCollisions = toInt(counts.operator_collisions);

  const results: CheckResult[] = [];

  if (inventoryMasterTotal <= 0) {
    results.push(fail('Mirror inventory load', 'rics_mirror.inventory_master is empty'));
  } else {
    results.push(pass('Mirror inventory load', `${fmtNum(inventoryMasterTotal)} mirrored SKU rows present`));
  }

  if (productFamilies <= 0 || categoryMappings <= 0 || attributeDimensions <= 0) {
    results.push(
      fail(
        'App bootstrap seeds',
        `product_families=${productFamilies}, category_mappings=${categoryMappings}, attribute_dimensions=${attributeDimensions}`,
      ),
    );
  } else {
    results.push(
      pass(
        'App bootstrap seeds',
        `families=${fmtNum(productFamilies)}, category_mappings=${fmtNum(categoryMappings)}, attribute_dimensions=${fmtNum(attributeDimensions)}`,
      ),
    );
  }

  if (mirrorActiveSkus !== appActiveRicsSkus) {
    results.push(
      fail(
        'RICS SKU parity',
        `mirror_active=${fmtNum(mirrorActiveSkus)} vs app_active_rics=${fmtNum(appActiveRicsSkus)}`,
      ),
    );
  } else {
    results.push(pass('RICS SKU parity', `${fmtNum(mirrorActiveSkus)} active mirrored SKUs match app.sku`));
  }

  if (categoryFamilyOrphans > 0) {
    results.push(fail('Category family coverage', `${fmtNum(categoryFamilyOrphans)} RICS categories have no family mapping`));
  } else {
    results.push(pass('Category family coverage', 'every mirrored category is mapped to a product family'));
  }

  if (skuAttributeOrphans > 0) {
    results.push(
      fail(
        'SKU attribute integrity',
        `${fmtNum(skuAttributeOrphans)} sku_attribute_assignment row(s) point at no mirror/app SKU`,
      ),
    );
  } else {
    results.push(pass('SKU attribute integrity', 'no orphaned sku_attribute_assignment rows'));
  }

  if (operatorCollisions > 0) {
    results.push(
      fail(
        'Operator SKU collisions',
        `${fmtNum(operatorCollisions)} app-created SKU code(s) collide with mirrored RICS codes`,
      ),
    );
  } else {
    results.push(pass('Operator SKU collisions', 'no app-created SKU codes collide with mirrored RICS rows'));
  }

  return results;
}

function printResults(results: CheckResult[]): void {
  const nameWidth = Math.max(...results.map((result) => result.name.length), 24);
  console.log('========================================');
  console.log('  Cutover Readiness Audit');
  console.log('========================================');
  for (const result of results) {
    console.log(`${result.status.padEnd(4)}  ${result.name.padEnd(nameWidth)}  ${result.detail}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL env var is required');
    process.exit(2);
  }

  const client = new Client({ connectionString: databaseUrl });
  const results: CheckResult[] = [];

  try {
    await client.connect();

    results.push(await requiredSchemasCheck(client));
    results.push(await migrationsCheck(client));
    results.push(snapshotCheck(args));
    results.push(await concurrentSyncCheck(client));
    results.push(await latestSyncCheck(client, args));
    results.push(await mirrorCoverageCheck(client));

    const counts = await aggregateCounts(client);
    results.push(...dataChecks(counts));
  } catch (err) {
    results.push(fail('Audit execution', (err as Error).message));
  } finally {
    try {
      await client.end();
    } catch {}
  }

  printResults(results);

  const failed = results.filter((result) => result.status === 'FAIL');
  console.log('----------------------------------------');
  console.log(`Pass: ${results.length - failed.length}`);
  console.log(`Fail: ${failed.length}`);
  if (failed.length > 0) {
    console.log('Next step: fix the failing checks, then re-run verify:cutover-readiness.');
  } else {
    console.log('Next step: proceed to operator rehearsal / migration window smoke tests.');
  }
  console.log('========================================');

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`[verify:cutover-readiness] unhandled error: ${(err as Error).message}`);
  process.exit(1);
});
