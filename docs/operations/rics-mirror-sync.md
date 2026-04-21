# RICS → Postgres Mirror Sync

**Status:** operator-invoked pipeline — safe to run ad-hoc, does not touch RICS.

## What it is

A one-way, full-reload ETL that copies every canonical RICS table from the legacy Access `.MDB` files into Postgres. Postgres then serves as the live read source for Zack's Retail; the MDB files are only touched during a reload.

Invocation:

```
pnpm --filter @benlow-rics/api sync:rics           # run the reload
pnpm --filter @benlow-rics/api verify:rics-mirror  # full end-to-end proof (~5 min)
/verify-rics-mirror                                # same, as a slash command
/verify-rics-mirror --counts-only                  # fast sanity check, no sync
```

The pipeline lives entirely in [`apps/api/src/services/sync/`](../../apps/api/src/services/sync/) and [`apps/api/scripts/sync-rics.ts`](../../apps/api/scripts/sync-rics.ts) + [`verify-rics-mirror.ts`](../../apps/api/scripts/verify-rics-mirror.ts).

## Schema layout

The reload carves Postgres into three schemas with different lifecycles:

| Schema | Lifecycle | What lives here |
|---|---|---|
| `rics_mirror` | **WIPED on every reload.** | 1:1 mirror of every canonical RICS table. Table names snake_cased from the RICS name (`InventoryMaster` → `inventory_master`, `Vendor Master` → `vendor_master`). No PKs, no FKs, no indexes on the mirror — readers index at the app layer if needed. |
| `app` | **PRESERVED across reloads.** | Net-new tables Zack's Retail creates (content overlays, drafts, user-authored records). Empty today; future work lands here. Rows reference RICS entities by natural key (`rics_sku_code text`), never by the mirror's ephemeral UUIDs. |
| `public` | **PRESERVED across reloads.** | Existing Prisma models (`ProductContent`, `Cart`, `Order`, `User`, `Role`, `Session`, `ProductsAuditLog`, `SeasonOverlay`). Stays in `public` for backward compatibility with the current Prisma client; may move into `app` later. |
| `platform` | **PRESERVED.** | `etl_run`, `etl_run_table` — audit log of every sync execution. See [platform module spec](../modules/platform.md). |

**The split is the whole point of this design.** A reload is safe to run at any time because it only rebuilds `rics_mirror`; work you've done in the app (`public.ProductContent` overlays, `app.*` entries) is invisible to the reload and survives.

## Architecture — atomic swap

```
BEGIN TRANSACTION
  DROP SCHEMA IF EXISTS rics_mirror_staging CASCADE   -- clean leftover from failed run
  CREATE SCHEMA rics_mirror_staging
  for each canonical MDB table:
    CREATE TABLE rics_mirror_staging.<snake_name> (...mapped columns...)
    COPY rows in via a CSV intermediate
    INSERT into platform.etl_run_table
  DROP SCHEMA IF EXISTS rics_mirror CASCADE
  ALTER SCHEMA rics_mirror_staging RENAME TO rics_mirror
COMMIT
```

Postgres's DDL is transactional, so every reader sees either the **old** `rics_mirror` or the **new** one — never a half-populated in-between state. If any step throws, the transaction rolls back and the previous mirror is untouched; operators re-run without cleanup.

## Architecture — extraction

The extractor is a C# class hosted in PowerShell via `Add-Type` ([`bulk-extract.ps1`](../../apps/api/src/services/sync/bulk-extract.ps1)). Data flows:

```
ACE.OLEDB.12.0 reader (row-by-row)
        ↓
C# StreamWriter → CSV file on disk
        ↓
Node fs.createReadStream (1 MiB chunks)
        ↓
pg-copy-streams COPY FROM STDIN WITH (FORMAT csv, NULL '\N')
        ↓
rics_mirror_staging.<table>
```

Why this shape:

- **C# for the row loop.** The original pure-PowerShell path buffered the full rowset in memory and serialized it as one JSON blob — the `InventoryMaster` case took 3m 56s for 203k rows and failed on larger tables when PowerShell ran out of memory. C# iterates the `OleDbDataReader` at native speed and writes directly to the output stream; row-level RAM usage is bounded regardless of table size.
- **CSV file intermediate (not a live pipe).** Disk serves as the buffer between the C# producer and the Node consumer. Makes debugging trivial (inspect the CSV before COPY), avoids inter-process backpressure/deadlock scenarios, and lets Node run the COPY inside its own transaction without coordinating cross-process state.
- **Node owns the transaction.** The C# extractor never talks to Postgres directly. Node (via raw `pg` client) opens the transaction, invokes the extractor per table, runs COPY, and commits the swap. That keeps atomicity simple.

