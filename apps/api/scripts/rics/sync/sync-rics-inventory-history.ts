/**
 * Rebuild the owned inventory-history parity tables from `InvHis`.
 *
 * Intended mainly for older local environments that still have a mirror-style
 * source table. The preferred rehearsal path is the CSV artifact importer.
 */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { inventoryHistoryBackfill } from '../../../src/services/sync/inventoryHistoryBackfill';

interface Args {
  asOf: Date | null;
}

function parseArgs(): Args {
  const args: Args = { asOf: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--':
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
      case '--help':
      case '-h':
        printHelpAndExit(0);
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return args;
}

function printHelpAndExit(code: number): never {
  console.log(
    [
      'Usage: sync-rics-inventory-history [--as-of YYYY-MM-DD]',
      '',
      'Promotes the source InvHis table into:',
      '  - app.inventory_history_snapshot',
      '  - app.inventory_history_month',
      '  - app.inventory_history_trend_week',
      '  - app.inventory_history_movement_bucket',
      '',
      'Preferred rehearsal path: import-app-inventory-history-from-artifact.',
    ].join('\n'),
  );
  process.exit(code);
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

  const runId = randomUUID();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log(`[sync:rics-inventory-history] starting run ${runId}`);
    const result = await inventoryHistoryBackfill({
      pgClient: client,
      runId,
      snapshotAsOf: args.asOf ?? new Date(),
    });

    console.log(
      `[sync:rics-inventory-history] OK - sourceRows=${fmtNum(result.sourceRowsRead)} ` +
        `eligible=${fmtNum(result.eligibleRows)} ` +
        `snapshots=${fmtNum(result.importedSnapshots)} ` +
        `months=${fmtNum(result.importedMonths)} ` +
        `trendWeeks=${fmtNum(result.importedTrendWeeks)} ` +
        `movementBuckets=${fmtNum(result.importedMovementBuckets)} ` +
        `in ${fmtDuration(result.durationMs)}`,
    );

    if (result.unresolvedSkuRows > 0) {
      console.warn(
        `[sync:rics-inventory-history] unresolved sku links=${fmtNum(result.unresolvedSkuRows)} ` +
          `(first ${Math.min(10, result.unresolvedSkuCodes.length)}: ${result.unresolvedSkuCodes.join(', ') || 'none'})`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[sync:rics-inventory-history] FAILED - ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
