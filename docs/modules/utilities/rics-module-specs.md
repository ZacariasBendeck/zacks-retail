# Module: utilities

**Goal**

`utilities` owns the operator-facing batch-change surface — the Ch. 15 "Utilities 2" tools from the RICS manual that let a merchandiser or sysadmin change an attribute across a criteria-selected set of SKUs in one operation. In RICS these shipped as isolated forms (Change Keywords, Change Categories, Change Vendors, Change Seasons, Change Group Codes, Change Size Columns, Change Size Types), each with its own criteria picker. Zack's Retail collapses the shared UX into a single **Criteria-based SKU Picker** component and a single **batch-change primitive** (`applyBatchChange`), then composes each utility as a thin skin on top. Primary user value: a merchandiser can pick a filter (e.g. "all boots from Timberland in FW2026") and add a keyword, reassign a category, or restructure a size grid in one transactional write, with a preview count before commit, a non-blocking audit row per SKU, and a first-class **undo** path that reverses the operation.

This module is cross-cutting: it reads from `rics_mirror.inventory_master` + `rics_mirror.size_types` joined with overlay tables owned by [`products`](products.md), and it writes to overlay + batch-operation tables owned here. It is the canonical consumer of `products.listSkusByCriteria`.

## RICS features covered

**Ch. 15 Utilities 2 — batch-change tools** (starting p. 193 / [77manual.txt:7000](../rics-reference/77manual.txt))

- **p. 193, Change Size Columns** (manual [line 7069](../rics-reference/77manual.txt)) — renames a column label across every size type where it appears (e.g., `"070"` → `"7.5"` system-wide). Does not use the SKU criteria picker; operates on the size-type taxonomy directly.
- **p. 193, Change Size Types** (manual [line 7082](../rics-reference/77manual.txt)) — restructures a size grid by adding, moving, or deleting columns and rows. Deleted column/row data **consolidates into column 1 / row 1** rather than being dropped (confirmation step before commit).
- **p. 194, Change Categories** (manual [line 7101](../rics-reference/77manual.txt)) — reassigns SKUs from one category number to another and deletes the old category record. Uses the criteria picker.
- **p. 194, Change Vendors** (manual [line 7110](../rics-reference/77manual.txt)) — reassigns SKUs from one vendor code to another and deletes the old vendor record. Uses the criteria picker.
- **p. 194, Change Seasons** (manual [line 7119](../rics-reference/77manual.txt)) — reassigns SKUs from one season to another and deletes the old season. Uses the criteria picker.
- **p. 194, Change Group Codes** (manual [line 7128](../rics-reference/77manual.txt)) — reassigns SKUs' group code for matching criteria. First RICS utility to expose the "Only change SKUs with future price changes" filter.
- **p. 195, Change Keywords** (manual [line 7141](../rics-reference/77manual.txt)) — **canonical example of the criteria-picker pattern.** Add or remove a keyword for SKUs matching criteria (SKUs / Categories / Vendors / Seasons / Styles-Colors / Groups / Keywords), with two filter checkboxes: "Only change SKUs with future price changes" and "Only change SKUs with Week-to-Date sales."

**Adjacent utilities intentionally deferred**

- **p. 193, Check Data Integrity** (manual [line 7021](../rics-reference/77manual.txt)) — rescoped as **Ingest Diagnostics**: scan `rics_mirror.*` for orphans, dangling FK-like references, and size-type inconsistencies after each `sync:rics` reload. Separate planning exercise.
- **p. 193, Reset Pictures** (manual [line 7043](../rics-reference/77manual.txt)) — auto-assign picture filenames to SKUs and cleanup of unused picture files. Deferred; depends on the `products` image pipeline landing first.
- **p. 193, Change Salespeople** (manual [line 7055](../rics-reference/77manual.txt)) — renumber or merge salesperson records. Deferred; naturally an `employees` module concern.
- **Bulk Price Discount** (p. 73, separate RICS chapter) — also uses the criteria picker pattern. Lives in `products` (Ch. 4 Price Changes), not here, but **consumes `utilities`' shared `SkuCriteriaPicker` component and `applyBatchChange` primitive** once `products` picks it up.

