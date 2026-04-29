import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { nativePurchaseOrderBackfill } from '../../../src/services/sync/nativePurchaseOrderBackfill';
import {
  fmtDuration,
  fmtNum,
  loadManifest,
  requireTable,
  stageTable,
} from './artifactManifest';
import { quoteIdent } from '../../../src/services/sync/typeMapping';

interface Args {
  manifestPath: string | null;
}

function parseArgs(): Args {
  const args: Args = { manifestPath: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--':
        break;
      case '--manifest':
        args.manifestPath = String(argv[++i] ?? '').trim() || null;
        break;
      case '--help':
      case '-h':
        printHelpAndExit(0);
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }

  if (!args.manifestPath) {
    throw new Error('--manifest <path> is required');
  }
  return args;
}

function printHelpAndExit(code: number): never {
  console.log(
    [
      'Usage: import-native-purchase-orders-from-artifact --manifest <path>',
      '',
      'Stages purchase_master.csv and purchase_detail.csv into temp tables and rebuilds:',
      '  - app.purchase_order',
      '  - app.purchase_order_line',
      '  - app.purchase_order_line_size_cell',
      '  - app.po_status_history',
      '',
      'This is a bulk native purchase-order rebuild. It does not write to rics_mirror.',
    ].join('\n'),
  );
  process.exit(code);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');

  const { manifest, manifestDir } = loadManifest(args.manifestPath!);
  const purchaseMaster = requireTable(manifest, 'purchase_master');
  const purchaseDetail = requireTable(manifest, 'purchase_detail');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log('========================================');
    console.log('  import:native-purchase-orders-from-artifact');
    console.log('========================================');
    console.log(`manifest : ${args.manifestPath}`);
    console.log('----------------------------------------');

    console.log(`[1/3] staging ${purchaseMaster.targetTable}...`);
    const purchaseMasterTable = await stageTable(client, manifestDir, purchaseMaster);
    console.log(`      loaded ${fmtNum(purchaseMaster.rowCount)} rows into ${purchaseMasterTable}`);
    await client.query(`ANALYZE ${quoteIdent(purchaseMasterTable)}`);

    console.log(`[2/3] staging ${purchaseDetail.targetTable}...`);
    const purchaseDetailTable = await stageTable(client, manifestDir, purchaseDetail);
    console.log(`      loaded ${fmtNum(purchaseDetail.rowCount)} rows into ${purchaseDetailTable}`);
    await client.query(`ANALYZE ${quoteIdent(purchaseDetailTable)}`);

    console.log('[3/3] rebuilding native purchase orders in bulk...');
    const result = await nativePurchaseOrderBackfill({
      pgClient: client,
      runId: randomUUID(),
      sourceTables: {
        purchaseMaster: purchaseMasterTable,
        purchaseDetail: purchaseDetailTable,
      },
    });

    console.log('----------------------------------------');
    console.log(`headers read       : ${fmtNum(result.headerRowsRead)}`);
    console.log(`headers imported   : ${fmtNum(result.headerRowsImported)}`);
    console.log(`detail rows read   : ${fmtNum(result.detailRowsRead)}`);
    console.log(`detail rows used   : ${fmtNum(result.detailRowsPrepared)}`);
    console.log(`lines imported     : ${fmtNum(result.lineRowsImported)}`);
    console.log(`size cells imported: ${fmtNum(result.sizeCellRowsImported)}`);
    console.log(`status history rows: ${fmtNum(result.statusHistoryRowsImported)}`);
    if (result.unresolvedSkuRows > 0) {
      console.warn(
        `unresolved sku rows: ${fmtNum(result.unresolvedSkuRows)} ` +
          `(first ${Math.min(20, result.unresolvedSkuCodes.length)}: ${
            result.unresolvedSkuCodes.join(', ') || 'none'
          })`,
      );
    }
    if (result.validationPo256120.found) {
      console.log(
        `PO 256120          : status=${result.validationPo256120.status} ` +
          `ordered=${fmtNum(result.validationPo256120.quantityOrdered)} ` +
          `received=${fmtNum(result.validationPo256120.quantityReceived)} ` +
          `lines=${fmtNum(result.validationPo256120.lineCount)}`,
      );
    } else {
      console.warn('PO 256120          : not found after import');
    }
    console.log(`complete           : ${fmtDuration(result.durationMs)}`);
    console.log('========================================');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[import:native-purchase-orders-from-artifact] FAILED - ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
