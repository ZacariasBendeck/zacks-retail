import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { CANONICAL_MDBS } from './canonicalRicsTables';
import { copyMdbTableToPostgres, CopyResult } from './copyFromMdb';
import { ricsDbPath, getOrRecoverPassword } from '../accessOleDb';
import { stagingRoot, ensureStagingDir } from './bulkExtract';
import { skuLifecycleBackfill, BackfillResult } from './skuLifecycleBackfill';

export type ProgressEvent =
  | { type: 'run-start'; runId: string; mdbCount: number }
  | { type: 'mdb-start'; file: string }
  | { type: 'table-ok'; file: string; result: CopyResult }
  | { type: 'table-err'; file: string; table: string; error: Error }
  | { type: 'swap'; staging: string; final: string }
  | { type: 'sku-backfill-start' }
  | { type: 'sku-backfill-ok'; result: BackfillResult }
  | { type: 'sku-backfill-err'; error: Error }
  | { type: 'run-end'; runId: string; status: 'ok' | 'failed'; totalRows: number; totalMs: number; errorText?: string };

export interface RefreshOptions {
  /** Postgres connection string. Defaults to DATABASE_URL. */
  databaseUrl?: string;
  /** Final schema name (will be swapped into place). Default: `rics_mirror`. */
  finalSchema?: string;
  /** Staging schema name. Default: `rics_mirror_staging`. */
  stagingSchema?: string;
  /** Progress callback for CLI / UI streaming. */
  onProgress?: (evt: ProgressEvent) => void;
}

export interface RefreshResult {
  runId: string;
  status: 'ok' | 'failed';
  totalRows: number;
  tableCount: number;
  durationMs: number;
  errorText?: string;
  tables: CopyResult[];
  /**
   * Present when the post-swap SKU backfill ran. Absent on mirror failure
   * (backfill is skipped). A backfill error here does NOT flip the top-level
   * status to 'failed' — the mirror is already committed; re-run via
   * `pnpm sync:rics-skus` to heal `app.sku`.
   */
  skuBackfill?: BackfillResult;
  skuBackfillError?: string;
}

/**
 * Full one-way reload of RICS data into Postgres.
 *
 * Transactional shape:
 *   BEGIN
 *     DROP   SCHEMA <staging> CASCADE (if exists — leftover from a failed prior run)
 *     CREATE SCHEMA <staging>
 *     (for each canonical MDB table)
 *       CREATE TABLE <staging>.<snake> (...);
 *       COPY rows in;
 *       INSERT etl_run_table row;
 *     DROP   SCHEMA <final> CASCADE
 *     ALTER  SCHEMA <staging> RENAME TO <final>
 *   COMMIT
 *
 * If any step throws, we ROLLBACK — the `rics_mirror` schema and its data
 * are untouched, and any partial `rics_mirror_staging` from the failed run
 * disappears because DDL in the aborted transaction is rolled back too.
 *
 * The `app` schema is never touched. Additive Zack's Retail data survives
 * because it lives in `public` (existing models) or `app` (future overlays),
 * neither of which is in the swap.
 */
