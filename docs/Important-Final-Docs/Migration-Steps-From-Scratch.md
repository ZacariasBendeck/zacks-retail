# Migration Steps From Scratch - Bootstrap Postgres

The ordered sequence to rebuild the Zack's Retail Postgres database from an empty state. Each step's prerequisites and idempotency are called out so you can restart mid-way if a run fails.

For the rehearsal / migration-day sequence after the rebuild, use [docs/operations/migration-day-runbook.md](../operations/migration-day-runbook.md).

---

## Prerequisites

- Postgres reachable via `DATABASE_URL`
- `.env` has `DATABASE_URL` and `RICS_DB_DIR` (path to `Rics Databases/`)
- `Rics Databases/` folder populated with the MDBs
- `ACE.OLEDB.12.0` redistributable installed (Windows, for MDB reads)
- Node 20+ and `pnpm install` done
- A saved attribute catalog JSON in `docs/Important-Final-Docs/attribute-catalog-export-*.json` (produced by `pnpm export:attributes`; see step 4)

---

## 1. Install dependencies + generate Prisma client

```bash
pnpm install
pnpm --filter @benlow-rics/api prisma:generate
```

## 2. Create the schema in Postgres

```bash
pnpm --filter @benlow-rics/api prisma:migrate
```

Creates all four schemas - `rics_mirror`, `public`, `app`, `platform` - and every table, index, view, and check constraint. Database is now shaped but empty.

## 3. Populate `rics_mirror.*` from the Access MDBs

```bash
pnpm --filter @benlow-rics/api sync:rics
```

The big one. Reads every MDB in `Rics Databases/` via the OLE DB bridge, streams each canonical table into a staging schema, atomically swaps it into `rics_mirror`. Records the run in `platform.etl_run` + `platform.etl_run_table`. End state: `rics_mirror.inventory_master` (all SKUs), `rics_mirror.categories`, `rics_mirror.departments`, `rics_mirror.vendors`, and the rest of the canonical mirror are populated.

This is the only step that touches Access - after this, Postgres is self-sufficient.

## 4. Bootstrap `app.*` data (single command)

```bash
pnpm --filter @benlow-rics/api bootstrap:app-data
```

Runs four dependent steps in order, halting on any failure. Must run after `sync:rics` - every step reads from `rics_mirror.*`.

The orchestrator auto-detects the latest `attribute-catalog-export-*.json` in `docs/Important-Final-Docs/` (falling back to repo root or `apps/api/` if missing). Override with `--snapshot <path>`.

Dry-run preview before running:

```bash
pnpm --filter @benlow-rics/api bootstrap:app-data -- --dry-run
```

### What the four steps do

| # | Step | What it does | Re-runnable alone |
|---|---|---|---|
| 1 | `seed:product-families` | Upserts `app.product_family` (11 families) + `app.category_product_family` (every RICS category -> family). Post-run, the category-family orphan set should be empty. | `pnpm seed:product-families` |
| 2 | `import:attributes` | Loads the full attribute framework - dimensions, values, family rules, operator-authored SKU assignments - from the JSON snapshot. Authoritative path for the catalog. | `pnpm import:attributes -- --in <path>` |
| 3 | `seed:sku-attributes` | Scans `rics_mirror.inventory_master.key_words` and applies `seeds/sku_extended_attributes/keyword_rules.csv` to create `seed:keyword:*` rows in `app.sku_attribute_assignment`. Catalog phase is a no-op after step 2; only keyword derivation does real work here. | `pnpm seed:sku-attributes` |
| 4 | `sync:rics-skus` | Walks `rics_mirror.inventory_master` and upserts one `app.sku` row per legacy SKU with `source='rics'`. Only touches `source='rics'` rows - operator-created DRAFT SKUs are never mutated. | `pnpm sync:rics-skus` |

### Targeted re-runs via bootstrap

Skip individual steps when you only need to refresh one area:

```bash
pnpm --filter @benlow-rics/api bootstrap:app-data -- --skip-product-families
pnpm --filter @benlow-rics/api bootstrap:app-data -- --skip-attributes-import --skip-sku-sync
```

### Maintaining the attribute snapshot

Whenever you add a new dimension / value / family rule through the UI, re-run the exporter so the checked-in snapshot stays current:

```bash
pnpm --filter @benlow-rics/api export:attributes -- --out docs/Important-Final-Docs/attribute-catalog-export-YYYY-MM-DD.json
```

Commit the updated JSON. The next fresh bootstrap picks it up automatically.

## 5. Verify the mirror reload (recommended)

```bash
pnpm --filter @benlow-rics/api verify:rics-mirror
```

Re-runs `sync:rics` end-to-end, inserts a canary row into `public."ProductContent"` before the reload, confirms it survives, verifies row counts per table, and writes a clean `platform.etl_run` row. Exits 0 on success, 1 on any check failing. Safe to re-run - it has its own concurrency guard.

## 6. Verify cutover readiness (recommended)

```bash
pnpm --filter @benlow-rics/api verify:cutover-readiness
```

Audits the migration-day blocking checks against the live Postgres state: required schemas, applied Prisma migrations, current attribute snapshot, latest ETL run freshness, canonical mirror-table coverage, mirrored-vs-`app.sku` parity, category-family coverage, and orphan/collision checks. Exits 0 on success, 1 on any blocking failure.

---

## Tree View - Dependency Order

