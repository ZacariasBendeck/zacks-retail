# Design: Inventory Manual Receipt Backend Contract

**Date:** 2026-04-23
**Module:** `inventory`
**Phase:** A
**Purpose:** define the real backend/API contract for the RICS-equivalent "Enter Manual Receipts" workflow so the frontend stops targeting the placeholder generic adjustment endpoint.

## Why this exists

The repo currently has a visible frontend shell for Manual Receipt:

- [apps/web/src/pages/inventory/AdjustmentListPage.tsx](../../../apps/web/src/pages/inventory/AdjustmentListPage.tsx)
- [apps/web/src/pages/inventory/AdjustmentFormPage.tsx](../../../apps/web/src/pages/inventory/AdjustmentFormPage.tsx)

but the backend behind it is only a generic adjustment write path:

- [apps/api/src/routes/adjustmentRoutes.ts](../../../apps/api/src/routes/adjustmentRoutes.ts)
- [apps/api/src/services/adjustmentService.ts](../../../apps/api/src/services/adjustmentService.ts)

That path is not a correct foundation for Manual Receipts because it:

- stores only `type`, locations, reason, and `{ skuId, quantity }` lines,
- has no store-aware size-grid cell model,
- has no retail/cost override fields,
- has no case-pack or UPC semantics,
- has no "store labels on receive" flag,
- has no `date last received` behavior,
- is backed by legacy SQLite tables, which new development must not extend.

Manual Receipt therefore needs a dedicated backend contract, even if the current list tab remains mounted under `/inventory/adjustments`.

## Source requirements

RICS ancestry: Ch. 4 p. 66 "Enter Manual Receipts".

Authoritative module spec section:

- [docs/modules/inventory/rics-module-specs.md](../../modules/inventory/rics-module-specs.md)

The relevant requirements are:

- receive merchandise not on a PO,
- allow first-time inventory entry,
- enter one SKU at a time against one store,
- show SKU description, category, vendor, vendor SKU, style/color,
- allow retail-price and cost override at receive time,
- support case-pack auto-fill with multiplier,
- support UPC-first entry,
- support a storing-labels toggle,
- save one SKU at a time and clear back to SKU while keeping the store,
- update `date last received`.

## Decision

Manual Receipt gets its own backend write surface:

- `POST /api/v1/inventory/manual-receipts`

and its own supporting read surface:

- `GET /api/v1/inventory/manual-receipts/context`
- `GET /api/v1/inventory/manual-receipts/:id`

The existing Manual Receipt tab under `/inventory/adjustments?tab=MANUAL_RECEIPT` may remain as the list shell, but it must stop posting to the generic adjustment route. The tab list can either:

- read from a dedicated manual-receipts list endpoint, or
- be served by a compatibility projection that maps `ManualReceipt` documents into the current adjustment-list row shape.

The **create** path is the important cut line: no new Manual Receipt work should be built on `createAdjustment(RECEIPT)`.

## Phase-A storage rule

Do **not** extend the legacy SQLite adjustment tables in `apps/api/src/db/database.ts`.

Manual Receipt is new development and must land in Postgres `app.*`.

Also do **not** try to force this into the current `app.inventory` / `app.inventory_audit_log` shape without a store dimension. Those tables are useful lineage, but they are not yet a correct representation of the inventory module contract because true inventory is per `(store, sku, column, row)`.

The correct storage target is the store-aware model already sketched in the inventory module spec:

- `app.stock_level`
- `app.stock_movement`
- `app.manual_receipt`
- `app.manual_receipt_line`

## API contract

### 1. Load entry context

Used when the frontend has a store plus either a SKU code or a scanned UPC and needs the full RICS-style entry surface.

```http
GET /api/v1/inventory/manual-receipts/context?storeId=1&skuCode=ABC123
GET /api/v1/inventory/manual-receipts/context?storeId=1&upc=123456789012
```

Rules:

- `storeId` is required.
- exactly one of `skuCode` or `upc` is required.
- if `upc` is provided, the handler resolves it to `(skuCode, columnLabel, rowLabel)` first.
- response must include enough data to paint the receipt screen without extra product lookups.

Response shape:

```ts
interface ManualReceiptContext {
  storeId: number
  storeLabel: string
  skuId: string
  skuCode: string
  description: string
  categoryNumber: number | null
  vendorCode: string | null
  vendorName: string | null
  vendorSku: string | null
  styleColor: string | null
  sizeTypeCode: number | null
  sizeGrid: {
    columns: string[]
    rows: string[]
  }
  defaultUnitCost: string | null
  defaultRetailPrice: string | null
  lastReceivedAt: string | null
  currentOnHandByCell: Array<{
    columnLabel: string
    rowLabel: string
    quantityOnHand: number
  }>
  availableCasePacks: Array<{
    id: string
    code: string
    description: string
    multiplierDefault: number
    cells: Array<{
      columnLabel: string
      rowLabel: string
      quantityPerPack: number
    }>
  }>
  scannedUpcTarget?: {
    columnLabel: string
    rowLabel: string
  }
}
```

Data sources in Phase A:

- store: `rics_mirror.store_master`
- SKU identity/pricing/vendor fields: `app.sku` + `rics_mirror.inventory_master` effective read
- UPC resolution: products contract (`resolveUpc`)
- case packs: `store-ops` contract
- on-hand/last received: `app.stock_level` once the store-aware inventory tables exist

### 2. Create one Manual Receipt

Each save is one SKU receipt for one store. This matches the RICS workflow where the store stays sticky in the UI and the operator saves one SKU at a time.

```http
POST /api/v1/inventory/manual-receipts
Content-Type: application/json
```

Request shape:

