# Render Conversion-Day Matrix

Status: working cutover matrix for the current repo state on 2026-04-25.

This file answers two questions:

1. What gets exported and uploaded for a Render cutover rehearsal?
2. If we delete the whole Render Postgres database, what reloads cleanly today and what is still blocked?

The matrix is intentionally blunt. It records the repo as it exists today, not the target architecture we want later.

## Command Sequence

Use this as the current rehearsal command sequence.

1. Source-side bundle export:

```bash
pnpm --filter @benlow-rics/api cutover:render-export -- --out <bundle-dir> [--customer <Customer.csv> --mail <MailListNames.csv> --ticket-header <ticket_header.csv> --ticket-detail <ticket_detail.csv>]
```

2. Upload `<bundle-dir>` to the transient Render-side storage location used by the load runner.

3. Target-side bundle load:

```bash
pnpm --filter @benlow-rics/api cutover:render-load -- --bundle <bundle-dir>
```

For a hard gate once the red rows below are closed:

```bash
pnpm --filter @benlow-rics/api cutover:render-load -- --bundle <bundle-dir> --strict-full
```

## Bundle Anatomy

The conversion-day "bundle" is one directory that travels from the extract side to the Render side. Today it looks like this:

```text
<bundle-dir>/
  bundle-manifest.json
  legacy/
    manifest.json
    *.csv
  app/
    attribute-catalog-export.json
  crm/
    Customer.csv              # optional
    MailListNames.csv         # optional
    ticket_header.csv         # optional
    ticket_detail.csv         # optional
```

What each file group means:

- `bundle-manifest.json`
  - Top-level index written by `cutover:render-export`.
  - Records when the bundle was made, which scope was extracted, where the legacy/app files live inside the bundle, warnings, and current known blockers.
- `legacy/manifest.json`
  - The canonical artifact-pack manifest written by `extract:rics-artifact`.
  - Lists every included legacy CSV with `targetTable`, `csvFile`, `rowCount`, and the column/type metadata used to build staging temp tables on import.
- `legacy/*.csv`
  - One CSV per canonical legacy table included in the extract scope.
  - These are raw legacy exports from the MDBs. They are not yet app-owned schema rows until the import scripts transform them.
- `app/attribute-catalog-export.json`
  - Snapshot of the app-owned attribute framework.
  - Carries dimensions, values, family rules, and SKU attribute assignments.
- `crm/*.csv`
  - Optional sidecar files. These are not part of the canonical MDB artifact pack.
  - `Customer.csv` and `MailListNames.csv` drive customer import.
  - `ticket_header.csv` and `ticket_detail.csv` drive sales-history import.

What is not in the bundle yet:

- `public.ProductContent`
- `public.SeasonOverlay` edits after the initial seed
- `app.vendor_overlay`
- `app.sku_attribute_override`
- `app.sku_keyword_override`
- `app.size_type_override`
- non-owner `public.User` / `public.Session`
- custom customer segment definitions

## Command Detail

### 1. `cutover:render-export`

```bash
pnpm --filter @benlow-rics/api cutover:render-export -- --out <bundle-dir> [--customer <Customer.csv> --mail <MailListNames.csv> --ticket-header <ticket_header.csv> --ticket-detail <ticket_detail.csv>]
```

What it does:

- Creates `<bundle-dir>/legacy`, `<bundle-dir>/app`, and `<bundle-dir>/crm`.
- Runs `extract:rics-artifact` through `extractRicsArtifact(...)`.
  - Reads the canonical MDB allowlist.
  - Exports one CSV per included legacy table into `legacy/`.
  - Writes `legacy/manifest.json`.
- Runs `export:attributes`.
  - Exports the app-owned attribute framework into `app/attribute-catalog-export.json`.
- Copies optional sidecar CRM CSVs into `crm/` if you supply them.
- Writes `bundle-manifest.json` so the load side has one human-readable index of the bundle.

What this command does not do:

- It does not upload anything to Render.
- It does not transform legacy rows into app-owned schema rows.
- It does not include the red app-native overlays listed above.

### 2. Upload The Bundle

