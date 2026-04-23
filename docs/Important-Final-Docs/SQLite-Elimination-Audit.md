# SQLite Elimination Audit

Every reference to the legacy SQLite admin databases, tagged for removal. Deletion is staged — some code paths are load-bearing today and must be migrated before their tables can be dropped. This doc is the single reference during the dismantle.

**Status at time of audit (2026-04-23):** SQLite is actively in use. `inventory.db` holds ~2 MB of live data; ~22 service files read/write it on every request. **Do not delete the DB files yet.** Follow the staged plan in §7.

---

## 1. Scope + File Locations

Two SQLite databases live under `apps/api/data/`:

| File | Size | Init code | Purpose |
|---|---|---|---|
| `apps/api/data/inventory.db` (+ `.db-shm`, `.db-wal`) | 2.0 MB / 4.0 MB WAL | [apps/api/src/db/database.ts](../../apps/api/src/db/database.ts) | Warehouse / admin DB — 81 tables |
| `apps/api/data/pos.db` (+ WAL/SHM) | not yet created | [apps/api/src/db/posDatabase.ts](../../apps/api/src/db/posDatabase.ts) | POS-local DB — 15 tables (register, shift, ticket, etc.) |

Tests use `:memory:` SQLite (triggered by `NODE_ENV === 'test'`). In-memory tests are not blocked by file deletion.

**Node driver**: `DatabaseSync` from Node 20's built-in `node:sqlite` (no external `better-sqlite3` dependency). Enabled via `--experimental-sqlite` / `NODE_OPTIONS=--experimental-sqlite` in package.json scripts.

---

## 2. `inventory.db` Table Inventory

81 tables grouped by functional area. **Migration status** is the best-known state today; unstated rows need verification before dropping.

### 2.1 Vendor master
| Table | Migration status |
|---|---|
| `vendors` | Superseded by `rics_mirror.vendors` + `app.sku.vendor_id`. Legacy writers still use SQLite version. **Migrate then drop.** |

### 2.2 Reference-lookup tables (17 total)
These feed the legacy SKU-form dropdowns.

| Table | Status |
|---|---|
| `ref_colors` | **Migrated** → `app.attribute_value` dim `color` (via JSON import) |
| `ref_width_types` | **Migrated** → dim `width_type` |
| `ref_patterns` | **Migrated** → dim `pattern` |
| `ref_finishes` | **Migrated** → dim `finish` |
| `ref_accessories` | **Migrated** → dim `accessory` |
| `ref_heel_heights` | **Migrated** → dim `heel_height` |
| `ref_heel_shapes` | **Migrated** → dim `heel_shape` |
| `ref_toe_shapes` | **Migrated** → dim `toe_shape` |
| `ref_upper_materials` | **Migrated** → dim `upper_material` |
| `ref_outsole_materials` | **Migrated** → dim `outsole_material` |
| `ref_heel_materials` | **Migrated** → dim `heel_material` |
| `ref_color_families` | **Not migrated.** Decide: retire (merge away) or add `color_family` dim to Postgres. |
| `ref_shoe_types` | Not migrated. Superseded by product families in Postgres. Likely retire. |
| `ref_closure_types` | Not migrated. Superseded by family/attribute. Likely retire. |
| `ref_occasions` | Not migrated. Retire. |
| `ref_target_audiences` | Not migrated — gender. Either add `gender` column on `app.sku` or a dim. Decide. |
| `ref_seasons` | Superseded by `rics_mirror.seasons` + `app.season_overlay`. Retire. |
| `ref_size_types` | Superseded by `rics_mirror.size_types`. Retire. |
| `ref_size_labels` | Superseded by RICS size-type matrix. Retire. |
| `ref_label_types` | Single-char `LabelCode` on `InventoryMaster`. Retire. |
| `ref_categories` | Superseded by `rics_mirror.categories` + `app.category_product_family`. Retire. |
| `ref_brands` | Not migrated. Decide: add `app.brand` table or fold into vendor. |
| `ref_heel_types`, `ref_heel_material_types` | Canonical code-based variants of the above. Retire after `heel_material` migration closes the gap. |
| `ref_departments` | Superseded by `rics_mirror.departments`. Retire. |

