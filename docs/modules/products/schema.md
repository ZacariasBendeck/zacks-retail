# Products — Schema

> **Scope of this file.** Documents the **extended-attributes layer** in the `app` schema (the foundation introduced 2026-04-22). The broader products schema (Sku, SkuPrice, Vendor, taxonomy, scheduled changes, etc.) is sketched in [`rics-module-specs.md`](rics-module-specs.md) §Data model sketch and migrates into this file as Phase A → B work lands.

## Schema home

| Schema | Role | Tables documented here |
|---|---|---|
| `app` | Module-owned additive tables (preserved across `pnpm sync:rics` reloads) | `attribute_dimension`, `attribute_value`, `sku_attribute_assignment`, `sku_attribute_orphans` (view) |
| `rics_mirror` | Read-only RICS mirror — rebuilt atomically on every sync | `inventory_master.sku`, `inventory_master.key_words` (consumed by the seed pipeline) |

Per [`CLAUDE.md`](../../../CLAUDE.md), `app.*` is reserved for module-owned additive tables; this is the first occupant.

## Tables

### `app.attribute_dimension`

Classification dimensions. Bounded by what the catalog defines; new dims are data-only inserts via the admin UI (no migration required).

```sql
CREATE TABLE app.attribute_dimension (
  id              SMALLSERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,         -- 'buyer', 'company', 'color', 'fit', 'closure_type', ...
  label_es        TEXT NOT NULL,
  description_es  TEXT,
  sort_order      SMALLINT NOT NULL,
  is_multi_value  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

| Column | Type | Notes |
|---|---|---|
| `id` | `smallserial` | Surrogate primary key. Surrogate is preferred over a natural key (`code`) so renaming a dim is a single-row update. |
| `code` | `text` | Stable identifier used in API request/response and CSV seed files. Lowercase by convention. |
| `label_es` | `text` | Spanish-language UI label. |
| `sort_order` | `smallint` | UI display order across dims. |
| `is_multi_value` | `boolean` | When `true`, a single SKU may carry multiple values for this dim (e.g. `discount_type` = `pct_50` AND `fixed_l99`). Enforced at the service layer, not via DB constraint — see `decisions.md`. |

**Family scoping is many-to-many** via `app.attribute_family_rule` (see below). A dim with zero rule rows is **universal** — applies to every family. Introduced 2026-04-23 via migration `20260423120000_attribute_family_rules`; the previous single-FK `product_family` column was dropped.

### `app.attribute_family_rule`

Join table between `attribute_dimension` and `product_family`. Presence of ≥1 rule flips a dim from universal to family-scoped.

```sql
CREATE TABLE app.attribute_family_rule (
  dimension_id  SMALLINT NOT NULL REFERENCES app.attribute_dimension(id) ON DELETE CASCADE,
  family_code   TEXT     NOT NULL REFERENCES app.product_family(code)    ON DELETE RESTRICT,
  enabled       BOOLEAN  NOT NULL DEFAULT true,
  is_required   BOOLEAN  NOT NULL DEFAULT false,
  sort_order    SMALLINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by    TEXT     NOT NULL DEFAULT 'seed',
  PRIMARY KEY (dimension_id, family_code)
);

CREATE INDEX attribute_family_rule_family_idx
  ON app.attribute_family_rule(family_code);
