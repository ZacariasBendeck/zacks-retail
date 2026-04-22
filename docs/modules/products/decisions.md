# Decisions: Products

Running log of **module-scoped** design decisions — the *why* behind design choices that show up in the other artifacts in this folder. Append new entries at the **top** (most recent first).

Cross-module and project-wide decisions live in [`../../dev/specs/`](../../dev/specs/) instead — if a decision affects more than this module, write it there and (optionally) reference it here.

## Entry format

Each entry follows this shape:

> ## YYYY-MM-DD — Short decision title
>
> **Context:** What situation or question prompted this decision.
> **Decision:** What was decided.
> **Consequences:** What follows — tradeoffs, new constraints, knock-on effects.
> **Alternatives considered:** 1–3 options rejected, with one-line reason each.
> **Related:** Commits / specs / runbooks if applicable.

---

<!-- Decisions go below this line, most recent first. -->

## 2026-04-22 — Exclude `MB` and `CXB` from initial extended-attributes catalog; use `CXN` for Corporación Xena; ignore `UN`

**Context:** During the brainstorm of the keyword-derived attribute layer, the operator initially named `MB` as both a buyer and a company value, and `CXB` as the company code for Corporación Xena. A discovery query against `rics_mirror.inventory_master.key_words` (split on whitespace, top tokens by frequency) showed `MB` has 0 occurrences and `CXB` has 0 occurrences, while `CXN` has 10,397 occurrences. A `DM` token (45,854 occurrences, third-largest buyer) and a `UN` token (5,766 occurrences, distinct from `UNLI`) had not been mentioned.

**Decision:**

- Exclude `MB` from the catalog (buyer + company) — token does not exist in the data; flagged as scratch by the operator.
- Use `CXN` (not `CXB`) for Corporación Xena — `CXN` is what appears in the keyword field; `CXB` was a typo.
- Add `DM` (Doña Mónica) as a fourth buyer value — major presence the brainstorm missed.
- Ignore `UN` — operator direction; if a real meaning surfaces, add a row to `values.csv` and `keyword_rules.csv` and re-seed.

**Consequences:**

- The seed is anchored in observed keyword data, not in tribal-knowledge enumerations. Coverage at first run is honest.
- Future codes are easy to add (one row in two CSVs + re-seed). Removal is intentional (a manual SQL step).
- The discovery pattern (`regexp_split_to_table` over `key_words`, frequency rank) is reusable for any future keyword-derived dim.

**Alternatives considered:**

- *Use the operator-named codes anyway.* Rejected — would result in zero-coverage rows in the catalog and confusion when nothing matches.
- *Auto-generate the value catalog from the keyword data.* Rejected — risks ingesting noise (every typo / one-off token becomes a value); operator curation is the right gate.

**Related:** [`schema.md`](schema.md) §Seed catalog; [`docs/dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md`](../../dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md).

---

## 2026-04-22 — Mechanic-prefix value codes (`pct_*` / `bogo_*` / `multi_*` / `fixed_*`) for `discount_type`

**Context:** The discount space in `rics_mirror.inventory_master.key_words` carries four distinct mechanics encoded as different token shapes: plain percent (`50`), second-at-percent (`2D50`), buy-N-pay-1 (`2X1` / `3X1` / `3X2` / `4X1`), and fixed-price endings in lempiras (`L99` / `L199` / `L1999`). All four mechanics need to be filterable as discounts, but they have different operational meanings.

**Decision:** Encode all four mechanics under a single `discount_type` dimension (multi-value). The mechanic is carried in the `value.code` prefix:

- `pct_<n>` for plain percent off
- `bogo_<n>` for second-at-`<n>%`
- `multi_<n>` for buy-N-pay-M patterns (`multi_2x1`, `multi_3x2`)
- `fixed_l<n>` for fixed-price endings

The token-to-value mapping in `keyword_rules.csv` is then 1:1 (`50` → `pct_50`, `2D50` → `bogo_50`, etc.).

**Consequences:**

- Storefront facet UI groups by mechanic prefix client-side (no special server support).
- Reporting filters by mechanic with a single `WHERE value.code LIKE 'pct_%'` clause.
- A SKU running two mechanics simultaneously (e.g. `pct_50` AND `fixed_l99` both present in keywords) is recorded faithfully — no precedence forcing.
- New value codes are stable and self-describing in logs and audit entries.

**Alternatives considered:**

- *Four separate dimensions.* Rejected — adds noise to the per-SKU display (most SKUs have at most 1–2 discount tokens; four near-empty dims hurts the UI).
- *Single dim with opaque value codes (`v1`, `v2`, …).* Rejected — opaque codes destroy log readability and require constant catalog lookup to interpret.

**Related:** [`schema.md`](schema.md) §`discount_type` (51 values); [`api.md`](api.md) `GET /attributes/dimensions`.

---

## 2026-04-22 — Atomic-replace PUT semantics for per-SKU attribute writes

**Context:** The per-SKU attribute editor (6th tab on the SKU form) needs a save button. Two write models were considered: atomic-replace PUT (whole-set save), or PATCH-per-dim (granular updates).

**Decision:** Single `PUT /api/v1/products/skus/:code/attributes` accepting the full assignment set. In one transaction, deletes every row for this SKU whose `assigned_by` does NOT start with `seed:keyword:`, then inserts the new set tagged with the current user id. Keyword-derived rows stay untouched and are rebuilt on next seed run.

An empty `assignments` array is permitted and used by the "Reset to keyword-derived" button — the atomic-replace wipes operator + excel rows for the SKU; the underlying keyword rows reappear in the next read.

**Consequences:**

