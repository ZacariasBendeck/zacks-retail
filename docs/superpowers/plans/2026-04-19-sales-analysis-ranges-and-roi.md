# Sales Analysis — criteria ranges + ROI/Turns/GP% Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users type RICS-grammar ranges (`556-599`, `<>575`, `KISS*BK`) into Sales Analysis criteria; render ROI%, Turns, GP%, and Inv Value at Cost on every row and total; fix default row ordering so Department Summary starts at the lowest dept number instead of alphabetically by name.

**Architecture:** Extend the existing `criteriaGrammar.ts` parser with `sqlNumericBounds`. Add a new `metrics.ts` helper that computes GP%/Turns/ROI% from sales + on-hand-at-cost. Add a new `ricsOnHandAtCostAdapter.ts` that groups Σ(OnHand×CurrentCost) by the same dimension the sales query uses. Extend `SalesAnalysisCriteria` with `*Raw` grammar fields and apply them in the RICS adapter via merge-semantics (structured dropdown picks ∪ grammar, with exclusion-only narrowing picks). Build a reusable `CriteriaInput.tsx` that pairs the existing multi-select with a grammar text box. Wire it into `SalesAnalysisPage.tsx` and add the new columns.

**Tech Stack:** Node 20 + TypeScript + Express + Jest for the API; React 18 + Vite + Ant Design + TanStack Query + Vitest for the web app.

**Reference spec:** [`docs/superpowers/specs/2026-04-19-sales-analysis-ranges-and-roi-design.md`](docs/superpowers/specs/2026-04-19-sales-analysis-ranges-and-roi-design.md)

---

## File Structure

**API — create:**
- `apps/api/src/services/salesReporting/metrics.ts` — `computeRoiTurnsGp()` pure helper.
- `apps/api/src/services/salesReporting/ricsOnHandAtCostAdapter.ts` — `getOnHandAtCostByDimension()`.
- `apps/api/tests/salesAnalysisMetrics.test.ts`
- `apps/api/tests/salesAnalysisGrammar.test.ts`
- `apps/api/tests/ricsOnHandAtCost.test.ts`

**API — modify:**
- `apps/api/src/utils/criteriaGrammar.ts` — add `sqlNumericBounds()`.
- `apps/api/src/services/salesReporting/types.ts` — extend `SalesAnalysisCriteria`, `SalesAnalysisRow`, `SalesAnalysisReport`.
- `apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts` — fix row sort; apply `*Raw` criteria in `applyAnalysisCriteria` + widen ticket-line pre-filter for range push-down.
- `apps/api/src/services/salesReporting/salesReportFacade.ts` — call on-hand adapter, fold metrics onto rows + totals.
- `apps/api/tests/criteriaGrammar.test.ts` — add `sqlNumericBounds` cases.
- `apps/api/tests/ricsSalesReport.test.ts` — update tests for new row shape (ROI/Turns/InvValue fields).

**Web — create:**
- `apps/web/src/pages/salesReporting/CriteriaInput.tsx` — shared dropdown + grammar text box.
- `apps/web/src/pages/salesReporting/__tests__/CriteriaInput.test.tsx`

**Web — modify:**
- `apps/web/src/pages/salesReporting/SalesAnalysisPage.tsx` — replace per-criterion blocks with `CriteriaInput`; rename `*Text` state to `*Raw`; add `storesRaw`, `categoriesRaw`, `groupsRaw`; add ROI/Turns/GP%/InvValue columns.
- `apps/web/src/services/reportApi.ts` — extend `SalesAnalysisArgs` with `*Raw` fields.
- `apps/web/src/hooks/useReports.ts` — (pass-through; verify `SalesAnalysisArgs` shape update flows through).

---

## Task 1: Fix default row ordering on Sales Analysis

**Files:**
- Modify: `apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts:1211-1216`
- Test: `apps/api/tests/ricsSalesReport.test.ts`

