/**
 * Rebuild `app.stock_level` from the mirrored RICS stock snapshot plus the
 * app-owned `app.stock_movement` ledger.
 *
 *   pnpm --filter @benlow-rics/api sync:rics-stock-levels
 *
 * Intended use:
 *   - after `sync:rics` + `sync:rics-skus`, to promote baseline stock into the
 *     app-owned read model
 *   - during rehearsal or migration-day dry runs, to deterministically rebuild
 *     the stock projection without losing app-side receipts/adjustments already
 *     captured in `app.stock_movement`
 */
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { stockLevelBackfill } from '../../../src/services/sync/stockLevelBackfill';

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
    console.log(`[sync:rics-stock-levels] starting run ${runId}`);
    const result = await stockLevelBackfill({ pgClient: client, runId });
    console.log(
      `[sync:rics-stock-levels] OK - mirrorRows=${fmtNum(result.mirrorRowsRead)} ` +
        `baselineCells=${fmtNum(result.baselineCells)} ` +
        `movementRows=${fmtNum(result.movementRowsReplayed)} ` +
        `projectionRows=${fmtNum(result.projectionRowsWritten)} ` +
        `in ${fmtDuration(result.durationMs)}`,
    );

    if (result.missingSkuCodes.length > 0) {
      console.warn(
        `[sync:rics-stock-levels] missing app.sku rows for ${result.missingSkuCodes.length} mirrored SKU(s). ` +
          `First 10: ${result.missingSkuCodes.slice(0, 10).join(', ')}`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[sync:rics-stock-levels] FAILED - ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
