# Module: inventory

**Goal**

`inventory` is the ledger of physical stock — where every unit is, how it got there, and where it should be. It owns on-hand and on-order by (SKU × Store × Column × Row), the immutable movement history that explains every change, the replenishment targets (Model / Max / Reorder quantities) that drive automatic ordering and transfers, and the family of manual + automatic + balancing inter-store transfers. It exposes the inquiry surfaces (Inventory Inquiry, Find Inventory by Size, Inventory Change Detail) and the stock-movement reports (Recommended Transfer, Transfer Summary, Inventory Detail). Primary user value: anyone in the company — buyer, store manager, salesperson on the POS — can answer "where is this SKU, how many, and how did we get to this number?" from one place, and a multi-store operator can keep the right sizes in the right stores without moving boxes by guesswork.

Scope note: Chapter 4 of the RICS manual (Stock Maintenance) is split across two modules. `products` owns the SKU-pricing-and-identity half — Enter Price Changes (p. 67), Change Average Cost (p. 67), Discontinue SKUs (p. 69), Enter Price Discounts (p. 73). This module owns the stock-quantity half — everything else in Ch. 4 plus Inventory Change Detail (Ch. 2 p. 55). Where the two modules touch (e.g., Discontinue triggers an on-hand rollup, Change Average Cost re-reads avg cost owned by `products`), the contract is named here and in `products`.

## RICS features covered

**Manual on-hand adjustments** (Ch. 4)
- **p. 66, Enter Manual Orders** — add on-order quantities against (Store × SKU × Column × Row) without going through a Purchase Order. Updates the same on-order cells a PO would, but with no order/due dates. Manual flags this as "you probably will not use this option very often".
- **p. 66, Enter Manual Receipts** — add on-hand quantities to (Store × SKU × Column × Row) outside a PO. Displays SKU description, Category, Vendor, Vendor SKU, Style/Color; allows override of Retail Price and Cost at receive time. Supports case-pack auto-fill with `X__` multiplier, UPC-scan mode, "Storing Labels" toggle (`Alt+L`), and sequential per-SKU save (blanks after each save). Doubles as the initial-stock entry flow; updates the `date last received`.
- **p. 66, Enter Manual Returns** — decrease on-hand quantities (defective returns to vendor, shrink-outs). Same entry shape as Manual Receipts: per-size grid, case-pack X__, UPC scan, per-SKU save. Also exposes `[On Hand]` (`Alt+O`) — show current on-hand for the SKU so the clerk can sanity-check against a physical count before submitting the return. Prints a transaction journal.

**Replenishment targets** (Ch. 4)
- **p. 68, Enter Model Quantities** — per (SKU × Store × Column × Row): Model (desired on-hand), optional Max (shortfall computed against max when on-hand dips below model), optional Reorder (order-multiple rounding for Automatic POs, e.g., "always order in groups of 6"). Store `0` means all stores; an explicit store list with ranges (`2,5-8,11,14`) can propagate a model to many stores in one save. Case-pack auto-fill (`X__`). `[Model]` / `[Max]` / `[Reorder]` buttons switch which of the three values the grid is editing; `[Copy]` (`Alt+O`) copies one quantity type into another. Models are optional and typically set only for faster-moving / basic-stock items.

**Inquiry surfaces** (Ch. 4 + Ch. 2)
- **p. 70, Inventory Inquiry** — the single-SKU, all-context view. **The page itself is owned by `products`**; see [docs/modules/products.md § Product Inquiry (the RICS "Inventory Inquiry" screen)](products.md). `inventory` owns only the stock-side data contracts the page consumes — `getOnHandGrid`, `getOnHandAllStores`, `getReplenishmentGrid`, `getLastReceivedAt`, `getMovementsForSku` (see § Contracts exposed). Keep this section short; the page spec lives with `products`.
- **p. 53 (Ch. 2) & p. 70 (Ch. 4), Inventory Inquiry (same screen, two menu entries)** — the sales-clerk register workflow and the admin workflow drop into the same page. Same `products-dev`-owned page, just reached from `sales-pos` with the register's store pre-filled.
- **p. 55 (Ch. 2) & p. 70 (Ch. 4), Inventory Change Detail** — per-SKU chronological log of every change: Manual Receipts, Returns, PO Receipts, Transfers In, Transfers Out, Physical Inventory Adjustments. Columns: Store #, Date, Type, Quantity, Cost, Comments (bill-to/ship-from store, PO#, RMA#). Size-detail toggle; Show All Stores toggle. Most recent first. Served by `inventory.getMovementsForSku(...)`; surfaced inside the Product Inquiry page as the `[Detail]` drawer (owned by `products-dev`) and also reachable as its own route for deep-linking.
- **p. 72, Find Inventory by Size** — given a size (Size Type + Column + Row), list every SKU with on-hand in that size. Optional seed SKU pre-fills Size Type / Category / Vendor / Style-Color. Restrict-Search-to-Size-Type toggle: when off, searches by raw label across all size types (e.g., "anyone's size 080 Row M"). Optional Category / Vendor / Style-Color / Store filters. Sort: SKU / Description / Vendor / Category; separate-by-store toggle. Primary use case: a customer wants an out-of-stock SKU in their size — the clerk hunts for a similar in-stock item.

