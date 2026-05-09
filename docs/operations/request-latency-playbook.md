# Request Latency Playbook

Status: active

This note captures the product inquiry performance fix from May 2026 and the pattern to reuse when other features feel slow. The first follow-up candidate is the reorder planner.

## Product inquiry fix

Symptom: opening `/products/inquiry/25605-BEPT` was slow because `GET /api/v1/inventory/inquiry/25605-BEPT` took about 21-23 seconds in production. The React route was not the slow part.

How we isolated it:

- Used direct API timing to separate page load time from backend request time.
- Ran local service probes for `getInventoryInquiry("25605-BEPT")`.
- Ran `EXPLAIN (ANALYZE, BUFFERS)` against the suspected inventory history SQL.
- Added slow timing logs around the backend inquiry stages so future production logs can show the slow segment.

Root cause: history queries were filtering large inventory history tables by normalized text SKU values, such as `UPPER(BTRIM(s.sku_code))`. The SKU had already been resolved through `app.sku`, so the hot path had a stable canonical key available: `app.sku.id`.

Change made in commit `9a50091`:

- Kept the route and public API response shape unchanged.
- Changed inquiry history loaders in `apps/api/src/services/ricsInventoryAdapter.ts` to query by `sku_id` instead of normalized `sku_code`.
- Loaded snapshot rows through `inventory_history_snapshot.sku_id`.
- Loaded monthly sales by joining `inventory_history_month` through snapshots filtered by `s.sku_id = $1::uuid`.
- Loaded trend weeks through `snapshot: { skuId }`.
- Removed `UPPER(BTRIM(...))` from the hot queries after SKU resolution.
- Added fallback index `inventory_history_snapshot_sku_code_idx` for remaining report/fallback paths.
- Added `INQUIRY_SLOW_MS` timing logs for total inquiry time plus major backend segments.
- Added tests to prevent the monthly sales SQL from regressing back to normalized text filters.

Result observed after the change:

- Local full adapter call for `25605-BEPT`: about 78 ms.
- Live API probes after deployment: roughly 0.13-0.27 seconds after one initial slower request.

## Reusable pattern

Use this process for any feature that appears slow:

1. Measure whether the browser route, API request, or database work is slow.
2. Identify the exact API endpoint and service function on the hot path.
3. Add lightweight stage timing around the service work before changing behavior.
4. Run `EXPLAIN (ANALYZE, BUFFERS)` on the suspected SQL with realistic data.
5. Prefer canonical IDs and foreign keys over normalized text filters in hot paths.
6. Add or adjust indexes for the actual query shape, not for guessed access patterns.
7. Keep API contracts unchanged unless the feature explicitly requires a contract change.
8. Add focused tests for raw SQL shape, parameter order, and important scoped filters.
9. Verify with focused tests, TypeScript checks, local probes, `EXPLAIN`, and live timing after deploy.

## Reorder planner next pass

`apps/api/src/services/reorderPlannerService.ts` calls `getInventoryInquiry`, so it already benefits from the product inquiry fix. If the reorder planner is still slow, the next pass should measure its own stages instead of assuming the inquiry call is still the only problem.

May 2026 result:

- Baseline local backend call for `getReorderPlan("25605-BEPT")`: about 5.1 seconds.
- The inventory inquiry sub-call was already fast, about 35-50 ms.
- The slowest cold segment was department seasonality, about 1.1-2.3 seconds depending on cache state.
- Repeated per-chain SKU monthly sales queries added roughly 250 ms per chain before optimization.
- The planner now preloads SKU monthly sales once by `sales_history_ticket_line.sku_id`, aggregates it in memory per chain, and avoids the previous `OR UPPER(sku_code)` hot-path filter.
- Department seasonality now uses a direct `sku_id`-linked query for planner use and caches the department/history-window result.
- Local result for `25605-BEPT`: about 1.3-1.7 seconds cold, then about 140-170 ms with warm seasonality cache.
- Browser check from `/products/inquiry/25605-BEPT` confirmed the Reorder modal opens and populates from the inquiry page.

Start by timing these likely segments:

- SKU and product lookup.
- `getInventoryInquiry`.
- Planning chain and store grouping work.
- Sales and seasonality history loads.
- Open purchase order and inbound quantity lookups.
- Draft PO, case pack, and ordering rule lookups.
- Final recommendation calculation.

Once the slowest segment is known, inspect its SQL with `EXPLAIN`. Apply the same rule as the inquiry fix: if a query scans large tables through normalized natural keys, resolve the entity once and use the canonical ID path plus the right supporting index.

## Hard rules

- Do not treat frontend loading indicators as the fix for backend slowness.
- Do not add broad caching before the SQL path is understood.
- Do not use `UPPER(BTRIM(...))` on large hot-path joins when a stable ID exists.
- Do not change public API response shapes while doing a performance-only fix.
- Do not add indexes without verifying the query plan they are meant to serve.