```

| Column | Type | Notes |
|---|---|---|
| `enabled` | `boolean` | When `false`, the dim is hidden for this family on new-assignment dropdowns (but existing rows stay valid). |
| `is_required` | `boolean` | When `true`, saving a SKU in this family without a value in this dim returns 409. |
| `sort_order` | `smallint` | Per-family render order, overrides `attribute_dimension.sort_order` when rendering a family-specific form. |
| `updated_by` | `text` | Seed migration (`migration:20260423120000`), operator email, or `seed`. |

Deletion cascade: removing an `attribute_dimension` also removes its rule rows. Removing a `product_family` is blocked (`ON DELETE RESTRICT`) if any rule still points at it — this matches the current UI policy that the 11 families are a fixed set.

### `app.attribute_value`

The allowed values for each dimension.

```sql
CREATE TABLE app.attribute_value (
  id              SMALLSERIAL PRIMARY KEY,
  dimension_id    SMALLINT NOT NULL REFERENCES app.attribute_dimension(id) ON DELETE RESTRICT,
  code            TEXT NOT NULL,                 -- 'zb', 'pct_50', 'magi', 'rojo', ...
  label_es        TEXT NOT NULL,
  sort_order      SMALLINT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dimension_id, code)
);
```

`is_active=false` hides the value from new-assignment dropdowns without deleting; existing rows in `sku_attribute_assignment` stay intact. The admin UI offers **Desactivar** as a soft alternative to the FK-Restrict hard delete.

| Column | Type | Notes |
|---|---|---|
| `id` | `smallserial` | Surrogate primary key. |
| `dimension_id` | `smallint` | FK to `attribute_dimension`. `ON DELETE RESTRICT` — deleting a dim with values requires explicit cleanup. |
| `code` | `text` | Stable identifier. For `discount_type`, the prefix encodes the mechanic (`pct_*`, `bogo_*`, `multi_*`, `fixed_*`); see decisions.md for the naming convention. |
| `label_es` | `text` | Spanish-language UI label. |
| `sort_order` | `smallint` | UI display order within the dim. |
| Unique constraint | `(dimension_id, code)` | A `code` is unique within its dim but may be reused across dims (e.g. `mb` could exist for two dims if needed). |

### `app.sku_attribute_assignment`

The N:M mapping between SKUs and (dim, value) pairs. Multi-value dims simply get multiple rows for the same `(sku_code, dimension_id)`.

```sql
CREATE TABLE app.sku_attribute_assignment (
  sku_code        TEXT NOT NULL,                  -- soft ref to rics_mirror.inventory_master.sku
  dimension_id    SMALLINT NOT NULL REFERENCES app.attribute_dimension(id) ON DELETE RESTRICT,
  value_id        SMALLINT NOT NULL REFERENCES app.attribute_value(id) ON DELETE RESTRICT,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by     TEXT,                           -- user id, or 'seed:keyword:<rule_hash>', or 'seed:excel:<file>'
  PRIMARY KEY (sku_code, dimension_id, value_id)
);

CREATE INDEX ix_sku_attr_facet
  ON app.sku_attribute_assignment (dimension_id, value_id, sku_code);
```

| Column | Type | Notes |
|---|---|---|
| `sku_code` | `text` | **Soft reference** to `rics_mirror.inventory_master.sku`. No FK — see schema decisions below. |
| `dimension_id` | `smallint` | FK to `attribute_dimension`. |
| `value_id` | `smallint` | FK to `attribute_value`. |
| `assigned_at` | `timestamptz` | When this assignment was made. |
| `assigned_by` | `text` | Source of the assignment. Drives precedence (operator > excel > keyword). See [`decisions.md`](decisions.md). |
| PRIMARY KEY | `(sku_code, dimension_id, value_id)` | Naturally supports multi-value dims (multiple rows per `(sku, dim)`). For single-value dims the service layer enforces "at most one." |

#### Indexes

- **Composite PK** `(sku_code, dimension_id, value_id)` — covers per-SKU reads (all attributes for one SKU) without an extra index.
- **`ix_sku_attr_facet` `(dimension_id, value_id, sku_code)`** — covers facet/filter reads ("which SKUs have `buyer = zb`") with a single index range scan plus index-only on `sku_code`.

### `app.sku_attribute_orphans` (view)

Surfaces assignments whose `sku_code` is no longer present in the current `rics_mirror.inventory_master`. This happens when a SKU is removed from RICS between seed runs; the soft reference does not auto-cascade.

```sql
CREATE VIEW app.sku_attribute_orphans AS
  SELECT a.sku_code, COUNT(*) AS assignment_count
  FROM app.sku_attribute_assignment a
  WHERE NOT EXISTS (
    SELECT 1 FROM rics_mirror.inventory_master im WHERE im.sku = a.sku_code
  )
  GROUP BY a.sku_code;
