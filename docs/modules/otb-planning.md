# Module: otb-planning

**Goal**

`otb-planning` owns the merchandiser's spending plan — what we *intend* to buy, by store × category × month, expressed at retail and cost — and the gates that protect that plan from accidental overspend at PO submit time. It maintains both the seasonal plan (entered by the buyer in advance, optionally derived from last year + a % change) and the live projection that consumes commitments from `purchasing` and actuals from `sales-reporting` / `accounts-receivable`. Primary user value: a buyer or merchandise planner can see, for any store/category/month, exactly how much spend is planned, how much is already committed on open POs, how much has landed, and how much is still open-to-buy — and the system blocks (or routes for CEO exception) any PO that would breach that plan.

## RICS features covered

**OTB Plan setup** (Ch. 11)
- ✅ **p. 158, Open To Buy Plan – File Setup** — the plan file is *optional* in RICS but required to print either of the OTB reports. Keyed by **Store # × Category # × month**, with header fields per (store, category): `% change last year → this year`, `% change this year → next year`, `Planned Turnover 1st 6 months`, `Planned Turnover 2nd 6 months`, `Planned Gross Profit %`. Sales values per month are stored alongside last-year actuals (which only populate after year-end month close — see `accounts-receivable`). _[implemented 2026-04-19 — see [plan](../superpowers/plans/2026-04-19-otb-plan-entry.md); Phase 1, CHANGE_OVER_LAST_YEAR path. Last-year actuals are operator-entered until accounts-receivable Close Month event exists.]_
- ✅ **p. 158, [Copy] (category)** — copy the current category's plan record to the next category entered when that category has no saved row. Bulk-seed across the catalog without re-keying constants. _[implemented 2026-04-19]_
- ⏳ **p. 158, [Copy Sales]** — duplicate this year's planned sales from previous-year actuals, **or** push this year's sales forward as next year's plan. Two modes selectable in a popup. _[UI button disabled with tooltip; deferred — needs sales-reporting contract for LY actuals.]_
- ✅ **p. 159, [ReCalculate]** — fills monthly amounts from the % change inputs and recomputes the totals. Negative % means a planned decrease. _[implemented 2026-04-19]_
- ⏳ **p. 159, [Store Totals]** — for the fixed-percentage method only: enter `This year's projected sales` and `Next year's projected sales` per store (retail dollars, less expected markdowns), `% of Sales for each month` (must sum to 100), and `% of Markdowns for each month`. The category sheet then derives each month's planned sales from these store-level percentages. _[UI button disabled; deferred to fixed-mix-method slice.]_
- ⏳ **p. 160, [Apply]** — when on the Store Totals screen, recalculates all categories' planned sales from the store-level monthly mix. If category percentages don't sum to 100 the system warns and points the user at *Print Open-To-Buy File* to find the imbalance. _[deferred to fixed-mix-method slice.]_
- ⏳ **p. 160, [Category Totals]** — navigate from Store Totals back to the per-category screen. _[deferred to fixed-mix-method slice.]_
- ⏳ **p. 170, Print – Open-To-Buy Plan File** — flat report dump of the plan, scoped by store range, with operator comments. Used to spot-check totals (especially the 100% category-mix constraint). _[deferred to a reports slice; API surface exists.]_

**OTB calculation methods** (Ch. 17)
- **p. 214, Company Setup → Open-To-Buy entry Method** — single-choice toggle stored at the company level:
  - ⏳ **Use % of total store sales and fixed monthly percentages** — for new stores with no history. Buyer sets store-level annual sales, monthly sales mix, monthly markdown mix, and category contribution percentages. System derives each (store, category, month) cell. _[API accepts the setting; UI for the fixed-mix entry screen is deferred.]_
  - ✅ **Use % change over last years sales for each category** — described as "the most commonly used". For each (store, category) the buyer enters a % change vs. last-year actuals; planned monthly sales are derived from last-year monthlies × (1 + %). Last-year actuals become available once the year-end month close has run (`accounts-receivable` close). _[implemented 2026-04-19 end-to-end via /api/v1/otb/plan-rows and the /otb/plan UI; toggle persisted via /api/v1/company-settings/otb-entry-method.]_

