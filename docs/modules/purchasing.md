# Module: purchasing

**Goal**

`purchasing` owns the lifecycle of a purchase order — from draft entry through automated generation, replication, duplication, merging, receiving (manual or via ASN carton scan), and closeout. It also owns the in-module tools that prepare orders (Order Worksheet) and maintain the At-Once vs. Future classification (Reset Future Orders), plus the PO-centric reports (Purchase Orders Reports, Open P.O. by Month). Primary user value: a buyer can plan, place, replicate across stores, and receive a season's worth of vendor orders from one web surface — and at any moment see what's on order by month, store, vendor, or category.

## RICS features covered

**PO entry and edit** (Ch. 3)
- **p. 56, Enter Purchase Orders** — create or edit a PO. Fields: PO Number (any letters/digits, default is "last+1", reserved prefixes `A` = Automatic and `V` = Direct Sale), Bill-to Store, Ship-to Store(s), Vendor, Order Type (RICS default `RO`; `RE` = At-Once and `SA` = Future when EDI is in play), Store-Labels-on-Receive toggle. Header folder: Confirmation #, Account #, Terms, Ship-Via (all defaulted from vendor, all overridable), Backorder flag, Split-shipment flag, Order / Ship / Cancel / Payment dates, Program Code (EDI), Comments. SKU folder: as many SKU lines as needed, case-pack support with multiplier (`X__`), per-line retail + cost (edits can optionally write back to the SKU master per `RICS.CFG`), size-grid quantities. PO is saved with `[Save]` or `[Save & Print PO]`.
- **p. 56, SKU edits after receiving** — when editing a received PO, RICS displays the *original* ordered quantities, not the remainder. Modifying quantities writes the new absolute value, not a delta ("have 5 on order, need 6 on order — enter 6, not +1").
- **p. 57, Duplicate Purchase Orders** — clone an existing PO to a new PO number. Bill-to / Ship-to / all four dates default from the source but are overridable. Storing-Labels toggle. After save, the clone is a normal editable PO.
- **p. 57, Receive Purchase Orders** — partial or full receive against a PO. Per-line overrides: discount % (lowers per-unit cost), freight each (raises per-unit cost), over-receipt correction (enter a negative quantity to offset). If the line is received under-in-full, prompt: *cancel remaining balance* vs. *leave as backorder*. `[Full]` receives the whole PO as-ordered; `[Scan]` is a UPC-first mode; `[End PO]` ends the scan session. SKUs not on the PO cannot be added via receiving (exception: in-transit PO — see Merge). A fully-received PO is NOT deleted — it lingers until month close; a partially-received PO stays open until either fully received or manually deleted.
- **p. 58, Combine Purchase Orders** — move all lines from Combine-PO# into Into-PO# and delete the Combine-PO#. `[Save]` or `[Save & Print PO]`, Storing-Labels toggle.
- **p. 61, Replicate Purchase Orders** — copy one PO to a range of ship-to stores in one action. User provides a 5-char prefix; replicated POs are numbered `<prefix><storeNum zero-padded to 3>` (e.g., `02AUG012`). Dates default from source. If the derived PO# already exists, that store is skipped silently (per manual). `[Save & Print]` prints all created POs.
- **p. 62, Merge In-Transit Purchase Orders** — combine multiple in-transit (received-as-shipment-but-not-yet-checked-in?) POs into one. UI shows two list boxes: available vs. selected, with `Move >>`, `<< Move`, `Select All`, `Unselect All`. Ship and cancel dates of the destination PO can be modified. Destination PO's bill-to and ship-to filter which in-transit POs are eligible. After merge the sources are destroyed — "cannot be reclaimed".

**PO-driven receiving via ASN** (Ch. 3)
- **p. 63, Receive ASN Cartons** — scan a carton barcode; the carton (its item list + quantities) was pre-seeded by the vendor via EDI. Scanning the carton receives every item in it in one action. Optional per-item label generation.
- **p. 64, ASN Carton Maintenance** — admin edit of a pre-seeded ASN carton (new / edit / delete lines). Manual calls this "use with caution" because the carton's contents *are* the receive.

**Automatic ordering from model quantities** (Ch. 3 + Ch. 4 cross-refs)
- **p. 59, Generate Automatic Purchase Orders** — scan every (Store × SKU × Column × Row); for each cell where `on_hand + on_order < model_qty`, append the shortfall to a Store-specific Automatic PO. Preconditions: Model Quantities set up (Ch. 4, p. 68), and sales posted to inventory so on-hand is current. Every auto-PO number starts with `A` and is treated as an At-Once order.
- **p. 68, Model / Max / Reorder Quantities** (cross-ref) — model = desired on-hand; max (optional) = shortfall calculated against max instead of model; reorder (optional) = rounding multiple (e.g., "always order in packs of 6"). This module *reads* these from `inventory` but does not own them.
- **p. 60, Auto PO Options** — user picks: Stores or Vendors (criteria + wildcards), Bill-to-Store (required), Combine-to-Store (optional — acts as warehouse/central DC; total shortfall across all selected stores minus warehouse on-hand becomes one PO to the warehouse), Backorder + Split-Shipment flags, Ship / Cancel / Payment dates, "Automatically Generate Labels" flag.
- **p. 60, Auto PO Criteria** — narrow by Categories, Seasons, SKUs, Groups, Keywords.

