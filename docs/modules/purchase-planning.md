# purchase-planning

> **Net-new module — no RICS predecessor.** This is not a port of a RICS feature and is not related to the legacy `otb-planning` module (which reimplements RICS's OTB Plan, budget/commitment gating, and the OTB Report / OTB vs. Sales screens). `purchase-planning` is a forecast-driven replenishment calculator. The two modules share no tables, no routes, and no screens.

## Goal

Given historical sales and current on-hand, compute how many units of each (department | category | vendor) to buy each month for the next 12 months in order to hit a target end-of-month inventory level. The output is a plan grid — no commitments, no budgets, no audit trail — read-only until a user chooses to act on the numbers manually.

The module exists to replace four Python scripts (`presupuesto_compras*.py`) that have been generating offline HTML reports against the RICS MDBs. The scripts' math is correct; the ergonomics (command-line invocation, one HTML per run, no interactive filters) are the pain point. This module brings the same math into the web app.

## Phase

**Phase 1** — read-only against live RICS MDBs. No persisted plans in v1. Every request is computed from scratch against live data.

## Core formula

```
Buy(M)       = max(0, ProjSales(M) + EOH_Target(M) - BOH(M))
BOH(M)       = EOH_Actual(M-1)       [seed from RIINVQUA for month 1]
EOH_Actual   = BOH + Buy - ProjSales   (running)
```

### Forecast methods (`ProjSales(M)`)

| Method | Formula | Parameters |
|---|---|---|
| `sameMonthLastYear` | qty sold in the same calendar month of the prior year | — |
| `trailingAverage` | average qty over the last `N` months | `trailingMonths` (default 6) |
| `yoyGrowth` | same-month-last-year × (1 + `growthPct`/100); clamped to ≥ 0 | `growthPct` (signed, e.g. `10` = +10%, `-5` = -5%) |
| `blendedMultiYear` | average of the same calendar month across the last 2 or 3 years; falls back to fewer years if history is short | `yearsToBlend` (2 or 3; default 2) |

### EOH target methods (`EOH_Target(M)`)

| Method | Formula |
|---|---|
| `forward` | Σ ProjSales(M+1 .. M+`coverMonths`) (default `coverMonths` = 6) |
| `seasonal` | Feb–Aug: ProjSales × 8 · Sep–Oct: ProjSales × 8 + DecProjSales × 0.75 · Nov: ProjSales × 8 + DecProjSales × 0.25 · Dec–Jan: ProjSales × 5 |

The seasonal constants match `presupuesto_compras_vendor_seasonal.py` exactly and are hardcoded in `compute.ts` for v1. Promoting them to company settings is deferred.

## Data sources (read-only)

| Source | Purpose | Existing adapter |
|---|---|---|
| `RITRNSSV.MDB` (TicketDetail) | Historical monthly sales by SKU/category/vendor/department | `services/salesReporting/ricsSalesHistoryByMonthAdapter.ts#queryMonthlyMeasures` |
| `RITRANS*.MDB` (TicketDetail) | Same — older archived transactions | same |
| `RIINVQUA.MDB` (Inventory Quantities) | Current on-hand per SKU × store | `services/salesReporting/ricsOnHandAtCostAdapter.ts` (extended) |
| `RIINVMAS.MDB` (InventoryMaster) | SKU → category, vendor, cost | same |
| `RIDEPT.MDB` (Departments) | Category → department range map | `repositories/rics/DepartmentRepository.ts` |

## API

### `POST /api/v1/purchase-planning/projections`

Compute a plan on demand. Request body is validated with zod.

**Request:**
```ts
{
  dimension: 'department' | 'category' | 'vendor',
  storeNumbers: number[],                       // at least one
  forecast: {
    method: 'sameMonthLastYear'
          | 'trailingAverage'
          | 'yoyGrowth'
          | 'blendedMultiYear',
    trailingMonths?: number,                    // method='trailingAverage'; default 6
    growthPct?: number,                         // method='yoyGrowth'; signed
    yearsToBlend?: 2 | 3,                       // method='blendedMultiYear'; default 2
  },
  eohMethod: 'forward' | 'seasonal',
  coverMonths?: number,                         // forward only; default 6
  asOfYearMonth?: string,                       // 'YYYY-MM'; default = current month
  filters?: {
    departmentsRaw?: string,                    // RICS criteria grammar
    categoriesRaw?: string,
    vendorsRaw?: string,
  }
}
```

**Response:**
```ts
{
  rows: Array<{
    dimKey: string,            // department number, category number, or vendor code
    dimLabel: string,
    yearMonth: string,         // 'YYYY-MM'
    boh: number,               // units
    projSales: number,
    eohTarget: number,
    buy: number,
    eohActual: number,
  }>,
  totals: Array<{
    dimKey: string,
    dimLabel: string,
    currentOnHand: number,
    totalBuy: number,          // sum across horizon
    totalProjSales: number,
    avgEohActual: number,
    hasHistory: boolean,       // false if no sales in the lookback window
  }>,
  meta: {
    asOfYearMonth: string,
    horizonYearMonths: string[],
    onHandAsOf: string,        // ISO timestamp
    generatedAt: string,
    forecastMethod: string,
    eohMethod: string,
    historyFromYearMonth: string,
    historyToYearMonth: string,
  }
}
```

## UI

Single page at `/purchase-planning`.

### Layout (v1)

- **Filter card at the top** (no KPI row above it).
  - `Segmented` — dimension (Department / Category / Vendor).
  - Store multi-select.
  - `Segmented` — forecast method (4 options). A contextual input appears beside it for the method that needs one (`trailingMonths`, `growthPct`, `yearsToBlend`).
  - `Segmented` — EOH method (Forward / Seasonal). `InputNumber` for `coverMonths` appears only when Forward.
  - Three `CriteriaInput` rows (dept / category / vendor) — reusing `pages/salesReporting/CriteriaInput.tsx`.
  - Month picker for `asOfYearMonth`.
  - "Run" button (query fires only on click).
- **Pivoted results table** — one row per dimKey with columns: Label | Current OH | Month 1 Buy | … | Month 12 Buy | Total Buy. Click a row to expand an inline detail table showing the 12 monthly rows of `{BOH, ProjSales, EOH_Target, Buy, EOH_Actual}`.

**Deferred:** KPI cards, charts, export. See "Out of scope for v1".

### Currency / formatting

Units are whole integers with thousands separators. Any monetary column uses plain numbers (no `L.`, no `$`, no `Intl.NumberFormat` with `style: 'currency'`) and the page has a single "Montos en Lempira (HNL)" note at the top of any cost-bearing block.

## Out of scope for v1

- KPI cards / charts (v1.1).
- Saving / naming / versioning plans (Phase 2 — requires Postgres tables).
- PO generation from the Buy output.
- Size-level / SKU-level plan rows (Phase 2).
- Editable overrides.
- Subtracting committed POs from Buy (Python scripts don't do this either).
- Per-month growth % (v1 `yoyGrowth` is a single overall factor).
- Configurable seasonal multipliers (hardcoded in v1).
- CSV / XLSX / PDF export (v1.1).
- Cross-store transfer recommendations.
- Persisting the user's last-used filter set.

## Open questions

1. **History window for forecasting.** `blendedMultiYear` with 3 years needs ~36 months of history. `queryMonthlyMeasures` already reads `RITRNSSV` + `RITRANS*`; confirm end-to-end that 36 months is reachable for all dims.
2. **YoY growth sign convention.** `growthPct = -5` means -5%; `projQty` is clamped to ≥ 0.
3. **Blended fallback.** If `yearsToBlend = 3` but only 2 years of history exist, silently average the 2 available years and flag in `meta`.
4. **New dimKeys with zero history.** Show with a "no-history" badge (`hasHistory=false`) rather than hide.
5. **On-hand freshness.** Accept the 5-min cache in `ricsOnHandAtCostAdapter`; expose `onHandAsOf` in `meta` for transparency.

## Relationship to other modules

| Other module | Relationship |
|---|---|
| `otb-planning` | Independent. No shared tables, no shared screens. Both read from the same RICS data sources but present different views (plan/budget vs. forecast). |
| `purchasing` | None in v1. The "generate PO from Buy" bridge is deferred. |
| `sales-reporting` | Shares `queryMonthlyMeasures` — the adapter is the seam, not a service-level dependency. |
| `inventory` | Shares `ricsOnHandAtCostAdapter` on-hand reads — same seam. |
| `products` | Reads `SkuRepository`-style data via the same adapters — no direct coupling. |
