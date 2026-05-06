import { Client } from 'pg';
import {
  closeInventoryWeek,
  InventoryWeekCloseError,
} from '../../src/services/inventoryWeekCloseService';

interface Args {
  weekEndingDate: string | null;
  closedBy: string | null;
  dryRun: boolean;
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const args: Args = {
    weekEndingDate: null,
    closedBy: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--week-ending':
        args.weekEndingDate = String(argv[++i] ?? '').trim() || null;
        break;
      case '--closed-by':
        args.closedBy = String(argv[++i] ?? '').trim() || null;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--help':
      case '-h':
        printHelpAndExit(0);
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }

  if (!args.weekEndingDate) throw new Error('--week-ending YYYY-MM-DD is required');
  if (!args.closedBy) throw new Error('--closed-by <user> is required');

  return args;
}

function printHelpAndExit(code: number): never {
  console.log(
    [
      'Usage: close-week --week-ending YYYY-MM-DD --closed-by <user> [--dry-run]',
      '',
      'Closes one inventory week into the app-owned RICS-compatible trend slots:',
      '  - app.inventory_history_trend_week',
      '  - app.inventory_history_snapshot weekly counters',
      '',
      'Example:',
      '  node --env-file-if-exists=.env -r tsx/cjs scripts/inventory/close-week.ts --week-ending 2026-05-03 --closed-by zbendeck --dry-run',
    ].join('\n'),
  );
  process.exit(code);
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main(): Promise<void> {
  const args = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await closeInventoryWeek({
      pgClient: client,
      weekEndingDate: args.weekEndingDate!,
      closedBy: args.closedBy!,
      dryRun: args.dryRun,
    });

    console.log(
      `[inventory:close-week] ${result.status} run=${result.runId} ` +
        `week=${result.weekStartDate}..${result.weekEndingDate} ` +
        `snapshotAsOf=${result.snapshotAsOf.toISOString()} timezone=${result.companyTimeZone}`,
    );
    console.log(
      `[inventory:close-week] snapshots=${fmtNum(result.snapshotsScanned)} ` +
        `trendRows=${fmtNum(result.trendRowsWritten)} snapshotsUpdated=${fmtNum(result.snapshotsUpdated)}`,
    );
    console.log(
      `[inventory:close-week] weekQty=${fmtNum(result.totalWeekQtySales)} ` +
        `netSales=${fmtMoney(result.totalWeekNetSales)} profit=${fmtMoney(result.totalWeekProfit)}`,
    );
    console.log(
      `[inventory:close-week] validation unpromotedPosTickets=${fmtNum(result.validation.unpromotedPosTickets)} ` +
        `weekSalesMismatches=${fmtNum(result.validation.weekSalesMismatchCount)} ` +
        `weekSalesMismatchQtyAbs=${fmtNum(result.validation.weekSalesMismatchQtyAbs)}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  const prefix = err instanceof InventoryWeekCloseError
    ? `[inventory:close-week] FAILED ${err.code}`
    : '[inventory:close-week] FAILED';
  console.error(`${prefix} - ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
