# SKU Lookup Index Warmup

**Status:** required runtime process — do not remove or re-cap.

## What it is

On every start of the API server (`apps/api`), the `ricsProductAdapter` runs a dedicated startup step that reads the **entire imported SKU catalog from `app.sku`** into an in-memory index. `app.sku` is the app-owned Postgres promotion of the legacy `InventoryMaster` surface, so the request path no longer opens MDB files for SKU lookup. This index powers three related flows:

1. The **SKU Lookup modal** on the Inventory Inquiry screen (`/products/inquiry`) — input prompt, Sort-by radio buttons, full-catalog search.
2. The **Inquiry master lookup**. `loadMasterBySku()` on the inventory adapter resolves master rows from the index first, falling back to a slower DB path only if the SKU isn't there. This is what makes repeated SKU clicks feel instant.
3. **Prev / Next SKU navigation** on the Inquiry screen. `findNeighborSku(sku, direction, scope)` walks the index (sorted by SKU at load time), optionally filtered to the current SKU's vendor or category.

The row projection covers every master column these flows read — not a narrow "modal-only" subset. That keeps all three code paths off the PowerShell hot path.

Without this warmup, the lookup modal returns incomplete results, master lookups take ~1 second per click, and Prev/Next is disabled.

Canonical name for this process: **SKU Lookup index warmup**.

## Why it matters

RICS's original SKU Lookup screen expects instant, full-catalog search. Any operator — cashier, buyer, store manager — typing a SKU prefix expects to see every match across the whole InventoryMaster, not a curated subset. Matching that behavior in Zack's Retail requires the index to be fully loaded before the first user request.

Earlier, a smaller "POS snapshot" (capped at 50,000 rows and sorted by description) served as the search source. That cap silently excluded SKUs whose descriptions sorted past row 50,000 — most notably the `ZN02-*` series, which disappeared from every lookup result. The warmup was added to fix that for good.

## Where it lives in code

| File | What it does |
|---|---|
| `apps/api/src/services/ricsProductAdapter.ts` — `loadSkuLookupIndex()` | Reads `app.sku` (no row cap, excludes only discontinued SKUs, `ORDER BY code`) into a cached `{ rows, byCode }` pair — a sorted array plus a Map keyed by uppercase SKU for O(1) point lookups. |
| `apps/api/src/services/ricsProductAdapter.ts` — `findIndexedMaster(sku)` | O(1) master-row lookup used by the inventory adapter's `loadMasterBySku()`. |
| `apps/api/src/services/ricsProductAdapter.ts` — `findNeighborSku(sku, direction, scope)` | Prev/Next walk of the sorted index, optionally filtered by vendor or category. |
| `apps/api/src/services/ricsProductAdapter.ts` — `warmup()` | Invokes `loadSkuLookupIndex()` as part of its `Promise.all` so the index is loading while the server's other warmups run. |
| `apps/api/src/services/ricsProductAdapter.ts` — `searchSkusForLookup()` | Every request to `GET /api/v1/skus/search` filters this same in-memory index. |
| `apps/web/src/main.tsx` — `queryClient.prefetchQuery(...)` | Fires the default SKU Lookup request at app boot so the TanStack cache is also warm when the first React component subscribes. |

Together, backend warmup and frontend prefetch make the modal feel instant regardless of which page the user opens first.

## How to verify it ran

Tail the API log after a server restart. The canonical log line is:

```
[ricsProductAdapter] SKU lookup index loaded from app.sku: 203749 rows in 12374ms
```

- The row count should match the current promoted `app.sku` catalog size (≈200k on this customer's database as of 2026-04-25).
- The load time scales linearly with row count; typical values are a few seconds on Postgres. If it takes dramatically longer, investigate the DB connection or large-row projection changes.

If you don't see that line within ~30 seconds of server start, the warmup failed — check for preceding `SKU lookup index load from app.sku failed` error messages, then investigate the Postgres connection and the `app.sku` promotion state.

## Refresh cadence

The index has a 10-minute TTL (`SKU_LOOKUP_INDEX_TTL_MS = 10 * 60_000`). The first SKU Lookup request after that window triggers a background refresh while the stale array continues to serve the current request — no user-visible delay.

## Hard rules

- **Never remove `loadSkuLookupIndex()` from `warmup()`.** The modal depends on the index being pre-loaded.
- **Never re-introduce a row cap on `loadSkuLookupIndex()`.** Narrow projection (only the columns the modal renders) is fine; capping rows is not. A cap silently excludes SKUs — exactly the bug this warmup was introduced to fix.
- **Never shorten the TTL below a few minutes.** Refreshing more often offers no user-visible benefit and increases Postgres load.

## Future changes

If the warmup becomes a startup-time problem (e.g. catalog grows past 1M rows), acceptable remedies are:

1. Push the prefix filtering and pagination deeper into SQL instead of materializing the whole lookup index.
2. Split the load into pages and background-merge them.
3. Trim the projection to only the columns `loadMasterBySku()` and `searchSkusForLookup()` actually consume (less generous than today's "everything needed from `app.sku`").

**Not** acceptable:
- Re-introducing a row cap.
- Removing `findIndexedMaster()` and reverting `loadMasterBySku()` to a per-click MDB or other slow request-time query.
- Splitting the index into two (modal vs. master) — one projection that serves both is cheaper than two passes over the catalog.
