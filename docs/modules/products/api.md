# Products — API

> **Scope of this file.** Documents endpoints for the **extended-attributes layer** (introduced 2026-04-22). Broader products endpoints (SKU CRUD, vendor admin, taxonomy, pricing, labels, UPC) are sketched in [`rics-module-specs.md`](rics-module-specs.md) §API surface and migrate into this file as Phase A → B work lands.

## Conventions

- **Base path**: `/api/v1/products`.
- **Auth**: operator-mode only. Currently behind frontend gate; no per-route auth check in Phase 1.
- **Error contract**: matches the products-module convention from [`docs/dev/specs/2026-04-18-products-phase1-design.md`](../../dev/specs/2026-04-18-products-phase1-design.md):
  - `404` — target row does not exist.
  - `422` — validation failure (`ConstraintViolation`); response body includes field-level error.
  - `409` — duplicate primary key / concurrent modification.
  - `200` / `201` — success.
- **Audit log**: every write goes through `ProductsAuditLog` (`actor`, `action`, `target_table`, `target_pk`, `payload_json`, `timestamp`).

## Catalog endpoints (read-only)

### `GET /api/v1/products/attributes/dimensions`

List the dimension + value catalog. Powers the catalog viewer, the per-SKU edit dropdowns, and the storefront facet UI (later).

**Query parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `withCounts` | `boolean` | `false` | When `true`, joins `sku_attribute_assignment` to populate `sku_count` per value. |

**Response 200:**

```jsonc
[
  {
    "code": "buyer",
    "label_es": "Comprador",
    "sort_order": 10,
    "is_multi_value": false,
    "values": [
      { "code": "zb",  "label_es": "Zacarias Bendeck", "sort_order": 10, "sku_count": 57574 },
      { "code": "ab",  "label_es": "AB",               "sort_order": 20, "sku_count": 76664 },
      { "code": "axb", "label_es": "AXB",              "sort_order": 30, "sku_count": 2824  },
      { "code": "dm",  "label_es": "Doña Mónica",      "sort_order": 40, "sku_count": 45854 }
    ]
  }
  // ...company, store_chain, discount_type
]
```

`sku_count` is omitted when `withCounts` is not set, so a dropdown loader does not pay the COUNT cost.

### `GET /api/v1/products/attributes/coverage`

Per-dimension classification coverage. Powers the coverage panel and the `seed:sku-attributes` script's phase-4 report.

**Response 200:**

```jsonc
[
  {
    "dimension_code": "buyer",
    "total_skus": 198342,
    "classified_skus": 182916,
    "coverage_pct": 92.2,
    "by_source": { "keyword": 182916, "excel": 0, "operator": 0 }
  }
  // ...per dim
]
```

`total_skus` denominator is `COUNT(*) FROM rics_mirror.inventory_master` (no status filter). Excluding discontinued SKUs from the denominator is a future tweak — see `tasks.md` open backlog.

## Per-SKU endpoints

### `GET /api/v1/products/skus/:code/attributes`

Fetch all attribute assignments for one SKU. The existing `GET /api/v1/products/skus/:code` (full SKU detail) does **not** auto-include attributes; the detail page makes a parallel request when it needs them.

**Path parameters:**

| Param | Type | Notes |
|---|---|---|
| `code` | `string` | SKU code (15-char max per `inventory_master.sku`). |

**Response 200:** uniform `{ is_multi_value, values: [...] }` per dim, even for unclassified single-value dims (empty `values` array). Generic rendering becomes trivial; the client takes `values[0]` for single-value display.

```jsonc
{
  "sku_code": "ZB12345",
  "by_dimension": {
    "buyer": {
      "is_multi_value": false,
      "values": [{
        "code": "zb",
        "label_es": "Zacarias Bendeck",
        "assigned_by": "seed:keyword:r_buyer_zb",
        "assigned_at": "2026-04-22T10:14:33Z"
      }]
    },
    "company":     { "is_multi_value": false, "values": [] },
    "store_chain": { "is_multi_value": false, "values": [{ "code": "magi", "label_es": "Magic Shoes", ... }] },
    "discount_type": {
      "is_multi_value": true,
      "values": [
        { "code": "pct_50",    "label_es": "50% off",         ... },
        { "code": "fixed_l99", "label_es": "L99 precio fijo", ... }
      ]
    }
  }
}
```

