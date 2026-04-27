# App-native report validator pattern

**Date:** 2026-04-26
**Source:** `/index-knowledge` pass — Inventory Aging Postgres rewire conversation
**Type:** Design decision

## Context

Five report endpoints (`on-hand`, `sales-performance`, `inventory-turnover`, `sell-through`, `inventory-aging`) historically validated their `department` and `category` query params against the women's-shoe MVP slice baked into [`apps/api/src/constants/domain.ts`](../../../apps/api/src/constants/domain.ts):

```
ALLOWED_DEPARTMENTS = ['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT']
CATEGORY_CODE_MIN = 556, CATEGORY_CODE_MAX = 599
```

These came from the SQLite `ref_categories.dept_macro` enum that powered the original female-shoe MVP. They make sense for any report that still reads from the SQLite `skus` / `inventory` tables — the domain there literally cannot exceed the enum. They block any report that reads from the Postgres `app.sku` / `app.taxonomy_*` surfaces, which carry the full RICS catalog: 99 numeric departments, categories `1..999`, real RICS descriptions like `ZAPATO MARCA HOMBRE` rather than the macro labels.

The Inventory Aging rewire on 2026-04-26 was the first report to switch its read path to Postgres app data. Two corresponding loosenings were needed:

1. **API route validation** — the route's Zod schema must accept any non-empty string department and the full `1..999` category range.
2. **Frontend domain-filter contract** — `validateDomainFilterContract` (used by [`InventoryAgingReportPage.tsx`](../../../apps/web/src/pages/inventory/InventoryAgingReportPage.tsx)) and `appendDomainFilterContract` (used by `fetchAgingDrillDown`, `getAgingCsvUrl`, `getAgingXlsxUrl`) must run in "any-string" mode.

The frontend validator already had an `allowAnyDepartment: true` toggle for sell-through (and an inline note explaining the rationale) — but the aging page wasn't passing it, which is what produced the original bug report "Department must be one of FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT" when drilling into a real RICS department like `ABRIGOS HOMBRE`.

## Decision

Future report endpoints whose read path is Postgres-app-data — i.e. they query `app.*` tables, the RICS `taxonomy_*` family, or any module-owned schema — adopt these defaults from the start:

### Backend route schema

- `department` accepts any non-empty string. Use `z.string().min(1).optional()`, not `z.enum(ALLOWED_DEPARTMENTS).optional()`.
- `category` accepts the full RICS range. Use `z.coerce.number().int().min(1).max(999).optional()`, not the shared `categoryCodeQueryField`.
- Keep the route schema **inline** to that endpoint. Do not extract a "loose" shared schema and adopt it across reports — every other (still-SQLite-backed) report keeps its strict gates because its data does not exceed them, and the strict mode catches client typos that would otherwise return zero rows.

Reference implementation: [`apps/api/src/routes/reportRoutes.ts`](../../../apps/api/src/routes/reportRoutes.ts) under `// ── Inventory Aging Report ──────────`.

### Frontend domain-filter contract

- Pages call `validateDomainFilterContract(filters, { allowAnyDepartment: true, requireDepartmentForCategory: <…> })`. The `requireDepartmentForCategory` flag is independent of the loosening — for groupings where category narrows a parent (e.g. department), set it to true; for sector / vendor / buyer / store groupings, false.
- API helpers call `appendDomainFilterContract(params, contract, { allowAnyDepartment: true })` so the URL-builders mirror the page's loosening. Bug pattern observed during the Aging rewire: page validator was loosened but the URL builders weren't, which let the page submit but failed at the next drill-down click.

Reference implementation: [`apps/web/src/services/domainFilterContract.ts`](../../../apps/web/src/services/domainFilterContract.ts), [`apps/web/src/pages/inventory/InventoryAgingReportPage.tsx`](../../../apps/web/src/pages/inventory/InventoryAgingReportPage.tsx).

## Consequences

- App-native reports get the full catalog domain on day one — no carve-outs needed when a new department or category appears.
- The constants in `apps/api/src/constants/domain.ts` (`ALLOWED_DEPARTMENTS`, `CATEGORY_CODE_MIN`, `CATEGORY_CODE_MAX`) become "SQLite-only" gates. They stay in place for the four still-SQLite reports (`on-hand`, `sales-performance`, `inventory-turnover`, `sell-through`) until those reports migrate. When the last SQLite-backed report retires, the constants and the strict-mode branch in `validateDomainFilterContract` can be deleted.
- The "Unmapped" group identity becomes legitimate. Postgres-backed groupings emit an `Unmapped` group label whenever a SKU's `category_number` falls outside any `taxonomy_department` range. The string `'Unmapped'` is reserved on the wire — drill-down handlers compare to it explicitly to translate "drill into Unmapped" into `td."desc" IS NULL`. Don't change it without grepping every `inventoryAgingPg.ts`-style service.
- Tests that asserted 400 on out-of-range categories for an app-native report (e.g. the `category=555` case in [`apps/api/tests/reportCategoryFilter.test.ts`](../../../apps/api/tests/reportCategoryFilter.test.ts)) need to drop the app-native report from the assertion list when it migrates — same shape as what was done for `inventory-aging` on 2026-04-26.

## Alternatives considered

- *Loosen the shared `ALLOWED_DEPARTMENTS` / category constants globally:* rejected. Removes the typo-catching gate from every still-SQLite report and would unmask a class of "endpoint returns 200 with empty data" bugs that the strict gate currently surfaces as 400.
- *Maintain a parallel "Postgres allowed list" enum:* rejected. The Postgres taxonomy carries 99 departments and ~900 categories with descriptions in Spanish, evolves independently of the API code, and would force a rebuild + redeploy for every taxonomy-row addition. A passthrough validator is correct here.
- *Add a single `appNativeQuerySchema` shared across reports:* deferred. Worth doing once at least three reports have migrated so we have a real shape to converge on, rather than guessing the right common denominator from one example.

## Related

- [`docs/modules/sales-reporting/decisions.md`](../../modules/sales-reporting/decisions.md) — 2026-04-26 entry on the aging-report rewire (full feature scope, alternatives for the data-source choice).
- [`apps/api/src/services/reports/inventoryAgingPg.ts`](../../../apps/api/src/services/reports/inventoryAgingPg.ts) — service that consumes the loosened route inputs.
- [`apps/web/src/services/domainFilterContract.ts`](../../../apps/web/src/services/domainFilterContract.ts) — `allowAnyDepartment` option site.