**Transfers** (Ch. 4)
- **p. 75, Transfer All Inventory** — one-shot bulk transfer of every on-hand cell (positive and negative) from one store into another. Intended for the "Internet store" pattern: POS posts sales against the internet pseudo-store, driving its on-hand negative; this job sweeps a brick-and-mortar or warehouse donor into the internet store, zeroing it out. Prints a journal.
- **p. 76, Enter Manual Transfers** — per-(From Store × To Store × SKU) grid entry: per-size quantities, optional UPC scan, `[Transfer All]` (`Alt+A`) pre-fills the grid with the "from" store's full on-hand for that SKU, `[Show On-Hand]` (`Alt+O`) opens the donor's on-hand for reference, `[Change Store]` (`Alt+G`) clears and restarts. On save, both stores' on-hand are updated immediately — RICS does not track in-transit. Prints a journal; contributes to the Transfer Summary Report. Optional post-entry transfer pick list on 8.5×11 paper, sorted and grouped by store, so a chain can fax each store its own ship list.
- **p. 76, Generate Automatic Transfers** — warehouse-to-store replenishment from Model Quantities. Selects SKUs where a store's on-hand < model and the warehouse has enough to fill the gap; rounds by Reorder quantity if set. Inputs: warehouse Store #, target Stores, optional criteria (Vendors / Categories / Seasons / Groups / Keywords / SKUs). Output: per-store transfer, posted immediately (or as In-Transit POs — see below). Sort by SKU / Vendor / Category / Location. Lower store numbers process before higher (sequential, deterministic). Always prints a journal to the spool file. Manual advises running Stock Status (excluding warehouse, short-only) first to spot what the warehouse cannot fill.
- **p. 76, Generate Automatic Transfers (In-Transit PO mode)** — alternative execution: create In-Transit POs instead of direct transfers. Reduces warehouse on-hand immediately; target stores must *receive* the PO to complete the transfer. Reversal requires cancelling the In-Transit PO and Manual-Receipting the warehouse donor back.
- **p. 77, Generate Balancing Transfers** — rebalance across stores by performance. Three Balancing Methods:
  1. Transfer SKUs Over/Under Models — only SKUs with a model participate; inventory flows from stores over-model to stores under-model.
  2. Transfer SKUs Without Models — only SKUs *without* a model participate; transfers single units from "better" stores with ≥ 2 on-hand to stores with 0.
  3. Transfer SKUs Without Considering Models (default) — like 2 but ignores whether a model is set.
  Performance axis: ROI / Turns / Sell-Thru, scored over a sales period (Month / Season / Year). Tie-breaker for "higher priority store": either `X more than another` (absolute) or `X % higher than another` (relative). Flags: `Transfer doubles to lower priority stores` (if a high-priority store has ≥ 2 and a low-priority store has 0, move one down), `Transfer all inventory out of stores that have less than N sizes on-hand` (kill-skeleton-stock). Preview mode: "Print a journal of what would be transferred without making the transfer". Commit mode: "Make the transfers and print the journal". Option to materialize as In-Transit POs (with columnar PO print toggle). Criteria: Stores / Categories / Vendors / Seasons / Style-Colors / SKUs / Groups / Keywords, plus original-retail-only / markdown-only / perks-only filters. Submitted via Job List (Add & Run or Add & Continue).
  Exception: a size with negative on-hand is skipped and logged, not transferred into.
- **p. 79, Recommended Transfer Report** — advisory report, does not make transfers. Print Based On: Uneven-on-hand doubles (stores with ≥ 2 and stores with 0), High-Turnover-Variance threshold (e.g., 500% meaning a SKU selling 5× faster at store A than store B), or Over/Under Models (with optional "include SKUs with no model at all"). Sort by Category / Vendor / SKU; Sales Period Month / Season / Year; Print Size Grid toggle; criteria (Stores / Categories / Vendors / Seasons / Style-Color / SKUs / Groups / Keywords).
- **p. 80, Transfer Summary Report** — monthly rollup: per store × per other store, quantity and cost of transfers in and out. Show-Detail toggle. Manual pushes users to the Sales Analysis Report (`sales-reporting`) with SKU Detail + Beginning Balances for line-level detail.
- **p. 80, Inventory Detail Report** — the canonical "how did this SKU reach its current on-hand" report. Date range filter, Combine-Stores toggle. Sort: SKU / Category+SKU / Vendor+SKU. Five Report Types: Size Detail (line per date/type/size), SKU Detail (line per date/type), SKU Summary (type totals per SKU), Category/Vendor Summary (type totals per category+vendor), Store Summary (type totals per store). Detail Types to Include (any subset): Manual Receipts / PO Receipts / Returns / Transfers In / Transfers Out / Physical Inventory Adjustment. Include-Costs toggle. Criteria: Stores / Categories / Vendors / SKUs / Seasons / Groups / Keywords.

## Modernization decisions

