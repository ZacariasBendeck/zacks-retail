# Sales History by Month — v1 Design

**Module:** `sales-reporting`
**RICS reference:** Ch. 6 p. 95 (docs/modules/sales-reporting.md lines 103–112)
**Phase:** 1 — live read-only from RICS Access MDB via existing PowerShell + OLEDB adapter
**Author:** brainstorming session 2026-04-18

## Scope (v1)

- **Data source:** `RITRNSSV.TicketDetail` live read via existing adapter.
- **Sort axis:** Vendor (alphabetical) OR Category (by number). One at a time. Default = Vendor.
- **Metric:** Net Sales only — retail less markdowns and returns (RICS p. 87 "Sales").
- **Time window:** 12 trailing months ending at a user-picked end month. Default end month = current. Always 12 months.
- **Stores:** Multi-select (≥1 required) with Combine Stores toggle. Default = Combine ON.
  - Combine ON → one pivot table + one aggregate chart line.
  - Combine OFF → stacked per-store tables + one chart line per store.
- **Chart:** ECharts line chart above table. Aggregate only (no per-row lines).
- **Export:** CSV.

**Deferred to v2:** SKU Detail, Category/Vendor Subtotals, Department Summary, Qty Sold + % of Store metrics, Groups / Seasons / Style-Color criteria, PDF/XLSX.

## Architecture

Three backend layers + one page, mirroring the sibling `rics-sales-by-day-store` pipeline.

### Adapter — `apps/api/src/services/salesReporting/ricsSalesHistoryByMonthAdapter.ts` (new)

- Exports `queryMonthlyNetSales({ storeNumbers, fromYearMonth, toYearMonth, sortBy })`.
- Runs **one** OLEDB query against `RITRNSSV.TicketDetail` joined to the active dimension table (Vendor or Category by `sortBy`). Groups by `(StoreNumber, Year(RealDate), Month(RealDate), dimKey)`. Returns flat long-format rows: `{ storeNumber, yearMonth: 'YYYY-MM', dimKey, dimLabel, netSales }`.
- Net Sales formula follows the formula already used by `salesReportFacade.getSalesByDay` — do **not** reinvent. Reuse the same line-extended-price + returns handling so numbers reconcile across reports.
- No pivoting, no month-window math, no in-memory joins — the adapter is a thin SQL wrapper.
- Reuse the same PowerShell/OLEDB pipe used by `ricsInventoryAdapter.ts` and `ricsProductAdapter.ts` (see `accessOleDb.ts`).

### Facade — extend `apps/api/src/services/salesReporting/salesReportFacade.ts`

Add:

```ts
export async function getSalesHistoryByMonth(params: {
  storeNumbers: number[];
  endYearMonth: string;          // 'YYYY-MM'
  sortBy: 'vendor' | 'category';
  combineStores: boolean;
}): Promise<SalesHistoryByMonthResult>;
```

Responsibilities:
- Compute the 12-month window from `endYearMonth` (end inclusive, 11 prior months).
- Call adapter once.
- Resolve store labels via existing store lookup (same source `getSalesByDay` uses).
- Pivot long-format rows into `blocks`:
  - `combineStores=true` → one block with `storeNumber='ALL'`, rows summed across stores.
  - `combineStores=false` → one block per store, each with its own rows and totals.
- Compute row `total`, `columnTotals[12]`, `grandTotal`, and `chartSeries` (one per block).
- Respects `SalesSourceNotImplementedError` when `SALES_SOURCE !== 'rics'` (same guard as `getSalesByDay`).

### Route — extend `apps/api/src/routes/reportRoutes.ts`

`GET /api/v1/reports/rics-sales-history-by-month`

Zod query schema:

```ts
{
  stores: z.string().transform(s => s.split(',').map(n => parseInt(n, 10))).pipe(z.number().int().positive().array().min(1)),
  endMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).default(currentYearMonth()),
  sortBy: z.enum(['vendor', 'category']).default('vendor'),
  combineStores: z.coerce.boolean().default(true),
  format: z.enum(['json', 'csv']).default('json'),
}
```