```

The post-sync verification at [`docs/operations/rics-mirror-sync.md`](../../operations/rics-mirror-sync.md) reports the orphan count after each `pnpm sync:rics` so the operator notices growth.

## Schema decisions

The five non-obvious calls — full ADR shape lives in [`decisions.md`](decisions.md).

1. **No FK from `app.sku_attribute_assignment.sku_code` to `rics_mirror.inventory_master.sku`.** The mirror is rebuilt atomically on every sync. A cross-schema FK would either cascade-delete classifications during the swap or block the swap. Soft reference + orphans view covers the same intent without operational fragility. This is the general pattern every future `app.*` → `rics_mirror.*` reference will follow.
2. **Single-value vs. multi-value enforced at the service layer, not the DB.** The `is_multi_value` flag drives service behaviour (single-value = DELETE-then-INSERT; multi-value = upsert). DB-level partial unique indexes were rejected: they would hard-code the multi/single split into a migration, defeating the goal of changing dim cardinality without schema work.
3. **Surrogate IDs over natural keys.** Renaming a value (typo fix, label change) becomes a single-row update, not a fan-out across assignments. Storage cost (4 bytes per assignment vs. 6–20 for TEXT) more than pays for itself across the catalog.
4. **No history table.** `assigned_at` + `assigned_by` cover the immediate need ("who classified this and when"). A full re-classification log is out of scope until requested.
5. **"Pending classification" = absence of row.** No sentinel value, no separate state column. Dimensions with no values assigned yet (e.g. future `outsole_material` pending physical inspection) appear in coverage reports as 0% coverage. The next phase's coverage panel surfaces this for the operator.

## Migration

```
apps/api/prisma/migrations/20260422_app_sku_extended_attributes/
  migration.sql
```

Migration creates the three tables, the composite index, and the orphans view. No data — all population is via the seed script.

The Prisma `schema.prisma` gets matching multi-schema model entries:

```prisma
// In apps/api/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public", "app", "rics_mirror", "platform"]
}

model AttributeDimension {
  id            Int                       @id @default(autoincrement()) @db.SmallInt
  code          String                    @unique
  labelEs       String                    @map("label_es")
  descriptionEs String?                   @map("description_es")
  sortOrder     Int                       @map("sort_order") @db.SmallInt
  isMultiValue  Boolean                   @default(false) @map("is_multi_value")
  createdAt     DateTime                  @default(now()) @map("created_at") @db.Timestamptz()
  values        AttributeValue[]
  assignments   SkuAttributeAssignment[]
  @@map("attribute_dimension")
  @@schema("app")
}

model AttributeValue {
  id           Int                       @id @default(autoincrement()) @db.SmallInt
  dimensionId  Int                       @map("dimension_id") @db.SmallInt
  code         String
  labelEs      String                    @map("label_es")
  sortOrder    Int                       @map("sort_order") @db.SmallInt
  createdAt    DateTime                  @default(now()) @map("created_at") @db.Timestamptz()
  dimension    AttributeDimension        @relation(fields: [dimensionId], references: [id], onDelete: Restrict)
  assignments  SkuAttributeAssignment[]
  @@unique([dimensionId, code])
  @@map("attribute_value")
  @@schema("app")
}

