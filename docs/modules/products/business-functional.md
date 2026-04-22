# Products — Business / Functional

> **Scope of this file.** Documents the **extended-attributes layer** (introduced 2026-04-22). Broader products module functional spec (SKU CRUD, vendor management, taxonomy admin, pricing operations, labels & UPC) lives in [`rics-module-specs.md`](rics-module-specs.md) and migrates into this file as Phase A → B work lands.

## Objective

Add a structured, queryable taxonomy layer on top of every SKU so merchandisers, buyers, and (later) storefront customers can slice the catalog along business-meaningful dimensions that are hidden today inside the unindexed `key_words` text field on `rics_mirror.inventory_master`.

Phase 1 of the layer covers four dimensions that can be derived programmatically from existing RICS keywords:

| Dimension | Example values | Why it matters |
|---|---|---|
| **Comprador** (buyer) | Zacarias Bendeck, AB, AXB, Doña Mónica | Each buyer wants to see only their catalog; reporting wants buyer-pivot. |
| **Empresa** (company) | Inversiones Benlow, Corporación Xena, Compañía Comercial de Tegucigalpa | Multi-entity holding; each company has its own catalog slice. |
| **Cadena** (store chain) | Magic Shoes, Unlimited, Fashion | Style targeting per chain — driven by brand positioning. |
| **Tipo de Descuento** (discount type) | 10–90% off, 2D__ second-at-percent, 2x1/3x1/3x2/4x1, fixed-price L19–L1999 | Promotion mechanics currently encoded only in keyword tokens. |

Future phases extend the same layer with operator-entered footwear classifications (`Tipo_Calzado`, `Altura_Tacon`, `Forma_Tacon`, `Color_Familia`, etc.) — separate brainstorms.

## Users / Roles

| Role | What they do with attributes |
|---|---|
| **Merchandiser** | Reads — slices the SKU list by buyer / company / chain to spot inventory or pricing issues in their slice. |
| **Operator (admin)** | Reads + edits — overrides individual SKU classifications when keyword-derivation is wrong or missing. |
| **Buyer** | Reads — filters the SKU list and inquiry to their own catalog. |
| **Storefront customer** *(future)* | Reads — filters the public catalog by mechanic-prefix discount, target chain, color family, etc. |
| **Reporting consumer** *(future)* | Reads — pivots sales / margin / on-hand by attribute dimension. |

## Main features

### Catalog viewer — `/products/attributes`

Read-only browser of the four dimensions. Operators see what the catalog contains and how complete it is. No edit affordance in Phase 1; catalog itself is CSV + seed-script.

### Per-SKU attributes editor — 6th tab on the SKU detail form

Operators override or augment the keyword-derived classifications. Each dim renders as a single- or multi-select; below each select, a small badge shows where the current value(s) came from (`keyword`, `excel`, or `<user>@<timestamp>`).

A "Reset to keyword-derived" button at the bottom wipes operator + excel rows for the SKU; the underlying keyword rows reappear on the next read.

### SKU list filter — extends `/products/skus`

A new "Atributos" filter group above the existing strip. One labeled multi-select per dim. Selections feed into the URL and into the backend query. Within a dim → union; across dims → intersection. Matches the existing convention for vendor / category / season filters.

A hideable "Atributos" column shows compact badges per row (e.g. `ZB · MAGI · 50%`).

### Inquiry page — read-only badge strip

The Product Inquiry page gets a new badge strip under the header, showing the four dims as compact pills:

```
Comprador: ZB    Empresa: IBL    Cadena: MAGI    Descuento: 50% off, L99
```

Unclassified dims render as muted "Sin clasificar". Click-through is informational only in Phase 1.

## Workflow

### Initial seeding

1. Operator runs `pnpm sync:rics` — the RICS mirror is rebuilt from MDB files into `rics_mirror.*`.
2. Operator runs `pnpm seed:sku-attributes` — the seed script:
   - Upserts the dimension + value catalog from CSVs.
   - Drops every `seed:keyword:*`-tagged assignment.
   - Tokenizes `rics_mirror.inventory_master.key_words` and re-applies every rule.
   - Prints per-dim coverage.

Operator-edits (`assigned_by = <user>`) are immune to this re-seed; the keyword phase only touches `seed:keyword:*` rows.

### Operator override

1. Operator opens a SKU's detail page → Atributos tab.
2. Selects / clears values per dim; clicks Save.
3. The `PUT .../attributes` endpoint atomic-replaces every non-`seed:keyword:*` row for that SKU with the new set, tagged with the operator's user id.
4. Optimistic cache update; the SKU list and inquiry strip reflect the change immediately.

### Bulk re-classification

Out of scope for this module's UI — handled by the [`utilities`](../utilities/) batch-change page. Utilities calls the internal `productsAttributes.bulkAssign(...)` contract; same atomic-replace semantics, applied per SKU within one transaction.

### Refining keyword rules

