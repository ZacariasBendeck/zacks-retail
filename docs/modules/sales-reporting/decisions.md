# Decisions: Sales Reporting

Running log of **module-scoped** design decisions — the *why* behind design choices that show up in the other artifacts in this folder. Append new entries at the **top** (most recent first).

Cross-module and project-wide decisions live in [`../../dev/specs/`](../../dev/specs/) instead — if a decision affects more than this module, write it there and (optionally) reference it here.

## Entry format

Each entry follows this shape:

> ## YYYY-MM-DD — Short decision title
>
> **Context:** What situation or question prompted this decision.
> **Decision:** What was decided.
> **Consequences:** What follows — tradeoffs, new constraints, knock-on effects.
> **Alternatives considered:** 1–3 options rejected, with one-line reason each.
> **Related:** Commits / specs / runbooks if applicable.

---

<!-- Decisions go below this line, most recent first. -->

## 2026-04-23 — Shared report chrome replaces per-page formatters and inline styling

**Context:** Every sales-report page had re-implemented its own `fmtMoney` / `fmtPct1` / `fmtQty`, its own GP%-coloring thresholds, its own "Amounts in Lempira (HNL)" footnote, and its own ad-hoc summary-row styling. `apps/web/src/utils/` contained only `errors.ts` — there was no obvious place for a page author to share presentation primitives, so every page re-invented them. Any change to the currency rule or color threshold required touching every file.

**Decision:** Introduce a shared chrome layer under `apps/web/src/components/reports/` and `apps/web/src/utils/reportFormatters.ts`, then re-skin every live report page to use it.

- Formatters in `utils/reportFormatters.ts`: `fmtMoney` (2 dp), `fmtMoneyInt` (0 dp), `fmtInt`, `fmtQty`, `fmtPct1` / `fmtPct2` (with trailing `%`), `fmtPctBare1`, `fmtChangePct` (signed), `fmtChangeMoney`, and `DASH = '—'`. Null / NaN render as em-dash everywhere.
- Components in `components/reports/`: `ReportHeader`, `FilterChips`, `ReportEmptyState`, `SummaryRow`, `gpBadge` (`GpBadge` + `ChangePctBadge` + `GpBadgeLegend`), `ShareBar`, `CollapsibleFilterCard`.
- GP% / change-% color thresholds live only in `gpBadge.tsx` (`GP_PCT_GOOD = 30`, `GP_PCT_OKAY = 10`). Pages import the badge components — they do not re-declare thresholds.
- The `.report-zebra-row` class in `apps/web/src/styles/reports.css` handles alternating row tint on wide tables. Import once in `main.tsx`.

**Consequences:**
- Every live report page (`SalesAnalysisPage`, `SalesHistoryByMonthPage`, `BestSellersPage`, `SalesByDayPage`, `SalesByTimePage`, `SalespersonSummaryPage`, `StockStatusPage`) and both hubs (`SalesReportsHubPage`, `ReportsOthersHubPage`) now render consistently.
- Future report pages in this module — and likely in inventory/purchasing reports too — should reuse these. The components are module-agnostic by design.
- The currency rule (no `$` / `USD` / `en-US` currency style) has one enforcement point: the `Intl.NumberFormat` instances at the top of `reportFormatters.ts`.

**Alternatives considered:**
- Leave formatters per-page — rejected; rule drift was already happening (one page used `precision={2}` on Statistic cards, sidestepping the shared formatter).
- Ant Design theme tokens for colors / thresholds — rejected; AD tokens cover primary/secondary colors but not domain thresholds.

**Related:** Commits `f5cd374` (foundation), `e4b6af5` (re-skin). Cross-module design note: [`../../dev/specs/2026-04-23-report-chrome-foundation-design.md`](../../dev/specs/2026-04-23-report-chrome-foundation-design.md).

---

## 2026-04-23 — Filter card auto-collapses after a successful Run, gated on `query`

**Context:** The Sales Analysis filter form is ~800 px tall (3-column top + 8-row Criteria card + action row). After clicking Run, operators had to scroll past the whole form to see results.

**Decision:** Wrap each page's filter card in `components/reports/CollapsibleFilterCard`. Parent owns a `[filterOpen, setFilterOpen]` state and calls `setFilterOpen(false)` in a `useEffect` gated by **`query && data && !isFetching`** (not just `data && !isFetching`). While collapsed, the Card shrinks to `[Modify filters] [Re-run]` — the `FilterChips` row below carries the filter scope.

**Consequences:**
- Results take the viewport post-Run. The chip row doubles as the scope summary.
- **Gating on `query` is load-bearing.** Mocked tests and TanStack Query cache hits populate `data` on first render with `query == null`; collapsing in that state breaks the existing test suite (`salesHistoryByMonthPage.test.tsx` at the "stores-select selector not found" assertion) and makes operator landings feel broken. The `query` check means only user-initiated runs trigger collapse.
- Export CSV / XLSX buttons that previously lived in the filter-card action row must move out (e.g. to `ReportHeader.actions`) because they need to remain visible after collapse. `SalesHistoryByMonthPage` applied this migration; other pages without export buttons are unaffected.

