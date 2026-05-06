import { Client } from 'pg';
import {
  closeInventoryMonth,
  InventoryMonthCloseError,
} from '../../src/services/inventoryMonthCloseService';

interface Args {
  closeMonth: string | null;
  closedBy: string | null;
  dryRun: boolean;
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const args: Args = {
    closeMonth: null,
    closedBy: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--month':
        args.closeMonth = String(argv[++i] ?? '').trim() || null;
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

  if (!args.closeMonth) throw new Error('--month YYYY-MM is required');
  if (!args.closedBy) throw new Error('--closed-by <user> is required');

  return args;
}

function printHelpAndExit(code: number): never {
  console.log(
    [
      'Usage: close-month --month YYYY-MM --closed-by <user> [--dry-run]',
      '',
      'Closes one inventory calendar month into the app-owned RICS-compatible history tables:',
      '  - app.inventory_history_snapshot',
      '  - app.inventory_history_month',
      '  - app.inventory_sales_cell',
      '',
      'Example:',
      '  node --env-file-if-exists=.env -r tsx/cjs scripts/inventory/close-month.ts --month 2026-04 --closed-by zbendeck --dry-run',
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
    const result = await closeInventoryMonth({
      pgClient: client,
      closeMonth: args.closeMonth!,
      closedBy: args.closedBy!,
      dryRun: args.dryRun,
    });

    console.log(
      `[inventory:close-month] ${result.status} run=${result.runId} month=${result.closeMonth} ` +
        `slot=${result.targetSlot} snapshotAsOf=${result.snapshotAsOf.toISOString()} ` +
        `timezone=${result.companyTimeZone}`,
    );
    console.log(
      `[inventory:close-month] snapshots=${fmtNum(result.snapshotsScanned)} ` +
        `months=${fmtNum(result.monthsUpserted)} snapshotsUpdated=${fmtNum(result.snapshotsUpdated)} ` +
        `mtdCellsReset=${fmtNum(result.salesCellsReset)}`,
    );
    console.log(
      `[inventory:close-month] monthQty=${fmtNum(result.totalQtySales)} ` +
        `netSales=${fmtMoney(result.totalNetSales)} profit=${fmtMoney(result.totalProfit)} ` +
        `inventoryValue=${fmtMoney(result.inventoryValueTotal)}`,
    );
    console.log(
      `[inventory:close-month] validation unpromotedPosTickets=${fmtNum(result.validation.unpromotedPosTickets)} ` +
        `salesCellMismatches=${fmtNum(result.validation.salesCellMismatchCount)} ` +
        `salesCellMismatchQtyAbs=${fmtNum(result.validation.salesCellMismatchQtyAbs)}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  const prefix = err instanceof InventoryMonthCloseError
    ? `[inventory:close-month] FAILED ${err.code}`
    : '[inventory:close-month] FAILED';
  console.error(`${prefix} - ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
