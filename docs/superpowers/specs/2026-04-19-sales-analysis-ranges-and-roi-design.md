# Sales Analysis — criteria ranges + ROI/Turns/GP% on every row

**Date:** 2026-04-19
**Module:** `sales-reporting`
**Phase:** 1 (live read from RICS Access MDBs)
**Owner surfaces:** [`apps/web/src/pages/salesReporting/`](apps/web/src/pages/salesReporting/), [`apps/api/src/services/salesReporting/`](apps/api/src/services/salesReporting/)

## Problem

Two gaps in the current Sales Analysis report:

1. **Criteria cannot express ranges.** The Stores and Categories inputs in [apps/web/src/pages/salesReporting/SalesAnalysisPage.tsx](apps/web/src/pages/salesReporting/SalesAnalysisPage.tsx) are multi-select dropdowns only. A user who wants "categories 556 through 599" has to click 44 items, which does not match the RICS workflow captured in the current report screenshot ("Selecting these categories : 556-599"). The RICS criteria grammar (`-` ranges, `<>` exclusions, `?`/`*` wildcards, `+` AND) is already parsed in [apps/api/src/utils/criteriaGrammar.ts](apps/api/src/utils/criteriaGrammar.ts); it just has no UI entry point and is not applied to numeric facets (Stores, Categories) in the RICS adapter.
2. **ROI and Turns are not computed.** The Sales Analysis table shows Qty, Net Sales, COGS, Gross Profit, and GP%. The RICS spec (p. 87) makes ROI% ("sometimes known as GMROI … always annualized regardless of what period is being analyzed") the single most important retail KPI, alongside Turns. Neither exists in the codebase today. The legacy screenshot shows Qty / Sales / Mkdwn% / Profit / GP% / ROI / Turns as one block — these metrics travel together.

## Goals

- Users can type `556-599` (or any other RICS-grammar expression) into Stores, Categories, Vendors, Seasons, SKUs, Groups, Keywords on Sales Analysis and have it apply alongside the existing dropdown selections.
- Every Sales Analysis result row (SKU Detail, Category Summary, Dept Summary, Vendor Summary, Price Point Summary — every report type already wired today) shows **ROI%, Turns, GP%** in addition to the columns it already shows, regardless of the summary grain.
- The criteria widget and the ROI/Turns helper are reusable — other sales-reporting pages (Best Sellers, Stock Status, Size Type Analysis, Sales History by Month) can adopt them without rewrites, but this spec only wires Sales Analysis. Other pages are follow-up work.
- Phase 1 fidelity: no schema changes, live reads from the existing RICS MDBs, no new tables.

## Non-goals

- Rolling the changes out to Best Sellers / Stock Status / Size Type Analysis / Sales History by Month in this spec. Reusable pieces are built here so those pages can adopt them one at a time later.
- Adding an ROI-tier "Analyze by" dimension (brainstorm question 3, option B). Not in scope for v1.
- Replacing the existing multi-select with a pure grammar text box (brainstorm question 2, option A). Dropdown stays; text box is additive.
- Materialized-fact or historical inventory snapshots for accurate "average inventory over the period." Denominator for v1 is current on-hand × current cost, which matches what RICS itself prints.
- Touching Phase 1 read-only guarantees. No new Access writes.

## Design

### 1. Shared `CriteriaInput` widget

**New file:** [apps/web/src/pages/salesReporting/CriteriaInput.tsx](apps/web/src/pages/salesReporting/CriteriaInput.tsx).

A single reusable component that replaces each `CriteriaRow` body on Sales Analysis. For a given facet it renders:

- The existing **multi-select dropdown** (unchanged — options fed by the caller, value + onChange bound as today).
- Below it, a **grammar text input** with a monospace font and a subtle help tooltip on hover (`556-599` ranges, `<>NIKE` exclude, `*FORMAL*` wildcard, `+A +B` keyword AND). Empty by default.
- A brief help line under the text box: `Ranges: 556-599   Exclude: <>575   Wildcard: KISS*BK   Escape hyphen: 100!-120`.

Component API:

```ts
interface CriteriaInputProps<TValue> {
  label: string;                     // "Stores", "Categories", etc.
  mode: 'numeric' | 'string';        // how to present picker values
  options: { value: TValue; label: string }[];
  selected: TValue[];                // dropdown value
  onSelectedChange: (v: TValue[]) => void;
  rawText: string;                   // grammar text box value
  onRawTextChange: (s: string) => void;
  loading?: boolean;
  placeholder?: string;
  helpText?: string;                 // overrides the default help string
  hideDropdown?: boolean;            // for text-only facets (Keywords, Style/Color)
}
```

