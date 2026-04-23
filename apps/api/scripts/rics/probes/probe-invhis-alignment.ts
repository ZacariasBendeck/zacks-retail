/**
 * Cross-check LYMonthQtySales_NN vs TicketDetail.Extension by month-of-year
 * to determine whether NN is a calendar-month index or a rolling-offset index.
 *
 * If NN == calendar month (01=Jan..12=Dec), then the sum of
 *   LYMonthDolSales_NN for one store
 * should match:
 *   SUM(TicketDetail.Extension) where Month(RealDate) == NN AND Year == (current_year - 1)
 *
 * Run with:  npx tsx scripts/probe-invhis-alignment.ts
 */

import fs from 'node:fs';
import {
  ricsDbPath,
  getOrRecoverPassword,
  runPowerShellJson,
  buildSelectScript,
} from '../src/services/accessOleDb';

function probe(dbPath: string, sql: string): any[] {
  if (!fs.existsSync(dbPath)) {
    console.log(`  (${dbPath} not found)`);
    return [];
  }
  const password = getOrRecoverPassword(dbPath);
  const raw = runPowerShellJson<any>(buildSelectScript(dbPath, password, sql));
  const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return rows;
}

async function main() {
  const hisDb = ricsDbPath('RIINVHIS.MDB');
  const salesDb = ricsDbPath('RITRNSSV.MDB');

  // Pick store 16 and sum LYMonthDolSales by NN.
  console.log('\n## RIINVHIS sum of LYMonthDolSales_NN for Store=16 (trailing 12 totals)');
  const sums = probe(hisDb, `SELECT
    SUM(LYMonthDolSales_01) AS M01, SUM(LYMonthDolSales_02) AS M02, SUM(LYMonthDolSales_03) AS M03,
    SUM(LYMonthDolSales_04) AS M04, SUM(LYMonthDolSales_05) AS M05, SUM(LYMonthDolSales_06) AS M06,
    SUM(LYMonthDolSales_07) AS M07, SUM(LYMonthDolSales_08) AS M08, SUM(LYMonthDolSales_09) AS M09,
    SUM(LYMonthDolSales_10) AS M10, SUM(LYMonthDolSales_11) AS M11, SUM(LYMonthDolSales_12) AS M12
    FROM InvHis WHERE Store = 16`);
  for (const row of sums) console.log('   ', JSON.stringify(row));

  // Compare against TicketDetail in 2025 (likely "last year" from ~Apr 2026).
  console.log('\n## RITRNSSV sum of Extension by month for Store=16 in 2025');
  const sales2025 = probe(salesDb, `SELECT Month(h.RealDate) AS M, SUM(d.Extension) AS Net, SUM(d.Qty) AS Q
    FROM TicketHeader h INNER JOIN TicketDetail d
      ON h.UserID = d.UserID AND h.BatchDate = d.BatchDate AND h.Terminal = d.Terminal
      AND h.Store = d.Store AND h.Ticket = d.Ticket AND h.RealDate = d.RealDate
    WHERE h.Store = 16 AND h.TransType = 1 AND h.Voided = False
      AND h.RealDate >= #1/1/2025# AND h.RealDate < #1/1/2026#
    GROUP BY Month(h.RealDate) ORDER BY Month(h.RealDate)`);
  for (const row of sales2025) console.log('   ', JSON.stringify(row));

  console.log('\n## RITRNSSV sum of Extension by month for Store=16 in 2024');
  const sales2024 = probe(salesDb, `SELECT Month(h.RealDate) AS M, SUM(d.Extension) AS Net
    FROM TicketHeader h INNER JOIN TicketDetail d
      ON h.UserID = d.UserID AND h.BatchDate = d.BatchDate AND h.Terminal = d.Terminal
      AND h.Store = d.Store AND h.Ticket = d.Ticket AND h.RealDate = d.RealDate
    WHERE h.Store = 16 AND h.TransType = 1 AND h.Voided = False
      AND h.RealDate >= #1/1/2024# AND h.RealDate < #1/1/2025#
    GROUP BY Month(h.RealDate) ORDER BY Month(h.RealDate)`);
  for (const row of sales2024) console.log('   ', JSON.stringify(row));

  // Also look at the trailing 12 months ending at a recent month to see if
  // it aligns with rolling-offset semantics.
  console.log('\n## RITRNSSV trailing 12 by month (Store=16), from 2025-04-01 to 2026-04-01');
  const trailing = probe(salesDb, `SELECT Year(h.RealDate) AS Y, Month(h.RealDate) AS M, SUM(d.Extension) AS Net
    FROM TicketHeader h INNER JOIN TicketDetail d
      ON h.UserID = d.UserID AND h.BatchDate = d.BatchDate AND h.Terminal = d.Terminal
      AND h.Store = d.Store AND h.Ticket = d.Ticket AND h.RealDate = d.RealDate
    WHERE h.Store = 16 AND h.TransType = 1 AND h.Voided = False
      AND h.RealDate >= #5/1/2025# AND h.RealDate < #5/1/2026#
    GROUP BY Year(h.RealDate), Month(h.RealDate) ORDER BY Year(h.RealDate), Month(h.RealDate)`);
  for (const row of trailing) console.log('   ', JSON.stringify(row));
}

main().catch((err) => { console.error(err); process.exit(1); });
