# Migration Steps From Scratch — Bootstrap Postgres

The ordered sequence to rebuild the Zack's Retail Postgres database from an empty state. Each step's prerequisites and idempotency are called out so you can restart mid-way if a run fails.

---

## Prerequisites

- Postgres reachable via `DATABASE_URL`
- `.env` has `DATABASE_URL` and `RICS_DB_DIR` (path to `Rics Databases/`)
- `Rics Databases/` folder populated with the MDBs
- `ACE.OLEDB.12.0` redistributable installed (Windows, for MDB reads)
- Node 20+ and `pnpm install` done
- **A saved attribute catalog JSON** in `docs/Important-Final-Docs/attribute-catalog-export-*.json` (produced by `pnpm export:attributes` — see step 4b)

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

Creates all four schemas — `rics_mirror`, `public`, `app`, `platform` — and every table, index, view, and check constraint. Database is now shaped but empty.

## 3. Populate `rics_mirror.*` from the Access MDBs

```bash
pnpm --filter @benlow-rics/api sync:rics
```

The big one. Reads every MDB in `Rics Databases/` via the OLE DB bridge, streams each canonical table into a staging schema, atomically swaps it into `rics_mirror`. Records the run in `platform.etl_run` + `platform.etl_run_table`. End state: `rics_mirror.inventory_master` (all SKUs), `rics_mirror.categories`, `rics_mirror.departments`, `rics_mirror.vendors`, etc. all populated.

This is the only step that touches Access — after this, Postgres is self-sufficient.

## 4. Seed `app.*` overlays (in this order — each depends on the prior)

### 4a. Product families + category mapping

```bash
pnpm --filter @benlow-rics/api seed:product-families
```

Upserts `app.product_family` (11 families from `seeds/product_families/families.csv`) and `app.category_product_family` (every RICS category → family). **Must run after `sync:rics`** because it validates against `rics_mirror.categories`. Post-run, `SELECT * FROM app.category_family_orphans` should be empty.

### 4b. Attribute framework catalog (JSON import)

```bash
pnpm --filter @benlow-rics/api import:attributes -- --in docs/Important-Final-Docs/attribute-catalog-export-YYYY-MM-DD.json
```

Loads the full attribute framework — dimensions, values, family rules, and any operator-authored SKU assignments — from a portable JSON snapshot. **This is the authoritative path** for restoring the attribute catalog; it replaces the older CSV-seeded and SQLite-sourced imports (documented as "seed:sku-attributes catalog phase" and "seed:legacy-ref-dimensions" in prior versions of this guide).

The snapshot captures all 15 dimensions (4 business + 11 shoe-spec) in a single file. Upsert-only; safe to re-run.

**Maintaining the snapshot:** whenever you add a new dimension / value / family rule through the UI, re-run the exporter so the checked-in snapshot stays current:

```bash
pnpm --filter @benlow-rics/api export:attributes -- --out docs/Important-Final-Docs/attribute-catalog-export-YYYY-MM-DD.json
```

Commit the updated JSON. The next fresh-bootstrap picks it up automatically.

### 4c. Keyword-derive SKU attribute assignments

```bash
pnpm --filter @benlow-rics/api seed:sku-attributes
```

Scans `rics_mirror.inventory_master.key_words` and applies `seeds/sku_extended_attributes/keyword_rules.csv` to create `seed:keyword:*` rows in `app.sku_attribute_assignment`. After a fresh `sync:rics`, this is what populates the attribute workbench with real data. **Must run after 4b** (catalog must exist) and **after `sync:rics`** (needs the mirror).

The catalog phase of this script is now a no-op since 4b already upserted every dimension and value. Only the keyword derivation phase (and the coverage report at the end) does real work here. Operator-authored assignments and `seed:excel:*` rows from 4b survive untouched — this script only rebuilds the `seed:keyword:*` subset.

### 4d. Backfill `app.sku` from the mirror

```bash
pnpm --filter @benlow-rics/api sync:rics-skus
```

