# Migration Runbook (Legacy RICS → Odoo)

Execution and rollback sequences for the **legacy** RICS → Odoo SQLite migrations. Kept here only because the data cutover is still running in parallel with new Zack's Retail development. For new migrations against the Zack's Retail Postgres DB, see [../workflows/add_migration.md](../workflows/add_migration.md) instead.

## Prerequisites

- SQLite CLI (`sqlite3`) or Node.js with `--experimental-sqlite`
- `pnpm` installed with dependencies resolved (`pnpm install`)
- Backup of the target database file before any migration

## Migration 015 — OTB Monthly Department/SKU Planning

**Files:**
- `legacy/sqlite-migrations/015_otb_monthly_department_sku_planning.up.sql`
- `legacy/sqlite-migrations/015_otb_monthly_department_sku_planning.down.sql`
- `legacy/sqlite-migrations/015_otb_monthly_department_sku_planning.verify.sql`

**Objects created (UP):**
- Table: `otb_monthly_department_sku_plan`
- View: `v_otb_monthly_department_sku_plan`
- 6 triggers (size alignment, department alignment, category guardrail — insert/update)
- 4 indexes on budget_id, sku_id, sku_size_id, and composite budget+updated_at
- Schema comments in `schema_table_comments`

**Dependencies:** Requires `otb_budgets`, `skus`, `sku_sizes`, and `ref_categories` tables to exist (migrations 001–014 applied).

---

### Development

```bash
# 1. Back up the dev database
cp apps/api/data/inventory.db apps/api/data/inventory.db.bak-pre015

# 2. Apply migration
sqlite3 apps/api/data/inventory.db < legacy/sqlite-migrations/015_otb_monthly_department_sku_planning.up.sql

# 3. Verify
pnpm --filter @benlow-rics/api run db:verify:migration015
```

**Rollback (dev):**
```bash
sqlite3 apps/api/data/inventory.db < legacy/sqlite-migrations/015_otb_monthly_department_sku_planning.down.sql
```

---

### Staging

Staging must mirror production configuration. Run verification both post-UP and post-DOWN to confirm full reversibility before promoting to production.

```bash
# 1. Back up staging database
cp $STAGING_DB_PATH ${STAGING_DB_PATH}.bak-pre015

# 2. Apply migration
sqlite3 $STAGING_DB_PATH < legacy/sqlite-migrations/015_otb_monthly_department_sku_planning.up.sql

# 3. Run automated verification (Section A: post-UP checks)
pnpm --filter @benlow-rics/api run db:verify:migration015

# 4. Smoke-test: confirm the app starts and OTB endpoints respond
#    (manual or via integration test suite)

# 5. Test rollback reversibility
sqlite3 $STAGING_DB_PATH < legacy/sqlite-migrations/015_otb_monthly_department_sku_planning.down.sql
# Verify Section B checks pass (all 015 objects removed)

# 6. Re-apply migration for staging use
sqlite3 $STAGING_DB_PATH < legacy/sqlite-migrations/015_otb_monthly_department_sku_planning.up.sql
pnpm --filter @benlow-rics/api run db:verify:migration015
```

**Rollback (staging):**
```bash
sqlite3 $STAGING_DB_PATH < legacy/sqlite-migrations/015_otb_monthly_department_sku_planning.down.sql
```

---

### Production

Production deploy is manual-trigger or tag-based. Coordinate with Schema (migration author) before executing.

```bash
# 1. Take a full database backup BEFORE migration
cp $PROD_DB_PATH ${PROD_DB_PATH}.bak-pre015-$(date +%Y%m%d%H%M%S)

# 2. Stop the application to prevent writes during migration
# (or ensure WAL mode handles concurrent reads safely)

# 3. Apply migration
sqlite3 $PROD_DB_PATH < legacy/sqlite-migrations/015_otb_monthly_department_sku_planning.up.sql

# 4. Run verification
pnpm --filter @benlow-rics/api run db:verify:migration015

# 5. Restart the application

# 6. Post-deploy validation: confirm OTB planning endpoints return 200
```