There is no repo command for this step yet. This is just "move the whole `<bundle-dir>` to the transient location the Render-side runner can read."

Operationally this means:

- preserve the directory structure exactly
- upload `bundle-manifest.json`
- upload the full `legacy/` folder
- upload the full `app/` folder
- upload `crm/` only if those sidecar files are part of the rehearsal

### 3. `cutover:render-load`

```bash
pnpm --filter @benlow-rics/api cutover:render-load -- --bundle <bundle-dir>
```

What it does, in order:

1. `prisma migrate deploy`
   - Makes sure `public`, `app`, and `platform` schema objects exist before any data load starts.
2. `import:attributes`
   - Loads `app/attribute-catalog-export.json` into the app-owned attribute tables.
3. `seed:taxonomy-from-mirror -- --manifest <legacy-manifest>`
   - Reads canonical taxonomy CSVs from `legacy/manifest.json`, stages them into temp tables, and fills `app.taxonomy_*`.
4. `seed:product-families`
   - Loads repo seed CSVs for product families and category-to-family mappings.
5. `import:app-skus-from-artifact`
   - Stages `inventory_master.csv` and rebuilds `app.sku` and `app.sku_activity`.
6. `seed:sku-attributes -- --manifest <legacy-manifest>`
   - Re-derives keyword-seeded SKU attributes from staged `inventory_master.csv` plus repo keyword rules.
7. `import:app-reference-baselines-from-artifact`
   - Stages the legacy vendor/store/UPC/case-pack/future-price/purchasing/ASN/transfer CSVs and rebuilds the corresponding `app.*` reference tables.
8. `import:app-replenishment-targets-from-artifact`
   - Stages `inventory_quantities.csv` and `size_types.csv`, then rebuilds `app.replenishment_target`.
9. `seed:segmentation-defaults`
   - Loads the default customer segments unless you skip them.
10. `import:app-stock-from-artifact`
   - Stages `inv_changes.csv`, `inventory_quantities.csv`, and `size_types.csv`, then rebuilds `app.stock_movement` and `app.stock_level`.
11. `import:app-inventory-history-from-artifact`
   - Stages `inv_his.csv`, then rebuilds the inventory-history aggregate tables.
12. `import:customers`
   - Only runs if `crm/Customer.csv` and `crm/MailListNames.csv` are present.
13. `import:customer-transactions:rics`
   - Only runs if `crm/ticket_header.csv` and `crm/ticket_detail.csv` are present.

Useful flags on the load command:

- `--skip-inventory-history`
  - Speeds up a rehearsal when you only want baseline + stock, not history aggregates.
- `--skip-customers`
  - Skips customer master import even if `crm/Customer.csv` and `crm/MailListNames.csv` exist.
- `--skip-customer-transactions`
  - Skips ticket-history import even if `crm/ticket_header.csv` and `crm/ticket_detail.csv` exist.
- `--skip-segmentation-defaults`
  - Leaves the default customer segment seed alone.
- `--inventory-history-as-of <YYYY-MM-DD>`
  - Overrides the snapshot date used by `import:app-inventory-history-from-artifact`.
- `--strict-full`
  - Fails on purpose while any known red blocker remains.

## Detailed Data Movement

This is the practical "from what file/table to what table" map for the current cutover path.

