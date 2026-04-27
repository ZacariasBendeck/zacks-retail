# Sell-Through Analysis report — SQLite → Postgres cutover

**Date:** 2026-04-26
**Source:** `/index-knowledge` pass — Sell-Through Report rewired to read from `app.*` real data; frontend domain-filter validator extended with a per-call-site lenient-mode option.
**Type:** Design decision

## Context

The Sell-Through Analysis page ([`apps/web/src/pages/inventory/SellThroughReportPage.tsx`](../../../apps/web/src/pages/inventory/SellThroughReportPage.tsx)) was wired through the Express route `GET /api/v1/reports/sell-through` to three SQLite-backed service functions on `getDb()`. Those functions queried SQLite tables `skus`, `sales_transactions`, `purchase_order_lines`, `purchase_orders`, `ref_brands`, `ref_colors` — placeholder/dev tables that are largely empty in the live system. The page rendered, but with no real numbers.

The mandate was to switch the data source to real Postgres without changing the page's visible UI (columns, summary cards, drill-down model, exports).

Two SQLite-era guards stood in the way:

1. **API zod schema** ([`apps/api/src/routes/reportRoutes.ts`](../../../apps/api/src/routes/reportRoutes.ts) `sellThroughQuerySchema`) restricted `department` to the 6-name enum `[FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT]` and `category` to the 556..599 RICS code window. The real Postgres taxonomy has ~75–87 departments with Spanish names (e.g. `ZAPATO MARCA HOMBRE`, `BLUSA CASUAL MUJER`) and category numbers anywhere from 1 to ~300+.
2. **Frontend `domainFilterContract`** ([`apps/web/src/services/domainFilterContract.ts`](../../../apps/web/src/services/domainFilterContract.ts)) duplicated the same enum + range as a client-side guard. `validateDomainFilterContract` returned errors for any other value, surfacing as the red "Invalid filter selection" alert; `appendDomainFilterContract` (called from `fetchSellThroughDrillDown`, `getSellThroughCsvUrl`, `getSellThroughXlsxUrl`) threw for them, blocking the request.

## Decision

### 1. Data sources for sell-through

| Quantity | Source | Notes |
|---|---|---|
| Sales (units sold) | `app.sales_history_ticket_line.quantity` summed where `app.sales_history_ticket.status = 'completed'` and `purchased_at` is in range | Quantity is signed (returns flow as negatives), so net-units interpretation is `SUM(quantity)`. |
| Receiving (units received) | `app.purchase_order_legacy_line.received_qtys` (an `INT[]` of 18 packed segments) summed via `unnest`; date-filtered by `app.purchase_order_legacy.last_received_at` | No active voided/cancelled flag — imported data assumed clean. |
| SKU master | `app.sku` joined to legacy PO lines via `s.code = pol.sku_code` (100% join coverage in current dataset). | `app.sku.style`, `brand_id`, `color_code` are sparsely populated; report rows display blank Brand/Style/Color for many SKUs. |
| Department label | `app.taxonomy_department.desc` joined via `BETWEEN beg_categ AND end_categ` against `app.sku.category_number`. | Same join shape used by `ricsSalesPivotAdapter`. |

The sell-through queries became Promise-returning (`async`); the route awaits them and bypasses the SQLite `ref_categories` `id ⇄ rics_code` translation entirely — `query.category` flows straight through to the SQL as the real `category_number`.

### 2. Lenient-domain validators (`allowAnyDepartment` opt-in)

Both gating layers were extended with an opt-in lenient mode rather than loosened globally; the other reports (`on-hand`, `sales-performance`, `inventory-turnover`) keep their strict guards.

- **API:** `sellThroughQuerySchema` now accepts `department: z.string().trim().min(1).max(120)` and `category: z.coerce.number().int().positive()`. The other report schemas keep `z.enum(ALLOWED_DEPARTMENTS)` and `z.coerce.number().int().min(556).max(599)`.
- **Frontend:** [`DomainFilterContractOptions`](../../../apps/web/src/services/domainFilterContract.ts) gained `allowAnyDepartment?: boolean`. When true, any non-empty trimmed string is a valid department and any positive integer is a valid category. Threaded through the four sell-through call sites — page validator + `fetchSellThroughDrillDown` + `getSellThroughCsvUrl` + `getSellThroughXlsxUrl`.

