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

## 2026-04-26 — `app.sku.style` / `brand_id` / `color_code` are sparsely populated; reports treat them as nullable

**Context:** The Sell-Through report rewrite probed real `app.sku` data and surfaced how thinly the structured-attribute columns are filled in the imported RICS catalog. Three fields the report needs — Brand, Style, Color — are mostly null on the ~1.5M-row table. This affects every consumer that joins or sorts by them.

**Decision:** Treat `app.sku.style`, `app.sku.brand_id`, and `app.sku.color_code` as nullable in service-layer queries and report contracts; do not crash, blank-string, or default-bucket on null. Specifically:

- **`brand_id` is an orphaned integer.** No FK, no `app.brand` table exists today. Carries the legacy RICS numeric brand code; until a brand reference table lands, joins return null and reports render Brand as blank. New consumers should not assume brand resolution.
- **`style` is null for the vast majority of imported SKUs.** Aggregations that historically counted "distinct styles" (Sell-Through, OnHand, Turnover) should switch to `COUNT(DISTINCT s.id)` (one per SKU) when style is the documented unit, and keep the contract field name (`totalStyles`) for backwards compatibility with the frontend. Document the semantic shift in the call-site, not the API name.
- **`color_code` is a free-form text code, also commonly null.** No `app.ref_color` resolution at the SKU layer; if a report needs a color *name*, the resolution must be done at that report's layer (or deferred until a color reference is added to `app.*`).
- The SKU Lookup index ([`docs/operations/sku-lookup-index-warmup.md`](../../operations/sku-lookup-index-warmup.md)) already serves the modal correctly — this decision is about new consumers (reports / analytics) inheriting the column nullability, not about the lookup path.

**Consequences:**
- Report tables show empty Brand/Style/Color cells for many rows. Operators may interpret this as "data missing"; that's accurate — it's a catalog-enrichment backlog, not a query bug.
- "Distinct styles" counts in reports are now distinct-SKUs-with-movement; if multi-color/multi-size SKUs map 1:N to a real "style" entity later, those counts will inflate relative to the eventual style entity.
- Adding a real `app.brand` table is the next natural step. The integer `brand_id` already in `app.sku` would become the FK target; no schema change to the SKU side.
- The legacy `legacy_attrs` JSON keys (frozen since 2026-04-23 — `shoeTypeId`, `closureTypeId`, `seasonId`, etc.) are not on this list because they were never broadly populated; they migrate piecewise into dimensions when touched.

**Alternatives considered:**
- *Backfill `style` / `brand_id` / `color_code` from `rics_mirror.InventoryMaster` in a one-shot migration.* Deferred — the underlying RICS data also has these fields sparsely; a backfill would not change the population rate.
- *Hide blank Brand/Style/Color cells in reports.* Rejected — operators need to see the missing data to drive enrichment; hiding masks the catalog-quality problem.

**Related:** [`docs/dev/specs/2026-04-26-sell-through-postgres-cutover.md`](../../dev/specs/2026-04-26-sell-through-postgres-cutover.md) — first report to encounter this. `app.sku` Prisma schema line 861.

---

## 2026-04-25 — SKU autofill on the modern form must read via the lifecycle endpoint, not the SQLite alias

**Context:** The modern SKU form ([`SkuFormPageModern.tsx`](../../../apps/web/src/pages/inventory/SkuFormPageModern.tsx)) lets the operator pick a SKU from the lookup modal to switch into edit mode. The on-select handler called `handleSkuCodeLookup` → `useLookupSku` → `GET /api/v1/skus/lookup?code=`, which is a thin wrapper around `SELECT * FROM skus WHERE sku_code = ?` against the SQLite admin DB. The lookup modal's underlying search (`searchSkusForLookup`) reads the in-memory SKU index sourced from `app.sku` (via the lifecycle backfill). That mismatch meant any SKU shown in the modal that didn't also exist in SQLite — i.e. nearly every RICS-mirrored SKU — autofilled nothing: the endpoint 404'd silently and the form stayed empty.