- **On-hand is a read over the movement ledger, not a stored counter.** RICS keeps `RIINVQUA.Inventory Quantities` as wide-column `OnHand_01..18` cells per (SKU × Store × Row × Segment) and rewrites them on every change. Zack's Retail keeps a `StockMovement` append-only ledger as the source of truth (matches the existing `MovementTimeline` surface — see `apps/api/src/models/inventory.ts:157`) and materializes a fast `StockLevel` projection keyed `(skuId, storeId, columnLabel, rowLabel)` for reads. The projection is a cache; the ledger is the record. Reconstruction is always possible from the ledger (`RECONCILIATION_SORT_ALLOWLIST` already hints at this). **No wide-column `_01..18` segment rows** — we flatten to one row per (SKU × Store × column × row).
- **Movement types are a controlled vocabulary, not free text.** RICS's Inventory Change Detail enumerates six types on p. 80 (Manual Receipt, PO Receipt, Return, Transfer In, Transfer Out, Physical Adjustment). Zack's Retail extends to eight: add `SALE` and `SALE_RETURN` to cover the POS path (RICS accounts for sales separately via Post-Sales-to-Inventory — p. 45 — but they are inventory-changing events and belong in the same ledger). The existing `MovementType` enum covers five (`sale | po_receipt | transfer_in | transfer_out | adjustment`); this spec adds three: `MANUAL_RECEIPT`, `MANUAL_RETURN`, `MANUAL_ORDER` (on-order side), and splits `adjustment` into `PHYSICAL_ADJUSTMENT` (from `physical-inventory`) and `CORRECTION` (operator-initiated without a physical count).
- **No wide-column segment tables anywhere.** RICS's 18-cell segmenting (`Model_01..18`, `OnHand_01..18`, `FutureOnOrder_01..18`, etc.) exists because Access was the underlying DB. Postgres doesn't need it. The Postgres model below uses one row per cell.
- **On-order is projected from `purchasing`, not stored here.** The existing `purchasing` contract already states this ("on-order is a derived projection from live PO lines, not a stored counter" — `docs/modules/purchasing.md` Modernization Decisions). `inventory` exposes `getOnOrder(skuId, storeId, column, row, classification)` as a read-through to `purchasing.getOnOrder(...)` with a small cache, so the Inventory Inquiry screen renders on-order without `inventory` duplicating the data.
- **Manual Orders becomes a thin wrapper over `purchasing`.** p. 66 Enter Manual Orders is the "I don't want to fill out a PO header" path; its only real effect is to increment on-order cells. In Zack's Retail it creates a tiny DRAFT-then-immediately-SUBMITTED PO with a generated header (vendor from SKU, today's date, no ship/cancel/payment dates) flagged `origin = MANUAL_QUICK_ORDER`. The UI in this module ("Quick Order Entry") delegates to `purchasing.createPurchaseOrder`. Rationale: one on-order source of truth, one receive flow. The RICS distinction between "manual order" and "PO" is a legacy optimization that doesn't survive a web UI where PO header entry is one screen and four fields.
- **Transfers get their own module surface, not a PO hack.** RICS reuses POs for in-transit transfers (p. 76 "Make In-Transit PO's"). Zack's Retail models `Transfer` as a first-class document with its own lifecycle (`DRAFT → IN_TRANSIT → RECEIVED → CANCELLED` — already scaffolded in `apps/api/src/routes/transferOrderRoutes.ts`). The In-Transit-PO trick is dropped. Manual Transfers (p. 76) create a `Transfer` that transitions directly to `RECEIVED` on save (instant). Auto / Balancing Transfers create `Transfer` documents in `IN_TRANSIT` status by default; a config flag `inventory.transfersInstantComplete` restores the RICS "update both stores immediately, no in-transit tracking" behavior for single-building operators.
- **Automatic + Balancing Transfers run as `platform` background jobs with a mandatory preview step.** RICS runs them synchronously via Job List (p. 78 "Add Job and Run"). Zack's Retail queues an `AutoTransferRun` or `BalancingTransferRun` record (`QUEUED → PREVIEWED → COMMITTED | CANCELLED`), computes the preview in a worker, shows the projected transfers with $ totals and per-SKU detail, and only materializes `Transfer` documents on an explicit Commit. Matches the `AutoPoRun` pattern in `purchasing`.
- **"Transfer All Inventory" is just Auto Transfers with criteria = "all"** — collapsed into the same screen with a preset. No separate menu item.
- **Model / Max / Reorder stay here; `products` never reads or writes them.** Replenishment targets are a stock-location concern, not a SKU-identity concern. `purchasing` reads them via `inventory.getReplenishmentTarget(skuId, storeId, column, row)` (already declared in `purchasing.md`).
- **Inventory Change Detail is a view, not a stored blob.** RICS emits a "Saved Inventory Changes" file that must be periodically purged (Ch. 8 p. 116 — moved to `platform` retention). Zack's Retail: the ledger *is* the change log; the Inventory Change Detail view is a filtered query. Retention is a background trim on `StockMovement` rows older than the configured window (`platform` purges). The fiscal concept "saved inventory changes to purge" disappears.
- **Inventory Detail Report is a single endpoint with a `reportType` parameter** covering all five RICS variants (Size Detail / SKU Detail / SKU Summary / Category-Vendor Summary / Store Summary). Detail Types to Include becomes a `movementTypes[]` multi-select.
- **Function-key display modes become tabs + view controls, not F-keys.** RICS's F2/F3/F4/F5/F6/F7/F8/F9/F11/F12 display toggles (p. 70) become a view selector with keyboard shortcuts available but not load-bearing. A single Inventory Inquiry page can render any of the 14 RICS modes plus a new "Combined" mode showing on-hand + on-order + model + short in one grid.
- **Size grid renders from `sku.sizeTypeId`** — same contract as `purchasing.md`. The inventory cells exist only for columns/rows that the SKU's Size Type defines. A SKU with `sizeTypeId = null` (quantity-only) has a single cell with `columnLabel = ''`, `rowLabel = ''`.
- **"Date Last Received" is denormalized on `StockLevel`** for the Inventory Inquiry header, updated on receipt. It's derivable from the ledger but reading it every inquiry is wasteful.
- **`storesInStockWorkflow`: RICS's "process in store order" / "lower numbered stores first" (pp. 70, 76) become an optional sort parameter.** Not a mode switch — just `?orderBy=storeId`. The deterministic-processing semantic for Auto Transfers (p. 76) is preserved: the job always processes stores in ascending ID order to give repeatable results, regardless of how the UI shows them.
- **Job-list Add-Run / Add-Continue vanishes.** p. 78 advertises two submit buttons: "Add Job and Run" vs. "Add Job and Continue". This is legacy Ch. 14 Job-List plumbing. Zack's Retail: one Commit button; the job runs in the background; the user is notified when done. Matches the web-first pattern in `platform`.
- **In-Transit negative-on-hand guard.** p. 78 note: Balancing Transfers skip sizes with negative on-hand (exception report). Zack's Retail enforces this at the transfer validator — a line with source on-hand < quantity requested is rejected with a per-size breakdown, not silently skipped — and surfaces the would-have-skipped list in the preview step so the operator can fix Physical Inventory first.
- **Cost basis on Manual Receipt respects the `products` contract.** RICS lets the user change Cost on the Manual Receipt screen (p. 66). This stays, but on save `inventory` calls `products.updateAverageCost(skuId, storeId, newAvg)` with the weighted average recomputed from the ledger — it does not blindly overwrite. Current-cost edits still flow through `products`' Change Average Cost screen.