**Explicitly cut from this module** (see `docs/MODULES.md` cut list)

- Compact/Repair/Create/Delete Database, Backup Database, Test Modem, Change RICS.CFG, Macro Management, Run Other Utilities. These are DOS-era DB-maintenance / OS-level concerns that have no web equivalent — managed Postgres handles DB admin; typed settings in `platform` replace RICS.CFG.

## Modernization decisions

- **Single Criteria-based SKU Picker component, reused by every utility.** RICS ships a near-identical criteria form on each of the seven batch utilities. We ship it once at `apps/web/src/components/inventory/SkuCriteriaPicker.tsx`, with a live "N SKUs match" preview (debounced call to `POST /api/v1/products/skus/lookup`). Every utility page composes `<SkuCriteriaPicker />` + its own small target-value form. When `products` implements Bulk Price Discount (Ch. 4 p. 73), it imports the same component.

- **Single write primitive: `applyBatchChange(criteria, change)`.** Resolves criteria → SKU list via `products.listSkusByCriteria`, upserts overlay rows, records a `ProductsBatchOperation` header + per-SKU items, all in one Postgres transaction. Every utility is a thin adapter that supplies its `operationType` and `change` payload.

- **Writes land in `app.*` overlay tables, never in `rics_mirror.*` or the RICS MDBs.** Phase A contract: `rics_mirror` is wiped on every `sync:rics` reload. Overlay rows in `app.sku_attribute_override` and `app.sku_keyword_override` are preserved. The read path merges overlay on top of mirror via `COALESCE(override.field, mirror.field)` in a shared adapter (not a Postgres VIEW — views get CASCADE-dropped with the schema swap).

- **Keywords use an additive/subtractive overlay in Phase A, not the target M:N.** RICS stores keywords as a 60-char space-separated string on `InventoryMaster.KeyWords`. Rather than promote to the Phase B `app.sku_keyword` M:N immediately, we layer `app.sku_keyword_override (sku, keyword, action=ADD|REMOVE)` rows on top of the RICS string. Effective keywords = `split(mirror.key_words)` ∪ ADD-overrides − REMOVE-overrides, computed in a CTE. Phase B migration re-homes selected keyword values to proper columns (e.g. `gender`, `lifecycle`) before the rest are promoted into the M:N, so the Phase-A shape must stay faithful to today's string semantics.

- **Undo is first-class.** Every batch op writes `before_json` / `after_json` per SKU into `ProductsBatchOperationItem`. The Batch History page (`/utilities/batch-history`) lists all operations with an **Undo** button that reverses the operation by deleting/inverting the overlay rows using `before_json`. After undo, the op is marked `undoneAt` and the items stay for audit traceability. A 30-second toast immediately after a batch op also exposes undo before the operator leaves the page.

- **SKU Lookup warmup index reads effective values.** The startup `loadSkuLookupIndex()` (CLAUDE.md HARD RULE: must cover every SKU, never a capped subset) is updated to source from the effective-value adapter — same row count, with overrides merged. After each batch op completes, the affected SKUs are re-warmed via a targeted invalidation (not a full re-warmup) so the SKU Lookup modal reflects changes within seconds.

- **No FK from overlays to `rics_mirror`.** CLAUDE.md: mirror tables are rebuilt atomically with `DROP SCHEMA CASCADE`. FK references would get dropped. Overlays key by natural text key (`rics_sku_code` VARCHAR(15)). SKUs that RICS operators delete between reloads leave dangling override rows; the Batch History page surfaces them so the merchandiser can decide whether to clear them.

- **Preview-before-commit on every utility.** The criteria picker always shows a live match count; before clicking apply, the operator also sees a short sample of affected SKUs. No utility commits without a confirmation dialog.

