# API Startup Report

**Status:** required — prints on every API restart.

## What it is

Every time `apps/api` starts, it runs several warmup phases in parallel and prints a single consolidated report once they all finish. The report lives at the bottom of the startup log and looks like this:

```
──────────────────────────────────────────
  API startup report — 16/16 ok in 136071ms
──────────────────────────────────────────
  [ok]  prisma:bootstrap-owner           853 ms
  [ok]  rics:inventory-adapter          7356 ms
  [ok]  rics:sales-report-adapter       8552 ms
  [ok]  products.departments            6113 ms
  [ok]  products.categories             6182 ms
  [ok]  products.groups                 5905 ms
  [ok]  products.keywords               6487 ms
  [ok]  products.sectors                5874 ms
  [ok]  products.return-codes           5818 ms
  [ok]  products.promotion-codes        5831 ms
  [ok]  products.size-types             7297 ms
  [ok]  products.seasons                6343 ms
  [ok]  products.vendors                9963 ms
  [ok]  products.vendors:sku-counts     6286 ms
  [ok]  products:warmup                10320 ms
  [ok]  rics:product-adapter          136071 ms
──────────────────────────────────────────
```

One line per phase, aligned columns, green `[ok]` or red `[err]` tag, milliseconds right-aligned, total wall-clock time at the top.

## Why it exists

Startup failures used to be invisible — the server would bind port 4000, log `RICS API server running`, and then silently stall on one slow warmup while every HTTP request hung. The operator-visible symptom was "every tab is loading forever," which is indistinguishable from a dozen other problems.

The report gives an immediate, glanceable answer to three questions:

1. **Is the server actually healthy?** If `ok/total` is 16/16, every phase succeeded. If it's `14/16 (2 failed)`, scan the `[err]` lines — the error message is attached inline.
2. **Where is startup time going?** The right column is per-phase milliseconds. If `rics:product-adapter` jumps from 90 s to 300 s overnight, something changed — MDB got bigger, disk got slower, PowerShell started throwing, etc.
3. **What's skipped and why?** Env-gated phases (`PRODUCT_SOURCE=local`, `SALES_SOURCE!=rics`) show up with `(skipped — reason)` so operators don't wonder whether a dormant phase is broken or intentionally off.

## The phases

| Phase | What it does | Typical time |
|---|---|---|
| `prisma:bootstrap-owner` | Creates the initial owner employee row in Postgres if none exists. Runs once per fresh install, no-op on subsequent boots. | < 1 s |
| `rics:inventory-adapter` | Pre-loads the inventory-inquiry dimension tables (stores, size types, vendors) from the RICS MDBs. | 5–10 s |
| `rics:sales-report-adapter` | Pre-loads sales-report dimension tables (stores, salespeople). Skipped when `SALES_SOURCE!=rics`. | 5–10 s |
| `products.departments` → `products.vendors:sku-counts` | 11 parallel OLE DB reads that populate the TTL caches backing the products admin UI. Sub-phases of `products:warmup`. | 5–10 s each, ~10 s total parallel |
| `products:warmup` | Parent phase that dispatches the 11 sub-tasks and collects their results. Its time is the `max()` of the sub-tasks, not the sum. | ~10 s |
| `rics:product-adapter` | Storefront snapshot (~1k products) **plus** the SKU Lookup index load (~200 k rows). Only runs when `PRODUCT_SOURCE=rics`. This is the longest phase by far — the SKU lookup index alone is ~2 minutes. See [sku-lookup-index-warmup.md](sku-lookup-index-warmup.md). | 90–180 s |

Total startup typically lands between 90 s and 3 minutes on a warm box. The dominant cost is always the SKU lookup index — if your report shows total under 30 s, `PRODUCT_SOURCE` is probably set to `local` and the index warmup was skipped.

## Where it lives in code

| File | What it does |
|---|---|
| [`apps/api/src/services/startupReport.ts`](../../apps/api/src/services/startupReport.ts) | The `StartupReport` class. `track(name, fn)` runs a phase with timing, `skip(name, reason)` records an intentionally-skipped phase, `addSubPhases(prefix, subs)` inlines results from a nested warmup, `print()` emits the table. |
| [`apps/api/src/index.ts`](../../apps/api/src/index.ts) | Wires every phase through one `StartupReport` instance, awaits `Promise.allSettled(tasks)`, then calls `print()`. This is the file to edit when adding or removing a startup phase. |
| [`apps/api/src/services/products/warmup.ts`](../../apps/api/src/services/products/warmup.ts) — `warmupProductsAdmin` | Returns `StartupPhaseResult[]` so its 11 sub-tasks appear in the consolidated table via `report.addSubPhases('products', subs)`. |

## How to read it

- **Green path.** `16/16 ok` and total time under ~3 minutes — everything is fine. Ignore the sub-times unless one is an outlier.
- **One failure.** `15/16 ok (1 failed)` and exactly one `[err]` line. The error message is on the same line. Almost always one of: an MDB file moved, PowerShell couldn't spawn, or Postgres is unreachable. Fix the underlying cause and restart.
- **Every RICS phase failed.** Usually `RICS_DB_DIR` points somewhere wrong, or `Microsoft.ACE.OLEDB.12.0` is missing on the host. Check [access-oledb-async-spawn.md](access-oledb-async-spawn.md).
- **Report never prints.** The server bound the port but never finished warmup. Either a phase hangs forever (rare — all OLE DB calls have PowerShell's default timeout) or the process was killed mid-startup. Check for `Error:` lines above the report would have been.
- **Report prints instantly.** Total time under 5 seconds almost certainly means `PRODUCT_SOURCE=local` (storefront runs against Postgres, RICS adapter skipped). That's fine for local dev against seeded data; in production it would be a misconfiguration.

## Adding a new phase

When you add a new startup task — a new adapter warmup, a migration checker, a license ping — register it with the report instead of logging ad hoc:

```ts
// in index.ts, inside the app.listen callback:
tasks.push(report.track('my-new-phase', () => myNewWarmup()));
```

Rules:
- **Name format:** `<domain>:<operation>` with kebab-case (e.g., `rics:inventory-adapter`, `prisma:bootstrap-owner`). Sub-phases of a parent use dot notation (`products.departments`).
- **Never reject.** `track()` catches errors for you; don't wrap the call in its own try/catch — the report needs the raw result.
- **Don't log your own summary line.** The per-phase adapter-level console logs are still allowed (they show streaming progress during the run), but the one-line "foo warmup complete in 8 s" summary is now the report's job. Remove any ad-hoc summary-style logs from the adapter when wiring it into the report.
- **Fire and settle in parallel.** All phases run concurrently via `Promise.allSettled`. Phases that depend on another phase's output should be awaited inside a single `track()` call, not registered as two separate entries.

## Related docs

- [SKU Lookup index warmup](sku-lookup-index-warmup.md) — the dominant cost in the report.
- [Access OLE DB async spawn](access-oledb-async-spawn.md) — why the report can print at all (sync spawn would freeze the server through warmup).
