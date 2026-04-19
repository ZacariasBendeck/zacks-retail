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
