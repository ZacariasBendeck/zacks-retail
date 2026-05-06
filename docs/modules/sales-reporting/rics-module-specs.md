# Module: sales-reporting

**Goal**

`sales-reporting` is the analytical lens over every sale Zack's Retail records. It owns the report surfaces that merchandisers, buyers, store managers, and owners use to decide what to reorder, what to mark down, where to move inventory, how a vendor is performing, what sold this hour vs. the same hour last year, and how the shelf looks right now. It does not own a single sales transaction — those live in `sales-pos` (register tickets) and `customer-transactions` (layaways, special orders, gift certs, house charges). This module is a **read-only consumer** of those modules plus `inventory`, `products`, `otb-planning`, `employees`, and `store-ops`, and a producer of report definitions, saved views, scheduled runs, and export artifacts.

Primary user value: a buyer can open one web app, pick a report, filter it with the same criteria grammar RICS users already know (wild cards, ranges, exclusions, keyword `+` conjunctions), see results in-browser, and download a CSV or PDF — without ever closing a batch, posting sales, or waiting on an overnight job. The flagship report is **Sales Analysis** (RICS p. 88), "the most commonly used report because of all its options" — and this module must preserve every one of those options.

## RICS features covered

All page references are to the v7.7 manual at `docs/rics-reference/77manual.pdf`. Where a section name appears verbatim in the manual TOC it is quoted. Where sales-related reports are embedded in Ch. 2 (register workflow), this module still owns the report surface; the ticket lifecycle it draws from stays in `sales-pos` / `customer-transactions`.

### Headings and measures (p. 87 — Overview of Sales Reports)

The common column vocabulary shared by every Ch. 6 report. This module's column-model seed data replicates exactly this list:

- **p. 87, Qty** — quantity sold.
- **p. 87, Retail** — current retail price.
- **p. 87, Avg. Cost** — per (SKU × Store) average cost, owned by `products`.
- **p. 87, Curr Cost** — replacement cost, owned by `products`.
- **p. 87, Mkdn Cost** — markdown cost; computed as `(markdownPrice / originalRetail) × currentCost` when a markdown price exists, else equal to current cost. Accounting-valuation use case.
- **p. 87, Value** — total value of quantity at retail or at cost.
- **p. 87, %-Str / %-Rpt** — percent of store total / percent of report total (drives the Percentages option on Sales Analysis).
- **p. 87, Age** — days between `dateLastReceived` and today.
- **p. 87, Sales** — retail sales less markdowns and returns.
- **p. 87, Mkdwn%** — markdown percent. (Markdown $ = Sales × Mkdwn%.)
- **p. 87, Profit** — Sales − COGS.
- **p. 87, GP-%** — Profit / Sales.
- **p. 87, ROI%** — "sometimes known as GMROI … always annualized regardless of what period is being analyzed." The manual recommends ROI% as the single best overall indicator.
- **p. 87, Turns** — annualized turnover rate.
- **p. 87, V-SKU** — vendor SKU.
- **p. 87, Weeks** — weeks of supply on-hand based on current month sales.

### Sales Analysis Report (p. 88)

"The most commonly used report because of all its options. The sales analysis report always prints the current On-Hand Inventory Quantity, inventory value amounts, and the age of SKUs in addition to any sales information that may be requested" (p. 88).

**Analyze by** (p. 88) — Category | Vendor | Season | Group.

**Store Options** (p. 88) — Separate Stores | Compare Stores (side-by-side per item) | Combine Stores.

**Type of Report** (pp. 88–89):
- SKU Detail (with optional "Summarize by SKU description" sub-toggle).
- Category Summary (subtotals department also).
- Department Summary.
- Style/Color Summary.
- Vendor Summary.
- Price Point Summary — with Beginning Price Point, Price Increment, Ending Price Point; scope is "within the 'Analyze by' option or Store Totals Only."
- Season Summary.
- Group Summary.

**Criteria** (p. 89) — Stores, Categories, Vendors, Seasons, Style/Color, SKUs, Groups, Keywords; plus the three orthogonal flags: "only SKUs priced at the original retail price", "SKUs priced at a markdown price" (leave both unchecked = all), "only SKUs with perks." Criteria grammar follows the universal RICS convention (p. 8): ranges `-`, lists `,`, exclusions `<>`, wild cards `?` and `*`, hyphen-escape `!-`, and the keyword `+` AND-operator.

**Values and Dates — Show Percentages** (p. 89): Percent of Store | Percent of Report | No Percents ("makes your report run faster").

**Value On-Hand Inventory at** (p. 89): Retail Price | Average Cost | Current Cost | Markdown Cost | Retail Price AND Average Cost | Retail Price AND Current Cost. The "AND" variants constrain the Printing Options to a single selection.

**Aging Options** (p. 89) — Date Last Received (range), Date First Received (range), "Age by" Date First Received | Date Last Received (SKU-Detail only). When comparing/combining stores, first-received = earliest across stores, last-received = latest across stores; if it fails the criteria in any store, the SKU is excluded in all stores ("all or nothing").

**Printing Options** (pp. 89–90): "You may not select more than two of the Print Selections."
- Week-to-Date (WTD) — mutex with Prior Year and Inventory Summary.
- Month-to-Date (MTD) — mutex with Inventory Summary.
- Season-to-Date (STD) — mutex with Inventory Summary.
- Year-to-Date (YTD) — mutex with Inventory Summary.
- Prior Year — reports prior-year MTD / STD / YTD mirroring current selection; "if you are in the middle of a month … will give you the totals through the entire month of last year." Mutex with Inventory Summary, On Order, Last # of months.
- Inventory Summary — Month/Season/Year rollup showing Beginning Balance, Receipts, Sales, Returns, Transfers In, Transfers Out, Physical Inventory Adjustments, Markdowns, Ending Inventory, Sell Thru %. Value axis: Quantity | At Cost | At Retail (when by month).
- On Order amounts — At-Once | Future | In-Transit. In-Transit cannot combine with any other PO type on this report.
- Last # of months — 2–12 months, current month inclusive.

**Export as comma-delimited file** (p. 90) — produces a `.TXT` or `.CSV` file whose name the user types into an Export Filename text box.