- **Transactional correctness + non-blocking audit.** The overlay upsert + batch-operation header + items all commit in one transaction. Audit log to `ProductsAuditLog` (the existing cross-module log in `platform`) is fire-and-forget — a failed audit does not roll the batch back (matches the pattern in [`apps/api/src/services/products/auditLog.ts`](../../apps/api/src/services/products/auditLog.ts)).

- **Operations are idempotent by re-apply.** Re-applying the same batch op (same criteria + same change) is a no-op if the overlay rows already have that target value. Supports retry on transient failures without double-applying.

## Data model sketch

All tables live in the Postgres `app` schema (preserved across `sync:rics` reloads).

```prisma
// Replace-style overlay for singular SKU attributes.
// One row per SKU, sparse columns — a non-null column means "effective value is this,
// regardless of what rics_mirror.inventory_master says."
model SkuAttributeOverride {
  ricsSkuCode String   @id @db.VarChar(15)
  category    Int?
  vendor      String?  @db.VarChar(10)
  season      String?  @db.VarChar(2)
  groupCode   String?  @db.VarChar(10)
  updatedAt   DateTime @updatedAt
  updatedBy   String   // user id / email / "system"
  @@index([category])
  @@index([vendor])
  @@index([season])
  @@index([groupCode])
  @@schema("app")
}

// Add/remove overlay for keywords (M:N-style, layered on the RICS space-sep string).
model SkuKeywordOverride {
  ricsSkuCode String   @db.VarChar(15)
  keyword     String   @db.VarChar(10)  // matches RIGROUP.Keywords cap
  action      String   // 'ADD' | 'REMOVE'
  updatedAt   DateTime @updatedAt
  updatedBy   String
  @@id([ricsSkuCode, keyword])
  @@index([keyword, action])
  @@schema("app")
}

// Audit header for a batch utility invocation.
model ProductsBatchOperation {
  id            String   @id @default(uuid())
  actor         String
  operationType String   // 'CHANGE_KEYWORDS_ADD' | 'CHANGE_KEYWORDS_REMOVE' |
                         // 'CHANGE_CATEGORY' | 'CHANGE_VENDOR' | 'CHANGE_SEASON' |
                         // 'CHANGE_GROUP_CODE' | 'CHANGE_SIZE_COLUMN' |
                         // 'CHANGE_SIZE_TYPE_STRUCTURE'
  criteriaJson  Json     // the SkuCriteria submitted by the operator
  changeJson    Json     // the specific target-value change
  affectedCount Int
  startedAt     DateTime @default(now())
  completedAt   DateTime?
  undoneAt      DateTime?
  items         ProductsBatchOperationItem[]
  @@index([startedAt])
  @@index([operationType, startedAt])
  @@schema("app")
}

// Per-SKU before/after — the undo payload.
model ProductsBatchOperationItem {
  id           String   @id @default(uuid())
  batchId      String
  batch        ProductsBatchOperation @relation(fields: [batchId], references: [id], onDelete: Cascade)
  ricsSkuCode  String   @db.VarChar(15)
  beforeJson   Json?    // prior effective value, for undo
  afterJson    Json?
  @@index([batchId])
  @@index([ricsSkuCode])
  @@schema("app")
}
```

**Read-path sketch** (effective-value adapter):

```sql
WITH effective AS (
  SELECT
    im.sku,
    COALESCE(o.category, im.category)      AS category,
    COALESCE(o.vendor, im.vendor)          AS vendor,
    COALESCE(o.season, im.season)          AS season,
    COALESCE(o.group_code, im.group_code)  AS group_code,
    im.key_words                           AS mirror_keywords
  FROM rics_mirror.inventory_master im
  LEFT JOIN app.sku_attribute_override o ON im.sku = o.rics_sku_code
),
effective_keywords AS (
  SELECT im.sku, k.keyword FROM rics_mirror.inventory_master im,
       UNNEST(string_to_array(im.key_words, ' ')) AS k(keyword)
  WHERE TRIM(k.keyword) <> ''
  UNION
  SELECT rics_sku_code, keyword FROM app.sku_keyword_override WHERE action = 'ADD'
  EXCEPT
  SELECT rics_sku_code, keyword FROM app.sku_keyword_override WHERE action = 'REMOVE'
)
SELECT sku FROM effective e
WHERE (... criteria filters combining effective values with AND/OR/ANY ...) ;
```

