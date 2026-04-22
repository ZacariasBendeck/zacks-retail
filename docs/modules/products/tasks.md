# Products — Tasks

> **Scope of this file.** Numbered tasks for the **extended-attributes layer** (introduced 2026-04-22). Other in-flight Phase 1 products work lives at [`docs/dev/specs/2026-04-18-products-phase1-design.md`](../../dev/specs/2026-04-18-products-phase1-design.md) and migrates here over time.

## Conventions

- **Phase target**: A / B / C per [`CLAUDE.md`](../../../CLAUDE.md) Rollout-phases. All tasks in this file target Phase A.
- **Size**: S (≤2h), M (½–1 day), L (>1 day).
- **Dependencies**: prior tasks in this file; cross-references to other files where relevant.
- **Acceptance**: pass criteria; the task is not complete until every check passes.
- All tasks commit directly to `master`. No branches, no worktrees.

## Task list

### Task 1 — Migration: `app.attribute_dimension` + `app.attribute_value` + `app.sku_attribute_assignment`

- **Phase**: A
- **Size**: S
- **Dependencies**: none
- **Scope deliverables**:
  - `apps/api/prisma/migrations/20260422_app_sku_extended_attributes/migration.sql` — creates the three tables, the composite facet index, and the `app.sku_attribute_orphans` view.
  - `apps/api/prisma/schema.prisma` — three new models in the `app` schema (full Prisma DSL in [`schema.md`](schema.md) §Migration).
  - `apps/api/tests/migrations/sku_extended_attributes.test.ts` — verifies tables exist with the expected columns + composite PK + facet index; verifies the soft-FK pattern (no FK constraint from `sku_attribute_assignment.sku_code` to `inventory_master.sku`).
- **Acceptance**:
  - `pnpm prisma migrate dev` applies cleanly; `prisma migrate status` shows green.
  - Migration test passes.
  - `\d app.sku_attribute_assignment` in psql shows the composite PK and `ix_sku_attr_facet`.

### Task 2 — Seed pipeline: CSVs + `seed:sku-attributes` script

- **Phase**: A
- **Size**: M
- **Dependencies**: Task 1
- **Scope deliverables**:
  - `apps/api/seeds/sku_extended_attributes/dimensions.csv` — 4 rows.
  - `apps/api/seeds/sku_extended_attributes/values.csv` — ~62 rows (4 buyer, 3 company, 3 store_chain, ~52 discount_type).
  - `apps/api/seeds/sku_extended_attributes/keyword_rules.csv` — ~62 rules (one per value, plus a few synonyms if discovered).
  - `apps/api/scripts/seed-sku-attributes.ts` — implements the four phases (catalog upsert; excel import skipped; keyword derivation; coverage report).
  - `apps/api/package.json` — adds `"seed:sku-attributes": "tsx scripts/seed-sku-attributes.ts"`.
  - `apps/api/tests/seeds/skuAttributesSeed.test.ts` — catalog upsert idempotency, CSV-to-DB orphan detection, tokenizer correctness (the `50` / `2D50` false-positive case), token-rule mapping (every rule resolves to a real `(dim, value)`), precedence (operator row preserved across re-seed).
- **Acceptance**:
  - Running `pnpm --filter @benlow-rics/api seed:sku-attributes` against a populated `rics_mirror` produces non-zero coverage for all four dims.
  - Re-running the script is a no-op for unchanged data.
  - Coverage report prints per-dim totals matching `business-functional.md` §Acceptance criteria thresholds (`buyer ≥ 90%`, `company ≥ 50%`, `store_chain ≥ 5%`, `discount_type ≥ 30%`).
  - Removing a value from `values.csv` causes the script to exit non-zero with an "orphan in DB" warning (no auto-delete).
  - All seed tests pass.

### Task 3 — Repository + service layer

- **Phase**: A
- **Size**: M
- **Dependencies**: Task 1
- **Scope deliverables**:
  - `apps/api/src/repositories/products/AttributesRepository.ts` — Prisma-backed reads + transactional writes for the three tables.
  - `apps/api/src/services/products/attributesService.ts` — orchestrates the atomic-replace PUT semantics; validates dim/value existence, dim/value membership, single-value cap; emits audit-log entries via the existing `ProductsAuditLog`.
  - `apps/api/src/services/products/attributesService.ts` exports `bulkAssign(...)` for the [`utilities`](../utilities/) module to import.
  - `apps/api/tests/services/products/attributesService.test.ts` — `bulkAssign` validation, atomic-replace semantics, audit-log entry written, transaction rollback on per-SKU validation error.
