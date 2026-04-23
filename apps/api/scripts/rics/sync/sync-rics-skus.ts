/**
 * Standalone runner for the `app.sku` backfill from `rics_mirror.inventory_master`.
 *
 *   pnpm --filter @benlow-rics/api sync:rics-skus
 *
 * Useful when:
 *   - The main `sync:rics` mirror load succeeded but the backfill failed
 *     (re-run heals `app.sku` without re-loading the MDBs).
 *   - You want to apply category-family remapping or other source-side changes
 *     without a full MDB reload.
 *
 * Idempotent. Touches only rows with `source='rics'`; operator-created rows
 * (`source='app'`) are never mutated. See docs/operations/sku-lifecycle-backfill.md.
 */
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { skuLifecycleBackfill } from '../../../src/services/sync/skuLifecycleBackfill';

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');

  const runId = randomUUID();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    console.log(`[sync:rics-skus] starting run ${runId}`);
    const result = await skuLifecycleBackfill({ pgClient: client, runId });
    console.log(
      `[sync:rics-skus] OK — inserted=${fmtNum(result.inserted)} updated=${fmtNum(result.updated)} ` +
        `reactivated=${fmtNum(result.reactivated)} discontinued=${fmtNum(result.discontinued)} ` +
        `operatorCollisions=${result.operatorCollisions} in ${fmtDuration(result.durationMs)}`,
    );
    if (result.operatorCollisionCodes.length > 0) {
      console.warn(
        `[sync:rics-skus] operator-row collisions (first 10): ${result.operatorCollisionCodes.slice(0, 10).join(', ')}`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[sync:rics-skus] FAILED — ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