**Response 404:** SKU does not exist in `rics_mirror.inventory_master`.

### `PUT /api/v1/products/skus/:code/attributes`

Operator override of attribute assignments for one SKU. Atomic-replace semantics: in one transaction, deletes every row for this SKU whose `assigned_by` does not start with `seed:keyword:`, then inserts the new set tagged with the current user id. Keyword-derived rows stay untouched and are rebuilt on next seed run.

**Request body:**

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

An empty `assignments` array is permitted and used by the "Reset to keyword-derived" button — the atomic-replace wipes operator + excel rows for this SKU; the underlying keyword rows reappear in the next read.

**Validation (`422 ConstraintViolation`):**

- Each `dimension_code` and `value_code` must exist; `value_code` must belong to the named dim.
- For any `is_multi_value=false` dim, at most one assignment in the request body.

**Response 200:** the new state in the same shape as `GET .../attributes`.

**Response 404:** SKU does not exist in `rics_mirror.inventory_master`.

**Audit log:** `action='sku_attributes_set', target_table='app.sku_attribute_assignment', target_pk=<sku_code>, payload_json={ added: [...], removed: [...], unchanged: [...] }`.

## SKU list filter — extension to existing endpoint

`GET /api/v1/products/skus` (existing — see [`rics-module-specs.md`](rics-module-specs.md) §API surface) gains namespaced attribute-filter params:

```
GET /api/v1/products/skus?attr.buyer=zb,ab&attr.discount_type=pct_50,bogo_50&attr.store_chain=magi
```

| Param shape | Semantics |
|---|---|
| `attr.<dimension_code>=<value_code>[,<value_code>...]` | Within a dim → union (`OR`). |
| Multiple `attr.X=` params across different dims | Across dims → intersection (`AND`). |

Matches the existing convention of `vendors=`, `categories=`, `seasons=` on the same endpoint. Each `attr.X=` translates to one `EXISTS` subquery against `sku_attribute_assignment`:

```sql
EXISTS (
  SELECT 1
  FROM app.sku_attribute_assignment a
  JOIN app.attribute_value v ON v.id = a.value_id
  JOIN app.attribute_dimension d ON d.id = v.dimension_id
  WHERE a.sku_code = im.sku
    AND d.code = $1
    AND v.code = ANY($2::text[])
)
```

The `ix_sku_attr_facet (dimension_id, value_id, sku_code)` index handles each subquery in O(log n + k).

## Internal contract — `bulkAssign`

For cross-module use (specifically by [`utilities`](../utilities/) batch-change). Not exposed as an HTTP endpoint.

```ts
productsAttributes.bulkAssign({
  skuCodes: string[],
  dimension_code: string,
  value_codes: string[],     // multiple only when dim is_multi_value
  actor: string              // user id; landed in assigned_by
}): Promise<{ added: number, removed: number, unchanged: number }>
```

Same validation as `PUT .../attributes`. Same atomic-replace semantics, applied per SKU. Wraps the whole batch in a single transaction; rolls back fully on any per-SKU validation error.

## Admin endpoints (added 2026-04-23)

The attribute catalog + family rules are administered in-app at `/products/attributes` (dimensions + values + dim-side family rules) and `/products/families` (families, category mapping, family-side rules). Every write audits into `ProductsAuditLog`.

### Dimension CRUD