**Decision:** Modern form lookups go through the lifecycle endpoint `GET /api/v1/products/sku-drafts/by-code/:code` ([`fetchSkuDraftByCode`](../../../apps/web/src/hooks/useSkuDrafts.ts)). It returns a `SkuLifecycleRow` covering both app-created drafts and every RICS-mirrored SKU (the [SKU lifecycle backfill](../../operations/sku-lifecycle-backfill.md) marks each one ACTIVE in `app.sku` on every `sync:rics`). The page wraps `fetchSkuDraftByCode` in a local `useMutation` that converts the response via the existing `lifecycleToLegacySku()` so the legacy `populateForm()` keeps working unchanged.

**Consequences:**
- The modern form is now Postgres-aware end-to-end. The same code path also fixes the AutoComplete typeahead inside `SkuCodeStrip`, which previously had the same silent-404 failure for RICS-only codes.
- The legacy form ([`SkuFormPage.tsx`](../../../apps/web/src/pages/inventory/SkuFormPage.tsx)) still uses `useLookupSku` against SQLite. That stays as-is — the legacy form is an intentional fallback and its surface is bounded.
- `useLookupSku` retains a single caller (the legacy form). Any *new* lookup callers should prefer the lifecycle endpoint.

**Alternatives considered:**
- Keep using `/api/v1/skus/lookup` and backfill SQLite on every `sync:rics` — rejected; doubles the source of truth and contradicts the postgres-only-development policy.
- Add a `?source=postgres` query param to the SQLite alias — rejected; introduces another flag instead of consolidating on the lifecycle endpoint that already exists.

**Related:** [`apps/web/src/pages/inventory/SkuFormPageModern.tsx`](../../../apps/web/src/pages/inventory/SkuFormPageModern.tsx), [`apps/web/src/hooks/useSkuDrafts.ts`](../../../apps/web/src/hooks/useSkuDrafts.ts) (`fetchSkuDraftByCode`), [`apps/api/src/routes/products/skuDraftRoutes.ts`](../../../apps/api/src/routes/products/skuDraftRoutes.ts) (`/by-code/:code`).

---

## 2026-04-25 — Modern SKU form gains the full SKU Lookup modal, not just the typeahead

**Context:** The modern SKU form's create-mode strip ([`SkuCodeStrip.tsx`](../../../apps/web/src/pages/inventory/sku-form-modern/SkuCodeStrip.tsx)) shipped with only an `AutoComplete` typeahead — fine if the operator already knows the code, but it can't browse by description / vendor / style-color the way the legacy form's "Buscar" link can (which opens [`SkuLookup`](../../../apps/web/src/components/sku-lookup/SkuLookup.tsx) — a paginated modal with Season/Vendor/Department facets and thumbnails).

**Decision:** Add the full SKU Lookup modal to the modern form. `SkuFormPageModern` now hosts a `<SkuLookup>` next to its existing `<VendorLookup>`. `SkuCodeStrip` accepts an optional `onOpenSkuLookup` callback and renders a "Buscar" link button (with `SearchOutlined` icon) next to the section title in create mode. The button is shown only in create mode (`!isRouteEdit`); edit mode keeps the readonly final-code field. Selecting a row from the modal seeds `skuCode` and routes through the same `handleSkuCodeLookup` flow that the typeahead uses, so the autofill logic is unified.

**Consequences:**
- Operators can browse the catalog from create mode without having to navigate away.
- Disabled-state behavior matches the typeahead: once a match locks in (`matched`), the Buscar link disables alongside the AutoComplete.
- No backend change — modal already pointed at the existing lookup index.

**Related:** [`apps/web/src/pages/inventory/SkuFormPageModern.tsx`](../../../apps/web/src/pages/inventory/SkuFormPageModern.tsx), [`apps/web/src/pages/inventory/sku-form-modern/SkuCodeStrip.tsx`](../../../apps/web/src/pages/inventory/sku-form-modern/SkuCodeStrip.tsx).

---

## 2026-04-23 — `/products/skus/new` is the primary SKU creator; legacy `/products/skus/new-alt` kept as fallback

