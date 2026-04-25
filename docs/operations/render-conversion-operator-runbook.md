# Render Conversion Operator Runbook

**Status:** operator-facing rehearsal runbook for the current Render conversion flow on 2026-04-25.

## Purpose

Use this runbook when you want to rehearse the full Render conversion flow in one pass and record whether the run is usable.

This runbook is intentionally practical:

- what command to run
- what files should exist after each step
- what to verify before moving on
- what warnings are acceptable
- what should stop the run

This is the right runbook for the planned "run it 10 times" rehearsal loop.

## Scope

This runbook covers the current 3-step sequence:

1. export the conversion bundle
2. upload the bundle to the transient Render-side location
3. load the bundle into Render Postgres

It does **not** cover:

- final business cutover approval
- the red app-native surfaces that still have no export/import artifact
- the final Render-safe cutover verification gate, because `verify:cutover-readiness` is still mirror-era

For the detailed source-to-target map, see [render-conversion-day-matrix.md](render-conversion-day-matrix.md).

## What You Need Before Starting

- access to the workstation that can run the extract command
- access to the target Render-side upload location
- access to the target Render database / runtime environment
- the optional CRM sidecar files if customer-history rehearsal is in scope:
  - `Customer.csv`
  - `MailListNames.csv`
  - `ticket_header.csv`
  - `ticket_detail.csv`

Recommended before each run:

- decide the bundle folder name ahead of time
- decide whether this is a clean-db rehearsal or an incremental rehearsal
- decide whether customer files are included on this run
- record the start time before command 1

Suggested bundle naming convention:

```text
<bundle-root>/render-conversion-YYYYMMDD-runNN
```

Example:

```text
E:\cutover-bundles\render-conversion-20260425-run01
```

## Success Standard For One Rehearsal

A rehearsal run is considered usable when all of these are true:

- command 1 finishes successfully and writes a complete bundle
- the uploaded bundle matches the exported bundle structure
- command 3 finishes successfully
- the load summary shows the expected major steps ran
- no unexpected warnings appeared
- the operator spot-checks for this run pass

## Step 1: Export The Bundle

Run:

```bash
pnpm --filter @benlow-rics/api cutover:render-export -- --out <bundle-dir> [--customer <Customer.csv> --mail <MailListNames.csv> --ticket-header <ticket_header.csv> --ticket-detail <ticket_detail.csv>]
```

Example with customer-history files:

```bash
pnpm --filter @benlow-rics/api cutover:render-export -- --out E:\cutover-bundles\render-conversion-20260425-run01 --customer E:\exports\Customer.csv --mail E:\exports\MailListNames.csv --ticket-header E:\exports\ticket_header.csv --ticket-detail E:\exports\ticket_detail.csv
```

What this step should create:

- `<bundle-dir>/bundle-manifest.json`
- `<bundle-dir>/legacy/manifest.json`
- `<bundle-dir>/legacy/*.csv`
- `<bundle-dir>/app/attribute-catalog-export.json`
- optionally `<bundle-dir>/crm/*.csv`

Stop the run if any of these are true:

- command exits non-zero
- `bundle-manifest.json` is missing
- `legacy/manifest.json` is missing
- `app/attribute-catalog-export.json` is missing
- a CRM file was intended for this run but is missing from `crm/`

Expected warnings from this step:

- a CRM sidecar file was not supplied because that data is intentionally out of scope for this rehearsal

Unexpected warnings from this step:

- a CRM file was supposed to be included but the export says it was missing
- the bundle manifest lists blockers that do not match the current repo state

Operator checks after step 1:

- open `<bundle-dir>/bundle-manifest.json`
- confirm `legacyManifestPath` points to `legacy/manifest.json`
- confirm `attributeSnapshotPath` points to `app/attribute-catalog-export.json`
- confirm optional CRM files listed in `optionalFiles` match what you intended to include
- open `<bundle-dir>/legacy/manifest.json`
- confirm the legacy CSV list is present and not empty

Record in your run log:

- bundle path
- whether CRM files were included
- export start time
- export end time
- any warnings shown

## Step 2: Upload The Bundle

There is no repo command for this yet. This step is simply moving the whole bundle to the transient Render-side location used by the load runner.

What must be uploaded:

- `bundle-manifest.json`
- the entire `legacy/` folder
- the entire `app/` folder
- `crm/` only if those files are part of the run

Stop the run if any of these are true:

- the uploaded folder structure does not match the exported bundle
- `legacy/manifest.json` is missing after upload
- `app/attribute-catalog-export.json` is missing after upload
- a CRM file was intended for this run but is missing after upload

Operator checks after step 2:

- confirm the uploaded bundle still has `bundle-manifest.json`
- confirm `legacy/manifest.json` exists at the uploaded location
- confirm `app/attribute-catalog-export.json` exists at the uploaded location
- confirm the `legacy/*.csv` files are present
- confirm `crm/*.csv` files are present if expected

Record in your run log:

- upload start time
- upload end time
- upload destination
- any files missing after upload

## Step 3: Load The Bundle

Run:

```bash
pnpm --filter @benlow-rics/api cutover:render-load -- --bundle <bundle-dir>
```

Example:

```bash
pnpm --filter @benlow-rics/api cutover:render-load -- --bundle E:\cutover-bundles\render-conversion-20260425-run01
```

Optional flags for focused rehearsals:

