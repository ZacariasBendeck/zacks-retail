# SKU Lifecycle Backfill (`rics_mirror.inventory_master` → `app.sku`)

**Status:** post-swap phase of `sync:rics`, also runnable standalone. Idempotent.

## What it is

A second phase of the RICS → Postgres sync that mirrors every non-deleted row from `rics_mirror.inventory_master` into `app.sku` as an ACTIVE row with `source = 'rics'`. Operator-created rows (`source = 'app'`) are never touched. Source lives at [`apps/api/src/services/sync/skuLifecycleBackfill.ts`](../../apps/api/src/services/sync/skuLifecycleBackfill.ts); standalone CLI at [`apps/api/scripts/sync-rics-skus.ts`](../../apps/api/scripts/sync-rics-skus.ts).

Invocation:

```
pnpm --filter @benlow-rics/api sync:rics-skus
```

Also fires automatically after every `pnpm sync:rics` (post-swap, before the `etl_run` summary UPDATE).

## Why it exists

Before this phase existed, `app.sku` held only operator-created SKUs (net-new drafts via `POST /api/v1/products/sku-drafts`). Legacy RICS SKUs lived exclusively in `rics_mirror.inventory_master`. Consumers that used `skuLifecycleGate.findActiveSku(...)` returned `Ok(null)` for every RICS code and fell through to the mirror adapter. Two surfaces, two queries, ambiguous semantics.

Backfilling unifies this: post first-run, every SKU (legacy + net-new) is in `app.sku`. The gate short-circuits for everything. Phase B cutover becomes "stop reading `rics_mirror.inventory_master` at the repository layer"; Phase C becomes `DROP SCHEMA rics_mirror`.

## Source ⇄ target mapping

| `rics_mirror.inventory_master` | `app.sku` | Notes |
|---|---|---|
| `sku` | `code` | Direct copy. Also used to derive `provisional_code` as `'RICS-' || sku` (unique, stable, ≤20 chars fits VARCHAR(32)). |
| `"desc"` | `description_rics` | Direct copy. |
| `vendor` | `vendor_id` | `NULLIF` empty strings. |
| `category` | `category_number` | SmallInt → Int. |
| *(via `category_product_family`)* | `family_code` | LEFT JOIN on `category_number`; `COALESCE(..., 'general')` for unmapped / NULL categories. |
| `vendor_sku` | `vendor_sku` | `NULLIF` empty strings. |
| `manufacturer` | `manufacturer` | Free text; `brand_id` stays NULL (no canonical brand dimension yet). |
| `size_type` | `size_type` | SmallInt copy. |
| `style_color`, `season`, `label_code`, `color_code`, `group_code`, `picture_file_name`, `comment` | same-named | `NULLIF` empties. |
| `key_words` | `keywords` | Column rename. |
| `list_price`, `retail_price`, `mark_down_price1`, `mark_down_price2`, `current_cost` | same-named | Numeric(18,4) → Decimal(12,2). |
| `current_price` (smallint 1–4) | `current_price_slot` (text enum) | `1→LIST`, `2→RETAIL`, `3→MD1`, `4→MD2`, NULL→NULL. |
| `coupon` | `coupon` | `COALESCE(..., false)`. |
| `order_multiple`, `order_uom` | same-named | Direct copy. |
| `status` | `rics_status` | `NULL` or `'D'`. Rows with `status = 'D'` are EXCLUDED from the upsert and handled by the discontinue pass. |
| *(constant)* `'ACTIVE'` | `sku_state` | Every new row is ACTIVE. |
| *(constant)* `'rics'` | `source` | Discriminator. |
| *(constant)* `now()` | `activated_at`, `rics_last_synced_at`, `created_at`, `updated_at` | Set at insert. On re-run, only `rics_last_synced_at` + `updated_at` refresh. |
| *(constant)* `'sync:rics-bulk'` | `created_by`, `activated_by` | Default actor; overridable by the service's `actor` option. |

## Three passes per run

1. **Upsert (`app.sku`)** — INSERT every non-deleted mirror row. On `ON CONFLICT (code) WHERE code IS NOT NULL`, UPDATE the row — but only if `app.sku.source = 'rics'` (operator rows are immune). The UPDATE also flips `DISCONTINUED → ACTIVE` via a `CASE` on `sku_state`, clears `discontinued_*`, and refreshes `activated_*`.
2. **Discontinue** — Any `source='rics'` row whose `code` no longer appears in the current mirror (physically removed OR `status='D'`) is flipped to DISCONTINUED with `discontinued_at`, `discontinued_by` set. Operator rows untouched.
3. **Operator-collision detection** — SELECT every `source='app'` row whose `code` also exists in the mirror. These are edge cases an operator should review — the app view won, the RICS view was ignored. Logged to stderr, count + first-10 codes returned in `BackfillResult.operatorCollisions*`.

