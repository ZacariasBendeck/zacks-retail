# Postgres-only Development Policy

**Date:** 2026-04-23
**Source:** `/index-knowledge` pass — policy locked in while migrating the 11 Apariencia / Diseño ref tables off SQLite and into the dimensional framework on `app.*`.
**Type:** Design decision

## Context

Zack's Retail runs three datastores simultaneously:

- **Postgres** — system of record for net-new and imported application data (`public.*`, `app.*`, `platform.*`).
- **Legacy RICS MDB files** — read-only, touched only by offline extraction tooling that produces CSV artifacts.
- **SQLite** — carries legacy admin reference tables (`ref_colors`, `ref_patterns`, etc.) that powered the pre-Postgres admin UI.

Over the 2026-04 rework, Postgres absorbed most of the writable surface. SQLite kept shrinking but stayed reachable for reads. The dimensional attribute framework (`app.attribute_dimension` / `app.attribute_value` / `app.sku_attribute_assignment`) gave a first-class home for operator-chosen values. The next natural step: move the 11 shoe-specific SQLite ref tables (colors, patterns, finishes, accessories, heel-heights, heel-shapes, toe-shapes, upper-materials, outsole-materials, heel-materials, width-types) into that framework and declare Postgres-only going forward.

## Decision / Design

### 1. Rule

Every feature built on Zack's Retail from 2026-04-23 forward writes **exclusively to Postgres**:

- No new columns on the SQLite admin DB (`apps/api/src/db/database.ts`).
- No new keys on `app.sku.legacy_attrs`.
- No new dependencies on the SQLite ref tables.
- New attributes land as dimensional assignments — `app.attribute_dimension` + `app.attribute_value` + `app.sku_attribute_assignment`.
- New SKU columns land on `app.sku` (or a new `app.*` table) via a Prisma migration.
- New lookup data (families, brands, stores, employees, promotion codes) lives in `app.*` or module-owned Postgres tables.

If a task seems to require a SQLite write, it should be surfaced to the operator — it is almost certainly a sign the feature should use the dimensional framework or a new `app.*` table.

Canonical restatement lives in [`CLAUDE.md`](../../../CLAUDE.md) under **HARD RULE — Postgres-only for new development**.

### 2. Migration carried out on 2026-04-23

**Eleven legacy ref tables moved to dimensions** via `pnpm seed:legacy-ref-dimensions`
(at [`apps/api/scripts/seeds/seed-legacy-ref-dimensions.ts`](../../../apps/api/scripts/seeds/seed-legacy-ref-dimensions.ts)):

| Legacy SQLite ref table | New dimension code | Value count |
|---|---|---|
| colors | `color` | 22 |
| width-types | `width_type` | 4 |
| patterns | `pattern` | 8 |
| finishes | `finish` | 7 |
| accessories | `accessory` | 15 |
| heel-heights | `heel_height` | 6 |
| heel-shapes | `heel_shape` | 9 |
| toe-shapes | `toe_shape` | 6 |
| upper-materials | `upper_material` | 10 |
| outsole-materials | `outsole_material` | 6 |
| heel-materials | `heel_material` | 7 |

Total: 100 values across 11 single-value dimensions, `sort_order` between 500–600 (after the four pre-existing dims: buyer, company, store_chain, discount_type).

Each `app.attribute_value.code` is the stringified legacy SQLite id (`"19"`, `"3"`, `"683"`, …). This preserves existing form-field semantics — numeric ref IDs round-trip via `Number.parseInt(code, 10)` when hydrating the form.

### 3. Schema support added for the migration

**Migration `20260423140000_widen_sku_attr_assignment_code`:**
- `ALTER COLUMN app.sku_attribute_assignment.sku_code TYPE VARCHAR(32)` — makes room for DRAFT provisional codes (`DRF-YYMMDD-XXXXXX` = 17 chars, exceeds the original VARCHAR(15)).
- `app.sku_attribute_orphans` view rebuilt to exclude rows that resolve to any `app.sku.code` OR `app.sku.provisional_code`.

**Migration `20260423120000_sku_add_perks_discount_code`:**
- Added `perks NUMERIC(12,2)` and `discount_code TEXT` to `app.sku` so every RICS `inventory_master` column the operator form surfaces round-trips cleanly.

### 4. Runtime behavior changes

**Permissive `skuExists` guard.** `AttributesRepository.skuExists()` now matches any of:
- imported legacy SKU codes
- `app.sku.code`
- `app.sku.provisional_code` (so DRAFTs can carry assignments before finalize)

**Scoped `setForSku`.** The PUT `/skus/:code/attributes` endpoint + `replaceSkuAttributes` repo method accept an optional `scopedDimensionCodes[]`. When present, the atomic-replace's DELETE and the required-dimension check both narrow to those dims. The main SKU form uses this so saving Apariencia / Diseño doesn't wipe Buyer / Company / Cadena / Discount Type assignments (which live under the separate "Atributos" tab).

**Finalize rekey.** `skuLifecycleService.finalize()` now runs
```sql
UPDATE app.sku_attribute_assignment
SET sku_code = <final>
WHERE sku_code = <provisional>
```
inside the DRAFT→ACTIVE transaction. Assignments written during DRAFT live under the provisional code; on finalize they re-key to the permanent code atomically.

### 5. Migration backlog

Form keys still stored in `app.sku.legacy_attrs` as of 2026-04-23 (each becomes a dimension when the feature they back is next touched):

- `shoeTypeId` (shoe-types ref)
- `closureTypeId` (closure-types ref)
- `seasonId` (seasons ref — distinct from `app.sku.season` two-char code)
- `occasionId` (occasions ref)
- `genderId` (target-audiences ref; renamed from `targetAudienceId` 2026-04-23)
- `labelTypeId` (label-types ref)
- `brandText` (free-text brand fallback when brandId doesn't resolve)

`legacy_attrs` is frozen as of 2026-04-23 — no new key should be added. Only these seven remain to be migrated.

### 6. Form integration contract

The SKU creator at `/products/skus/new` ([`apps/web/src/pages/inventory/SkuFormPage.tsx`](../../../apps/web/src/pages/inventory/SkuFormPage.tsx)) carries a const `DIMENSIONAL_ATTR_MAP` mapping each form-field name to its Postgres `attribute_dimension.code`. The serializer `splitFormValuesForLifecycle` skips every key in `DIMENSIONAL_FORM_FIELDS` from the legacy_attrs bag; after the SKU save the form issues a second request to `PUT /skus/:code/attributes` with `{ assignments, scope }` carrying the 11 Apariencia values. On read, `useSkuAttributes(skuKey)` hydrates the 11 form fields from `app.sku_attribute_assignment`.

## Related

- [`CLAUDE.md`](../../../CLAUDE.md) — authoritative HARD RULE text.
- [`docs/dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md`](2026-04-22-sku-extended-attributes-foundation-design.md) — foundational framework this policy extends.
- [`docs/dev/specs/2026-04-22-postgres-first-rics-sync-cutover.md`](2026-04-22-postgres-first-rics-sync-cutover.md) — broader Postgres-first direction.
- [`apps/api/scripts/seeds/seed-legacy-ref-dimensions.ts`](../../../apps/api/scripts/seeds/seed-legacy-ref-dimensions.ts) — idempotent seed script for the 11-dim migration.