```bash
pnpm --filter @benlow-rics/api cutover:render-load -- --bundle <bundle-dir> --skip-inventory-history
pnpm --filter @benlow-rics/api cutover:render-load -- --bundle <bundle-dir> --skip-customers
pnpm --filter @benlow-rics/api cutover:render-load -- --bundle <bundle-dir> --skip-customer-transactions
pnpm --filter @benlow-rics/api cutover:render-load -- --bundle <bundle-dir> --skip-segmentation-defaults
pnpm --filter @benlow-rics/api cutover:render-load -- --bundle <bundle-dir> --inventory-history-as-of 2026-04-25
```

What this step runs internally, in order:

1. `prisma migrate deploy`
2. `import:attributes`
3. `seed:taxonomy-from-mirror -- --manifest <legacy-manifest>`
4. `seed:product-families`
5. `import:app-skus-from-artifact`
6. `seed:sku-attributes -- --manifest <legacy-manifest>`
7. `import:app-reference-baselines-from-artifact`
8. `import:app-replenishment-targets-from-artifact`
9. `seed:segmentation-defaults`
10. `import:app-stock-from-artifact`
11. `import:app-inventory-history-from-artifact` unless skipped
12. `import:customers` if customer CSVs are present and not skipped
13. `import:customer-transactions:rics` if ticket CSVs are present and not skipped

Stop the run if any of these are true:

- command exits non-zero
- any inner step reports `FAILED`
- the load summary ends with unexpected warnings
- the DB is missing one of the expected major baseline tables after load

Expected warnings from this step:

- customer master import skipped because customer CSVs were intentionally not included
- customer transaction import skipped because ticket CSVs were intentionally not included
- inventory history skipped because you intentionally passed `--skip-inventory-history`
- unresolved SKU warnings in reference/history imports only if you already know the source data contains bad or unmapped legacy values and you are explicitly tracking them

Unexpected warnings from this step:

- `app.sku is empty after the SKU artifact import`
- customer files skipped when you intended to include them
- ticket files skipped when you intended to include them
- unresolved SKU warnings suddenly grow compared with earlier runs

Operator checks immediately after step 3:

- confirm the load command reached the final summary
- confirm `app.sku` count is non-zero
- confirm no major import step was skipped unexpectedly
- confirm the total runtime is within the rehearsal target

## Fast Post-Load Checks

Use these as the minimum "did the load basically work?" checks after each run.

### Check 1: Major baseline tables are populated

Run these queries against the target Postgres database:

```sql
select count(*) as sku_count from app.sku;
select count(*) as vendor_count from app.vendor;
select count(*) as store_count from app.store_master;
select count(*) as stock_level_count from app.stock_level;
select count(*) as stock_movement_count from app.stock_movement;
select count(*) as replenishment_target_count from app.replenishment_target;
```

Expected:

- none of these should be zero on a full rehearsal

### Check 2: Taxonomy and family seed landed

```sql
select count(*) as taxonomy_category_count from app.taxonomy_category;
select count(*) as product_family_count from app.product_family;
select count(*) as category_family_count from app.category_product_family;
```

Expected:

- all three should be non-zero

### Check 3: Inventory history landed when included

```sql
select count(*) as snapshot_count from app.inventory_history_snapshot;
select count(*) as month_count from app.inventory_history_month;
select count(*) as trend_week_count from app.inventory_history_trend_week;
select count(*) as movement_bucket_count from app.inventory_history_movement_bucket;
```

Expected:

- all should be non-zero unless you intentionally skipped inventory history

### Check 4: Customer data landed when included

```sql
select count(*) as customer_count from app.customer;
select count(*) as sales_history_ticket_count from app.sales_history_ticket;
select count(*) as sales_history_ticket_line_count from app.sales_history_ticket_line;
```

Expected:

- `app.customer` should be non-zero if customer CSVs were included
- `app.sales_history_ticket` and `app.sales_history_ticket_line` should be non-zero if ticket CSVs were included

## Operator Spot Checks In The App

After the DB checks, do a quick operator smoke pass:

1. Open a known SKU and confirm description, vendor, family/category, and prices look correct.
2. Check at least one SKU with sizes and confirm stock cells are populated.
3. Check a known vendor and a known store.
4. If customer files were included, open a known customer and confirm account/contact data exists.
5. If ticket files were included, confirm a known sales-history/customer-metrics view is populated.

If any of these fail, mark the run as failed even if the commands completed.

## Accept / Reject One Run

Mark the run as **PASS** only if:

- all intended commands completed successfully
- no unexpected warnings occurred
- post-load DB checks passed
- app spot checks passed

Mark the run as **FAIL** if:

- a command failed
- a required file was missing
- a required table count is zero
- an unexpected warning appeared
- operator spot checks found a mismatch

## Suggested 10-Run Log Format

Record one row per rehearsal:

| Run | Date | Bundle path | Clean DB or incremental | CRM files included? | Export min | Upload min | Load min | Result | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 01 | 2026-04-25 | `...` | clean | yes |  |  |  | pass/fail |  |

Notes should capture:

- unexpected warnings
- counts that look wrong
- any operator mismatch
- whether runtime exceeded the 15-minute goal

## Current Known Red Items

These are still outside the current bundle/load flow:

- `public.ProductContent`
- `public.SeasonOverlay` edits after the initial seed
- `app.vendor_overlay`
- `app.sku_attribute_override`
- `app.sku_keyword_override`
- `app.size_type_override`
- non-owner `public.User` / `public.Session`
- custom customer segment definitions
- the final Render-safe verification gate

Do not treat a run as full business cutover proof while those remain red.

## Related

- [render-conversion-day-matrix.md](render-conversion-day-matrix.md)
- [migration-day-runbook.md](migration-day-runbook.md)
