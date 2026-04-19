# Physical Inventory — P1.a Slice 3 build plan

**Date:** 2026-04-19
**Module spec:** [docs/modules/physical-inventory.md](../../modules/physical-inventory.md)
**Phase:** 1.a (mirror RICS, no commit-back)
**Slice:** 3 (full P1.a — every spec surface except `applyCountAdjustments`)

## Context

The team picked **Slice 3 of P1.a**: build the entire physical-inventory module surface — sessions, mobile counting, banded variance, conflict detection, independent verification, CSV import, worksheet generation — but **do not** commit count adjustments back to any inventory ledger. RICS Access stays authoritative for on-hand. Operators run the count in Zack's Retail, get a variance report, then key the adjustments into RICS by hand.

This plan covers what changes from the module spec for Phase 1.a, the resolution of the spec's 12 open questions, and the wave-by-wave implementation order.

## What changes from the module spec for P1.a

| Spec element | P1.a behavior |
|---|---|
| Status `POSTING` and `COMMITTED` | Replaced by terminal status `EXPORTED` (variance was generated and operator acknowledged manual RICS entry). |
| `inventory.applyCountAdjustments(sessionId)` | **Not called.** No mutation of any inventory ledger. |
| `CountSessionSnapshot` source | Read live from RICS via [ricsInventoryAdapter.ts](../../../apps/api/src/services/ricsInventoryAdapter.ts) at freeze time; flatten the wide-column `OnHand_01..18` cells to one snapshot row per (storeNumber, skuId, columnLabel, rowLabel). Stored in the new admin DB (SQLite). |
| Advisory store-lock (`lockStoreDuringCount`) | Field exists on the table for forward compatibility; not enforced in P1.a (RICS is authoritative — nothing to lock against). |
| `sales-pos` advisory-lock dependency | Not wired in P1.a. |
| `inventory.applyCountAdjustments` event chain | Replaced by an internal `markSessionExported(sessionId, exportedBy)` action. |

Everything else from the module spec — multi-device counting, banded variance, conflict detection, independent verification, scope filtering, mobile join codes, CSV import, worksheets — ships in P1.a unchanged.

## Open question resolutions (decisive — not requesting user review)

| # | Question | Resolution |
|---|---|---|
| 1 | Snapshot granularity | **Separate `count_session_snapshot_cells` table** (queryable, indexable). One row per cell. Avoids JSON blob scan for items-not-counted and variance computation. |
| 2 | Cell deletion vs. zero count | UI exposes a distinct **"Mark zero"** action that creates an entry with `is_zero_flag = 1` (semantic: "set on-hand to zero in *every* cell of this SKU at export time"). Entering `0` in a normal cell save creates a regular entry with `quantity = 0` (semantic: "this specific cell is empty"). Two distinct affordances, two distinct semantics. |
| 3 | Variance bands per-category | Defer. Ship with company-default `low/material/extreme` thresholds in `store-ops.CompanyPhysicalInventorySettings`. Per-category overrides are Phase 2. |
| 4 | Movement-during-count lock | N/A in P1.a. Field present for forward compat. |
| 5 | Independent Verification N | Default `2` (two independent counts must agree). Per-session override at creation. |
| 6 | Conflict resolution authority | Session opener **plus** any user with `physicalInventory.acknowledgeMaterialVariance` permission. Same gate as material variance ack. |
| 7 | Mobile offline buffer | Buffer up to **200 entries OR 30 minutes**, whichever comes first. Warning banner at 150 entries. Hard-stop after threshold — operator must reconnect to continue scanning. |
| 8 | Worksheet pre-fill mode | **Opt-in flag, default off.** Ships in Slice 3 as a checkbox on the worksheet generator. |
| 9 | Cancel retains entries | **Yes, retain.** Soft delete via `status = CANCELLED`; entries persist for audit. |
| 10 | `applyCountAdjustments` idempotency | N/A in P1.a (no apply). When the contract eventually lands, it'll be idempotent on `sessionId` per the spec's own recommendation. |
| 11 | `counted = snapshot + post-freeze + delta` arithmetic | N/A in P1.a (no commit). Variance is `countedQty - snapshotOnHand`, full stop. Post-freeze movements are out of scope because RICS keeps writing to its own database independently. |
| 12 | Audit retention horizon | Ship without retention. Sessions and entries persist indefinitely until `platform` retention work lands. |

## Implementation phasing (waves)

The 4–6 week scope is broken into four waves. Each wave is independently shippable and adds operational value.

### Wave 1 — Foundations + lifecycle + entry path (this commit)

The data layer and the bare lifecycle. Operators can create sessions, freeze the snapshot, enter counts (desktop only, manual + UPC), and view raw counts back. No variance computation yet, no review/export.

