/**
 * Import historical inventory movement rows from `rics_mirror.inv_changes`
 * into the app-owned `app.stock_movement` ledger.
 *
 *   pnpm --filter @benlow-rics/api sync:rics-stock-movements
 *
 * This import is repeatable:
 *   - previously imported `RICS_INV_CHANGE` rows are replaced on each run
 *   - app-native movement rows (manual receipts, future returns/transfers) are
 *     left untouched
 *
 * Important: these imported legacy rows are reporting history only. The
 * current `app.stock_level` rebuild seeds from the mirrored on-hand snapshot
 * and does not replay `RICS_INV_CHANGE` rows, otherwise the snapshot would be
 * double-counted.
 */
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { stockMovementBackfill } from '../../../src/services/sync/stockMovementBackfill';

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
    console.log(`[sync:rics-stock-movements] starting run ${runId}`);
    const result = await stockMovementBackfill({ pgClient: client, runId });
    console.log(
      `[sync:rics-stock-movements] OK - mirrorRows=${fmtNum(result.mirrorRowsRead)} ` +
        `eligibleRows=${fmtNum(result.eligibleRows)} ` +
        `replacedRows=${fmtNum(result.replacedRows)} ` +
        `importedRows=${fmtNum(result.importedRows)} ` +
        `in ${fmtDuration(result.durationMs)}`,
    );

    const importedTypes = Object.entries(result.importedByType)
      .map(([movementType, count]) => `${movementType}=${fmtNum(count)}`)
      .join(', ');
    if (importedTypes) {
      console.log(`[sync:rics-stock-movements] importedByType ${importedTypes}`);
    }

    if (result.skippedMissingSkuRows > 0) {
      console.warn(
        `[sync:rics-stock-movements] skipped ${fmtNum(result.skippedMissingSkuRows)} row(s) ` +
          `for mirrored SKU(s) missing in app.sku. First 10: ${result.missingSkuCodes.join(', ')}`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[sync:rics-stock-movements] FAILED - ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