- **Acceptance**:
  - All service tests pass.
  - Manual REPL: `attributesService.bulkAssign({ skuCodes: [...], dimension_code: 'buyer', value_codes: ['zb'], actor: 'test' })` returns expected `{added, removed, unchanged}` counts.

### Task 4 — Routes + tests

- **Phase**: A
- **Size**: M
- **Dependencies**: Task 3
- **Scope deliverables**:
  - `apps/api/src/routes/products/attributesRoutes.ts` — five endpoints from [`api.md`](api.md):
    - `GET /api/v1/products/attributes/dimensions` (with optional `?withCounts=true`)
    - `GET /api/v1/products/attributes/coverage`
    - `GET /api/v1/products/skus/:code/attributes`
    - `PUT /api/v1/products/skus/:code/attributes`
    - Extension to existing `GET /api/v1/products/skus` for `attr.<dim>=<vals>` filters.
  - `apps/api/src/app.ts` — mount the new router.
  - `apps/api/tests/routes/products/attributesRoutes.test.ts` — endpoint shapes; HTTP status mapping (200 / 422 / 404); list-filter intersection-across-dims, union-within-dim.
- **Acceptance**:
  - All route tests pass.
  - `curl http://localhost:4000/api/v1/products/attributes/dimensions` returns the catalog.
  - `curl 'http://localhost:4000/api/v1/products/skus?attr.buyer=zb&attr.discount_type=pct_50&limit=10'` returns plausible SKUs.

### Task 5 — Catalog page + nav entry

- **Phase**: A
- **Size**: S
- **Dependencies**: Task 4
- **Scope deliverables**:
  - `apps/web/src/types/productsAttributes.ts` — TypeScript types matching the API contracts.
  - `apps/web/src/services/productsAttributesApi.ts` — API client (3 GETs + 1 PUT).
  - `apps/web/src/hooks/useProductsAttributes.ts` — TanStack Query hooks; 5-minute stale time on the catalog query.
  - `apps/web/src/pages/products/attributes/CatalogPage.tsx` — left-nav dim list + right-panel value table with mechanic grouping for `discount_type`.
  - `apps/web/src/pages/products/attributes/CatalogDimensionPanel.tsx` — the right-panel component.
  - `apps/web/src/App.tsx` — route `/products/attributes`.
  - `apps/web/src/components/AppLayout.tsx` — "Atributos" entry in the Products menu.
  - `apps/web/src/test/productsAttributesCatalog.test.tsx` — Vitest + RTL: renders all 4 dims, switching dim shows correct value table, mechanic-prefix grouping renders for `discount_type`.
- **Acceptance**:
  - All UI tests pass.
  - Browser smoke: `/products/attributes` lists 4 dims; selecting `discount_type` shows the 4 mechanic groups collapsible, with values inside.

### Task 6 — SKU form Atributos tab

- **Phase**: A
- **Size**: M
- **Dependencies**: Task 5
- **Scope deliverables**:
  - `apps/web/src/pages/products/skus/SkuAttributesTab.tsx` — 6th tab on the existing SKU form ([`apps/web/src/pages/products/skus/SkuFormPage.tsx`](../../../apps/web/src/pages/products/skus/SkuFormPage.tsx)). One field block per dim; single-value `<Select>` or multi-value `<Select mode="multiple">`; OptGroup'd options for `discount_type` by mechanic prefix; source badge under each select.
  - "Reset to keyword-derived" button that issues `PUT .../attributes` with empty `assignments` array.
  - `apps/web/src/test/skuAttributesTab.test.tsx` — load existing values, edit + save round-trip via PUT, reset button fires PUT with empty array.
- **Acceptance**:
  - All UI tests pass.
  - Browser smoke: pick a known classified SKU, change every dim, save, reload — values persist. Click Reset → keyword-derived values reappear after save.

### Task 7 — SKU list filter group + Atributos column