CSV writer: header row then one section per block — a store-label banner line, column headers (`Sort Key`, `Label`, ...12 month labels, `Total`), data rows, then column-totals + grand-total footer. Matches the shape of existing report CSVs but with per-store sections when un-combined.

### Web page — replace `apps/web/src/pages/salesReporting/SalesHistoryByMonthPage.tsx`

Replace the "not yet implemented" stub with:

1. **Breadcrumb + title** (already there, keep).
2. **Filter bar** (AntD `Card`, sticky top). Controls:
   - `Sort by` — radio group (Vendor | Category), default Vendor.
   - `Stores` — multi-select (AntD `Select mode="multiple"`), options loaded from store list; required ≥1.
   - `Combine Stores` — switch, default ON.
   - `End month` — AntD `DatePicker picker="month"`, default = current month.
   - `Export CSV` — button, hits route with `format=csv`.
3. **Aggregate line chart** (ECharts, already a project dep) — x = 12 month labels, y = dollars, one line per `chartSeries` entry.
4. **Pivot table(s)** — AntD `Table`. Columns: dim label + 12 month columns + row total. Cells formatted as currency (USD, no fractional cents). Footer row renders `columnTotals` + `grandTotal`.
   - `combineStores=true` → single table.
   - `combineStores=false` → one table per block, stacked vertically with the store label as a section header.
5. **Empty state** — if no stores selected, show an AntD `Empty` with prompt to pick stores.
6. **Loading state** — `Skeleton` on chart + table areas while fetching.
7. **Error state** — AntD `Alert type="error"` with the server message (especially the 501 from the facade if `SALES_SOURCE!=rics`).

### Web hook — extend `apps/web/src/hooks/useReports.ts`

Add `useSalesHistoryByMonth(params)` using TanStack Query, mirroring the existing hooks' pattern (staleTime, keepPreviousData).

## Data contract (route response)

```ts
type SalesHistoryByMonthResponse = {
  sortBy: 'vendor' | 'category';
  endMonth: string;                     // 'YYYY-MM'
  months: string[];                     // 12 entries, ascending
  combineStores: boolean;
  stores: Array<{ number: number; label: string }>;

  blocks: Array<{
    storeNumber: number | 'ALL';
    storeLabel: string;
    rows: Array<{
      key: string;                      // vendor code or category code
      label: string;                    // 'NIKE' or '556 - Dress Shoes'
      monthValues: number[];            // length 12, aligned to months
      total: number;
    }>;
    columnTotals: number[];             // length 12
    grandTotal: number;
  }>;

  chartSeries: Array<{ name: string; values: number[] }>;
};
```

- `months` is canonical order for all `monthValues[]` and chart `values[]`.
- Dollars are plain `number`. Empty months = `0` (not `null`).
- When `combineStores=true`: `blocks.length===1`, `chartSeries.length===1 (name='All Stores')`.
- When `combineStores=false`: `blocks.length===stores.length`, `chartSeries.length===stores.length` (per-store aggregate).

## Testing

**Backend (Jest):**
- `salesReportFacade.test.ts` — extend with `getSalesHistoryByMonth`:
  - 12-month window math correct for mid-year and December end-months.
  - Combine ON pivots correctly; Combine OFF produces N blocks.
  - Empty adapter result → blocks with zero rows and zero totals (not error).
  - `SALES_SOURCE!=rics` throws `SalesSourceNotImplementedError`.
- Adapter unit test stubbing OLEDB: long-format round-trip for both `sortBy` values.

**Backend (integration):**
- Add a route-level test in `apps/api/tests/` hitting `GET /api/v1/reports/rics-sales-history-by-month` with mocked adapter; asserts JSON and CSV shapes, 400 on missing `stores`, 501 when source unavailable.

**Web (Vitest):**
- Page renders filter bar, chart, and table against a fixture response (Combine ON + Combine OFF cases).
- Empty-stores state renders the `Empty` prompt and does not call the API.
- CSV export button triggers a GET with `format=csv`.

## Out of scope for this design

- `ReportDefinition`/`SavedReportView`/`ReportRun` persistence (Phase 2+).
- Any of the deferred items listed under Scope above.
- Changes to the sibling `rics-sales-by-day-store` endpoint.
- Any Postgres work.

