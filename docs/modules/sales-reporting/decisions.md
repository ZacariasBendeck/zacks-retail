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

## 2026-04-23 — Sales Pivot family: one endpoint + unified leaf row + variant dispatch

**Context:** Operators wanted a family of pivot reports against live sales + on-hand data: a fixed Department-led tree, a Buyer-led tree, a Buyer-Vendor tree, optionally per-store splits, and eventually a free-form three-dimension builder. The fixed trees share measures (On-Hand qty/cost, TY qty/net-sales/profit, LY qty/net-sales/profit over a user-picked date window with a one-year-shifted comparison); only the identity columns change across variants. A naive design would mint one endpoint + one leaf-row type per variant.

**Decision:** One endpoint `GET /api/v1/reports/sales/sales-pivot` dispatches on a `variant` query param. One shared `SalesPivotLeafRow` type carries every identity field (`storeNumber`, `buyerCode`, `vendorCode`, `sector`, `dept`, `categ`, `season`, `groupCode`, `sku`, each plus a label) — identity fields that don't apply to the chosen variant are `null`. The client groups the flat leaves into the appropriate tree based on `variant` and, for the Custom variant, the three chosen dimensions (echoed in the response as `levels`).

Three adapters back the dispatch:
- `ricsSalesPivotAdapter.ts` — Department + Separate-Store Department (Sector/Dept/Category taxonomy via `rics_mirror.departments.beg_categ..end_categ BETWEEN` + `rics_mirror.sectors.beg_dept..end_dept BETWEEN`).
- `ricsSalesPivotByBuyerAdapter.ts` — Buyer, Buyer-Vendor, Separate-Store Buyer-Vendor (Buyer pulled from `app.sku_attribute_assignment` where `dimension.code='buyer'`; Vendor labels from `rics_mirror.vendor_master` via `COALESCE(short_name, manu_name)`).
- `ricsSalesPivotCustomAdapter.ts` — accepts `levels: [PivotDimension, PivotDimension, PivotDimension]` plus Sector / Department / Season / Buyer criteria filters; resolves the filter set to a SKU whitelist in a single pre-aggregation pass, then feeds it to the two aggregation queries via `UPPER(TRIM(sku)) = ANY($::text[])`.

Store is the one dimension that splits leaf grain — when it appears in the chosen levels (or via the `*-separate-store` fixed variants) leaves are keyed by `(store, sku)`; otherwise stores are summed into `(sku)` leaves. SKUs inside each deepest bucket sort by Net Sales TY descending (SKU code tiebreaker); rollup rows at every level do the same, with `(Unassigned)` / `(no vendor)` / `(no sector)` buckets pinned last. SKU leaf labels render as `<SkuLink>` so plain click opens the inventory-inquiry popup, modifier-click opens the full-page inquiry in a new tab.