This per-call-site option is the same migration pattern that inventory-aging used earlier (the existing comment in `tests/reportCategoryFilter.test.ts` already exempted aging from the 556..599 cohort). Future reports that move off SQLite-backed dev data into real `app.*` Postgres data should follow the same pattern: opt the call sites into the lenient validator instead of weakening the strict default.

### 3. "totalStyles" semantic shift

The SQLite query computed `COUNT(DISTINCT s.style)`. `app.sku.style` is mostly null in the real catalog, so the Postgres rewrite uses `COUNT(DISTINCT s.id)` (one per SKU). The API contract field name `totalStyles` is preserved for the frontend; the value now means distinct-SKUs-with-movement.

## Consequences

- The Sell-Through page renders real numbers — 87 departments unfiltered, 77 for a single year. Drill-down to a real department like `ZAPATO MARCA HOMBRE` returns 10 categories and 471 paginated detail items.
- The `DEPARTMENT_COLORS` map in `SellThroughReportPage.tsx` was not changed; unmapped department names render with the default Antd Tag color rather than a department-specific tint. Acceptable visual degradation for keeping the frontend untouched.
- An unfiltered XLSX export scans 3.2M+ sales lines and 18M+ received-quantity entries; it takes ~18 s end-to-end (test timeout bumped to 60 s). Filtered exports — the realistic operator path — return in ~1.2 s.
- The "infinite sell-through" edge case is preserved from the SQLite version: when `units_received = 0` and `units_sold > 0` (i.e. receipts in the date window are empty but sales aren't), the formula returns 0%, which sorts those SKUs to the top of the underperformer list. A future spec should distinguish "no receipts in period" from "actual underperformer".
- Two pre-existing failures in `tests/reportXlsxExport.test.ts` (`inventory-aging`, `sales-by-day`) are not from this change.

## Alternatives considered

- **Map Postgres departments into the 6-name SQLite enum heuristically** — rejected. The taxonomy has no clean 6-bucket grouping (departments split by men/women/brand/general, not by formal/casual/fiesta/etc.); any mapping would be invented, not native.
- **Group sell-through by `app.taxonomy_sector` instead of `taxonomy_department`** — deferred. Would yield fewer, broader buckets (closer to the original 6-bucket UX) but conflicts with the established convention in `ricsSalesPivotAdapter` and would change the semantic the page advertises.
- **Loosen `domainFilterContract` globally** — rejected. The other report pages still depend on the strict 6-name enum to keep cell rendering and drill-down click handlers honest; a global loosening would silently weaken their guards.
- **Inline URL construction for sell-through (skip the validator)** — rejected. Keeps the call-site pattern uniform across reports and lets the lenient mode be reused by the next report to migrate.

## Related

- Companion cross-cutting decision: [`2026-04-26-app-native-report-validator-pattern.md`](2026-04-26-app-native-report-validator-pattern.md) — formalizes the `allowAnyDepartment` toggle pattern that this report introduced and Inventory Aging adopted next.
- Service: [`apps/api/src/services/reportService.ts`](../../../apps/api/src/services/reportService.ts) `getSellThroughByDepartment`, `getSellThroughByCategory`, `getSellThroughDetails`.
- Route: [`apps/api/src/routes/reportRoutes.ts`](../../../apps/api/src/routes/reportRoutes.ts) `GET /api/v1/reports/sell-through` + `sellThroughQuerySchema`.
- Frontend: [`apps/web/src/services/domainFilterContract.ts`](../../../apps/web/src/services/domainFilterContract.ts), [`apps/web/src/services/reportApi.ts`](../../../apps/web/src/services/reportApi.ts) `fetchSellThroughDrillDown` + URL builders, [`apps/web/src/pages/inventory/SellThroughReportPage.tsx`](../../../apps/web/src/pages/inventory/SellThroughReportPage.tsx).
- Tests: [`apps/api/tests/reportCategoryFilter.test.ts`](../../../apps/api/tests/reportCategoryFilter.test.ts) (sell-through moved into the "accepts full RICS range" cohort alongside inventory-aging), [`apps/api/tests/reportXlsxExport.test.ts`](../../../apps/api/tests/reportXlsxExport.test.ts) (sell-through XLSX timeout bumped to 60 s).