**Size utilities** (Change Size Columns, Change Size Types) edit taxonomy rather than SKUs. They read from `rics_mirror.size_types` and write to a (to-be-added) `app.size_type_override` table — schema defined alongside this module when Phase A2 lands. Decision deferred to the operator: either (a) follow the same `app.*` overlay pattern consistently, or (b) keep using the existing `SizeTypeRepository` Access-write path as an interim. Recommendation: (a) for consistency with the rest of this module and CLAUDE.md's hard rule.

## API surface

All routes mount under `/api/v1/utilities`.

```
POST   /api/v1/utilities/batch              # applyBatchChange(criteria, change)
GET    /api/v1/utilities/batch              # list operations (paginated)
GET    /api/v1/utilities/batch/:id          # one operation + items
POST   /api/v1/utilities/batch/:id/undo     # undo

# criteria preview (co-located here for the picker's debounced preview)
POST   /api/v1/products/skus/lookup         # listSkusByCriteria → { count, skus[], sample[] }
```

Every batch endpoint accepts and returns the same envelope:

```
POST /api/v1/utilities/batch
{
  "operationType": "CHANGE_KEYWORDS_ADD",
  "criteria": { categories: [42], vendors: ["TIMBERLAND"], onlyFuturePriceChanges: false, onlyWtdSales: false },
  "change":   { keyword: "WINTER26" }
}
→
{
  "batchId": "uuid",
  "affectedCount": 47,
  "preview": ["SKU123", "SKU124", "SKU125", "…"]
}
```

Dry-run mode: `POST .../batch?dryRun=1` returns the same shape but commits nothing and does not write audit rows.

## UI surface

- **Utilities hub**: `/utilities` — `ProductsUtilitiesHomePage.tsx`. Cards for each utility (active and deferred, the deferred ones disabled with tooltip).
- **Per-utility pages** under `/utilities/*`:
  - `/utilities/change-keywords` — canonical criteria-picker utility; Add/Remove radio + keyword input.
  - `/utilities/change-categories` — target-value: new category (number-picker from taxonomy).
  - `/utilities/change-vendors` — target-value: new vendor code (autocomplete from taxonomy).
  - `/utilities/change-seasons` — target-value: new season code.
  - `/utilities/change-group-codes` — target-value: new group code.
  - `/utilities/change-size-columns` — global column label rename (not criteria-picker-based).
  - `/utilities/change-size-types/:code` — restructure a single size grid with consolidation confirmations.
- **Batch history**: `/utilities/batch-history` — `BatchHistoryPage.tsx`. Table of operations (most recent first) + click-through to details + Undo button.
- **Shared component**: `apps/web/src/components/inventory/SkuCriteriaPicker.tsx` — autocomplete-multi-selects for each criterion + two filter checkboxes + live match-count preview.

Navigation: `/utilities` lives as a top-level entry in the main nav. A secondary link from `docs/modules/products.md`-owned `/products/taxonomy` also points here so merchandisers can find it from the taxonomy context.

## Dependencies

**Inbound (this module consumes)**
- From [`products`](products.md):
  - `listSkusByCriteria(criteria)` — the read primitive. Must join `rics_mirror.inventory_master` with `app.sku_attribute_override` + `app.sku_keyword_override` to resolve effective values before filtering.
  - Taxonomy APIs (`/api/v1/taxonomy/categories`, `/vendors`, `/seasons`, `/groups`, `/keywords`) — autocomplete data for the criteria picker and target-value forms.
  - Overlay tables' schema (defined in products but written by utilities): `app.sku_attribute_override`, `app.sku_keyword_override`.