## Data model sketch

```prisma
model StockLevel {                        // materialized projection, keyed per cell
  id               String   @id @default(uuid())
  skuId            String
  storeId          Int
  columnLabel      String   @default("")  // "" for quantity-only SKUs
  rowLabel         String   @default("")
  onHand           Int                    // sum of StockMovement.quantityDelta
  reserved         Int      @default(0)   // holds (open tickets, layaways)
  lastReceivedAt   DateTime?              // p. 70 "Last Received" header
  lastMovementAt   DateTime?
  version          Int      @default(1)   // optimistic lock
  updatedAt        DateTime @updatedAt

  @@unique([skuId, storeId, columnLabel, rowLabel])
  @@index([storeId, skuId])
  @@index([storeId, onHand])                // for "find low on-hand"
}

model StockMovement {                     // append-only ledger — source of truth
  id                  String   @id @default(uuid())
  skuId               String
  storeId             Int
  columnLabel         String   @default("")
  rowLabel            String   @default("")
  movementType        MovementType
  quantityDelta       Int                 // + for inflows, - for outflows
  unitCostSnapshot    Decimal?
  // Traceability — which upstream document caused this ledger entry
  sourceDocumentType  SourceDocumentType  // MANUAL_RECEIPT | MANUAL_RETURN | MANUAL_ORDER | PO_RECEIPT | TRANSFER | PHYSICAL_COUNT | SALE | SALE_RETURN | CORRECTION | DISCONTINUE_ROLLUP
  sourceDocumentId    String
  reasonCode          String?
  comment             String?              // p. 55 "comments" column: bill-to/ship-from, PO#, RMA#
  performedBy         String
  movementAt          DateTime             // business timestamp (backdating allowed for reconciliation)
  createdAt           DateTime @default(now())
  idempotencyKey      String?  @unique

  @@index([skuId, storeId, movementAt])    // Inventory Change Detail view (p. 55, p. 70 Detail button)
  @@index([movementType, movementAt])      // Inventory Detail Report filters
  @@index([storeId, movementAt])
}

model ReplenishmentTarget {                // p. 68 Model / Max / Reorder, per cell
  id             String  @id @default(uuid())
  skuId          String
  storeId        Int
  columnLabel    String  @default("")
  rowLabel       String  @default("")
  modelQty       Int?                      // desired on-hand
  maxQty         Int?                      // shortfall computed against max
  reorderQty     Int?                      // rounding multiple for Auto POs
  updatedBy      String
  updatedAt      DateTime @updatedAt

  @@unique([skuId, storeId, columnLabel, rowLabel])
  @@index([storeId, skuId])
}

// --- Manual entries (pp. 66) — thin wrappers that generate movements ---

model ManualReceipt {                      // p. 66 Enter Manual Receipts
  id                String   @id @default(uuid())
  storeId           Int
  performedBy       String
  referenceNumber   String?                // free-form (packing slip, invoice)
  storeLabelsOnReceive Boolean @default(false)
  createdAt         DateTime @default(now())
  lines             ManualReceiptLine[]
}
model ManualReceiptLine {
  id                String  @id @default(uuid())
  manualReceiptId   String
  skuId             String
  columnLabel       String  @default("")
  rowLabel          String  @default("")
  quantity          Int
  unitCost          Decimal                // p. 66 "you may also change Cost"
  retailPrice       Decimal                // p. 66 "you may also change Retail Price"
  movementId        String  @unique        // FK back to the StockMovement this line produced
}

model ManualReturn {                       // p. 66 Enter Manual Returns
  id                String   @id @default(uuid())
  storeId           Int
  performedBy       String
  returnReasonCode  String?                // nullable (p. 66 doesn't require)
  rmaNumber         String?                // free-form
  createdAt         DateTime @default(now())
  lines             ManualReturnLine[]
}
model ManualReturnLine {
  id                String  @id @default(uuid())
  manualReturnId    String
  skuId             String
  columnLabel       String  @default("")
  rowLabel          String  @default("")
  quantity          Int                     // stored positive; ledger records negative delta
  unitCost          Decimal
  movementId        String  @unique
}

// --- Transfers (pp. 75–76) ---

model Transfer {                            // first-class; replaces RICS In-Transit PO hack
  id                String   @id @default(uuid())
  transferNumber    String   @unique
  fromStoreId       Int
  toStoreId         Int
  status            TransferStatus          // DRAFT | IN_TRANSIT | RECEIVED | CANCELLED (matches existing routes)
  origin            TransferOrigin          // MANUAL | TRANSFER_ALL | AUTO | BALANCING
  originRunId       String?                 // FK to AutoTransferRun | BalancingTransferRun when applicable
  reason            String?
  createdBy         String
  shippedAt         DateTime?
  receivedAt        DateTime?
  cancelledAt       DateTime?
  createdAt         DateTime @default(now())
  lines             TransferLine[]

  @@index([fromStoreId, status])
  @@index([toStoreId, status])
}
model TransferLine {
  id                String  @id @default(uuid())
  transferId        String
  skuId             String
  columnLabel       String  @default("")
  rowLabel          String  @default("")
  quantity          Int
  unitCostSnapshot  Decimal                 // avg cost at transfer time; feeds Transfer Summary $ (p. 80)
  outboundMovementId String?                // FK to StockMovement for the TRANSFER_OUT event
  inboundMovementId  String?                // FK to StockMovement for the TRANSFER_IN event (null until received)
}

// --- Auto / Balancing runs (p. 76, p. 77) — preview-then-commit ---

model AutoTransferRun {                     // p. 76 Generate Automatic Transfers
  id              String   @id @default(uuid())
  status          RunStatus                 // QUEUED | PREVIEWED | COMMITTED | CANCELLED
  warehouseStoreId Int
  targetStoreIds  Int[]
  sortOrder       TransferSort              // SKU | VENDOR | CATEGORY | LOCATION
  criteriaJson    Json                      // { vendors?, categories?, seasons?, groups?, keywords?, skus? }
  inTransitPos    Boolean  @default(false)  // p. 76 In-Transit PO mode
  requestedBy     String
  createdAt       DateTime @default(now())
  previewedAt     DateTime?
  committedAt     DateTime?
  generatedTransferIds String[]
}

model BalancingTransferRun {                // p. 77 Generate Balancing Transfers
  id              String   @id @default(uuid())
  status          RunStatus
  balancingMethod BalancingMethod           // OVER_UNDER_MODELS | WITHOUT_MODELS | WITHOUT_CONSIDERING_MODELS
  performanceMetric PerformanceMetric        // ROI | TURNS | SELL_THRU
  salesPeriod     SalesPeriod                // MONTH | SEASON | YEAR
  tieBreakKind    TieBreakKind               // ABSOLUTE | PERCENT
  tieBreakValue   Decimal
  transferDoublesToLowerPriority Boolean @default(false)
  stripStoresBelowSizeCount Int?             // "Transfer all inventory out of stores with < N sizes"
  includeOriginalRetailOnly Boolean @default(false)
  includeMarkdownOnly       Boolean @default(false)
  includePerksOnly          Boolean @default(false)
  criteriaJson    Json
  inTransitPos    Boolean  @default(false)
  requestedBy     String
  createdAt       DateTime @default(now())
  previewedAt     DateTime?
  committedAt     DateTime?
  generatedTransferIds String[]
  exceptionsJson  Json?                      // per-SKU-size "skipped, negative on-hand" list
}

// --- Config (held in store-ops.CompanyInventorySettings) ---
// transfersInstantComplete  Boolean  // true = Manual Transfers update both stores immediately (RICS default)
// changeDetailRetentionDays Int      // replaces Ch. 8 "Clear Saved Inventory Changes"

enum MovementType {
  MANUAL_RECEIPT
  MANUAL_RETURN
  MANUAL_ORDER          // on-order side, not on-hand (p. 66)
  PO_RECEIPT
  TRANSFER_IN
  TRANSFER_OUT
  PHYSICAL_ADJUSTMENT   // from physical-inventory module
  CORRECTION            // operator fix without a physical count
  SALE                  // posted from sales-pos
  SALE_RETURN
  DISCONTINUE_ROLLUP    // receives the on-hand rollup when SkuDiscontinuedEvent fires
}
enum SourceDocumentType {
  MANUAL_RECEIPT  MANUAL_RETURN  MANUAL_ORDER
  PO_RECEIPT      TRANSFER       PHYSICAL_COUNT
  SALE            SALE_RETURN    CORRECTION      DISCONTINUE_ROLLUP
}
enum TransferStatus      { DRAFT  IN_TRANSIT  RECEIVED  CANCELLED }
enum TransferOrigin      { MANUAL  TRANSFER_ALL  AUTO  BALANCING }
enum TransferSort        { SKU  VENDOR  CATEGORY  LOCATION }
enum RunStatus           { QUEUED  PREVIEWED  COMMITTED  CANCELLED }
enum BalancingMethod     { OVER_UNDER_MODELS  WITHOUT_MODELS  WITHOUT_CONSIDERING_MODELS }
enum PerformanceMetric   { ROI  TURNS  SELL_THRU }
enum SalesPeriod         { MONTH  SEASON  YEAR }
enum TieBreakKind        { ABSOLUTE  PERCENT }
```

