import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { legacyReferenceBackfill } from '../../../src/services/sync/legacyReferenceBackfill';
import {
  fmtDuration,
  fmtNum,
  loadManifest,
  requireTable,
  stageTable,
  type ArtifactManifest,
} from './artifactManifest';

interface Args {
  manifestPath: string | null;
}

const REQUIRED_TABLES = [
  'vendor_master',
  'vendor_accounts',
  'store_master',
  'upc_cross_reference',
  'case_packs',
  'case_pack_qtys',
  'future_price_changes',
  'purchase_master',
  'purchase_detail',
  'asn_carton_head',
  'asn_carton_det',
  'inv_transfers',
] as const;

type RequiredTableName = (typeof REQUIRED_TABLES)[number];

function parseArgs(): Args {
  const args: Args = { manifestPath: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
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
      'Usage: import-app-reference-baselines-from-artifact --manifest <path>',
      '',
      'Stages the legacy reference-baseline CSVs into temp tables and rebuilds:',
      '  - app.vendor, app.vendor_store_account',
      '  - app.store_master',
      '  - app.sku_upc',
      '  - app.case_pack, app.case_pack_cell',
      '  - app.future_price_change',
      '  - app.purchase_order_legacy, app.purchase_order_legacy_line',
      '  - app.asn_carton_legacy, app.asn_carton_legacy_line',
      '  - app.transfer_legacy_summary',
      '',
      'No persistent writes land in rics_mirror.',
    ].join('\n'),
  );
  process.exit(code);
}

async function stageRequiredTables(
  client: Client,
  manifest: ArtifactManifest,
  manifestDir: string,
): Promise<Record<RequiredTableName, string>> {
  const staged = {} as Record<RequiredTableName, string>;
  for (const targetTable of REQUIRED_TABLES) {
    const table = requireTable(manifest, targetTable);
    staged[targetTable] = await stageTable(client, manifestDir, table);
    console.log(
      `[import:app-reference-baselines-from-artifact] staged ${targetTable} ` +
        `rows=${fmtNum(table.rowCount)} as ${staged[targetTable]}`,
    );
  }
  return staged;
}

function logMissing(prefix: string, label: string, count: number, codes: string[]): void {
  if (count === 0) return;
  console.warn(
    `${prefix} ${label} unresolved app.sku rows=${fmtNum(count)} ` +
      `(first ${Math.min(10, codes.length)}: ${codes.join(', ') || 'none'})`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');

  const { manifest, manifestDir } = loadManifest(args.manifestPath!);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const staged = await stageRequiredTables(client, manifest, manifestDir);
    const runId = randomUUID();
    const result = await legacyReferenceBackfill({
      pgClient: client,
      runId,
      sourceTables: {
        vendorMaster: staged.vendor_master,
        vendorAccounts: staged.vendor_accounts,
        storeMaster: staged.store_master,
        upcCrossReference: staged.upc_cross_reference,
        casePacks: staged.case_packs,
        casePackQtys: staged.case_pack_qtys,
        futurePriceChanges: staged.future_price_changes,
        purchaseMaster: staged.purchase_master,
        purchaseDetail: staged.purchase_detail,
        asnCartonHead: staged.asn_carton_head,
        asnCartonDet: staged.asn_carton_det,
        inventoryTransfers: staged.inv_transfers,
      },
    });

    console.log(
      `[import:app-reference-baselines-from-artifact] vendors OK - vendorRows=${fmtNum(result.vendors.vendorRowsImported)} ` +
        `storeAccounts=${fmtNum(result.vendors.accountRowsImported)} ` +
        `orphanAccounts=${fmtNum(result.vendors.orphanAccountRows)}`,
    );
    console.log(
      `[import:app-reference-baselines-from-artifact] stores OK - imported=${fmtNum(result.stores.importedRows)}`,
    );
    console.log(
      `[import:app-reference-baselines-from-artifact] skuUpc OK - imported=${fmtNum(result.skuUpcs.importedRows)}`,
    );
    console.log(
      `[import:app-reference-baselines-from-artifact] casePacks OK - headers=${fmtNum(result.casePacks.headerRowsImported)} ` +
        `cells=${fmtNum(result.casePacks.cellRowsImported)}`,
    );
    console.log(
      `[import:app-reference-baselines-from-artifact] futurePriceChanges OK - imported=${fmtNum(result.futurePriceChanges.importedRows)}`,
    );
    console.log(
      `[import:app-reference-baselines-from-artifact] purchaseLegacy OK - poHeaders=${fmtNum(result.purchaseLegacy.headerRowsImported)} ` +
        `poLines=${fmtNum(result.purchaseLegacy.lineRowsImported)} ` +
        `asnHeaders=${fmtNum(result.purchaseLegacy.asnHeaderRowsImported)} ` +
        `asnLines=${fmtNum(result.purchaseLegacy.asnLineRowsImported)}`,
    );
    console.log(
      `[import:app-reference-baselines-from-artifact] transferLegacy OK - imported=${fmtNum(result.transferLegacy.importedRows)}`,
    );
    console.log(
      `[import:app-reference-baselines-from-artifact] complete in ${fmtDuration(result.durationMs)}`,
    );

    logMissing(
      '[import:app-reference-baselines-from-artifact]',
      'sku_upc',
      result.skuUpcs.unresolvedSkuRows,
      result.skuUpcs.unresolvedSkuCodes,
    );
    logMissing(
      '[import:app-reference-baselines-from-artifact]',
      'future_price_change',
      result.futurePriceChanges.unresolvedSkuRows,
      result.futurePriceChanges.unresolvedSkuCodes,
    );
    logMissing(
      '[import:app-reference-baselines-from-artifact]',
      'purchase_order_legacy_line',
      result.purchaseLegacy.lineUnresolvedSkuRows,
      result.purchaseLegacy.lineUnresolvedSkuCodes,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[import:app-reference-baselines-from-artifact] FAILED - ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