```text
pnpm install
  -> prisma:generate               # Prisma client
  -> prisma:migrate                # schemas + tables created
     -> sync:rics                  # rics_mirror.* populated from MDBs
        -> bootstrap:app-data      # runs 4 dependent steps in order:
           1. seed:product-families
           2. import:attributes (auto-detects latest snapshot)
           3. seed:sku-attributes (keyword derivation)
           4. sync:rics-skus (app.sku backfill)
        -> verify:rics-mirror         # end-to-end reload proof
        -> verify:cutover-readiness   # migration-day blocking checks
```

---

## Keeping the attribute snapshot current

The JSON snapshot in `docs/Important-Final-Docs/` is the portable, authoritative copy of your attribute framework. Treat it like a checked-in data artifact:

- After any attribute edit through the UI or via direct SQL, run `pnpm export:attributes` and commit the updated JSON.
- Before every migration rehearsal, export fresh. The cutover runbook depends on the snapshot reflecting the real current state.
- Operator-authored SKU assignments are included by default; keyword-derived `seed:keyword:*` rows are excluded because `seed:sku-attributes` rebuilds them deterministically after `sync:rics`.

Pair this with the SQL catalog + Excel catalog paths that were used historically - those are now retired from the bootstrap sequence. The only CSV that is still actively consumed is `seeds/sku_extended_attributes/keyword_rules.csv`, which drives the keyword-derivation phase of step 4. The older `dimensions.csv` and `values.csv` under the same folder are kept for history but are no longer the source of truth - the JSON snapshot is.

---

## Notes about the legacy SQLite admin DB

`pnpm --filter @benlow-rics/api seed` populates the legacy SQLite admin DB with synthetic shoe-store data (users, brands, styles, and similar fixtures). Per `CLAUDE.md`, SQLite is inherited from the pre-Postgres design - tables there are being migrated into Postgres over time. For a dev-environment cold start you probably still want it (auth/users live there today); the SKU-form reference tables that used to live exclusively in SQLite are now captured in the JSON snapshot and flow through `import:attributes`.

---

## Idempotency Reference

| Script | Idempotent? | Re-run safety |
|---|---|---|
| `prisma:migrate` | Yes | Tracks applied migrations |
| `sync:rics` | Yes | Atomic swap; drops the prior `rics_mirror` contents |
| `seed:product-families` | Yes | Upsert; preserves operator overrides (`updated_by != 'seed'`) |
| `import:attributes` | Yes | Upsert-only; never deletes; preserves `assigned_at` / `updated_at` from snapshot |
| `seed:sku-attributes` | Yes | Catalog phase no-ops after `import:attributes`; `seed:keyword:*` assignments cleared + re-derived; operator and `seed:excel:*` rows preserved |
| `sync:rics-skus` | Yes | Touches only `source='rics'` rows |
| `verify:rics-mirror` | Yes | Canary cleaned up in `finally` |
| `verify:cutover-readiness` | Yes | Read-only audit over Postgres state + snapshot files |
| `export:attributes` | Yes | Read-only; no DB writes at all |

---

## Quick Reference - Single-Pass Command Block

If everything is already configured and you just want to rebuild:

```bash
pnpm install
pnpm --filter @benlow-rics/api prisma:generate
pnpm --filter @benlow-rics/api prisma:migrate
pnpm --filter @benlow-rics/api sync:rics
pnpm --filter @benlow-rics/api bootstrap:app-data
pnpm --filter @benlow-rics/api verify:rics-mirror
pnpm --filter @benlow-rics/api verify:cutover-readiness
```

`bootstrap:app-data` auto-detects the attribute-catalog JSON in `docs/Important-Final-Docs/`. Pass `--snapshot <path>` to override.

---

## Migration Authoring Helpers

Use these whenever you add or modify the Postgres schema.

### Create a new migration - `pnpm migrate:new <description>`

```bash
pnpm --filter @benlow-rics/api migrate:new add vendor store account overlay
# -> prisma/migrations/20260424033052_add_vendor_store_account_overlay/migration.sql
```

Generates a Prisma migration folder with a seconds-precision timestamp (prevents duplicate-timestamp collisions - the main authoring bug this guards against) and a header template with `TODO` markers for schema, rationale, and rollback plan. Does not run `prisma migrate deploy` - edit the SQL + matching model in `schema.prisma`, then apply.

### Lint existing migrations - `pnpm migrate:lint`

```bash
pnpm --filter @benlow-rics/api migrate:lint
```

Checks every folder under `prisma/migrations/` for:

- Duplicate timestamps - two folders with the same 14-char prefix (errors).
- Missing header comment - first non-blank line should be `--`-prefixed and descriptive (warns).
- Unsafe DROPs - `DROP TABLE/COLUMN/CONSTRAINT/INDEX/SCHEMA/VIEW/TYPE` without `IF EXISTS` (warns - rollback-safety smell).
- Undeclared schemas - schema-qualified identifiers referencing a schema not in `schema.prisma` `datasource db { schemas = [...] }` (errors).

Exit 0 on clean, 1 on any error. Wire into CI before `prisma migrate deploy`.

Current audit output notes 3 pre-existing duplicate-timestamp pairs and 3 unsafe-DROP warnings in `20260423120000_attribute_family_rules`. These are legacy and cannot be safely rewritten without breaking every environment's `_prisma_migrations` tracker - the legitimate moment to squash is the Phase B cutover on the fresh production DB.