**PO prep tools** (Ch. 3)
- **p. 63, Order Worksheet** — per (Store × Category × Size Type × Season), set Total Order Quantity (pairs) and Total Order Retail $, plus a % distribution across the size grid that must sum to 100. User then attaches draft SKU lines (SKU# not required to exist yet), a retail price, and a ship month (1–12). `[Totals]` produces a projection report. Purely an aid before PO entry — does not write to any on-order table.
- **p. 65, Reset Future Orders** — re-classifies every open PO as At-Once or Future based on (today − ship-date) vs. the threshold (`RICS.CFG [Purchase Orders] DyFut`). Normally runs at month close; this option lets a user run it mid-month or after changing the threshold.

**Reports** (Ch. 3)
- **p. 58, Purchase Orders Reports** — open-PO reporting.
  - **Sort by**: Store+PO#, Store+Vendor, or Store+Ship-Date.
  - **POs to Print**: All, At-Once, Future, by Vendor.
  - **Report to Print**: Complete PO (ordered / received / open); PO Totals; Store Totals (by category); PO format – order quantities (prints the original PO — with optional cost + retail-price); PO format – open quantities (prints the remaining to-receive — for back-order review).
  - **Criteria**: Ship-date range, Order-date range, Cancel-date range, Date-Last-Received range — used for "all past-due open orders" or "arriving next month" listings.
  - Report footer: cash-payments projection summed by Payment Date. Category subtotals throughout.
- **p. 59, Open P.O. by Month Report** — 12-month projection of open POs.
  - **Sort by**: Vendor or Category.
  - **Data to Print**: Open Quantity / Open at Cost / Open at Retail.
  - **Date by**: Ship Date / Cancel Date / Payment Date / Ship-Cancel-spread.
  - **Detail to Print**: SKU detail or Category-Vendor subtotals.
  - **POs to Print**: All / At-Once / Future.
  - **Use Vendor from**: SKU File (default) or Purchase Order File — distinguishes the vendor on the PO from the vendor on the SKU master (e.g., Nike bought from a jobber vs. Nike direct).
  - **Combine Stores** toggle, CSV export to `.TXT` or `.CSV`.

## Modernization decisions

- **Single PO surface — no diskette split, no "main vs. POS" file push.** RICS Ch. 13's "Send Purchase Order changes" (p. 161) to remote POS registers disappears: every register is a web client reading live. Purchasing does not expose any "copy to / from POS" surface.
- **PO numbers are UUID primary keys with a separate human-readable `poNumber`.** Keep RICS's convention for display (auto-increment from last, reserved prefixes `A` and `V`, letters allowed), but the DB key is a UUID. This sidesteps RICS's "can't auto-increment if you used letters" caveat (p. 56) and eliminates collisions during Replicate.
- **On-order is a derived projection from live PO lines, not a stored counter.** RICS maintains separate "on-order" cells per SKU-Store-Column-Row. Zack's Retail expresses on-order as a query over `purchase_order_lines` filtered by PO status. `inventory` exposes a cached read of this via the purchasing-contract adapter (already partially in place — see `apps/api/src/contracts/purchasingContract.ts`).
- **Status machine replaces "PO lingering until month close".** RICS keeps a fully-received PO around until month close (p. 57). Zack's Retail moves fully-received POs to a `RECEIVED` terminal status; they are no longer in the "open" projection. Deletion is a retention concern (`platform` purge), not a fiscal one. This aligns with the existing `PoStatus` enum: `DRAFT | SUBMITTED | CONFIRMED | PARTIALLY_RECEIVED | RECEIVED | CLOSED | CANCELLED`.
- **Receive-line edits are deltas on a ledger, not overwrites.** RICS's "enter a negative qty to offset an over-receipt" (p. 57) stays supported, but it's modeled as an adjustment receipt record (audit trail) — not a backwards edit of the prior line. `inventory` already uses a movement ledger; purchasing publishes `PurchaseOrderReceivedEvent` (and `PurchaseOrderReceiptReversedEvent` for corrections) and the ledger is the single source of truth.
- **"Remaining on-order" is always the primary view.** RICS's Enter-PO screen shows *original* quantities for a received PO and forces a report to see what's left (p. 57). The modern PO detail shows both, side by side, and offers a toggle for which to treat as canonical.
- **OTB validation happens at PO submit, not at PO save.** The existing contract (`apps/api/src/contracts/purchasingContract.ts`) already splits DRAFT from SUBMITTED/CONFIRMED/PARTIALLY_RECEIVED for committed-dollars computation. `purchasing` calls `otb-planning.validatePoDollars(poId)` on transition from `DRAFT` to `SUBMITTED`, receives `{ status: OK | WARN | BLOCK, overBy?, reasonCode? }`, and blocks on BLOCK unless a CEO-exception approval ID is supplied. Deferred-update pattern: a draft PO is not committed against the OTB plan.
- **Auto PO becomes a queued job, not a foreground screen.** RICS runs Generate Automatic Purchase Orders synchronously (p. 59). Zack's Retail schedules it as a `platform` background job with a preview step — the user sees what *will* be ordered before committing. Matches the modern pattern used elsewhere (scheduled price changes, transfers).
- **ASN cartons move behind the `platform` EDI boundary.** The EDI transport (SPS Commerce, Ch. 14 p. 190) lives in `platform`. `purchasing` exposes an idempotent `ingestAsnCarton(payload)` contract that `platform` calls after parsing an inbound 856 ASN. The Receive ASN Cartons UI stays here; the parsing does not.
- **Reset Future Orders becomes automatic + manual.** RICS reclassifies at month-close and on demand (p. 65). Zack's Retail runs a nightly job based on a stored `future-order-threshold-days` setting (replacing `RICS.CFG [Purchase Orders] DyFut`) and keeps a manual "Recalculate Now" button for users who just changed the threshold.
- **Direct Sale (`V`-prefixed) POs are deferred.** RICS reserves the `V` prefix for Direct Sale POs (p. 56), a drop-ship flow tied to Shoe & Sport Talk / EDI Direct Sale. Out of scope for v1 — we enforce the prefix reservation but do not ship the flow.
- **Storing Labels on Receive becomes a per-PO default, not a keystroke.** The `Alt+L` toggle (pp. 56, 57, 58, 61, 60) becomes a checkbox on each PO-entry form, defaulted from Vendor → Company Setup. When checked at receive time, the receive emits a label-generation request to `products` via the label queue.
- **"PO format (order)" and "PO format (open)" reports collapse.** The modern PO detail page already shows both ordered and open columns; the two report variants become one report with a toggle. The four-way variant matrix in Purchase Orders Reports (p. 58) becomes two toggles: Level (PO / Store) × Balance (ordered vs. open).
- **CSV export replaces "comma-delimited file" toggle.** All reports in this module download as CSV from the browser. Drops the `.TXT` filename option and the export-filename text box (p. 59).
- **Cash-payments projection is its own mini-report.** RICS buries it in the PO Report footer (p. 58). Zack's Retail makes it a first-class subview: "Projected AP by week × vendor" fed by PO Payment dates.
- **Model / Max / Reorder stay in `inventory`.** The Automatic PO job reads them via `inventory.getReplenishmentTarget(skuId, storeId, column, row)` which returns `{ modelQty, maxQty, reorderQty }`. Purchasing does no direct DB join to model-quantity tables.
- **Order Worksheet stays — but it's a persistent plan, not a calculation you re-key each time.** RICS's worksheet is ephemeral (you enter numbers, print, move on). Zack's Retail saves worksheets per (Store × Category × Size Type × Season) with a version history so a buyer can iterate. Worksheet → PO button materializes a draft PO from the worksheet.
- **Size grid is driven by `sku.sizeTypeId`, resolved against the `products` module's SizeType table** (which mirrors `RISIZE.MDB SizeTypes`). The PO UI never asks the user to pick columns/rows — the SizeType dictates them. A 1-D type (rows = `['']`) renders as a single strip of size inputs; a 2-D type renders as a `ColumnDesc × RowDesc` matrix (common examples: Size × Width for shoes, Size × Color for apparel). This means a PO line's valid cell coordinates are fully determined by the SKU — validation just checks the cell keys against the SizeType's enumerated columns/rows.
- **Case pack is a fill-aid, not a lock.** Picking a case pack on a line auto-fills `PurchaseOrderLineSizeCell.quantityOrdered` from `casePack.cellsPerPack × casePackMultiplier`, but individual cells remain editable after the fill — the buyer can override a size mid-pack when needed. Changing the pack selection or the multiplier refills (overwriting manual edits) with an explicit warning. Manual entry without any pack is equally supported.
- **Sequential SKU entry is the canonical workflow.** The RICS PO entry screen clears after each SKU save so the buyer doesn't scroll. Zack's Retail mirrors this: the PO Entry UI has one active "Entering SKU N" editor at the top; already-entered SKUs stack below in a numbered, read-only list ("SKU 1", "SKU 2", …) with Edit / Remove actions. Adding commits the draft to the list and blanks the editor. Editing an existing SKU reopens the editor populated with that line's state. This is an explicit deviation from a generic "all lines editable at once" grid — it matches the buyer's invoice-scanning mental model and keeps keyboard focus near the top of the screen.
- **SKU counter is a first-class affordance** (not just a derived length). The entry screen shows the current SKU count as a prominent badge in the top bar AND numbers each committed line ("SKU 1", "SKU 2", …). Buyers use this to tick off lines against a paper invoice at entry time and again at receive time — the count is load-bearing for invoice reconciliation, not cosmetic. Implication: renumbering policy matters; on removal we renumber by index (not preserve gaps) unless we later discover an audit reason to stabilize the numbers.

## Data model sketch

```prisma
model PurchaseOrder {
  id                  String   @id @default(uuid())
  poNumber            String   @unique        // RICS PO# (p. 56); reserved prefixes A, V
  billToStoreId       Int                      // required (p. 56)
  shipToStoreId       Int                      // required; each PO has a single ship-to
  vendorId            String
  orderType           OrderType                // RO | RE | SA (p. 56; RE/SA only when EDI)
  classification      POClassification         // AT_ONCE | FUTURE — derived nightly by Reset Future job (p. 65)
  status              PoStatus                 // DRAFT | SUBMITTED | CONFIRMED | PARTIALLY_RECEIVED | RECEIVED | CLOSED | CANCELLED
  origin              POOrigin                 // MANUAL | DUPLICATE | REPLICATE | AUTO | MERGED | ASN_INBOUND
  originSourcePoId    String?                  // for DUPLICATE / REPLICATE / MERGED (destination PO)
  confirmationNumber  String?                  // p. 56 header
  accountNumber       String?                  // p. 56 header (defaults from VendorStoreAccount)
  terms               String?                  // p. 56 header (defaults from Vendor)
  shipVia             String?                  // p. 56 header (defaults from Vendor)
  backorderAllowed    Boolean  @default(false) // p. 56 header
  splitShipment       Boolean  @default(false) // p. 56 header
  programCode         String?                  // p. 56 — EDI only
  storeLabelsOnReceive Boolean @default(false) // p. 56 Alt+L toggle
  comments            String?
  orderDate           DateTime                 // p. 56
  shipDate            DateTime?                // p. 56 — drives At-Once vs. Future
  cancelDate          DateTime?                // p. 56
  paymentDate         DateTime?                // p. 56 — feeds AP projection
  createdBy           String
  submittedAt         DateTime?
  closedAt            DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  lines               PurchaseOrderLine[]
  receipts            PoReceipt[]
  statusHistory       PoStatusHistory[]

  @@index([vendorId, status])
  @@index([shipToStoreId, shipDate])
  @@index([classification, status])
}

model PurchaseOrderLine {
  id                String  @id @default(uuid())
  poId              String
  skuId             String
  casePackId        String?                     // p. 56 — if set, sizes inherit from CasePack (store-ops)
  casePackMultiplier Int?    @default(1)        // X__ field (p. 56)
  retailPrice       Decimal                     // snapshot; may differ from SKU master (p. 56)
  unitCost          Decimal                     // snapshot
  // Per-size quantities live in a child grid table — one row per SKU size cell
  writeBackToMaster Boolean @default(false)     // RICS.CFG toggle (p. 56) — modernized as a per-line flag
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  po                PurchaseOrder @relation(fields: [poId], references: [id])
  sizeCells         PurchaseOrderLineSizeCell[]

  @@index([poId])
  @@index([skuId])
}

model PurchaseOrderLineSizeCell {
  id                String  @id @default(uuid())
  poLineId          String
  // columnLabel / rowLabel resolve against the SKU's SizeType (products module;
  // mirrors RICS `RISIZE.MDB SizeTypes` — Code, Desc, ColumnDesc, RowDesc,
  // Columns_01..54, Rows_01..27). A 1-D grid is stored with rowLabel = '' (or
  // NULL); a 2-D grid (e.g. Size × Width, Size × Color) fills both. The PO
  // never copies the axis labels from the SizeType — it only stores the
  // specific cell coordinates for that line.
  columnLabel       String?
  rowLabel          String?
  quantityOrdered   Int
  // quantityReceived lives on PoReceiptLine — the ledger, not the PO line
  @@unique([poLineId, columnLabel, rowLabel])
}

model PoReceipt {                                // receiving event (p. 57)
  id                String   @id @default(uuid())
  poId              String
  receivedAtStoreId Int
  receivedBy        String
  referenceNumber   String?                     // packing slip / carton ID
  asnCartonId       String?                     // set when from Receive ASN Cartons (p. 63)
  mode              ReceiptMode                 // MANUAL | FULL | SCAN | ASN
  discountPercent   Decimal? @default(0)        // p. 57 — applied at receipt, not header
  freightEach       Decimal? @default(0)        // p. 57
  receivedAt        DateTime @default(now())
  reversalOfReceiptId String?                   // for over-receipt correction (p. 57)

  lines             PoReceiptLine[]
}

model PoReceiptLine {
  id                String  @id @default(uuid())
  receiptId         String
  poLineId          String?                     // null for "SKU not on PO" against in-transit (p. 57)
  skuId             String
  columnLabel       String?
  rowLabel          String?
  quantityReceived  Int                         // may be negative for over-receipt correction
  effectiveUnitCost Decimal                     // unitCost * (1 - discount%) + freightEach
  discrepancyReasonId String?                   // existing field — see ZAI-322
  createdAt         DateTime @default(now())
}

model PoStatusHistory {                          // existing surface
  id           String @id @default(uuid())
  poId         String
  fromStatus   String?
  toStatus     String
  changedBy    String
  reason       String?
  createdAt    DateTime @default(now())
}

// --- Automatic PO generation ---

model AutoPoRun {                                // p. 59 — one per queued Auto-PO invocation
  id                String   @id @default(uuid())
  status            AutoRunStatus               // QUEUED | PREVIEWED | COMMITTED | CANCELLED
  billToStoreId     Int
  combineToStoreId  Int?                        // p. 60 — warehouse / DC mode
  backorder         Boolean
  splitShipment     Boolean
  shipDate          DateTime
  cancelDate        DateTime?
  paymentDate       DateTime?
  generateLabels    Boolean
  criteriaJson      Json                        // { stores?, vendors?, categories?, seasons?, skus?, groups?, keywords? }
  requestedBy       String
  createdAt         DateTime @default(now())
  previewedAt       DateTime?
  committedAt       DateTime?
  generatedPoIds    String[]                    // written on commit
}

// --- Order Worksheet (p. 63) ---

model OrderWorksheet {
  id                String   @id @default(uuid())
  storeId           Int
  categoryId        Int
  sizeTypeId        Int
  seasonCode        String?
  totalOrderQty     Int
  totalOrderRetail  Decimal
  sizeDistribution  Json                       // { columnLabel × rowLabel → percent }, sums to 100
  status            WorksheetStatus            // DRAFT | APPROVED | MATERIALIZED | ARCHIVED
  materializedPoIds String[]                   // populated when Worksheet → PO action is used
  createdBy         String
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  version           Int      @default(1)       // optimistic lock
}

model OrderWorksheetLine {
  id                String  @id @default(uuid())
  worksheetId       String
  draftSkuCode      String?                    // may be a future SKU — not yet in products
  draftDescription  String?
  retailPrice       Decimal
  shipMonth         Int                        // 1–12 (p. 63)
}

// --- ASN Cartons (pp. 63–64) ---

model AsnCarton {
  id                String   @id @default(uuid())
  cartonBarcode     String   @unique           // scan key (p. 63)
  vendorId          String
  poId              String?                    // optional link to a parent PO
  shipToStoreId     Int
  receivedReceiptId String?                    // set when the carton is scanned and committed
  sourceMessageId   String?                    // EDI 856 message ID from platform
  createdAt         DateTime @default(now())

  lines             AsnCartonLine[]
}

model AsnCartonLine {
  id                String  @id @default(uuid())
  cartonId          String
  skuId             String
  columnLabel       String?
  rowLabel          String?
  quantity          Int
  generateLabel     Boolean @default(false)    // p. 63 "option to create a label for each item"
}

// --- Settings (replaces RICS.CFG [Purchase Orders] — see store-ops module) ---
// Held in store-ops as CompanyPurchaseOrderSettings:
//   futureOrderThresholdDays  Int    // replaces DyFut (p. 65)
//   writeBackPriceOnPoEdit    Boolean // replaces RICS.CFG master-file write-back (p. 56)
//   resetFutureOnMonthClose   Boolean

enum OrderType          { RO  RE  SA }
enum POClassification   { AT_ONCE  FUTURE }
enum POOrigin           { MANUAL  DUPLICATE  REPLICATE  AUTO  MERGED  ASN_INBOUND }
enum ReceiptMode        { MANUAL  FULL  SCAN  ASN }
enum AutoRunStatus      { QUEUED  PREVIEWED  COMMITTED  CANCELLED }
enum WorksheetStatus    { DRAFT  APPROVED  MATERIALIZED  ARCHIVED }
```

## API surface

**PO lifecycle**
- `GET    /api/v1/purchase-orders` — filter by vendor, bill-to, ship-to, status, classification, ship-date range, order-date range, cancel-date range, last-received range, PO origin
- `POST   /api/v1/purchase-orders` — create (DRAFT)
- `GET    /api/v1/purchase-orders/:id` — detail incl. lines + receipts + status history + remaining-by-size
- `PATCH  /api/v1/purchase-orders/:id` — edit header or lines (DRAFT only, or CONFIRMED with approval)
- `POST   /api/v1/purchase-orders/:id/submit` — DRAFT → SUBMITTED; invokes OTB validation
- `POST   /api/v1/purchase-orders/:id/confirm` — SUBMITTED → CONFIRMED (vendor ack)
- `POST   /api/v1/purchase-orders/:id/cancel` — any non-terminal → CANCELLED
- `DELETE /api/v1/purchase-orders/:id` — DRAFT only (ordinary delete); non-DRAFT uses cancel

**Replicate / duplicate / combine / merge**
- `POST /api/v1/purchase-orders/:id/duplicate` — body: `{ poNumber?, billToStoreId?, shipToStoreId?, orderDate?, shipDate?, cancelDate?, paymentDate?, storeLabelsOnReceive? }` (p. 57)
- `POST /api/v1/purchase-orders/:id/replicate` — body: `{ prefix, shipToStoreIds[] }`; returns list of created POs + skipped (p. 61)
- `POST /api/v1/purchase-orders/combine` — body: `{ sourcePoId, intoPoId }` (p. 58)
- `POST /api/v1/purchase-orders/:id/merge-in-transit` — body: `{ sourcePoIds[], shipDate?, cancelDate? }` (p. 62)

**Receiving**
- `POST /api/v1/purchase-orders/:id/receive` — body: `{ lines[], referenceNumber?, discountPercent?, freightEach?, mode }`; lines = `[{ poLineId, columnLabel, rowLabel, quantity }]`; supports negative quantity for over-receipt correction
- `POST /api/v1/purchase-orders/:id/receive/full` — one-click full receive (p. 57 `[Full]`)
- `POST /api/v1/purchase-orders/:id/receive/scan` — session for UPC scan; each scan increments the matching cell (p. 57 `[Scan]` + `[End PO]`)
- `GET  /api/v1/purchase-orders/:id/receipts` — receipts history

**ASN**
- `POST /api/v1/asn-cartons` — internal: called by `platform` on inbound 856
- `POST /api/v1/asn-cartons/:cartonBarcode/receive` — scan-and-receive (p. 63)
- `GET  /api/v1/asn-cartons/:id` — detail + lines
- `PATCH /api/v1/asn-cartons/:id/lines` — ASN Carton Maintenance (p. 64)

**Automatic POs**
- `POST /api/v1/auto-po/runs` — queue an Auto-PO run (returns `runId`)
- `GET  /api/v1/auto-po/runs/:id/preview` — preview computed shortages + projected POs (before commit)
- `POST /api/v1/auto-po/runs/:id/commit` — materialize into draft POs
- `DELETE /api/v1/auto-po/runs/:id` — cancel before commit

**Order Worksheet**
- `GET|POST /api/v1/order-worksheets`
- `GET|PATCH /api/v1/order-worksheets/:id`
- `POST /api/v1/order-worksheets/:id/materialize` — create draft PO(s) from the worksheet

**Reset Future**
- `POST /api/v1/reset-future-orders` — body: `{ thresholdDays? }` (falls back to stored setting)

**Reports**
- `GET /api/v1/reports/purchase-orders` — PO Report (p. 58); query params for sort, variant, filters, balance-mode (ordered/open)
- `GET /api/v1/reports/open-po-by-month` — Open P.O. by Month Report (p. 59)
- `GET /api/v1/reports/po-cash-projection` — AP projection by payment date
- Each report supports `?format=csv`

## UI surface

**UX patterns that apply across the module**
- **Sequential SKU entry** (see Modernization decisions). Applies to PO Entry, Order Worksheet line entry, and any flow that adds SKUs to a parent record one at a time. A single active editor at the top + a numbered committed list below.
- **SKU counter** (see Modernization decisions). Every screen that accumulates SKUs onto a parent (PO Entry, Receive, Worksheet, Auto PO preview) shows a prominent running count so the operator can reconcile against a paper invoice / packing slip.
- **Size grid renders from `sku.sizeTypeId`** (see Modernization decisions). Never ask the user to pick columns/rows — the SKU's SizeType dictates them. 1-D → strip; 2-D → matrix with `ColumnDesc ↓ / RowDesc →` headers.
- **Case-pack affordance** is consistent everywhere: optional pack selector + `X__` multiplier + live "N units/pack × X = Y total" caption. Pack changes refill the grid; manual cell edits are preserved until the next pack/multiplier change and warned accordingly.

**Screens**
- **Purchase Orders list** (`/purchasing/pos`) — filter by vendor / bill-to / ship-to / status / classification / ship-date range / origin; columns: PO#, Vendor, Ship-to, Ship Date, Classification, Status, $ Ordered, $ Open
- **Purchase Order detail / edit** — header tab (vendor, stores, dates, terms) + lines tab (size grid, case-pack entry, per-line retail/cost overrides) + receipts tab (receipt history) + status timeline
- **Receive PO** — scan-first mode (UPC input) + manual per-size entry + `[Full]` button + over-receipt correction; per-receipt discount % and freight-each
- **ASN Scan-to-Receive** — single barcode input; on match, shows carton preview + confirm button
- **ASN Carton Maintenance** — admin grid edit of a single carton's lines (flagged "use with caution" inline, matching RICS advisory)
- **Auto PO wizard** — step 1: bill-to + dates + labels + backorder flags; step 2: criteria (stores, vendors, categories, seasons, SKUs, groups, keywords); step 3: preview table (SKU × Store × shortfall) with $ totals; step 4: commit
- **Order Worksheet editor** — store / category / size type / season selector, total qty + total retail inputs, % grid editor with running total + validation that sum = 100, draft-SKU table with ship-month picker, Materialize-to-PO action
- **Reset Future Orders** — one-action page with threshold input + preview of how many POs will change classification + confirm
- **Purchase Orders Report** — filter form (sort / variant / POs-to-print / date-range / criteria); result page with CSV download
- **Open P.O. by Month** — filter form + 12-column month grid + CSV download
- **Duplicate / Replicate / Combine / Merge** — launched as dialogs from the PO detail page
- **Cash Payments Projection** — sidebar report on the Purchase Orders list

## Dependencies

- **products** — `getSku`, `resolveUpc`, `getCurrentPrice`, `updateAverageCost` (purchasing calls this on receive), vendor reads, case-pack reads, **SizeType reads (`getSizeType(sizeTypeId)` returning `{ code, name, columnDesc, rowDesc, columns, rows }`)** — the PO UI depends on these to render size grids. Purchasing subscribes to `SkuDiscontinuedEvent` to remap open PO lines (RICS p. 69 cross-ref).
- **inventory** — `getOnHand(skuId, storeId)`, `getReplenishmentTarget(skuId, storeId, column, row)` for model/max/reorder, `applyReceipt(payload)`, `applyReceiptReversal(payload)`. Inventory owns the movement ledger; purchasing publishes events, never writes on-hand directly.
- **otb-planning** — `validatePoDollars(poId)` on submit, `reserveCommitment(poId)` and `releaseCommitment(poId)` on status transitions. The existing `PurchasingContractAdapter` is the *inverse* flow — OTB pulling data from purchasing; this spec adds the outbound flow.
- **store-ops** — store list for bill-to / ship-to; case-pack reads (p. 161 Case Packs — File Setup); Company Setup holds the Future-Order threshold, write-back flag, and Reset-on-month-close flag.
- **platform** — EDI inbound for ASN 856 messages (calls `ingestAsnCarton`); outbound 850 for PO acknowledgment (subscribes to `PurchaseOrderSubmittedEvent`); background worker runs Auto PO jobs and nightly Reset Future Orders; scheduled printing for labels on receive.
- **customer-transactions** — no direct dep; but a Special Order (p. 36) may eventually generate a Direct Sale PO. Out of scope for v1; noted for completeness.
- **employees** — user-level permissions for submit / receive / override OTB block.

## Contracts exposed

**Outbound (for other modules to consume)**
- `getOnOrder(skuId, storeId, classification?: AT_ONCE | FUTURE)` → `{ totalQty, bySize: { col, row, qty }[] }` — used by `inventory` inquiry screens and `sales-reporting` Stock Status Report
- `getOpenCommitmentsByMonth(filters)` → 12-month rollup by (vendor | category) × month × (qty | cost | retail) — used by `sales-reporting` and `otb-planning`
- `createPurchaseOrder(input)` → PO — used by `otb-planning` to materialize an OTB plan, by `customer-transactions` for Direct Sale (deferred), by automation tests
- `ingestAsnCarton(payload)` — idempotent; called by `platform` after parsing inbound 856
- `runAutoPoPreview(criteria)` → projected PO set — used by the wizard

**Events emitted**
- `PurchaseOrderSubmittedEvent { poId, vendorId, shipToStoreId, totalAtCost }` — `platform` sends outbound EDI 850; `otb-planning` reserves commitment
- `PurchaseOrderReceivedEvent { poId, receiptId, lines: [{ skuId, storeId, col, row, qtyReceived, effectiveUnitCost }] }` — `inventory` applies to ledger; `products` updates average cost
- `PurchaseOrderReceiptReversedEvent { poId, reversalReceiptId }` — `inventory` reverses the ledger entry
- `PurchaseOrderStatusChangedEvent { poId, fromStatus, toStatus }` — `otb-planning` adjusts reservations
- `PurchaseOrderLineSkuDiscontinuedRemappedEvent { poId, lineId, fromSkuCode, toSkuId }` — audit

**Events consumed**
- `SkuDiscontinuedEvent` (from `products`) — remap open PO lines per RICS p. 69
- `AsnInboundMessageReceivedEvent` (from `platform`) — triggers `ingestAsnCarton`
- `MonthClosedEvent` (from `accounts-receivable` fiscal-close) — triggers optional Reset Future Orders per company setting

## Out of scope for v1

- **Direct Sale POs (`V`-prefix, p. 56)** — drop-ship flow tied to legacy EDI channels (Shoe & Sport Talk, Direct Sale). Reserve the prefix; defer the flow until the first Direct Sale vendor is on SPS Commerce.
- **Merge In-Transit Purchase Orders (p. 62)** — rarely used in practice per the product team's read of the manual; a user can combine-and-delete manually in v1. Keep the data model hooks (`originSourcePoId`, `origin = MERGED`) so we can add it in v2.
- **Program Code field (p. 56)** — EDI-only oddity; surface the field in the DB but hide in the UI until the first EDI PO flow ships.
- **Multi-store ship-to on a single PO** (p. 56 — "Ship-to Store number(s)") — RICS's wording is ambiguous; in practice each PO has a single ship-to. If a buyer needs multi-store, they use Replicate. Revisit if the team disagrees.
- **Backup-files-for-POS flow (Ch. 13 p. 176)** — obsolete per `MODULES.md`. Not ported.
- **Send-Purchase-Order-changes push (p. 161 Communications)** — obsolete; real-time sync replaces it.
- **PO format printouts to physical printers with alignment** — browser-only PDF/CSV. Drops printer-driver setup and the "Print Cost on PO" mechanical toggle surface (the data option stays as a report checkbox).
- **RICS.CFG `[Purchase Orders]` block editor** — each flag becomes a Company Setup field (`store-ops`): `futureOrderThresholdDays`, `writeBackPriceOnPoEdit`, `resetFutureOnMonthClose`. The config-file editor does not ship.
- **Macros / keyboard-shortcut Alt-codes (`Alt+S`, `Alt+A`, `Alt+L`, etc., throughout Ch. 3)** — web UI provides a shortcut layer via `platform`; we do not replicate the exact keymap.

## Open questions

1. **PO-line vs. receipt delta for `quantityReceived`.** The existing `PurchaseOrderLine` carries `quantityReceived` (see `apps/web/src/types/purchaseOrder.ts`). This spec moves the truth to `PoReceiptLine` (the ledger). Is the line-level `quantityReceived` kept as a denormalized convenience column, or fully derived? Resolving this decides whether receipts trigger a materialized-view update.
2. **Auto-PO with Combine-to-Store: on-hand vs. on-order-at-warehouse?** RICS (p. 60) subtracts warehouse *on-hand* from the total shortfall. Should we also subtract warehouse *on-order* from upstream vendor POs? More conservative, but not what RICS does.
3. **Replicate into a store that already has an identical PO number.** RICS (p. 61) silently skips. Do we keep that behavior or surface a per-store result list (`{ created: [...], skipped: [...] }`)? Recommendation: return the explicit result list.
4. **Over-receipt correction — reverse the whole receipt or a negative-qty adjustment receipt?** RICS conceptually does the latter (p. 57: "enter a minus quantity") — which matches our ledger approach — but it also prints extra labels ("four labels will print instead of three"). Do we replicate the label over-print, or only generate labels for the net positive quantity?
5. **Auto-PO for vendors with no EDI.** RICS treats all auto-POs identically — it's just an internal PO. Do we also auto-submit the 850 EDI for EDI vendors, or is auto-commit-to-draft the ceiling for Auto PO (with a human in the loop for submit)? Default recommendation: auto creates DRAFT; human submits.
6. **Scope of Reset Future Orders on already-received POs.** Once a PO is PARTIALLY_RECEIVED, reclassifying its At-Once/Future status has reporting implications but no operational ones. Do we freeze classification at first receipt?
7. **Order Worksheet: SKU-level persistence vs. aggregate only.** RICS's worksheet is just a size-distribution calculator — individual draft SKU lines are a printout, not a saved artifact. Our persisted `OrderWorksheetLine` is an improvement, but it raises: should materialization create one PO per vendor, or one PO per worksheet?
8. **PO-line writeback to SKU master (p. 56 — "unless you choose to change a RICS.CFG entry").** Faithful port keeps the per-line `writeBackToMaster` flag. Simpler v1: drop the flag, never write back, force users to use Price Changes in `products`. Which?
9. **"SKU not on PO" during Receive (p. 57).** RICS forbids adding a SKU during receive *unless* it's an in-transit PO. Our status model doesn't have a dedicated "in-transit" status — it's implicit in `SUBMITTED` or `CONFIRMED`. Do we introduce `IN_TRANSIT`, or permit add-on-receive only for `CONFIRMED` POs flagged as in-transit via the Merge workflow?
10. **ASN carton barcode uniqueness across vendors.** RICS documentation is silent. Safer to scope `cartonBarcode` unique per `vendorId`; but a scanner yields only the raw barcode, so we need to resolve vendor by context (which store is scanning) or require the barcode itself to be globally unique.