**Rollback (production):**
```bash
# 1. Stop the application
# 2. If data has been written to otb_monthly_department_sku_plan, assess impact first
# 3. Apply down migration
sqlite3 $PROD_DB_PATH < legacy/sqlite-migrations/015_otb_monthly_department_sku_planning.down.sql
# 4. Restore from backup if down migration is insufficient
cp ${PROD_DB_PATH}.bak-pre015-* $PROD_DB_PATH
# 5. Restart the application
```

> **Note:** The down migration drops the table and all data in it. If rows exist in `otb_monthly_department_sku_plan`, coordinate with the team before rolling back — data loss is irreversible without the backup.

---

## Migration 014 — Sales Ledger / OTB Lines

**Files:**
- `legacy/sqlite-migrations/014_sales_ledger_otb_lines.up.sql`
- `legacy/sqlite-migrations/014_sales_ledger_otb_lines.down.sql`
- `legacy/sqlite-migrations/014_sales_ledger_otb_lines.verify.sql`

Follow the same dev/staging/prod sequence as migration 015, substituting file names and using:
```bash
pnpm --filter @benlow-rics/api run db:verify:migration014
```

---

## Migration 016 - Transaction Ledger Integrity Hardening

**Files:**
- `legacy/sqlite-migrations/016_transaction_ledger_integrity_hardening.up.sql`
- `legacy/sqlite-migrations/016_transaction_ledger_integrity_hardening.down.sql`
- `legacy/sqlite-migrations/016_transaction_ledger_integrity_hardening.verify.sql`

**Objects created (UP):**
- 7 indexes for receipt/transfer/adjustment read patterns
- 10 triggers enforcing:
  - `purchase_order_lines.quantity_received <= quantity_ordered`
  - `po_receipt_lines` PO-line/header/SKU alignment
  - `po_receipt_lines` and `transfer_order_lines` SKU-size ownership
  - non-zero `inventory_adjustment_lines.quantity`

**Dependencies:** Requires migrations `001-015` (base schema and prior hardening) to be applied.

### Development

```bash
# 1. Back up the dev database
cp apps/api/data/inventory.db apps/api/data/inventory.db.bak-pre016

# 2. Apply migration
sqlite3 apps/api/data/inventory.db < legacy/sqlite-migrations/016_transaction_ledger_integrity_hardening.up.sql

# 3. Verify (UP/DOWN + behavioral checks)
pnpm --filter @benlow-rics/api run db:verify:migration016
```

**Rollback (dev):**
```bash
sqlite3 apps/api/data/inventory.db < legacy/sqlite-migrations/016_transaction_ledger_integrity_hardening.down.sql
```

### Staging

```bash
# 1. Back up staging database
cp $STAGING_DB_PATH ${STAGING_DB_PATH}.bak-pre016

# 2. Apply migration
sqlite3 $STAGING_DB_PATH < legacy/sqlite-migrations/016_transaction_ledger_integrity_hardening.up.sql

# 3. Run automated verification
pnpm --filter @benlow-rics/api run db:verify:migration016

# 4. Smoke-test inventory adjustments, PO receive, and transfer-order list APIs

# 5. Validate rollback reversibility
sqlite3 $STAGING_DB_PATH < legacy/sqlite-migrations/016_transaction_ledger_integrity_hardening.down.sql

# 6. Re-apply for staging usage
sqlite3 $STAGING_DB_PATH < legacy/sqlite-migrations/016_transaction_ledger_integrity_hardening.up.sql
pnpm --filter @benlow-rics/api run db:verify:migration016
```

**Rollback (staging):**
```bash
sqlite3 $STAGING_DB_PATH < legacy/sqlite-migrations/016_transaction_ledger_integrity_hardening.down.sql
```

### Production

```bash
# 1. Full DB backup before migration
cp $PROD_DB_PATH ${PROD_DB_PATH}.bak-pre016-$(date +%Y%m%d%H%M%S)

# 2. Stop app writes (maintenance mode or controlled deploy window)

# 3. Apply migration
sqlite3 $PROD_DB_PATH < legacy/sqlite-migrations/016_transaction_ledger_integrity_hardening.up.sql

# 4. Run verification harness
pnpm --filter @benlow-rics/api run db:verify:migration016

# 5. Restart app and validate transaction endpoints
```