## API surface

**Stock levels + inquiry**
- `GET /api/v1/inventory` — cursor-paginated list with the existing `InventoryListParams` surface (see `apps/api/src/models/inventory.ts:121`); extended to accept `storeId`, `columnLabel`, `rowLabel` filters.
- `GET /api/v1/inventory/by-sku/:skuId` — full Inventory Inquiry payload: `{ header, pricing, sales: { week, month, season, year }, grids: { onHand, onOrderCurrent, onOrderFuture, model, short, mtdSales, stdSales, ytdSales, max, reorder } }` for one (SKU × Store). `?mode=allStoresOneRow | allStoresSummary` swaps the payload shape for RICS's Shift+F1 / Shift+F2 variants.
- `GET /api/v1/inventory/by-sku/:skuId/additional-info` — p. 71 `[Info]`: Season / Label Code / Group Code / Date 1st Received / Date Last Markdown / Perks / Comments + last-12-months qty + $ + MTD/STD/YTD GP% / ROI / Turns.
- `GET /api/v1/inventory/by-sku/:skuId/outstanding-pos` — p. 70 `[POs]` passthrough to `purchasing.getOpenPoLines(skuId)`.
- `GET /api/v1/inventory/by-sku/:skuId/trend` — p. 70 `[Trend]` passthrough to `sales-reporting.getEightWeekTrend(skuId)`.
- `GET /api/v1/inventory/find-by-size` — p. 72. Query params: `sizeTypeId`, `columnLabel`, `rowLabel`, `restrictToSizeType=true|false`, optional `categoryId[]`, `vendorId[]`, `styleColor[]`, `storeId[]`, `seedSkuId`, `sort=sku|description|vendor|category`, `separateByStore=true|false`.