---

## v2 Expansion (2026-04-18, same day)

Second pass brings the report to full RICS v7.7 p. 95 parity (minus data
sources we don't have). Everything below is a delta over the v1 design above.

### What shipped

| RICS feature | v1 | v2 |
|---|---|---|
| Sort by: Vendor \| Category | Shipped | Kept |
| Combine Stores toggle | Shipped | Kept |
| Data to Print: Net Sales | Shipped | Kept (default) |
| Data to Print: Quantity Sold | Deferred | **Shipped** |
| Data to Print: % of Store Net Sales | Deferred | **Shipped** |
| Data to Print: Profit | Deferred | **Shipped** |
| Data to Print: Gross Profit % (GP-%) | Deferred | **Shipped** |
| Data to Print: Beginning On-Hand Qtys | Deferred | **Deferred (Phase 2)** |
| Data to Print: ROI % | Deferred | **Deferred (Phase 2)** |
| Data to Print: Turns | Deferred | **Deferred (Phase 2)** |
| Detail to Print: SKU Detail | Deferred | **Shipped** |
| Detail to Print: Category/Vendor Subtotals | Shipped (as default) | Kept, selectable |
| Detail to Print: Department Summary | Deferred | **Shipped** |
| Criteria: Stores, Categories, Vendors | Deferred | **Shipped** |
| Criteria: Seasons, Style/Colors, Groups, Keywords | Deferred | **Shipped** |
| Criteria grammar: ranges, lists, exclusions, wildcards, `!-`, `+` | n/a | **Shipped** |
| Export: CSV | Shipped | Kept — multi-metric aware |
| Export: XLSX | Deferred | **Shipped** |
| Line chart (aggregate Net Sales) | Shipped | Kept (always Net Sales) |

### Deferred — and why (superseded by v2.1)

**Beginning On-Hand Qtys / ROI % / Turns** were originally deferred in v2
because the monthly inventory snapshot source was unknown. **v2.1
unblocked all three** once the `RIINVHIS.MDB` / `InvHis` schema was
discovered — see the v2.1 section below for the current status.

### Data contract (v2)

```ts
type MonthlyMetricKey =
  | 'quantitySold'
  | 'netSales'
  | 'pctOfStoreNetSales'
  | 'profit'
  | 'grossProfit'           // percentage, 0-100 scale (GP-% from RICS p. 87)

type MonthlyDeferredMetricKey = 'beginningOnHand' | 'roiPct' | 'turns';

type SalesHistoryByMonthResponse = {
  sortBy: 'vendor' | 'category';
  endMonth: string;                    // 'YYYY-MM'
  months: string[];                    // 12, ascending
  combineStores: boolean;
  stores: Array<{ number: number; label: string }>;

  detailLevel: 'sku' | 'subtotals' | 'department';
  dataToPrint: MonthlyMetricKey[];
  deferredMetrics: MonthlyDeferredMetricKey[];
  criteria: {                          // echoed raw-text per facet
    stores?: string;  categories?: string;  vendors?: string;
    seasons?: string; styleColors?: string; groups?: string; keywords?: string;
  };

  blocks: Array<{
    storeNumber: number | 'ALL';
    storeLabel: string;
    rows: Array<{
      key: string;
      label: string;
      metrics: Partial<Record<MonthlyMetricKey, number[]>>;   // length 12
      totals: Partial<Record<MonthlyMetricKey, number>>;
    }>;
    columnTotals: Partial<Record<MonthlyMetricKey, number[]>>;
    grandTotals: Partial<Record<MonthlyMetricKey, number>>;
  }>;

  chartSeries: Array<{ name: string; values: number[] }>;    // always Net Sales
};
```

### Metric formulas

All formulas cite RICS p. 87 "Overview of Sales Reports".

- **Quantity Sold** = `SUM(TicketDetail.Qty)`. Returns are negative-Qty rows on
  TicketDetail, so the sum is net units sold automatically.
- **Net Sales** = `SUM(TicketDetail.Extension)`. Same formula as
  `salesReportFacade.getSalesByDay` — numbers reconcile across every RICS-
  backed sales report.
- **% of Store Net Sales** = `rowNetSales[i] / storeBlockTotalNetSales[i]`
  expressed on a 0-100 scale (e.g. `53.3`). The denominator is the *block*
  total so it respects Combine-Stores: Combine=ON uses the combined total,
  Combine=OFF uses each store's total.
- **Profit** = `netSales − cogs` where
  `cogs = SUM(TicketDetail.Cost × TicketDetail.Qty)`. RICS p. 87:
  "Profit = Sales less the cost of goods sold". We use TicketDetail.Cost
  (cost at sale time) rather than current average cost — this matches the
  semantics documented in `ricsSalesReportAdapter.ts` for the Sales
  Analysis report and gives consistent numbers when the SKU has had cost
  changes during the 12 months.
- **Gross Profit % (GP-%)** = `profit / netSales` on a 0-100 scale (e.g.
  `40.0`). At the row-total and column-total level the ratio is computed
  from the aggregated numerator / denominator, not as an average of monthly
  ratios (avoids Simpson's paradox on months with tiny denominators).

### Criteria grammar

New: `apps/api/src/utils/criteriaGrammar.ts`. Implements the subset the
manual guarantees:

- Lists (`NIKE,ADIDAS`)
- Ranges (`556-599`) — numeric only. Alpha ranges of equal length are
  accepted as an extension of the grammar (documented in the parser jsdoc);
  the manual's strict rule is "numeric only, same length".
- Exclusions (`<>NIKE`, `<>400-449`) — excludes match; all remaining
  candidates pass.
- Wildcards (`?` one char, `*` any chars)
- Hyphen-escape (`100!-120` is the literal `100-120`, not a range)
- Keyword AND (`+WEDGE,HEEL`) — only applies to the `keywords` facet
  (`matchesKeywords()`). The leading `+` is stripped before term parsing.

Not yet implemented (not required for v2 per the brief): no wildcard
evaluation inside exclusions — an excluded term that contains `*` is treated
as a pattern-mode exclusion, so `<>58*` DOES exclude `5872`, `58A`, etc.
That actually works correctly — it's just not separately unit-tested at
length beyond the happy path.

### Architecture changes

**Adapter** (`ricsSalesHistoryByMonthAdapter.ts`)
- Main entry is now `queryMonthlyMeasures(...)` returning
  `{ quantity, netSales, cogs }` per group. The v1
  `queryMonthlyNetSales(...)` is retained as a thin back-compat projection.
- New `loadSkuMasterForCriteria()` exposes a minimal InventoryMaster
  projection so the facade can resolve Seasons / Style/Colors / Groups /
  Keywords into a SKU set before the sales query runs.
- Grouping key now depends on `detailLevel`: `sku` groups on `d.SKU`,
  `department` and `subtotals` group on vendor/category (department is then
  remapped at the facade layer via `ref_categories.dept_macro`).
- Optional SQL-level filter pushdowns:
  - `vendorFilter` → `d.Vendor IN (...)`
  - `categoryFilter` → `d.Category IN (...)`
  - `skuFilter` → `d.SKU IN (...)` (chunked at 500 per OR-group so Access's
    ~1000-entry IN-cap doesn't bite)

**Facade** (`salesReportFacade.ts`)
- New `resolveCriteria(raw, callerStores)` picks SQL-pushdown vs. SKU-master
  resolution per facet. Simple vendor / category literals go through IN-
  clauses; anything complex (wildcards, exclusions, seasons/styleColor/
  groups/keywords) forces a master projection. Falls back to "no filter
  from that facet" with a warning if the master file isn't readable.
- Pivot now tracks per-metric accumulators; `chartSeries` always projects
  Net Sales (anchor metric) even when the user hasn't asked for the Net
  Sales column in the table — so the chart above the table always shows a
  recognizable trend line.
- Department rollup uses the `ref_categories` seed table (rics_code →
  dept_macro) seeded in SQLite migration 011. Tests tolerate the DB being
  unavailable — the fallback mapper assigns a per-category pseudo-label.

**Route** (`reportRoutes.ts`)
- Zod schema adds `dataToPrint`, `deferredMetrics`, `detailLevel`, seven
  `crit*` facets, and `xlsx` to the format enum.
- CSV writer now emits one labeled section per block × per metric. Layout:
  store banner → metric label → header row (Key, Label, 12 months, Total) →
  data rows → Totals row → blank separator.
- XLSX writer uses the shared `apps/api/src/utils/xlsxExport.ts` helper
  (same helper the other six sales reports use). One sheet per block; each
  sheet stacks per-metric sections. When only one metric is selected, the
  numeric columns get the metric's preferred format (money / integer /
  percent1); multi-metric sheets leave formatting general since a single
  column can't carry two different formats.

**Web page** (`SalesHistoryByMonthPage.tsx`)
- Three-tab layout: Report Options / Criteria / Export Options.
- When >1 metric is selected, the results area renders a `Segmented` metric
  tab strip above the table; the table itself always shows one metric's
  12-column grid at a time. This is the "pick whichever reads cleaner"
  decision from the brief — stacking metrics into a single wide grid
  becomes unreadable past 2 metrics at typical laptop widths.
- Every month column is sortable (numeric), plus the dim label column
  (alpha) and the Total column (numeric, default descending).
- SKU detail paginates at 100 rows per page (the RICS SKU count routinely
  exceeds 10k). Subtotals and Department levels page-size-free since they
  rarely exceed 50 rows.
- XLSX button lives alongside the CSV button in the sticky filter bar and
  on the Export Options tab.
- Deferred metrics appear as disabled-feel AntD `<Tag>`-wrapped checkboxes
  with a "Requires monthly inventory history — Phase 2" tooltip.

### Open question #2 resolved

Manual `docs/modules/sales-reporting.md` Open Q#2 asked whether Keywords
belong on this report (the p. 95 list omits them, p. 89 Sales Analysis and
p. 93 Best Sellers include them). **Ruling (v2):** include Keywords — the
omission looks like a documentation gap, Keywords are a peer filter on every
other Ch. 6 report, and users expect facet parity across reports. Spec's
open question can be closed when this decision ships.

---

## v2.1 Expansion (2026-04-19)

Shipped the three inventory-backed metrics that v2 deferred — Beginning
On-Hand Qty, ROI %, and Turns — after discovering that `RIINVHIS.MDB` (the
"inventory history" file) carries rolling 12-month snapshots that are
sufficient for the default trailing-12 window.

### Discovery findings (RIINVHIS.MDB → `InvHis` table)

Discovery scripts live at:
- `apps/api/scripts/discover-invhis.ts` — enumerates tables, columns, row counts.
- `apps/api/scripts/probe-invhis.ts` — non-zero / cost-coverage probes.
- `apps/api/scripts/probe-invhis-alignment.ts` — aligns `LYMonth*_NN` against
  `RITRNSSV.TicketDetail` to prove the index semantics.

Key columns on `InvHis` (one row per `(SKU, Store)`):

- `AverageCost` (Currency) — 99.99% populated (1,918,274 / 1,918,492 on a
  real customer DB).
- `OnHand`, `LastMonthOnHand` — current scalars.
- `LYMonthQtyOH_01` … `LYMonthQtyOH_12` — **units on hand at month-end**,
  indexed by **calendar month** (NN=01 → January … NN=12 → December).
- `LYMonthOnHand_01` … `LYMonthOnHand_12` — **dollar value on hand at
  month-end** (qty × avg cost at snapshot time).
- `LYMonthQtySales_NN` / `LYMonthDolSales_NN` — sibling sales arrays; cross-
  checked against `RITRNSSV.TicketDetail.Extension` for store 16 as an
  alignment proof. `_NN` is calendar-month indexed.

**Rolling-window semantics.** Each `_NN` slot always holds the MOST RECENT
COMPLETED occurrence of calendar month NN. With today = 2026-04-19:
- `_04` = **2025-04** end-of-month (2026-04 is still in progress)
- `_05` through `_12` = 2025-05 … 2025-12
- `_01` through `_03` = 2026-01 … 2026-03

This means the data natively covers the default "trailing 12 months ending
at the most recent completed month" window with zero gaps. An end-month
picked far in the past will map fewer slots cleanly — documented below.

### Metric formulas (v2.1)

**Beginning On-Hand Qty per window month M** = end-of-month qty for the
month preceding M, retrieved from the appropriate `LYMonthQtyOH_NN` slot
when that slot's stored year matches (M-1)'s year. When it doesn't (e.g.
the oldest month of a window ending 12+ months in the past), the cell is
zero and the report documents this as an edge case. At the row level
(Subtotal / Department), the sum is taken across the underlying SKUs'
InvHis rows via the same dim mapping the sales pivot uses.

**Average Inventory Value at Cost** (the denominator for ROI% and Turns) =
mean of the 12 per-slot `LYMonthOnHand_NN` values that map into the window.
Slots whose stored year doesn't match are skipped (not treated as zero) so
the average isn't biased downward.

**ROI % per window month M** (annualized) =
`(monthly_profit[M] × 12) / rowAvgInvValue × 100`.

**Turns per window month M** (annualized) =
`(monthly_cogs[M] × 12) / rowAvgInvValue`.

**Row totals** collapse across the 12-month window (which is already a
year) without the ×12 multiplier: row ROI% = `windowTotalProfit /
rowAvgInvValue × 100`; row Turns = `windowTotalCogs / rowAvgInvValue`.

**Column totals** at block level aggregate profit / cogs / avg-inv-value
across rows first, then compute the ratio — avoids Simpson's paradox at
the rollup boundary.

### Limitations

- **Only the current trailing-12 window is fully covered by RIINVHIS.**
  The file stores one rolling snapshot of each calendar month. Reports
  with a custom `endMonth` in the past may leave some window months
  without matching slots; those cells render as zero. The typical user
  picks `endMonth = current` or `endMonth = last-completed`, which both
  produce full coverage.
- **Performance.** `InvHis` has ~1.9M rows; even scoped to a store it's
  ~45k rows with non-zero activity. The facade pushes the resolved
  criteria's SKU filter (or derives one from vendor/category filters) into
  the InvHis query so the wire traffic shrinks to the narrowed set. For
  completely unfiltered "all vendors, all categories" reports, expect a
  slower first response — cache-friendly after that thanks to the existing
  `loadSkuMasterForCriteria` 5-minute cache.
- **Cost basis.** ROI% and Turns use `InvHis.AverageCost` (per-SKU-per-
  store current average), NOT the at-sale-time cost used by Profit. RICS
  GMROI is documented against average cost, so this matches the manual.

### Files changed

- `apps/api/src/services/salesReporting/ricsSalesHistoryByMonthAdapter.ts`
  — new `queryMonthlyInventoryHistory` + `MonthlyInventoryHistoryRow` type.
- `apps/api/src/services/salesReporting/salesReportFacade.ts`
  — `SUPPORTED_MONTHLY_METRICS` now includes the three metrics;
  `DEFERRED_MONTHLY_METRICS` is empty; new calendar-slot helpers
  `slotForWindowMonth`, `mapWindowToInvHisSlot`,
  `mapWindowToPrevMonthInvHisSlot`; the pivot loop accumulates per-row
  on-hand totals and computes BoH / ROI% / Turns.
- `apps/api/src/routes/reportRoutes.ts`
  — the Zod enum accepts `beginningOnHand` / `roiPct` / `turns` under
  `dataToPrint` (they're no longer filtered out).
- `apps/web/src/services/reportApi.ts`
  — `SalesHistoryByMonthMetricKey` extended with the three new keys.
- `apps/web/src/pages/salesReporting/SalesHistoryByMonthPage.tsx`
  — the three metrics render as regular (non-deferred) checkboxes;
  `DEFERRED_METRIC_DEFS` is empty; the "Deferred" section collapses when
  the list is empty; new `decimal2` format for Turns.
- `apps/api/tests/salesHistoryByMonthFacade.test.ts`
  — 4 new tests: gates, BoH slot mapping, ROI%/Turns annualization,
  graceful handling when InvHis returns nothing.
- `apps/web/src/test/salesHistoryByMonthPage.test.tsx`
  — updated to expect the three metrics as regular checkboxes
  (`metric-beginningOnHand`, `metric-roiPct`, `metric-turns`).