```ts
interface CreateManualReceiptRequest {
  storeId: number
  skuId: string
  referenceNumber?: string | null
  storeLabelsOnReceive: boolean
  movementAt?: string | null
  unitCostOverride?: string | null
  retailPriceOverride?: string | null
  casePackId?: string | null
  casePackMultiplier?: number | null
  note?: string | null
  idempotencyKey?: string | null
  lines: Array<{
    columnLabel: string
    rowLabel: string
    quantity: number
  }>
}
```

Validation rules:

- `storeId` must exist.
- `skuId` must exist and be receivable.
- every line quantity must be a positive integer.
- duplicate `(columnLabel,rowLabel)` entries are rejected.
- at least one line must have `quantity > 0`.
- if `casePackId` is provided, it must belong to the SKU's size type.
- `unitCostOverride` and `retailPriceOverride`, when present, must be non-negative decimals.
- `movementAt`, when omitted, defaults to now.

Behavior:

1. Create one `ManualReceipt` header row.
2. Create one `ManualReceiptLine` row per non-zero size cell.
3. For each line, append one positive `StockMovement` row with:
   - `movementType = MANUAL_RECEIPT`
   - `sourceDocumentType = MANUAL_RECEIPT`
   - `sourceDocumentId = <manualReceiptId>`
4. Upsert/update the matching `StockLevel` row by `(storeId, skuId, columnLabel, rowLabel)`.
5. Set `lastReceivedAt = movementAt` on the affected `StockLevel` rows.
6. If `unitCostOverride` is present, call the products-side average-cost update flow rather than mutating catalog cost ad hoc.
7. If `retailPriceOverride` is present, persist the receipt-time snapshot and hand off any catalog-price writeback to the products contract explicitly.
8. If `storeLabelsOnReceive = true`, emit a label-generation request or durable event. Do not silently discard the flag.

### 3. Create response

The frontend should receive the saved receipt document back, not a generic adjustment row.

```ts
interface ManualReceiptRecord {
  id: string
  storeId: number
  storeLabel: string
  skuId: string
  skuCode: string
  description: string
  categoryNumber: number | null
  vendorCode: string | null
  vendorSku: string | null
  styleColor: string | null
  referenceNumber: string | null
  storeLabelsOnReceive: boolean
  unitCostApplied: string | null
  retailPriceApplied: string | null
  totalUnits: number
  createdAt: string
  performedBy: string
  lines: Array<{
    id: string
    columnLabel: string
    rowLabel: string
    quantity: number
    movementId: string
  }>
}
```

Frontend consequence:

- after save, the page should clear the SKU-level entry state,
- keep the current `storeId`,
- and return focus to SKU / UPC entry.

No server-side session document is required for that behavior.

### 4. Detail read

```http
GET /api/v1/inventory/manual-receipts/:id
```

Returns the same `ManualReceiptRecord` shape as above, enriched with any traceability fields the detail page needs.

## Compatibility with the current Adjustments tab

The current tab shell is acceptable as a navigation surface, but its data model should be treated as a projection layer.

Transitional rule:

- the Manual Receipt tab may keep the current columns `Date | Type | SKU(s) | Qty | From | To | Reason | By`
- but receipt rows should come from `ManualReceipt` documents, not generic `inventory_adjustments`

Compatibility projection:

```ts
interface ManualReceiptListRowForAdjustmentsTab {
  id: string
  type: 'RECEIPT'
  createdAt: string
  skuCodes: string[]
  quantity: number
  fromLocationName: null
  toLocationName: string // store name/number
  reason: string | null // referenceNumber or note
  createdBy: string
}
```

This lets the list tab stay stable while the create path and persistence move to the right model.

## What should not be reused

Do not reuse `apps/api/src/services/adjustmentService.ts` for the Manual Receipt create flow.

Reasons:

- wrong storage layer (SQLite)
- wrong document shape
- wrong granularity (SKU-level quantity only, no size cells)
- wrong semantics (locations instead of store receipt context)
- no price/cost/case-pack/UPC/labels handling

The current `RECEIPT` adjustment path can remain temporarily for non-RICS generic inventory corrections if needed, but it is not the Manual Receipt implementation.

## Backend implementation target

Minimum backend slice to unblock the frontend:

1. Add Prisma models + migration for:
   - `app.stock_level`
   - `app.stock_movement`
   - `app.manual_receipt`
   - `app.manual_receipt_line`
2. Add `GET /api/v1/inventory/manual-receipts/context`
3. Add `POST /api/v1/inventory/manual-receipts`
4. Add `GET /api/v1/inventory/manual-receipts/:id`
5. Add a compatibility list adapter for the existing Manual Receipt tab

That is enough for the frontend to stop targeting `createAdjustment(RECEIPT)` and start building the real RICS screen.

## Frontend implications

Once this backend exists, the current receipt form should be replaced rather than stretched.

The target frontend becomes:

- sticky store selector
- SKU / UPC entry
- auto-loaded SKU summary panel
- editable retail/cost
- case-pack picker + multiplier
- per-size grid
- storing-labels toggle
- save-one-SKU-and-clear workflow

The current generic form in [apps/web/src/pages/inventory/AdjustmentFormPage.tsx](../../../apps/web/src/pages/inventory/AdjustmentFormPage.tsx) should not be treated as the final component architecture for Manual Receipt.

## Related

- [docs/modules/inventory/rics-module-specs.md](../../modules/inventory/rics-module-specs.md)
- [apps/web/src/pages/inventory/AdjustmentListPage.tsx](../../../apps/web/src/pages/inventory/AdjustmentListPage.tsx)
- [apps/web/src/pages/inventory/AdjustmentFormPage.tsx](../../../apps/web/src/pages/inventory/AdjustmentFormPage.tsx)
- [apps/api/src/services/adjustmentService.ts](../../../apps/api/src/services/adjustmentService.ts)