model SkuAttributeAssignment {
  skuCode      String              @map("sku_code")
  dimensionId  Int                 @map("dimension_id") @db.SmallInt
  valueId      Int                 @map("value_id") @db.SmallInt
  assignedAt   DateTime            @default(now()) @map("assigned_at") @db.Timestamptz()
  assignedBy   String?             @map("assigned_by")
  dimension    AttributeDimension  @relation(fields: [dimensionId], references: [id], onDelete: Restrict)
  value        AttributeValue      @relation(fields: [valueId], references: [id], onDelete: Restrict)
  @@id([skuCode, dimensionId, valueId])
  @@index([dimensionId, valueId, skuCode], map: "ix_sku_attr_facet")
  @@map("sku_attribute_assignment")
  @@schema("app")
}
```

## Seed catalog

All values land via [`apps/api/scripts/seed-sku-attributes.ts`](../../../apps/api/scripts/seed-sku-attributes.ts) reading three CSVs:

```
apps/api/seeds/sku_extended_attributes/
  dimensions.csv          # code,label_es,description_es,sort_order,is_multi_value
  values.csv              # dimension_code,code,label_es,sort_order
  keyword_rules.csv       # rics_keyword_token,dimension_code,value_code
```

CSV (not XLSX) for diff-friendliness under git. The script is idempotent; re-runs upsert catalog changes and rebuild keyword-derived assignments.

### Dimensions (4 rows)

| `code` | `label_es` | `is_multi_value` |
|---|---|---|
| `buyer` | Comprador | no |
| `company` | Empresa | no |
| `store_chain` | Cadena | no |
| `discount_type` | Tipo de Descuento | **yes** |

### Values per dimension

#### `buyer` (4 values)

| `code` | `label_es` |
|---|---|
| `zb` | Zacarias Bendeck |
| `ab` | AB |
| `axb` | AXB |
| `dm` | Doña Mónica |

(`ab` and `axb` carry their codes as labels until full names are provided.)

#### `company` (3 values)

| `code` | `label_es` |
|---|---|
| `ibl` | Inversiones Benlow |
| `cxn` | Corporación Xena |
| `cct` | Compañía Comercial de Tegucigalpa |

#### `store_chain` (3 values)

| `code` | `label_es` |
|---|---|
| `magi` | Magic Shoes |
| `unli` | Unlimited |
| `fash` | Fashion |

#### `discount_type` (51 values, mechanic-prefixed)

| Mechanic prefix | Values |
|---|---|
| `pct_*` (plain percent off) | 10, 20, 25, 30, 40, 45, 50, 60, 70, 80, 85, 90 |
| `bogo_*` (second at `<n>%`) | 15, 20, 30, 35, 40, 45, 50, 55, 60, 75, 99 |
| `multi_*` (buy-N-pay-1) | `2x1`, `3x1`, `4x1`, `3x2` |
| `fixed_*` (fixed-price endings, lempiras) | l19, l25, l29, l39, l49, l59, l69, l79, l99, l199, l299, l399, l499, l599, l1999 |

Mechanic prefix in `value.code` is load-bearing: facet UI groups by prefix; reporting filters with `WHERE value.code LIKE 'pct_%'`.

### Keyword rules

Each rule is a triple `(rics_keyword_token, dimension_code, value_code)`. Token comparison is **exact-match, case-insensitive, whitespace-tokenized** against `rics_mirror.inventory_master.key_words`. Tokens not in the rule table are ignored.

The full rule table lives in [`apps/api/seeds/sku_extended_attributes/keyword_rules.csv`](../../../apps/api/seeds/sku_extended_attributes/keyword_rules.csv) — too long to mirror inline. Buyer / company / store-chain rules are 1:1 with the value codes (uppercased token → lowercase value code). Discount rules map RICS tokens (`50` → `pct_50`, `2D50` → `bogo_50`, `2X1` → `multi_2x1`, `L99` → `fixed_l99`) and exclude any non-discount numerics like `2208`/`ENE25` because they are not in the rule table.

## Related

- [`api.md`](api.md) — endpoints that read/write these tables.
- [`tasks.md`](tasks.md) — the build order; step 1 is the migration, step 2 is the seed pipeline.
- [`decisions.md`](decisions.md) — full ADR for each schema decision.
- [`rics-module-specs.md`](rics-module-specs.md) — broader products module surface (Sku, Vendor, taxonomy) that has yet to migrate into this file.
- [`docs/operations/rics-mirror-sync.md`](../../operations/rics-mirror-sync.md) — how `rics_mirror` is rebuilt and how the orphans view is checked post-sync.
