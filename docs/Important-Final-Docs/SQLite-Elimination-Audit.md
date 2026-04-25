# SQLite Elimination Audit

This document tracks the remaining SQLite admin-database surface that still needs to be retired. This audit now covers only the legacy admin and warehouse SQLite footprint.

**Status updated:** 2026-04-25

## Scope

One SQLite database currently lives under `apps/api/data/`:

| File | Size | Init code | Purpose |
|---|---|---|---|
| `apps/api/data/inventory.db` (+ `.db-shm`, `.db-wal`) | ~2.0 MB / ~4.0 MB WAL at audit time | [apps/api/src/db/database.ts](../../apps/api/src/db/database.ts) | Warehouse / admin DB for the pre-Postgres legacy surfaces |

Tests still use `:memory:` SQLite when `NODE_ENV === 'test'`.

## Remaining load-bearing areas

The SQLite footprint that still matters is the admin / warehouse side:

- vendor and legacy SKU admin surfaces,
- inventory and inventory adjustments still on the old DB,
- purchase orders and receipts not yet migrated,
- customer and customer-transactions legacy surfaces not yet migrated,
- OTB planning tables not yet migrated,
- physical inventory count tables not yet migrated,
- the old reporting and dashboard services that still read SQLite.

## Primary code surfaces

### DB init

| File | Role |
|---|---|
| [apps/api/src/db/database.ts](../../apps/api/src/db/database.ts) | Primary SQLite init and migration logic. Delete last. |
| [apps/api/src/db/prisma.ts](../../apps/api/src/db/prisma.ts) | Postgres client. Keep. |

### Direct `getDb()` consumers

These services still need Postgres replacements before the remaining SQLite database can disappear:

```text
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
apps/api/src/services/skuService.ts
apps/api/src/services/vendorService.ts
```

### Indirect SQLite consumers

These still need inspection during the final dismantle:

```text
apps/api/src/services/salesReporting/salesReportFacade.ts
apps/api/src/services/ricsProductAdapter.ts
apps/api/src/services/salesLedgerService.ts
apps/api/src/services/publicProductService.ts
```

### Tests

Many API tests still rely on SQLite-backed initialization. When `database.ts` is retired, those tests need Postgres fixtures instead of `:memory:` SQLite setup.

## HTTP surfaces still backed by SQLite

Any mounted route that depends on the services above still carries SQLite debt. The largest remaining clusters are:

- `/api/v1/skus/*` legacy SKU admin surface,
- `/api/v1/customers/*`,
- `/api/v1/customer-transactions/*`,
- `/api/v1/purchase-orders/*`,
- `/api/v1/otb/*`,
- `/api/v1/physical-inventory/*`,
- `/api/v1/reports/*`,
- `/api/v1/dashboard/*`.

## Safe dismantle order

1. Migrate one functional area at a time to Postgres-owned tables and services.
2. Move or replace the tests that still depend on SQLite init.
3. Delete the old service code only after the replacement is live.
4. Remove `apps/api/src/db/database.ts` only when no route still depends on it.
5. Delete the on-disk `apps/api/data/*.db*` files only after the code path is gone.
6. Remove `NODE_OPTIONS=--experimental-sqlite` from package scripts and update the remaining docs.

## Risks

Deleting the SQLite files early would still wipe live data for the remaining legacy admin workflows even if tests keep passing. The tests are not a reliable safety signal here because they use in-memory setup.

## What is already gone

The register runtime is no longer part of this audit's scope.
