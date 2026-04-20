/**
 * Per-SKU sales rollup for the Inventory Inquiry screen (RICS Ch. 4 p. 75).
 *
 * Reports four sliding windows — Week / Month / Season / Year — each with
 * Qty, Net Sales and Profit. One PowerShell round-trip per SKU: a single
 * aggregate query with conditional SUMs keyed off `h.RealDate`.
 *
 * Window semantics match typical retail conventions:
 *   - Week   = last 7 days ending today (inclusive)
 *   - Month  = calendar month to date (1st → today)
 *   - Season = Spring (Feb 1 → Jul 31) or Fall (Aug 1 → Jan 31) to date
 *   - Year   = calendar year to date (Jan 1 → today)
 *
 * The Markdown column (present in the RICS inquiry rollup panel) is not
 * filled from TicketDetail because `d.Extension` is already the net amount
 * after any markdown that was applied at sale time. Pricing original-retail
 * vs. sale-price requires a per-line pricing history we don't have in
 * Phase 1; markdown is left at 0 for every window.
 */

import fs from 'node:fs';
import { ricsDbPath, getOrRecoverPassword, runPowerShellJson, buildSelectScript } from '../accessOleDb';
import type { InquiryRollup, InquiryRollupCell } from '../ricsInventoryAdapter';

const SALES_MDB = (): string =>
  ricsDbPath(process.env.RICS_SALES_DB_FILE || 'RITRNSSV.MDB');

function accessDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}/${day}/${d.getFullYear()}`;
}

function dayAfter(d: Date): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + 1);
  return copy;
}

interface RollupWindows {
  weekStart: Date;
  monthStart: Date;
  seasonStart: Date;
  yearStart: Date;
  endExclusive: Date;
}

function resolveWindows(today: Date): RollupWindows {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const weekStart = new Date(t);
  weekStart.setDate(weekStart.getDate() - 6);

  const monthStart = new Date(t.getFullYear(), t.getMonth(), 1);

  // Spring season: Feb 1 – Jul 31. Fall season: Aug 1 – Jan 31 (crosses year).
  const month = t.getMonth() + 1;
  let seasonStart: Date;
  if (month >= 2 && month <= 7) {
    seasonStart = new Date(t.getFullYear(), 1, 1); // Feb 1 (month index 1)
  } else if (month >= 8) {
    seasonStart = new Date(t.getFullYear(), 7, 1); // Aug 1
  } else {
    // Jan — Fall season started the previous August.
    seasonStart = new Date(t.getFullYear() - 1, 7, 1);
  }

  const yearStart = new Date(t.getFullYear(), 0, 1);
  const endExclusive = dayAfter(t);

  return { weekStart, monthStart, seasonStart, yearStart, endExclusive };
}

interface RollupAggregateRow {
  WeekQty: number | null;
  WeekNet: number | null;
  WeekProfit: number | null;
  MonthQty: number | null;
  MonthNet: number | null;
  MonthProfit: number | null;
  SeasonQty: number | null;
  SeasonNet: number | null;
  SeasonProfit: number | null;
  YearQty: number | null;
  YearNet: number | null;
  YearProfit: number | null;
}

function zeroCell(): InquiryRollupCell {
  return { qty: 0, net: 0, markdown: 0, profit: 0 };
}

function emptyRollup(): InquiryRollup {
  return { week: zeroCell(), month: zeroCell(), season: zeroCell(), year: zeroCell() };
}

export async function getInquirySalesRollup(sku: string): Promise<InquiryRollup> {
  const code = (sku ?? '').trim();
  if (!code) return emptyRollup();

  const dbPath = SALES_MDB();
  if (!fs.existsSync(dbPath)) return emptyRollup();

  const w = resolveWindows(new Date());
  const safe = code.replace(/'/g, "''");

  // Single aggregate query: a SUM IIF(...) per (window × metric).
  // Scope is the SKU itself; TransType=1 and Voided=False match the same
  // filters used by the Sales History by Month adapter.
  const sql = `SELECT
  SUM(IIF(h.RealDate >= #${accessDate(w.weekStart)}#, IIF(d.Qty IS NULL, 0, d.Qty), 0))                                         AS WeekQty,
  SUM(IIF(h.RealDate >= #${accessDate(w.weekStart)}#, IIF(d.Extension IS NULL, 0, d.Extension), 0))                             AS WeekNet,
  SUM(IIF(h.RealDate >= #${accessDate(w.weekStart)}#, IIF(d.Extension IS NULL, 0, d.Extension) - IIF(d.Cost IS NULL, 0, d.Cost) * IIF(d.Qty IS NULL, 0, d.Qty), 0)) AS WeekProfit,
  SUM(IIF(h.RealDate >= #${accessDate(w.monthStart)}#, IIF(d.Qty IS NULL, 0, d.Qty), 0))                                        AS MonthQty,
  SUM(IIF(h.RealDate >= #${accessDate(w.monthStart)}#, IIF(d.Extension IS NULL, 0, d.Extension), 0))                            AS MonthNet,
  SUM(IIF(h.RealDate >= #${accessDate(w.monthStart)}#, IIF(d.Extension IS NULL, 0, d.Extension) - IIF(d.Cost IS NULL, 0, d.Cost) * IIF(d.Qty IS NULL, 0, d.Qty), 0)) AS MonthProfit,
  SUM(IIF(h.RealDate >= #${accessDate(w.seasonStart)}#, IIF(d.Qty IS NULL, 0, d.Qty), 0))                                       AS SeasonQty,
  SUM(IIF(h.RealDate >= #${accessDate(w.seasonStart)}#, IIF(d.Extension IS NULL, 0, d.Extension), 0))                           AS SeasonNet,
  SUM(IIF(h.RealDate >= #${accessDate(w.seasonStart)}#, IIF(d.Extension IS NULL, 0, d.Extension) - IIF(d.Cost IS NULL, 0, d.Cost) * IIF(d.Qty IS NULL, 0, d.Qty), 0)) AS SeasonProfit,
  SUM(IIF(h.RealDate >= #${accessDate(w.yearStart)}#, IIF(d.Qty IS NULL, 0, d.Qty), 0))                                         AS YearQty,
  SUM(IIF(h.RealDate >= #${accessDate(w.yearStart)}#, IIF(d.Extension IS NULL, 0, d.Extension), 0))                             AS YearNet,
  SUM(IIF(h.RealDate >= #${accessDate(w.yearStart)}#, IIF(d.Extension IS NULL, 0, d.Extension) - IIF(d.Cost IS NULL, 0, d.Cost) * IIF(d.Qty IS NULL, 0, d.Qty), 0)) AS YearProfit
FROM TicketHeader h INNER JOIN TicketDetail d
  ON h.UserID = d.UserID AND h.BatchDate = d.BatchDate AND h.Terminal = d.Terminal
 AND h.Store = d.Store AND h.Ticket = d.Ticket AND h.RealDate = d.RealDate
WHERE
  d.SKU = '${safe}'
  AND h.TransType = 1
  AND h.Voided = False
  AND h.RealDate >= #${accessDate(w.yearStart)}#
  AND h.RealDate < #${accessDate(w.endExclusive)}#`;

  try {
    const password = getOrRecoverPassword(dbPath);
    const raw = await runPowerShellJson<RollupAggregateRow | RollupAggregateRow[]>(
      buildSelectScript(dbPath, password, sql),
    );
    const row = Array.isArray(raw) ? raw[0] : raw;
    if (!row) return emptyRollup();

    const n = (v: number | null) => Number(v ?? 0);
    return {
      week:   { qty: n(row.WeekQty),   net: n(row.WeekNet),   markdown: 0, profit: n(row.WeekProfit) },
      month:  { qty: n(row.MonthQty),  net: n(row.MonthNet),  markdown: 0, profit: n(row.MonthProfit) },
      season: { qty: n(row.SeasonQty), net: n(row.SeasonNet), markdown: 0, profit: n(row.SeasonProfit) },
      year:   { qty: n(row.YearQty),   net: n(row.YearNet),   markdown: 0, profit: n(row.YearProfit) },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ricsInquiryRollupAdapter] rollup query failed for ${code}:`, msg);
    return emptyRollup();
  }
}
