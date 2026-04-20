# SKU Lookup Index Warmup

**Status:** required runtime process — do not remove or re-cap.

## What it is

On every start of the API server (`apps/api`), the `ricsProductAdapter` runs a dedicated startup step that reads the **entire `InventoryMaster` table** from the legacy RICS MDB into a narrow-column, in-memory index. This index powers the **SKU Lookup modal** on the Inventory Inquiry screen (`/products/inquiry`) — including the input prompt, the Sort-by radio buttons, and the full-catalog search.

Without this warmup, the lookup modal either returns empty results or misses SKUs entirely for any prefix outside the first few thousand rows.

Canonical name for this process: **SKU Lookup index warmup**.

## Why it matters

RICS's original SKU Lookup screen expects instant, full-catalog search. Any operator — cashier, buyer, store manager — typing a SKU prefix expects to see every match across the whole InventoryMaster, not a curated subset. Matching that behavior in Zack's Retail requires the index to be fully loaded before the first user request.

Earlier, a smaller "POS snapshot" (capped at 50,000 rows and sorted by description) served as the search source. That cap silently excluded SKUs whose descriptions sorted past row 50,000 — most notably the `ZN02-*` series, which disappeared from every lookup result. The warmup was added to fix that for good.

## Where it lives in code

| File | What it does |
|---|---|
| `apps/api/src/services/ricsProductAdapter.ts` — `loadSkuLookupIndex()` | Reads `InventoryMaster` (no `TOP` cap, narrow projection, `WHERE Status IS NULL OR Status <> 'D'`, `ORDER BY [SKU]`) into a cached array. |
| `apps/api/src/services/ricsProductAdapter.ts` — `warmup()` | Invokes `loadSkuLookupIndex()` as part of its `Promise.all` so the index is loading while the server's other warmups run. |
| `apps/api/src/services/ricsProductAdapter.ts` — `searchSkusForLookup()` | Every request to `GET /api/v1/skus/search` filters this same in-memory index. |
| `apps/web/src/main.tsx` — `queryClient.prefetchQuery(...)` | Fires the default SKU Lookup request at app boot so the TanStack cache is also warm when the first React component subscribes. |

Together, backend warmup and frontend prefetch make the modal feel instant regardless of which page the user opens first.

## How to verify it ran

Tail the API log after a server restart. The canonical log line is:

```
[ricsProductAdapter] SKU lookup index loaded: 203749 rows in 89243ms
```

- The row count should match the current `InventoryMaster` size (≈200k on this customer's database as of 2026-04-19).
- The load time scales linearly with row count; typical values are 60–120 seconds. If it takes dramatically longer, the PowerShell + OLEDB round-trip may be hung.

If you don't see that line within ~2 minutes of server start, the warmup failed — check for preceding `SKU lookup index load failed` error messages, then investigate the MDB accessibility (path, lock, password).

## Refresh cadence

The index has a 10-minute TTL (`SKU_LOOKUP_INDEX_TTL_MS = 10 * 60_000`). The first SKU Lookup request after that window triggers a background refresh while the stale array continues to serve the current request — no user-visible delay.

## Hard rules

- **Never remove `loadSkuLookupIndex()` from `warmup()`.** The modal depends on the index being pre-loaded.
- **Never re-introduce a row cap on `loadSkuLookupIndex()`.** Narrow projection (only the columns the modal renders) is fine; capping rows is not. A cap silently excludes SKUs — exactly the bug this warmup was introduced to fix.
- **Never shorten the TTL below a few minutes.** Refreshing more often offers no user-visible benefit and increases MDB load.

## Future changes

If the warmup becomes a startup-time problem (e.g. catalog grows past 1M rows), acceptable remedies are:

1. Narrow the column projection further.
2. Mirror the SKU index into Postgres and serve prefix queries from there directly.
3. Split the load into pages and background-merge them.

**Not** acceptable: re-introducing a row cap.