- SQLite migration `020_physical_inventory_p1a.{up,down,verify}.sql` — all 8 tables.
- `apps/api/src/models/physicalInventory.ts` — types, row→entity functions, sort allowlists.
- `apps/api/src/services/physicalInventoryService.ts` — `createSession`, `openSession`, `freezeSession` (calls `ricsInventoryAdapter.getInventoryInquiry` per SKU in scope), `addEntry`, `addBulkEntries`, `getSession`, `listSessions`, `getEntriesForSku`, `getRunningTotalsForSku`, `cancelSession`.
- `apps/api/src/routes/physicalInventoryRoutes.ts` — REST endpoints for the above.
- `app.ts` wiring — `app.use('/api/v1/count-sessions', physicalInventoryRoutes)`.
- `apps/api/tests/physicalInventory.test.ts` — lifecycle (create → open → freeze → entry → cancel) and basic invariants.

### Wave 2 — Variance + review + export

Compute variance at `READY_FOR_REVIEW`, band into Zero/Low/Material/Extreme, gate the export on review acks, generate CSV and PDF.

- Service: `computeVariances`, `getItemsNotCounted`, `getVarianceSummary`, `acknowledgeVariance`, `recordReviewAck`, `markSessionExported`, `bulkZeroOut`.
- Routes for the above.
- CSV export endpoint (`?format=csv`) for variance and items-not-counted.
- PDF generation for worksheet + variance — needs library decision (deferred to Wave 2 kickoff).
- Variance band thresholds read from `store-ops.CompanyPhysicalInventorySettings` (build the settings table if it doesn't exist).
- Web admin UI: Sessions list, New Session wizard, Session detail dashboard, Enter Counts page, Variance Review page, Items Not Counted page, Worksheet generator page.

### Wave 3 — Mobile + concurrency + ingestion

Mobile web client, multi-counter session join, CSV import, conflict detection, Independent Verification mode.

- Service: `joinSessionByCode`, `registerDevice`, `importBatchCsv`, `acknowledgeBatch`, `computeConflicts`, `resolveConflict`.
- Routes.
- WebSocket fanout for live session-detail updates (use `ws` package).
- `/m/count` mobile route in `apps/web` (or split mobile into its own SPA — defer that decision).
- Camera barcode scanning (`@zxing/browser` or similar — Wave 3 kickoff).
- Conflict Review panel.
- IndexedDB-backed offline buffer on the mobile client.

### Wave 4 — Notifications + retention + telemetry

Hooks into `platform` for the soft pieces. Depends on `platform` having a notification + retention surface; defer if not ready.

- `CountSessionOpenedEvent`, `CountSessionFrozenEvent`, `CountSessionReviewReadyEvent`, `CountSessionCancelledEvent`, `ExtremeVarianceFlaggedEvent` event emission.
- Notification routing for store managers + CEO (extreme variance).
- Retention purge job for `count_entries` and `count_session_snapshot_cells` after configurable window.
- Telemetry channel for live updates (replaces poll).

## Critical files to read before each wave

- [docs/modules/physical-inventory.md](../../modules/physical-inventory.md) — the spec.
- [docs/modules/inventory.md](../../modules/inventory.md) — the inventory module's contracts that physical-inventory consumes (read-only for P1.a).
- [apps/api/src/services/ricsInventoryAdapter.ts](../../../apps/api/src/services/ricsInventoryAdapter.ts) — the snapshot read path.
- [apps/api/src/services/inventoryService.ts](../../../apps/api/src/services/inventoryService.ts) — service patterns + DB transaction style.
- [apps/api/src/db/database.ts](../../../apps/api/src/db/database.ts) — `getDb()`.
- [legacy/sqlite-migrations/019_inventory_movement_ledger_normalization.up.sql](../../../legacy/sqlite-migrations/019_inventory_movement_ledger_normalization.up.sql) — migration style + constraint patterns.
- [apps/api/src/app.ts](../../../apps/api/src/app.ts) — router mount pattern.

## Verification at end of Wave 1

End-to-end smoke: `curl` through the lifecycle —

```bash
# Create
curl -X POST localhost:4000/api/v1/count-sessions \
  -H 'content-type: application/json' \
  -d '{"storeId":1,"openedBy":"test","scope":{"all":true}}'
# Open
curl -X POST localhost:4000/api/v1/count-sessions/<id>/open
# Freeze (reads RICS — needs a Windows host with the RICS MDBs available)
curl -X POST localhost:4000/api/v1/count-sessions/<id>/freeze
# Entry
curl -X POST localhost:4000/api/v1/count-sessions/<id>/entries \
  -H 'content-type: application/json' \
  -d '{"skuId":"<id>","columnLabel":"7","rowLabel":"M","quantity":5}'
# Get back
curl localhost:4000/api/v1/count-sessions/<id>
```

Plus `pnpm --filter @benlow-rics/api test -- physicalInventory` passes.

## Out of scope for Wave 1 explicitly

- Variance computation, banding, ack workflow.
- Items-not-counted + variance reports.
- Worksheet generation (PDF or CSV).
- Web admin UI.
- Mobile client.
- WebSocket fanout.
- CSV import.
- Conflict detection.
- Independent Verification mode.
- Notifications.
- Retention.
- Permissions enforcement (Wave 2 — for now `openedBy` is a string field, not a validated user).
- Per-store advisory lock (P1.a defers entirely).
- The `apps/web` admin pages (Wave 2).

These all land in subsequent waves. This wave is pure foundation: schema, types, service core, routes, smoke tests.