- Maps cleanly to "save the form" UI semantics — single button, single round-trip.
- Audit-log entry captures the diff (added / removed / unchanged), which would have been split across many entries with PATCH.
- Concurrent edits to the same SKU's attributes by two users are last-write-wins; no merge logic.

**Alternatives considered:**

- *PATCH per dim* (`PATCH /skus/:code/attributes/:dimension_code`). Rejected for Phase 1 — operator-edit workflow is one-form-one-user; the multi-endpoint surface would have been busier without functional gain. PATCH can be added later if a real concurrency need surfaces.
- *Whole-set PATCH* (`PATCH .../attributes` with delta semantics). Rejected — delta semantics ("add these, remove those, leave the rest") are subtle and easy to misuse; replace semantics are obvious.

**Related:** [`api.md`](api.md) §`PUT /api/v1/products/skus/:code/attributes`; the precedence rule in [`schema.md`](schema.md).

---

## 2026-04-22 — Multi-value vs. single-value enforcement at the service layer, not the DB

**Context:** Most extended-attribute dimensions are single-value (one buyer per SKU, one company, one chain). At least one (`discount_type`) is multi-value (a SKU can run two mechanics simultaneously). Future footwear dims will likely include both shapes.

**Decision:** The cardinality is recorded in `attribute_dimension.is_multi_value` and enforced at the service layer:

- Single-value: write path is DELETE-then-INSERT for that `(sku, dim)`.
- Multi-value: write path is INSERT ON CONFLICT DO NOTHING for each value, plus DELETE of values not in the request body.

The DB itself does NOT enforce single-value; the composite PK `(sku_code, dimension_id, value_id)` allows multiple rows per `(sku, dim)`.

**Consequences:**

- Flipping a dim from single-value to multi-value (or vice versa) is a single-row update on `attribute_dimension`, no migration.
- Service-layer bugs could insert two values for a single-value dim, but the service is the only writer, mitigating the risk.
- Validation (422 on multi-value submission to a single-value dim) is implemented in the service; routes pass through the error.

**Alternatives considered:**

- *DB-level partial unique indexes* (`UNIQUE (sku_code, dimension_id) WHERE dimension_id IN (...)`). Rejected — hard-codes the multi/single split into a migration; flipping cardinality requires a schema change.
- *Separate tables for single-value vs multi-value dims.* Rejected — duplicated schema, doubled service code.

**Related:** [`schema.md`](schema.md) §`app.attribute_dimension`; [`api.md`](api.md) validation rules.

---

## 2026-04-22 — Soft references from `app.*` to `rics_mirror.*` (no cross-schema FKs)

**Context:** `app.sku_attribute_assignment.sku_code` references `rics_mirror.inventory_master.sku`, but `rics_mirror` is rebuilt atomically on every `pnpm sync:rics` invocation (drop + recreate via `COPY FROM`). A standard cross-schema FK would either cascade-delete classifications during the swap or block the swap entirely.

**Decision:** Drop the FK. The reference is **soft** — validated at the service layer on write (return 404 if the SKU does not exist in the current mirror), surfaced via the `app.sku_attribute_orphans` view for post-sync cleanup. The view is queried by `pnpm verify:rics-mirror` so the operator notices growth.

**Consequences:**

- The mirror reload completes without coordination with `app.*` tables.
- Classification rows survive the reload; orphans only appear when a SKU is removed from RICS.
- Every future `app.*` → `rics_mirror.*` reference follows this pattern (recorded as the general rule for module-owned additive tables).

**Alternatives considered:**

- *Hard FK with `ON DELETE CASCADE`.* Rejected — operator-entered classifications would be lost on every reload of a SKU's row (since the reload IS a DELETE + INSERT).
- *Hard FK without cascade.* Rejected — the swap would fail with FK-violation errors.
- *Move the soft reference into a synthetic foreign-key column on `inventory_master` extension table.* Rejected — duplicates the SKU-identity domain; adds a join to every read for no real benefit.

**Related:** [`schema.md`](schema.md) §`app.sku_attribute_assignment`; [`docs/operations/rics-mirror-sync.md`](../../operations/rics-mirror-sync.md); [`CLAUDE.md`](../../../CLAUDE.md) §Data surfaces.

---

## 2026-04-22 — Adopt EAV (`attribute_dimension` / `attribute_value` / `sku_attribute_assignment`) for the extended-attribute layer

**Context:** Adding structured taxonomy on top of SKUs (buyer, company, store chain, discount type today; eventually 15-dim footwear classification). Three shapes were considered: a wide table with one column per dim; an EAV (entity-attribute-value) normalized triple; a single JSONB column.

**Decision:** Three normalized tables — `app.attribute_dimension` (the dims), `app.attribute_value` (allowed values per dim), `app.sku_attribute_assignment` (the N:M mapping). New dims and values are data-only inserts; multi-value dims fall out naturally; queries pivot or filter as needed.

**Consequences:**

- Adding a 16th dim or a new value is a CSV edit + re-seed, no migration.
- Multi-value dimensions (`discount_type` today; future footwear `Ocasion` / `Accesorio`) work without special casing.
- Reads-by-SKU need a pivot at the API boundary (15 rows → one object per SKU). Acceptable.
- Storefront facets read the dim/value tables directly for facet metadata (label + sort order); no shadow facet table.

**Alternatives considered:**

- *Wide table with one column per dim* (each as a Postgres enum or CHECK-constrained VARCHAR). Rejected — every new dim or value is a migration; multi-value cannot be modelled cleanly.
- *Single JSONB column.* Rejected — the dim catalog is bounded and known; JSONB's flexibility is unnecessary and the type-safety loss is real (invalid values can land silently if the validator is bypassed).

**Related:** [`schema.md`](schema.md) — full DDL and indexes; [`docs/dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md`](../../dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md) — original brainstorm.