**Movement ledger / change detail**
- `GET /api/v1/inventory/movements` — general movement timeline; existing `MovementTimelineParams` (`apps/api/src/models/inventory.ts:171`).
- `GET /api/v1/inventory/by-sku/:skuId/change-detail` — p. 55 / p. 70 `[Detail]` view. Query: `storeId?`, `showAllStores=true|false`, `includeSizeDetail=true|false`.
- `GET /api/v1/inventory/reconciliation` — existing surface; source-of-truth integrity check.

**Manual on-hand adjustments**
- `POST /api/v1/manual-receipts` — p. 66. Body: `{ storeId, lines[], referenceNumber?, storeLabelsOnReceive?, performedBy? }`. Idempotent with `Idempotency-Key` header.
- `POST /api/v1/manual-returns` — p. 66.
- `POST /api/v1/manual-orders` — p. 66. Delegates to `purchasing.createPurchaseOrder` with `origin = MANUAL_QUICK_ORDER`.

**Replenishment targets**
- `GET /api/v1/replenishment-targets` — filter by `storeId`, `skuId`, `categoryId`, `vendorId`, has-model flag, has-max flag, has-reorder flag.
- `GET /api/v1/replenishment-targets/:skuId/:storeId` — full grid for one (SKU × Store).
- `PUT /api/v1/replenishment-targets/:skuId/:storeId` — upsert per-cell `{ model?, max?, reorder? }` grid. `?additionalStoreIds=2,5-8,11,14` fans out to multiple stores (p. 68).
- `POST /api/v1/replenishment-targets/:skuId/:storeId/copy` — body: `{ from: "MODEL" | "MAX" | "REORDER", to: "MODEL" | "MAX" | "REORDER" }` — p. 68 `[Copy]`.

**Transfers**
- `GET /api/v1/transfers` — existing; filter by `status`, `fromStoreId`, `toStoreId`, `origin`, date range.
- `POST /api/v1/transfers` — create a Manual Transfer (p. 76). Body: `{ fromStoreId, toStoreId, lines[], reason?, instantComplete? }`. `instantComplete=true` auto-transitions to RECEIVED.
- `GET /api/v1/transfers/:id` — detail.
- `POST /api/v1/transfers/:id/ship` — DRAFT → IN_TRANSIT (when not instant-complete).
- `POST /api/v1/transfers/:id/receive` — IN_TRANSIT → RECEIVED; body optional per-line `quantityReceived` for partial receipt.
- `POST /api/v1/transfers/:id/cancel` — → CANCELLED.
- `GET /api/v1/transfers/:id/pick-list?groupByStore=true` — p. 76 printable pick list, returns PDF.

**Auto / Balancing / Transfer-All runs**
- `POST /api/v1/auto-transfer-runs` — queue; body carries warehouse + targets + criteria + `inTransitPos` flag. A `criteria = { all: true }` run implements Transfer All Inventory (p. 75).
- `GET /api/v1/auto-transfer-runs/:id/preview`
- `POST /api/v1/auto-transfer-runs/:id/commit`
- `DELETE /api/v1/auto-transfer-runs/:id` — cancel before commit.
- Symmetric set for `/api/v1/balancing-transfer-runs`.

**Reports**
- `GET /api/v1/reports/recommended-transfer` — p. 79. Query: `printBasedOn=UNEVEN_DOUBLES|TURNOVER_VARIANCE|OVER_UNDER_MODELS`, `turnoverThresholdPct?`, `salesPeriod`, `sort`, `printSizeGrid`, criteria.
- `GET /api/v1/reports/transfer-summary` — p. 80. Query: `month`, `showDetail`.
- `GET /api/v1/reports/inventory-detail` — p. 80. Query: `dateFrom`, `dateTo`, `combineStores`, `sort=SKU|CATEGORY_SKU|VENDOR_SKU`, `reportType=SIZE_DETAIL|SKU_DETAIL|SKU_SUMMARY|CATEGORY_VENDOR_SUMMARY|STORE_SUMMARY`, `movementTypes[]`, `includeCosts`, criteria.
- All three support `?format=csv`.

## UI surface

- **Inventory list** (`/inventory`) — cursor list with filters (store, department, brand, category, low-stock, q-search). Existing page; this spec adds the per-cell drill-in when a row is clicked.
- **Inventory Inquiry** — **page owned by `products` at `/products/inquiry/:skuCode`; see [products.md § Product Inquiry](products.md).** `inventory`'s responsibility is the stock-side data contracts only.
- **Inventory Change Detail** — the `[Detail]` drawer inside Product Inquiry is owned by `products-dev`. A standalone route at `/inventory/change-detail` remains for deep-linking and for the retention-admin use case (the page reads the same `inventory.getMovementsForSku` contract).
- **Find Inventory by Size** (`/inventory/find-by-size`) — size selector (Size Type + Column + Row), optional seed SKU, filters, restrict-to-size-type toggle, results table with per-store separation option.
- **Manual Receipt entry** — sequential-SKU entry UX matching `purchasing`'s PO Entry (one active editor, numbered committed list below). Per-SKU: case-pack + X__ multiplier, size grid, cost/retail overrides, UPC scan mode, store-labels toggle.
- **Manual Return entry** — same shape; adds "Show On-Hand" side panel (p. 66 `[On Hand]`).
- **Quick Order Entry (Manual Orders)** — stripped-down PO header + line grid that materializes a `purchasing` PO in `ORIGIN = MANUAL_QUICK_ORDER` state.
- **Replenishment Targets editor** (`/inventory/replenishment/:skuCode/:storeId`) — size grid with tab switcher (Model / Max / Reorder), copy-between-types action, "apply to other stores" input (list + ranges).
- **Transfer list** (`/transfers`) — existing page; filters by status / origin / from / to / date.
- **Manual Transfer entry** — From Store + To Store selector + SKU entry grid; `[Transfer All]` pre-fills donor's on-hand, UPC scan, per-SKU save.
- **Transfer detail** — lines, movement breadcrumb, Ship / Receive / Cancel actions per status.
- **Auto Transfer wizard** — step 1 warehouse + targets + dates; step 2 criteria; step 3 preview grid (per SKU × Store × shortfall with $ subtotals); step 4 commit.
- **Balancing Transfer wizard** — step 1 method + metric + period + tie-break; step 2 criteria + price / perks filters; step 3 preview with exceptions panel (negative-on-hand skips); step 4 commit.
- **Recommended Transfer Report page** — filter form + results grid + CSV export.
- **Transfer Summary Report page** — month picker, show-detail toggle, matrix view (from × to).
- **Inventory Detail Report page** — filter form with five-way `reportType` selector + movement-type multi-select + date range + criteria + CSV export.