**Rollback (production):**
```bash
# 1. Stop the application
# 2. Apply down migration
sqlite3 $PROD_DB_PATH < legacy/sqlite-migrations/016_transaction_ledger_integrity_hardening.down.sql
# 3. Restore backup if needed
cp ${PROD_DB_PATH}.bak-pre016-* $PROD_DB_PATH
# 4. Restart
```

---

## Migration 017 - Inventory Balance Baseline (Constraints + Filter Indexes)

**Files:**
- `legacy/sqlite-migrations/017_inventory_balance_baseline.up.sql`
- `legacy/sqlite-migrations/017_inventory_balance_baseline.down.sql`
- `legacy/sqlite-migrations/017_inventory_balance_baseline.verify.sql`

**Objects created (UP):**
- Table: `inventory_balances`
- 4 triggers:
  - SKU-size ownership alignment on insert/update
  - optimistic-concurrency guard (`version` must increment by exactly 1 on balance mutations)
  - automatic `updated_at` touch on updates
- 6 indexes including CTO baseline composites:
  - `(category, macro_department, brand, style, color, size)`
  - `(category, macro_department, updated_at, id)`
- `schema_table_comments` entry for `inventory_balances`

**Dependencies:** Requires migrations `001-016` to be applied.

### Development

```bash
# 1. Back up the dev database
cp apps/api/data/inventory.db apps/api/data/inventory.db.bak-pre017

# 2. Apply migration
sqlite3 apps/api/data/inventory.db < legacy/sqlite-migrations/017_inventory_balance_baseline.up.sql

# 3. Verify (UP/DOWN + behavioral checks)
pnpm --filter @benlow-rics/api run db:verify:migration017
```

**Rollback (dev):**
```bash
sqlite3 apps/api/data/inventory.db < legacy/sqlite-migrations/017_inventory_balance_baseline.down.sql
```

### Staging

```bash
# 1. Back up staging database
cp $STAGING_DB_PATH ${STAGING_DB_PATH}.bak-pre017

# 2. Apply migration
sqlite3 $STAGING_DB_PATH < legacy/sqlite-migrations/017_inventory_balance_baseline.up.sql

# 3. Run automated verification
pnpm --filter @benlow-rics/api run db:verify:migration017

# 4. Smoke-test high-volume SKU filter endpoints and movement command writes

# 5. Validate rollback reversibility
sqlite3 $STAGING_DB_PATH < legacy/sqlite-migrations/017_inventory_balance_baseline.down.sql

# 6. Re-apply for staging usage
sqlite3 $STAGING_DB_PATH < legacy/sqlite-migrations/017_inventory_balance_baseline.up.sql
pnpm --filter @benlow-rics/api run db:verify:migration017
```

**Rollback (staging):**
```bash
sqlite3 $STAGING_DB_PATH < legacy/sqlite-migrations/017_inventory_balance_baseline.down.sql
```

### Production

```bash
# 1. Full DB backup before migration
cp $PROD_DB_PATH ${PROD_DB_PATH}.bak-pre017-$(date +%Y%m%d%H%M%S)

# 2. Stop app writes (maintenance mode or controlled deploy window)

# 3. Apply migration
sqlite3 $PROD_DB_PATH < legacy/sqlite-migrations/017_inventory_balance_baseline.up.sql

# 4. Run verification harness
pnpm --filter @benlow-rics/api run db:verify:migration017

# 5. Restart app and validate inventory list/mutation workflows
```

**Rollback (production):**
```bash
# 1. Stop the application
# 2. Apply down migration
sqlite3 $PROD_DB_PATH < legacy/sqlite-migrations/017_inventory_balance_baseline.down.sql
# 3. Restore backup if needed
cp ${PROD_DB_PATH}.bak-pre017-* $PROD_DB_PATH
# 4. Restart
```

---

## Migration 019 - Inventory Movement Ledger Normalization + Integrity

**Files:**
- `legacy/sqlite-migrations/019_inventory_movement_ledger_normalization.up.sql`
- `legacy/sqlite-migrations/019_inventory_movement_ledger_normalization.down.sql`
- `legacy/sqlite-migrations/019_inventory_movement_ledger_normalization.verify.sql`