### 2.3 Product catalog (shadow of RICS + net-new)
| Table | Status |
|---|---|
| `skus` | **Partially migrated** to `app.sku`. Legacy SKU form still writes here. |
| `sku_sizes` | Variant expansion. Not migrated. Design decision pending: size-matrix in `app.sku` directly or a separate `app.sku_variant` table. |
| `sku_code_seq` | Sequence generator for SKU codes. Trivial to port to a Postgres sequence. |
| `style_colors`, `sku_style_colors` | StyleColor canonical catalog. Not migrated. |
| `womens_shoe_categories` | Legacy product-family-ish view. Superseded by `app.product_family`. Retire. |

### 2.4 Inventory
| Table | Status |
|---|---|
| `inventory` | Quantities per SKU × store. **Not migrated.** Needs a Postgres home (`app.inventory` or similar). |
| `inventory_audit_log` | Qty change log. Not migrated. |
| `inventory_locations` | Per-store location tagging. Not migrated. |
| `inventory_adjustments`, `inventory_adjustment_lines` | Manual qty adjustments. Not migrated. |

### 2.5 Purchase orders
| Table | Status |
|---|---|
| `purchase_orders`, `purchase_order_lines`, `po_status_history` | Not migrated. |
| `po_receipts`, `po_receipt_lines` | Not migrated. |
| `transfer_orders`, `transfer_order_lines` | Inter-store transfers. Not migrated. |

### 2.6 Sales + POS history
| Table | Status |
|---|---|
| `sales_transactions` | Warehouse-side sales log. Not migrated. |
| All `pos_*` tables listed in `inventory.db` | Duplicated in `pos.db` too. These entries in `inventory.db` look historical (migration accretion); verify they're not still written to. |

### 2.7 Customers + financial arrangements
| Table | Status |
|---|---|
| `customers`, `customer_family_members` | Not migrated. |
| `mail_list_settings`, `customer_transaction_settings` | Not migrated. |
| `special_orders`, `special_order_lines`, `special_order_deposits` | Not migrated. |
| `layaways`, `layaway_lines`, `layaway_payments` | Not migrated. |
| `gift_certificates`, `gift_certificate_transactions` | Not migrated. |
| `house_charge_transactions` | Not migrated. |

### 2.8 OTB (Open-To-Buy) planning
| Table | Status |
|---|---|
| `otb_budgets`, `otb_budget_audit` | Not migrated. |
| `otb_commitments` | Not migrated. |
| `otb_policy_audit_log` | Not migrated. |
| `otb_sku_plan_lines` | Not migrated. |
| `otb_monthly_department_sku_plan` | Not migrated. |
| `otb_plan_rows`, `otb_plan_row_audit` | Not migrated. |

### 2.9 Physical inventory (count)
| Table | Status |
|---|---|
| `count_sessions`, `count_session_snapshots`, `count_session_snapshot_cells` | Not migrated. |
| `count_batches`, `count_entries`, `count_variances`, `count_review_acks` | Not migrated. |
| `worksheet_exports`, `company_physical_inventory_settings` | Not migrated. |

### 2.10 RICS import scaffolding (early Phase A — probably retirable)
| Table | Status |
|---|---|
| `rics_import_batches`, `rics_import_files`, `rics_import_rows`, `rics_import_quarantine`, `rics_import_apply_log` | **Obsolete.** Replaced by the `sync:rics` ETL (records in `platform.etl_run*`). Safe to retire after one sprint of non-use. |

### 2.11 Admin / meta
| Table | Status |
|---|---|
| `schema_migrations`, `schema_table_comments` | SQLite's own migration tracker. Remove with the DB. |
| `company_settings` | Misc global config. Not migrated. Small — merge into a Postgres `app.settings` key-value table. |

---

## 3. `pos.db` Table Inventory (15 tables)

Defined in [posDatabase.ts](../../apps/api/src/db/posDatabase.ts). All of it is POS-local state for the cash-register workflow; none is migrated.

