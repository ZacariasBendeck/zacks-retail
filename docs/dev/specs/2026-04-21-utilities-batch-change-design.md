# Design — `utilities` module: criteria-based batch change

**Status:** binding contract for the `utilities` module's Phase A slices.
**Date:** 2026-04-21.
**Module:** [`utilities`](../../modules/utilities.md) (new, module #14 in [MODULES.md](../../MODULES.md)).
**Depends on:** [`products`](../../modules/products.md) (read primitive, taxonomy APIs, overlay tables), [`platform`](../../modules/platform.md) (audit log).

## Why this spec exists

The operator asked for RICS Ch. 15 "Utilities 2" (p. 193+) ported as a dedicated `utilities` module — a single criteria-based SKU picker driving seven batch-change utilities (Change Keywords, Change Categories, Change Vendors, Change Seasons, Change Group Codes, Change Size Columns, Change Size Types). The module needs to honor CLAUDE.md's Phase-A hard rules: `rics_mirror.*` is read-only (wiped on every ETL reload), RICS MDBs are never written, writes land in `app.*` / `public.*` Postgres tables. Since the change surface is cross-cutting (affects product attributes owned by `products`) and has its own audit + undo semantics, it's a module, not a slice inside `products`.

This spec is the binding contract for the schema, the shared primitives, and the per-utility envelope. It supersedes the phased notes in [`docs/modules/utilities.md`](../../modules/utilities.md) for any implementation detail they conflict on.

## Phase declaration

**Phase A.** Reads from `rics_mirror.inventory_master`, `rics_mirror.size_types`. Writes to `app.sku_attribute_override`, `app.sku_keyword_override`, `app.size_type_override`, `app.products_batch_operation`, `app.products_batch_operation_item`. No MDB writes. No `rics_mirror` writes.

Phase B promotion (out of scope for this spec): overlays merge into canonical module-owned schemas (`products.sku`, `products.sku_keyword`) once RICS stops moving. Spec for the promotion migration is written separately when Phase B cutover begins.

## Schema (Prisma, all `@@schema("app")`)

```prisma
// Replace-style overlay for singular SKU attributes. Sparse — only non-null columns override.
model SkuAttributeOverride {
  ricsSkuCode String   @id @db.VarChar(15)
  category    Int?
  vendor      String?  @db.VarChar(10)
  season      String?  @db.VarChar(2)
  groupCode   String?  @db.VarChar(10)
  updatedAt   DateTime @updatedAt
  updatedBy   String
  @@index([category])
  @@index([vendor])
  @@index([season])
  @@index([groupCode])
  @@schema("app")
}

// Add/remove overlay for keywords, layered on the RICS space-separated string.
model SkuKeywordOverride {
  ricsSkuCode String   @db.VarChar(15)
  keyword     String   @db.VarChar(10)
  action      String   // 'ADD' | 'REMOVE'
  updatedAt   DateTime @updatedAt
  updatedBy   String
  @@id([ricsSkuCode, keyword])
  @@index([keyword, action])
  @@schema("app")
}

// Replace-style overlay for size-type taxonomy (columns/rows arrays).
model SizeTypeOverride {
  code        Int      @id
  description String?  @db.VarChar(32)
  columnsJson Json?    // ['4', '4.5', '5', …] — null = use mirror
  rowsJson    Json?    // ['A', 'B', …] — null = use mirror
  maxColumns  Int?
  maxRows     Int?
  updatedAt   DateTime @updatedAt
  updatedBy   String
  @@schema("app")
}

// Batch-operation audit header.
model ProductsBatchOperation {
  id            String    @id @default(uuid())
  actor         String
  operationType String    // see BatchOperationType below
  criteriaJson  Json      // SkuCriteria (empty for non-criteria ops like size utilities)
  changeJson    Json      // typed per operationType (see AttributeChange below)
  affectedCount Int
  startedAt     DateTime  @default(now())
  completedAt   DateTime?
  undoneAt      DateTime?
  items         ProductsBatchOperationItem[]
  @@index([startedAt])
  @@index([operationType, startedAt])
  @@schema("app")
}

// Per-SKU / per-row before/after for undo.
model ProductsBatchOperationItem {
  id          String @id @default(uuid())
  batchId     String
  batch       ProductsBatchOperation @relation(fields: [batchId], references: [id], onDelete: Cascade)
  ricsSkuCode String @db.VarChar(15)
  beforeJson  Json?
  afterJson   Json?
  @@index([batchId])
  @@index([ricsSkuCode])
  @@schema("app")
}
```

### Indexing rationale

- `sku_attribute_override`: indexed on each overridden column so reverse lookups ("all SKUs overridden to vendor X") stay O(log n). Sparse, so index sizes are small.
- `sku_keyword_override`: compound `(keyword, action)` index supports "find all SKUs where keyword FOO has been added" — the backbone of the effective-keywords CTE.
- Batch operation tables indexed on `(startedAt)` and `(operationType, startedAt)` for the Batch History page's default sort and filter-by-type views.
- `productsBatchOperationItem.ricsSkuCode` indexed so "show me all ops that ever touched this SKU" stays fast for the SKU detail page.

### Not indexed by design

- `rics_mirror.inventory_master` has no indexes (per CLAUDE.md — mirror is dropped on reload; readers index at the app layer). Criteria queries do a full scan of `rics_mirror.inventory_master` (~200-300k rows). Measured: sub-second on the dev machine with a warm page cache. If a future scale event makes this the bottleneck, the `sync:rics` pipeline can append `CREATE INDEX` calls after the schema swap — local to the ETL, not a Prisma concern.

## Types

```ts
// apps/api/src/services/utilities/types.ts
export type SkuCriteria = {
  skus?: string[];
  categories?: number[];
  vendors?: string[];
  seasons?: string[];
  stylesColors?: string[];      // substring match, case-insensitive
  groups?: string[];
  keywords?: string[];          // OR within; EXISTS across
  onlyFuturePriceChanges?: boolean;
  onlyWtdSales?: boolean;
};

export type BatchOperationType =
  | 'CHANGE_KEYWORDS_ADD' | 'CHANGE_KEYWORDS_REMOVE'
  | 'CHANGE_CATEGORY' | 'CHANGE_VENDOR' | 'CHANGE_SEASON' | 'CHANGE_GROUP_CODE'
  | 'CHANGE_SIZE_COLUMN'               // global label rename
  | 'CHANGE_SIZE_TYPE_STRUCTURE';      // grid restructure with consolidation

// Shape of changeJson, per operationType:
export type AttributeChange =
  | { type: 'CHANGE_KEYWORDS_ADD'; keyword: string }
  | { type: 'CHANGE_KEYWORDS_REMOVE'; keyword: string }
  | { type: 'CHANGE_CATEGORY'; category: number }
  | { type: 'CHANGE_VENDOR'; vendor: string }
  | { type: 'CHANGE_SEASON'; season: string }
  | { type: 'CHANGE_GROUP_CODE'; groupCode: string }
  | { type: 'CHANGE_SIZE_COLUMN'; oldLabel: string; newLabel: string }
  | { type: 'CHANGE_SIZE_TYPE_STRUCTURE'; code: number; columns: string[]; rows: string[] };

export type EffectiveSku = {
  sku: string;
  category: number | null;
  vendor: string | null;
  season: string | null;
  groupCode: string | null;
  styleColor: string | null;
  keywords: string[];           // computed from effective_keywords CTE
  retailPrice: number;
  description: string;
};
```

## Read primitive: `findSkusByCriteria`

File: [`apps/api/src/services/utilities/effectiveInventory.ts`](../../../apps/api/src/services/utilities/effectiveInventory.ts).

The one place the overlay-merge SQL lives. Every read path that needs to filter or list SKUs goes through here (the products SKU list workbench will migrate here in a follow-up).

```ts
export async function findSkusByCriteria(
  c: SkuCriteria,
  opts?: { sampleLimit?: number },  // for preview UIs
): Promise<{ count: number; skus: string[]; sample: EffectiveSku[] }> {
  return prisma.$queryRaw`
    WITH effective AS (
      SELECT
        im.sku,
        COALESCE(o.category, im.category)      AS category,
        COALESCE(o.vendor, im.vendor)          AS vendor,
        COALESCE(o.season, im.season)          AS season,
        COALESCE(o.group_code, im.group_code)  AS group_code,
        im.style_color,
        im.key_words                           AS mirror_keywords,
        im.retail_price,
        im."desc"                              AS description
      FROM rics_mirror.inventory_master im
      LEFT JOIN app.sku_attribute_override o ON im.sku = o.rics_sku_code
    ),
    effective_keywords AS (
      SELECT im.sku, TRIM(kw) AS keyword
      FROM rics_mirror.inventory_master im,
           UNNEST(string_to_array(COALESCE(im.key_words, ''), ' ')) AS kw
      WHERE TRIM(kw) <> ''
      UNION
      SELECT rics_sku_code, keyword FROM app.sku_keyword_override WHERE action = 'ADD'
      EXCEPT
      SELECT rics_sku_code, keyword FROM app.sku_keyword_override WHERE action = 'REMOVE'
    )
    SELECT e.sku
    FROM effective e
    WHERE (${c.skus ?? null}::text[] IS NULL OR e.sku = ANY(${c.skus}))
      AND (${c.categories ?? null}::int[] IS NULL OR e.category = ANY(${c.categories}))
      AND (${c.vendors ?? null}::text[] IS NULL OR e.vendor = ANY(${c.vendors}))
      AND (${c.seasons ?? null}::text[] IS NULL OR e.season = ANY(${c.seasons}))
      AND (${c.groups ?? null}::text[] IS NULL OR e.group_code = ANY(${c.groups}))
      AND (${c.stylesColors ?? null}::text[] IS NULL OR EXISTS (
        SELECT 1 FROM UNNEST(${c.stylesColors}::text[]) s
        WHERE e.style_color ILIKE '%' || s || '%'
      ))
      AND (${c.keywords ?? null}::text[] IS NULL OR EXISTS (
        SELECT 1 FROM effective_keywords ek
        WHERE ek.sku = e.sku AND ek.keyword = ANY(${c.keywords})
      ))
      AND (${c.onlyFuturePriceChanges ?? false} = false OR EXISTS (
        SELECT 1 FROM rics_mirror.price_changes pc
        WHERE pc.sku = e.sku AND pc.effective_date > CURRENT_DATE
      ))
      AND (${c.onlyWtdSales ?? false} = false OR EXISTS (
        SELECT 1 FROM rics_mirror."1ritrans" t
        WHERE t.sku = e.sku AND t.date >= date_trunc('week', CURRENT_DATE)
      ))
  `;
}
```

Notes:
- All criteria arrays are treated as "null → no filter, array → `= ANY(array)`". Keeps the same query shape regardless of which filters are set.
- `stylesColors` is a substring match per RICS manual (multiple substrings OR together).
- `keywords` uses the effective CTE (RICS string ∪ ADDs − REMOVEs).
- The two boolean filters (`onlyFuturePriceChanges`, `onlyWtdSales`) check for the existence of rows in `rics_mirror.price_changes` / `rics_mirror."1ritrans"`. **If either source table is absent from the mirror on a given install, the corresponding filter is disabled at the UI level with a tooltip.** Backend silently returns no rows if the table is missing; routes catch the error and surface "filter unavailable."

## Write primitive: `applyBatchChange`

File: [`apps/api/src/services/utilities/batchChangeService.ts`](../../../apps/api/src/services/utilities/batchChangeService.ts).

```ts
export async function applyBatchChange(input: {
  operationType: BatchOperationType;
  criteria: SkuCriteria;
  change: AttributeChange;
  actor: string;
  dryRun?: boolean;
}): Promise<{ batchId: string | null; affectedCount: number; preview: string[] }> {
  // 1. Resolve SKUs (outside txn — pure read).
  const { skus } = await findSkusByCriteria(input.criteria);
  if (skus.length === 0) {
    return { batchId: null, affectedCount: 0, preview: [] };
  }

  if (input.dryRun) {
    return { batchId: null, affectedCount: skus.length, preview: skus.slice(0, 20) };
  }

  // 2. Compute before/after snapshots (pure read).
  const before = await getEffectiveSkus(skus);              // Map<sku, EffectiveSku>
  const items = skus.map(sku => computeDiffItem(sku, before.get(sku)!, input.change));

  // 3. One transaction: op header + items + overlay upserts + completion.
  const batchId = await prisma.$transaction(async (tx) => {
    const op = await tx.productsBatchOperation.create({
      data: {
        actor: input.actor,
        operationType: input.operationType,
        criteriaJson: input.criteria as any,
        changeJson: input.change as any,
        affectedCount: skus.length,
      },
    });

    await tx.productsBatchOperationItem.createMany({
      data: items.map(it => ({
        batchId: op.id,
        ricsSkuCode: it.sku,
        beforeJson: it.before as any,
        afterJson: it.after as any,
      })),
    });

    await applyOverlayWrites(tx, input.operationType, input.change, skus, input.actor);

    await tx.productsBatchOperation.update({
      where: { id: op.id },
      data: { completedAt: new Date() },
    });

    return op.id;
  });

  // 4. Post-commit: warmup invalidation + cross-module audit.
  await invalidateWarmupForSkus(skus);
  await auditLog.record({
    actor: input.actor,
    action: input.operationType,
    targetTable: 'sku_attribute_override',
    targetPk: batchId,
    payload: { criteria: input.criteria, change: input.change, affectedCount: skus.length },
  });

  return { batchId, affectedCount: skus.length, preview: skus.slice(0, 20) };
}
```

### Per-operation overlay write logic (`applyOverlayWrites`)

- **`CHANGE_KEYWORDS_ADD { keyword }`**: insert `(sku, keyword, 'ADD')` into `sku_keyword_override` for each SKU. `ON CONFLICT (sku, keyword)` — if there's an existing `REMOVE` row, update it to `ADD`. If there's already an `ADD` row, no-op.
- **`CHANGE_KEYWORDS_REMOVE { keyword }`**: insert `(sku, keyword, 'REMOVE')`. `ON CONFLICT` — if there's an existing `ADD` row, update it to `REMOVE`. If the keyword isn't currently on the SKU (neither in RICS string nor in an ADD override), we still write the `REMOVE` row so the operator's intent is preserved — on the next `sync:rics` reload, if RICS suddenly has the keyword, our REMOVE still takes effect.
- **`CHANGE_CATEGORY { category }`**: upsert `sku_attribute_override (sku, category=<new>)`. Preserves other override columns.
- **`CHANGE_VENDOR { vendor }`**, **`CHANGE_SEASON { season }`**, **`CHANGE_GROUP_CODE { groupCode }`**: same shape.
- **`CHANGE_SIZE_COLUMN { oldLabel, newLabel }`**: not SKU-scoped. Load all size types from `rics_mirror.size_types` + `size_type_override`, compute effective columns, find ones containing `oldLabel`, write `size_type_override` rows with updated `columnsJson`. Batch items record the size-type code in `ricsSkuCode` field (reused as generic row key).
- **`CHANGE_SIZE_TYPE_STRUCTURE { code, columns, rows }`**: single `size_type_override` upsert with the new arrays. Client computes consolidation before submit (data from deleted column merges into column 1); server trusts the submitted arrays.

### Why `items.createMany` + overlay writes, not a single denormalized log

Separating the **intent record** (`ProductsBatchOperationItem.afterJson`) from the **state mutation** (`sku_attribute_override`) means:
1. We can undo by replaying `beforeJson` against the overlay tables — no need to re-derive state.
2. We can detect drift — if a later op or a manual edit changes the overlay, the original op's `afterJson` still reflects what *was* applied.
3. Batch History detail views render from items; no expensive joins back to overlay tables.

## Undo: `undoBatch`

```ts
export async function undoBatch(batchId: string, actor: string): Promise<{ reversed: number }> {
  const op = await prisma.productsBatchOperation.findUnique({
    where: { id: batchId }, include: { items: true }
  });
  if (!op) throw new Error('NOT_FOUND');
  if (op.undoneAt) throw new Error('ALREADY_UNDONE');

  const skus = op.items.map(it => it.ricsSkuCode);

  await prisma.$transaction(async (tx) => {
    for (const item of op.items) {
      await reverseOverlayWrite(tx, op.operationType, item, actor);
    }
    await tx.productsBatchOperation.update({
      where: { id: batchId },
      data: { undoneAt: new Date() },
    });
  });

  await invalidateWarmupForSkus(skus);
  await auditLog.record({
    actor, action: 'UNDO_BATCH',
    targetTable: 'products_batch_operation', targetPk: batchId,
    payload: { originalOperationType: op.operationType, reversed: skus.length },
  });

  return { reversed: skus.length };
}
```

Per-op reverse logic:
- **Keyword ADD/REMOVE**: delete the override row written by the original op (or, if `beforeJson` shows the reverse action existed previously, restore it).
- **Single-attribute override (category/vendor/season/group)**: if `beforeJson.override` was null → delete the overlay row. Otherwise → write it back.
- **Size utilities**: restore `size_type_override` from `beforeJson`.

## API routes

All under `/api/v1/utilities/*` (mounted in [`apps/api/src/app.ts`](../../../apps/api/src/app.ts) alongside products routes).

```
POST   /api/v1/utilities/batch
       ?dryRun=1 optional — returns count + preview without writing
       body: { operationType, criteria, change }
       → { batchId | null, affectedCount, preview: string[] }

GET    /api/v1/utilities/batch?limit=50&offset=0&operationType=CHANGE_KEYWORDS_ADD
       → { total, rows: ProductsBatchOperation[] }

GET    /api/v1/utilities/batch/:id
       → { op: ProductsBatchOperation, items: ProductsBatchOperationItem[] }

POST   /api/v1/utilities/batch/:id/undo
       → { reversed: number }
```

Separately, co-located with the products SKU surface (since it's the criteria read primitive used by products' SKU list workbench too):

```
POST   /api/v1/products/skus/lookup
       body: SkuCriteria
       → { count: number, skus: string[], sample: EffectiveSku[] }
```

Error envelope matches the existing products routes (`{ error: { code, message } }`, HTTP status per `repoHttpStatus`).

Permissions (via `employees.hasPermission`):
- `utilities.batchChange` — required for POST to `/utilities/batch`.
- `utilities.undo` — required for POST to `/utilities/batch/:id/undo`.
- `utilities.view` — required for the GET endpoints.

## SKU warmup integration

CLAUDE.md HARD RULE: `loadSkuLookupIndex()` in [`apps/api/src/services/ricsProductAdapter.ts`](../../../apps/api/src/services/ricsProductAdapter.ts) must pre-load every SKU — never a capped subset. This spec:

1. **Source change**: `loadSkuLookupIndex` reads from `findEffectiveInventoryRows()` (a non-criteria variant of `findSkusByCriteria` returning full effective rows) instead of raw `rics_mirror.inventory_master`. Row count is identical; the columns reflect overrides.
2. **Targeted invalidation**: the service exports `invalidateWarmupForSkus(codes: string[])`. Implementation re-reads effective rows for exactly those SKUs and patches the in-memory index. Full re-warmup (re-reading all 200k+ rows) is only triggered on startup and on explicit `sync:rics` completion hook.
3. **Non-blocking**: invalidation is `await`ed in the POST handler before returning the response so the operator sees fresh data when they navigate to the SKU Lookup modal afterward. (If invalidation fails, log and continue — the next periodic rebuild catches up.)

## Verification

### Local dev

1. **Seed**: use an existing `pnpm sync:rics` run (operator-invoked) so `rics_mirror.inventory_master` is populated.
2. **Migration**: `pnpm --filter @benlow-rics/api prisma migrate dev` applies the new Prisma migration.
3. **Unit / integration tests** (Jest):
   - `effectiveInventory.test.ts`: seed overrides for 3 SKUs, assert `findSkusByCriteria` returns the expected effective values for each filter axis. Re-run with no overrides — results match raw mirror.
   - `batchChangeService.test.ts`: call `applyBatchChange({operationType:'CHANGE_KEYWORDS_ADD', criteria:{categories:[42]}, change:{keyword:'FOO'}})`. Assert `products_batch_operation` + `_items` rows exist, overrides applied, `affectedCount` matches. Call `undoBatch` — overrides gone, `undoneAt` set.
   - `undoBatch.test.ts`: edge case — undo a `CHANGE_KEYWORDS_ADD` where the keyword pre-existed in RICS string; assert a `REMOVE` override is NOT written (original op wouldn't have meaningfully added anything; undo is a no-op for that SKU).
   - `criteriaLookup.test.ts`: style-color substring + multi-keyword + boolean filter combinations.
4. **End-to-end (Vitest + Playwright-style for the web)**:
   - Load `/utilities/change-keywords`, pick category + vendor, preview shows count, click apply, toast shows, Batch History lists the op, Undo reverses it.

### Phase A safety

- `sync:rics` re-run after a batch op: overrides survive; `rics_mirror.inventory_master` repopulates. Criteria lookup still reflects overrides.
- SKU warmup observability: the canonical startup log line (per [`docs/operations/sku-lookup-index-warmup.md`](../../operations/sku-lookup-index-warmup.md)) shows the full SKU count both before and after a batch op.
- `accessOleDb` stays async — confirm via server logs (`spawn` pattern, never `spawnSync`).
- No writes to `E:/data/rics-mdbs/*.MDB`.

## Out of scope for this spec

- **Reset Pictures**, **Check Data Integrity**, **Change Salespeople**, **Frequent Buyer Plan** — deferred per module spec.
- **Cross-store criteria** — operators filter catalog-wide in v1.
- **Redo stack** — single-level undo only.
- **Scheduled / deferred batch ops** — all apply inline.
- **Phase B migration from overlays to canonical module schemas** — separate spec when Phase B cutover begins.
