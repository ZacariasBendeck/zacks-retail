# Sales Reporting

Sales Analysis (with all its options), **Sales Hierarchy Drill-Down** (app-native — Department → Category → SKU tree), Sales Pivot, 8-week trending, best sellers, sales history by month, stock status, size type analysis, sales by time / SKU / salesperson, sales journal, sales-by-day summary, exports (NPD, inventory quantities CSV, SKUs HTML).

Saved-query and frozen-snapshot capability is cross-module but first lands here: see [`../../dev/plans/2026-04-22-report-templates-and-runs.md`](../../dev/plans/2026-04-22-report-templates-and-runs.md). Templates replay against live data; snapshots freeze an exact result for later review without re-querying.

**Sales Pivot family** (app-native, no RICS ancestor). One endpoint `GET /api/v1/reports/sales/sales-pivot` dispatches on a `variant` query param:

| Variant | Hierarchy | Page |
|---|---|---|
| `department` | Sector → Dept → Category → SKU | `/reports/sales/pivot` |
| `department-separate-store` | Store → Sector → Dept → Category → SKU | `/reports/sales/pivot` |
| `buyer` | Buyer → Dept → Category → SKU | `/reports/sales/pivot` |
| `buyer-vendor` | Buyer → Vendor → SKU | `/reports/sales/pivot` |
| `buyer-vendor-separate-store` | Store → Buyer → Vendor → SKU | `/reports/sales/pivot` |
| `custom` | Any 3 of 8 dimensions → SKU | `/reports/sales/pivot-custom` |

"Buyer" is the `buyer` extended-attribute dimension (aka *Comprador*) from [`app.sku_attribute_assignment`](../products/README.md). Every variant emits a single unified `SalesPivotLeafRow` shape — identity fields irrelevant to the chosen variant come back null. Custom-variant requests take `level1` / `level2` / `level3` query params (Category is level-3-only) plus optional `sectors` / `departments` / `seasons` / `buyers` criteria filters that resolve to a SKU whitelist before aggregation. See [`decisions.md`](./decisions.md) for the design rationale.

**Inventory Aging** ([`/api/v1/reports/inventory-aging`](../../../apps/api/src/routes/reportRoutes.ts), service [`inventoryAgingPg.ts`](../../../apps/api/src/services/reports/inventoryAgingPg.ts), page [`InventoryAgingReportPage.tsx`](../../../apps/web/src/pages/inventory/InventoryAgingReportPage.tsx)). Postgres-app-data-backed (not `rics_mirror`). Five `groupBy` dimensions — `department` / `sector` / `vendor` / `buyer` / `store` — three bucket presets (30/60/90, 60/120/180, 90/180/270), and criteria multi-selects for stores / buyers / sectors / departments. Aging clock = `MAX(purchase_order_legacy.last_received_at)` per SKU with fallback to `app.sku.created_at`. Buyer dimension currently rolls everything into `Unmapped` because the legacy `purchase_order_legacy.buyer` column imports as NULL on every row. Default sort = total cost value descending across every screen. See the 2026-04-26 entry in [`decisions.md`](./decisions.md) for full context.

**Phase:** TBD
**RICS chapters:** Ch. 6 (most, minus OTB), Ch. 2 (Sales by Time p. 41, Sales by SKU p. 43, Sales Journal p. 44)
**Registry:** [`../MODULES.md`](../MODULES.md)

## Documents in this module

| File | Purpose |
|---|---|
| [`tech-description.md`](./tech-description.md) | Forward technical description (current implementation) |
| [`rics-module-specs.md`](./rics-module-specs.md) | RICS port lineage — what RICS did, what we're changing |
| [`business-functional.md`](./business-functional.md) | Business / functional spec |
| [`api.md`](./api.md) | HTTP API contracts |
| [`schema.md`](./schema.md) | Postgres schema |
| [`tasks.md`](./tasks.md) | Engineering ticket breakdown |
| [`decisions.md`](./decisions.md) | Module-scoped design decisions (ADRs) |

Files that don't exist yet are TBD — see the generating slash command in the layout section of [`../../../CLAUDE.md`](../../../CLAUDE.md).