**Trending Options** (p. 90):
- Include 8-Week Trending (adds the 8-week strip per line).
- "Weekly or Period sell-thru %" filter: Greater than / Less than __ % for __ of the last __ weeks. Example from manual: "greater than 15% for 3 of the last 4 weeks (up to 8 weeks)." Multi-store scope: trending is combined before the criterion is evaluated; all-or-nothing inclusion mirrors aging option (p. 90).

### Eight Week Trending (p. 91)

Maintains eight weeks of sales detail (current + prior 7).

- **p. 91, 8-week grid** — columns 7, 6, 5, 4, 3, 2, 1, Curr. Rows: Avail/Week, Avail/Period, Rec/Tran/Adj, Sales, ST%/Weekly, ST%/Period.
- **p. 91, "> reset" glyph** — ST%/Period prints with a leading `>` on any week whose period restarted (any Rec/Tran/Adj event resets the period).
- **p. 91, Avail/Week** — weekly beginning balance + Rec/Tran/Adj for that week.
- **p. 91, Avail/Period** — period beginning balance + sum of Rec/Tran/Adj for all weeks thru current.
- **p. 91, Rec/Tran/Adj** — receipts (PO or manual), returns-to-vendor, transfers (in or out), inventory adjustments (+ or −); **sales and customer returns are excluded**.
- **p. 91, Sales row** — all sales, layaway sales, special-order pickups, and customer returns (negative).
- **p. 91, ST%/Weekly** — weekly Sales / Avail/Week.
- **p. 91, ST%/Period** — weekly Sales / Avail/Period.
- **p. 91, "Close Week every week on the same day"** — hard requirement for the trending to track accurately.

### Best Sellers Report (p. 93)

Ranks best/worst SKUs. Multiple dimensions.

- **p. 93, Best:** SKUs by Category | SKUs by Vendor | SKUs (irrespective) | Vendors | Categories | Stores | SKUs by Group.
- **p. 93, In order of:** Quantity Sold | Net Sales | Profit | ROI% | Turns | Inventory Value | Sell-Thru %.
- **p. 93, In sales period:** Week | Month | Season | Year-to-date | Last # of Months (2–12). When ranked by Inventory Value, period only drives sales figures printed, not the ranking.
- **p. 93, Print which items:** All | Top N | Best above cutoff | Worst below cutoff.
- **p. 93, Print Inventory value by:** Retail Price | Average Cost | Current Cost.
- **p. 93, Combine Stores** checkbox.
- **p. 93, Criteria:** Stores, Categories, Vendors, Seasons, SKUs, Style/Colors, Groups, Keywords + "original retail only" / "markdown only" / "SKUs with perks."
- **p. 94, Export as comma-delimited file** — same TXT/CSV filename mechanism.

### Sales History by Month Report (p. 95)

12-month trailing sales.

- **p. 95, Sort by:** Vendors (alphabetical) | Categories (by number).
- **p. 95, Data to Print:** Quantity Sold | Net Sales | % of Store Sales.
- **p. 95, Detail to Print:** SKU Detail | Category/Vendor Subtotals (no SKUs, just subtotals) | Department Summary (department totals only).
- **p. 95, Combine Stores** checkbox.
- **p. 95, Criteria:** Stores, Categories, Vendors, Seasons, Style/Colors, Groups. (Keywords missing here — confirmed by manual wording; see Open Questions.)
- **p. 95, Export as comma-delimited file.**

### Stock Status Report (p. 96)

Size-grid inventory position, often paired with Sales Analysis.

- **p. 96, Sort by:** Category | Vendor | Location.
- **p. 96, Store Options:** Separate | Compare | Combine | Store Summary (totals only, no size grid).
- **p. 96, Select which inventory items:** All items | Only short (on-hand < model) | Only critical (short AND not on order) | Only on-order | Only negative on-hand | Only items with models | Only items with less than N sizes on-hand | Only items with WTD sales.
- **p. 97, Criteria:** Stores, Categories, Vendors, Seasons, Style/Colors, SKUs, Groups, Keywords, Locations + Perks + retail/markdown pricing flags (pricing flags unavailable when different-prices-per-store AND stores not separated — p. 97).
- **p. 97, Print which Quantities** (any combination): Model | On-Hand | Short | Critical | Max | Reorder | On Order (At-Once | Future | Total) | M-T-D Sales | S-T-D Sales | Y-T-D Sales | Y-T-D Available ("quantity at BOY + all changes").
- **p. 98, Also Print:** Costs | ROI and Turns | Column Totals | Age (first- or last-received) | Sales History by Month | Location | Perks.
- **p. 98, Aging Options:** Date Last Received range | Date First Received range; same all-or-nothing cross-store semantics as Sales Analysis.

### Size Type Analysis Report (p. 99)

Sell-through by size/column/row, key for pre-markdown and next-season ordering reviews.

- **p. 99, Sort by:** Category | Vendor | Combine (summary all stores) | Print SKU Detail.
- **p. 99, Criteria:** Stores, Categories, Vendors, Seasons, Style/Colors, SKUs, Groups, Keywords.
- **p. 99, Print** (any combination): On-Hand (qty and/or % of total) | On-Order At-Once (qty and/or %) | On-Order Future (qty and/or %) | On-Order Total (qty and/or %) | Sales (qty and/or % and/or Sell-thru %) | Available (qty and/or %).
- **p. 99, "Like size types only"** — the report combines percentages only across matching Size Types; having many Size Types fragments the output. This is a scoping rule, not an option.

### General Ledger Summary Report — moved to `accounts-receivable`

**Not covered here.** RICS places GL Summary (p. 100) inside Ch. 6 but our `accounts-receivable` module owns it (see `docs/MODULES.md` row 10 — fiscal-period primitive). This module only **consumes** the same posted-sales stream and must produce numbers that reconcile with A/R's GL.

### Create NPD Export File (p. 101)

Monthly export of SKU-level sales or on-hand to the NPD Group (retail sales aggregator).

- **p. 101, Precondition** — customer must have an NPD-assigned ID code.
- **p. 101, Export file name** — path + name; `.ZIP` produces a `NPDFILE.TXT` inside a zip of the given name; `.TXT` writes raw.
- **p. 101, Audit file** — a second file is generated for reconciliation.
- **p. 101, Designed for month-end** — the manual explicitly calls this out.
- **p. 101, Criteria:** Categories, Vendors, Seasons, Style/Colors, SKUs, Groups, Keywords.

### Export Inventory Quantities (p. 102)

Per-SKU per-size CSV of stock position and vendor metadata.

