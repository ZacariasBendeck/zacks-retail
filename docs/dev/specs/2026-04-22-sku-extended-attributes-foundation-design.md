# SKU Extended Attributes — Foundation Design

> **Distributed into [`docs/modules/products/`](../../modules/products/) on 2026-04-22.**
> The module folder is the living source of truth: see [`schema.md`](../../modules/products/schema.md), [`api.md`](../../modules/products/api.md), [`business-functional.md`](../../modules/products/business-functional.md), [`tasks.md`](../../modules/products/tasks.md), [`decisions.md`](../../modules/products/decisions.md), and the Extended-attributes-layer section appended to [`rics-module-specs.md`](../../modules/products/rics-module-specs.md).
> This file is the original brainstorm-session record, kept for chronology and `/index-knowledge` queries. Treat module-folder content as canonical when in doubt.

**Date:** 2026-04-22
**Source:** `/brainstorm` session — adding a multi-dimension extended-attribute layer to SKUs, starting with four dimensions derivable from existing RICS keywords (Buyer, Company, Store Chain, Discount Type).
**Type:** Design decision

## Context

`rics_mirror.inventory_master` carries the canonical SKU record but its taxonomy is shallow: vendor, category, group, season, plus a single space-separated `key_words` WCHAR field. The keyword field encodes meaningful business taxonomy in tokens (`ZB MAGI 2D50 IBL …`) — buyer initials, target store chain, discount mechanic, parent company — but it is unindexed text and the codes are tribal knowledge.

This spec defines the foundation for an **extended-attribute layer** on top of SKUs. Phase 1 of the work covers four dimensions that can be derived programmatically from `key_words`. A later phase will extend the same schema to a 15-dimension footwear classification (`Tipo_Calzado`, `Altura_Tacon`, …) populated by operator entry and Excel import; that phase is out of scope here but the schema is built to absorb it without migration.

The work targets all five surfaces named in the brainstorm: storefront facets, internal SKU list filtering, inquiry / detail display, reporting pivots, and bulk re-classification. This spec covers the **foundation only** — schema, seed pipeline, API contracts, and the products-side admin UI. Each downstream consumer (storefront, sales-reporting, utilities batch-change) gets its own follow-on brainstorm.

**Source-of-truth model:** Postgres becomes authoritative once seeded. The keyword field on `inventory_master` is read-only to this pipeline; derived data lives in `app.sku_attribute_assignment`. Operators can override or augment classifications via the UI, and operator edits are immune to re-seeding.

**Phase target:** A. Reads from `rics_mirror.*`, writes to `app.*`. No phase-shift implication. This spec is also the first concrete occupant of the `app` schema, which [CLAUDE.md](../../../CLAUDE.md) reserves for module-owned additive tables.

## Decision / Design

### 1. Schema

Three new tables in the `app` schema. Migration filename: `20260422_app_sku_extended_attributes`.

```sql
CREATE TABLE app.attribute_dimension (
  id              SMALLSERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  label_es        TEXT NOT NULL,
  description_es  TEXT,
  sort_order      SMALLINT NOT NULL,
  is_multi_value  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE app.attribute_value (
  id              SMALLSERIAL PRIMARY KEY,
  dimension_id    SMALLINT NOT NULL REFERENCES app.attribute_dimension(id) ON DELETE RESTRICT,
  code            TEXT NOT NULL,
  label_es        TEXT NOT NULL,
  sort_order      SMALLINT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dimension_id, code)
);

CREATE TABLE app.sku_attribute_assignment (
  sku_code        TEXT NOT NULL,
  dimension_id    SMALLINT NOT NULL REFERENCES app.attribute_dimension(id) ON DELETE RESTRICT,
  value_id        SMALLINT NOT NULL REFERENCES app.attribute_value(id) ON DELETE RESTRICT,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by     TEXT,
  PRIMARY KEY (sku_code, dimension_id, value_id)
);

CREATE INDEX ix_sku_attr_facet
  ON app.sku_attribute_assignment (dimension_id, value_id, sku_code);

CREATE VIEW app.sku_attribute_orphans AS
  SELECT a.sku_code, COUNT(*) AS assignment_count
  FROM app.sku_attribute_assignment a
  WHERE NOT EXISTS (
    SELECT 1 FROM rics_mirror.inventory_master im WHERE im.sku = a.sku_code
  )
  GROUP BY a.sku_code;
```