**Alternatives considered:**
- Collapse when `data && !isFetching` (simpler) — rejected; broke test fixtures and cache-hit renders.
- Sticky mini-toolbar pinned to the viewport — rejected; more intrusive than collapse, competes with Ant's own header styles.

**Related:** Commit `23d43ee`. See also [`apps/web/src/components/reports/CollapsibleFilterCard.tsx`](../../../apps/web/src/components/reports/CollapsibleFilterCard.tsx).

---

## 2026-04-23 — Report Viewer uses three-zone column theming

**Context:** The legacy RICS printout grouped sales-analysis columns into visually-distinct bands: **On-Hand**, **Month-to-Date**, **Year-to-Date**. The bands carried most of the report's visual rhythm. The web re-skin needed an equivalent pattern without reproducing the monospace-printout layout.

**Decision:** In the Report Viewer, classify every column into one of four **zones** — `identity`, `on-hand`, `current`, `comparison` — and tint the header-row band with a stronger color and the data cells with a lighter wash. Zones:

| Zone | Header tint | Cell tint | Typical columns |
|---|---|---|---|
| identity | transparent | transparent | Key, Label, Store |
| on-hand | grey `rgba(140,140,140,0.14)` | `rgba(140,140,140,0.04)` | Inv (Cost), Turns, ROI |
| current | blue `rgba(22,119,255,0.10)` | `rgba(22,119,255,0.035)` | Qty, Net Sales, COGS, Gross Profit, GP % |
| comparison | amber `rgba(250,173,20,0.14)` | `rgba(250,173,20,0.045)` | Prior Yr Net, PY % Δ |

A small legend near the top of the table names each active zone. The comparison zone only appears when `priorYear=true`.

**Consequences:**
- The viewer reads as three distinct reports side-by-side, matching how operators already think about the data (inventory → current sales → prior-year comparison).
- Tints are inline constants (`ZONE_HEADER_BG` / `ZONE_CELL_BG`), not Ant theme tokens — keeps the shading fully controllable by this module without wrangling global tokens.

**Alternatives considered:**
- Column-group headers (a second row above the columns naming each zone) — rejected; eats vertical space, clashes with Ant's sort controls.
- Outline borders between zones instead of fills — rejected; fills read faster at a glance.

**Related:** Commit `9431916`. Cross-module design note: [`../../dev/specs/2026-04-23-report-viewer-design.md`](../../dev/specs/2026-04-23-report-viewer-design.md).

---

## 2026-04-23 — Report Viewer: client-side grouping + localStorage column prefs

**Context:** The Report Viewer needs (a) grouping rows by a user-chosen dimension with subtotal rows, and (b) a column picker that persists across page reloads.

**Decision:**
- **Grouping is client-side.** The viewer re-fetches via the same `useSalesAnalysis` hook the source page uses, then builds a flat array of `{_type: 'data'}` / `{_type: 'subtotal'}` rows for Ant Table. No new backend endpoint. No group-by parameter sent to the API.
- **Column visibility is persisted in `localStorage`** keyed on the report type — e.g. `report-viewer:sales-analysis:columns`. Default: every column visible. Failure modes (quota exceeded, storage disabled) are swallowed; the viewer still works but doesn't remember preferences.

**Consequences:**
- No schema or endpoint change to add grouping / column-picker support.
- Preferences are per-browser, not per-user — intentional: operators switching machines get a fresh default rather than stale state.
- Scales to thousands of rows. Beyond ~10k the client-side group build would want memoization tightening.

**Alternatives considered:**
- Server-side grouping with a `groupBy` query parameter — rejected; pushes complexity into the adapter for a feature the client can do without round-tripping.
- Preferences in Postgres (per-user) — rejected for v1; can layer onto the existing `ReportTemplates` infrastructure later.

**Related:** Commit `9431916`. `ReportViewerPage.tsx` → `buildFlatRows`, `COLUMN_STORAGE_KEY`.

---

## 2026-04-23 — `/report-viewer` renders outside AppLayout for a chromeless view

**Context:** The Report Viewer is for scanning data — not configuring it. The `AppLayout` sidebar + top nav compete for viewport space that could be table rows.

**Decision:** Register `/report-viewer` in `App.tsx` as a sibling of the `AppLayout`-wrapped route group, still wrapped in `RequireAuth`. The viewer renders its own sticky top toolbar (back · title · group-by · columns · export · etc.) in place of the app chrome.

**Consequences:**
- Full viewport width / height for data. Intended use: operators open the viewer in a new tab from the source page's "Open in Report Viewer" button.
- Pattern is reusable for any future full-screen view (kiosk / presentation modes, receipt previews, etc.): register a sibling route under `RequireAuth` without the `AppLayout` wrapper.

**Related:** Commit `9431916`. `App.tsx` route block for `/report-viewer`.