Walks `rics_mirror.inventory_master` and upserts one `app.sku` row per legacy SKU with `source='rics'`. Idempotent and only touches `source='rics'` rows — operator-created `source='app'` drafts are never mutated. **Can run anytime after `sync:rics`**, but running it after 4a–4c means each new `app.sku` row already resolves its family and attribute assignments correctly.

## 5. Verify (optional but recommended)

```bash
pnpm --filter @benlow-rics/api verify:rics-mirror
```

Re-runs `sync:rics` end-to-end, inserts a canary row into `public."ProductContent"` before the reload, confirms it survives, verifies row counts per table, and writes a clean `platform.etl_run` row. Exits 0 on success, 1 on any check failing. Safe to re-run — has its own concurrency guard.

## 6. Test the SKU write-back path (diagnostic)

```bash
pnpm --filter @benlow-rics/api test:sku-writeback -- --keep
```

Not part of the build — smoke-tests that `SkuRepository.create/update/delete` actually hits the Access MDB correctly. `--keep` leaves the row so you can verify it in Access.

---

## Tree View — Dependency Order

```
pnpm install
 └─ prisma:generate              # Prisma client
 └─ prisma:migrate               # schemas + tables created
     └─ sync:rics                # rics_mirror.* populated from MDBs ─────┐
         ├─ seed:product-families                                         │ depends on
         │   └─ import:attributes   ← JSON snapshot restores catalog     │ rics_mirror
         │       └─ seed:sku-attributes  # keyword derivation only       │
         └─ sync:rics-skus       # app.sku backfill ──────────────────────┘
             └─ verify:rics-mirror   # optional sanity check
```

---

## Keeping the attribute snapshot current

The JSON snapshot in `docs/Important-Final-Docs/` is the portable, authoritative copy of your attribute framework. Treat it like a checked-in data artifact:

- **After any attribute edit through the UI or via direct SQL**, run `pnpm export:attributes` and commit the updated JSON.
- **Before every migration rehearsal**, export fresh. The cutover runbook depends on the snapshot reflecting the real current state.
- **Operator-authored SKU assignments are included by default**; keyword-derived `seed:keyword:*` rows are excluded because `seed:sku-attributes` rebuilds them deterministically after sync:rics.

Pair this with the SQL catalog + Excel catalog paths that were used historically — those are now retired from the bootstrap sequence. The only CSV that is still actively consumed is `seeds/sku_extended_attributes/keyword_rules.csv`, which drives the keyword-derivation phase of 4c. The older `dimensions.csv` and `values.csv` under the same folder are kept for history but are no longer the source of truth — the JSON snapshot is.

---

## Notes about the legacy SQLite admin DB

`pnpm --filter @benlow-rics/api seed` populates the legacy SQLite admin DB with synthetic shoe-store data (users, brands, styles, etc.). Per [CLAUDE.md](../../CLAUDE.md), SQLite is inherited from the pre-Postgres design — tables there are being migrated into Postgres over time. For a dev-environment cold start you probably still want it (auth/users live there today); the SKU-form reference tables that used to live exclusively in SQLite are now captured in the JSON snapshot and flow through `import:attributes`.

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
| `export:attributes` | Yes | Read-only; no DB writes at all |

---

## Quick Reference — Single-Pass Command Block

If everything is already configured and you just want to rebuild:

```bash
pnpm install
pnpm --filter @benlow-rics/api prisma:generate
pnpm --filter @benlow-rics/api prisma:migrate
pnpm --filter @benlow-rics/api sync:rics
pnpm --filter @benlow-rics/api seed:product-families
pnpm --filter @benlow-rics/api import:attributes -- --in docs/Important-Final-Docs/attribute-catalog-export-YYYY-MM-DD.json
pnpm --filter @benlow-rics/api seed:sku-attributes
pnpm --filter @benlow-rics/api sync:rics-skus
pnpm --filter @benlow-rics/api verify:rics-mirror    # optional
```

Replace `YYYY-MM-DD` with the actual date stamp on the latest export in `docs/Important-Final-Docs/`.