Operator edits [`apps/api/seeds/sku_extended_attributes/keyword_rules.csv`](../../../apps/api/seeds/sku_extended_attributes/keyword_rules.csv), commits the change, re-runs `pnpm seed:sku-attributes`. Operator-edits and excel-derived rows survive.

## Business rules

- **Precedence (cited in code):** `operator-edit > seed:excel > seed:keyword > no row`. Re-running the seed pipeline never overwrites operator edits or excel-derived rows.
- **Single-value vs. multi-value:** enforced at the service layer per the dimension's `is_multi_value` flag. Buyer / Company / Store Chain are single-value; Discount Type is multi-value (a SKU can run two mechanics simultaneously, e.g. `pct_50` AND `fixed_l99`).
- **`rics_mirror.inventory_master.key_words` is read-only** to this layer. The keyword field is never mutated; derived data lives only in `app.sku_attribute_assignment`.
- **Tokenization is whitespace-delimited, not substring.** A SKU with `key_words = 'IBL ZB C1911 2D50'` produces `['IBL', 'ZB', 'C1911', '2D50']`; `50` does **not** match `2D50`. The discount-percent rule set is a closed enum, so the 4-digit-numeric `YYMM` date stamps (`2208`, `2209`, …) are never mistaken for discounts.
- **Soft references.** `app.sku_attribute_assignment.sku_code` is a soft reference to `rics_mirror.inventory_master.sku`. No FK. Orphans (SKU removed from RICS) surface via the `app.sku_attribute_orphans` view; the post-sync verification reports the count.

## Acceptance criteria

After step 8 of the build (see [`tasks.md`](tasks.md)), the following must hold end-to-end:

- **Coverage thresholds at first run** of `pnpm seed:sku-attributes` against the current keyword data:
  - `buyer` ≥ 90% of SKUs classified
  - `company` ≥ 50% of SKUs classified
  - `store_chain` ≥ 5% of SKUs classified
  - `discount_type` ≥ 30% of SKUs with at least one assignment
- **Operator override round-trip:** opening a SKU detail page → Atributos tab, changing every dim, saving — survives a page reload AND a subsequent `pnpm seed:sku-attributes` run.
- **List filter precision:** `GET /api/v1/products/skus?attr.buyer=zb&attr.discount_type=pct_50` returns the intersection (SKUs where both apply); `attr.buyer=zb,ab` returns the union (SKUs where either applies).
- **Inquiry strip correctness:** `/products/inquiry/<known-classified-SKU>` shows the four dims with the correct values and source labels.
- **Mirror-reload survival:** after `pnpm sync:rics`, the operator's overrides for SKUs that still exist in the mirror are still present; the orphan count for removed SKUs is non-zero and surfaced in the post-sync log.

## UI components

Detailed in [`tasks.md`](tasks.md) per build step. Summary:

| Component | Path | Role |
|---|---|---|
| `CatalogPage` | [`apps/web/src/pages/products/attributes/CatalogPage.tsx`](../../../apps/web/src/pages/products/attributes/CatalogPage.tsx) | Read-only catalog viewer at `/products/attributes`. |
| `SkuAttributesTab` | [`apps/web/src/pages/products/skus/SkuAttributesTab.tsx`](../../../apps/web/src/pages/products/skus/SkuAttributesTab.tsx) | 6th tab on the SKU detail form. |
| `AttributeFilterGroup` | [`apps/web/src/components/products/AttributeFilterGroup.tsx`](../../../apps/web/src/components/products/AttributeFilterGroup.tsx) | Filter strip on the SKU list. |
| `AttributeBadgeStrip` | [`apps/web/src/components/products/AttributeBadgeStrip.tsx`](../../../apps/web/src/components/products/AttributeBadgeStrip.tsx) | Reusable badge row, used on inquiry page and (compact form) on SKU list rows. |

Navigation entry added to the `Products` menu in [`apps/web/src/components/AppLayout.tsx`](../../../apps/web/src/components/AppLayout.tsx).

## Out of scope (Phase 1)

- The 15-dim footwear catalog (`Tipo_Calzado`, `Altura_Tacon`, `Color_Familia`, …). Same schema is reused; different seed source (Excel + operator entry). Separate brainstorm.
- Catalog editing in the browser — CSV-and-seed for now.
- Storefront facet UI — separate storefront-app brainstorm.
- Sales-reporting pivots by attribute — separate per-measure design.
- Click-through from inquiry pills to a pre-filtered SKU list.
- ML / fuzzy keyword derivation. Phase 1 is exact-token-match only.

## Related

- [`schema.md`](schema.md) — tables behind these features.
- [`api.md`](api.md) — endpoints these UIs call.
- [`tasks.md`](tasks.md) — build order and per-task acceptance.
- [`decisions.md`](decisions.md) — why the feature is shaped the way it is.
- [`rics-module-specs.md`](rics-module-specs.md) — broader products functional surface.