- `pos_stores`, `pos_registers`, `pos_tender_types`, `pos_payout_categories`
- `pos_shifts`, `pos_sales_tickets`, `pos_sales_ticket_lines`, `pos_sales_ticket_tenders`, `pos_sales_ticket_taxes`
- `pos_ticket_audit_events`, `pos_payouts`, `pos_drawer_tender_counts`
- `pos_receipt_templates`, `pos_sales_passwords`, `pos_store_sales_options`
- `schema_migrations` (POS-side tracker)

**Migration status: design-pending.** POS state has a different operational character (register-local, offline-tolerant) — may justify staying as SQLite on the POS machine even post-cutover. Separate decision from the admin-DB elimination.

---

## 4. Code Surface — Every Consumer of SQLite

### 4.1 DB init + pool
| File | Role |
|---|---|
| [apps/api/src/db/database.ts](../../apps/api/src/db/database.ts) | **Primary SQLite init.** 3,409 lines — schema DDL + in-code migrations + seed data. Delete **last**. |
| [apps/api/src/db/posDatabase.ts](../../apps/api/src/db/posDatabase.ts) | POS SQLite init. 374 lines. Delete when POS moves (or keep if POS stays SQLite). |
| [apps/api/src/db/prisma.ts](../../apps/api/src/db/prisma.ts) | Postgres client. **Keep.** |

### 4.2 Services that `import { getDb } from '../db/database'`
22 files. Each needs its SQLite reads/writes replaced with Postgres equivalents before the DB can go.

```
apps/api/src/contracts/purchasingContract.ts
apps/api/src/routes/reportRoutes.ts
apps/api/src/services/adjustmentService.ts
apps/api/src/services/companySettingsService.ts
apps/api/src/services/customerService.ts
apps/api/src/services/customerTransactionsService.ts
apps/api/src/services/dashboardService.ts
apps/api/src/services/inventoryService.ts
apps/api/src/services/otbBudgetService.ts
apps/api/src/services/otbLinesService.ts
apps/api/src/services/otbMonthlyPlanService.ts
apps/api/src/services/otbPlanRowService.ts
apps/api/src/services/otbPolicyAuditService.ts
apps/api/src/services/physicalInventoryService.ts
apps/api/src/services/publicProductService.ts
apps/api/src/services/purchaseOrderService.ts
apps/api/src/services/reportService.ts
apps/api/src/services/salesLedgerService.ts
apps/api/src/services/shiftService.ts
apps/api/src/services/skuService.ts
apps/api/src/services/ticketService.ts
apps/api/src/services/vendorService.ts
```

### 4.3 Services that `import { getPosDb }`
7 files — POS-specific; see §3 for the decision gate.

```
apps/api/src/db/posDatabase.ts
apps/api/src/services/payoutService.ts
apps/api/src/services/posReportService.ts
apps/api/src/services/registerService.ts
apps/api/src/services/salesPasswordService.ts
apps/api/src/services/shiftService.ts      (dual: touches both DBs)
apps/api/src/services/ticketService.ts     (dual: touches both DBs)
```

### 4.4 Services that indirectly consume SQLite (found via grep on `DatabaseSync|getDb|from.*db/database`)
Six more files not in 4.2/4.3 but appear in the pattern:
- `apps/api/src/services/salesReporting/salesReportFacade.ts`
- `apps/api/src/services/ricsProductAdapter.ts`
- `apps/api/src/services/salesLedgerService.ts`
- `apps/api/src/services/publicProductService.ts`

Each needs inspection to confirm whether its SQLite use is load-bearing or a stale import.

### 4.5 Tests
33 test files under `apps/api/tests/` touch SQLite. All use `:memory:` via `NODE_ENV === 'test'`, so **they don't depend on the on-disk files** — but they do depend on `database.ts` / `posDatabase.ts` continuing to exist and run `initSchema()`. When the init code is deleted, every failing test has to migrate to Postgres test-DB fixtures first.

### 4.6 Seed scripts that write to SQLite
- [apps/api/scripts/seed.ts](../../apps/api/scripts/seed.ts) — synthetic shoe-store data. Retire.
- [apps/api/seed.js](../../apps/api/seed.js) — older root-level seed. Retire.

### 4.7 HTTP endpoints backed by SQLite
Every route that imports one of the §4.2/4.3 services inherits the SQLite dependency. Notably:

- `/api/v1/skus/*` (legacy SKU list, form, reference-data) → deprecated per [skuRoutes.ts:1–20](../../apps/api/src/routes/skuRoutes.ts#L1) but still mounted
- `/api/v1/customers/*`, `/api/v1/customer-transactions/*`
- `/api/v1/purchase-orders/*`, `/api/v1/po-receipts/*`, `/api/v1/transfers/*`
- `/api/v1/otb/*`
- `/api/v1/physical-inventory/*` (count sessions, batches)
- `/api/v1/reports/*`
- `/api/v1/dashboard/*`
- POS: `/api/v1/pos/*` (shifts, tickets, payouts, registers, sales-passwords)

### 4.8 Docs that mention SQLite
14 files — mostly design specs and plans. Update or archive each alongside the code cutover:

```
docs/Important-Final-Docs/Migration-Steps-From-Scratch.md  (already updated)
docs/operations/sku-lifecycle-gate.md
docs/modules/platform/plan.md
docs/modules/otb-planning/rics-module-specs.md
docs/modules/sales-pos/rics-module-specs.md
docs/dev/milestones/2026-04-21-phase-a-request-cutover.md
docs/dev/milestones/2026-04-21-rics-mirror-live.md
docs/dev/handoffs/2026-04-20-dev-drive-migration-and-postgres-prep.md
docs/dev/specs/2026-04-18-sales-history-by-month-design.md
docs/dev/specs/2026-04-18-products-phase1-design.md
docs/dev/specs/2026-04-19-otb-plan-entry-design.md
docs/dev/specs/2026-04-19-inventory-inquiry.md
docs/dev/specs/2026-04-19-physical-inventory-p1a-slice3-design.md
docs/dev/plans/2026-04-19-otb-plan-entry.md
```

---

## 5. `package.json` References

`apps/api/package.json` scripts use `NODE_OPTIONS=--experimental-sqlite` (required for the built-in `node:sqlite` module):

- `dev` — starts the API with the SQLite flag
- `start` — production start with the flag
- `seed` — legacy SQLite seed
- `test` — test runner with the flag

Each of those flags comes out the same day the last service migrates off SQLite.

---

## 6. Migration Status Rollup

| Functional area | Tables | Status | Priority |
|---|---|---|---|
| Reference dropdowns (11 of 17) | ref_colors, ref_heel_*, ref_upper_*, etc. | **Done** — flows through `import:attributes` | — |
| Reference dropdowns (remaining 6) | ref_color_families, ref_shoe_types, ref_closure_types, ref_occasions, ref_target_audiences, ref_brands | Design pending | low |
| Vendor master | `vendors` | Legacy write path only; RICS path works | medium |
| SKU catalog | `skus`, `sku_sizes`, `sku_code_seq`, `style_colors` | `app.sku` partially covers | medium |
| Inventory quantities | `inventory`, `inventory_audit_log`, `inventory_locations`, `inventory_adjustments*` | Not migrated | **high** |
| Purchase orders + transfers | `purchase_orders*`, `po_receipts*`, `transfer_orders*` | Not migrated | high |
| Sales history | `sales_transactions` | Not migrated | high |
| OTB planning | 8 `otb_*` tables | Not migrated | high |
| Physical inventory | 8 `count_*` tables + 1 settings | Not migrated | medium |
| Customers + arrangements | 10 tables | Not migrated | high |
| POS (`pos.db`) | 15 tables | Design pending — may stay SQLite | gate decision |
| RICS import scaffolding | 5 `rics_import_*` tables | **Obsolete** — replaced by `sync:rics` | **remove first** |
| Company settings | `company_settings` | Trivial — small row count | easy win |
| Legacy admin (`womens_shoe_categories`, etc.) | 1 | Retire | easy win |

---

## 7. Staged Elimination Plan

Ordered so each stage is independently shippable and the API keeps running between stages.

### Stage 0 — Audit frozen (this doc)
No code changes. Treat this file as the living reference.

### Stage 1 — Easy-win deletions (no migration required)
Things that are already dead weight. Per table: drop from `initSchema()` in `database.ts`, remove any remaining consumers, delete on-disk indexes.

- `rics_import_*` (5 tables) — obsoleted by `sync:rics`
- `womens_shoe_categories`, `ref_seasons`, `ref_size_types`, `ref_size_labels`, `ref_label_types`, `ref_categories`, `ref_departments`, `ref_heel_types`, `ref_heel_material_types` — superseded by `rics_mirror` / Postgres `app.*`
- Legacy root seed scripts (`apps/api/scripts/seed.ts`, `apps/api/seed.js`)

Effort: ~1–2 days. Risk: low.

### Stage 2 — Company settings (trivial write-path move)
Move `company_settings` to a Postgres key-value table.

Effort: ~½ day. Risk: low.

### Stage 3 — Vendor + SKU write-path consolidation
The legacy `skus` / `vendors` / `sku_sizes` / `style_colors` tables still get written by the deprecated SKU form. Cut those writers to `app.sku` (or reject the request with a redirect to the new form). Then drop the legacy tables.

Effort: 1–2 sprints. Risk: medium — touches the SKU form which is still used.

### Stage 4 — Inventory quantities + audit
High-stakes. Needs a Postgres home (`app.inventory_quantities` + audit log) and migration of every service in §4.2 that reads/writes it.

Effort: multiple sprints. Risk: **high** — inventory quantities is the live warehouse state.

### Stage 5 — PO + transfers + physical inventory + OTB
Parallel workstreams. Each module gets its own Postgres schema or sub-schema (`app.purchasing`, `app.otb`, `app.physical_inventory`).

Effort: large. Risk: medium-high per module.

### Stage 6 — Customers + financial arrangements
Customers, layaways, special orders, gift certificates, house charges. Distinct module.

Effort: large. Risk: medium.

### Stage 7 — POS decision gate
Either migrate `pos.db` to Postgres (requires POS endpoint rework) or keep it as an intentional register-local store. Document the decision.

### Stage 8 — Final cutover
- Remove `database.ts` + `posDatabase.ts` (unless kept for POS)
- Delete the on-disk `apps/api/data/*.db*` files
- Remove `NODE_OPTIONS=--experimental-sqlite` from `package.json`
- Remove the experimental-sqlite flag from CLAUDE.md + all migration/handoff docs
- Archive the 14 design docs in §4.8 that describe the SQLite era

---

## 8. Risks & Rollback

**Deleting the DB files today** (`apps/api/data/*.db*`) without completing stages 1–7:
- Every API route that invokes a §4.2/4.3 service will throw on next request — schema is re-created empty, but row data (vendors, inventory quantities, POs, etc.) is gone.
- Tests will continue to pass (they use `:memory:`), masking the prod breakage.
- Recovery: restore from file backup; no Postgres fallback exists for most tables.

**Rollback for each stage:** keep the SQLite init code for the retired tables in a separate commit so you can `git revert` cleanly. Don't delete init lines in the same commit that migrates the data — split into two commits so rollback is atomic.

**Backup discipline before each stage's deletions:**
```bash
# Snapshot the SQLite files before any destructive stage
cp apps/api/data/inventory.db apps/api/data/inventory.db.before-stage-X.bak
cp apps/api/data/pos.db apps/api/data/pos.db.before-stage-X.bak  # if present
```

Keep `.bak` files out of git (add to `.gitignore` if not already).

---

## 9. What NOT to delete right now

Strictly off-limits without a migration PR first:

- The `apps/api/data/*.db*` files themselves
- `apps/api/src/db/database.ts` / `posDatabase.ts`
- Any of the 22 services in §4.2 or 7 in §4.3
- The `--experimental-sqlite` flags in `package.json`
- `node:sqlite` imports — they're the schema DDL's only runtime

Tagging something for elimination (this doc) is different from actually removing it. Stage 1 is the first place anything actually gets deleted.

---

## 10. Quick commands for future dismantle work

```bash
# Confirm no one imports from database.ts after a stage completes
pnpm --filter @benlow-rics/api exec grep -rn "from.*db/database" src/ tests/

# Check SQLite disk usage (see if anything still grows after stage-X)
du -h apps/api/data/

# List every SQLite table currently being read
pnpm --filter @benlow-rics/api exec grep -rEo "FROM \w+|INTO \w+" src/ | sort -u
```