Then per-row audit inserts into `app.sku_activity` for `created`, `reactivated`, `discontinued` events only. "Updated" audit rows are intentionally skipped — the UPSERT fires an UPDATE on every rics-source row every run, and writing 200k "updated" rows per no-op sync would drown the log.

Full flow runs in a single `BEGIN…COMMIT`. Any failure → `ROLLBACK` → safe to re-run.

## Typical output

First run (fresh `app.sku`, only operator rows):

```
[sync:rics-skus] OK — inserted=203,749 updated=0 reactivated=0 discontinued=0 operatorCollisions=0 in 6.5s
```

Subsequent runs against an unchanged mirror:

```
[sync:rics-skus] OK — inserted=0 updated=203,749 reactivated=0 discontinued=0 operatorCollisions=0 in 5.8s
```

(`updated=N` = N rows passed through ON CONFLICT DO UPDATE. Expected on every re-run because the mirror resets `rics_last_synced_at`; no audit rows written unless a real state transition happened.)

## Acceptance query

```sql
SELECT
  (SELECT count(*)::int FROM app.sku WHERE source='rics' AND sku_state='ACTIVE')        AS app_active_rics,
  (SELECT count(*)::int FROM rics_mirror.inventory_master
     WHERE sku IS NOT NULL AND (status IS NULL OR status <> 'D'))                        AS mirror_active,
  (SELECT count(*)::int FROM app.sku WHERE source='rics' AND sku_state='DISCONTINUED')  AS app_discontinued_rics,
  (SELECT count(*)::int FROM app.sku WHERE source='app')                                AS app_operator_rows;
```

Expected: `app_active_rics == mirror_active`. On first-ever run, `app_discontinued_rics = 0`; later runs may be `> 0` as RICS prunes or flags `status='D'`.

## Failure semantics

- **Backfill failure during `pnpm sync:rics`** → mirror has already committed. The run still reports `status='ok'` for the mirror; the backfill error is surfaced via `RefreshResult.skuBackfillError` and a console `[sync:rics] SKU backfill FAILED — …` line. Operator heals with `pnpm sync:rics-skus`.
- **Backfill failure during `pnpm sync:rics-skus`** → the backfill transaction rolls back; `app.sku` unchanged. Fix the underlying cause, re-run.

## Runbook for the first run in production

1. Snapshot: `pg_dump production → staging`, apply all migrations on staging.
2. Confirm `rics_mirror` is current on staging (re-run `pnpm sync:rics` if stale).
3. Run standalone: `pnpm --filter @benlow-rics/api sync:rics-skus`.
4. Execute the acceptance query; save output.
5. Spot-check 10 random codes: `SELECT * FROM app.sku WHERE code = '<code>'`. Verify description, family, price-slot, pricing.
6. Confirm no operator rows mutated: `SELECT count(*) FROM app.sku WHERE source='app' AND updated_at > <sync_start_ts>` should equal 0.
7. If any mismatch: `DELETE FROM app.sku WHERE source='rics'` (operator rows untouched); re-run the sync.
8. Once staging clean, repeat on prod during a quiet window. The first real `sync:rics` exercises the full flow.

## Hard rules

- **`WHERE app.sku.source = 'rics'` stays on every DO UPDATE clause.** This is the only thing standing between the sync and a mass operator-row overwrite. Do not remove.
- **The service uses raw `pg.Client.query`, not Prisma.** At 203k rows, Prisma's createMany is ~30× slower. Keep the UPSERT as raw SQL.
- **Provisional code format `'RICS-' || sku` stays stable.** Operator DRAFT codes use `DRF-YYMMDD-XXXXXX`; the `RICS-` prefix makes source visually obvious and avoids namespace collision.
- **`current_price_slot` mapping is canonical.** If RICS ever introduces a new `current_price` value (5, 6…), the backfill maps to NULL. Update the CASE in `skuLifecycleBackfill.ts` and coordinate with `current_price_slot` consumers first.

## Related docs

- [docs/operations/rics-mirror-sync.md](rics-mirror-sync.md) — the upstream mirror reload that this phase runs after.
- [docs/operations/sku-lifecycle-gate.md](sku-lifecycle-gate.md) — gate helpers that now transparently cover every legacy RICS code.
- [docs/modules/products/](../modules/products/) — products module spec.