**Context:** Two SKU creators existed in parallel: the AI-powered lifecycle form at `/inventory/skus/new` (drag/paste a boot image, Claude auto-fills ~14 of ~15 attributes, writes to `app.sku`) and the legacy RICS-tabbed form at `/products/skus/new` (manual entry of every column, no AI). The AI form is the intended long-term surface but lived under the `/inventory/*` URL tree that predates the products module.

**Decision:**

- `/products/skus/new` renders the AI-powered `SkuFormPage` (the one previously at `/inventory/skus/new`).
- `/products/skus/new-alt` renders the legacy RICS-tabbed `ProductsSkuFormPage` under a "New SKU alt" nav label — reachable for cases the AI form doesn't cover yet.
- `/inventory/skus/new` is a `<Navigate>` redirect to `/products/skus/new`. Bookmarks and inbound links keep working.
- Post-save navigation is context-aware: creating under `/products/*` lands on `/products/skus`, creating under `/inventory/*` lands on `/inventory/skus`. The form derives the branch from `location.pathname`.

**Consequences:**

- The primary nav button "New SKU" (Products menu) now opens the AI form directly.
- The legacy form continues to accept edits on `/products/skus/:code`; only the *create* entry point moved.
- Image paste support (clipboard → `handleImageUpload`) is the default — the "drag or paste (Ctrl+V)" caption on the dropzone makes it discoverable.

**Alternatives considered:**

- Delete the legacy form outright — rejected, operator wanted an escape hatch until the AI form covers every field RICS needs.
- Keep AI form only at `/inventory/skus/new` — rejected, the URL tree doesn't match the module boundary and the Products nav would lack a top-level "New SKU" entry.

**Related:**

- `apps/web/src/App.tsx` — route table.
- `apps/web/src/pages/inventory/SkuFormPage.tsx` — `skuRootPath` derivation, image paste listener.

---

## 2026-04-23 — `app.sku` now carries every RICS InventoryMaster column the lifecycle service needs; `legacy_attrs` is frozen

**Context:** The `SkuRow` / `CreateSkuInput` / `UpdateSkuInput` triple on `skuLifecycleService` exposed only a thin slice of what `app.sku` stores — retailPrice, currentCost, season, style, keywords, plus a catch-all `legacy_attrs` JSONB bag. The SKU form stashed everything else (listPrice, markDownPrice1/2, sizeType, location, groupCode, labelCode, pictureFileName, coupon, etc.) in that bag, keyed by form field name. Round-tripping required matching string keys on both sides, and the JSONB had no schema.

**Decision:**

- Add `perks NUMERIC(12,2)` and `discount_code TEXT` columns to `app.sku` (migration `20260423120000_sku_add_perks_discount_code`). These were the only RICS InventoryMaster columns `app.sku` was still missing.
- Expand `SkuRow`, `CreateSkuInput`, `UpdateSkuInput`, and `mapRow()` on `skuLifecycleService` to surface the full set: `listPrice, markDownPrice1, markDownPrice2, currentPriceSlot, sizeType, location, labelCode, colorCode, groupCode, pictureFileName, manufacturer, coupon, orderMultiple, orderUom, perks, discountCode`.
- Mirror the expansion in `apps/web/src/types/skuLifecycle.ts`.
- Freeze `legacy_attrs`. Seven keys still live there pending migration to the dimensional framework: `shoeTypeId, closureTypeId, seasonId, occasionId, genderId, labelTypeId, brandText`. No new key should be added.

**Consequences:**

- The SKU form's `splitFormValuesForLifecycle` serializer now passes these fields as typed values rather than JSONB keys. `APP_SKU_COLUMN_KEYS` grew to include them.
- `perks` + `discountCode` are written via raw SQL overlay (matching the existing `legacy_attrs` pattern) so a running dev server holding the Prisma DLL doesn't block development. Cleanup to the typed Prisma path happens on the next `prisma generate` cycle.

**Related:**

- `apps/api/prisma/migrations/20260423120000_sku_add_perks_discount_code/`.
- `apps/api/src/services/products/skuLifecycleService.ts` — `mapRow`, `fetchExtraColsMap`, expanded create/update/finalize.