**Objects created (UP):**
- Table: `inventory_movement_ledger`
- View: `v_inventory_movement_reconciliation`
- 7 indexes:
  - source-path uniqueness (`sale`, `po_receipt_line`, `adjustment_line`, `transfer_line+direction`)
  - read-path coverage for `(sku_id, location_id, movement_at, id)`, `(movement_type, movement_at, id)`, and `(location_id, movement_at, id)`
- 8 ledger alignment triggers (insert/update):
  - validate source SKU/location/quantity/cost alignment against source tables
- 4 ingestion triggers:
  - auto-write canonical movement rows from source inserts on sales, PO receipt lines, transfer lines, and adjustment lines
- Schema comments in `schema_table_comments`

**Integrity rules enforced:**
- Exactly one source-document path per movement row
- Movement type/sign conventions:
  - `sale`, `transfer_out` -> negative quantity
  - `po_receipt`, `transfer_in` -> positive quantity
  - `adjustment` -> non-zero signed quantity
- `po_receipt` rows require non-null `unit_cost_snapshot`

**Dependencies:** Requires migrations `001-018` to be applied and `inventory_locations` seeded.

### Development

```bash
# 1. Back up the dev database
cp apps/api/data/inventory.db apps/api/data/inventory.db.bak-pre019

# 2. Apply migration
sqlite3 apps/api/data/inventory.db < legacy/sqlite-migrations/019_inventory_movement_ledger_normalization.up.sql

# 3. Verify (UP/DOWN + behavioral checks + EXPLAIN plan assertions)
pnpm --filter @benlow-rics/api run db:verify:migration019
```

**Rollback (dev):**
```bash
sqlite3 apps/api/data/inventory.db < legacy/sqlite-migrations/019_inventory_movement_ledger_normalization.down.sql
```

### Staging

```bash
# 1. Back up staging database
cp $STAGING_DB_PATH ${STAGING_DB_PATH}.bak-pre019

# 2. Apply migration
sqlite3 $STAGING_DB_PATH < legacy/sqlite-migrations/019_inventory_movement_ledger_normalization.up.sql

# 3. Run automated verification harness
pnpm --filter @benlow-rics/api run db:verify:migration019

# 4. Smoke-test transaction write paths:
#    - PO receive
#    - transfer creation/line write
#    - adjustment creation/line write
#    - sales insertion path (if enabled in staging fixtures)

# 5. Validate rollback reversibility
sqlite3 $STAGING_DB_PATH < legacy/sqlite-migrations/019_inventory_movement_ledger_normalization.down.sql

# 6. Re-apply for staging usage
sqlite3 $STAGING_DB_PATH < legacy/sqlite-migrations/019_inventory_movement_ledger_normalization.up.sql
pnpm --filter @benlow-rics/api run db:verify:migration019
```

**Rollback (staging):**
```bash
sqlite3 $STAGING_DB_PATH < legacy/sqlite-migrations/019_inventory_movement_ledger_normalization.down.sql
```

### Production

```bash
# 1. Full DB backup before migration
cp $PROD_DB_PATH ${PROD_DB_PATH}.bak-pre019-$(date +%Y%m%d%H%M%S)

# 2. Stop app writes (maintenance mode / controlled deploy window)

# 3. Apply migration
sqlite3 $PROD_DB_PATH < legacy/sqlite-migrations/019_inventory_movement_ledger_normalization.up.sql

# 4. Run verification harness
pnpm --filter @benlow-rics/api run db:verify:migration019

# 5. Restart app and validate transaction endpoints + reconciliation read model
```

**Rollback (production):**
```bash
# 1. Stop the application
# 2. Apply down migration
sqlite3 $PROD_DB_PATH < legacy/sqlite-migrations/019_inventory_movement_ledger_normalization.down.sql
# 3. Restore backup if needed
cp ${PROD_DB_PATH}.bak-pre019-* $PROD_DB_PATH
# 4. Restart
```

> **Deploy Coordination Note:** Run migration 019 in a maintenance window because source-table insert triggers are added. Validate throughput impact on high-volume receipt/transfer writes in staging before production promotion.