Measured throughput after the rewrite (2026-04-21, 27 tables, 21.4M rows): **4m 57s end-to-end** — dominated by ACE read speed itself, which is the physical floor.

## Canonical MDB allowlist

Hard-coded in [`canonicalRicsTables.ts`](../../apps/api/src/services/sync/canonicalRicsTables.ts). 13 files, 27 tables. Adding a table is a one-line change; the next reload picks it up.

Files explicitly excluded from the allowlist:

- `*.backup-YYYY-MM-DD-*.MDB` — on-disk backups, not live tables.
- `USERGELU.MDB`, `USERZULMA.MDB` — per-user scratch files.
- `RITRANS011926.MDB`, `RITRANS1.MDB`, `RITRANS12225.MDB`, `RITRANSF.MDB`, `RITRANS - copia.MDB` — dated or renamed copies of the live transaction DB.
- `INVFISICOINVDETTEMP.MDB`, `JOELINVDETTEMP.MDB`, `LLAMADASINVDETTEMP.MDB` — physical-inventory scratch files.
- `riparms.mdb`, `riprclog.mdb`, `ricomm.mdb` — lowercase config/log files not used by the current app.
- `RISEMF.MDB` — opens in ACE, but its tables are 19 "SEMF \<domain\>" tables that don't match the shape the app expects. Add targeted entries once the consumer surface is clear.

## Type mapping

Access OLE DB `DATA_TYPE` (integer code from `GetOleDbSchemaTable`) → Postgres type, in [`typeMapping.ts`](../../apps/api/src/services/sync/typeMapping.ts):

| OleDb type | Postgres type |
|---|---|
| `adSmallInt`, `adTinyInt`, `adUnsignedTinyInt` | `smallint` |
| `adInteger`, `adUnsignedSmallInt` | `integer` |
| `adBigInt`, `adUnsignedInt` | `bigint` |
| `adSingle`, `adDouble` | `double precision` |
| `adCurrency`, `adDecimal`, `adNumeric` | `numeric(18,4)` |
| `adBoolean` | `boolean` |
| `adDate`, `adDBTimeStamp`, `adFileTime` | `timestamptz` |
| `adChar`, `adVarChar`, `adLongVarChar`, `adWChar`, `adVarWChar`, `adLongVarWChar` | `text` |
| `adGUID` | `uuid` |
| `adBinary`, `adVarBinary`, `adLongVarBinary` | `bytea` |
| unknown | `text` (fallback) |

`NOT NULL` is preserved from `IS_NULLABLE` in the column schema. No PK is inferred — the mirror is throwaway; adding constraints costs reload time for no reader benefit today.

## How to verify it ran

```
pnpm --filter @benlow-rics/api verify:rics-mirror
```

Runs an end-to-end proof in ~5 min: plants a canary row in `public."ProductContent"`, runs the full sync, checks the canary survived, prints row counts, cleans up. Exits 0 on PASS, 1 on FAIL, 2 on unhandled error.

For a quick sanity check without running a sync, use the slash command:

```
/verify-rics-mirror --counts-only
```

It hits the live mirror and prints `SELECT COUNT(*)` for every canonical table plus the three most recent `platform.etl_run` rows.

Expected row counts (baseline from 2026-04-21 — actuals drift with RICS activity):

| table | approx rows |
|---:|---:|
| `rics_mirror.inv_changes` | 12,025,193 |
| `rics_mirror.ticket_detail` | 3,841,207 |
| `rics_mirror.inv_his` | 1,918,492 |
| `rics_mirror.ticket_tender` | 1,331,229 |
| `rics_mirror.ticket_header` | 1,293,008 |
| `rics_mirror.inventory_quantities` | 613,576 |
| `rics_mirror.inventory_master` | 203,749 |
| `rics_mirror.sales_batches` | 123,670 |
| `rics_mirror.salespeople` | 9,620 |
| `rics_mirror.keywords` | 2,417 |
| `rics_mirror.vendor_master` | 2,256 |
| `rics_mirror.categories` | 615 |
| (everything else) | <700 |

Known-empty tables (empty in the source MDBs, not a bug): `inv_catalog`, `marketing_code`, `nrma_codes`, `payouts`, `time_clock`, `transmitted`.

## Troubleshooting

**A run is stuck in `platform.etl_run` with `status='running'` forever.** Probably a prior process died without rolling back (killed by signal, OOM, laptop slept). Check `SELECT * FROM pg_stat_activity WHERE state <> 'idle'` — if there's no active backend, the run is orphaned. The next successful run does *not* clear it; run `UPDATE platform.etl_run SET status = 'failed', "errorText" = 'orphaned — no active backend' WHERE status = 'running' AND "startedAt" < now() - interval '1 hour'` to sweep.