## Dependencies

- **products** — `getSku`, `resolveUpc`, `getSizeType(sizeTypeId)` (grid rendering), `getCurrentPrice` (Inquiry pricing header), `updateAverageCost` (called by `inventory` on manual receipts + PO receipts + transfers). Subscribes to `SkuDiscontinuedEvent` to emit `DISCONTINUE_ROLLUP` movements that roll on-hand into the surviving SKU.
- **store-ops** — stores list (all screens), case-packs (Manual Receipt / Return auto-fill + Replenishment grid), Company Inventory Settings (`transfersInstantComplete`, `changeDetailRetentionDays`).
- **purchasing** — `getOnOrder(...)` read-through for Inquiry grids; `getOpenPoLines(skuId)` for `[POs]` button; `createPurchaseOrder` for Manual Orders pass-through; consumes `PurchaseOrderReceivedEvent` → writes `PO_RECEIPT` movements; consumes `PurchaseOrderReceiptReversedEvent` → writes negating movements.
- **physical-inventory** — writes `PHYSICAL_ADJUSTMENT` movements on count-post; reads current StockLevel for worksheet generation.
- **sales-pos** — writes `SALE` / `SALE_RETURN` movements at post-to-inventory; reads StockLevel for "Inventory Inquiry from Sales" (Ch. 2 p. 53).
- **sales-reporting** — consumes the movement ledger for Sales Analysis / Stock Status / Size Type Analysis; calls `getEightWeekTrend` contract. It also needs the cost snapshots on `StockMovement` for GP attribution.
- **platform** — background workers run Auto / Balancing Transfer preview + commit jobs; nightly retention trim of `StockMovement` older than configured window; label-queue side effect on `storeLabelsOnReceive`.
- **employees** — permission checks on Manual Receipt / Return / Transfer submit; `performedBy` audit.
- **customer-transactions** — reserves on-hand for Layaway / Special Order (increments `StockLevel.reserved`); releases on cancel; converts reserved → consumed on Pickup.

## Contracts exposed

**Outbound (for other modules)**
- `getOnHand(skuId, storeId, columnLabel?, rowLabel?)` → `{ onHand, reserved, available, lastReceivedAt }`
- `getOnHandGrid(skuId, storeId)` → `{ cells: [{ col, row, onHand, reserved }] }` — used by POS / storefront
- `getOnHandAllStores(skuId)` → `[{ storeId, onHand, reserved }]`
- `getReplenishmentTarget(skuId, storeId, columnLabel?, rowLabel?)` → `{ modelQty?, maxQty?, reorderQty? }` — called by `purchasing` Auto PO and `purchasing.md` already declares this
- `getReplenishmentGrid(skuId, storeId)` → full cell grid
- `applyManualReceipt(input)`, `applyManualReturn(input)` — idempotent, callable by migration / import tooling
- `applyReceipt(input)`, `applyReceiptReversal(input)` — called by `purchasing` on PO receive / reverse; `purchasing.md` declares this inbound
- `applyPhysicalCount(input)` — called by `physical-inventory`
- `applySaleMovement(input)`, `applySaleReturnMovement(input)` — called by `sales-pos` at post-to-inventory
- `applyDiscontinueRollup({ fromSkuCode, intoSkuId })` — called by the `SkuDiscontinuedEvent` handler
- `reserveOnHand(skuId, storeId, columnLabel?, rowLabel?, quantity, sourceRef)` / `releaseReservation(...)` / `consumeReservation(...)` — for `customer-transactions`
- `getMovementsForSku(skuId, filters)` — powers `[Detail]` and the Inventory Detail Report
- `computeBalancingPreview(criteria)` → transfer projection — shared primitive for Balancing wizard

**Events emitted**
- `StockMovementRecordedEvent { movementId, skuId, storeId, col, row, movementType, quantityDelta, resultingOnHand, movementAt }` — `sales-reporting` consumes for rolling totals; `platform` audit log consumes for compliance.
- `StockLevelLowEvent { skuId, storeId, col, row, onHand, modelQty }` — fired when a movement drops a cell below its model; `platform` notifications consume to nudge buyers.
- `TransferShippedEvent { transferId, fromStoreId, toStoreId, lines[] }` — `sales-reporting` consumes to track in-transit valuation.
- `TransferReceivedEvent { transferId }` — flips in-transit → on-hand in any downstream projection.

**Events consumed**
- `PurchaseOrderReceivedEvent` → write `PO_RECEIPT` movements; call `products.updateAverageCost`.
- `PurchaseOrderReceiptReversedEvent` → write compensating movements.
- `SkuDiscontinuedEvent` → roll on-hand from discontinued into surviving SKU via `DISCONTINUE_ROLLUP`.
- `SaleTicketPostedEvent` → `SALE` movements (per-cell, per-store).
- `SaleTicketRefundedEvent` → `SALE_RETURN` movements.
- `PhysicalCountPostedEvent` → `PHYSICAL_ADJUSTMENT` movements.

## Out of scope for v1