The widget does **not** parse the grammar on-change. Parse happens server-side via the already-shipped `parseCriteria()` (see below). The client ships both `selected` and `rawText` in the request. Server merges them.

Wiring into `SalesAnalysisPage.tsx`: each `<CriteriaRow label="Stores"><Select ... /></CriteriaRow>` becomes `<CriteriaInput label="Stores" mode="numeric" options={...} selected={selectedStores} onSelectedChange={setSelectedStores} rawText={storesRaw} onRawTextChange={setStoresRaw} />`. New state vars: `storesRaw`, `categoriesRaw`, `vendorsRaw`, `seasonsRaw`, `skusRaw`, `groupsRaw`, `keywordsRaw`, `styleColorRaw`. Existing `vendorsText`, `seasonsText`, `skusText`, `keywordsText`, `styleColorPattern` state are renamed to the `*Raw` suffix and repurposed — they already sit where the grammar input belongs, so this is mostly a rename.

### 2. Extended `SalesAnalysisCriteria` wire shape

Server type in [apps/api/src/services/salesReporting/types.ts](apps/api/src/services/salesReporting/types.ts) is extended:

```ts
export interface SalesAnalysisCriteria {
  // existing structured selections (IDs from dropdowns)
  stores?: number[];
  categories?: number[];
  vendors?: string[];
  seasons?: string[];
  skus?: string[];
  styleColor?: string;
  groups?: string[];
  keywords?: string[];

  // NEW — raw criteria text per facet (RICS grammar; see parseCriteria())
  storesRaw?: string;
  categoriesRaw?: string;
  vendorsRaw?: string;
  seasonsRaw?: string;
  skusRaw?: string;
  groupsRaw?: string;
  keywordsRaw?: string;
  // styleColor is already a wildcard pattern; styleColorRaw is an alias kept for consistency
  styleColorRaw?: string;
}
```

The structured arrays stay — they're easier for the server to push down as `IN (...)` SQL and keep the existing contract working. `*Raw` is additive.

**Merge semantics.** Let `S` = structured picks (IDs from the dropdown) and `G` = grammar expression (parsed from `*Raw`).

- `S` empty, `G` empty → match everything (no filter).
- `S` non-empty, `G` empty → match `S`. (Existing behavior.)
- `S` empty, `G` non-empty → match whatever `G` matches via `matchesCriteria`. (Grammar-only.)
- `S` non-empty, `G` non-empty, `G` has at least one **inclusion** token → match **`S` ∪ include(G)**, then apply `G`'s exclusions on top. (User added both picks AND a range.)
- `S` non-empty, `G` exclusion-only (e.g. `<>575`) → match `S \ exclude(G)`. The exclusion **narrows the structured picks**; it does not expand the universe. (Q1 resolution.)

Empty `*Raw` = no grammar filter applied (falls back to existing behavior).

### 3. Adapter changes — applying the grammar

In [apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts](apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts), each `SalesAnalysisCriteria` consumer gets:

```ts
const storeExpr = parseCriteria(criteria.storesRaw);
const categoryExpr = parseCriteria(criteria.categoriesRaw);
// … one per facet
```

**SQL pre-filter.** For each facet, if the structured array is populated AND `sqlInLiterals(expr)` returns a pure literal list (i.e. no ranges, no exclusions, no wildcards), we push the union of {structured, literal tokens} down as an `IN (...)` clause. This is the fast path and matches today's behavior when grammar is empty.

**In-memory post-filter.** When the grammar carries ranges / exclusions / wildcards — `sqlInLiterals` returns `null` — we instead widen the pre-filter. For numeric facets (Stores, Categories) we extract a coarse numeric range bound from the tokens (`sqlRangeBounds()` — new helper described below) and push that as `BETWEEN ? AND ?`. After the adapter fetches rows, the facade runs `matchesCriteria(expr, row.storeNumber)` and `matchesCriteria(expr, row.categoryId)` on each row, dropping rows that fail. String facets (Vendors, Seasons) can fall back to no SQL pre-filter plus in-memory `matchesCriteria`. Keyword and Style/Color already have in-memory paths; just wire them to `*Raw`.

**New helper in `criteriaGrammar.ts`:**

```ts
/**
 * Returns { min, max } bounds covering all numeric-range and literal-numeric
 * tokens in the expression, or null if any non-numeric token is present.
 * Used to push a loose `BETWEEN ? AND ?` down to Access for SARGability; the
 * real per-row matching still runs via matchesCriteria().
 */
export function sqlNumericBounds(expr: CriteriaExpression): { min: number; max: number } | null;
```