Five non-obvious calls, each load-bearing:

1. **No FK from `app.sku_attribute_assignment.sku_code` to `rics_mirror.inventory_master.sku`.** The mirror is rebuilt atomically on each `pnpm sync:rics` invocation; a cross-schema FK would either cascade-delete classifications during the swap or block the swap. The reference is **soft** — validated at the service layer on write, surfaced via the `app.sku_attribute_orphans` view for periodic cleanup. This is the general pattern every future `app.*` → `rics_mirror.*` reference will follow.
2. **Single-value vs. multi-value is enforced at the service layer, not the DB.** The `is_multi_value` flag drives service behaviour (single-value = DELETE-then-INSERT; multi-value = upsert into the row). DB-level partial unique indexes were rejected: they would hard-code the multi/single split into a migration, defeating the goal of changing dim cardinality without schema work.
3. **Surrogate IDs over natural keys.** Renaming a value (typo fix, label change) becomes a single-row update, not a fan-out across assignments. Storage cost (4 bytes per assignment vs. 6–20 for TEXT) more than pays for itself across the catalog.
4. **No history table.** `assigned_at` + `assigned_by` cover the immediate need ("who classified this and when"). A full re-classification log is out of scope until requested.
5. **"Pending classification" = absence of row.** No sentinel value. The "pendiente inspección física" / "pendiente asignación visual" notes from the broader 15-dim catalog model dimensions where most or all SKUs aren't yet classified — represented simply as zero `sku_attribute_assignment` rows for that dimension. The coverage report (Section 3) gives the operator visibility.

### 2. Seed and keyword-derivation pipeline

The Prisma migration only creates the tables. All data loading lives in a script (`apps/api/scripts/seeds/seed-sku-attributes.ts`), invoked as `pnpm --filter @benlow-rics/api seed:sku-attributes`. Idempotent; safe to re-run.

#### Source artifacts (repo-tracked CSVs)

```
apps/api/seeds/sku_extended_attributes/
  dimensions.csv          # code,label_es,description_es,sort_order,is_multi_value
  values.csv              # dimension_code,code,label_es,sort_order
  keyword_rules.csv       # rics_keyword_token,dimension_code,value_code
```

CSV in repo (not XLSX) for diff-friendliness under git. The `initial_assignments.csv` and `keyword_rules.csv` extend over time; CSV editing is the operator's update path.

#### Phase 1 — keyword-derived dimensions (this spec)

Four dimensions. Buyer / Company / Store Chain are single-value (one classification per SKU); Discount Type is multi-value (a SKU can run two mechanics simultaneously, e.g. `pct_50` and `fixed_l99`).

| Dimension code | label_es | Multi-value | Source |
|---|---|---|---|
| `buyer` | Comprador | no | keyword token |
| `company` | Empresa | no | keyword token |
| `store_chain` | Cadena | no | keyword token |
| `discount_type` | Tipo de Descuento | **yes** | keyword token |

##### Buyer values

`zb` Zacarias Bendeck · `ab` AB · `axb` AXB · `dm` Doña Mónica.

(`ab` and `axb` carry their codes as labels until the operator provides full names. `mb` was named in the brainstorm but does not appear in the keyword data and is excluded.)

##### Company values

`ibl` Inversiones Benlow · `cxn` Corporación Xena · `cct` Compañía Comercial de Tegucigalpa.

(The brainstorm initially named `cxb` for Corporación Xena; the actual token in the keyword field is `cxn`. `mb` was named as a company value as well but does not exist in data.)

##### Store-chain values

`magi` Magic Shoes · `unli` Unlimited · `fash` Fashion.