- **Wide-column "Segment" rows.** RICS's 18-cell-per-row segmenting (RIINVQUA.Inventory Quantities `OnHand_01..18 + Segment`) is a storage detail of Access. Migration flattens on read; no Zack's Retail table is shaped like this.
- **Ch. 8 "Clear Saved Inventory Changes" as a user-triggered menu item** (p. 116) — becomes a background retention job in `platform`, configured via a single `changeDetailRetentionDays` setting. No dedicated screen.
- **Scr een-spool / direct-printer toggle on Inventory Inquiry** (p. 70) — browser handles printing.
- **In-Transit PO hack for transfers** (p. 76 "Make In-Transit PO's") — dropped in favor of first-class `Transfer` with IN_TRANSIT status. The Auto / Balancing Transfer wizards still offer an `inTransitPos=true` flag in the API for feature parity during migration, but the UI ships without exposing it until we have a real EDI ASN flow that needs it.
- **Process-in-store-order toggle on Inquiry Prev/Next** (p. 70) — replaced by an `orderBy` query param. No dedicated UI switch.
- **Multi-store model-quantity exceptions ("set for all stores except a warehouse — call CSI")** (p. 68) — RICS defers this to a support-ticket flow. v1 ships the per-store + range input; all-stores-except-N is deferred.
- **Legacy "Print a pick list on 8.5×11 paper, grouped by store, for fax-out"** (p. 76) — served by the `/api/v1/transfers/:id/pick-list` PDF endpoint; no fax integration.
- **Job-List execution shell** ("Add Job and Run" / "Add Job and Continue") — replaced by background worker + notification. No Job-List surface in the UI.
- **Automatic Transfers to stores in non-ID order** (p. 76 "If you want to transfer to stores in a different order, contact CSI") — v1 always processes in ascending storeId order. Custom ordering is a v2 feature at best.
- **RICS's "Internet Store" special pattern** (p. 75 Transfer All — "ideal for internet stores that do not carry inventory") — Zack's Retail's storefront writes to the same DB and does not need a donor-sweep pattern. Transfer All stays as a generic primitive, but the internet-store workflow it was built for is obsolete.
- **Separate Manual Orders menu item distinct from Purchase Orders** — collapsed into Quick Order Entry that delegates to `purchasing`.

## Open questions

1. **Reservation semantics.** RICS does not appear to reserve on-hand for layaways or special orders — it just deducts at pickup (pp. 37, 39). Zack's Retail's `StockLevel.reserved` is a modernization. Confirm whether `customer-transactions` uses reservations (on-hand stays put, `available` drops) or pre-deducts (on-hand drops immediately). Affects the POS "Inventory Inquiry" display and the `getOnHand` return shape.
2. **Per-store average cost vs. company-wide** — carried over from `products.md` OQ #1. The avg-cost update on manual receipt needs to know whether to upsert per-store or per-SKU; resolution lives with `products`.
3. **Manual Order sunset.** Does the business still use Enter Manual Orders (p. 66) in practice? If not, we can cut Quick Order Entry from the UI and keep only the API path for migration. If yes, keep the UI shortcut.
4. **`lastReceivedAt` precision on StockLevel.** p. 70 shows a single "Last Received" date per (SKU × Store) — not per cell. RICS may store it on the SKU-Store row, not the SKU-Store-Column-Row cell. Confirm granularity before migration writes the wrong value.
5. **Reorder-quantity semantics for Auto Transfers vs. Auto POs.** p. 68 says Reorder is a rounding multiple for *Automatic POs*. Does Automatic Transfers (p. 76) also honor it, or does it transfer the exact shortfall? Manual is silent.
6. **Negative on-hand handling.** Several flows create negative on-hand (p. 75 Transfer All's internet-store pattern, over-sells on POS, over-receives reversed late). Zack's Retail currently allows it in the ledger but surfaces a warning. Should negative be a hard error on new sales / transfers, or a warn-and-proceed? Affects POS UX and transfer validation.
7. **Inventory Detail Report — does `SALE` and `SALE_RETURN` belong in the Detail Types to Include list?** RICS p. 80 enumerates six types; our ledger carries eight. Pragmatic default: include the two sale types as opt-in checkboxes; default-on for operator reconciliation and default-off when reproducing the RICS report.
8. **Transfer cost basis at shipment.** RICS updates both stores immediately with no in-transit accounting (p. 76). Zack's Retail's IN_TRANSIT status raises the question: whose balance sheet holds the in-transit units — the From store, the To store, a "transfers in transit" holding store, or the company? Suggested default: From store deducts at Ship; To store does not add until Receive; in-transit units belong to a synthetic "in-transit" position on the ledger. Confirm before wiring `sales-reporting` valuation.
9. **Movement backdating policy.** `StockMovement.movementAt` vs. `createdAt` allows an operator to backdate a correction. Who can backdate, how far, and what compensating effect does it have on already-closed fiscal periods? Ties into `accounts-receivable` fiscal-close module.
10. **Ledger existence in legacy RICS data.** `docs/rics-db-schema.md` does not yet discover `RIINVHIS.MDB` (Inventory History). Either (a) the file exists but is excluded from the scanner, (b) RICS regenerates Inventory Change Detail from a different source, or (c) "Saved Inventory Changes" is an independent file we haven't indexed. Re-run `pnpm rics:discover` targeting RIINVHIS before migration design.
11. **Balancing Transfers stability across runs.** p. 77 tie-break mechanics include absolute and percent modes. Is the algorithm documented anywhere beyond the manual? If not, we need to reverse-engineer from data before shipping the preview — incorrect projections will destroy trust in the wizard.
12. **Row of size grid when displaying F11 Column / Shift+F1 All-Stores-1-Row** (p. 70). These modes require the operator to pick a row first. Does the UI force a row selection, or default to the first row, or show the full grid with the requested stat collapsed per-column? Suggested default: require explicit row pick for 2-D size types; single-row types render directly.
