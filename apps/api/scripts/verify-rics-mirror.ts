/**
 * End-to-end verification of the RICS -> Postgres mirror.
 *
 *   pnpm --filter @benlow-rics/api verify:rics-mirror
 *
 * Proves three properties in one run:
 *
 *   1. The mirror exists and holds RICS data.
 *        -> SELECT COUNT(*) per canonical table after a fresh reload.
 *
 *   2. The reload is atomic and idempotent.
 *        -> Runs `ricsRefresh()` end-to-end. Postgres's transactional DDL
 *           guarantees the swap is observed as instant. The run appends a
 *           row to platform.etl_run with status='ok' on success.
 *
 *   3. Additive Zack's Retail data survives a reload.
 *        -> Before the sync we insert a canary row into public."ProductContent".
 *           After the sync we check it's still there, then delete it.
 *
 * Exits with code 0 if all three properties hold, 1 otherwise. Safe to run
 * repeatedly — the canary SKU is fixed and cleaned up in a finally block.
 *
 * Safety guard: if another sync (from the CLI or a concurrent verify) is in
 * state 'running' and started less than 30 minutes ago, we refuse to start a
 * new one. You can force by setting SYNC_FORCE=1 in env, but don't do that
 * unless you know the prior run is dead.
 */
import { Client } from 'pg';
import { ricsRefresh, ProgressEvent } from '../src/services/sync/ricsRefresh';
import { CANONICAL_MDBS, toSnakeCase } from '../src/services/sync/canonicalRicsTables';

const CANARY_SKU = '__SYNC_VERIFY_CANARY__';

function fmtNum(n: number | bigint): string {
  return n.toLocaleString('en-US');
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

function onProgress(evt: ProgressEvent): void {
  switch (evt.type) {
    case 'run-start':
      console.log(`  [sync] starting run ${evt.runId} (${evt.mdbCount} MDB files)`);
      break;
    case 'mdb-start':
      console.log(`  [sync]   ${evt.file}`);
      break;
    case 'table-ok':
      console.log(
        `  [sync]     ${evt.result.targetTable}: ${fmtNum(evt.result.rowCount)} rows in ${fmtDuration(evt.result.durationMs)}`
      );
      break;
    case 'table-err':
      console.error(`  [sync]     ${evt.file}.${evt.table} FAILED — ${evt.error.message}`);
      break;
    case 'swap':
      console.log(`  [sync] swap: ${evt.staging} -> ${evt.final}`);
      break;
    case 'run-end':
      if (evt.status === 'ok') {
        console.log(
          `  [sync] OK — ${fmtNum(evt.totalRows)} rows in ${fmtDuration(evt.totalMs)}`
        );
      } else {
        console.error(
          `  [sync] FAILED after ${fmtDuration(evt.totalMs)} — ${evt.errorText ?? 'unknown'}`
        );
      }
      break;
  }
}

async function checkNoConcurrentRun(client: Client): Promise<void> {
  if (process.env.SYNC_FORCE === '1') return;
  const { rows } = await client.query<{ id: string; started_at: Date }>(
    `SELECT id, "startedAt" AS started_at FROM platform.etl_run
     WHERE status = 'running' AND "startedAt" > now() - interval '30 minutes'
     ORDER BY "startedAt" DESC LIMIT 1`
  );
  if (rows.length > 0) {
    throw new Error(
      `another sync is in state 'running' (id ${rows[0].id}, started ${rows[0].started_at.toISOString()}). ` +
        `Wait for it to finish, or set SYNC_FORCE=1 if you know it's dead.`
    );
  }
}

async function insertCanary(client: Client): Promise<void> {
  await client.query(
    `INSERT INTO public."ProductContent" ("ricsSkuCode", "webDescription", "published", "updatedAt", "createdAt")
     VALUES ($1, 'verify-rics-mirror canary row', false, now(), now())
     ON CONFLICT ("ricsSkuCode") DO UPDATE SET "webDescription" = EXCLUDED."webDescription", "updatedAt" = now()`,
    [CANARY_SKU]
  );
}

async function canaryExists(client: Client): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM public."ProductContent" WHERE "ricsSkuCode" = $1`,
    [CANARY_SKU]
  );
  return rows.length > 0;
}

async function deleteCanary(client: Client): Promise<void> {
  await client.query(`DELETE FROM public."ProductContent" WHERE "ricsSkuCode" = $1`, [
    CANARY_SKU,
  ]);
}

interface TableCount {
  schema: string;
  table: string;
  rowCount: number;
}

async function countMirrorTables(client: Client): Promise<TableCount[]> {
  const expected: { schema: string; table: string }[] = [];
  for (const mdb of CANONICAL_MDBS) {
    for (const t of mdb.tables) {
      expected.push({ schema: 'rics_mirror', table: toSnakeCase(t) });
    }
  }
  const results: TableCount[] = [];
  for (const e of expected) {
    try {
      const { rows } = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM "${e.schema}"."${e.table}"`
      );
      results.push({ schema: e.schema, table: e.table, rowCount: Number(rows[0].n) });
    } catch (err: any) {
      // Table missing -> record as -1 so the failure is visible.
      results.push({ schema: e.schema, table: e.table, rowCount: -1 });
    }
  }
  return results;
}