**Why first:** Tiny, high-signal change. Locks in the ordering fix you asked for before any of the bigger work; gives you a cheap GREEN to verify the dev loop is healthy.

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe('getSalesAnalysis')` block in `apps/api/tests/ricsSalesReport.test.ts`. Use the existing mock infrastructure — seed ticket lines spanning three categories that span three departments, request `DEPT_SUMMARY`, assert numeric-ascending dimensionKey order.

```ts
it('DEPT_SUMMARY returns rows in numeric order by dept number, not alphabetical by label', async () => {
  setMockRows([
    { match: sqlMatches('FROM [Stores]'), rows: STORE_ROWS },
    { match: sqlMatches('FROM [Salespeople]'), rows: SALESPERSON_ROWS },
    {
      match: sqlMatches('FROM [Departments]'),
      rows: [
        { Number: 5,  Desc: 'ZAPATO MUJER', BegCateg: 550, EndCateg: 599 },
        { Number: 1,  Desc: 'ACCESORIOS',   BegCateg: 100, EndCateg: 199 },
        { Number: 3,  Desc: 'MUJER',        BegCateg: 300, EndCateg: 399 },
      ],
    },
    {
      match: sqlMatches('FROM TicketHeader'),
      rows: [
        // One ticket line per dept so the summary has one row per dept.
        { H_Store: 2, H_Ticket: 1, H_RealDate: dateMs('2026-04-15'), H_Cashier: 'A', H_Posted: 'Y',
          D_SKU: 'X', D_Qty: 1, D_Extension: 100, D_Cost: 50, D_Category: 560, D_Vendor: 'V1', D_RealPrice: 100, D_Column: '', D_Row: '', D_Perks: 0, D_SalesPerson: 'GAMU', D_ReturnCode: 0 },
        { H_Store: 2, H_Ticket: 2, H_RealDate: dateMs('2026-04-15'), H_Cashier: 'A', H_Posted: 'Y',
          D_SKU: 'Y', D_Qty: 1, D_Extension: 100, D_Cost: 50, D_Category: 150, D_Vendor: 'V2', D_RealPrice: 100, D_Column: '', D_Row: '', D_Perks: 0, D_SalesPerson: 'GAMU', D_ReturnCode: 0 },
        { H_Store: 2, H_Ticket: 3, H_RealDate: dateMs('2026-04-15'), H_Cashier: 'A', H_Posted: 'Y',
          D_SKU: 'Z', D_Qty: 1, D_Extension: 100, D_Cost: 50, D_Category: 350, D_Vendor: 'V3', D_RealPrice: 100, D_Column: '', D_Row: '', D_Perks: 0, D_SalesPerson: 'GAMU', D_ReturnCode: 0 },
      ],
    },
  ]);

  const report = await adapter.getSalesAnalysis({
    dimension: 'CATEGORY',
    reportType: 'DEPT_SUMMARY',
    storeOption: 'COMBINE',
    criteria: {},
    printing: {},
    startDate: '2026-04-15',
    endDate: '2026-04-15',
  });

  expect(report.rows.map((r: { dimensionKey: string }) => r.dimensionKey))
    .toEqual(['1', '3', '5']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/api && pnpm jest ricsSalesReport.test.ts -t 'numeric order by dept'
```

Expected: FAIL — rows ordered as `['1', '5', '3']` (alphabetical by label "ACCESORIOS", "ZAPATO MUJER", "MUJER").

- [ ] **Step 3: Implement the fix**

Open `apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts` and locate the `.sort(...)` on line ~1211. Replace the comparator so it keys on `dimensionKey` (not `dimensionLabel`) with numeric-aware compare:

```ts
    .sort((a, b) =>
      a.dimensionKey.localeCompare(b.dimensionKey, undefined, {
        numeric: true,
        sensitivity: 'base',
      }));
```

Update the comment above the sort to match:

```ts
  // Default sort: by dimensionKey (numeric-aware). For DEPT_SUMMARY /
  // CATEGORY_SUMMARY this gives numeric ascending; for VENDOR_SUMMARY /
  // SKU_DETAIL it gives alphanumeric ascending. Users can still re-sort
  // interactively via Ant's column headers.
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/api && pnpm jest ricsSalesReport.test.ts -t 'numeric order by dept'
```

Expected: PASS.

- [ ] **Step 5: Run the full adapter test file to catch regressions**

```bash
cd apps/api && pnpm jest ricsSalesReport.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts apps/api/tests/ricsSalesReport.test.ts
git commit -m "fix(sales-reporting): sort summary rows by dimensionKey, not label

Department Summary was ordering rows alphabetically by department name
(ZAPATO MUJER, ACCESORIOS, …) because the sort keyed on
dimensionLabel. Switch to dimensionKey with numeric-aware
localeCompare so numeric dimensions (dept, category) ascend by number
and alphanumeric ones (vendor, SKU) still sort naturally."
```

---

## Task 2: Add `sqlNumericBounds()` to criteriaGrammar

**Files:**
- Modify: `apps/api/src/utils/criteriaGrammar.ts`
- Test: `apps/api/tests/criteriaGrammar.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/tests/criteriaGrammar.test.ts` (after the existing `describe('sqlInLiterals', …)` block if present, else at bottom):

```ts
import {
  parseCriteria,
  sqlNumericBounds,
} from '../src/utils/criteriaGrammar';

describe('sqlNumericBounds', () => {
  it('returns null for empty expression', () => {
    expect(sqlNumericBounds(parseCriteria(''))).toBeNull();
  });

  it('returns null when any non-numeric literal is present', () => {
    expect(sqlNumericBounds(parseCriteria('NIKE'))).toBeNull();
    expect(sqlNumericBounds(parseCriteria('100,NIKE'))).toBeNull();
  });

  it('returns null when a wildcard pattern is present', () => {
    expect(sqlNumericBounds(parseCriteria('KISS*BK'))).toBeNull();
    expect(sqlNumericBounds(parseCriteria('100,KISS*BK'))).toBeNull();
  });

  it('returns null when a non-numeric range is present', () => {
    // Non-numeric range: alpha-only, same length
    expect(sqlNumericBounds(parseCriteria('AAA-ZZZ'))).toBeNull();
  });

  it('bounds a single numeric range', () => {
    expect(sqlNumericBounds(parseCriteria('556-599'))).toEqual({ min: 556, max: 599 });
  });

  it('bounds a list of numeric literals', () => {
    expect(sqlNumericBounds(parseCriteria('100,200,300'))).toEqual({ min: 100, max: 300 });
  });

  it('bounds a mix of ranges and literals', () => {
    expect(sqlNumericBounds(parseCriteria('100,556-599,650'))).toEqual({ min: 100, max: 650 });
  });

  it('ignores exclusions (they only narrow post-filter)', () => {
    expect(sqlNumericBounds(parseCriteria('100-200,<>150'))).toEqual({ min: 100, max: 200 });
  });

  it('returns null for exclusion-only expression', () => {
    // No positive tokens = nothing to bound
    expect(sqlNumericBounds(parseCriteria('<>150'))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && pnpm jest criteriaGrammar.test.ts -t 'sqlNumericBounds'
```

Expected: FAIL with `sqlNumericBounds is not a function` (or TypeScript compile error on the import).

- [ ] **Step 3: Implement `sqlNumericBounds`**

Append to `apps/api/src/utils/criteriaGrammar.ts` (after `sqlInLiterals`):

```ts
/**
 * Returns { min, max } covering every non-excluded numeric token (literal or
 * numeric range) in the expression, or null if the expression is empty, any
 * non-numeric token is present, or the expression contains only exclusions.
 *
 * Used by adapters to push a loose `BETWEEN ? AND ?` pre-filter down to the
 * database before `matchesCriteria()` runs the exact per-row check in memory.
 * Exclusions never widen or narrow the SQL bound — they only tighten the
 * in-memory post-filter.
 */
export function sqlNumericBounds(
  expr: CriteriaExpression,
): { min: number; max: number } | null {
  if (expr.empty) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sawPositive = false;

  for (const t of expr.tokens) {
    if (t.excluded) continue;
    switch (t.kind) {
      case 'literal': {
        if (!/^-?\d+$/.test(t.value)) return null;
        const n = Number(t.value);
        if (n < min) min = n;
        if (n > max) max = n;
        sawPositive = true;
        break;
      }
      case 'range': {
        if (!t.numeric) return null;
        const from = Number(t.from);
        const to = Number(t.to);
        if (from < min) min = from;
        if (to > max) max = to;
        sawPositive = true;
        break;
      }
      case 'pattern':
        return null;
    }
  }
  return sawPositive ? { min, max } : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/api && pnpm jest criteriaGrammar.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/utils/criteriaGrammar.ts apps/api/tests/criteriaGrammar.test.ts
git commit -m "feat(criteria-grammar): add sqlNumericBounds for IN/BETWEEN push-down

Complements sqlInLiterals(): returns { min, max } for purely numeric
expressions so adapters can push a loose BETWEEN filter down to Access.
The exact per-row check still runs in memory via matchesCriteria()."
```

---

## Task 3: Add `computeRoiTurnsGp()` metrics helper

**Files:**
- Create: `apps/api/src/services/salesReporting/metrics.ts`
- Test: `apps/api/tests/salesAnalysisMetrics.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/salesAnalysisMetrics.test.ts`:

```ts
import { computeRoiTurnsGp } from '../src/services/salesReporting/metrics';

describe('computeRoiTurnsGp', () => {
  it('returns all nulls when everything is zero', () => {
    expect(
      computeRoiTurnsGp({
        netSales: 0,
        cogs: 0,
        grossProfit: 0,
        onHandAtCost: 0,
        periodDays: 30,
      }),
    ).toEqual({ gpPct: null, turns: null, roiPct: null });
  });

  it('returns null GP% when netSales is zero', () => {
    const m = computeRoiTurnsGp({
      netSales: 0,
      cogs: 0,
      grossProfit: 0,
      onHandAtCost: 1000,
      periodDays: 30,
    });
    expect(m.gpPct).toBeNull();
    expect(m.turns).toBe(0);       // cogs=0 → 0 turns
    expect(m.roiPct).toBe(0);      // grossProfit=0 → 0 ROI
  });

  it('returns null Turns and ROI when onHandAtCost is zero', () => {
    const m = computeRoiTurnsGp({
      netSales: 1000,
      cogs: 400,
      grossProfit: 600,
      onHandAtCost: 0,
      periodDays: 30,
    });
    expect(m.gpPct).toBeCloseTo(60.0, 1);
    expect(m.turns).toBeNull();
    expect(m.roiPct).toBeNull();
  });

  it('returns null when periodDays is zero or negative', () => {
    const m = computeRoiTurnsGp({
      netSales: 1000,
      cogs: 400,
      grossProfit: 600,
      onHandAtCost: 1000,
      periodDays: 0,
    });
    expect(m.turns).toBeNull();
    expect(m.roiPct).toBeNull();
  });

  it('annualizes a typical 30-day period', () => {
    // 30-day window: COGS=1,000, GP=500, inventory=5,000 at cost
    // Turns  = (1000 * 365/30) / 5000 = 2.433
    // ROI%   = (500  * 365/30) / 5000 = 1.217  (× per year)
    // GP%    = 500 / 1500 = 33.3%
    const m = computeRoiTurnsGp({
      netSales: 1500,
      cogs: 1000,
      grossProfit: 500,
      onHandAtCost: 5000,
      periodDays: 30,
    });
    expect(m.gpPct).toBeCloseTo(33.3, 1);
    expect(m.turns).toBeCloseTo(2.433, 2);
    expect(m.roiPct).toBeCloseTo(1.217, 2);
  });

  it('matches the screenshot reference row (Sector 5 MTD)', () => {
    // From the user's RICS screenshot, Sector 5 ZAPATO MUJER MTD:
    //   Sales=1,075,817.11  Profit=603,482.36  GP=56.1%  onHand value=62,805,409.97
    //   (period ~15 days = MTD mid-April). Expect ROI% ~0.057× annualized on
    //   this denominator; ROI higher if dollars are in thousands. We assert
    //   on the formula shape rather than the exact RICS print (RICS truncates).
    const periodDays = 15;
    const m = computeRoiTurnsGp({
      netSales: 1_075_817.11,
      cogs: 472_334.75,                  // netSales - grossProfit
      grossProfit: 603_482.36,
      onHandAtCost: 62_805_409.97,
      periodDays,
    });
    expect(m.gpPct).toBeCloseTo(56.1, 1);
    // Annualized: grossProfit * (365/15) / onHandAtCost
    const expectedRoi = (603_482.36 * (365 / 15)) / 62_805_409.97;
    expect(m.roiPct).toBeCloseTo(expectedRoi, 3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && pnpm jest salesAnalysisMetrics.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `metrics.ts`**

Create `apps/api/src/services/salesReporting/metrics.ts`:

```ts
/**
 * RICS Ch. 6 p. 87 metric triple. Computes GP%, Turns, and ROI% (GMROI) from
 * sales aggregates and an on-hand-at-cost denominator. The manual specifies
 * ROI and Turns are "always annualized regardless of what period is being
 * analyzed" (p. 87), so callers pass the inclusive day count of the window.
 *
 * All formulas return null when their denominator is missing/zero. GP% uses
 * netSales as its denominator; Turns and ROI both use onHandAtCost.
 */

export interface MetricsInput {
  netSales: number;
  cogs: number;
  grossProfit: number;     // typically netSales - cogs; passed explicitly so callers can use a pre-rounded value
  onHandAtCost: number;    // Σ(OnHandQty × CurrentCost) for the dimension; 0 when unknown
  periodDays: number;      // inclusive day count of [startDate, endDate]
}

export interface MetricsOutput {
  gpPct: number | null;    // percent, one decimal (e.g. 56.1)
  turns: number | null;    // times per year (e.g. 5.0)
  roiPct: number | null;   // GMROI, times per year (e.g. 11.2)
}

export function computeRoiTurnsGp(input: MetricsInput): MetricsOutput {
  const { netSales, cogs, grossProfit, onHandAtCost, periodDays } = input;

  const gpPct =
    netSales === 0 ? null : round1((grossProfit / netSales) * 100);

  if (onHandAtCost <= 0 || periodDays <= 0) {
    return { gpPct, turns: null, roiPct: null };
  }

  const annualizer = 365 / periodDays;
  return {
    gpPct,
    turns: round2((cogs * annualizer) / onHandAtCost),
    roiPct: round2((grossProfit * annualizer) / onHandAtCost),
  };
}

function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/api && pnpm jest salesAnalysisMetrics.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/salesReporting/metrics.ts apps/api/tests/salesAnalysisMetrics.test.ts
git commit -m "feat(sales-reporting): add computeRoiTurnsGp metrics helper

Implements RICS Ch. 6 p. 87 definitions for GP%, Turns, and ROI%
(GMROI). All three are 'always annualized regardless of what period
is being analyzed' per the manual, so callers pass the inclusive day
count of the reporting window. Nulls propagate when a denominator
is zero."
```

---

## Task 4: Extend `SalesAnalysisCriteria` / `SalesAnalysisRow` / `SalesAnalysisReport` types

**Files:**
- Modify: `apps/api/src/services/salesReporting/types.ts`

This task is pure type plumbing with no runtime behavior, so no new test is written — but the existing tests must still type-check after the change.

- [ ] **Step 1: Extend `SalesAnalysisCriteria`**

In `apps/api/src/services/salesReporting/types.ts`, replace the existing `SalesAnalysisCriteria` interface with:

```ts
export interface SalesAnalysisCriteria {
  // Structured selections — IDs / codes picked from the dropdown.
  stores?: number[];
  categories?: number[];
  vendors?: string[];
  seasons?: string[];
  skus?: string[];
  /** Wildcard / glob pattern (`*` = any chars, `?` = one char). Requires RIINVMAS join. */
  styleColor?: string;
  /** Group code(s) from RIGROUP.GroupCodes. Requires RIINVMAS join. */
  groups?: string[];
  /** Keyword pattern(s). Requires RIINVMAS join. */
  keywords?: string[];

  // Raw RICS-grammar text per facet (see apps/api/src/utils/criteriaGrammar.ts).
  // Merge semantics: a facet matches if (structured selection matches) OR
  // (grammar inclusion matches), then grammar exclusions narrow on top.
  // Exclusion-only grammar narrows the structured picks (it does not widen
  // to the universe).
  storesRaw?: string;
  categoriesRaw?: string;
  vendorsRaw?: string;
  seasonsRaw?: string;
  skusRaw?: string;
  groupsRaw?: string;
  keywordsRaw?: string;
  styleColorRaw?: string;
}
```

- [ ] **Step 2: Extend `SalesAnalysisRow` and `SalesAnalysisReport`**

Replace `SalesAnalysisRow`:

```ts
export interface SalesAnalysisRow {
  dimensionKey: string;
  dimensionLabel: string | null;
  storeNumber: number | null;   // null when storeOption=COMBINE
  qty: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  gpPct: number | null;         // grossProfit / netSales × 100; null when netSales=0
  onHandAtCost: number;         // Σ(OnHand × CurrentCost) for the dimension; 0 when unknown
  turns: number | null;         // annualized; null when onHandAtCost=0
  roiPct: number | null;        // GMROI, annualized; null when onHandAtCost=0
  priorYearNetSales: number | null;
  pyPctChange: number | null;
}
```

Replace `SalesAnalysisReport`:

```ts
export interface SalesAnalysisReport {
  dimension: SalesAnalysisDimension;
  reportType: SalesAnalysisReportType;
  storeOption: SalesAnalysisStoreOption;
  criteria: SalesAnalysisCriteria;
  printing: SalesAnalysisPrinting;
  rows: SalesAnalysisRow[];
  totals: {
    qty: number;
    netSales: number;
    cogs: number;
    grossProfit: number;
    onHandAtCost: number;
    gpPct: number | null;
    turns: number | null;
    roiPct: number | null;
    priorYearNetSales: number | null;
  };
  periodDays: number;
}
```

- [ ] **Step 3: Verify the API still builds**

```bash
cd apps/api && pnpm tsc --noEmit
```

Expected: errors in `ricsSalesReportAdapter.ts` where it constructs rows and totals missing the new fields. Those are fixed in Task 6.

- [ ] **Step 4: Stub the new fields in the adapter so build stays green**

In `apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts`, in the block that constructs each row (around line 1196), add the three new fields as stubs:

```ts
      return {
        dimensionKey: b.dimensionKey,
        dimensionLabel: b.dimensionLabel,
        storeNumber: b.storeNumber,
        qty: b.qty,
        netSales: round2(b.netSales),
        cogs: round2(b.cogs),
        grossProfit: round2(grossProfit),
        gpPct: b.netSales === 0 ? null : round1((grossProfit / b.netSales) * 100),
        onHandAtCost: 0,        // STUB — populated in Task 6
        turns: null,            // STUB — populated in Task 6
        roiPct: null,           // STUB — populated in Task 6
        priorYearNetSales: priorYear != null ? round2(priorYear) : null,
        pyPctChange: priorYear == null || priorYear === 0
          ? null
          : round1(((b.netSales - priorYear) / priorYear) * 100),
      };
```

In the same file, find the `totals` object (around line 1218) and widen it:

```ts
  const totals = {
    qty: rows.reduce((s, r) => s + r.qty, 0),
    netSales: round2(rows.reduce((s, r) => s + r.netSales, 0)),
    cogs: round2(rows.reduce((s, r) => s + r.cogs, 0)),
    grossProfit: round2(rows.reduce((s, r) => s + r.grossProfit, 0)),
    onHandAtCost: 0,       // STUB — populated in Task 6
    gpPct: null as number | null,  // STUB — populated in Task 6
    turns: null as number | null,  // STUB — populated in Task 6
    roiPct: null as number | null, // STUB — populated in Task 6
    priorYearNetSales: priorYearByDimStore
      ? round2(rows.reduce((s, r) => s + (r.priorYearNetSales ?? 0), 0))
      : null,
  };
```

Add `periodDays` to the returned report object:

```ts
  const periodDays =
    Math.round(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000,
    ) + 1;

  return {
    dimension: params.dimension,
    reportType: params.reportType,
    storeOption: params.storeOption,
    criteria: params.criteria,
    printing: params.printing,
    rows,
    totals,
    periodDays,
  };
```

- [ ] **Step 5: Re-run type check**

```bash
cd apps/api && pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Run the existing sales-analysis test**

```bash
cd apps/api && pnpm jest ricsSalesReport.test.ts
```

If existing assertions fail because of added fields (e.g. `toEqual` strict match), update those tests to use `expect.objectContaining({...})` so they pass despite the new fields. Do NOT weaken the existing field assertions.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/salesReporting/types.ts apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts apps/api/tests/ricsSalesReport.test.ts
git commit -m "feat(sales-reporting): widen SalesAnalysis types for ROI/Turns/rawCriteria

Extends the wire type with raw RICS-grammar fields (*Raw) alongside
the existing structured IDs, and with onHandAtCost/turns/roiPct on
every row plus totals. Adapter stubs the new fields with zero/null;
real values are populated in a follow-up task once the on-hand
adapter is in place."
```

---

## Task 5: Build `getOnHandAtCostByDimension()` on-hand adapter

**Files:**
- Create: `apps/api/src/services/salesReporting/ricsOnHandAtCostAdapter.ts`
- Test: `apps/api/tests/ricsOnHandAtCost.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/ricsOnHandAtCost.test.ts`. Reuse the same mocking pattern as `ricsSalesReport.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';

jest.spyOn(fs, 'existsSync').mockImplementation(() => true);

type MockSpec = { match: (sql: string) => boolean; rows: unknown[] };
let mockSpecs: MockSpec[] = [];
function setMockRows(specs: MockSpec[]): void { mockSpecs = specs; }

jest.mock('../src/services/accessOleDb', () => {
  const actual = jest.requireActual('../src/services/accessOleDb');
  return {
    ...actual,
    ricsDbPath: (f: string) => path.join('/fake', f),
    getOrRecoverPassword: () => 'fake-password',
    runPowerShellJson: <T,>(script: string): T => {
      for (const spec of mockSpecs) {
        if (spec.match(script)) return spec.rows as unknown as T;
      }
      return [] as unknown as T;
    },
    buildSelectScript: (_db: string, _pw: string, sql: string) => sql,
    buildListTablesScript: () => '',
    buildListColumnsScript: () => '',
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getOnHandAtCostByDimension } = require('../src/services/salesReporting/ricsOnHandAtCostAdapter');

const sqlMatches = (needle: string) => (sql: string) => sql.includes(needle);

describe('getOnHandAtCostByDimension', () => {
  it('groups by category for CATEGORY_SUMMARY', async () => {
    setMockRows([
      // RIINVQUA sum rows per (SKU, Store). Two SKUs, two stores.
      {
        match: sqlMatches('FROM [Inventory Quantities]'),
        rows: [
          { SKU: 'A', Store: 2, TotalOnHand: 10 },
          { SKU: 'A', Store: 16, TotalOnHand: 5 },
          { SKU: 'B', Store: 2, TotalOnHand: 3 },
        ],
      },
      // RIINVMAS lite rows mapping SKU → Category + CurrentCost
      {
        match: sqlMatches('FROM [InventoryMaster]'),
        rows: [
          { SKU: 'A', Category: 556, CurrentCost: 100, Vendor: 'V1', Season: null },
          { SKU: 'B', Category: 556, CurrentCost: 50, Vendor: 'V1', Season: null },
        ],
      },
    ]);

    const map = await getOnHandAtCostByDimension({
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'COMBINE',
      criteria: {},
    });

    // A: (10+5)*100 = 1500; B: 3*50 = 150. Total for category 556 = 1650.
    expect(map.get('556')).toBeCloseTo(1650, 2);
  });

  it('groups by store when storeOption !== COMBINE', async () => {
    setMockRows([
      {
        match: sqlMatches('FROM [Inventory Quantities]'),
        rows: [
          { SKU: 'A', Store: 2, TotalOnHand: 10 },
          { SKU: 'A', Store: 16, TotalOnHand: 5 },
        ],
      },
      {
        match: sqlMatches('FROM [InventoryMaster]'),
        rows: [{ SKU: 'A', Category: 556, CurrentCost: 100, Vendor: 'V1', Season: null }],
      },
    ]);

    const map = await getOnHandAtCostByDimension({
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'SEPARATE',
      criteria: {},
    });

    expect(map.get('556|2')).toBeCloseTo(1000, 2);
    expect(map.get('556|16')).toBeCloseTo(500, 2);
  });

  it('applies structured category filter', async () => {
    setMockRows([
      {
        match: sqlMatches('FROM [Inventory Quantities]'),
        rows: [
          { SKU: 'A', Store: 2, TotalOnHand: 10 },
          { SKU: 'B', Store: 2, TotalOnHand: 10 },
        ],
      },
      {
        match: sqlMatches('FROM [InventoryMaster]'),
        rows: [
          { SKU: 'A', Category: 556, CurrentCost: 100, Vendor: 'V1', Season: null },
          { SKU: 'B', Category: 600, CurrentCost: 100, Vendor: 'V1', Season: null },
        ],
      },
    ]);

    const map = await getOnHandAtCostByDimension({
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'COMBINE',
      criteria: { categories: [556] },
    });

    expect(map.get('556')).toBeCloseTo(1000, 2);
    expect(map.has('600')).toBe(false);
  });

  it('applies categoriesRaw range', async () => {
    setMockRows([
      {
        match: sqlMatches('FROM [Inventory Quantities]'),
        rows: [
          { SKU: 'A', Store: 2, TotalOnHand: 10 },
          { SKU: 'B', Store: 2, TotalOnHand: 10 },
          { SKU: 'C', Store: 2, TotalOnHand: 10 },
        ],
      },
      {
        match: sqlMatches('FROM [InventoryMaster]'),
        rows: [
          { SKU: 'A', Category: 560, CurrentCost: 100, Vendor: 'V1', Season: null },
          { SKU: 'B', Category: 599, CurrentCost: 100, Vendor: 'V1', Season: null },
          { SKU: 'C', Category: 700, CurrentCost: 100, Vendor: 'V1', Season: null },
        ],
      },
    ]);

    const map = await getOnHandAtCostByDimension({
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'COMBINE',
      criteria: { categoriesRaw: '556-599' },
    });

    expect(map.get('560')).toBeCloseTo(1000, 2);
    expect(map.get('599')).toBeCloseTo(1000, 2);
    expect(map.has('700')).toBe(false);
  });

  it('returns empty map for RIINVMAS-dependent report types not yet wired', async () => {
    const map = await getOnHandAtCostByDimension({
      reportType: 'GROUP_SUMMARY',
      storeOption: 'COMBINE',
      criteria: {},
    });
    expect(map.size).toBe(0);
  });

  it('groups by vendor code for VENDOR_SUMMARY', async () => {
    setMockRows([
      {
        match: sqlMatches('FROM [Inventory Quantities]'),
        rows: [
          { SKU: 'A', Store: 2, TotalOnHand: 10 },
          { SKU: 'B', Store: 2, TotalOnHand: 5 },
        ],
      },
      {
        match: sqlMatches('FROM [InventoryMaster]'),
        rows: [
          { SKU: 'A', Category: 1, CurrentCost: 100, Vendor: 'NIKE', Season: null },
          { SKU: 'B', Category: 2, CurrentCost: 100, Vendor: 'NIKE', Season: null },
        ],
      },
    ]);

    const map = await getOnHandAtCostByDimension({
      reportType: 'VENDOR_SUMMARY',
      storeOption: 'COMBINE',
      criteria: {},
    });
    expect(map.get('NIKE')).toBeCloseTo(1500, 2);
  });

  it('groups by SKU for SKU_DETAIL', async () => {
    setMockRows([
      {
        match: sqlMatches('FROM [Inventory Quantities]'),
        rows: [
          { SKU: 'KISS001-BK', Store: 2, TotalOnHand: 10 },
          { SKU: 'KISS002-BK', Store: 2, TotalOnHand: 5 },
        ],
      },
      {
        match: sqlMatches('FROM [InventoryMaster]'),
        rows: [
          { SKU: 'KISS001-BK', Category: 556, CurrentCost: 100, Vendor: 'V1', Season: null },
          { SKU: 'KISS002-BK', Category: 556, CurrentCost: 80, Vendor: 'V1', Season: null },
        ],
      },
    ]);

    const map = await getOnHandAtCostByDimension({
      reportType: 'SKU_DETAIL',
      storeOption: 'COMBINE',
      criteria: {},
    });
    expect(map.get('KISS001-BK')).toBeCloseTo(1000, 2);
    expect(map.get('KISS002-BK')).toBeCloseTo(400, 2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && pnpm jest ricsOnHandAtCost.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the adapter**

Create `apps/api/src/services/salesReporting/ricsOnHandAtCostAdapter.ts`:

```ts
/**
 * On-hand-at-cost aggregator for Sales Analysis ROI/Turns columns.
 *
 * Joins RIINVQUA (OnHand per SKU×Store, wide-column OnHand_01..18 summed
 * into TotalOnHand) with RIINVMAS (Category, Vendor, CurrentCost) and groups
 * the resulting (OnHand × CurrentCost) by whatever dimension the sales
 * summary is grouping at. Result is a Map keyed by the dimensionKey (or
 * `${dimensionKey}|${storeNumber}` when per-store).
 *
 * Phase 1: live read from the RICS MDBs. RIINVMAS-join-only dimensions
 * (GROUP / SEASON / STYLE_COLOR / SECTOR summary) return an empty map; the
 * sales facade renders null for ROI/Turns on those reports until Phase 2.5.
 */

import path from 'node:path';
import {
  ricsDbPath,
  getOrRecoverPassword,
  runPowerShellJson,
  buildSelectScript,
} from '../accessOleDb';
import {
  parseCriteria,
  matchesCriteria,
} from '../../utils/criteriaGrammar';
import type {
  SalesAnalysisCriteria,
  SalesAnalysisReportType,
  SalesAnalysisStoreOption,
} from './types';

const INVQUA_MDB = () =>
  process.env.RICS_INVQUA_DB_FILE ?? ricsDbPath('RIINVQUA.MDB');
const INVMAS_MDB = () =>
  process.env.RICS_INVMAS_DB_FILE ?? ricsDbPath('RIINVMAS.MDB');

const MASTER_JOIN_ONLY = new Set<SalesAnalysisReportType>([
  'GROUP_SUMMARY',
  'SEASON_SUMMARY',
  'STYLE_COLOR_SUMMARY',
  'SECTOR_SUMMARY',
]);

interface QuaRow {
  SKU: string | null;
  Store: number | null;
  TotalOnHand: number | null;
}

interface MasterRow {
  SKU: string | null;
  Category: number | null;
  Vendor: string | null;
  Season: string | null;
  CurrentCost: number | null;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export async function getOnHandAtCostByDimension(params: {
  reportType: SalesAnalysisReportType;
  storeOption: SalesAnalysisStoreOption;
  criteria: SalesAnalysisCriteria;
}): Promise<Map<string, number>> {
  // Phase 2.5 dimensions — not wired yet; return empty so ROI/Turns render null.
  if (MASTER_JOIN_ONLY.has(params.reportType)) {
    return new Map();
  }

  const pw = getOrRecoverPassword();

  // 1) Pull RIINVQUA rows aggregated per (SKU, Store).
  const onHandExpr = Array.from({ length: 18 }, (_, i) =>
    `IIF([OnHand_${pad2(i + 1)}] IS NULL, 0, [OnHand_${pad2(i + 1)}])`,
  ).join(' + ');
  const quaSql = `SELECT [SKU], [Store], SUM(${onHandExpr}) AS TotalOnHand
FROM [Inventory Quantities]
GROUP BY [SKU], [Store]`;
  const quaScript = buildSelectScript(INVQUA_MDB(), pw, quaSql);
  const qua = runPowerShellJson<QuaRow[]>(quaScript) ?? [];

  // 2) Pull RIINVMAS lite rows, filtered by structured criteria where possible.
  const masterWheres: string[] = [`([Status] IS NULL OR [Status] <> 'D')`];
  if (params.criteria.categories?.length) {
    masterWheres.push(
      `[Category] IN (${params.criteria.categories.map((c) => Number(c)).join(',')})`,
    );
  }
  if (params.criteria.vendors?.length) {
    const list = params.criteria.vendors
      .map((v) => `'${String(v).trim().replace(/'/g, "''")}'`)
      .join(',');
    masterWheres.push(`[Vendor] IN (${list})`);
  }
  if (params.criteria.skus?.length) {
    const list = params.criteria.skus
      .map((s) => `'${String(s).trim().replace(/'/g, "''")}'`)
      .join(',');
    masterWheres.push(`[SKU] IN (${list})`);
  }
  const masterSql = `SELECT [SKU], [Category], [Vendor], [Season], [CurrentCost]
FROM [InventoryMaster]
WHERE ${masterWheres.join(' AND ')}`;
  const masterScript = buildSelectScript(INVMAS_MDB(), pw, masterSql);
  const masters = runPowerShellJson<MasterRow[]>(masterScript) ?? [];

  // 3) Apply grammar filters in memory (categoriesRaw, vendorsRaw, skusRaw).
  const categoryExpr = parseCriteria(params.criteria.categoriesRaw);
  const vendorExpr = parseCriteria(params.criteria.vendorsRaw);
  const skuExpr = parseCriteria(params.criteria.skusRaw);
  const storeExpr = parseCriteria(params.criteria.storesRaw);

  const structuredStores = params.criteria.stores ?? null;
  const structuredCategories = params.criteria.categories ?? null;
  const structuredVendors = params.criteria.vendors ?? null;
  const structuredSkus = params.criteria.skus ?? null;

  function keep<T>(
    structured: T[] | null,
    expr: ReturnType<typeof parseCriteria>,
    candidate: T | null,
  ): boolean {
    // Merge semantics: S-and-G spec §2.
    const structuredHit =
      structured != null && structured.length > 0 && candidate != null &&
      (structured as Array<T>).some((x) => String(x) === String(candidate));
    const grammarIncluded = expr.tokens.some((t) => !t.excluded);
    const grammarExcluded = expr.tokens.some((t) => t.excluded);

    if (!structured?.length && expr.empty) return true;  // no filter
    if (expr.empty) return !!structuredHit;              // structured-only
    if (!structured?.length) return matchesCriteria(expr, candidate as string | number);

    // Both present.
    if (grammarIncluded) {
      // S ∪ include(G), then apply exclusions.
      const inUnion = structuredHit || matchesCriteria(expr, candidate as string | number);
      if (!inUnion) return false;
      if (!grammarExcluded) return true;
      // Re-run matchesCriteria on an exclusion-only sub-expr to apply them.
      const exOnly = {
        ...expr,
        tokens: expr.tokens.filter((t) => t.excluded),
      };
      return matchesCriteria(exOnly, candidate as string | number);
    } else {
      // Exclusion-only grammar narrows structured picks.
      if (!structuredHit) return false;
      return matchesCriteria(expr, candidate as string | number);
    }
  }

  const masterBySku = new Map<string, MasterRow>();
  for (const m of masters) {
    if (!m.SKU) continue;
    if (!keep(structuredCategories, categoryExpr, m.Category ?? null)) continue;
    if (!keep(structuredVendors, vendorExpr, m.Vendor?.trim() ?? null)) continue;
    if (!keep(structuredSkus, skuExpr, m.SKU.trim())) continue;
    masterBySku.set(m.SKU.trim(), m);
  }

  // 4) Aggregate.
  const combine = params.storeOption === 'COMBINE';
  const out = new Map<string, number>();

  for (const q of qua) {
    const sku = q.SKU?.trim();
    if (!sku) continue;
    const m = masterBySku.get(sku);
    if (!m) continue;
    const store = Number(q.Store ?? 0);
    if (!keep(structuredStores, storeExpr, store)) continue;

    const onHand = Number(q.TotalOnHand ?? 0);
    const cost = Number(m.CurrentCost ?? 0);
    if (onHand <= 0 || cost <= 0) continue;
    const value = onHand * cost;

    const dimKey = dimensionKeyFor(params.reportType, sku, m);
    if (!dimKey) continue;
    const key = combine ? dimKey : `${dimKey}|${store}`;
    out.set(key, (out.get(key) ?? 0) + value);
  }

  return out;
}

function dimensionKeyFor(
  reportType: SalesAnalysisReportType,
  sku: string,
  m: MasterRow,
): string | null {
  switch (reportType) {
    case 'SKU_DETAIL':
      return sku;
    case 'CATEGORY_SUMMARY':
      return m.Category != null ? String(m.Category) : null;
    case 'VENDOR_SUMMARY':
      return m.Vendor?.trim() || null;
    case 'DEPT_SUMMARY':
      // Department requires the RIDEPT map; the caller (facade) can't inject
      // here without a circular import. Strategy: key by category, then the
      // facade re-buckets via its existing dept map when pairing rows.
      return m.Category != null ? `CAT:${m.Category}` : null;
    case 'PRICE_POINT_SUMMARY':
      // Price-point bucketing requires RetailPrice; handled by the sales
      // adapter's own bucketization. We key by `PP:${sku}` so the facade can
      // re-aggregate alongside its per-bucket SKU list.
      return `PP:${sku}`;
    default:
      return null;
  }
}
```

**Note:** The `DEPT_SUMMARY` / `PRICE_POINT_SUMMARY` handling above delegates the final bucketing to the facade — see Task 6 for the wiring. The tests in Step 1 cover the direct cases (CATEGORY, VENDOR, SKU_DETAIL).

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/api && pnpm jest ricsOnHandAtCost.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/salesReporting/ricsOnHandAtCostAdapter.ts apps/api/tests/ricsOnHandAtCost.test.ts
git commit -m "feat(sales-reporting): add ricsOnHandAtCostAdapter

Joins RIINVQUA OnHand × RIINVMAS CurrentCost and groups by the
sales-summary dimension (category / vendor / SKU / dept /
price-point). Feeds the Turns/ROI denominator on every
Sales-Analysis row. Structured criteria push into the WHERE clause;
*Raw grammar filters in memory via matchesCriteria()."
```

---

## Task 6: Wire on-hand + metrics into the facade (+ DEPT/PP bucketing)

**Files:**
- Modify: `apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts` — fold on-hand map into the rows AND totals.
- Modify: `apps/api/src/services/salesReporting/salesReportFacade.ts` — no change; adapter does the work because it already owns the bucketing.
- Test: `apps/api/tests/ricsSalesReport.test.ts`

**Why here not the facade:** The adapter is the only place with the dept-category map (`loadDepartmentMap`) and the price-point bucket list. Folding the on-hand map in here keeps the existing shape and avoids duplicating bucketing logic.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/tests/ricsSalesReport.test.ts`:

```ts
it('SalesAnalysis rows carry onHandAtCost, turns, and roiPct', async () => {
  setMockRows([
    { match: sqlMatches('FROM [Stores]'), rows: STORE_ROWS },
    { match: sqlMatches('FROM [Salespeople]'), rows: SALESPERSON_ROWS },
    {
      match: sqlMatches('FROM TicketHeader'),
      rows: [
        { H_Store: 2, H_Ticket: 1, H_RealDate: dateMs('2026-04-01'), H_Cashier: 'A', H_Posted: 'Y',
          D_SKU: 'A', D_Qty: 10, D_Extension: 1500, D_Cost: 100, D_Category: 556, D_Vendor: 'V1', D_RealPrice: 150, D_Column: '', D_Row: '', D_Perks: 0, D_SalesPerson: 'GAMU', D_ReturnCode: 0 },
      ],
    },
    // on-hand adapter will hit these:
    {
      match: sqlMatches('FROM [Inventory Quantities]'),
      rows: [{ SKU: 'A', Store: 2, TotalOnHand: 50 }],
    },
    {
      match: sqlMatches('FROM [InventoryMaster]'),
      rows: [{ SKU: 'A', Category: 556, Vendor: 'V1', Season: null, CurrentCost: 100 }],
    },
  ]);

  const report = await adapter.getSalesAnalysis({
    dimension: 'CATEGORY',
    reportType: 'CATEGORY_SUMMARY',
    storeOption: 'COMBINE',
    criteria: {},
    printing: {},
    startDate: '2026-04-01',
    endDate: '2026-04-30',   // 30 days inclusive
  });

  expect(report.rows).toHaveLength(1);
  const row = report.rows[0];
  expect(row.dimensionKey).toBe('556');
  // on-hand 50 × cost 100 = 5000
  expect(row.onHandAtCost).toBeCloseTo(5000, 2);
  // COGS = 100 × 10 = 1000; annualizer 365/30 = 12.166; Turns = 1000*12.166/5000 ≈ 2.43
  expect(row.turns).toBeCloseTo(2.43, 1);
  // grossProfit = 1500 - 1000 = 500; ROI = 500*12.166/5000 ≈ 1.22
  expect(row.roiPct).toBeCloseTo(1.22, 1);
  // totals mirror the single row
  expect(report.totals.onHandAtCost).toBeCloseTo(5000, 2);
  expect(report.totals.turns).toBeCloseTo(2.43, 1);
  expect(report.totals.roiPct).toBeCloseTo(1.22, 1);
  expect(report.periodDays).toBe(30);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/api && pnpm jest ricsSalesReport.test.ts -t 'onHandAtCost, turns, and roiPct'
```

Expected: FAIL — `onHandAtCost` is 0, `turns` is null (Task 4 stubs).

- [ ] **Step 3: Wire the adapter to use the on-hand adapter + metrics**

At the top of `apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts`, add imports (if not already present):

```ts
import { getOnHandAtCostByDimension } from './ricsOnHandAtCostAdapter';
import { computeRoiTurnsGp } from './metrics';
```

In `getSalesAnalysis` (~line 1100), after the buckets are built and before the `.map().sort()` call, fetch the on-hand map:

```ts
  // On-hand-at-cost (Turns/ROI denominator).
  const onHandMap = await getOnHandAtCostByDimension({
    reportType: params.reportType,
    storeOption: params.storeOption,
    criteria: params.criteria,
  });
```

For `DEPT_SUMMARY` the on-hand map's keys are `CAT:${category}`. Resolve them into dept buckets here by walking the map once:

```ts
  let onHandLookup = onHandMap;
  if (params.reportType === 'DEPT_SUMMARY' && deptMap) {
    onHandLookup = new Map<string, number>();
    for (const [k, v] of onHandMap) {
      // Key shapes: `CAT:<cat>` or `CAT:<cat>|<store>`
      const pipeIdx = k.indexOf('|');
      const head = pipeIdx === -1 ? k : k.slice(0, pipeIdx);
      const tail = pipeIdx === -1 ? '' : k.slice(pipeIdx);
      const catNum = Number(head.replace(/^CAT:/, ''));
      const dept = deptNumberForCategory(catNum, deptMap);
      if (dept == null) continue;
      const newKey = `${dept}${tail}`;
      onHandLookup.set(newKey, (onHandLookup.get(newKey) ?? 0) + v);
    }
  }

  if (params.reportType === 'PRICE_POINT_SUMMARY') {
    // The sales path already bucketized via its own price-point logic; the
    // on-hand map keys are `PP:<sku>[|<store>]`. Re-bucket those SKUs into
    // the same $25 buckets the sales query uses, then drop the PP: prefix.
    onHandLookup = rebucketPriceP​oint(onHandMap, masterBySkuForPricePoint);
    // masterBySkuForPricePoint is expected from the price-point aggregation
    // block above; if the current adapter doesn't expose it, fall back to
    // returning an empty map (ROI/Turns render as null on price-point rows).
  }
```

**If `PRICE_POINT_SUMMARY` bucketing would require significant adapter refactoring**, defer this by leaving `onHandLookup` empty for that report type — ROI/Turns will render as `null`, documented as Open Question 2 in the spec.

In the `.map()` that builds rows (around line 1191), replace the stub lines from Task 4 with real values:

```ts
  const periodDays =
    Math.round(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000,
    ) + 1;

  const rows: SalesAnalysisRow[] = [...buckets.values()]
    .map((b) => {
      const grossProfit = b.netSales - b.cogs;
      const mapKey = `${b.dimensionKey}|${b.storeNumber ?? '*'}`;
      const priorYear = priorYearByDimStore?.get(mapKey) ?? null;

      const onHandKey =
        params.storeOption === 'COMBINE'
          ? b.dimensionKey
          : `${b.dimensionKey}|${b.storeNumber}`;
      const onHandAtCost = onHandLookup.get(onHandKey) ?? 0;

      const metrics = computeRoiTurnsGp({
        netSales: b.netSales,
        cogs: b.cogs,
        grossProfit,
        onHandAtCost,
        periodDays,
      });

      return {
        dimensionKey: b.dimensionKey,
        dimensionLabel: b.dimensionLabel,
        storeNumber: b.storeNumber,
        qty: b.qty,
        netSales: round2(b.netSales),
        cogs: round2(b.cogs),
        grossProfit: round2(grossProfit),
        gpPct: metrics.gpPct,
        onHandAtCost: round2(onHandAtCost),
        turns: metrics.turns,
        roiPct: metrics.roiPct,
        priorYearNetSales: priorYear != null ? round2(priorYear) : null,
        pyPctChange: priorYear == null || priorYear === 0
          ? null
          : round1(((b.netSales - priorYear) / priorYear) * 100),
      };
    })
    .sort((a, b) =>
      a.dimensionKey.localeCompare(b.dimensionKey, undefined, {
        numeric: true,
        sensitivity: 'base',
      }));
```

Update `totals` to recompute ROI / Turns / GP% from Σ values (not an average of row-level metrics):

```ts
  const totalNetSales = rows.reduce((s, r) => s + r.netSales, 0);
  const totalCogs = rows.reduce((s, r) => s + r.cogs, 0);
  const totalGrossProfit = rows.reduce((s, r) => s + r.grossProfit, 0);
  const totalOnHandAtCost = rows.reduce((s, r) => s + r.onHandAtCost, 0);
  const totalsMetrics = computeRoiTurnsGp({
    netSales: totalNetSales,
    cogs: totalCogs,
    grossProfit: totalGrossProfit,
    onHandAtCost: totalOnHandAtCost,
    periodDays,
  });
  const totals = {
    qty: rows.reduce((s, r) => s + r.qty, 0),
    netSales: round2(totalNetSales),
    cogs: round2(totalCogs),
    grossProfit: round2(totalGrossProfit),
    onHandAtCost: round2(totalOnHandAtCost),
    gpPct: totalsMetrics.gpPct,
    turns: totalsMetrics.turns,
    roiPct: totalsMetrics.roiPct,
    priorYearNetSales: priorYearByDimStore
      ? round2(rows.reduce((s, r) => s + (r.priorYearNetSales ?? 0), 0))
      : null,
  };
```

Remove the previously-stubbed `periodDays` calculation if it duplicates.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/api && pnpm jest ricsSalesReport.test.ts -t 'onHandAtCost, turns, and roiPct'
```

Expected: PASS.

- [ ] **Step 5: Run the full adapter test file**

```bash
cd apps/api && pnpm jest ricsSalesReport.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts apps/api/tests/ricsSalesReport.test.ts
git commit -m "feat(sales-reporting): populate ROI/Turns/onHandAtCost on every row

Calls getOnHandAtCostByDimension() and computeRoiTurnsGp() to fill
the fields stubbed in the previous commit. Dept Summary re-buckets
the CAT:* keys via the existing deptNumberForCategory helper.
Totals use Σ-then-compute (not average of row-level ratios) to keep
the summary row accounting-correct."
```

---

## Task 7: Apply `*Raw` grammar in the sales adapter

**Files:**
- Modify: `apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts` — replace `applyAnalysisCriteria` with a grammar-aware version; widen the ticket-line pre-filter to use `sqlNumericBounds` for Stores.
- Test: `apps/api/tests/salesAnalysisGrammar.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/salesAnalysisGrammar.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';

jest.spyOn(fs, 'existsSync').mockImplementation(() => true);

type MockSpec = { match: (sql: string) => boolean; rows: unknown[] };
let mockSpecs: MockSpec[] = [];
function setMockRows(specs: MockSpec[]): void { mockSpecs = specs; }

jest.mock('../src/services/accessOleDb', () => {
  const actual = jest.requireActual('../src/services/accessOleDb');
  return {
    ...actual,
    ricsDbPath: (f: string) => path.join('/fake', f),
    getOrRecoverPassword: () => 'fake-password',
    runPowerShellJson: <T,>(script: string): T => {
      for (const spec of mockSpecs) {
        if (spec.match(script)) return spec.rows as unknown as T;
      }
      return [] as unknown as T;
    },
    buildSelectScript: (_db: string, _pw: string, sql: string) => sql,
    buildListTablesScript: () => '',
    buildListColumnsScript: () => '',
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const adapter = require('../src/services/salesReporting/ricsSalesReportAdapter');

const sqlMatches = (needle: string) => (sql: string) => sql.includes(needle);

function dateMs(isoDate: string): string {
  return `/Date(${Date.UTC(
    Number(isoDate.slice(0, 4)),
    Number(isoDate.slice(5, 7)) - 1,
    Number(isoDate.slice(8, 10)),
    12,
  )})/`;
}

const BASE_MOCKS = (): MockSpec[] => [
  { match: sqlMatches('FROM [Stores]'), rows: [{ Number: 2, Desc: 'S2' }, { Number: 16, Desc: 'S16' }] },
  { match: sqlMatches('FROM [Salespeople]'), rows: [] },
  {
    match: sqlMatches('FROM [Inventory Quantities]'),
    rows: [],
  },
  {
    match: sqlMatches('FROM [InventoryMaster]'),
    rows: [],
  },
];

describe('Sales Analysis — *Raw grammar', () => {
  it('categoriesRaw range "556-599" matches categories in that range', async () => {
    setMockRows([
      ...BASE_MOCKS(),
      {
        match: sqlMatches('FROM TicketHeader'),
        rows: [
          { H_Store: 2, H_Ticket: 1, H_RealDate: dateMs('2026-04-10'), H_Cashier: 'A', H_Posted: 'Y',
            D_SKU: 'A', D_Qty: 1, D_Extension: 100, D_Cost: 50, D_Category: 560, D_Vendor: 'V1', D_RealPrice: 100, D_Column: '', D_Row: '', D_Perks: 0, D_SalesPerson: '', D_ReturnCode: 0 },
          { H_Store: 2, H_Ticket: 2, H_RealDate: dateMs('2026-04-10'), H_Cashier: 'A', H_Posted: 'Y',
            D_SKU: 'B', D_Qty: 1, D_Extension: 100, D_Cost: 50, D_Category: 700, D_Vendor: 'V1', D_RealPrice: 100, D_Column: '', D_Row: '', D_Perks: 0, D_SalesPerson: '', D_ReturnCode: 0 },
        ],
      },
    ]);
    const r = await adapter.getSalesAnalysis({
      dimension: 'CATEGORY',
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'COMBINE',
      criteria: { categoriesRaw: '556-599' },
      printing: {},
      startDate: '2026-04-10',
      endDate: '2026-04-10',
    });
    expect(r.rows.map((x: { dimensionKey: string }) => x.dimensionKey)).toEqual(['560']);
  });

  it('categoriesRaw exclusion "<>560" narrows structured picks', async () => {
    setMockRows([
      ...BASE_MOCKS(),
      {
        match: sqlMatches('FROM TicketHeader'),
        rows: [
          { H_Store: 2, H_Ticket: 1, H_RealDate: dateMs('2026-04-10'), H_Cashier: 'A', H_Posted: 'Y',
            D_SKU: 'A', D_Qty: 1, D_Extension: 100, D_Cost: 50, D_Category: 560, D_Vendor: 'V1', D_RealPrice: 100, D_Column: '', D_Row: '', D_Perks: 0, D_SalesPerson: '', D_ReturnCode: 0 },
          { H_Store: 2, H_Ticket: 2, H_RealDate: dateMs('2026-04-10'), H_Cashier: 'A', H_Posted: 'Y',
            D_SKU: 'B', D_Qty: 1, D_Extension: 100, D_Cost: 50, D_Category: 570, D_Vendor: 'V1', D_RealPrice: 100, D_Column: '', D_Row: '', D_Perks: 0, D_SalesPerson: '', D_ReturnCode: 0 },
        ],
      },
    ]);
    const r = await adapter.getSalesAnalysis({
      dimension: 'CATEGORY',
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'COMBINE',
      criteria: { categories: [560, 570], categoriesRaw: '<>570' },
      printing: {},
      startDate: '2026-04-10',
      endDate: '2026-04-10',
    });
    expect(r.rows.map((x: { dimensionKey: string }) => x.dimensionKey)).toEqual(['560']);
  });

  it('union of structured picks and grammar inclusion', async () => {
    setMockRows([
      ...BASE_MOCKS(),
      {
        match: sqlMatches('FROM TicketHeader'),
        rows: [
          { H_Store: 2, H_Ticket: 1, H_RealDate: dateMs('2026-04-10'), H_Cashier: 'A', H_Posted: 'Y',
            D_SKU: 'A', D_Qty: 1, D_Extension: 100, D_Cost: 50, D_Category: 100, D_Vendor: 'V1', D_RealPrice: 100, D_Column: '', D_Row: '', D_Perks: 0, D_SalesPerson: '', D_ReturnCode: 0 },
          { H_Store: 2, H_Ticket: 2, H_RealDate: dateMs('2026-04-10'), H_Cashier: 'A', H_Posted: 'Y',
            D_SKU: 'B', D_Qty: 1, D_Extension: 100, D_Cost: 50, D_Category: 560, D_Vendor: 'V1', D_RealPrice: 100, D_Column: '', D_Row: '', D_Perks: 0, D_SalesPerson: '', D_ReturnCode: 0 },
          { H_Store: 2, H_Ticket: 3, H_RealDate: dateMs('2026-04-10'), H_Cashier: 'A', H_Posted: 'Y',
            D_SKU: 'C', D_Qty: 1, D_Extension: 100, D_Cost: 50, D_Category: 999, D_Vendor: 'V1', D_RealPrice: 100, D_Column: '', D_Row: '', D_Perks: 0, D_SalesPerson: '', D_ReturnCode: 0 },
        ],
      },
    ]);
    const r = await adapter.getSalesAnalysis({
      dimension: 'CATEGORY',
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'COMBINE',
      criteria: { categories: [100], categoriesRaw: '556-599' },
      printing: {},
      startDate: '2026-04-10',
      endDate: '2026-04-10',
    });
    // matches: 100 (structured) + 556-599 (grammar)
    expect(r.rows.map((x: { dimensionKey: string }) => x.dimensionKey).sort())
      .toEqual(['100', '560']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && pnpm jest salesAnalysisGrammar.test.ts
```

Expected: FAIL — `categoriesRaw` has no effect today.

- [ ] **Step 3: Replace `applyAnalysisCriteria` with grammar-aware logic**

In `apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts`, add an import:

```ts
import {
  parseCriteria,
  matchesCriteria,
  type CriteriaExpression,
} from '../../utils/criteriaGrammar';
```

Replace the existing `applyAnalysisCriteria` (~line 1250) with:

```ts
/**
 * Criteria merge: structured picks ∪ grammar inclusion, with grammar
 * exclusions applied on top. Exclusion-only grammar narrows the structured
 * picks. See spec §2 "Merge semantics."
 */
function facetKeeps(
  structured: Array<string | number> | undefined,
  expr: CriteriaExpression,
  candidate: string | number | null,
): boolean {
  const structuredList = structured?.length ? structured : null;
  const grammarIncluded = expr.tokens.some((t) => !t.excluded);
  const grammarExcluded = expr.tokens.some((t) => t.excluded);

  if (!structuredList && expr.empty) return true;
  if (expr.empty) {
    if (candidate == null) return false;
    return structuredList!.some((x) => String(x) === String(candidate));
  }
  if (!structuredList) {
    return matchesCriteria(expr, candidate);
  }
  const structuredHit =
    candidate != null && structuredList.some((x) => String(x) === String(candidate));
  if (grammarIncluded) {
    if (!(structuredHit || matchesCriteria(expr, candidate))) return false;
    if (!grammarExcluded) return true;
    const exOnly: CriteriaExpression = {
      ...expr,
      tokens: expr.tokens.filter((t) => t.excluded),
    };
    return matchesCriteria(exOnly, candidate);
  } else {
    // exclusion-only
    if (!structuredHit) return false;
    return matchesCriteria(expr, candidate);
  }
}

function applyAnalysisCriteria(
  l: TicketLine,
  c: SalesAnalysisCriteria,
  parsed: {
    stores: CriteriaExpression;
    categories: CriteriaExpression;
    vendors: CriteriaExpression;
    skus: CriteriaExpression;
  },
): boolean {
  if (!facetKeeps(c.stores, parsed.stores, l.store)) return false;
  if (!facetKeeps(c.categories, parsed.categories, l.category ?? null)) return false;
  if (!facetKeeps(c.vendors, parsed.vendors, l.vendor ?? null)) return false;
  if (!facetKeeps(c.skus, parsed.skus, l.sku)) return false;
  return true;
}
```

Update the two call sites of `applyAnalysisCriteria` to pass the parsed expressions. In `getSalesAnalysis` (near line 1119 and 1180):

```ts
  const parsed = {
    stores: parseCriteria(params.criteria.storesRaw),
    categories: parseCriteria(params.criteria.categoriesRaw),
    vendors: parseCriteria(params.criteria.vendorsRaw),
    skus: parseCriteria(params.criteria.skusRaw),
  };

  const filtered = lines.filter((l) => applyAnalysisCriteria(l, params.criteria, parsed));
```

and for the prior-year loop:

```ts
    for (const l of pyLines) {
      if (!applyAnalysisCriteria(l, params.criteria, parsed)) continue;
      …
    }
```

**Widen the pre-filter** for Stores and Categories so ticket-line fetch doesn't miss grammar ranges. Today the adapter already passes `storeNumbers: filteredStores` into `loadTicketLines` — update that to use the union of structured + grammar-derived bounds. Where `filteredStores` is computed (~line 1111):

```ts
  const storesStructured = params.criteria.stores ?? [];
  const storesBounds = (() => {
    const b = (require('../../utils/criteriaGrammar') as typeof import('../../utils/criteriaGrammar'))
      .sqlNumericBounds(parsed.stores);
    if (!b) return null;
    // Expand bounds into an inclusive integer list — store numbers are small.
    const out: number[] = [];
    for (let n = b.min; n <= b.max; n++) out.push(n);
    return out;
  })();
  const filteredStores = (() => {
    if (!storesStructured.length && !storesBounds) return undefined;
    if (!storesStructured.length) return storesBounds ?? undefined;
    if (!storesBounds) return storesStructured;
    return Array.from(new Set([...storesStructured, ...storesBounds]));
  })();
```

- [ ] **Step 4: Run the grammar tests to verify they pass**

```bash
cd apps/api && pnpm jest salesAnalysisGrammar.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Run the full adapter test file**

```bash
cd apps/api && pnpm jest ricsSalesReport.test.ts salesAnalysisGrammar.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts apps/api/tests/salesAnalysisGrammar.test.ts
git commit -m "feat(sales-reporting): apply *Raw criteria grammar in adapter

Structured picks and grammar expressions are merged per the spec's
S-and-G rules: union on inclusions, narrowing on exclusion-only.
Stores pre-filter widens to include any numeric range bounds so the
ticket-line fetch doesn't miss rows for typed grammar ranges; exact
per-row matching still runs in memory via matchesCriteria()."
```

---

## Task 8: Build the shared `CriteriaInput.tsx` component

**Files:**
- Create: `apps/web/src/pages/salesReporting/CriteriaInput.tsx`
- Create: `apps/web/src/pages/salesReporting/__tests__/CriteriaInput.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/pages/salesReporting/__tests__/CriteriaInput.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CriteriaInput from '../CriteriaInput';

describe('CriteriaInput', () => {
  it('renders the label, dropdown, and grammar text box', () => {
    render(
      <CriteriaInput
        label="Categories"
        mode="numeric"
        options={[{ value: 556, label: '556 — FLATS' }]}
        selected={[]}
        onSelectedChange={() => {}}
        rawText=""
        onRawTextChange={() => {}}
      />,
    );
    expect(screen.getByText('Categories')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/All Categories/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/556-599/i)).toBeInTheDocument();
  });

  it('fires onSelectedChange on dropdown change', async () => {
    const spy = vi.fn();
    render(
      <CriteriaInput
        label="Stores"
        mode="numeric"
        options={[
          { value: 2, label: '2 — Store 2' },
          { value: 16, label: '16 — Store 16' },
        ]}
        selected={[]}
        onSelectedChange={spy}
        rawText=""
        onRawTextChange={() => {}}
      />,
    );
    const combobox = screen.getByRole('combobox');
    fireEvent.mouseDown(combobox);
    const option = await screen.findByText('2 — Store 2');
    fireEvent.click(option);
    expect(spy).toHaveBeenCalledWith([2]);
  });

  it('fires onRawTextChange on text box input', () => {
    const spy = vi.fn();
    render(
      <CriteriaInput
        label="Categories"
        mode="numeric"
        options={[]}
        selected={[]}
        onSelectedChange={() => {}}
        rawText=""
        onRawTextChange={spy}
      />,
    );
    const input = screen.getByPlaceholderText(/556-599/i);
    fireEvent.change(input, { target: { value: '556-599' } });
    expect(spy).toHaveBeenCalledWith('556-599');
  });

  it('hides the dropdown when hideDropdown is true', () => {
    render(
      <CriteriaInput
        label="Keywords"
        mode="string"
        options={[]}
        selected={[]}
        onSelectedChange={() => {}}
        rawText=""
        onRawTextChange={() => {}}
        hideDropdown
      />,
    );
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByPlaceholderText(/556-599|\*SUMMER\*/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web && pnpm vitest run src/pages/salesReporting/__tests__/CriteriaInput.test.tsx
```

Expected: FAIL — component not found.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/pages/salesReporting/CriteriaInput.tsx`:

```tsx
import { Col, Input, Row, Select, Space, Typography } from 'antd';

const { Text } = Typography;

type OptionValue = string | number;

interface Option<V extends OptionValue> {
  value: V;
  label: string;
}

export interface CriteriaInputProps<V extends OptionValue> {
  label: string;
  /** Informs the help text. `numeric` hints ranges; `string` hints wildcards. */
  mode: 'numeric' | 'string';
  options: Option<V>[];
  selected: V[];
  onSelectedChange: (value: V[]) => void;
  rawText: string;
  onRawTextChange: (value: string) => void;
  loading?: boolean;
  hideDropdown?: boolean;
  /** Overrides the default help line under the text box. */
  helpText?: string;
}

const NUMERIC_HELP =
  'Ranges: 556-599   Exclude: <>575   Wildcard: 5?0   Escape hyphen: 100!-120';
const STRING_HELP =
  'Ranges: AAA-AZZ   Exclude: <>NIKE   Wildcard: *FORMAL*   Keyword AND: +A +B';

/**
 * Shared criteria input pairing an Ant multi-select with a RICS-grammar text
 * box. Caller owns both pieces of state so the parent can ship both to the
 * server in its request payload.
 */
export default function CriteriaInput<V extends OptionValue>({
  label,
  mode,
  options,
  selected,
  onSelectedChange,
  rawText,
  onRawTextChange,
  loading = false,
  hideDropdown = false,
  helpText,
}: CriteriaInputProps<V>) {
  const defaultHelp = mode === 'numeric' ? NUMERIC_HELP : STRING_HELP;
  const effectiveHelp = helpText ?? defaultHelp;
  const grammarPlaceholder =
    mode === 'numeric' ? 'e.g. 556-599, <>575' : 'e.g. *FORMAL*, <>NIKE';

  return (
    <Row gutter={12} align="top" wrap={false}>
      <Col flex="140px" style={{ textAlign: 'right', paddingTop: 6 }}>
        <Text strong>{label}</Text>
      </Col>
      <Col flex="auto">
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {!hideDropdown && (
            <Select<V[]>
              mode="multiple"
              allowClear
              loading={loading}
              value={selected}
              onChange={onSelectedChange}
              placeholder={`All ${label}`}
              optionFilterProp="label"
              style={{ width: '100%' }}
              options={options}
            />
          )}
          <Input
            placeholder={grammarPlaceholder}
            value={rawText}
            onChange={(e) => onRawTextChange(e.target.value)}
            style={{ fontFamily: 'Consolas, Menlo, monospace' }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {effectiveHelp}
          </Text>
        </Space>
      </Col>
    </Row>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/web && pnpm vitest run src/pages/salesReporting/__tests__/CriteriaInput.test.tsx
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/salesReporting/CriteriaInput.tsx apps/web/src/pages/salesReporting/__tests__/CriteriaInput.test.tsx
git commit -m "feat(sales-reporting): add shared CriteriaInput component

Pairs the existing Ant multi-select with a RICS-grammar text input
so users can type ranges (556-599), exclusions (<>575), and
wildcards. Reusable across every sales-reporting page; wiring into
Sales Analysis lands next."
```

---

## Task 9: Wire `CriteriaInput` + ROI columns into `SalesAnalysisPage.tsx`

**Files:**
- Modify: `apps/web/src/pages/salesReporting/SalesAnalysisPage.tsx`
- Modify: `apps/web/src/services/reportApi.ts` — extend `SalesAnalysisArgs` and `SalesAnalysisRow` types.

- [ ] **Step 1: Extend client types**

In `apps/web/src/services/reportApi.ts`, locate the `SalesAnalysisArgs` / `SalesAnalysisRow` types (or their equivalent aliases). Add the `*Raw` fields and ROI/Turns fields so they mirror the server types:

```ts
export interface SalesAnalysisArgs {
  dimension: SalesAnalysisDimension;
  reportType: SalesAnalysisReportType;
  storeOption: SalesAnalysisStoreOption;
  startDate: string;
  endDate: string;
  stores?: number[];
  categories?: number[];
  vendors?: string[];
  seasons?: string[];
  styleColor?: string;
  skus?: string[];
  groups?: string[];
  keywords?: string[];
  storesRaw?: string;
  categoriesRaw?: string;
  vendorsRaw?: string;
  seasonsRaw?: string;
  skusRaw?: string;
  groupsRaw?: string;
  keywordsRaw?: string;
  styleColorRaw?: string;
  priorYear?: boolean;
}

export interface SalesAnalysisRow {
  dimensionKey: string;
  dimensionLabel: string | null;
  storeNumber: number | null;
  qty: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  gpPct: number | null;
  onHandAtCost: number;
  turns: number | null;
  roiPct: number | null;
  priorYearNetSales: number | null;
  pyPctChange: number | null;
}
```

Also widen the `SalesAnalysisReport` shape (or its local alias) to include `totals.onHandAtCost | turns | roiPct | gpPct` and `periodDays`.

- [ ] **Step 2: Update SalesAnalysisPage state + request builder**

Open `apps/web/src/pages/salesReporting/SalesAnalysisPage.tsx`.

Rename existing `*Text` / `*Pattern` state variables to `*Raw` so they now ship as grammar:

```ts
  // BEFORE: const [vendorsText, setVendorsText] = useState('')
  // AFTER:
  const [vendorsRaw, setVendorsRaw] = useState('')
  const [seasonsRaw, setSeasonsRaw] = useState('')
  const [styleColorRaw, setStyleColorRaw] = useState('')
  const [skusRaw, setSkusRaw] = useState('')
  const [keywordsRaw, setKeywordsRaw] = useState('')
  // NEW — grammar inputs for the dimensions that didn't have a text box before:
  const [storesRaw, setStoresRaw] = useState('')
  const [categoriesRaw, setCategoriesRaw] = useState('')
  const [groupsRaw, setGroupsRaw] = useState('')
```

Delete the `parseStrs()` helper (it's no longer used — the server owns parsing now).

In `onRun`, build the query with the new fields:

```ts
  function onRun(): void {
    setQuery({
      dimension,
      reportType,
      storeOption,
      startDate: dateRange[0],
      endDate: dateRange[1],
      stores: selectedStores.length ? selectedStores : undefined,
      categories: selectedCategories.length ? selectedCategories : undefined,
      groups: selectedGroups.length ? selectedGroups : undefined,
      storesRaw: storesRaw.trim() || undefined,
      categoriesRaw: categoriesRaw.trim() || undefined,
      vendorsRaw: vendorsRaw.trim() || undefined,
      seasonsRaw: seasonsRaw.trim() || undefined,
      styleColorRaw: styleColorRaw.trim() || undefined,
      skusRaw: skusRaw.trim() || undefined,
      groupsRaw: groupsRaw.trim() || undefined,
      keywordsRaw: keywordsRaw.trim() || undefined,
      priorYear,
    })
  }
```

- [ ] **Step 3: Replace the `<CriteriaRow>` rows with `<CriteriaInput>`**

Import the new component:

```tsx
import CriteriaInput from './CriteriaInput'
```

Delete the local `CriteriaRow` component definition. Replace the `<Card size="small" title="Criteria">…</Card>` body with `CriteriaInput` calls:

```tsx
  <Card size="small" title={<Text strong>Criteria</Text>} style={{ marginTop: 16 }}>
    <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
      Leave a row blank to include everything. Type ranges like <code>556-599</code>,
      exclusions <code>&lt;&gt;575</code>, or wildcards <code>KISS*BK</code> in the
      grammar box under each dropdown.
    </Text>
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <CriteriaInput
        label="Stores"
        mode="numeric"
        loading={dimsLoading}
        options={(dims?.stores ?? []).map((s) => ({
          value: s.number,
          label: s.name ? `${s.number} — ${s.name}` : String(s.number),
        }))}
        selected={selectedStores}
        onSelectedChange={setSelectedStores}
        rawText={storesRaw}
        onRawTextChange={setStoresRaw}
      />
      <CriteriaInput
        label="Categories"
        mode="numeric"
        loading={dimsLoading}
        options={(dims?.categories ?? []).map((c) => ({
          value: c.number,
          label: c.desc ? `${c.number} — ${c.desc}` : String(c.number),
        }))}
        selected={selectedCategories}
        onSelectedChange={setSelectedCategories}
        rawText={categoriesRaw}
        onRawTextChange={setCategoriesRaw}
      />
      <CriteriaInput
        label="Vendors"
        mode="string"
        options={[]}
        selected={[]}
        onSelectedChange={() => {}}
        rawText={vendorsRaw}
        onRawTextChange={setVendorsRaw}
        hideDropdown
        helpText="e.g. WEYC, VEND, <>NIKE"
      />
      <CriteriaInput
        label="Seasons"
        mode="string"
        options={[]}
        selected={[]}
        onSelectedChange={() => {}}
        rawText={seasonsRaw}
        onRawTextChange={setSeasonsRaw}
        hideDropdown
        helpText="e.g. A, B, <>C"
      />
      <CriteriaInput
        label="Style/Colors"
        mode="string"
        options={[]}
        selected={[]}
        onSelectedChange={() => {}}
        rawText={styleColorRaw}
        onRawTextChange={setStyleColorRaw}
        hideDropdown
        helpText="Wildcard pattern, e.g. KISS*BK or *FORMAL*  (requires master join — coming soon)"
      />
      <CriteriaInput
        label="SKUs"
        mode="string"
        options={[]}
        selected={[]}
        onSelectedChange={() => {}}
        rawText={skusRaw}
        onRawTextChange={setSkusRaw}
        hideDropdown
        helpText="e.g. TRLR7812-39-BK, 2A703GDGY, <>SKU001"
      />
      <CriteriaInput
        label="Groups"
        mode="string"
        loading={dimsLoading}
        options={(dims?.groups ?? []).map((g) => ({
          value: g.code,
          label: g.desc ? `${g.code} — ${g.desc}` : g.code,
        }))}
        selected={selectedGroups}
        onSelectedChange={setSelectedGroups}
        rawText={groupsRaw}
        onRawTextChange={setGroupsRaw}
        helpText="Dropdown or grammar. (Grammar requires master join — coming soon.)"
      />
      <CriteriaInput
        label="Keywords"
        mode="string"
        options={[]}
        selected={[]}
        onSelectedChange={() => {}}
        rawText={keywordsRaw}
        onRawTextChange={setKeywordsRaw}
        hideDropdown
        helpText="Wildcard patterns, comma separated. e.g. 01AG25, *SUMMER*  (requires master join — coming soon)"
      />
    </Space>
  </Card>
```

- [ ] **Step 4: Add ROI / Turns / GP% / Inv Value columns**

Update the `columns` array. GP% already exists — move it into the metric block; add **Inv Value**, **Turns**, and **ROI%**:

```tsx
  const columns = [
    { title: keyColumnTitle, dataIndex: 'dimensionKey', key: 'dimensionKey', width: 160 },
    ...(query?.reportType === 'DEPT_SUMMARY'
      ? [{ title: 'Label', dataIndex: 'dimensionLabel', key: 'dimensionLabel', width: 200, render: (v: string | null) => v ?? '—' }]
      : []),
    {
      title: 'Store', dataIndex: 'storeNumber', key: 'storeNumber', width: 80,
      render: (v: number | null) => v ?? '(all)',
    },
    { title: 'Qty', dataIndex: 'qty', key: 'qty', width: 80, align: 'right' as const },
    {
      title: 'Net Sales', dataIndex: 'netSales', key: 'netSales', width: 130,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
    },
    {
      title: 'COGS', dataIndex: 'cogs', key: 'cogs', width: 130,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
    },
    {
      title: 'Gross Profit', dataIndex: 'grossProfit', key: 'grossProfit', width: 130,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
    },
    {
      title: 'GP %', dataIndex: 'gpPct', key: 'gpPct', width: 90,
      align: 'right' as const,
      render: (v: number | null) =>
        v == null ? '—' : <Tag color={v >= 30 ? 'green' : v >= 10 ? 'gold' : 'red'}>{v.toFixed(1)}%</Tag>,
    },
    {
      title: 'Inv $ (Cost)', dataIndex: 'onHandAtCost', key: 'onHandAtCost', width: 130,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
    },
    {
      title: 'Turns', dataIndex: 'turns', key: 'turns', width: 80,
      align: 'right' as const,
      render: (v: number | null) => (v == null ? '—' : v.toFixed(1)),
    },
    {
      title: 'ROI', dataIndex: 'roiPct', key: 'roiPct', width: 90,
      align: 'right' as const,
      render: (v: number | null) =>
        v == null ? '—' : <Tag color={v >= 5 ? 'green' : v >= 2 ? 'gold' : 'red'}>{v.toFixed(1)}×</Tag>,
    },
    ...(query?.priorYear
      ? [
          {
            title: 'Prior Yr Net', dataIndex: 'priorYearNetSales', key: 'priorYearNetSales', width: 130,
            align: 'right' as const,
            render: (v: number | null) => (v == null ? '—' : v.toFixed(2)),
          },
          {
            title: 'PY % Δ', dataIndex: 'pyPctChange', key: 'pyPctChange', width: 90,
            align: 'right' as const,
            render: (v: number | null) =>
              v == null ? '—' : <Tag color={v >= 0 ? 'green' : 'red'}>{v.toFixed(1)}%</Tag>,
          },
        ]
      : []),
  ]
```

Update the summary row to include the new columns. Locate the `summary={() => …}` block and rebuild it so the Totals row renders a cell for every column. The existing implementation hand-indexes cells and breaks as columns are added — replace with a derived approach:

```tsx
        summary={() => {
          const t = data.totals;
          const cells: Array<string | number | null | JSX.Element> = [];
          cells.push('Totals');
          if (query.reportType === 'DEPT_SUMMARY') cells.push('');
          cells.push(''); // Store
          cells.push(t.qty);
          cells.push(t.netSales.toFixed(2));
          cells.push(t.cogs.toFixed(2));
          cells.push(t.grossProfit.toFixed(2));
          cells.push(t.gpPct == null ? '—' : `${t.gpPct.toFixed(1)}%`);
          cells.push(t.onHandAtCost.toFixed(2));
          cells.push(t.turns == null ? '—' : t.turns.toFixed(1));
          cells.push(t.roiPct == null ? '—' : `${t.roiPct.toFixed(1)}×`);
          if (query.priorYear) {
            cells.push(t.priorYearNetSales == null ? '—' : t.priorYearNetSales.toFixed(2));
            cells.push(''); // PY % Δ total omitted
          }
          return (
            <Table.Summary fixed>
              <Table.Summary.Row>
                {cells.map((c, i) => (
                  <Table.Summary.Cell key={i} index={i} align={i >= 2 ? 'right' : 'left'}>
                    {c as React.ReactNode}
                  </Table.Summary.Cell>
                ))}
              </Table.Summary.Row>
            </Table.Summary>
          );
        }}
```

- [ ] **Step 5: Type-check and lint**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: PASS. If the `SalesAnalysisArgs` / `SalesAnalysisRow` types live in a barrel file, also run `pnpm build` to catch downstream consumers.

- [ ] **Step 6: Manual smoke on the dev server**

Start the dev servers (API + web) and run Sales Analysis against live RICS MDBs:

```bash
pnpm --filter @zacks/api dev &
pnpm --filter @zacks/storefront dev &   # if needed; otherwise target web app directly
pnpm --filter @zacks/web dev
```

In the browser, go to Sales Analysis:
1. Pick Type of Report = **Department Summary**, Store Option = **Combine**, date range = last 30 days. Run. **Verify rows start with dept 1, 2, 3, … numerically, not alphabetically.**
2. In the **Categories** criteria row, type `556-599` in the grammar text box. Leave the dropdown empty. Run. **Verify only rows for categories in 556–599 appear.**
3. Pick 5 categories in the Categories dropdown; type `<>575` in the grammar box. Run. **Verify the 5 picks minus 575.**
4. Check each row shows **GP%**, **Inv $ (Cost)**, **Turns**, **ROI** populated (not dashes) for categories that have on-hand inventory.
5. Check the totals row also shows populated GP/Turns/ROI.

If any of those fail, open an issue against the failing step and fix before moving on.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/salesReporting/SalesAnalysisPage.tsx apps/web/src/services/reportApi.ts
git commit -m "feat(sales-reporting): wire CriteriaInput + ROI/Turns columns into Sales Analysis

Replaces per-facet dropdowns with the shared CriteriaInput so users
can type RICS-grammar ranges (556-599), exclusions (<>575), and
wildcards on every criterion. Adds Inv Value (at cost), Turns, and
ROI% columns next to GP% — all populated by the adapter's new
on-hand-at-cost lookup. Default row order now ascends by
dimensionKey so Department Summary starts with dept 1, not
alphabetically by department name."
```

---

## Self-Review

**Spec coverage check (against `docs/superpowers/specs/2026-04-19-sales-analysis-ranges-and-roi-design.md`):**

- §1 `CriteriaInput` widget → Task 8.
- §2 Extended `SalesAnalysisCriteria` wire shape + merge semantics → Task 4 (types) + Task 7 (merge semantics in `facetKeeps`).
- §3 Adapter changes — apply grammar → Task 7; `sqlNumericBounds` → Task 2.
- §4 Dimensions endpoint unchanged → no task needed.
- §5 ROI/Turns/GP% on every row → Task 3 (helper), Task 5 (denominator), Task 6 (wiring).
- §5.3 Facade wiring → Task 6 (implemented in adapter; same effect).
- §5.4 Type additions → Task 4.
- §6 UI render → Task 9.
- §7 Default row ordering → Task 1.
- §8 Tests → every task includes its own tests.
- §9 Backwards compatibility → `*Raw` fields optional, no schema change. No dedicated task; preserved by design.

**Placeholder scan:** no "TBD" / "TODO" / "fill in later" strings. The one flagged soft-fallback is Task 6 Step 3 PRICE_POINT_SUMMARY bucketing — explicitly called out with a fallback behavior (empty map → null ROI), matching spec Open Question 2.

**Type consistency:** `SalesAnalysisRow` fields (`onHandAtCost`, `turns`, `roiPct`) and `SalesAnalysisReport.totals` fields match across Task 4 (server types), Task 6 (row population), Task 9 (client types + columns). `CriteriaInput` prop names match across component definition (Task 8) and callers (Task 9). `sqlNumericBounds` signature matches across Task 2 (definition) and Task 7 (usage).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-19-sales-analysis-ranges-and-roi.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

Which approach?