**`bulk-extract <table>: No columns found`.** The table name in [`canonicalRicsTables.ts`](../../apps/api/src/services/sync/canonicalRicsTables.ts) doesn't match what ACE exposes for that MDB. Table names are case-sensitive and can contain spaces (e.g. `Vendor Master`, `Inventory Quantities`). To see the real names, open the MDB in Access or run `buildListTablesScript()` ad-hoc.

**`invalid input syntax for type timestamp with time zone: "/Date(...)/"`.** Shouldn't happen anymore — the C# extractor emits ISO dates directly. If it reappears, a code regression replaced the C# extractor with the old JSON path.

**CSV intermediates piling up on disk.** Staging dir is `$RICS_SYNC_STAGING_DIR` if set, else `<os.tmpdir>/rics-staging`. Per-run subdir named `run-<uuid>`. Success path deletes each CSV after its COPY lands and removes the subdir in a `finally` block; a hard kill between COPY and delete can leave a CSV behind. Safe to `rm -rf <staging-dir>/run-*` when no sync is active.

**`EADDRINUSE :::4000` after a sync failure.** Unrelated — that's the API server port, not the sync. The sync uses Postgres on `localhost:5433` and doesn't open listening ports.

**Performance regression on large tables.** If `inv_changes` or `ticket_detail` suddenly take an order of magnitude longer, check [`copyFromMdb.ts`](../../apps/api/src/services/sync/copyFromMdb.ts) still calls `bulkExtractToCsv` — not the legacy `executeQuery` JSON path. The legacy path still exists in `accessOleDb.ts` for the column-introspection call and must stay in use there; reintroducing it into the row-extraction path is the regression.

## Hard rules

- **`rics_mirror` is throwaway. Never write app data into it.** Any row in `rics_mirror.*` will be dropped by the next `pnpm sync:rics`. App-native data goes in `public` or `app`.
- **Never write back to the MDB files from Node.** The RICS read-only rule from [CLAUDE.md](../../CLAUDE.md) stays in force. The C# extractor is read-only by construction (`SELECT` only, no `ExecuteNonQuery`); don't extend it to write.
- **Do not run two syncs concurrently.** The verify script already guards with a 30-minute `status='running'` window; don't bypass with `SYNC_FORCE=1` unless you've confirmed the prior run is actually dead (no backend in `pg_stat_activity`).
- **Do not remove the `--env-file-if-exists=.env` flag** from the `sync:rics` / `verify:rics-mirror` scripts in [`apps/api/package.json`](../../apps/api/package.json). The DB URL + RICS MDB directory both come from `.env`.
- **Do not add columns or indexes to `rics_mirror` tables by hand.** The schema regenerates on every reload — hand-added objects vanish. Indexes and extra columns belong on derived tables in `app`, backed by queries against `rics_mirror`.

## Future changes

Acceptable:

1. **Add/remove tables in `canonicalRicsTables.ts`.** One-line change; next reload picks it up.
2. **Add indexes on `rics_mirror` tables** inside the extractor (CREATE INDEX after CREATE TABLE, inside the same transaction) once query patterns stabilize enough to know which indexes matter. Must be created per-reload, not hand-added.
3. **Pre-compile the C# extractor to a standalone `.exe`** if Add-Type cold-start becomes a bottleneck. Currently ~0.5s per invocation × ~30 invocations = 15s of overhead, which is fine against a ~5 min total.
4. **Parallelize extraction across MDBs** (worker-pool style) if the ~5 min total grows past acceptable. ACE OLE DB is per-file, so different MDBs can be read concurrently without lock contention.
5. **Incremental sync via `DateLastChanged`** once a module actually needs sub-hour freshness. Requires tracking a watermark per table, which platform can own in `platform.etl_run_table`. First full sync still has to happen; incremental speeds up subsequent ones.

Not acceptable:

- **Two-way sync (Postgres → RICS).** Explicitly out of scope. Keeps the RICS-read-only hard rule intact.
- **Dropping the CSV intermediate for a live pipe between the C# process and pg-copy-streams.** Adds inter-process backpressure complexity for negligible speed gain. The disk I/O isn't the bottleneck.
- **Putting the reload on a cron by default.** Operator-invoked only. Automated schedules can live in a module-specific runbook later if a module actually needs one.

## Related docs

- [docs/modules/platform.md](../modules/platform.md) — owns `platform.etl_run` + `etl_run_table` as part of the cross-cutting admin spine.
- [docs/operations/access-oledb-async-spawn.md](access-oledb-async-spawn.md) — the async-spawn invariant that the sync pipeline depends on for its column-introspection path.
- [docs/operations/sku-lookup-index-warmup.md](sku-lookup-index-warmup.md) — the in-memory index that today reads from the MDB adapter. Once the products adapter cuts over to `rics_mirror`, the warmup will read from Postgres instead — a future edit to this file.