Behavior: ignores excluded tokens (they only tighten the post-filter); returns `null` if the expression is empty OR contains any `pattern` / non-numeric `literal`. This keeps the SQL-level push-down safe.

### 4. Dimensions endpoint — already good

[ricsSalesReportAdapter.ts `getSalesDimensions()`](apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts) already returns `{ stores, categories, groups }`. No change. The `CriteriaInput` widget continues to pull dropdown options from `useSalesDimensions()`.

### 5. ROI / Turns / GP% — on every row

Definitions (matching RICS p. 87 and the legacy screenshot):

- **GP%** = `grossProfit / netSales`, clamped to 0 when `netSales = 0`. Already computed today in [types.ts](apps/api/src/services/salesReporting/types.ts) (`SalesAnalysisRow.gpPct`) and rendered in [SalesAnalysisPage.tsx](apps/web/src/pages/salesReporting/SalesAnalysisPage.tsx). No logic change — just gets a clearer recomputation point per §5.2 for parity with the new columns.
- **Turns** = `(annualized Sales at Cost) / (inventory investment at Cost)` = `(cogs * (365 / periodDays)) / onHandAtCost`. `null` when `onHandAtCost = 0`.
- **ROI%** = GMROI = `(grossProfit * (365 / periodDays)) / onHandAtCost`, expressed as a decimal (11.2 means 11.2× per year, matching the screenshot). `null` when `onHandAtCost = 0`.
- **`periodDays`** = inclusive day count of the report's `[startDate, endDate]`.
- **`onHandAtCost`** = `Σ (RIINVQUA.OnHandQty × RIINVMAS.CurrentCost)` for the SKUs in the row's dimension, filtered by the same Stores criteria used for sales. Phase 1 accepts this as-of-now snapshot per brainstorm Q4 confirmation.

#### 5.1 New adapter query — on-hand at cost by dimension

**New file:** [apps/api/src/services/salesReporting/ricsOnHandAtCostAdapter.ts](apps/api/src/services/salesReporting/ricsOnHandAtCostAdapter.ts), exporting:

```ts
/**
 * Pulls Σ(OnHandQty × CurrentCost) grouped by the same dimension the report is
 * summarizing at. Keys match `SalesAnalysisRow.dimensionKey`.
 *
 * - reportType=CATEGORY_SUMMARY  → keyed by category #
 * - reportType=DEPT_SUMMARY      → keyed by department # (first digit of category per
 *                                  existing salesReportFacade convention)
 * - reportType=VENDOR_SUMMARY    → keyed by vendor code
 * - reportType=PRICE_POINT_SUMMARY → keyed by the same bucket label the sales query uses
 * - reportType=SKU_DETAIL        → keyed by SKU code
 *
 * When storeOption=COMBINE the map is flat dimensionKey→cost; otherwise it's
 * dimensionKey|storeNumber→cost so per-store rows pair up correctly.
 */
export async function getOnHandAtCostByDimension(params: {
  reportType: SalesAnalysisReportType;
  storeOption: SalesAnalysisStoreOption;
  criteria: SalesAnalysisCriteria;   // same filter that the sales query used
}): Promise<Map<string, number>>;
```

Implementation: a single query against `RIINVQUA INNER JOIN RIINVMAS ON SKU` filtered by the same Store / Category structured filters used for the sales query. GROUP BY the dimension. The same `*Raw` grammar is applied in-memory after the query for exclusions/ranges (reusing `matchesCriteria`).

For report types that need RIINVMAS master joins the RICS adapter does not ship yet (`GROUP_SUMMARY`, `SEASON_SUMMARY`, `SECTOR_SUMMARY`, `STYLE_COLOR_SUMMARY`), `getOnHandAtCostByDimension()` returns an empty map and ROI/Turns render as `null` — mirroring the existing "coming soon" state of those report types on the page.

#### 5.2 New shared helper

**New file:** [apps/api/src/services/salesReporting/metrics.ts](apps/api/src/services/salesReporting/metrics.ts).

```ts
/**
 * RICS Ch. 6 p. 87 metric triple. Computes GP%, Turns, ROI% from sales + on-hand-at-cost.
 * All three are "always annualized" per the manual, so callers pass the
 * inclusive day count of the reporting window.
 */
export interface MetricsInput {
  netSales: number;
  cogs: number;
  grossProfit: number;
  onHandAtCost: number;   // 0 when unknown (renders as null downstream)
  periodDays: number;     // inclusive; never 0
}

export interface MetricsOutput {
  gpPct: number | null;           // decimal percent, e.g. 52.4
  turns: number | null;           // times per year, e.g. 5.0
  roiPct: number | null;          // GMROI, e.g. 11.2
}

export function computeRoiTurnsGp(input: MetricsInput): MetricsOutput;
```