Criteria-filter SQL resolves in two steps: (1) Sector ∨ Department widens to a category set via the taxonomy join; (2) that category set intersects with Season (from `rics_mirror.inventory_master.season`, labels from `public.season_overlay`) via the SKU master, then intersects with Buyer SKUs from `app.sku_attribute_assignment`. An impossible filter (e.g. a sector + department that don't overlap) resolves to an empty whitelist and the endpoint returns zero rows rather than running unfiltered.

**Consequences:**
- Adding a new fixed variant = one case in the route dispatch + one branch in the frontend page's tree builder. No new endpoint, no new response type.
- Snapshots (`reportType: 'sales-pivot'`) capture the full `SalesPivotReport` shape including `variant` and (when present) `levels` — a frozen snapshot has enough information to replay its exact hierarchy without re-querying. However, `RunViewPage.tsx` does not yet have a dedicated `sales-pivot` renderer; viewing a saved pivot snapshot currently falls through to the "rendering not implemented yet — Open in builder" fallback. Building the renderer is the obvious next step.
- `listSalesDimensions` (`GET /api/v1/reports/sales/dimensions`) gained four new lists — `sectors`, `departments`, `seasons`, `buyers` — alongside the existing `stores` / `categories` / `groups`. All share one 5-min server-side cache and one round-trip to the client.
- The `buyer` attribute dimension in `app.attribute_value` becomes a de-facto read dependency for the sales-reporting module; any migration that renames it breaks the buyer adapters.

**Alternatives considered:**
- One endpoint + one response shape **per** fixed variant — rejected; duplicates ~90% of adapter code and makes the Custom variant impossible without a third system.
- Server-side tree construction (backend returns nested nodes) — rejected; flat leaves let the client swap hierarchies without a round-trip, and keep snapshots small + diff-friendly.
- Push the criteria-filter intersection into each aggregation query via a master JOIN — rejected; the upfront whitelist pass runs once and its `ANY($::text[])` gets reused by both sales + on-hand queries, avoiding a repeated join.

**Related:** `apps/api/src/routes/salesReportRoutes.ts` (variant dispatch + CSV emitter), `apps/api/src/services/salesReporting/ricsSalesPivot{,ByBuyer,Custom}Adapter.ts`, `apps/web/src/pages/salesReporting/SalesPivotPage.tsx`, `apps/web/src/pages/salesReporting/SalesPivotCustomPage.tsx`, tests at `apps/api/tests/salesPivotRoute.test.ts`. No RICS ancestor — these reports are new.

---

## 2026-04-23 — Fullscreen report toggle attempted and rolled back

**Context:** A session experiment added a **Full screen** button to `ReportHeader` that set `?fullscreen=1` on the URL, with `AppLayout` reading the flag and rendering its children without the sidebar + top header (floating "Exit full screen" pill in the corner). Operator feedback during the same session: the behaviour was unreliable in practice.

**Decision:** The `enableFullscreen` prop on `ReportHeader` is retained for call-site backward compatibility but is now a **no-op** (an inline comment in `ReportHeader.tsx` flags it as removed). The `?fullscreen=1` handling in `AppLayout` may linger at the code level but no UI surface triggers it. Report pages should **not** add new fullscreen triggers through this prop. If genuine full-viewport UX is needed later, treat it as a new design exercise rather than reviving this hook.

**Consequences:**
- Sales-report pages that already passed `enableFullscreen={false}` (e.g. `SalesReportsHubPage`) keep the prop for clarity but it changes nothing.
- `/report-viewer` (chromeless route registered as a sibling of the `AppLayout` group) remains the supported full-viewport path — a dedicated route outside `AppLayout`, not a toggle on the wrapper. Use the same sibling-route pattern for any future full-viewport screen.

**Alternatives considered:**
- Ship the header-level toggle as originally planned — rejected as unreliable mid-session; context for the rejection wasn't captured beyond the operator note and should not be relitigated without a reproducer.

**Related:** `apps/web/src/components/AppLayout.tsx` (`?fullscreen=1` logic), `apps/web/src/components/reports/ReportHeader.tsx` (`enableFullscreen` prop — no-op with comment flagging the rollback).

---

## 2026-04-23 — Sales Hierarchy Drill-Down is a new app-native report

**Context:** Operator wanted the legacy RICS "Sales Analysis by Category" Excel pivot — a collapsible Department subtotal with a click-to-expand Category row revealing SKU detail. RICS itself offers `CATEGORY_SUMMARY` and `DEPT_SUMMARY` as separate flat-row dimensions, not a unified tree. The existing `ReportViewerPage` tree is per-report-type (built around Sales Analysis rows) and doesn't cover the Dept→Cat→SKU axis out of the box.

**Decision:** Add **Sales Hierarchy Drill-Down** as a first-class sales report alongside Sales Analysis.

- Route: `/reports/sales/hierarchy-drill-down`.
- API: `GET /api/v1/reports/sales/hierarchy-drill-down`. Same filter surface as `/sales-analysis` (stores, categories, vendors, seasons, SKUs, style/color, groups, keywords, all structured + RICS-grammar-raw variants; period + optional prior-year compare). No "Analyze by" / "Report Type" radios — this report *is* the hierarchy.
- Store options: Separate + Combine only; **`COMPARE` is rejected** (side-by-side store axis conflicts with a row-hierarchy tree).
- Data shape: nested `{ roots: SalesHierarchyNode[], totals, storeOption, priorYear, startDate, endDate, periodDays }`, where each node has `level: 'store' | 'department' | 'category' | 'sku'`, metric fields, and optional `children`. `storeOption=SEPARATE` wraps the tree in a Store level; `COMBINE` roots are departments directly.
- Adapter: new `getSalesHierarchy()` in `ricsSalesReportAdapter.ts` loads ticket lines once (cached), buckets at SKU grain, rolls up to Category and Department, and pulls on-hand at SKU level via the existing `getOnHandAtCostByDimension({ reportType: 'SKU_DETAIL' })` so its cache + criteria filters are reused. Prior-year uses the same 364-day-shifted window Sales Analysis uses.
- ROI / Turns / GP% computed from aggregate numerators/denominators at every level (not averages of row ratios) to avoid Simpson's paradox at rollup.
- Renderer extraction followed immediately — `renderSalesHierarchyDrillDown.tsx` is the read-only view used by the Phase 1.1 snapshot viewer.

**Consequences:**
- Operators who previously lived in the Excel pivot for "which SKUs drove this department this month?" have an interactive, filterable, snapshotable web equivalent.
- Hub card added to `SalesReportsHubPage` next to Sales Analysis.
- Registered as `sales-hierarchy-drill-down` in both `apps/api/src/services/reports/reportTypes.ts` and `apps/web/src/services/reportTemplatesApi.ts` REPORT_TYPES arrays. These two lists must stay in sync — adding a new report means touching both.
- SKUs with on-hand but zero sales in the period do NOT appear in the tree (tree is built from ticket lines). Intentional — matches Sales Analysis behavior; on-hand is a denominator column, not a driver.

**Alternatives considered:**
- Add a `HIERARCHY` mode to the existing Sales Analysis `reportType` union — rejected; would have to bifurcate the response shape (flat rows vs. tree) and forced every consumer to branch on reportType.
- Client-side tree build from three separate calls (`DEPT_SUMMARY`, `CATEGORY_SUMMARY`, `SKU_DETAIL`) — rejected; three server round-trips, three sets of totals, and no way to guarantee consistency across them.

**Related:** Feature session 2026-04-22 / 2026-04-23. Files: `apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts::getSalesHierarchy`, `apps/web/src/pages/salesReporting/SalesHierarchyDrillDownPage.tsx`, `apps/web/src/components/reports/renderers/renderSalesHierarchyDrillDown.tsx`.

---

## 2026-04-23 — Report Snapshot = single `ReportRun` table; no separate ephemeral cache

**Context:** The sales-reporting module spec (`rics-module-specs.md` lines 240-383) designed three related concepts: `SavedView` (filter presets), `ReportRun` (status-enum audit log with artifact URLs, 18-month retention), and `ReportSnapshot` (ephemeral 15-min-TTL result cache keyed to a `ReportRun`). That design predates the Phase 1 / 1.1 plan doc at `docs/dev/plans/2026-04-22-report-templates-and-runs.md`.

**Decision:** Ship the plan doc's simpler two-table design and treat the module spec's three-table design as superseded on this topic.

- `app.report_templates` — named filter presets (the `SavedView` equivalent). Columns: `id`, `ownerId`, `reportType`, `title`, `paramsJson`, `visibility` (`'private' | 'shared'`), `createdAt`, `updatedAt`, `lastUsedAt`.
- `app.report_runs` — frozen **snapshots** (the `ReportRun` and `ReportSnapshot` concepts merged). Columns: `id`, `userId`, `reportType`, `sourceTemplateId?` (FK → templates, ON DELETE SET NULL), `title?`, `paramsJson`, `resultJson` (full response payload, ≤ 20 MB), envelope columns (`rowCount`, `resultSizeBytes`, `reportTypeVersion`) computed server-side, `visibility`, `createdAt`.
- **No TTL / cleanup job.** Snapshots are explicit operator saves; retention = forever until the owner deletes. Phase 1.2 will add retention tooling if storage pressure appears.
- **No artifact table, no status enum, no scheduler trigger.** `ReportArtifact`, `RunTrigger`, `RunStatus`, `AsOfMode` from the module spec are not built. Exports from a snapshot are Phase 1.2; scheduled runs are unscoped (may never ship if operators find ad-hoc sufficient).

**Consequences:**
- One HTTP POST (`/api/v1/reports/runs`) captures everything. Envelope columns are set server-side so clients cannot lie about size/row count.
- Snapshot viewer at `/reports/runs/:id` re-renders from `resultJson` verbatim via per-report renderers in `apps/web/src/components/reports/renderers/`. No re-query against RICS.
- The module spec's `ReportSnapshot { runId @unique, expiresAt }` cache concept is retired. If we later want a 15-min anti-rerun cache, the obvious home is a TanStack Query layer in the frontend — not a DB table.
- The module spec's `ReportRun.status` / `completedAt` / `errorReason` fields are gone. A snapshot either exists (succeeded) or it doesn't (the POST 4xx'd and nothing persisted). Much simpler mental model.

**Alternatives considered:**
- Ship the three-table spec — rejected; over-engineered for current operator need (manual save, no scheduler yet).
- Put snapshots in `rics_mirror` alongside the frozen sales data — rejected; `rics_mirror` is drop-and-reload on every ETL pass, which would nuke snapshots.

**Related:** Plan doc [`../../dev/plans/2026-04-22-report-templates-and-runs.md`](../../dev/plans/2026-04-22-report-templates-and-runs.md) Phase 1.1. Migration `apps/api/prisma/migrations/20260423140000_report_runs/migration.sql`. Files: `apps/api/src/services/reports/reportRunsService.ts`, `apps/api/src/routes/reports/reportRunsRoutes.ts`, `apps/web/src/pages/reports/runs/*`.

---

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