(The token `un` (5,766 occurrences) appears in the data; the operator's direction is to ignore it.)

##### Discount-type values

Mechanic prefix in `value.code` (`pct_*`, `bogo_*`, `multi_*`, `fixed_*`) makes downstream queries trivial — `WHERE value.code LIKE 'pct_%'` finds every plain-percent discount, and the storefront facet UI groups by prefix automatically. `sort_order` is encoded so the UI can sort within the mechanic block by ascending parameter (`pct_10` before `pct_90`).

| Mechanic | Values |
|---|---|
| Plain percent off (`pct_*`) | 10, 20, 25, 30, 40, 45, 50, 60, 70, 80, 85, 90 |
| Second-at-`<n>%` (`bogo_*`) | 15, 20, 30, 35, 40, 45, 50, 55, 60, 75, 99 |
| Buy-N-pay-1 (`multi_*`) | `2x1`, `3x1`, `4x1`, `3x2` |
| Fixed-price ending (`fixed_*`) | l19, l25, l29, l39, l49, l59, l69, l79, l99, l199, l299, l399, l499, l599, l1999 |

Every value in the table maps 1:1 to a real keyword token (`50` → `pct_50`, `2D50` → `bogo_50`, `2X1` → `multi_2x1`, `L99` → `fixed_l99`).

#### Tokenization rules (the high-risk surface)

- Comparison is **exact-match, case-insensitive, whitespace-tokenized**: `regexp_split_to_table(key_words, '\s+')` then trimmed.
- The `50` discount token does **not** false-positive on `2D50` because tokens are split on whitespace before matching. This is the most important behaviour to preserve in any future tokenizer change.
- Tokens not in `keyword_rules.csv` (`IBL`, `C1421`, `2208`, `ENE25`, …) are ignored. The 4-digit numeric `YYMM` date stamps (`2208`, `2209`, …) are dodged because no rule maps them; the discount-percent rule set is a closed enum, not a numeric pattern.
- The phase-4 coverage report surfaces unmapped tokens by frequency so the operator can spot patterns worth promoting (`ENE25` campaign codes are a future-dim candidate).

#### Pipeline phases

1. **Catalog upsert** — `INSERT … ON CONFLICT (code) DO UPDATE` for `attribute_dimension` and `attribute_value`. Re-runs refresh labels and ordering without touching SKU assignments. Removing a dim or value from the CSV does **not** auto-delete it: the script logs "orphan in DB, not in CSV" and exits non-zero. Removal is a manual SQL step the operator runs deliberately, so a typo in the CSV cannot nuke a thousand assignments.
2. **Excel import — DEFERRED.** No `initial_assignments.csv` for Phase 1; the 1,086 entries from `SKU_Atributos_Ext.xlsx` belong to the later 15-dim phase.
3. **Keyword derivation** — at start of phase, DELETE every row tagged `seed:keyword:*`. Then for each rule, find every SKU whose `key_words` contains the token; INSERT assignments tagged `assigned_by = 'seed:keyword:<rule_hash>'`. Operator edits and `seed:excel:*` rows are preserved.
4. **Coverage report** — per dim: total SKUs, classified SKUs, % coverage, top 10 unmapped tokens, breakdown by source.

#### Precedence (cited in code)

```
operator-edit (any user id)  >  seed:excel:*  >  seed:keyword:*  >  no row
```

Re-running the seed pipeline never overwrites operator edits or any non-`seed:keyword:*` assignment.

### 3. API contracts

Three endpoint groups under `/api/v1/products`. All routes follow the existing products-module conventions (Express + Prisma, `Result<T, RepoError>` repo layer, audit-log every write, no auth — operator-mode only behind whatever frontend gate exists).

#### Catalog (read-only)

```
GET /api/v1/products/attributes/dimensions
GET /api/v1/products/attributes/dimensions?withCounts=true
```

Returns the dim + value catalog. With `withCounts=true`, joins `sku_attribute_assignment` to populate `sku_count` on each value (used by the storefront facet UI later, and by the coverage panel). Cached in TanStack Query for 5 min on the client; no server-side cache layer in Phase 1.

```jsonc
[
  {
    "code": "buyer",
    "label_es": "Comprador",
    "sort_order": 10,
    "is_multi_value": false,
    "values": [
      { "code": "zb", "label_es": "Zacarias Bendeck", "sort_order": 10, "sku_count": 57574 },
      // ...
    ]
  }
  // ... company, store_chain, discount_type
]
```

#### Per-SKU attributes — read

```
GET /api/v1/products/skus/:code/attributes
```

Uniform `{ is_multi_value, values: [...] }` per dim, even for unclassified single-value dims (empty `values` array). Generic rendering becomes trivial; the client takes `values[0]` for single-value display.

```jsonc
{
  "sku_code": "ZB12345",
  "by_dimension": {
    "buyer":         { "is_multi_value": false, "values": [{ "code": "zb",   "label_es": "Zacarias Bendeck", "assigned_by": "seed:keyword:r_buyer_zb", "assigned_at": "2026-04-22T10:14:33Z" }] },
    "company":       { "is_multi_value": false, "values": [] },
    "store_chain":   { "is_multi_value": false, "values": [{ "code": "magi", "label_es": "Magic Shoes",      ... }] },
    "discount_type": { "is_multi_value": true,  "values": [
      { "code": "pct_50",    "label_es": "50% off",         ... },
      { "code": "fixed_l99", "label_es": "L99 precio fijo", ... }
    ]}
  }
}
```

The existing `GET /api/v1/products/skus/:code` (full SKU detail) does **not** auto-include attributes — it stays lean. The detail page makes a parallel attributes request when it needs them.

#### Per-SKU attributes — write (operator override)

```
PUT /api/v1/products/skus/:code/attributes
```

```jsonc
{
  "assignments": [
    { "dimension_code": "buyer",         "value_code": "zb" },
    { "dimension_code": "store_chain",   "value_code": "magi" },
    { "dimension_code": "discount_type", "value_code": "pct_50" },
    { "dimension_code": "discount_type", "value_code": "fixed_l99" }
  ]
}
```

Atomic-replace semantics: in one transaction, **delete every row for this SKU whose `assigned_by` does not start with `seed:keyword:`**, then insert the new set tagged with the current user id. Keyword-derived rows stay untouched — they get rebuilt on next seed run regardless and the precedence rules still apply.

Validation (422 with field-level error):

- Each `dimension_code` and `value_code` must exist; `value_code` must belong to the named dim.
- For any `is_multi_value=false` dim, at most one assignment in the request body.
- The SKU must exist in `rics_mirror.inventory_master` (404 if not).

Audit-log entry: `action='sku_attributes_set', target_table='app.sku_attribute_assignment', target_pk=<sku_code>, payload_json=<new set + previous set diff>`.

#### SKU list filter — extend existing endpoint

`GET /api/v1/products/skus` gains attribute-filter params using the namespaced pattern `attr.<dimension_code>=<value_code>[,<value_code>...]`:

```
GET /api/v1/products/skus?attr.buyer=zb,ab&attr.discount_type=pct_50,bogo_50&attr.store_chain=magi
```

Within a dim → union (`OR`); across dims → intersection (`AND`). Matches the existing convention of `vendors=`, `categories=`, `seasons=` on the same endpoint. Each `attr.X=` translates to one `EXISTS` subquery against `sku_attribute_assignment`.

#### Coverage / classification dashboard

```
GET /api/v1/products/attributes/coverage
```

```jsonc
[
  {
    "dimension_code": "buyer",
    "total_skus": 198342,
    "classified_skus": 182916,
    "coverage_pct": 92.2,
    "by_source": { "keyword": 182916, "excel": 0, "operator": 0 }
  }
  // ... per dim
]
```

Read-only. Powers the admin "how complete is the catalog?" view and the phase-4 seed-pipeline output check.

#### Bulk batch-change — out of scope

Bulk re-classification rides the existing utilities batch-change spec ([`docs/dev/specs/2026-04-21-utilities-batch-change-design.md`](2026-04-21-utilities-batch-change-design.md)). The hook from utilities into this module is `productsAttributes.bulkAssign({ skuCodes, dimension_code, value_codes, actor })` which uses the same write semantics as the PUT endpoint. Wiring is separate work; this spec records the seam.

### 4. Admin UI surface

Three new screens plus one extension to existing pages. All under the `/products/*` route tree, follows the established Ant Design + TanStack Query patterns from the Vendor and SKU admin built in earlier Phase-1 steps.

#### 4a. Catalog viewer — `/products/attributes`

Read-only browser of the four dimensions. Left nav lists the dims in `sort_order`; right panel shows the selected dim's values in a table:

| Código | Etiqueta | Orden | SKUs clasificados |
|---|---|---|---|
| `zb` | Zacarias Bendeck | 10 | 57,574 |
| `ab` | AB | 20 | 76,664 |
| `axb` | AXB | 30 | 2,824 |
| `dm` | Doña Mónica | 40 | 45,854 |

Header strip per dim: "Multi-value: No · 4 valores · 182,916 SKUs clasificados (92.2% del catálogo)."

For `discount_type` (multi-value, 51 values), the table is grouped by mechanic prefix (`pct_*`, `bogo_*`, `multi_*`, `fixed_*`) with collapsible group headers. Mechanic groups are derived client-side from `value.code` prefix; no special server support needed.

No edit affordance in Phase 1. A muted footer hint reads "Edit catalog in `apps/api/seeds/sku_extended_attributes/*.csv` and re-run `pnpm seed:sku-attributes`." Promoting catalog editing into the UI is a deliberate later move.

#### 4b. Per-SKU attributes editor — new tab on existing SKU form

The SKU form at [`apps/web/src/pages/products/skus/SkuFormPage.tsx`](../../../apps/web/src/pages/products/skus/SkuFormPage.tsx) currently has 5 tabs. A 6th tab — **Atributos** — is added.

- One field block per dim, in `sort_order`.
- Single-value dim → `<Select>` with placeholder "Sin clasificar"; clear button shows "× quitar".
- Multi-value dim → `<Select mode="multiple">`. For `discount_type`, options are grouped (`<OptGroup label="% Descuento">`, `"BOGO"`, `"Multi"`, `"Precio Fijo"`) using the same prefix-derived grouping as 4a.
- Below each select: a small badge showing the source of the current value(s). "Clasificado por: keyword (regla 2D50)" in muted grey, or "Editado por: zacarias@… · 2026-04-22 10:14" in operator-edit color. Multiple sources for multi-value dims show one row per value.

**Save:** form's existing dirty-tracking. On Save, `PUT /api/v1/products/skus/:code/attributes` with the full assignment set; optimistic cache update for `['skuAttributes', code]`; invalidate `['skuList']`.

**"Reset to keyword-derived" button** at tab footer. Sends PUT with empty `assignments` array — the atomic-replace semantics wipe operator + excel rows for this SKU and the underlying keyword-derived rows reappear in the next read response. Useful when an operator override turns out worse than the auto-classification.

#### 4c. SKU list filter — extend `/products/skus`

Adds a fifth filter group above the existing strip: **Atributos** (collapsible). Inside, one labeled multi-select per dim. Each select feeds into the URL and into the backend query as `attr.<dim>=<value>[,<value>...]`. The existing `Run query` button submits everything together.

Selected attribute filters appear as removable pills in the active-filter summary above the table, alongside Vendor / Category / etc.

A hideable "Atributos" column renders compact badges per assignment (e.g., `ZB · MAGI · 50%`). Single-value-dim labels first; multi-value-dim values last and color-coded by mechanic prefix for `discount_type`. Hidden by default to keep the list dense.

#### 4d. Inquiry page — read-only badge strip

The Product Inquiry page at [`apps/web/src/pages/products/inquiry/`](../../../apps/web/src/pages/products/inquiry/) gets a new badge strip under the header (above the pricing panel) showing the four dims as compact pills:

```
Comprador: ZB    Empresa: IBL    Cadena: MAGI    Descuento: 50% off, L99
```

Unclassified dims render as muted "Sin clasificar". Click-through is informational only in Phase 1 (Phase 2 candidate: clicking pivots the SKU list pre-filtered by that pill).

#### 4e. Navigation

[`apps/web/src/components/AppLayout.tsx`](../../../apps/web/src/components/AppLayout.tsx) `Products` menu gains one new item: **Atributos** → `/products/attributes`.

The 6th tab on the SKU form (4b) and the filter group on the SKU list (4c) live inside existing pages and don't need menu entries.

#### Files added

```
apps/web/src/types/productsAttributes.ts
apps/web/src/services/productsAttributesApi.ts
apps/web/src/hooks/useProductsAttributes.ts
apps/web/src/pages/products/attributes/CatalogPage.tsx
apps/web/src/pages/products/attributes/CatalogDimensionPanel.tsx
apps/web/src/pages/products/skus/SkuAttributesTab.tsx
apps/web/src/components/products/AttributeBadgeStrip.tsx
apps/web/src/components/products/AttributeFilterGroup.tsx
```

The SKU list page and inquiry page get small in-place edits to wire the new pieces in.

### 5. Testing and rollout

#### Test surface

- **Migration test** — verifies the three tables exist, the composite PK + facet index are present, and the cross-schema soft-ref pattern is not accidentally a hard FK.
- **Seed pipeline tests** — catalog upsert idempotency; CSV-to-DB orphan detection; tokenizer correctness (`50` does not match `2D50`); token-rule mapping (every rule resolves to a real `(dim, value)`); precedence (operator row preserved across re-seed); coverage-report shape.
- **Repository / service tests** — `bulkAssign` validation (single-value cap, unknown value, value-belongs-to-wrong-dim); atomic-replace semantics on PUT (keyword rows preserved, operator + excel rows replaced); audit-log entry written.
- **Route tests** — endpoint shapes; `attr.X=` filter intersection-across-dims, union-within-dim; HTTP status mapping (200 / 422 / 404).
- **UI tests** (Vitest + RTL) — `CatalogPage` renders all 4 dims; `SkuAttributesTab` round-trip; `AttributeFilterGroup` produces expected URL params.
- **Integration smoke** (manual) — `pnpm seed:sku-attributes` prints expected coverage (~92% `buyer`, ~57% `company`, ~6% `store_chain`); `/products/skus?attr.buyer=zb&attr.discount_type=pct_50` returns plausible result count; `/products/inquiry/<known-classified-SKU>` shows the badge strip.

#### Build order (commits to `master`, each ships independently)

1. Schema migration `20260422_app_sku_extended_attributes` (no data, just tables + indexes + the orphans view).
2. Seed CSVs in repo + `seed:sku-attributes` script (catalog upsert + keyword derivation + coverage report).
3. Repository + service layer (`AttributesRepository`, `attributesService`); internal contract `productsAttributes.bulkAssign(...)` exposed for `utilities`.
4. Routes + tests (five endpoints land together; coverage endpoint included).
5. Catalog page + nav entry (UI 4a + 4e).
6. SKU form Atributos tab (UI 4b).
7. SKU list filter group + Atributos column (UI 4c).
8. Inquiry badge strip (UI 4d).

Steps 5–8 are independent of each other. 3 and 4 are independent of 5–8 — the API can land before the UI consumes it.

#### Mirror-reload behaviour

When the operator runs `pnpm sync:rics`, `rics_mirror` is rebuilt atomically. The `app.sku_attribute_*` rows survive (different schema). Rows may become orphaned if a SKU is removed from RICS — surfaced via the `app.sku_attribute_orphans` view. A one-line orphan-count check is added to `pnpm verify:rics-mirror` so the operator sees the number after each sync. Recommended (not required) operator workflow after sync: `pnpm sync:rics && pnpm seed:sku-attributes`.

#### Known gaps

- **`total_skus` denominator definition.** Coverage % depends on what counts as "the catalog". Phase 1 uses `COUNT(*) FROM rics_mirror.inventory_master` (no status filter); excluding discontinued SKUs is a coverage-endpoint tweak, not a schema change.
- **Query plan under heavy attribute filtering.** Adding 4 `EXISTS` subqueries to the SKU list query is unmeasured. The composite index `(dimension_id, value_id, sku_code)` should handle each subquery in O(log n + k); typical operator queries combine 1–2 attribute filters with a vendor / category narrowing. Measure if the page slows past ~500 ms.
- **Whitespace-tokenizer edge cases.** The split is `\s+` and handles spaces and tabs. RICS keywords are space-separated by convention. If a future export introduces commas or semicolons, the tokenizer needs revisiting.

## Rejected alternatives

- **Approach A — wide table with 15 typed columns.** A single `app.sku_extended_attribute` keyed by `sku_code` with one column per dim, each backed by a Postgres enum or CHECK-constrained VARCHAR. Rejected because adding a new dim or value requires a migration, multi-value dims (`discount_type`, plus several future footwear dims) cannot be modelled cleanly, and the operator has explicitly flagged that values evolve over time.
- **Approach C — JSONB column.** A `app.sku_extended_attribute` keyed by `sku_code` with a single `attributes jsonb` column. Schema-flexible but loose-typed; validation lives in app code, invalid values can land silently if the validator is bypassed. Rejected because the dim catalog is bounded and known — JSONB's flexibility is unnecessary and the type-safety loss is real.
- **Hard FK from `app.sku_attribute_assignment.sku_code` to `rics_mirror.inventory_master.sku`.** Rejected because the mirror is rebuilt atomically on each `pnpm sync:rics`. The cross-schema FK would either cascade-delete classifications or block the swap. Soft reference + orphans view covers the same intent without operational fragility.
- **PATCH-per-dim writes.** Considered as an alternative to the atomic-replace PUT. PATCH would be needed if multiple users could edit the same SKU's attributes simultaneously. Rejected for Phase 1 because the operator-edit workflow is one-form-one-user; "save the form" semantics map to a single atomic PUT. PATCH can be added later if a real concurrency need surfaces.
- **DB-level partial unique indexes for single-value dim enforcement.** Rejected because it would hard-code the multi/single split into a migration; flipping a dim's cardinality (e.g., promoting `store_chain` to multi-value if a SKU can target two chains) would require a schema change instead of a single-row data update.
- **Excel as the permanent source of truth.** Considered briefly during the brainstorm; rejected by the operator. Postgres becomes authoritative once seeded; the Excel files (when used for the deferred 15-dim phase) are a one-time import path.
- **`MB` and `CXB` as attribute values.** Both were named in the initial brainstorm. Excluded from the Phase 1 catalog because neither token appears in `rics_mirror.inventory_master.key_words`; `CXB` was a typo for `CXN` (Corporación Xena), and `MB` does not exist in the data and was confirmed scratch.
- **`UN` as a store-chain value.** Token appears 5,766 times in the keyword data; operator direction is to ignore it. If a real meaning surfaces, add a row to `values.csv` and `keyword_rules.csv` and re-seed.
- **Fuzzy or ML-based keyword derivation.** Phase 1 is exact-token-match only. Smarter inference is an enhancement once exact-match coverage is measured.

## Related

- [`docs/modules/products/rics-module-specs.md`](../../modules/products/rics-module-specs.md) — module spec; this design extends the products module's surface.
- [`docs/dev/specs/2026-04-18-products-phase1-design.md`](2026-04-18-products-phase1-design.md) — Phase-1 implementation contract for the broader products module; this work follows the same repository / service / route layering.
- [`docs/dev/specs/2026-04-21-utilities-batch-change-design.md`](2026-04-21-utilities-batch-change-design.md) — utilities batch-change design; the seam for bulk re-classification of these dims.
- [`docs/operations/rics-mirror-sync.md`](../../operations/rics-mirror-sync.md) — RICS → Postgres mirror operations reference; orphan-count check is added to the post-sync verification per Section 5.
- [`CLAUDE.md`](../../../CLAUDE.md) — project rollout phases (this work is Phase A) and the rule that `app.*` is reserved for module-owned additive tables (this is the first occupant).