| Method + path | Purpose | Notable response |
|---|---|---|
| `POST   /products/attributes/dimensions` | Create a dimension (`{ code, labelEs, descriptionEs?, sortOrder, isMultiValue, familyCode? }`). Omitted/null `familyCode` creates a universal dimension; a supplied `familyCode` creates the dimension plus an enabled family rule atomically. | `201` with the created row. |
| `PATCH  /products/attributes/dimensions/:code` | Update labelEs / descriptionEs / sortOrder / isMultiValue. | `200`. |
| `DELETE /products/attributes/dimensions/:code` | Hard delete. **409** if any `sku_attribute_assignment` references it. |  |
| `POST   /products/attributes/dimensions/reorder` | Bulk `sortOrder` update (`{ entries: [{code, sortOrder}...] }`). | `200`. |

### Family rules (dimension side)

| Method + path | Purpose |
|---|---|
| `GET /products/attributes/dimensions/:code/family-rules` | Return the dim's rule rows (empty array = universal). |
| `PUT /products/attributes/dimensions/:code/family-rules` | Replace set. Body: `{ universal: true }` for universal, or `{ universal: false, rules: [{familyCode, enabled, isRequired, sortOrder?}...] }`. |

### Value CRUD

| Method + path | Purpose |
|---|---|
| `POST   /products/attributes/dimensions/:code/values` | Create value. `201`. |
| `PATCH  /products/attributes/values/:id` | Update labelEs / sortOrder / isActive. |
| `DELETE /products/attributes/values/:id` | Hard delete. **409** if referenced by assignments. |
| `POST   /products/attributes/values/:id/deactivate` | Shortcut: sets `isActive=false` (survives FK Restrict; preserves history). |
| `POST   /products/attributes/values/:id/merge-into/:targetId` | Reassign all `sku_attribute_assignment` rows from `:id` to `:targetId` (skipping SKUs that already carry the target), delete source. Both must share dimension. |
| `POST   /products/attributes/dimensions/:code/values/reorder` | Bulk `sortOrder` update. |

### Macro attribute derivation rules

Macro attributes are derived rollups from another single-value attribute. The first production use is `color -> color_family`: operators edit the mapping table, while SKU-level `color_family` assignments are rebuilt automatically and cannot be edited directly on the SKU.

| Method + path | Purpose |
|---|---|
| `GET /products/attributes/macros` | List existing macro mappings, including mapped count vs source-value count. |
| `GET /products/attributes/macros/:sourceDimensionCode/:targetDimensionCode` | Return every source value with its mapped target macro value, if any. |
| `PUT /products/attributes/macros/:sourceDimensionCode/:targetDimensionCode` | Replace the mapping set. Body: `{ rules: [{ sourceValueCode, targetValueCode }] }`; `targetValueCode: null` clears a source value mapping. Rebuilds derived SKU assignments for that source/target pair. |

Validation:

- Source and target dimensions must exist and must be different.
- Source and target dimensions must be single-value dimensions.
- Each `sourceValueCode` must belong to the source dimension.
- Each non-null `targetValueCode` must belong to the target macro dimension.
- Any target dimension that appears in `app.attribute_derivation_rule` is blocked from manual SKU assignment and utility bulk assignment.

### Family admin

| Method + path | Purpose |
|---|---|
| `POST /products/families` | Create a product family (`{ code, labelEs, descriptionEs?, sortOrder? }`). |
| `PATCH /products/families/:code` | Update labelEs / descriptionEs / sortOrder. |
| `PUT /products/families/:code/categories` | Replace the set of RICS category numbers mapped to this family (one category maps to one family — reassignment is upsert). Body: `{ categories: number[] }`. Appends `?force=true` to override the orphan-assignment soft block. |
| `GET /products/families/:code/attribute-rules` | Reverse view of rule rows for this family. |
| `PUT /products/families/:code/attribute-rules` | Replace the family's full rule set (inverse of the dimension-side endpoint). |
| `PATCH /products/families/:code/attribute-rules/:dimCode` | Toggle `enabled`/`isRequired`/`sortOrder` for one (dim, family) pair. |
| `DELETE /products/families/:code/attribute-rules/:dimCode` | Remove the rule row. |

### SKU-save validation (enforced in `PUT /products/skus/:code/attributes`)