- **p. 102, Fields exported:** Store, SKU, Size Row, Size Column, On-Hand, On-Order Current, On-Order Future, Current Selling Price, Vendor Code, Category, Vendor SKU, Vendor Color Code, Description, Style/Color, Season Code, Group Code, Size Type, UPC.
- **p. 102, Export file name** — `.ZIP` wraps a `QUANTITY.TXT`; `.TXT` is raw.
- **p. 102, Combine Stores** checkbox (unchecked = per-store segregated export).
- **p. 102, Criteria:** Categories, Vendors, Seasons, Style/Colors, SKUs, Groups, Keywords.

### Export SKUs to HTML (p. 103)

Generates browsable SKU catalog pages (including pictures) to an HTML subdirectory.

- **p. 103, HTML File Prefix** — 8-char prefix for every generated page.
- **p. 103, Primary Sort:** Category | Vendor | SKU | Season (new file per Category/Vendor/Season when not sorted by SKU).
- **p. 103, Secondary Sort:** Category | Vendor | SKU | Season | Style/Color.
- **p. 103, SKU Criteria:** Categories, Vendors, Seasons, Style/Colors, SKUs, Groups, Keywords + "Only SKUs with pictures."
- **p. 104, Stock Criteria** (optional): filter by on-hand present, on-order (current + future) present, or WTD/MTD/STD/YTD sales present, scoped to selected stores.
- **p. 104, PO Criteria** (optional): ship-to stores, POs, Ship/Order/Cancel date ranges.
- **p. 105, Format File Name** — `HTM.CFG` template; generic `RICSHTM.CFG` ships with RICS; custom files per customer.
- **p. 105, Show Qtys for Store(s)** — which stores drive the on-hand / on-order / sales figures rendered on-page.

### Ch. 2 embedded sales reports (owned by this module)

These live inside the Ch. 2 register workflow but are report surfaces, not register actions. `sales-pos` owns the transactions; this module owns the reports.

- **p. 41, Print Sales by Time** — hourly quantity and dollars sold. Two date-range inputs for side-by-side comparison. Options: Stores filter, Select from posted sales, Select from unposted sales (both = all), Print % of Total.
- **p. 42, Print Salesperson Summary** — per-salesperson quantity + dollars + perks by department or vendor; voids/refunds summary when no category/vendor/SKU criteria are set. Options: date range; Subtotal by (Department | Vendor); Select from posted / unposted sales; Print percentages by department or vendor; Print Cashier Summary; Print SKU Subtotals; all-stores-combined scope; criteria — stores, salespeople, categories, vendors, SKUs, groups, keywords. **Note**: this module hosts the *report*, but salesperson master data + commission + period close live in `employees`.
- **p. 43, Print Sales by SKU** — SKU-level "pick list" of what sold. Options: date range; posted / unposted; Sort by SKU | Category/SKU | Vendor/SKU; Print format — Size Grid vs. Columnar; toggles — Include Returns, Print Retail Price, Print Store Totals, Print Category/Vendor Subtotals, Print SKU Subtotals; Criteria — Stores, Categories, Vendors, SKUs.
- **p. 44, Print Sales Journal** — detailed per-ticket listing per day / store / register. In RICS this is a **hard prerequisite to Post Sales to Inventory** — you cannot post without printing the journal first, and once sales are posted the journal for those sales cannot be re-generated. Options: stores; date range (recommended blank for "all unposted"); `JOURNALTIME` toggle (RICS.CFG) for per-ticket timestamps. Handles SKU-not-found errors inline (flags the ticket).
- **p. 47, Print Sales Tax Recap** — sales and taxes collected summarized by the customer's state (mail-list state). Options: stores; date range; posted / unposted / both; Store/State vs. State/Store report layout; source = ticket totals vs. ticket detail lines. Documents the rounding discrepancy between calculated and collected tax.
- **p. 47, Reprint Posted Sales** — reconstructs the sales journal (batch totals only; markdown and GP omitted) for posted sales. Also offers individual-ticket reprint as a receipt, with Print Gift Receipt sub-option. Options: stores; date range; Print Special Tickets Only (unmatched-price OR returns).
- **p. 50, Print Returned Sales** — tracks returned sales. Options: date range; posted / unposted; Sort by SKU | Category-and-SKU | Vendor-and-SKU | Cashier | Salesperson | Return Code; Combine Stores; Include Price; Include Only Trackable Returns; Include Return Code Subtotals (when not sorting by return code).
- **p. 51, Promotion Code Analysis** — summarizes tickets carrying a Promotion Code and compares against promotion cost to compute response rate / profit. Options: Criteria (promotions + stores); date range; posted / unposted / both; Combine Stores (required for response-rate calculation).
- **p. 52, Sales By Day** — compares current daily sales to a comparison date window. Options: date range (required); Comparison Date = 52 weeks ago | # Days (≤999) | # Weeks (≤999); Week Ends on (day-of-week anchor); Combine Stores.

### Framework features shared with every RICS report (Ch. 1 pp. 7–8)

These are not individual reports but are shared options every report in this module inherits:

- **p. 7, Report Comment + Save Current Selection** — any report's filter set can be named and saved; naming a saved view `DEFAULT` makes it the default the next time that report is opened.
- **p. 7, Retrieve Saved Selection** — recall a saved view (this module's `SavedReportView`).
- **p. 7, Underlined Options / Job List** — Underlined reports can be chained into Job Lists or Super Jobs (Ch. 14 p. 189). This is replaced by scheduled runs in `platform` (see Modernization).
- **p. 8, Criteria grammar** — `-` ranges, `,` lists, `<>` exclusions, `?` / `*` wild cards, `!-` escaped hyphen, keyword `+` to require ALL keywords. Shared filter-parser contract surfaced as `products.listSkusByCriteria(criteria)` per `products.md`.

## Modernization decisions

- **Reports are browser-native — no screen spool, no printer driver, no TXT-or-CSV-only export.** Every report renders to a TanStack-powered data grid with virtualized rows; "download" produces CSV, PDF, or XLSX via a server-side exporter. Drops RICS's `.TXT`-or-`.CSV`-via-filename mechanic (pp. 90, 93, 95, 100, 101, 102) and the entire Ch. 14 Screen Spool surface.
- **Live by default, as-of-close as an explicit toggle.** RICS's entire posted/unposted duality (Print Sales by Time, by SKU, Sales Journal, Sales Tax Recap, Promotion Code Analysis, etc.) exists because posting is a manual step. In Zack's Retail posting is a background projection — every completed ticket immediately flows to the ledger. Every report surfaces this as three choices: **Live (default)**, **As-of last close**, **Custom fiscal period**. The "posted vs. unposted" checkboxes disappear. See Open Question 1 for edge cases.
- **Sales data is an event stream from `sales-pos`, not a post-close snapshot.** Completed-ticket events (`TicketCompletedEvent`, `TicketVoidedEvent`, `RefundIssuedEvent`) are consumed by a `SalesFactDaily` materialized aggregate owned by this module. Mirrors the contract pattern in `purchasing.md` / `products.md`: this module never joins the source tables directly.
- **Criteria grammar preserved verbatim** but exposed as a reusable `CriteriaExpression` JSON shape + a `parseCriteria(text)` helper. Shared filter widget across all reports; values stored on `SavedReportView`. Users who know the RICS grammar (`<>NIKE`, `+WEDGE HEEL`, `???37`) paste it; users new to it use the builder UI.
- **Saved filter presets become first-class, per-user entities.** RICS's Report Comment = DEFAULT mechanism (p. 7) becomes `SavedReportView` rows scoped by `(reportKey, userId)`. A user may mark one per `reportKey` as their default; admins may publish a view as "company default" (read-only to others).
- **Job List + Super Jobs collapse into `platform` scheduled runs.** RICS's "chain reports into a Job List and run after-hours" (Ch. 14 p. 189) becomes `ReportRun` rows produced by a `platform` scheduler. Outputs (CSV / PDF / NPD / HTML) are persisted to object storage and linked from a per-user Runs dashboard; notifications land in-app + email. Drops the Underlined-Options / Super Jobs UI entirely.
- **NPD export, Export Inventory Quantities, and Export SKUs to HTML become scheduled export jobs, not foreground reports.** All three take minutes and write to disk in RICS; in Zack's Retail they run as background jobs in `platform`, produce artifacts attached to a `ReportRun`, and the "Export" button in this module is actually a "Queue an export" action. HTML export additionally lives behind a feature flag — it is seldom-run and has a custom `HTM.CFG` template story that will need real design work when it is re-opened.
- **Heavy aggregations are cached via `SalesFactDaily` + on-demand `ReportSnapshot`.** Sales Analysis with WTD/MTD/STD/YTD across Combine-Stores and size-type-by-size-type breakdowns can scan millions of rows. The strategy: (a) a nightly job rolls up ticket lines into `SalesFactDaily` at `(date, storeId, skuId, columnLabel, rowLabel)` granularity; (b) every ad-hoc report first runs against `SalesFactDaily` and patches live data for today's partial day from the `sales-pos` event stream. For expensive slices (8-week trending, price-point summaries) the result set is captured as a `ReportSnapshot` with a 15-min TTL so a user tweaking a filter in the browser does not re-scan the warehouse.
- **OTB-aware sales views come from `otb-planning` via read contract, not a shared join.** The Ch. 6 reports that intersect OTB (OTB vs. Sales p. 100, OTB Report p. 100) live in `otb-planning`. But Sales Analysis can carry an "OTB plan" column when grouped by (Store × Category × Month); this is fetched via `otbPlanningContract.getPlanCells(filter)`. No direct DB joins — matches the OTB / purchasing governance pattern already in effect (see `apps/api/src/contracts/purchasingContract.ts`).
- **Sales Journal is a historical record, not a posting prerequisite.** In RICS you must print the journal before you can post (p. 44). In Zack's Retail every completed ticket is already in the ledger — the journal is a reprint-anything report with no gate. Drops the "sales will not post without a journal" error path entirely; keeps the journal format itself.
- **Post Sales to Inventory (p. 45) is not in this module.** It is a `sales-pos` closeout operation (or, arguably, obsolete). Listed here only to confirm the boundary: `sales-reporting` never triggers posting.
- **Eight Week Trending close semantics.** RICS says the trending is inaccurate unless Close Week runs every week on the same day (p. 91). Zack's Retail preserves that reporting boundary with an app-owned Inventory Week Close operation under Operations. The close rotates the seven stored trend slots, writes the just-finished week into the newest slot, and resets weekly inventory-history counters.
- **"Two of any three Printing Options" (p. 90) interlock preserved.** The exclusivity rules in Sales Analysis (`WTD ⊥ PriorYear`, `WTD ⊥ InvSummary`, `Prior Year ⊥ InvSummary ⊥ OnOrder ⊥ Last#months`, "no more than two Print Selections") are enforced by the filter UI via a declarative mutex map on `ReportDefinition`. Avoids the legacy RICS UX of clicking a checkbox and then being told "you may not choose that."
- **Criteria filters propagate through shared selectors.** `products.listSkusByCriteria(criteria)` is called once per report run to resolve the SKU set; results are cached for the duration of the run. All cross-store "all-or-nothing" semantics on aging and trending (pp. 90, 98) are implemented in a shared `applyCrossStoreAllOrNothing(skuIds, evaluator)` helper.
- **Retail chain criteria expand to stores before aggregation.** Custom Pivot exposes `app.store_group` / `app.store_group_member` as a Retail Chain selector. Selected chains are unioned with explicitly selected stores, then applied as the store filter for both sales and on-hand aggregation.
- **Custom Pivot supports two- or three-level hierarchy.** Operators can group leaves as Level 1 → Level 2 → SKU or Level 1 → Level 2 → Level 3 → SKU. Category remains available only at the deepest selected level.
- **Export to RMSA (Ch. 15 p. 207) stays deferred.** Like NPD, it is a monthly third-party export. Feature-flagged, parked in `platform` export scheduling, not shipped in v1. (Out of scope.)
- **GL Summary report output is mirrored as a read from `accounts-receivable`.** GL Summary itself lives in `accounts-receivable`, but this module's dashboards will embed it as a tile. We call `accountsReceivableContract.getGlSummary(filter)` and render.
- **Dashboards replace the RICS "run several summary reports then drill" workflow** described at p. 12 "Key Reports to Run." The "80-20" guidance (p. 12) becomes a canned dashboard: ROI% vs. store average, Best Sellers top 20 by ROI%, bottom 20 by ROI%, Sales Analysis department summary with a drill-down into SKU detail. Existing scaffolding in `apps/api/src/services/dashboardService.ts` is the seed.
- **Search / filter UX.** The legacy "Criteria screens" (separate folders for Stores, Categories, Vendors, Seasons …) collapse into a single multi-facet filter bar with per-facet autocomplete (driven by `products` taxonomy). The raw criteria-grammar string box is available behind an "Advanced" toggle for power users who still think in `<>`, `+`, `?`, `*`.
- **Saved-selection sharing.** RICS saved selections are per-user and per-install. Ours are per-user by default, with an explicit "share as company view" action (requires `reports.share` permission from `employees`).
- **All reports are CSV/PDF-downloadable regardless of the original RICS export availability.** RICS restricts comma-delimited export to specific reports (p. 90 Sales Analysis, p. 94 Best Sellers, p. 95 Sales History, p. 100 GL Summary). In Zack's Retail every report is exportable. This eliminates the "run it again with the CSV checkbox" re-run anti-pattern.
- **Audit trail on every run.** Every ad-hoc and scheduled report execution records a `ReportRun` row: who ran it, when, with which filters, which result row count, and (when exported) the storage URL of the artifact. Supports "who pulled the year-end Best Sellers last March?" forensics and matches the telemetry ambition in `platform`.
- **Per-SKU / per-size / per-store matrix is always flattened in storage**, mirroring the decision already made in `products.md` open question 5: the wide-column RICS shape (`OnHand_01..18`, segmented rows) is never rebuilt in Postgres. `SalesFactDaily` uses `(date, storeId, skuId, columnLabel, rowLabel)` tuples; reports re-pivot at query time.

## Data model sketch

> ⚠️ May be stale per 2026-04-23 /index-knowledge pass: the `SavedView` / `ReportRun` (with status enum + artifacts) / `ReportSnapshot` (15-min TTL cache) three-table design below was superseded by the simpler two-table design that shipped in Phase 1.1. Current truth lives in [`../../dev/plans/2026-04-22-report-templates-and-runs.md`](../../dev/plans/2026-04-22-report-templates-and-runs.md) and [`./decisions.md`](./decisions.md) → "2026-04-23 — Report Snapshot = single `ReportRun` table". In the shipped model: `app.report_templates` holds saved filter presets (the `SavedView` equivalent), and `app.report_runs` holds frozen snapshots with the full `result_json` payload (the `ReportRun` + `ReportSnapshot` concepts merged). No status enum, no artifact table, no TTL. Retain the sections below only for the ambition they still express around `SalesFactDaily` / `WeeklyTrendFact` / NPD export — those are unaffected by the templates/runs decision. Review and prune the three obsolete models when confirmed.

This module's Postgres footprint is small — it is mostly a read-model over `sales-pos`. The tables below define report catalog, saved filters, scheduled runs, and the materialized sales aggregate that backs every report.

```prisma
// --- Report catalog (static, seed data) ---
// One row per unique RICS report ported here. Seeded from this spec.

model ReportDefinition {
  key              String   @id                // "sales.analysis", "sales.best_sellers", etc.
  displayName      String                      // "Sales Analysis Report" (RICS p. 88)
  ricsPageRef      String                      // "RICS p. 88"
  category         ReportCategory              // ANALYSIS | TRENDING | STOCK | SALES | EXPORT
  schemaVersion    Int                         // bump on filter-shape change
  filterSchema     Json                        // JSON Schema for filters (mutex rules encoded here)
  defaultColumns   Json                        // default column projection
  exportFormats    String[]                    // [csv, pdf, xlsx], some reports also [npd, html, zip]
  supportsLive     Boolean                     // false only for historical/fiscal-only reports
  supportsScheduled Boolean                    // true for reports that make sense as cron jobs
  mutexRules       Json                        // e.g. Sales Analysis's "no more than two Print Selections" (p. 90)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  savedViews       SavedReportView[]
  runs             ReportRun[]
}

enum ReportCategory { ANALYSIS  TRENDING  STOCK  SALES  EXPORT  JOURNAL }

// --- Saved filter presets (per-user, shareable) ---
// Replaces RICS "Report Comment + Save Current Selection" (p. 7).

// --- Report run history (ad-hoc + scheduled) ---

model ReportRun {
  id              String   @id @default(uuid())
  reportKey       String
  savedViewId     String?                       // null for pure ad-hoc
  trigger         RunTrigger                    // AD_HOC | SCHEDULED | SUPER_JOB_COMPAT
  requestedByUserId String?                     // null for system-scheduled
  scheduleId      String?                       // links to platform.Schedule if scheduled
  filtersSnapshot Json                          // frozen filters for reproducibility
  asOfMode        AsOfMode                      // LIVE | LAST_CLOSE | CUSTOM_FISCAL_PERIOD
  fiscalPeriod    Json?                         // { year, month } or { year, season } when CUSTOM
  status          RunStatus                     // QUEUED | RUNNING | SUCCEEDED | FAILED | CANCELLED
  startedAt       DateTime?
  completedAt     DateTime?
  rowCount        Int?
  errorReason     String?
  artifacts       ReportArtifact[]
  createdAt       DateTime @default(now())

  report          ReportDefinition @relation(fields: [reportKey], references: [key])

  @@index([reportKey, requestedByUserId, createdAt])
  @@index([status])
}

enum RunTrigger { AD_HOC  SCHEDULED  SUPER_JOB_COMPAT }
enum AsOfMode   { LIVE  LAST_CLOSE  CUSTOM_FISCAL_PERIOD }
enum RunStatus  { QUEUED  RUNNING  SUCCEEDED  FAILED  CANCELLED }

model ReportArtifact {
  id              String   @id @default(uuid())
  runId           String
  format          ArtifactFormat                // CSV | PDF | XLSX | NPD_TXT | NPD_ZIP | HTML_ZIP | QUANTITY_CSV
  storageUrl      String                        // S3 / object storage URL
  sizeBytes       Int
  checksum        String
  createdAt       DateTime @default(now())

  run             ReportRun @relation(fields: [runId], references: [id])

  @@index([runId])
}

enum ArtifactFormat { CSV  PDF  XLSX  NPD_TXT  NPD_ZIP  HTML_ZIP  QUANTITY_CSV  AUDIT_TXT }

// --- Materialized sales aggregate (read-model over sales-pos) ---
// Nightly rollup + incremental event application for the current day.
// Grain: (date × storeId × skuId × columnLabel × rowLabel).

model SalesFactDaily {
  id              String   @id @default(uuid())
  date            DateTime                      // date only
  storeId         Int
  skuId           String
  columnLabel     String?
  rowLabel        String?
  quantitySold    Int                           // net of returns
  quantityReturned Int                          // gross returns, for Print Returned Sales (p. 50)
  grossSales      Decimal                       // before markdowns
  netSales        Decimal                       // after markdowns and returns ("Sales" on p. 87)
  markdownAmount  Decimal                       // Sales × Mkdwn%
  cogs            Decimal                       // average-cost-based; reads from products.SkuAverageCost
  perkAmount      Decimal                       // sum of perks earned on lines selling this SKU
  ticketsWithSku  Int                           // needed for % of tickets calculations
  promotionCodes  String[]                      // distinct promo codes on tickets touching this row (p. 51)
  source          FactSource                    // TICKET | SPECIAL_ORDER_PICKUP | LAYAWAY_SALE | GIFT_CERT_REDEMPTION
  lastUpdatedAt   DateTime @updatedAt

  @@unique([date, storeId, skuId, columnLabel, rowLabel, source])
  @@index([storeId, date])
  @@index([skuId, date])
}

enum FactSource { TICKET  SPECIAL_ORDER_PICKUP  LAYAWAY_SALE  GIFT_CERT_REDEMPTION }

// --- 8-week trending materialized view (RICS p. 91) ---
// Derived from SalesFactDaily + inventory movements; refreshed at Close Week events
// but recomputed live for the current week from the event stream.

model WeeklyTrendFact {
  id              String   @id @default(uuid())
  weekEndingDate  DateTime                      // anchor from store-ops Company Setup "fiscal_week_ends_on"
  storeId         Int
  skuId           String
  availWeek       Int                           // Avail/Week (p. 91)
  availPeriod     Int                           // Avail/Period (p. 91)
  recTranAdj      Int                           // Rec/Tran/Adj (p. 91) — receipts, transfers, adjustments; NOT sales
  quantitySold    Int
  stWeekly        Decimal                       // ST%/Weekly
  stPeriod        Decimal                       // ST%/Period
  periodReset     Boolean                       // drives the > glyph
  createdAt       DateTime @default(now())

  @@unique([weekEndingDate, storeId, skuId])
  @@index([skuId, weekEndingDate])
}

// --- Ephemeral result snapshot cache (15-min TTL) ---

model ReportSnapshot {
  id              String   @id @default(uuid())
  runId           String   @unique
  resultRows      Json                          // capped to max-rows configurable in platform
  computedAt      DateTime @default(now())
  expiresAt       DateTime                      // computedAt + 15 min default

  run             ReportRun @relation(fields: [runId], references: [id])

  @@index([expiresAt])
}

// --- NPD export audit (p. 101) ---
// Monthly audit file RICS generates alongside the NPDFILE.TXT. We persist
// rather than write a sidecar file so the audit is queryable.

model NpdExportAudit {
  id              String   @id @default(uuid())
  runId           String
  month           Int
  year            Int
  npdCustomerId   String                        // required precondition — from Company Setup
  rowCount        Int
  totalQuantity   Int
  totalNetSales   Decimal
  skuSampleJson   Json                          // first 100 rows for spot-check
  createdAt       DateTime @default(now())
}
```

Retention:
- `SalesFactDaily` and `WeeklyTrendFact` are source-of-truth-adjacent and never purged.
- `ReportRun` + `ReportArtifact` default to 18 months, configurable per-run (users can "pin" a run to prevent purge). Retention policy lives in `platform`.
- `ReportSnapshot` is purged hourly by a cleanup job (`expiresAt < now()`).

## Contracts with other modules

This module is the heaviest **consumer** in the system. All inbound data flows through named contracts; no direct cross-module DB joins.

**From `sales-pos`** — live ticket stream + posted history.

```ts
interface SalesPosReadContract {
  // Live stream subscription (for the current day partial). Pushes events;
  // this module applies them to SalesFactDaily for today's date.
  subscribeTicketEvents(handler: (evt: TicketEvent) => void): Unsubscribe;

  // Bulk fetch for nightly SalesFactDaily roll-up and for journal reports.
  getTicketLinesForDateRange(params: {
    from: Date; to: Date; storeIds?: number[];
  }): Promise<TicketLineRow[]>; // drives Sales Journal (p. 44), Sales by Time (p. 41), Sales by SKU (p. 43)

  // Reprint Posted Sales (p. 47) — whole ticket payload.
  getTicket(ticketId: string): Promise<TicketPayload | null>;

  // Returned-sales (p. 50) + Sales Tax Recap (p. 47).
  getReturnsForDateRange(params: {
    from: Date; to: Date; storeIds?: number[]; onlyTrackable?: boolean;
  }): Promise<ReturnRow[]>;

  getTaxSummaryForDateRange(params: {
    from: Date; to: Date; storeIds?: number[]; source: 'TICKET_TOTALS' | 'LINE_ITEMS';
  }): Promise<TaxSummaryByState[]>;

  // Promotion Code Analysis (p. 51).
  getPromotionCodeUsage(params: {
    from: Date; to: Date; storeIds?: number[]; promotionCodes?: string[];
  }): Promise<PromotionCodeUsageRow[]>;
}
```

Events consumed: `TicketCompletedEvent`, `TicketVoidedEvent`, `RefundIssuedEvent`, `BatchClosedEvent`.

**From `customer-transactions`** — layaway / special-order / gift-cert sales and redemptions feed the Sales fact.

```ts
interface CustomerTransactionsReadContract {
  // Special-order pickup events add to SalesFactDaily with source = SPECIAL_ORDER_PICKUP (RICS p. 91: "special order pickups" count as Sales in trending).
  getSpecialOrderPickupsForDateRange(range): Promise<PickupRow[]>;
  getLayawaySalesForDateRange(range): Promise<LayawaySaleRow[]>;
  getLayawayPaymentsForDateRange(range): Promise<LayawayPaymentRow[]>;  // for A/R reconciliation views
  getGiftCertRedemptionsForDateRange(range): Promise<GiftCertRedemptionRow[]>;
  getHouseChargesForDateRange(range): Promise<HouseChargeRow[]>;        // for Sales Tax Recap parity
}
```

Events consumed: `SpecialOrderPickedUpEvent`, `LayawaySoldEvent`, `LayawayPaidEvent`, `GiftCertRedeemedEvent`, `HouseChargeSaleEvent`.

**From `inventory`** — on-hand, on-order breakdowns, size-grid cells, movement ledger for Inventory Summary (p. 89) and Stock Status (p. 96).

```ts
interface InventoryReadContract {
  getOnHand(skuId: string, storeId: number): { total: number; bySize: SizeCell[] };
  getOnOrder(skuId: string, storeId: number, classification?: 'AT_ONCE' | 'FUTURE' | 'IN_TRANSIT' | 'TOTAL'): number;
  getModelAndMax(skuId: string, storeId: number): { model: number; max?: number; reorder?: number };
  getDateFirstReceived(skuId: string, storeId: number): Date | null;
  getDateLastReceived(skuId: string, storeId: number): Date | null;
  // Inventory Summary activity — Beginning, Receipts, Transfers In/Out, Phys Adj, Markdowns, Ending (p. 89).
  getInventoryActivity(params: {
    skuId?: string; storeId?: number; categoryId?: number;
    period: 'MONTH' | 'SEASON' | 'YEAR';
    anchorDate: Date;
  }): Promise<InventoryActivityRow[]>;
  // Y-T-D Available (Stock Status p. 97) — BOY qty + all changes.
  getYtdAvailable(skuId: string, storeId: number): number;
}
```

**From `otb-planning`** — plan cells for OTB-aware comparison columns on Sales Analysis and for the Dashboards tile that mirrors OTB vs. Sales.

```ts
interface OtbPlanningReadContract {
  getPlanCells(filter: {
    storeIds?: number[]; categoryIds?: number[]; year: number; months?: number[];
  }): Promise<OtbPlanCell[]>;      // { storeId, categoryId, year, month, plannedSales, plannedBOM, plannedEOM, turnover, gp% }
  getPlanVsActualSummary(year: number, storeIds?: number[], categoryIds?: number[]): Promise<OtbComparisonRow[]>;
}
```

**From `products`** — taxonomy + SKU identity + criteria resolver + pricing.

```ts
interface ProductsReadContract {
  getSku(skuIdOrCode: string): Promise<SkuRecord | null>;
  listSkusByCriteria(criteria: CriteriaExpression): Promise<string[]>;  // RICS p. 8 grammar
  getCurrentPrice(skuId: string, storeId: number, asOf?: Date): Promise<PriceResult>;
  getAverageCost(skuId: string, storeId: number): Promise<Decimal>;
  getSizeType(sizeTypeId: number): Promise<SizeTypeDef>;
  getCategory(categoryId: number): Promise<{ id: number; name: string; departmentId: number }>;
  getVendor(vendorId: string): Promise<VendorRecord>;
  getSeasonForSku(skuId: string): Promise<string | null>;
  getGroupForSku(skuId: string): Promise<string | null>;
}
```

Events consumed: `PriceChangeAppliedEvent`, `PriceDiscountAppliedEvent`, `SkuDiscontinuedEvent` — all invalidate cached `ReportSnapshot` rows touching the affected SKUs.

**From `employees`** — salesperson dimension for Print Salesperson Summary (p. 42) + permissions.

```ts
interface EmployeesReadContract {
  getSalesperson(salespersonId: string): Promise<SalespersonRecord | null>;
  listSalespeople(filter: { storeIds?: number[]; active?: boolean }): Promise<SalespersonRecord[]>;
  getCommissionOverride(salespersonId: string, departmentId: number): Promise<Decimal | null>;
  userHasPermission(userId: string, permission: 'reports.share' | 'reports.schedule' | 'reports.view_gp' | 'reports.export_bulk'): Promise<boolean>;
}
```

Permissions are enforced at the API boundary: `reports.view_gp` gates any column showing `Profit` / `GP-%` / `ROI%`; `reports.share` gates `SharingScope = SHARED_READ_ONLY`; `reports.schedule` gates scheduled runs; `reports.export_bulk` gates NPD / Quantity CSV / HTML exports.

**From `store-ops`** — store + tender-type dimensions, fiscal-week anchor, Company Setup flags.

```ts
interface StoreOpsReadContract {
  listStores(): Promise<StoreRecord[]>;
  getFiscalWeekEndsOn(): Promise<1 | 2 | 3 | 4 | 5 | 6 | 7>; // day-of-week anchor for 8-week trending (p. 91)
  getFiscalPeriodBoundaries(year: number, month: number): Promise<{ from: Date; to: Date }>;
  listTenderTypes(): Promise<TenderTypeRecord[]>;            // powers Sales Journal tender totals
  listTaxes(): Promise<TaxRecord[]>;                          // powers Sales Tax Recap (p. 47)
  getCompanySetting(key: 'gl.summary.account_mapping' | 'fiscal.season_setup' | 'report.default_combine_stores'): Promise<unknown>;
}
```

**From `accounts-receivable`** — GL Summary mirror + fiscal-close boundary.

```ts
interface AccountsReceivableReadContract {
  getGlSummary(filter: { storeIds?: number[]; year: number; months?: number[] }): Promise<GlSummaryRow[]>;
  getLastCloseEvent(scope: 'WEEK' | 'MONTH' | 'SEASON' | 'YEAR'): Promise<{ closedAt: Date; closedByUserId: string } | null>;
  // Drives the "As-of last close" toggle on every report.
}
```

Events consumed: `MonthClosedEvent`, `WeekClosedEvent`, `SeasonClosedEvent`, `YearClosedEvent` — each triggers a `WeeklyTrendFact` materialization cut and locks the fiscal-snapshot as-of-date for LAST_CLOSE report mode.

**Outbound (contracts this module exposes)**

```ts
interface SalesReportingReadContract {
  // Used by dashboards (store-ops, employees, owner-view) and by the
  // storefront admin to show "recently popular" rollups.
  getTopSellers(params: {
    by: 'SKU' | 'VENDOR' | 'CATEGORY' | 'STORE';
    metric: 'QTY' | 'NET_SALES' | 'PROFIT' | 'ROI' | 'TURNS' | 'SELL_THRU';
    period: 'WEEK' | 'MONTH' | 'SEASON' | 'YTD';
    topN?: number;
    filter?: CriteriaExpression;
  }): Promise<BestSellerRow[]>;

  // Used by customer-transactions to show "sold this month" on a layaway ticket.
  getSkuSalesWindow(skuId: string, storeId: number, window: 'WTD' | 'MTD' | 'STD' | 'YTD'): Promise<SalesWindowRow>;

  // Used by otb-planning for OTB vs. Sales (its own report, but backed by our fact).
  getActualSalesForOtb(year: number, month: number, storeIds?: number[], categoryIds?: number[]): Promise<OtbActualRow[]>;

  // Used by employees for Salesperson Analysis (p. 111) — the report lives there,
  // the fact comes from here.
  getSalespersonSalesFact(salespersonId: string, window: 'PTD' | 'MTD' | 'STD' | 'YTD'): Promise<SalespersonFactRow>;

  // Used by purchasing to drive "was this SKU actually selling?" on the PO detail.
  getRecentMovement(skuId: string, storeId: number): Promise<{ lastSoldAt: Date | null; qtyLast7: number; qtyLast30: number }>;
}
```

**Events emitted by this module**

- `ReportRunCompletedEvent { runId, reportKey, userId, artifactUrls[] }` — `platform` sends email / in-app notification.
- `SalesFactDailyRolledOverEvent { date }` — fired when the nightly rollup finishes; downstream caches (dashboards, storefront "trending" widgets) invalidate.
- `WeeklyTrendFactCutEvent { weekEndingDate }` — fired on Close Week; 8-week-trending consumers refresh.

## Open questions

1. **"Live" vs. "posted" semantics for the legacy posted/unposted toggles.** The Modernization section collapses RICS's posted/unposted triad (p. 41 Sales by Time, p. 43 Sales by SKU, p. 47 Sales Tax Recap, p. 50 Returned Sales, p. 51 Promotion Code Analysis) into Live/Last-Close/Custom-Fiscal. Edge case: an auditor may still want to reproduce a report "the way it printed on April 3rd before posting." Do we store a nightly `ReportSnapshot` of every key report automatically (cheap but wasteful), or only when a user pins a run (user-driven, may miss audit requests)? Recommendation: nightly snapshot of a short canonical list (Sales Journal, GL Summary, Sales Tax Recap) and user-driven for everything else.
2. **Sales History by Month criteria surface (p. 95).** The manual lists Stores, Categories, Vendors, Seasons, Style/Colors, Groups but **not Keywords** — even though Sales Analysis (p. 89) and Best Sellers (p. 93) both accept Keywords. Is this a documentation gap or a real feature boundary? Recommendation: add Keywords to the v1 filter bar and note the manual discrepancy.
3. **Markdown Cost formula edge cases (p. 89).** The manual specifies `markdownCost = (markdownPrice / originalRetail) × currentCost`, but the "original retail" source is ambiguous when a SKU has had multiple price changes. Is "original retail" the value in the RICS Retail slot at report time, or the first historical retail from the SKU's audit log? Needs merchandiser input.
4. **Prior Year reporting across fiscal-year boundary.** RICS "Prior Year" (p. 89) gives "totals through the entire month of last year" when run mid-month. If last year had 53 weeks vs. this year's 52, the comparison is misaligned. Do we align by fiscal-week-number or by calendar date? RICS is silent. Recommendation: fiscal-week-number with calendar-date fallback as a per-report toggle.
5. **Inventory Summary (p. 89) — what counts as a "Markdowns" event vs. a "Sales" event?** RICS computes markdown dollars as Sales × Mkdwn%, which means a markdown is implicit in every sale of a marked-down SKU, not a distinct event. But the Inventory Summary row "Markdowns" seems to want absolute markdown events (price changes that lowered retail). The mapping between these two semantics is unclear.
6. **Size Type Analysis "like size types only" constraint (p. 99).** Should the report silently bucket the selected SKUs into Size-Type groups and print one grid per group, or should the filter UI require the user to pick a single Size Type up front? Recommendation: bucket-and-print, with a caption indicating how many Size Type groups appear.
7. **NPD Export field spec (p. 101).** The manual does not publish the NPD record layout — "contact CSI Services." For v1 we need the current NPD spec sheet from NPD Group before implementing, or we defer NPD entirely to v2. Flag for product-owner decision.
8. **HTML export format file (`HTM.CFG`, p. 105).** RICS's templating is a bespoke config format. We will not reimplement `HTM.CFG` literally. Options: (a) one fixed modern template; (b) a handful of themes; (c) a user-provided HTML template string. Pick one before surfacing the feature.
9. **"Include only SKUs with perks" scope (pp. 89, 93, 98).** Perks live on SKU master (`products.SkuPerk`). Is the filter "SKU has a non-zero perk amount today" or "SKU had a perk on the tickets in the reporting window"? The two diverge for SKUs whose perk was set to zero partway through the period.
10. **Combine Stores on reports that also show per-store columns.** Stock Status Store Summary (p. 96) is unambiguous. But Sales Analysis with Store Option = Compare Stores + Sales History by Month (p. 95) where you might also want "combined" subtotals is less clear. Do we always append a "TOTAL" column when Combine Stores is checked, or is Combine Stores always mutex with per-store columns?
11. **Price Point Summary (p. 88) with Combine Stores.** When prices differ per store (product.md open question 2 confirmed per-store scheduled changes), price points are store-specific. Does the report bucket by the canonical retail or by per-store current retail? Needs confirmation.
12. **Criteria expression persistence on `SavedReportView`.** If a user saves a view with `Vendor = <>NIKE` (exclude Nike) and Nike is later renamed to Nike Inc., does the saved view still exclude it? Recommendation: saved views store resolved IDs at save-time with an explicit "re-resolve on each run" toggle; default to resolved-at-save for auditability.
13. **Retention of `ReportArtifact` for NPD / Quantity CSV / HTML ZIP.** These can be large (tens of MB). Does the 18-month default apply, or should these carry a shorter (e.g., 90-day) retention? Coordinate with `platform` retention config.
14. **Dashboard composition.** The "Key Reports to Run" p. 12 guidance suggests a canonical operator dashboard. Do we ship a single opinionated dashboard out of the box, or a dashboard-builder where every tile is a saved view? Recommendation: opinionated v1, builder v2.
15. **Does this module own a "Sales Analysis SKU drill" sub-report?** The manual flow is: run Sales Analysis at Department Summary → identify weak department → run again at SKU Detail with filter. In a modern UI this is a single click (drill-down in the grid). Confirm we want that drill-in-place rather than separate reports.