- **Phase**: A
- **Size**: M
- **Dependencies**: Tasks 4, 5
- **Scope deliverables**:
  - `apps/web/src/components/products/AttributeFilterGroup.tsx` — collapsible filter strip with one multi-select per dim; pushes `attr.<dim>=<value>[,<value>...]` into the URL on `Run query`.
  - Update [`apps/web/src/pages/products/skus/SkuListPage.tsx`](../../../apps/web/src/pages/products/skus/SkuListPage.tsx) — wire the new filter group above the existing strip; add a hideable "Atributos" column rendering compact badges per row; add removable pills to the active-filter summary.
  - Update [`apps/web/src/services/productsSkuApi.ts`](../../../apps/web/src/services/productsSkuApi.ts) and `apps/web/src/types/productsSku.ts` — extend `SkuListFilters` to carry `attr: Record<string, string[]>`.
  - `apps/web/src/test/skuListAttributeFilters.test.tsx` — Vitest + RTL: select values across two dims, verify URL params produced; clear filter restores prior state.
- **Acceptance**:
  - All UI tests pass.
  - Browser smoke: filter `Comprador = ZB`, `Descuento = 50% off` — table shows the intersection. Pills appear in the filter summary; clicking ✕ removes them and updates results on next `Run query`.

### Task 8 — Inquiry page badge strip

- **Phase**: A
- **Size**: S
- **Dependencies**: Tasks 4, 5
- **Scope deliverables**:
  - `apps/web/src/components/products/AttributeBadgeStrip.tsx` — reusable component rendering compact pills per dim. Prop: `attributes: AttributesByDimension`.
  - Update the Product Inquiry page at [`apps/web/src/pages/products/inquiry/`](../../../apps/web/src/pages/products/inquiry/) — render the strip under the header (above the pricing panel). Fetch attributes via the same `useSkuAttributes` hook from Task 5.
  - Unclassified dims render as muted "Sin clasificar".
  - `apps/web/src/test/inquiryAttributeStrip.test.tsx` — strip renders correct values for a classified SKU; muted state for an unclassified dim.
- **Acceptance**:
  - All UI tests pass.
  - Browser smoke: `/products/inquiry/<known-classified-SKU>` shows the four dim pills correctly under the header; unclassified dims show "Sin clasificar".

### Task 9 — Post-sync orphan-count check

- **Phase**: A
- **Size**: S
- **Dependencies**: Task 1
- **Scope deliverables**:
  - Update [`apps/api/scripts/verify-rics-mirror.ts`](../../../apps/api/scripts/verify-rics-mirror.ts) — query `app.sku_attribute_orphans` and log the row count + the top 10 orphan SKU codes.
  - Update [`docs/operations/rics-mirror-sync.md`](../../operations/rics-mirror-sync.md) — document the orphan check and the recommended workflow `pnpm sync:rics && pnpm seed:sku-attributes`.
- **Acceptance**:
  - `pnpm verify:rics-mirror` prints the orphan count line at the end of its output.
  - The operations doc is updated.

## Open backlog

- **`total_skus` denominator definition.** Coverage % currently uses `COUNT(*) FROM rics_mirror.inventory_master` (no status filter). If operator wants discontinued SKUs excluded from the denominator, that's a coverage-endpoint tweak, not a schema change.
- **Query plan under heavy attribute filtering.** Adding 4 `EXISTS` subqueries to the SKU list query is unmeasured. The composite `ix_sku_attr_facet` index should handle each subquery in O(log n + k); typical operator queries combine 1–2 attribute filters with a vendor / category narrowing first. Measure if the page slows past ~500 ms.
- **When does coverage justify dropping `2D__` exact-match in favor of pattern detection?** Today every `2D<n>` token needs a row in `keyword_rules.csv`. If the mechanic stays exact-listed forever, that's fine. If new `2D<n>` rates appear regularly, promote to `2D[0-9]+` regex with `<n>` extracted as the parameter.
- **Whitespace-tokenizer edge cases.** The split is `\s+` and handles spaces and tabs. RICS keywords are space-separated by convention. If a future export introduces commas or semicolons, the tokenizer needs revisiting.

## Related

- [`schema.md`](schema.md) — tables and migration referenced by every task.
- [`api.md`](api.md) — endpoint contracts that Tasks 4–8 satisfy.
- [`business-functional.md`](business-functional.md) — acceptance criteria by feature.
- [`decisions.md`](decisions.md) — why each task is shaped the way it is.
- [`docs/dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md`](../../dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md) — original brainstorm session record.