| Bundle input / source | Staging / transform step | Data moved into |
|---|---|---|
| `app/attribute-catalog-export.json` | `import:attributes` upserts the JSON snapshot | `app.attribute_dimension`, `app.attribute_value`, `app.attribute_family_rule`, `app.sku_attribute_assignment` |
| `legacy/departments.csv` | `seed:taxonomy-from-mirror --manifest` stages `departments` | `app.taxonomy_department` |
| `legacy/categories.csv` | `seed:taxonomy-from-mirror --manifest` stages `categories` | `app.taxonomy_category` |
| `legacy/group_codes.csv` | `seed:taxonomy-from-mirror --manifest` stages `group_codes` | `app.taxonomy_group` |
| `legacy/keywords.csv` | `seed:taxonomy-from-mirror --manifest` stages `keywords` | `app.taxonomy_keyword` |
| `legacy/sectors.csv` | `seed:taxonomy-from-mirror --manifest` stages `sectors` | `app.taxonomy_sector` |
| `legacy/return_codes.csv` | `seed:taxonomy-from-mirror --manifest` stages `return_codes` | `app.taxonomy_return_code` |
| `legacy/marketing_code.csv` | `seed:taxonomy-from-mirror --manifest` stages `marketing_code` | `app.taxonomy_promotion_code` |
| `legacy/size_types.csv` | `seed:taxonomy-from-mirror --manifest` stages `size_types`; columns/rows are packed into arrays | `app.taxonomy_size_type` |
| Repo seed CSVs `apps/api/seeds/product_families/families.csv` and `category_mapping.csv` | `seed:product-families` upserts family catalog and category mappings against `app.taxonomy_category` coverage | `app.product_family`, `app.category_product_family` |
| `legacy/inventory_master.csv` | `import:app-skus-from-artifact` stages `inventory_master`; the backfill maps RICS SKU fields into app-owned SKU fields, joins `app.category_product_family` for family assignment, and writes lifecycle audit rows | `app.sku`, `app.sku_activity` |
| `legacy/inventory_master.csv` + repo keyword rules `apps/api/seeds/sku_extended_attributes/keyword_rules.csv` | `seed:sku-attributes --manifest` tokenizes `inventory_master.key_words` and applies repo rules | `app.sku_attribute_assignment` rows tagged `seed:keyword:*` |
| `legacy/vendor_master.csv` | `import:app-reference-baselines-from-artifact` stages vendor master rows | `app.vendor` |
| `legacy/vendor_accounts.csv` | same reference-baseline import, joined to staged vendor codes | `app.vendor_store_account` |
| `legacy/store_master.csv` | same reference-baseline import | `app.store_master` |
| `legacy/upc_cross_reference.csv` | same reference-baseline import, joined to `app.sku` for `sku_id` when possible | `app.sku_upc` |
| `legacy/case_packs.csv` | same reference-baseline import | `app.case_pack` |
| `legacy/case_pack_qtys.csv` + `app.case_pack` + `app.taxonomy_size_type` | same reference-baseline import expands segmented case-pack quantities into normalized cells | `app.case_pack_cell` |
| `legacy/future_price_changes.csv` | same reference-baseline import, joined to `app.sku` for `sku_id` when possible | `app.future_price_change` |
| `legacy/purchase_master.csv` | same reference-baseline import | `app.purchase_order_legacy` |
| `legacy/purchase_detail.csv` | same reference-baseline import, joined to `app.purchase_order_legacy` and `app.sku` when possible | `app.purchase_order_legacy_line` |
| `legacy/asn_carton_head.csv` | same reference-baseline import | `app.asn_carton_legacy` |
| `legacy/asn_carton_det.csv` | same reference-baseline import, joined to `app.asn_carton_legacy` | `app.asn_carton_legacy_line` |
| `legacy/inv_transfers.csv` | same reference-baseline import | `app.transfer_legacy_summary` |
| `legacy/inventory_quantities.csv` + `legacy/size_types.csv` + `app.sku` | `import:app-replenishment-targets-from-artifact` expands segmented size-grid quantities into normalized rows | `app.replenishment_target` |
| `legacy/inv_changes.csv` + `app.sku` | `import:app-stock-from-artifact` stages `inv_changes` and converts change codes like `TIN`, `TOU`, `POR`, `RET`, `PHY`, `REC` into the movement ledger | `app.stock_movement` |
| `legacy/inventory_quantities.csv` + `legacy/size_types.csv` + `app.sku` | `import:app-stock-from-artifact` normalizes the inventory grid into current per-store/per-SKU/per-cell stock rows and inquiry sales cells | `app.stock_level`, `app.inventory_sales_cell` |
| `legacy/inv_his.csv` + `app.sku` | `import:app-inventory-history-from-artifact` stages `inv_his` and rebuilds the history aggregates | `app.inventory_history_snapshot`, `app.inventory_history_month`, `app.inventory_history_trend_week`, `app.inventory_history_movement_bucket` |
| `crm/Customer.csv` + `crm/MailListNames.csv` | `import:customers` parses both files, matches by legacy account/code, and creates or updates customer identities, contacts, addresses, legacy profile, financial profile, and legacy sales summary | `app.customer`, `app.customer_identity`, `app.customer_contact`, `app.customer_address`, `app.customer_legacy_profile`, `app.customer_financial_profile`, `app.customer_sales_summary_legacy`, plus `app.customer_import_batch` / `app.customer_import_reject` audit rows |
| `crm/ticket_header.csv` + `crm/ticket_detail.csv` | `import:customer-transactions:rics` stages both ticket CSVs, builds ticket facts/lines, links to `app.customer` and `app.sku` when possible, then refreshes customer KPI tables unless `--skip-metrics` is used | `app.sales_history_ticket`, `app.sales_history_ticket_line`, then derived refreshes of `app.customer_metrics`, `app.customer_features_current`, `app.customer_category_features`, `app.customer_brand_features`, `app.customer_size_profiles` |