1. **Value-dimension integrity** — `value_id` must belong to `dimension_id`.
2. **`is_active` gate** — new assignments can only reference `is_active=true` values.
3. **Family gating** — if the dim has ≥1 rule row, the SKU's family must have an enabled rule. Universal dims (zero rule rows) always pass. Errors: `409 "Dimensión X no aplica a la familia Y"`.
4. **Required-attribute enforcement** — for every dim with `is_required=true` for the SKU's family, the post-replace state must have ≥1 assignment (keyword-derived assignments that stay through the replace also satisfy the requirement). Errors: `409` with the list of missing dim codes.

## Planned Matching Set / Conjunto endpoints

> Warning: May be stale per 2026-04-29 /index-knowledge pass: matching-set create/edit and buying-plan endpoints have shipped under the Products module. Review this section and promote it from planned contract to current API contract.

Matching sets belong to the Products module, not Inventory. The current implementation plan is [`../../dev/plans/2026-04-28-products-matching-sets.md`](../../dev/plans/2026-04-28-products-matching-sets.md).

Correct backend base path:

```text
/api/v1/products/matching-sets
```

Correct frontend route:

```text
/products/matching-sets
```

Do **not** add `/api/v1/inventory/matching-sets` or `/inventory/matching-sets`.

Planned backend files:

- `apps/api/src/routes/products/matchingSetRoutes.ts`
- `apps/api/src/services/products/matchingSetService.ts`

Planned mount point in `apps/api/src/app.ts`:

```ts
app.use('/api/v1/products/matching-sets', productsMatchingSetRoutes);
app.use('/api/v1/products/sku-drafts', productsSkuDraftRoutes);
app.use('/api/v1/products/skus/lookup', productsSkuLookupRoutes);
app.use('/api/v1/products/skus', productsSkuRoutes);
```

The matching-set tables must reference `app.sku(id)` and `app.vendor(code)`. They must not soft-reference `rics_mirror.inventory_master`.

Matching-set material fields represent exact shared fabric identity. `materialCode` and `materialLabel` are matching-set header fields, not generic SKU attributes. If a separate fabric vendor is required, it should be exposed as an optional matching-set header field backed by controlled vendor data. Broad fabric classifications such as fabric family or fabric weight bucket belong in SKU attributes when needed for filtering, reporting, or web display.

## Out of scope (Phase 1)

- **Public storefront facet endpoints.** Storefront has its own router with anonymous auth + edge caching requirements. The shape of `/attributes/dimensions?withCounts=true` is the data the storefront facet endpoint will consume internally; the storefront-side endpoint is a separate brainstorm.
- **Per-source filtering** ("give me only operator-overridden assignments"). The `assigned_by` field is in the read response; clients filter if needed.
- **Bulk SKU-attribute fetch** (`POST /attributes/by-sku-codes`). Not building speculatively; add when a use case lands.
- **Delete of `ProductFamily` rows** - not exposed. Creating and editing product families is supported through `/api/v1/products/families`; deletion remains blocked because categories, SKU assignments, and attribute rules may reference a family code.
- **Matching Set / Conjuntos admin** — out of scope for the attribute Phase 1 endpoints only. It is a Products-module feature planned under `/api/v1/products/matching-sets`; see the current-state plan linked above.
  > Warning: May be stale per 2026-04-29 /index-knowledge pass: matching-set admin and buying-plan work has shipped in Products; this line is only accurate if read narrowly as "out of scope for the original attribute-only Phase 1 endpoints."

## Related

- [`schema.md`](schema.md) — table structures these endpoints read and write.
- [`tasks.md`](tasks.md) — endpoints land in step 4 of the build order.
- [`decisions.md`](decisions.md) — atomic-replace PUT vs PATCH-per-dim is recorded as ADR.
- [`docs/dev/specs/2026-04-21-utilities-batch-change-design.md`](../../dev/specs/2026-04-21-utilities-batch-change-design.md) — utilities module that consumes the `bulkAssign` contract.