---

## 2026-04-23 — Vendor form field keys the 4-letter RICS code, not a UUID

**Context:** The SKU form was wired to the legacy SQLite `/api/v1/vendors` endpoint, which returns synthetic UUIDs as `id`. The displayed dropdown showed names but stored UUIDs on `app.sku.vendor_id` — a column whose intent is the 4-letter RICS code matching `rics_mirror.inventory_master.vendor`. Operators searching "24.7 FAISCA" saw the name but had no way to see or edit the RICS code.

**Decision:**

- Switch the form to `useVendors()` from `apps/web/src/hooks/useProductsVendors.ts` (Postgres-backed, sourced from `/api/v1/products/vendors` → `rics_mirror.vendors`). Each row exposes `code` (4-letter) + `name` + full RICS contact fields.
- The Vendor Code Select stores `v.code` as its value. Option labels render as `"{code} — {name}"` so both are visible while scrolling.
- `VendorNameAutofill` (readonly component next to the Select) watches `vendorId` and renders `v.name` for the resolved code.
- A `VendorLookup` modal (`apps/web/src/components/vendor-lookup/VendorLookup.tsx`) opens from a 🔍 Buscar link next to the Vendor Code label — RICS-style Code/Name table with Quick Search, radio-row select, single-match Enter auto-pick, double-click-to-select.

**Consequences:**

- `app.sku.vendor_id` now stores clean 4-letter codes (`NIKE`, `03EV`, `24.7`, …) matching both the legacy RICS column and the Postgres mirror.
- The VendorLookup is data-coupled to the same `useVendors()` cache as the inline Select — no duplicate round-trip.

**Alternatives considered:**

- Keep UUIDs on the form and translate at the route boundary — rejected, introduces a second id space with no benefit and fights what RICS and every downstream report already does.
- Make the vendor field a plain text input — rejected, loses the autofill-name UX and lets the operator type codes that don't exist.

**Related:**

- `apps/web/src/components/vendor-lookup/VendorLookup.tsx`.
- `apps/web/src/pages/inventory/SkuFormPage.tsx` — Vendor Code Form.Item.

---

## 2026-04-23 — Main-form save uses scoped `setForSku` so it only touches Apariencia dims

**Context:** After the 11 Apariencia ref tables migrated to dimensional assignments, the SKU form needed to call `PUT /skus/:code/attributes` on save. The existing `setForSku` does atomic-replace: it wipes every assignment for that SKU whose `assigned_by` doesn't start with `seed:keyword:`. The main form only knows about the 11 Apariencia dims; if it called the full-replace contract it would wipe Buyer / Company / Cadena / Discount Type assignments that live under the separate "Atributos" tab.

**Decision:**

- Extend `replaceSkuAttributes(skuCode, assignments, actor, scopedDimensionCodes?)` — when `scopedDimensionCodes` is present and non-empty, both the DELETE and the required-dim check narrow to those dims. Out-of-scope dims stay untouched.
- Mirror the option through `attributesService.setForSku`, the PUT route body (`body.scope: string[]`), and the web client `productsAttributesApi.setForSku(code, { assignments, scope })`.
- Callers that want the original full-replace semantics simply omit `scope`.
- The main SKU form passes `scope = [all 11 Apariencia dim codes]` so each save touches only those dims.

**Consequences:**

- Per-dim operator assignments are now independently editable — the "Atributos" tab can set Buyer without risk, the main form can set Color without risk.
- Required-dim enforcement naturally follows scope: out-of-scope required dims don't fail the write (they were unchanged by it anyway).

**Related:**

- `apps/api/src/repositories/products/AttributesRepository.ts` — `replaceSkuAttributes`.
- `apps/api/src/routes/products/attributesRoutes.ts` — PUT body parsing.
- `docs/dev/specs/2026-04-23-postgres-only-development-policy.md`.

---

## 2026-04-23 — Category picker is scoped by Product Family and requires one