## Status Legend

- `GREEN`: current script/path is Render-safe and repeatable now.
- `YELLOW`: current script/path works only for incremental loads or partial rehearsals.
- `RED`: current full-reset path is blocked; do not assume Render DB delete + reload works for this row.

## Matrix

| Artifact | Source | Type | When | Script / command | Target table(s) | Render DB delete safe? | Status | Owner | Blocked by / notes |
|---|---|---|---|---|---|---|---|---|---|
| Canonical RICS artifact pack (`legacy/*.csv` + `legacy/manifest.json`) | Canonical MDB allowlist in `apps/api/src/services/sync/canonicalRicsTables.ts` | RICS export | T-0 upload | `cutover:render-export` -> `extract:rics-artifact -- --scope all-canonical` | Upload bundle only | Yes | GREEN | Platform / ETL | This is the full canonical extract list. It does not mean every table already has a Render-safe loader. |
| Attribute catalog snapshot (`app/attribute-catalog-export.json`) | Current Postgres app data | App-native preload or T-0 upload | Preload or T-0 upload | `cutover:render-export` -> `export:attributes` | `app.attribute_dimension`, `app.attribute_value`, `app.attribute_family_rule`, `app.sku_attribute_assignment` | Yes | GREEN | Products | This is the only clearly portable app-native artifact in the repo today. |
| Customer master CSVs (`crm/Customer.csv`, `crm/MailListNames.csv`) | Legacy CSV export path, separate from canonical MDB artifact pack | RICS export | T-0 upload | Optional inputs to `cutover:render-export`; loaded by `import:customers` | `app.customer`, `app.customer_identity`, `app.customer_contact`, `app.customer_address`, `app.customer_legacy_profile`, `app.customer_financial_profile`, `app.customer_sales_summary_legacy`, import audit rows | Yes | GREEN | CRM / Customer Intelligence | These files are not part of `extract:rics-artifact`; they must be exported separately and supplied to the bundle. |
| Customer transaction CSVs (`crm/ticket_header.csv`, `crm/ticket_detail.csv`) | Legacy CSV export path, separate from canonical MDB artifact pack | RICS export | T-0 upload | Optional inputs to `cutover:render-export`; loaded by `import:customer-transactions:rics` | `app.sales_history_ticket`, `app.sales_history_ticket_line`, downstream customer KPI refresh tables | Yes | GREEN | CRM / Customer Intelligence | These files are also outside the canonical artifact pack and must be exported separately if customer-history cutover is in scope. |
| Schema deploy | Repo migrations | Preload | Before load | `cutover:render-load` -> `pnpm exec prisma migrate deploy` | `public`, `app`, `platform` schemas | Yes | GREEN | Platform | Required before any bundle load. |
| Attribute import | Attribute snapshot JSON | App-native preload or T-0 upload | After migrate | `cutover:render-load` -> `import:attributes` | `app.attribute_*`, `app.sku_attribute_assignment` | Yes | GREEN | Products | Repeatable and Render-safe now. |
| Default customer segments | Repo seed | App-native preload | After migrate | `cutover:render-load` -> `seed:segmentation-defaults` | `app.customer_segment*` defaults | Yes | GREEN | CRM / Customer Intelligence | Seeds defaults only. User-authored segment definitions still have no bundle export/import path. |
| Customer master import | `Customer.csv` + `MailListNames.csv` | RICS export | T-0 upload | `cutover:render-load` -> `import:customers` | `app.customer`, `app.customer_identity`, `app.customer_contact`, `app.customer_address`, `app.customer_legacy_profile`, `app.customer_financial_profile`, `app.customer_sales_summary_legacy`, import audit rows | Yes | GREEN | CRM / Customer Intelligence | Runs only when both CSVs are present in the bundle. |
| Customer transaction import | `ticket_header.csv` + `ticket_detail.csv` | RICS export | T-0 upload | `cutover:render-load` -> `import:customer-transactions:rics` | `app.sales_history_ticket`, `app.sales_history_ticket_line`, downstream customer KPI refresh tables | Yes | GREEN | CRM / Customer Intelligence | Runs only when both ticket CSVs are present in the bundle. |
| Stock + stock-movement import from artifact | `inv_changes.csv`, `inventory_quantities.csv`, `size_types.csv` in legacy bundle | RICS upload | T-0 upload | `cutover:render-load` -> `import:app-stock-from-artifact` | `app.stock_level`, `app.inventory_sales_cell`, `app.stock_movement` | Yes | GREEN | Inventory | Depends on the preceding SKU artifact import in the same wrapper, which now runs on clean Render resets. |
| Inventory history import from artifact | `inv_his.csv` in legacy bundle | RICS upload | T-0 upload | `cutover:render-load` -> `import:app-inventory-history-from-artifact` | `app.inventory_history_snapshot`, `app.inventory_history_month`, `app.inventory_history_trend_week`, `app.inventory_history_movement_bucket` | Yes | GREEN | Inventory / Sales Reporting | Now runs after the SKU artifact import in the same wrapper. |
| SKU baseline load | `inventory_master.csv` | RICS upload | T-0 upload | `cutover:render-load` -> `import:app-skus-from-artifact` | `app.sku` | Yes | GREEN | Products | New artifact-native loader stages `inventory_master.csv` into a temp table and reuses the existing SKU backfill logic with no `rics_mirror` dependency. |
| Reference baseline load | `vendor_master.csv`, `vendor_accounts.csv`, `store_master.csv`, `upc_cross_reference.csv`, `case_packs.csv`, `case_pack_qtys.csv`, `future_price_changes.csv`, `purchase_master.csv`, `purchase_detail.csv`, `asn_carton_head.csv`, `asn_carton_det.csv`, `inv_transfers.csv` | RICS upload | T-0 upload | `cutover:render-load` -> `import:app-reference-baselines-from-artifact` | `app.vendor`, `app.vendor_store_account`, `app.store_master`, `app.sku_upc`, `app.case_pack`, `app.case_pack_cell`, `app.future_price_change`, `app.purchase_order_legacy*`, `app.asn_carton_legacy*`, `app.transfer_legacy_summary` | Yes | GREEN | Products / Inventory / Purchasing / Store Ops | New artifact-native loader stages the required CSVs and reuses the existing reference backfill logic against temp tables. |
| Replenishment target load | `inventory_quantities.csv` | RICS upload | T-0 upload | `cutover:render-load` -> `import:app-replenishment-targets-from-artifact` | `app.replenishment_target` | Yes | GREEN | Inventory | New artifact-native loader stages `inventory_quantities.csv` + `size_types.csv` and rebuilds `app.replenishment_target` without `rics_mirror`. |
| Taxonomy baseline load | Legacy category / department / group / keyword / sector / return-code / promotion-code / size-type data | Preload | Preload | `cutover:render-load` -> `seed:taxonomy-from-mirror -- --manifest <legacy-manifest>` | `app.taxonomy_*` | Yes | GREEN | Store Ops / Products | The taxonomy seed now accepts the artifact manifest and stages the canonical taxonomy CSVs into temp tables before loading `app.taxonomy_*`. |
| Product-family mapping seed | Repo CSV seeds (`apps/api/seeds/product_families/*.csv`) | App-native preload | Preload | `cutover:render-load` -> `seed:product-families` | `app.product_family`, `app.category_product_family` | Yes | GREEN | Products | Still uses repo seeds, but the coverage check now reads `app.taxonomy_category` instead of the mirror-era orphan view, so it is Render-safe after taxonomy load. |
| Keyword-derived attribute seed | `inventory_master.key_words` + repo rules CSV | App-native preload | Preload after SKU load | `cutover:render-load` -> `seed:sku-attributes -- --manifest <legacy-manifest>` | `app.sku_attribute_assignment` (`seed:keyword:*`) | Yes | GREEN | Products | The seed now accepts the artifact manifest and stages `inventory_master.csv` before keyword derivation, so it no longer requires `rics_mirror`. |
| Owner bootstrap | Environment variables on API startup | Preload | On first API start | Automatic `bootstrapOwner()` during API startup | `public.Role`, `public.User` (initial owner only) | Partial | YELLOW | Employees / Platform | Good for first owner + roles. Not a migration path for additional users. |
| Product content overlay | Current Postgres data | App-native preload or T-0 upload | Needs explicit export/import | No current script | `public.ProductContent` | No | RED | Products / Storefront | No bundle export/import exists yet. Deleting the Render DB loses web content overlay rows. |
| Season overlay edits | Current Postgres data | App-native preload or T-0 upload | Needs explicit export/import | No current script | `public.SeasonOverlay` | No | RED | Products / Store Ops | Initial season seed lives in a migration, but later operator edits have no export/import artifact. |
| Vendor overlay | Current Postgres data | App-native preload or T-0 upload | Needs explicit export/import | No current script | `app.vendor_overlay` | No | RED | Products | Overlay survives incremental loads only. Full DB delete loses it. |
| SKU override tables | Current Postgres data | App-native preload or T-0 upload | Needs explicit export/import | No current script | `app.sku_attribute_override`, `app.sku_keyword_override`, `app.size_type_override` | No | RED | Utilities / Products | No bundle export/import exists yet. |
| Additional users and sessions | Current Postgres data | App-native preload or T-0 upload | Needs explicit export/import | No current script | `public.User`, `public.Session` beyond bootstrap owner | No | RED | Employees / Platform | Only OWNER bootstrap exists today. |
| Custom segment definitions | Current Postgres data | App-native preload or T-0 upload | Needs explicit export/import | No current script | User-authored `app.customer_segment*` rows | No | RED | CRM / Customer Intelligence | `seed:segmentation-defaults` covers defaults only. |
| Render cutover gate | Live Postgres state | Verification | After load | `verify:cutover-readiness` | Audit only | No | RED | Platform | Current verification still requires `rics_mirror`; it is not the right Render cutover gate yet. |

## What This Means Right Now

The current repo can now rehearse the core legacy cutover path end-to-end with the 3-command sequence above:

- canonical RICS extract bundle
- attribute snapshot export/import
- taxonomy baseline load
- product-family mapping seed
- SKU baseline load
- keyword-derived attribute seed
- reference baseline load
- replenishment target load
- customer master import
- customer transaction import
- stock and inventory-history imports
- default customer segments

If you delete the entire Render Postgres database first, the current repo is much closer to a clean rebuild. The blocking rows are now:

- several app-native overlays and user-managed surfaces have no export/import artifact at all
- the final Render cutover verification gate is still mirror-era

## Recommendation

Use `cutover:render-load` as the main 10-run rehearsal command now. Treat `--strict-full` as the future hard gate for the true delete-and-rebuild path once the remaining red rows are closed.

When the next loaders land, update this file first, then promote the row from `RED` to `YELLOW` or `GREEN`.

## Related

- [render-conversion-operator-runbook.md](render-conversion-operator-runbook.md)
- [migration-day-runbook.md](migration-day-runbook.md)
