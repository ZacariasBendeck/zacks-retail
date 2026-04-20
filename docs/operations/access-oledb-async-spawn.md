# Access OLE DB — Async PowerShell Spawn

**Status:** required runtime invariant — do not revert to `spawnSync`.

## What it is

Every read and write against the legacy RICS MDB files goes through a single helper, `runPowerShellJson()` in [`apps/api/src/services/accessOleDb.ts`](../../apps/api/src/services/accessOleDb.ts). That helper shells out to `powershell.exe` with an OLE DB script (the adapter has no other way to reach Jet/ACE from Node).

The invariant: **that spawn must be asynchronous (`child_process.spawn`), never synchronous (`child_process.spawnSync`)**. stdout and stderr drain through event-loop callbacks, and the Promise only resolves once PowerShell exits.

## Why it matters

A single warmup cycle fires 11 OLE DB queries (departments, categories, groups, keywords, sectors, return-codes, promotion-codes, size-types, seasons, vendors, vendors:sku-counts). Each one spawns a fresh `powershell.exe`, opens the MDB, reads rows, and returns JSON — anywhere from 0.7 s to 60 s per call depending on table size.

If `runPowerShellJson` uses `spawnSync`, **the Node event loop blocks for the entire duration of every PowerShell call**. The server binds port 4000 and logs `RICS API server running`, but no HTTP request can be answered until the last warmup task finishes. The symptom the operator sees is *"port 4000 is listening but every request hangs"* — the process is alive, the port is open, TCP is accepting connections, but no route handler ever executes because the event loop is frozen inside `spawnSync`.

This exact failure is what broke the products admin on 2026-04-20: the server came up, the browser got a TCP handshake, and every tab spun forever until warmup finished ~60 s later.

With async `spawn`, warmup still takes 8–10 s end-to-end (it issues queries in parallel via `Promise.allSettled`), but the event loop stays responsive the entire time. Cached endpoints answer in milliseconds while cold OLE DB queries run in the background.

## Where it lives in code

| File | What it does |
|---|---|
| [`apps/api/src/services/accessOleDb.ts`](../../apps/api/src/services/accessOleDb.ts) — `runPowerShellJson()` | Core helper. **Must use async `spawn`.** Streams stdout as UTF-8, buffers into a string, parses JSON on the `close` event. Rejects on non-zero exit with stderr attached. |
| Same file — `runPowerShellJsonSync()` | Legacy synchronous variant kept only for the password-recovery bootstrap that runs before the server starts listening. Do **not** call this from any request handler or warmup path. |
| [`apps/api/src/services/products/warmup.ts`](../../apps/api/src/services/products/warmup.ts) | Fires 11 taxonomy/vendor queries in parallel at API startup. Relies on `runPowerShellJson` being async to keep the server answerable while queries run. |
| [`apps/api/src/services/ricsProductAdapter.ts`](../../apps/api/src/services/ricsProductAdapter.ts) — `warmup()` | Kicks off the SKU Lookup index warmup (see [sku-lookup-index-warmup.md](sku-lookup-index-warmup.md)) using the same async helper. |

## Why not a persistent PowerShell host

An earlier design (see `apps/api/src/services/persistentPwsh.ts`) kept one `powershell.exe` alive and fed it scripts over stdin to avoid the ~1 s cold-start-per-query cost. It deadlocked on large responses — a 150 MB SKU dump would race the end-marker write, leaving the Node side waiting for a marker that never arrived.

The current trade is deliberate: **pay ~1 s of spawn overhead per query, keep framing trivial (one process = one response), never deadlock**. The 60-minute TTL cache in `SkuRepository` and 5-minute TTL cache in `VendorRepository` absorb the per-call cost for the hot paths.

`persistentPwsh.ts` still exists but is effectively unused; leave it in place as a reference for why we chose the current approach.

## How to verify it ran

After an API restart, tail `/tmp/api.log` (or wherever the background task writes) and look for:

```
RICS API server running on http://localhost:4000
Swagger docs: http://localhost:4000/api-docs
[products-warmup] 11/11 tasks in 8754ms
  [ok] departments              5449ms
  [ok] categories               5488ms
  ...
```

The key signal: between `RICS API server running` and `[products-warmup] 11/11`, **HTTP requests should answer normally**. Test with:

```bash
curl -s -m 5 -o /dev/null -w "%{http_code} %{time_total}s\n" http://localhost:4000/api-docs
```

If you see `301 0.003s`, the event loop is healthy. If you see `000 5.000s` (timeout), `runPowerShellJson` has regressed to a sync path and must be fixed.

## Things that will break this invariant

Any of the following is a red flag — reject them on review:

- Changing `runPowerShellJson` to use `spawnSync`, `execSync`, or anything else that returns synchronously.
- Adding `await runPowerShellJsonSync(...)` in a request handler or warmup task (the "Sync" name is load-bearing; only the Jet password recovery uses it, and only at module init).
- Wrapping `spawnSync` in a `new Promise()` and calling it "async" — it is not. The Promise resolves instantly but the body already blocked the loop.
- Starting the warmup *before* `app.listen()` returns. Warmup must be fire-and-forget from the `listen` callback so the socket is already accepting connections while queries run.

## Related docs

- [SKU Lookup index warmup](sku-lookup-index-warmup.md) — the single largest consumer of `runPowerShellJson`.