**Context:** The Category `<Select>` pulled from `useAllPostgresCategories()` (615 rows across 12 family groups). With the full list loaded, the grouped Ant Select surfaced "zapatos" first and virtualization hid the rest; more importantly, picking a non-Zapatos category while Familia=Zapatos was selected broke the AI's family-scoped prompt and produced cross-family mis-classifications.

**Decision:**

- `categoryOptions` filters `validCategoriesById` to rows where `familyCode === selectedFamily`. Result set shrinks to ~4–122 rows (per family) with consistent ordering by category number.
- When `selectedFamily` is null the Select is `disabled={true}` with placeholder "Selecciona una Familia primero" — the operator can't pick a category out of context.
- When `selectedFamily` changes, a `useEffect` checks the current `categoryId`: if it belongs to a different family it's cleared (along with the derived family/dept state). If it already matches the new family it's preserved.
- Edit-mode load now seeds `selectedFamily` from the loaded SKU's category's `familyCode`, so opening an existing SKU keeps its category visible (without this, the clear-effect would wipe it).

**Consequences:**

- The AI-image-fill flow and the manual pick flow both stay inside the chosen family.
- Operators must pick Familia first; the UX signals this with the disabled state.

**Related:**

- `docs/dev/specs/2026-04-23-ai-image-fill-cross-family-guard.md` — the bug this scoping prevents in the manual-pick path.

---

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

---

## 2026-04-24 — Vendor write surface is a single overlay with a `source` discriminator

**Context:** The OLE DB write path in `VendorRepository` (create / update / delete / store-account upsert) was deleted because writes-to-RICS-at-request-time is incompatible with the Postgres-first direction. `rics_mirror.vendor_master` is read-only (atomically rebuilt by `sync:rics`), so vendor writes need a Postgres-side surface.

**Decision:** Single `app.vendor_overlay` table with a `source` column taking one of `'native'` / `'override'` / `'tombstone'`. Reads do `rics_mirror.vendor_master FULL OUTER JOIN app.vendor_overlay ON code` with `COALESCE(overlay.col, mirror.col)` per column, filtering `source='tombstone'`. Writes route based on current state:

- New code not in mirror → insert `source='native'` (required columns non-null per check constraint).
- Edit of a mirror vendor → upsert `source='override'` with only the changed columns set (sparse override).
- Edit of an existing native vendor → UPDATE in place, keeps `source='native'`.
- Delete of a native → DELETE the overlay row.
- Delete of a mirror vendor → upsert `source='tombstone'` (empty value columns; row hides the mirror from reads).

**Consequences:**

- `/api/v1/products/vendors` POST/PATCH/DELETE work against Postgres; no MDB opened on the request path.
- Overlay edits don't reach RICS until the Postgres→RICS sync agent is built (Phase B). Warehouse/POS systems still see only what `sync:rics` copied.
- Store-account writes (`PUT/DELETE /store-accounts/:storeId`) remain `WriteNotSupported` pending a separate `vendor_store_account_overlay` with the same pattern.
- Orphan-override hygiene is deferred: if a RICS code disappears from the mirror between syncs, an `'override'` or `'tombstone'` row for that code silently points at nothing. Add a post-sync orphan-override report when the sync agent work starts.

**Alternatives considered:**

- *Three separate tables* (`app.vendor` for native, `app.vendor_override` for edits, `app.vendor_tombstone` for deletes). Rejected — three tables, three insert paths, harder to write the unified read projection.
- *Full-row override* (copy entire mirror row into the overlay on first edit). Rejected — diverges from the established `app.sku_attribute_override` pattern (sparse per-column), and silently discards later RICS-side updates to unovered columns.
- *No overlay at all; keep writes disabled until the sync agent ships.* Rejected — the Products admin UI already had New/Edit/Delete buttons; a multi-week regression waiting on the sync agent wasn't worth it.

**Related:** [`docs/dev/specs/2026-04-24-vendor-overlay-design.md`](../../dev/specs/2026-04-24-vendor-overlay-design.md) — full design record; [`rics-module-specs.md`](rics-module-specs.md) §Data model sketch — `VendorOverlay` model.