Branches on `netSales === 0`, `onHandAtCost === 0`, `periodDays <= 0` → `null` for that metric.

#### 5.3 Facade wiring

In [salesReportFacade.ts](apps/api/src/services/salesReporting/salesReportFacade.ts) `getSalesAnalysis()`:

1. Call the existing adapter to get `rows[]` with `qty / netSales / cogs / grossProfit`.
2. Call `getOnHandAtCostByDimension(...)` — parallel with step 1 when possible.
3. For each row: look up `onHandAtCost` from the map by the row's `dimensionKey` (+ storeNumber key when COMBINE=false), then call `computeRoiTurnsGp(...)`, merge the three metrics onto the row.
4. Recompute totals over the post-merge rows so the summary row also carries ROI / Turns / GP%. Totals use `Σ onHandAtCost` / `Σ grossProfit` directly, not an average of row-level ROIs — per accounting convention.

#### 5.4 Type additions

In [types.ts](apps/api/src/services/salesReporting/types.ts):

```ts
export interface SalesAnalysisRow {
  // existing fields…
  onHandAtCost: number;          // NEW — denominator input, exposed so the UI can show Value column
  turns: number | null;          // NEW
  roiPct: number | null;         // NEW
  // gpPct stays
}

export interface SalesAnalysisReport {
  // existing fields…
  totals: {
    // existing fields…
    onHandAtCost: number;        // NEW
    turns: number | null;        // NEW
    roiPct: number | null;       // NEW
  };
  periodDays: number;            // NEW — surfaced for debugging / footer
}
```

### 6. UI — render ROI / Turns / GP%

In [SalesAnalysisPage.tsx](apps/web/src/pages/salesReporting/SalesAnalysisPage.tsx):

- Add three columns to the `columns` array, in this order after `grossProfit`: **GP%** (already there, move), **Turns**, **ROI%**.
- Add **Inv Value (at Cost)** column after `cogs` to show `onHandAtCost` — gives the user the denominator at a glance, matches the screenshot's "Value" column on the On-Hand section.
- Render format:
  - `Turns`: one decimal, e.g. `5.0`. Plain text.
  - `ROI%`: one decimal with `×` suffix, e.g. `11.2×`. Color tag: green `≥ 5`, gold `2–5`, red `< 2`. (Consistent with the existing GP% traffic-light logic.)
  - `null` → `—` as today.
- Summary row mirrors the same columns.

No change to `RunReportControls`. No change to `useReports` / TanStack query keys beyond the payload shape widening (React Query will naturally refetch when the args differ).

### 7. Default row ordering