**OTB reports** (Ch. 6)
- **p. 100, Open-To-Buy Report** — 12-month projection driven by planned sales, planned turnover, and planned GP%. Columns include last year's sales, planned sales, **required beginning-of-month inventory**, on-order, and **open-to-buy at retail / cost / quantity**. Selectable by Store and Category. Optional **Combine Stores** rollup. Optional **Include Category Totals** — when off, only department + store subtotals print.
- **p. 100, Open-To-Buy vs. Sales Report** — running comparison of *actual* sales (this month and YTD) vs. *planned* sales. Used by the buyer to retune the plan before running OTB Report. Selectable by Store and Category, same Include-Category-Totals toggle.

**Adjacent dependencies referenced from the manual**
- **p. 218, Season Setup (Ch. 17)** — defines which months end which seasons; OTB needs this to render the "1st 6 months / 2nd 6 months" turnover split correctly when a customer's fiscal year does not align with January.
- **p. 113, Close Month / Season / Year (Ch. 8)** — the close routine is what populates "last year's sales" in the OTB plan rows (p. 158: *"The 'Last year sales' column does not show figures until you close your month at year-end"*).

## Modernization decisions

- **Plan key is (Store × Category × Period), where Period is a fiscal-month aligned with `accounts-receivable`'s Season Setup — not a raw calendar month.** RICS stores planned sales by `month` 1–12 implicitly anchored to Company Setup's year-ending month (p. 214). Zack's Retail makes the period explicit: a `Period { storeId, fiscalYear, fiscalMonth, startsOn, endsOn, seasonCode }` record owned by `accounts-receivable`. Every OTB row keys off `periodId`, not `(year, month)`. This keeps OTB aligned with the close cycle that populates last-year actuals and avoids off-by-one errors when a store's fiscal year shifts.
- **Both calculation methods become explicit Strategy objects, not a single "OTB entry Method" enum applied implicitly.** RICS hides the active strategy in Company Setup (p. 214) and quietly reshapes the plan-entry screen (p. 158 vs. p. 159). Zack's Retail models them as `OtbPlanStrategy = ChangeOverLastYearStrategy | FixedMonthlyMixStrategy`, each with a typed payload, a `recalculate(input)` method, and a `validate()` method (e.g., the 100%-category-mix invariant from p. 160). The active strategy is set per `OtbPlan` (the seasonal artifact), not per company — so a planner can pivot a single store/season to the other method without touching company-wide configuration. The legacy company-wide toggle survives only as the *default* for new plans.
- **Three-tier data model: `OtbPlan` (the merchandising artifact, e.g. "FW2026 Plan – Store 1") → `OtbBudget` (one row per store × category × period) → `OtbMonthlyPlan` (optional sub-line per SKU or SKU-size for category-level planners who go deeper).** RICS conflates these on a single screen. The current scaffolding hints at this split: `otb_budgets` (row #1), `otb_monthly_department_sku_plan` (row #2's deeper drill), `otb_sku_plan_lines` (row #2 unit-level). The spec formalises the hierarchy and adds the missing parent (`OtbPlan`) so we can version, snapshot, and reopen seasonal plans.
- **Committed-dollars is a live projection from `purchasing`, not a stored counter.** The current `OtbBudget.committedAmount` field on the SQLite scaffolding (`apps/api/src/services/otbBudgetService.ts`) is a reporting derivative, not a row-level cache: it's recomputed on each `getOtbSummary()` call by querying `getCommittedByDepartmentPeriod()` on the `PurchasingContractAdapter`. RICS, by contrast, stores planned-vs-actual deltas implicitly in its file format. Modernization: keep the projection live; never persist `committedAmount` as state in `OtbBudget`. The `committedAmount` column on `otb_monthly_department_sku_plan` is a manual planner override (the planner saying "treat this much as already-committed even though no PO exists yet"), not a system-maintained mirror.
- **Cross-module reads go through the `PurchasingContractAdapter`, never through direct SQL joins.** The existing adapter at `apps/api/src/contracts/purchasingContract.ts` (ZAI-137 / ZAI-145) is the only path by which `otb-planning` learns about `purchase_orders`, `purchase_order_lines`, or `skus`. This module's services must continue to import from `../contracts/purchasingContract`, never `../models/purchaseOrder`. Same pattern will apply for the inbound `sales-reporting` and `accounts-receivable` reads (new contracts to be defined — see *Contracts* section).
- **OTB validation runs on PO submit, not PO save, and returns a structured contract result.** `purchasing` calls `otb-planning.validatePoSubmit(poId, { force?, ceoExceptionApprovalId? })` on `DRAFT → SUBMITTED`. The response is `{ status: 'OK' | 'WARN' | 'BLOCK' | 'EXCEPTION', perDepartment: BudgetCheckResult[], policyAuditEventIds: string[] }`. Behaviour is governed by three thresholds (defaults from `apps/api/src/services/otbPolicyAuditService.ts`):
  - `< warningThresholdPct` (default 95%) → `OK`
  - `≥ warningThresholdPct` and `< hardStopThresholdPct` (default 100%) → `WARN` (PO submit allowed, banner shown)
  - `≥ hardStopThresholdPct` and `≤ ceoExceptionThresholdPct` (default 105%) → `BLOCK` unless `force=true` *with* an `ceoExceptionApprovalId` from the CEO-exception flow → then `OVERRIDE`
  - `> ceoExceptionThresholdPct` → `EXCEPTION` (always blocked, requires a manual override workflow + audit memo before resubmit)
  Every classification produces one row per affected department in `otb_policy_audit_log` with a 400-day retention. This is the same shape `otbPolicyAuditService.classifyOtbPolicyDecision()` already implements.
- **CEO exception is a first-class approval workflow with its own resource.** RICS has no exception flow. We model it as `CeoException { id, requestedByUserId, poId, departmentId, periodId, requestedOverageAmount, justificationMemo, status: PENDING|APPROVED|REJECTED|EXPIRED, approvedByUserId?, approvedAt?, expiresAt }`. Once approved, the approval ID is presented at PO resubmit; one approval is consumed per submit attempt and cannot be reused. Approvals expire after a configurable window (default 7 days) so a stale approval doesn't quietly authorise a different PO later.
- **OTB plan edits are audited via `otbPolicyAuditService` and `otb_budget_audit`.** `OtbBudget` already has a working audit trail (`apps/api/src/services/otbBudgetService.ts` `updateOtbBudget()` writes per-field changes to `otb_budget_audit`). Extend the same pattern to `OtbPlan` (strategy changes, status transitions: DRAFT → APPROVED → CLOSED) and `OtbMonthlyPlan` (line-level edits). The `otbPolicyAuditService` covers PO-submit decisions; `otb_budget_audit` covers planner edits. Both live within this module.
- **"Last year sales" is pulled from `sales-reporting` on read, not denormalized into the plan row.** RICS persists last-year sales in the OTB plan record after year-end close (p. 158). Zack's Retail keeps the plan row clean — last-year-sales is a `salesReporting.getActualsByPeriod(storeId, categoryId, period)` call rendered at view time. The plan never goes stale when sales are restated (which would happen with reprint-posted-sales corrections in `sales-pos`).
- **`[Copy]` and `[Copy Sales]` from p. 158 become an explicit `seedFrom(...)` action with a preview.** Buyer chooses source = "previous fiscal year actuals" | "previous fiscal year plan" | "this year's plan rolled forward" | "another store's plan", optional `% adjustment`, scope filter (categories, ship-to stores). Server returns a preview diff; commit writes new `OtbBudget` rows in a single transaction. RICS's modal-popup UX is replaced with a dedicated wizard.
- **"Combine Stores" on the OTB Report (p. 100) becomes a runtime grouping option, not a separate report variant.** Same engine, single grouping flag.
- **CSV / Excel export, not "Comma-Delimited file with .TXT or .CSV extension".** All three reports (OTB Report, OTB vs. Sales, Print OTB Plan) download as CSV from the browser; the file-extension picker (p. 100 GL Summary boilerplate, repeated through Ch. 6) does not ship.
- **Plan file is no longer optional in practice but stays nullable per (store, category) in the schema.** RICS marks the plan file optional (p. 158); the report just refuses to print without it. Zack's Retail makes the OTB Report degrade gracefully (renders only categories that have a plan, with an inline banner listing the missing ones) rather than refusing to run, while keeping the underlying tables nullable.
- **Storefront and admin sales actuals flow back from `sales-reporting` and `accounts-receivable` for the Open-To-Buy vs. Sales report.** Sales actuals = `sales-reporting.getCategorySalesByPeriod()`; receipts-against-plan use `purchasingContract.getReceivedByDepartmentPeriod()`; A/R-affecting transactions (house charges, layaway pickups) come from `accounts-receivable.getCategoryNetSalesByPeriod()` so the actuals match the close-of-month numbers, not the raw register tape. This is a behavioural change from RICS, where actuals are read directly from the same DB the OTB Plan is in — modernization is necessary because each of those modules now has its own boundary.
- **The current `Department` enum (`FORMAL | CASUAL | FIESTA | SANDALIAS | BOOTS | COMFORT`) and the `RICS 556-599` category guardrail are migration-bridge artifacts.** They reflect the live RICS DB at this customer (see `docs/modules/products.md` data findings). The spec keeps them for v1 compatibility but flags them as **interim**: the long-term key is `categoryId` from `products`, with `departmentId` derived. The constants belong in `store-ops`'s taxonomy, not hardcoded here.

## Contracts with other modules

**Inbound (this module consumes)**
- From **`products`** —
  - `getCategory(categoryId)` → `{ id, code, departmentId, name }` for plan rendering and validation
  - `getDepartment(departmentId)` → `{ id, code, name }`
  - `listCategoriesByDepartment(departmentId)` for the Store-Totals screen's category contribution editor
- From **`inventory`** —
  - `getOnHandValueByCategory(storeId, categoryId, asOf: Date)` → `{ atRetail, atCost }` — feeds the OTB Report's "required beginning-of-month inventory" calculation
- From **`sales-reporting`** —
  - `getCategorySalesByPeriod(storeId, categoryId, periodId)` → `{ unitsSold, salesAtRetail, salesAtCost, returns, netSales }` — feeds OTB vs. Sales and the "last year sales" column
  - `getCategoryRollingActuals(storeId, categoryId, fromPeriodId, toPeriodId)` — for the 12-month projection footer
- From **`accounts-receivable`** —
  - `getCategoryNetSalesByPeriod(storeId, categoryId, periodId)` → close-of-month net sales (the authoritative number after layaway pickups, house-charge sales, refunds against prior periods)
  - `getActivePeriod(storeId)` → current `{ periodId, fiscalYear, fiscalMonth, seasonCode }`
  - `listPeriods(storeId, fiscalYear)` for plan setup
  - **Event** `MonthClosedEvent { storeId, periodId }` — triggers re-snapshot of last-year actuals into report caches
- From **`store-ops`** —
  - `listStores()` and `getStore(storeId)` for the bill-to / ship-to selectors and per-store plan scoping
  - `getCompanySetting('otbDefaultStrategy')` returning `'CHANGE_OVER_LAST_YEAR' | 'FIXED_MONTHLY_MIX'` — replaces RICS Company Setup p. 214 toggle as the *default* for new plans
  - `getCompanySetting('otbWarningThresholdPct')`, `'otbHardStopThresholdPct'`, `'otbCeoExceptionThresholdPct'` — overrides the policy defaults in `otbPolicyAuditService`
- From **`employees`** — `hasPermission(userId, 'otb.override' | 'otb.ceoExceptionApprove' | 'otb.planEdit')`
- From **`purchasing`** — through the existing `PurchasingContractAdapter`:
  - `getCommittedByDepartmentPeriod(year, month?, department?)` → committed PO totals (status in SUBMITTED, CONFIRMED, PARTIALLY_RECEIVED)
  - `getReceivedByDepartmentPeriod(year, month?, department?)` → received PO totals
  - `getPoMeta(poId)` → existence + creation timestamp + status
  - `getPoLineTotalsByDepartment(poId)` → per-department line totals for a single PO
  - `getCommittedExcludingPo(department, year, month, excludePoId)` → for the "what would committed be without this PO" delta on validation
  - **TODO**: extend the contract to include `getProjectedReceiptsByMonth(filters)` (for the "on-order" column on the OTB Report) and `getReceivedAtCostExcludingPo()` (for received-vs-plan reporting).

**Outbound (this module exposes)**
- To **`purchasing`** —
  - `validatePoSubmit(poId, { force?, ceoExceptionApprovalId?, actorUserId, traceId? })` → `OtbValidationResult { status: 'OK'|'WARN'|'BLOCK'|'OVERRIDE'|'EXCEPTION', perDepartment: BudgetCheckResult[], policyAuditEventIds: string[] }`. Replaces today's loose `checkBudgetImpact(poId)` call by adding the policy classification and the audit-event side-effect.
  - `previewPoImpact(poId)` → same shape minus the audit write — for the PO Entry screen's live validation banner
  - `reserveCommitment(poId)` (no-op in the live-projection model, kept as a hook for a future cached-counter optimisation)
  - `releaseCommitment(poId)` (called from `purchasing` on cancel/delete — likewise a hook today)
- To **`sales-reporting`** —
  - `getOtbReport(filters)` → 12-month grid (the OTB Report, p. 100)
  - `getOtbVsSalesReport(filters)` → comparative actual vs. plan grid (p. 100)
  - `getOpenToBuyByCategory(periodId, storeId)` → atomic "remaining OTB" lookup for dashboard widgets
- To **`platform`** —
  - **Event** `OtbPlanApprovedEvent { planId, periodIds[], approvedBy, approvedAt }` — `platform` cache invalidation, notification to buyers
  - **Event** `OtbPolicyDecisionRecordedEvent { policyAuditEventId, decision, poId }` — admin telemetry
  - **Event** `CeoExceptionRequestedEvent { exceptionId, poId, requestedByUserId, requestedOverageAmount }` — `platform` notification routes to CEO
  - **Event** `CeoExceptionDecidedEvent { exceptionId, decision, decidedByUserId }`

## Data model sketch

Domain-level — the SQLite scaffolding will likely move to Postgres alongside the rest of the admin backend.

- **OtbPlan** — the merchandising artifact a buyer creates and saves. Fields: `id`, `name` ("FW2026 — Store 1"), `storeId`, `seasonCode`, `fiscalYearStart`, `fiscalYearEnd`, `strategy: OtbPlanStrategy`, `status: DRAFT | APPROVED | CLOSED`, `approvedByUserId?`, `approvedAt?`, `closedAt?`, `version`, audit timestamps. Holds the plan-level metadata; the per-row numbers live below.
- **OtbPlanStrategy** — discriminated union persisted as JSON.
  - `ChangeOverLastYearStrategy { kind: 'CHANGE_OVER_LAST_YEAR', defaultPctChangeLyToCy?, defaultPctChangeCyToNy? }`
  - `FixedMonthlyMixStrategy { kind: 'FIXED_MONTHLY_MIX', annualSalesPlan: { storeId, thisYear, nextYear }, monthlySalesMixPct: number[12] /* sums to 100 */, monthlyMarkdownMixPct: number[12], categoryContributionPct: { categoryId → percent } /* sums to 100 */ }`
- **OtbBudget** — the per (store × category × period) plan row. Fields: `id`, `planId`, `storeId`, `categoryId`, `departmentId` (denormalized from category), `periodId` (FK to `accounts-receivable.Period`, replacing the current `(year, month)` pair as the primary period key), `plannedSalesAtRetail`, `plannedSalesAtCost`, `plannedTurnover1H`, `plannedTurnover2H`, `plannedGpPct`, `pctChangeLyToCy?`, `pctChangeCyToNy?`, `notes`, `createdBy`, audit timestamps. `(planId, storeId, categoryId, periodId)` is unique.
- **OtbMonthlyPlan** — optional sub-row when a planner drills below category. Today this is `otb_monthly_department_sku_plan` and links to a SKU + size; the spec keeps the table but reframes the columns as **planner intent**, not system mirrors: `budgetAmount` = planner's allocated portion of the parent OtbBudget, `committedAmount` and `receivedAmount` = the planner's manual snapshot (the live values come from `purchasing`). Add `lastSyncedFromPurchasingAt` so the UI can show "last live-checked X minutes ago" alongside the planner snapshot.
- **OtbBudgetAudit** / **OtbPlanAudit** / **OtbMonthlyPlanAudit** — append-only `{ id, parentId, fieldChanged, oldValue, newValue, changedByUserId, changedAt }`. Reuses the pattern in `otb_budget_audit`.
- **OtbPolicyAuditEvent** — the per-PO-submit decision record. Already implemented at `otb_policy_audit_log` with: `id`, `eventId` (groups all per-department rows of a single decision), `eventTimestamp`, `department`, `periodYear`, `periodMonth`, `poId`, `policySource: 'default' | 'configured'`, `warningThresholdPct`, `hardStopThresholdPct`, `projectedUtilizationPct`, `decision: allow | warn | hard_stop | override | exception`, `overrideReasonCode?`, `approverIds?` (JSON), `ceoExceptionApprovalId?`, `actorUserId`, `traceId`, `retentionExpiresAt`. **Spec change vs. code**: drop `periodYear` + `periodMonth` in favour of `periodId` once the `accounts-receivable` Period entity exists; keep both during the migration.
- **CeoException** — `{ id, poId, requestedByUserId, departmentId, periodId, requestedOverageAmount, justificationMemo, status: PENDING|APPROVED|REJECTED|EXPIRED, approvedByUserId?, approvedAt?, expiresAt, consumedByPoSubmitTraceId? }`. `consumedByPoSubmitTraceId` is non-null once the approval has been spent on a submit; prevents replay.
- **OtbReportSnapshot** — optional, write-once cache row for a printed/exported OTB Report so the planner can reopen "the report I sent to the CEO last Tuesday". Fields: `id`, `reportType: OTB | OTB_VS_SALES`, `filtersJson`, `generatedAt`, `generatedByUserId`, `payloadJson`, `csvUrl`. Aligns with the storefront pattern of immutable export artifacts.

**Period primitive — why it lives in `accounts-receivable`.** The fiscal-month boundary is set by Company Setup's year-ending month (RICS p. 214) and Season Setup (RICS p. 218 — selectable months that end a season). Both of those screens, plus Close Month/Season/Year (Ch. 8), are owned by `accounts-receivable` per the registry. OTB needs to bucket sales and commitments into the same buckets that A/R uses for its statement cycles and that the close routine uses to populate "last year sales" (p. 158). Keeping the period entity in one place — and keying every OTB row off `periodId` — guarantees they stay aligned. Stores with a non-January fiscal year, mid-season fiscal adjustments, or a 53-week retail calendar all "just work" because they're modelled once.

## Reports

### Open-To-Buy Report (RICS p. 100)

12-month forward projection. Two layout modes: **per category** (default) and **per department** (when *Include Category Totals* is off).

**Filters**
- `storeIds[]` (required, multi-select; supports "All Stores")
- `categoryIds[]` (optional — defaults to all)
- `seasonCode?` — pre-filters to categories planned in that season
- `startPeriodId` (defaults to current period)
- `combineStores: bool` (default false) — RICS *Combine Stores* (p. 100)
- `includeCategoryTotals: bool` (default true)
- `includeRollingFooter: bool` (default true) — adds a 12-month rolling-totals row
- `format: 'screen' | 'csv' | 'pdf'`

**Column structure (per period × per (store?, category) row)**
| Group | Columns |
|---|---|
| Period header | `Period` (`Sep 2026`, etc.), `Days in Period` |
| Last year | `LY Sales $`, `LY Sales Units` |
| Plan | `Planned Sales $`, `Planned Turnover`, `Planned GP %` |
| Required inventory | `Required BOM Inventory $ at Retail`, `at Cost` (derived from planned sales / planned turnover) |
| On-order | `On-Order $ at Retail`, `at Cost`, `On-Order Units` (from `purchasing` projection) |
| OTB | `Open-To-Buy $ at Retail`, `at Cost`, `OTB Units` |

**Groupings & subtotals**
- Row order: `Store` → `Department` → `Category` → period grid
- Subtotals at every level
- Footer: 12-month total row per group + grand total
- "Print only POs without a plan" inline banner if a category has activity but no `OtbBudget` row

**CSV format**: one row per (storeId, departmentId, categoryId, periodId) tuple — long format, not the wide grid. PDF/screen renders the wide grid from the long data.

### Open-To-Buy vs. Sales Report (RICS p. 100)

Comparison of actual vs. planned for closed periods + month-to-date for the current period. Used by the planner to recalibrate before running the OTB Report.

**Filters**
- `storeIds[]` (required)
- `categoryIds[]` (optional)
- `fromPeriodId` and `toPeriodId` (defaults: trailing 12 closed periods + MTD current)
- `includeCategoryTotals: bool`
- `combineStores: bool`
- `format: 'screen' | 'csv' | 'pdf'`

**Column structure (per (store?, category) row × period)**
| Group | Columns |
|---|---|
| Period | `Period`, `Status` (CLOSED / MTD) |
| Plan | `Planned Sales $` |
| Actual | `Actual Sales $`, `Actual GP $`, `Actual GP %` |
| Variance | `$ Variance`, `% Variance`, `Plan Hit % YTD` |

**Subtotals**
- YTD subtotals per category
- YTD subtotals per department (when *Include Category Totals* off)
- Store totals
- Grand total when *Combine Stores* on

### Print Open-To-Buy Plan File (RICS p. 170)

Diagnostic dump of the plan, scoped to a store range. Used to validate the 100% category-mix invariant from p. 160. Single mode: per (store, category, period) row with the editable inputs. CSV + PDF.

## Out of scope for v1

- **Modem / dial-up sync of OTB plan files between Main and POS computers (Ch. 13 referenced from p. 161 Communications)** — obsolete; single Postgres source of truth (already in the registry's "not porting" list).
- **Diskette-based plan file transfer (Ch. 13)** — obsolete; same reason.
- **Screen Spool File output for the OTB report (Ch. 14, p. 186)** — replaced by browser PDF/CSV download.
- **`RICS.CFG` editor for any OTB-related toggle** — settings move to `store-ops` Company Setup, surfaced through the admin UI, no config-file editor.
- **Macros / saved keystroke shortcuts on the OTB plan-entry screen (Ch. 15, p. 205)** — out of scope; a generic shortcut layer in `platform` covers the common cases.
- **NPD Export of OTB plan numbers** — RICS bundles NPD export with the Sales Reports chapter (p. 101) but the export does not include OTB plan rows. Not porting NPD-from-OTB; if NPD ever needs plan data we extend `sales-reporting`'s NPD job.
- **Per-SKU OTB at the parent OTB Plan level.** RICS keeps OTB at category granularity (p. 158); we keep the same default. The deeper `OtbMonthlyPlan` (per SKU / per SKU-size) is an *opt-in* drill, not a required shape.
- **Multi-currency planning.** RICS is single-currency. Defer until a customer needs it.
- **"Apply" + "Recalculate" run synchronously in the browser.** v1 ships a 5-second timeout; if a plan has > 500 categories × 12 periods we queue the recalc as a `platform` job. No "spinner forever" UX.
- **Auto-port of the legacy 6-value `Department` enum and the 556–599 category range as permanent constants.** They survive in v1 for migration parity; deprecation path is tracked in *Open questions*.
- **Plan-versioning UI beyond a simple `version` integer.** No diff view, no plan-A/plan-B comparison report — defer to v2.

## Open questions

1. **Period entity ownership.** The spec puts `Period` in `accounts-receivable`. Confirm this with the A/R module owner before either side ships — alternatives are (a) put it in `store-ops` (since fiscal-month config lives in Company Setup), or (b) introduce a thin shared kernel module just for time primitives. Whichever wins, OTB keys off `periodId`, not `(year, month)`.
2. **CEO exception routing.** Who actually approves? Always the CEO, or a configurable role (e.g., "any user with `otb.ceoExceptionApprove` permission")? Does an approval require a single approver or N-of-M? Default proposal: any user with the permission, single approver, configurable later.
3. **What counts as "committed"?** Today's `PurchasingContractAdapter.getCommittedByDepartmentPeriod()` includes statuses `SUBMITTED | CONFIRMED | PARTIALLY_RECEIVED`. Should `DRAFT` POs hit the OTB plan as a *soft* commitment (so a buyer can't quietly stage a $1M draft and then submit it past the budget), or stay invisible until submit? RICS is silent. Recommendation: drafts visible in a planner-only "soft commitments" column on the OTB report; not counted in the validation gate.
4. **Plan strategy at what grain?** The spec proposes per-OtbPlan. Could conceivably be per (store) within a plan, or per (store, season). The narrower the grain, the more flexible — but every grain-narrower step doubles UI complexity. Confirm before building the plan-entry screen.
5. **Department enum vs. categoryId-derived department.** When does the legacy 6-value enum (`FORMAL | CASUAL | FIESTA | SANDALIAS | BOOTS | COMFORT`) get replaced by the dynamic `departmentId` from `products`? Need a deprecation date and a dual-write window so existing audit rows don't go orphaned.
6. **Last-year sales for a *new* store with no LY data.** RICS implicitly defaults to 0 (the column is just blank — p. 158). Better v1 behaviour: prompt the planner to seed from a sibling store's actuals × an adjustment factor, or to pin to the fixed-monthly-mix strategy. Decide before the plan-entry wizard ships.