- From [`employees`](employees.md):
  - `hasPermission(userId, 'utilities.batchChange' | 'utilities.undo')` — gate the utility pages and the undo action.
- From [`platform`](platform.md):
  - `ProductsAuditLog.record(...)` — non-blocking cross-module audit write.
  - Ingestion of `sync:rics` reload timing (optional) — used by the Batch History page to warn when an operation's overrides may have been applied before a reload that removed the underlying SKUs.

**Outbound (this module exposes)**
- To [`products`](products.md):
  - Effective-value adapter: `findEffectiveSkus(criteria)` → the SQL sketch above. Products' SKU list workbench uses the same adapter.
  - Overlay-aware `getEffectiveSku(code)` for single-SKU reads.
- To [`platform`](platform.md):
  - Events: `BatchOperationStartedEvent`, `BatchOperationCompletedEvent`, `BatchOperationUndoneEvent` — subscribe for notifications or admin telemetry.
- To the SKU warmup index (`ricsProductAdapter.loadSkuLookupIndex()`):
  - `invalidateSkusInWarmupIndex(skuCodes[])` — called at end of each batch op to re-warm affected entries so the SKU Lookup modal shows effective values.

## Out of scope for v1

- **Reset Pictures** — deferred until the `products` image pipeline stabilizes.
- **Check Data Integrity** — rescoped as Ingest Diagnostics; belongs to a separate planning exercise under `platform` or a new `ingest-diagnostics` module.
- **Change Salespeople** — belongs to `employees`.
- **Bulk Price Discount (Ch. 4 p. 73)** — lives in `products`, but consumes this module's `SkuCriteriaPicker` component and `applyBatchChange` primitive.
- **Redo** — undo is one level deep. Re-applying a reversed operation requires the operator to run the original utility again. A proper redo stack is out of scope for v1.
- **Scheduling a batch op for later** — all batch ops run inline. No cron-style deferred execution.
- **Cross-store scoping on utilities** — batch ops apply catalog-wide. Per-store scoping (e.g., "only change keywords for SKUs that have on-hand at store 2") is out of scope; operators filter by category/vendor/season instead.

## Open questions

1. **Size Columns / Size Types — overlay or direct MDB write?** The first two utilities to land operate on the size-type taxonomy, not SKUs. Decision needed: (a) add `app.size_type_override` and follow the same overlay-pattern consistency, or (b) let them keep using the existing `SizeTypeRepository` Access-write path as an interim. Recommended (a) — contradicts CLAUDE.md's hard rule otherwise.
2. **Dangling overrides after `sync:rics` reload.** When a RICS operator deletes a SKU, its overlay rows survive in `app.sku_attribute_override` / `app.sku_keyword_override`. The Batch History page should surface these. Format: a "Dangling (N)" badge on the op row + detail pane lists orphaned overrides. Deferred to the Batch History slice.
3. **Warmup re-invalidation cadence.** After each batch op, we re-warm only the affected SKUs (targeted invalidation). Open question: what is the exact contract between `utilities` and the warmup index — a direct function call on the same process, a pg_notify-based notification, or an in-memory event bus? The current warmup is an in-process singleton, so direct call is simplest; revisit if the warmup moves out of the API process.
4. **Cross-module bulk ops.** Should `inventory` transfers, `purchasing` PO receipts, and `sales-reporting` exports also route through `utilities` as bulk-op primitives? Not today — those are domain-specific and have their own UX. But the pattern is reusable; flagged for later.
5. **"Only SKUs with future price changes" filter depends on `ScheduledPriceChange`**, which is a Phase-B Postgres model per [products.md:183](products.md). In Phase A, the filter reads from `rics_mirror.*` price-change tables (if populated) or is disabled with a tooltip. Concrete resolution lands in the design spec at `docs/dev/specs/2026-04-21-utilities-batch-change-design.md`.
6. **"Only SKUs with Week-to-Date sales" filter depends on `sales-reporting`.** Same Phase-A vs. B consideration — in Phase A it reads `rics_mirror.1ritrans` with a week-to-date window.
