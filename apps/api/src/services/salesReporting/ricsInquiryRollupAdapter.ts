/**
 * Per-SKU sales rollup for the Inventory Inquiry screen (RICS Ch. 4 p. 75).
 *
 * Reports four sliding windows — Week / Month / Season / Year — each with
 * Qty, Net Sales and Profit. A single aggregate query with conditional SUMs
 * keyed off `h.real_date`.
 *
 * Window semantics match typical retail conventions:
 *   - Week   = last 7 days ending today (inclusive)
 *   - Month  = calendar month to date (1st → today)
 *   - Season = Spring (Feb 1 → Jul 31) or Fall (Aug 1 → Jan 31) to date
 *   - Year   = calendar year to date (Jan 1 → today)
 *
 * The Markdown column (present in the RICS inquiry rollup panel) is not
 * filled from ticket_detail because `d.extension` is already the net amount
 * after any markdown that was applied at sale time. Pricing original-retail
 * vs. sale-price requires a per-line pricing history we don't have in
 * Phase A; markdown is left at 0 for every window.
 */

import { prisma } from '../../db/prisma';
import type { InquiryRollup, InquiryRollupCell } from '../ricsInventoryAdapter';

interface RollupWindows {
  weekStart: Date;
  monthStart: Date;
  seasonStart: Date;
  yearStart: Date;
  endExclusive: Date;
}

function dayAfter(d: Date): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + 1);
  return copy;
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

export async function getInquirySalesRollup(sku: string, storeId?: number): Promise<InquiryRollup> {
  const code = (sku ?? '').trim();
  if (!code) return emptyRollup();

  const w = resolveWindows(new Date());

  // Single aggregate query against `rics_mirror.ticket_header` join
  // `rics_mirror.ticket_detail`, with one conditional SUM per (window × metric).
  // Scope: trans_type=1 (regular sales) and voided=false (same filters the
  // sales-history adapter uses).
  //
  // Parameter layout:
  //   $1 = sku               $4 = seasonStart
  //   $2 = weekStart         $5 = yearStart  (also lower bound of scan)
  //   $3 = monthStart        $6 = endExclusive
  const storeFilter = storeId != null ? `AND t.store_id = $7::int` : '';
  const sql = `
    SELECT
      SUM(CASE WHEN t.purchased_at >= $2::timestamptz THEN COALESCE(l.quantity, 0) ELSE 0 END)::float8 AS "WeekQty",
      SUM(CASE WHEN t.purchased_at >= $2::timestamptz THEN COALESCE(l.net_amount, 0) ELSE 0 END)::float8 AS "WeekNet",
      SUM(CASE WHEN t.purchased_at >= $2::timestamptz THEN COALESCE(l.net_amount, 0) - COALESCE(l.cost_amount, 0) ELSE 0 END)::float8 AS "WeekProfit",
      SUM(CASE WHEN t.purchased_at >= $3::timestamptz THEN COALESCE(l.quantity, 0) ELSE 0 END)::float8 AS "MonthQty",
      SUM(CASE WHEN t.purchased_at >= $3::timestamptz THEN COALESCE(l.net_amount, 0) ELSE 0 END)::float8 AS "MonthNet",
      SUM(CASE WHEN t.purchased_at >= $3::timestamptz THEN COALESCE(l.net_amount, 0) - COALESCE(l.cost_amount, 0) ELSE 0 END)::float8 AS "MonthProfit",
      SUM(CASE WHEN t.purchased_at >= $4::timestamptz THEN COALESCE(l.quantity, 0) ELSE 0 END)::float8 AS "SeasonQty",
      SUM(CASE WHEN t.purchased_at >= $4::timestamptz THEN COALESCE(l.net_amount, 0) ELSE 0 END)::float8 AS "SeasonNet",
      SUM(CASE WHEN t.purchased_at >= $4::timestamptz THEN COALESCE(l.net_amount, 0) - COALESCE(l.cost_amount, 0) ELSE 0 END)::float8 AS "SeasonProfit",
      SUM(CASE WHEN t.purchased_at >= $5::timestamptz THEN COALESCE(l.quantity, 0) ELSE 0 END)::float8 AS "YearQty",
      SUM(CASE WHEN t.purchased_at >= $5::timestamptz THEN COALESCE(l.net_amount, 0) ELSE 0 END)::float8 AS "YearNet",
      SUM(CASE WHEN t.purchased_at >= $5::timestamptz THEN COALESCE(l.net_amount, 0) - COALESCE(l.cost_amount, 0) ELSE 0 END)::float8 AS "YearProfit"
    FROM app.sales_history_ticket t
    INNER JOIN app.sales_history_ticket_line l ON t.id = l.ticket_id
    LEFT JOIN app.sku s ON s.id = l.sku_id
    WHERE
      COALESCE(NULLIF(UPPER(BTRIM(s.code)), ''), NULLIF(UPPER(BTRIM(l.sku_code)), '')) = UPPER(BTRIM($1))
      AND t.status = 'completed'
      AND t.purchased_at >= $5::timestamptz
      AND t.purchased_at <  $6::timestamptz
      ${storeFilter}
  `;

  try {
    const params: unknown[] = [
      code,
      w.weekStart,
      w.monthStart,
      w.seasonStart,
      w.yearStart,
      w.endExclusive,
    ];
    if (storeId != null) params.push(storeId);
    const rows = await prisma.$queryRawUnsafe<RollupAggregateRow[]>(
      sql,
      ...params,
    );
    const row = rows[0];
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