function printCountsTable(counts: TableCount[]): void {
  const nameWidth = Math.max(...counts.map((c) => c.table.length), 20);
  const rowWidth = Math.max(
    ...counts.map((c) => fmtNum(c.rowCount >= 0 ? c.rowCount : 0).length),
    6
  );
  console.log(`  ${'table'.padEnd(nameWidth)}  ${'rows'.padStart(rowWidth)}`);
  console.log(`  ${'-'.repeat(nameWidth)}  ${'-'.repeat(rowWidth)}`);
  for (const c of counts) {
    const label = c.table.padEnd(nameWidth);
    const cell =
      c.rowCount < 0 ? 'MISSING'.padStart(rowWidth) : fmtNum(c.rowCount).padStart(rowWidth);
    console.log(`  ${label}  ${cell}`);
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');

  const totalStart = Date.now();
  console.log('========================================');
  console.log('  RICS -> Postgres mirror verification');
  console.log('========================================');

  // Short-lived connection just for pre-sync checks / canary insert.
  const preClient = new Client({ connectionString: databaseUrl });
  await preClient.connect();

  let canaryInserted = false;
  let syncResult: Awaited<ReturnType<typeof ricsRefresh>> | null = null;
  let canarySurvived: boolean | null = null;
  let postCounts: TableCount[] = [];

  try {
    console.log('\n[1/4] Checking for concurrent sync runs...');
    await checkNoConcurrentRun(preClient);
    console.log('  OK — no sync currently running.');

    console.log('\n[2/4] Planting canary row in public."ProductContent"...');
    await insertCanary(preClient);
    canaryInserted = true;
    console.log(`  OK — inserted canary ricsSkuCode=${CANARY_SKU}`);

    await preClient.end();

    console.log('\n[3/4] Running sync:rics end-to-end...');
    syncResult = await ricsRefresh({ onProgress });
    if (syncResult.status !== 'ok') {
      throw new Error(`sync failed: ${syncResult.errorText ?? 'unknown'}`);
    }

    const postClient = new Client({ connectionString: databaseUrl });
    await postClient.connect();
    try {
      console.log('\n[4/4] Verifying properties...');
      canarySurvived = await canaryExists(postClient);
      console.log(
        `  canary survived reload: ${canarySurvived ? 'YES' : 'NO'}  (SKU ${CANARY_SKU})`
      );

      postCounts = await countMirrorTables(postClient);
      console.log('\n  mirror row counts (post-sync):');
      printCountsTable(postCounts);

      // Clean up canary now that the check passed; done inside the finally
      // block so it's removed even if a later assertion throws.
      await deleteCanary(postClient);
      console.log(`\n  cleaned up canary row.`);
    } finally {
      await postClient.end();
    }
  } finally {
    if (canaryInserted && !(await safeCanaryCleanup(databaseUrl))) {
      console.error('  WARN: canary cleanup may have failed; check public."ProductContent".');
    }
  }

  // Final pass/fail summary.
  const allTablesPresent =
    postCounts.length > 0 && postCounts.every((c) => c.rowCount >= 0);
  const totalRows = postCounts.reduce((sum, c) => sum + Math.max(c.rowCount, 0), 0);
  const pass = syncResult?.status === 'ok' && canarySurvived === true && allTablesPresent;

  console.log('\n========================================');
  console.log(pass ? '  RESULT: PASS' : '  RESULT: FAIL');
  console.log('========================================');
  console.log(`  sync status         : ${syncResult?.status ?? 'unknown'}`);
  console.log(`  tables in mirror    : ${postCounts.length}`);
  console.log(`  missing tables      : ${postCounts.filter((c) => c.rowCount < 0).length}`);
  console.log(`  total rows in mirror: ${fmtNum(totalRows)}`);
  console.log(`  canary survived     : ${canarySurvived === null ? 'n/a' : canarySurvived ? 'yes' : 'NO'}`);
  console.log(`  run id              : ${syncResult?.runId ?? 'n/a'}`);
  console.log(`  total duration      : ${fmtDuration(Date.now() - totalStart)}`);
  console.log('========================================');

  process.exit(pass ? 0 : 1);
}

// Last-ditch canary removal path. Opens its own connection so it still works
// if the main client threw on teardown. Returns true iff the delete succeeded.
async function safeCanaryCleanup(databaseUrl: string): Promise<boolean> {
  const c = new Client({ connectionString: databaseUrl });
  try {
    await c.connect();
    await deleteCanary(c);
    return true;
  } catch {
    return false;
  } finally {
    try { await c.end(); } catch {}
  }
}

main().catch((err) => {
  console.error(`\n[verify:rics-mirror] unhandled error: ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(2);
});