**Bug today:** [ricsSalesReportAdapter.ts:1211-1216](apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts#L1211-L1216) sorts rows by `dimensionLabel ?? dimensionKey`. For Department Summary and Category Summary the dimensionLabel is the *name* ("ZAPATO MUJER") while the dimensionKey is the *number* (`5`). The user correctly reported that a department-by-department report should start numerically — today it starts alphabetically by label.

**Fix:** sort by `dimensionKey` directly, using `localeCompare(..., { numeric: true, sensitivity: 'base' })`. Numeric-aware compare handles both cases naturally:

- `CATEGORY_SUMMARY`, `DEPT_SUMMARY`, `SECTOR_SUMMARY`, `GROUP_SUMMARY` → keys are numbers-as-strings (`"5"`, `"56"`, `"556"`), numeric compare → ascending numeric order.
- `VENDOR_SUMMARY` → keys are vendor codes (alpha), numeric-aware compare → ascending alpha.
- `SKU_DETAIL` → keys are SKU codes (mixed), numeric-aware compare → alpha with numeric segments ordered numerically (so `"SKU-2"` < `"SKU-10"`).
- `SEASON_SUMMARY`, `STYLE_COLOR_SUMMARY` → keys are strings, alpha compare.
- `PRICE_POINT_SUMMARY` → keys are bucket labels like `"$30–$40"`. The adapter already builds these in ascending-price order when it constructs the buckets; the sort still uses `localeCompare(..., numeric: true)` which handles `$` prefixes consistently (all rows share the prefix, so the numeric portion drives order).

Secondary sort stays `storeNumber` for Separate / Compare modes so a dept's rows group cleanly across stores.

Ant Design column headers remain click-to-re-sort as today — this change only affects the default order when no column is clicked.

### 8. Tests

**Backend (Jest).**
- `apps/api/tests/criteriaGrammar.test.ts` — add cases for `sqlNumericBounds()`: empty → null, pure literals, range only, range+literal, excluded-only, wildcard → null.
- **New** `apps/api/tests/salesAnalysisGrammar.test.ts` — end-to-end against the RICS adapter using the shared test MDBs: assert `categoriesRaw = "556-599"` returns the same rows as picking every category 556..599 in the dropdown; assert `<>575` excludes 575; assert combining dropdown selection with raw text unions them.
- **New** `apps/api/tests/salesAnalysisMetrics.test.ts` — unit tests for `computeRoiTurnsGp`: zero cases (zero sales, zero on-hand, zero period), typical cases (matches the screenshot numbers for "Sector 5 ZAPATO MUJER": netSales=1,075,817.11, cogs derived from GP%=56.1 → grossProfit=603,482.36, onHandAtCost=62,805,409.97, periodDays≈20 MTD → ROI% ≈ 11× / Turns ≈ 0.10, within tolerance).
- Existing `ricsSalesReport.test.ts` regressions pass unchanged — structured-only criteria still work.

**Frontend (Vitest).** `apps/web/src/pages/salesReporting/__tests__/CriteriaInput.test.tsx` — renders dropdown + text box, typing fires `onRawTextChange`, picking fires `onSelectedChange`. Smoke test the full SalesAnalysisPage POSTs both fields in the TanStack Query args.

### 9. Backwards compatibility

- Existing callers that send only `{ stores: [...], categories: [...], ... }` continue to work — `*Raw` is optional.
- Existing saved TanStack Query cache entries become stale on deploy; no migration needed.
- No schema changes, no data migrations, no env-var changes.

## Data flow diagram

```
┌───────────────────┐   dropdown + text    ┌───────────────────────────┐
│ SalesAnalysisPage │ ───────────────────▶ │ useSalesAnalysis(query)   │
│  CriteriaInput ×8 │                      │  (TanStack Query)         │
└───────────────────┘                      └──────────────┬────────────┘
                                                          │ POST /api/sales-analysis
                                                          ▼
                                         ┌──────────────────────────────────┐
                                         │ salesReportFacade.getSalesAnalysis│
                                         └──────────┬────────────┬──────────┘
                                                    │ sales      │ on-hand at cost
                                         ┌──────────▼──┐     ┌───▼──────────────┐
                                         │ rics sales  │     │ ricsOnHandAtCost │
                                         │ adapter     │     │ adapter (NEW)    │
                                         └─────────────┘     └──────────────────┘
                                                    │             │
                                                    └──────┬──────┘
                                                           ▼
                                              ┌──────────────────────────┐
                                              │ computeRoiTurnsGp() per  │
                                              │ row + totals (NEW)       │
                                              └──────────────────────────┘
```

## Open questions

- **Q1. Exclusion-only grammar semantics.** **RESOLVED** (2026-04-19, user-confirmed recommendation): exclusion-only grammar narrows the structured picks. Full rules encoded in §2 "Merge semantics."
- **Q2. Price Point Summary with ROI.** PRICE_POINT_SUMMARY rows have dimensionKeys like `"$30-$40"` that don't map directly to SKUs. On-hand-at-cost for a price bucket means "on-hand × current cost for SKUs currently priced within that bucket." Is that the right definition, or should we read the bucket from the historical retail at sale time? Recommendation: current-priced bucket (Phase 1 parity with the sales query's same bucketization).
- **Q3. Inventory Value column placement.** Adding an **Inv Value** column will push the table past 1200px on 1366 screens. Acceptable, or should we hide it behind a "Show cost columns" toggle and default to off? Recommendation: show by default (it's in the screenshot the user referenced) and let them scroll horizontally.

## Implementation plan preview

The writing-plans skill will take this spec and produce a TDD-first bite-sized plan. Rough shape:

1. Fix default row ordering in the RICS adapter (§7) + test.
2. Add `sqlNumericBounds` + tests in `criteriaGrammar.ts`.
3. Add `computeRoiTurnsGp` + tests in `metrics.ts`.
4. Add `ricsOnHandAtCostAdapter` + tests.
5. Extend `SalesAnalysisCriteria` / `SalesAnalysisRow` / `SalesAnalysisReport` types.
6. Extend facade to fetch on-hand and fold metrics into rows + totals.
7. Apply `*Raw` criteria in the RICS adapter (push-down + in-memory filter, merge semantics from §2) + test.
8. Build `CriteriaInput.tsx` component + tests.
9. Wire `CriteriaInput` into `SalesAnalysisPage.tsx`, add ROI/Turns/Inv-Value columns + a manual smoke on the dev server.
