/**
 * Probe RIINVHIS for non-zero rows so we can understand the semantics of the
 * LYMonthQtyOH_NN / LYMonthOnHand_NN / LastMonthOnHand columns.
 *
 * Run with:  pnpm --filter @benlow-rics/api tsx scripts/probe-invhis.ts
 */

import fs from 'node:fs';
import {
  ricsDbPath,
  getOrRecoverPassword,
  runPowerShellJson,
  buildSelectScript,
} from '../src/services/accessOleDb';

function probe(sql: string) {
  const dbPath = ricsDbPath('RIINVHIS.MDB');
  if (!fs.existsSync(dbPath)) {
    console.log('not found');
    return;
  }
  const password = getOrRecoverPassword(dbPath);
  try {
    const raw = runPowerShellJson<any>(buildSelectScript(dbPath, password, sql));
    const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
    console.log(`  --> ${rows.length} rows`);
    for (const r of rows.slice(0, 5)) console.log('    ', JSON.stringify(r));
  } catch (err: any) {
    console.log('  ERROR:', err.message);
  }
}

async function main() {
  console.log('\n# stores present in InvHis');
  probe(`SELECT TOP 20 Store, COUNT(*) AS N FROM InvHis GROUP BY Store ORDER BY Store`);

  console.log('\n# sample SKU with non-zero LYMonthQtyOH_01');
  probe(`SELECT TOP 3 SKU, Store, LastMonthOnHand, LastYearOnHand, LYMonthQtyOH_01, LYMonthQtyOH_02, LYMonthQtyOH_03, LYMonthQtyOH_04, LYMonthQtyOH_05, LYMonthQtyOH_06, LYMonthQtyOH_07, LYMonthQtyOH_08, LYMonthQtyOH_09, LYMonthQtyOH_10, LYMonthQtyOH_11, LYMonthQtyOH_12, AverageCost FROM InvHis WHERE LYMonthQtyOH_01 > 0 OR LYMonthQtyOH_06 > 0 OR LYMonthQtyOH_12 > 0`);

  console.log('\n# sample SKU with non-zero LYMonthOnHand (value)');
  probe(`SELECT TOP 3 SKU, Store, LYMonthOnHand_01, LYMonthOnHand_06, LYMonthOnHand_12, LYMonthQtyOH_01, LYMonthQtyOH_06, LYMonthQtyOH_12, AverageCost FROM InvHis WHERE LYMonthOnHand_06 > 0`);

  console.log('\n# compare LY month sales with LY month qty sales (for one SKU with data)');
  probe(`SELECT TOP 3 SKU, Store, LYMonthQtySales_01, LYMonthQtySales_06, LYMonthQtySales_12, LYMonthDolSales_01, LYMonthDolSales_06, LYMonthDolSales_12 FROM InvHis WHERE LYMonthQtySales_06 > 0`);

  console.log('\n# DateLastChanged range — when was history last updated?');
  probe(`SELECT TOP 3 MAX(DateLastChanged) AS MaxChanged, MIN(DateLastChanged) AS MinChanged, COUNT(*) AS N FROM InvHis WHERE DateLastChanged IS NOT NULL`);

  console.log('\n# count of rows with any LYMonthQtyOH non-zero');
  probe(`SELECT COUNT(*) AS N FROM InvHis WHERE LYMonthQtyOH_01 <> 0 OR LYMonthQtyOH_02 <> 0 OR LYMonthQtyOH_03 <> 0 OR LYMonthQtyOH_04 <> 0 OR LYMonthQtyOH_05 <> 0 OR LYMonthQtyOH_06 <> 0 OR LYMonthQtyOH_07 <> 0 OR LYMonthQtyOH_08 <> 0 OR LYMonthQtyOH_09 <> 0 OR LYMonthQtyOH_10 <> 0 OR LYMonthQtyOH_11 <> 0 OR LYMonthQtyOH_12 <> 0`);

  console.log('\n# total on hand across stores (current)');
  probe(`SELECT COUNT(*) AS NSkus, SUM(OnHand) AS TotalOnHand FROM InvHis WHERE OnHand > 0`);

  console.log('\n# AverageCost distribution');
  probe(`SELECT COUNT(*) AS N, SUM(IIF(AverageCost > 0, 1, 0)) AS NWithCost FROM InvHis`);
}

main().catch((err) => { console.error(err); process.exit(1); });