export async function ricsRefresh(opts: RefreshOptions = {}): Promise<RefreshResult> {
  const finalSchema = opts.finalSchema ?? 'rics_mirror';
  const stagingSchema = opts.stagingSchema ?? 'rics_mirror_staging';
  const databaseUrl = opts.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');
  const progress = opts.onProgress ?? (() => {});

  const runId = randomUUID();
  const runStartMs = Date.now();
  const tables: CopyResult[] = [];

  // One staging dir per run — keeps concurrent runs (if anyone ever adds them)
  // from stomping on each other, and keeps CSVs isolated so cleanup is easy.
  const stagingDir = path.join(stagingRoot(), `run-${runId}`);
  ensureStagingDir(stagingDir);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    // Insert a "running" etl_run row so observers can see it in-flight.
    // This write is committed NOW (its own mini-txn) so a later rollback
    // of the main load doesn't erase the run record.
    await client.query(
      `INSERT INTO platform.etl_run (id, "startedAt", status, "totalRows", "tableCount")
       VALUES ($1, now(), 'running', 0, 0)`,
      [runId]
    );

    progress({ type: 'run-start', runId, mdbCount: CANONICAL_MDBS.length });

    await client.query('BEGIN');

    // Clean up any leftover staging schema from a previous failed run.
    await client.query(`DROP SCHEMA IF EXISTS "${stagingSchema}" CASCADE`);
    await client.query(`CREATE SCHEMA "${stagingSchema}"`);

    for (const mdb of CANONICAL_MDBS) {
      progress({ type: 'mdb-start', file: mdb.file });
      const mdbPath = ricsDbPath(mdb.file);
      // Password recovery reads the file header — requires the MDB to exist and be readable.
      // If the file is missing or unreadable, fail fast (the allowlist is wrong).
      let password: string;
      try {
        password = getOrRecoverPassword(mdbPath);
      } catch (err) {
        throw new Error(`Cannot open ${mdb.file} for password recovery: ${(err as Error).message}`);
      }

      for (const sourceTable of mdb.tables) {
        try {
          const result = await copyMdbTableToPostgres({
            mdbPath,
            mdbPassword: password,
            sourceTable,
            targetSchema: stagingSchema,
            pgClient: client,
            stagingDir,
          });
          tables.push(result);
          progress({ type: 'table-ok', file: mdb.file, result });
        } catch (err) {
          progress({ type: 'table-err', file: mdb.file, table: sourceTable, error: err as Error });
          throw err; // abort whole run; transaction rolls back
        }
      }
    }

    // Persist per-table audit rows inside the same transaction so the audit
    // and the mirror state commit or roll back together.
    for (const t of tables) {
      await client.query(
        `INSERT INTO platform.etl_run_table (id, "runId", "mdbFile", "sourceTable", "targetTable", "rowCount", "durationMs", status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ok')`,
        [
          randomUUID(),
          runId,
          findMdbFileFor(t.sourceTable),
          t.sourceTable,
          t.targetTable,
          t.rowCount,
          t.durationMs,
        ]
      );
    }

    // Atomic swap: drop old final, rename staging -> final.
    await client.query(`DROP SCHEMA IF EXISTS "${finalSchema}" CASCADE`);
    await client.query(`ALTER SCHEMA "${stagingSchema}" RENAME TO "${finalSchema}"`);
    progress({ type: 'swap', staging: stagingSchema, final: finalSchema });

    await client.query('COMMIT');

    // Post-swap phase: mirror `rics_mirror.inventory_master` → `app.sku`.
    // Separate transaction so a backfill failure does NOT invalidate the
    // mirror — the operator re-runs `pnpm sync:rics-skus` to heal.
    let skuBackfill: BackfillResult | undefined;
    let skuBackfillError: string | undefined;
    progress({ type: 'sku-backfill-start' });
    try {
      skuBackfill = await skuLifecycleBackfill({ pgClient: client, runId });
      progress({ type: 'sku-backfill-ok', result: skuBackfill });
    } catch (err) {
      const error = err as Error;
      skuBackfillError = error.message;
      progress({ type: 'sku-backfill-err', error });
    }

    const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);
    const durationMs = Date.now() - runStartMs;

    // Finalize the run summary row (outside txn; its initial insert was also
    // outside so we're consistent).
    await client.query(
      `UPDATE platform.etl_run SET "finishedAt" = now(), status = 'ok', "totalRows" = $1, "tableCount" = $2 WHERE id = $3`,
      [totalRows, tables.length, runId]
    );

    progress({ type: 'run-end', runId, status: 'ok', totalRows, totalMs: durationMs });
    return {
      runId,
      status: 'ok',
      totalRows,
      tableCount: tables.length,
      durationMs,
      tables,
      skuBackfill,
      skuBackfillError,
    };
  } catch (err) {
    // Roll back the mirror transaction. The etl_run row was inserted in its
    // own committed statement above, so it survives to record the failure.
    try { await client.query('ROLLBACK'); } catch {}
    const errorText = (err as Error).message;
    const durationMs = Date.now() - runStartMs;
    try {
      await client.query(
        `UPDATE platform.etl_run SET "finishedAt" = now(), status = 'failed', "errorText" = $1, "totalRows" = $2, "tableCount" = $3 WHERE id = $4`,
        [errorText, tables.reduce((s, t) => s + t.rowCount, 0), tables.length, runId]
      );
    } catch {
      // Best-effort; a failure here leaves the etl_run row in 'running' state.
    }
    progress({
      type: 'run-end',
      runId,
      status: 'failed',
      totalRows: tables.reduce((s, t) => s + t.rowCount, 0),
      totalMs: durationMs,
      errorText,
    });
    return {
      runId,
      status: 'failed',
      totalRows: tables.reduce((s, t) => s + t.rowCount, 0),
      tableCount: tables.length,
      durationMs,
      errorText,
      tables,
    };
  } finally {
    await client.end();
    // Clean up per-run staging dir. CSVs inside were removed as each COPY
    // finished; this drops the now-empty folder itself.
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch {}
  }
}

function findMdbFileFor(sourceTable: string): string {
  for (const mdb of CANONICAL_MDBS) {
    if (mdb.tables.includes(sourceTable)) return mdb.file;
  }
  return '';
}
