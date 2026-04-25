/**
 * Import replenishment target cells from `rics_mirror.inventory_quantities`
 * into the app-owned `app.replenishment_target` table.
 *
 *   pnpm --filter @benlow-rics/api sync:rics-replenishment-targets
 *
 * This import is repeatable:
 *   - previously imported rows tagged with
 *     `updated_by = migration:sync-rics-replenishment-targets` are replaced
 *   - app-edited rows are preserved
 */
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { replenishmentTargetBackfill } from '../../../src/services/sync/replenishmentTargetBackfill';

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
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');

  const runId = randomUUID();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log(`[sync:rics-replenishment-targets] starting run ${runId}`);
    const result = await replenishmentTargetBackfill({ pgClient: client, runId });
    console.log(
      `[sync:rics-replenishment-targets] OK - mirrorRows=${fmtNum(result.mirrorRowsRead)} ` +
        `preparedRows=${fmtNum(result.targetRowsPrepared)} ` +
        `replacedRows=${fmtNum(result.replacedRows)} ` +
        `importedRows=${fmtNum(result.importedRows)} ` +
        `in ${fmtDuration(result.durationMs)}`,
    );

    if (result.skippedMissingSkuRows > 0) {
      console.warn(
        `[sync:rics-replenishment-targets] skipped ${fmtNum(result.skippedMissingSkuRows)} row(s) ` +
          `for mirrored SKU(s) missing in app.sku. First 10: ${result.missingSkuCodes.slice(0, 10).join(', ')}`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[sync:rics-replenishment-targets] FAILED - ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
