/**
 * Promote the remaining MDB-derived reference / legacy baseline tables from
 * rics_mirror into app.* in one repeatable pass.
 *
 *   pnpm --filter @benlow-rics/api sync:rics-reference-baselines
 *
 * Intended use:
 *   - after `sync:rics` and `sync:rics-skus`
 *   - during rehearsal loops when vendor/store/UPC/case-pack/future-price and
 *     purchasing baselines need to be rebuilt deterministically
 */
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { legacyReferenceBackfill } from '../../../src/services/sync/legacyReferenceBackfill';

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

function logMissing(prefix: string, label: string, count: number, codes: string[]): void {
  if (count === 0) return;
  console.warn(
    `${prefix} ${label} unresolved app.sku rows=${fmtNum(count)} ` +
      `(first ${Math.min(10, codes.length)}: ${codes.join(', ') || 'none'})`,
  );
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');

  const runId = randomUUID();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log(`[sync:rics-reference-baselines] starting run ${runId}`);
    const result = await legacyReferenceBackfill({ pgClient: client, runId });

    console.log(
      `[sync:rics-reference-baselines] vendors OK - vendorRows=${fmtNum(result.vendors.vendorRowsImported)} ` +
        `storeAccounts=${fmtNum(result.vendors.accountRowsImported)} ` +
        `orphanAccounts=${fmtNum(result.vendors.orphanAccountRows)}`,
    );
    console.log(
      `[sync:rics-reference-baselines] stores OK - imported=${fmtNum(result.stores.importedRows)}`,
    );
    console.log(
      `[sync:rics-reference-baselines] skuUpc OK - imported=${fmtNum(result.skuUpcs.importedRows)}`,
    );
    console.log(
      `[sync:rics-reference-baselines] casePacks OK - headers=${fmtNum(result.casePacks.headerRowsImported)} ` +
        `cells=${fmtNum(result.casePacks.cellRowsImported)}`,
    );
    console.log(
      `[sync:rics-reference-baselines] futurePriceChanges OK - imported=${fmtNum(result.futurePriceChanges.importedRows)}`,
    );
    console.log(
      `[sync:rics-reference-baselines] purchaseLegacy OK - poHeaders=${fmtNum(result.purchaseLegacy.headerRowsImported)} ` +
        `poLines=${fmtNum(result.purchaseLegacy.lineRowsImported)} ` +
        `asnHeaders=${fmtNum(result.purchaseLegacy.asnHeaderRowsImported)} ` +
        `asnLines=${fmtNum(result.purchaseLegacy.asnLineRowsImported)}`,
    );
    console.log(
      `[sync:rics-reference-baselines] transferLegacy OK - imported=${fmtNum(result.transferLegacy.importedRows)}`,
    );
    console.log(
      `[sync:rics-reference-baselines] complete in ${fmtDuration(result.durationMs)}`,
    );

    logMissing(
      '[sync:rics-reference-baselines]',
      'sku_upc',
      result.skuUpcs.unresolvedSkuRows,
      result.skuUpcs.unresolvedSkuCodes,
    );
    logMissing(
      '[sync:rics-reference-baselines]',
      'future_price_change',
      result.futurePriceChanges.unresolvedSkuRows,
      result.futurePriceChanges.unresolvedSkuCodes,
    );
    logMissing(
      '[sync:rics-reference-baselines]',
      'purchase_order_legacy_line',
      result.purchaseLegacy.lineUnresolvedSkuRows,
      result.purchaseLegacy.lineUnresolvedSkuCodes,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[sync:rics-reference-baselines] FAILED - ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
