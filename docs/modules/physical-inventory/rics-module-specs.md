# Module: physical-inventory

**Goal**

`physical-inventory` owns the periodic stocktake — the operational ritual of pausing inventory mutation, walking the store with a scanner or paper sheet, recording physical counts cell-by-cell, reconciling those counts against the system's on-hand projection, and committing the variances as adjustment movements on the `inventory` ledger. It owns the *count session* primitive (one stocktake event per store per cycle), the worksheet generator, the count-entry surfaces (typed, scanned, mobile, and CSV-imported), the items-not-counted and variance reports, and the irreversible Update Inventory step. Primary user value: a store manager can run a full inventory in a single Friday night with two people on the floor and one at a laptop, see the variance before committing, and know that every adjustment lands in the same auditable ledger that the rest of the system reads from.

Scope note: this module *generates* the counting work and *computes* the variance, but it never touches `StockLevel` or any cached on-hand counter directly. Every adjustment goes through `inventory.applyCountAdjustments(sessionId)`, which writes `PHYSICAL_ADJUSTMENT` rows to the movement ledger. The same boundary that `purchasing` and `sales-pos` respect for receipts and sales applies here. Cross-module reads of the SKU master and the on-hand snapshot go through `inventory.getSnapshot(storeId, asOf)`.

## RICS features covered

**Workflow overview** (Ch. 10)
- **p. 136, Overview** — two execution paths share the same downstream pipeline:
  - **Manual path**: Print Worksheets → count on paper → Enter Physical Counts → Items Not Counted → Variance Report → Backup → Update Inventory.
  - **Portable Reader path**: scan into a Percon PT2000 → Get Data from Portable Reader → Post Data from Portable Reader → Items Not Counted → Variance Report → Backup → Update Inventory.
- **p. 136, Pre-flight checklist** — RICS requires the operator to (a) enter all receipts/vendor-returns/transfers, (b) print and *post* all sales (so on-hand is current — see `sales-pos` p. 45), (c) physically locate all inventory (clean stockrooms, hold shelves), (d) plan the count route ("bottom to top, left to right, or by vendor").
- **p. 136, Frozen-after-counts rule** — *"do not enter other information, such as sales, receipts, or transfers that occur after the physical inventory, until you complete Update Inventory."* This is the moment-of-truth invariant: no inventory-changing event may slip into the gap between the count and the update. RICS enforces it socially; the system trusts the operator.

**Worksheets** (Ch. 10)
- **p. 137, Print Worksheets** — optional printed form to record counts on. Printable for one store or all SKUs (the latter required for new stores with zero activity), sortable by Vendor or Category, filterable by Vendor / Category / SKU / Season / Group. Pre-fills nothing — just produces blank size grids per SKU. Manual notes the new-store flow uses Manual Receipts (Ch. 4 p. 66) rather than counts to seed beginning inventory.

**Count entry** (Ch. 10)
- **p. 137, Enter Physical Counts** — manual count-entry screen for one (Store × SKU). Per-size cell entry against the SKU's size grid. Counts are **additive**: a Save adds to any existing count for that SKU rather than overwriting, so a single SKU spread across three locations can be counted in three passes (5 + 7 + 3 → 15). Two helper buttons:
  - **Place On-Hand button** — pre-fills the count grid with the system's current on-hand for that (SKU × Store). Disabled if any count for that SKU is already entered in this session. Use case: "I just want to confirm the system is right for this row".
  - **Place Counts button** — pre-fills the grid with whatever has already been entered in this session, so the operator can double-check before adding more.
- **p. 137, Revising counts (corrections)** — for counts already in the session but not yet Updated, the operator enters a *delta* (positive or negative) to adjust. Manual is explicit: a count of 5 that should have been 4 is corrected by entering `-1`, *not* by re-entering `4`. The system never overwrites an existing cell; every save is a delta.
- **p. 137, Zeroing counts (the cell with a count of 0)** — to mark an SKU as physically absent, enter a count of `0` in any cell of any row. The presence of a `0` flips the SKU from "uncounted" (default — no change at Update) to "counted = zero" (Update sets on-hand to zero in every cell of every row not otherwise counted). The Items Not Counted Report drives discovery of which SKUs need this treatment.
- **p. 137, Direct PC scan during Enter Physical Counts** — RICS supports a keyboard-wedge scanner at the count screen. Operator enters the store number, presses a Bar Codes button, and scans UPC after UPC; each scan increments the matching cell by 1. Same data path as manual entry — just a keystroke optimization.

**Portable Reader ingestion** (Ch. 10 + Ch. 1)
- **p. 138, Get Data from Portable Reader** — pulls scanned data from a connected Percon PT2000 over a serial cable (COM port). Two-step flow: Get Data, then Post Data. Get Data may not be re-run until Post Data has been completed — there is exactly one "in-flight" import buffer.
- **p. 138, Post Data from Portable Reader** — posts the imported buffer to the **physical inventory count file** (i.e., the count session — *not* the live inventory file). Operator picks `Post which: Physical Inventory Counts` and runs. The import buffer can also be posted as Transfers / Manual Receipts / Manual Returns / PO Receipts depending on what the scanner was loaded for; *the store number embedded in the scan stream determines the operation* (`00` = transfer/receipt/return, anything else = physical count for that store).
- **p. 138, Exceptions report on Post** — when the imported file contains rows that do not resolve (invalid SKU, invalid Column/Row, unknown UPC), an exceptions report is printed listing each bad row plus the previous valid SKU and next valid SKU in scan order — so the operator can find the offending item on the floor between two known anchors.
- **p. 18, Percon PT2000 device behaviors (cross-ref from Ch. 1)** — the manual documents the device's three-mode keypad (data / function / action), the two-step main menu (Wedge mode vs. Collect Data mode), the Review mode (Prev / Next / Delete / 1st / Find / Modify), and the Erase action that clears the unit after a successful Send File. Most of this is dropped (see Modernization), but two semantic rules port over: (1) one in-flight buffer at a time per device, (2) operator must explicitly clear (acknowledge ingestion completed) before scanning the next session.

**Reconciliation reports** (Ch. 10)
- **p. 139, Print Items Not Counted Report** — lists every SKU that has no count entered in the session. Optional filter to *include or exclude SKUs with zero on-hand* (the default behavior — without the toggle, zero-on-hand SKUs flood the report). Range filters by Store / Vendor / Category / SKU / Season / Group. Critical because the default behavior of Update Inventory is *"uncounted = unchanged"*: any SKU on this report with a non-zero system on-hand will retain its system on-hand even if it's actually missing from the floor. The fix is to enter a `0` count for it (see Zeroing Counts above).
- **p. 140, Print Variance Report** — compares entered counts against system on-hand. For each (SKU × Store × Cell) where a count exists, prints the count, the on-hand, the unit variance, and the dollar variance (variance × current cost). `Print only varying items` toggle suppresses zero-variance lines. SKUs with no count entered are *intentionally excluded* (they appear on Items Not Counted instead) — the manual flags this as a pitfall: filtering the Variance Report by Vendor or Category that does not match the actual count scope can hide a stray scan that would silently change one unit's on-hand.
- **p. 140, Pre-Update checklist** — Update Inventory presents a `Have You?` block with explicit checkboxes the operator must tick: Print Items Not Counted Report, Entered a zero count for any items on that report, Print Variance Report and reviewed it, Backed up your data. Update is blocked until all four are acknowledged.

**Update Inventory** (Ch. 10)
- **p. 140, Update Inventory** — the irreversible commit. For every cell where a count was entered: replace on-hand with the entered count. For every cell on a "zero count entered" SKU: set on-hand to zero. For every cell on an uncounted SKU: leave on-hand unchanged. Once Update completes, normal inventory mutation (sales / receipts / transfers) resumes.

## Modernization decisions

- **`CountSession` is the bounded primitive.** RICS conflates the count-in-progress with two implicit "files" — the count file and the portable-reader import buffer — and a third implicit time-window ("the freeze"). Zack's Retail names it: a `CountSession { id, storeId, status, scopeJson, openedAt, frozenAt?, updatedAt?, ... }` with a strict state machine `DRAFT → OPEN → COUNTING → READY_FOR_REVIEW → READY_FOR_UPDATE → POSTING → COMMITTED | CANCELLED`. Every count entry, every imported batch, every variance row, and the eventual ledger write is keyed off `sessionId`. The session is the unit of work, the audit anchor, and the granularity at which `inventory.applyCountAdjustments(sessionId)` is called.
- **Inventory Update is the moment of truth — every variance becomes a `PHYSICAL_ADJUSTMENT` movement on the `inventory` ledger.** RICS's Update overwrites the on-hand cells in place (p. 140); we never overwrite. For each variance cell, the module computes `delta = countedQty - snapshotOnHandAtFreezeTime` and calls `inventory.applyCountAdjustments(sessionId)` once with the full set. `inventory` writes one `StockMovement` row per cell with `movementType = PHYSICAL_ADJUSTMENT`, `sourceDocumentType = PHYSICAL_COUNT`, `sourceDocumentId = sessionId`, `unitCostSnapshot = current avg cost at freeze`, and the resulting `StockLevel` projection is recomputed from the ledger. This means a count that says "the cell is at 5" doesn't write `5` to on-hand — it writes whatever `delta` is required to reach `5` *as of the freeze snapshot*, and any movement that lands between freeze and post (which is allowed in the modern system, see next decision) is naturally accounted for.
- **The "no movement during freeze" rule becomes a soft window, not a system halt.** RICS enforces frozen-during-count socially (p. 136). Zack's Retail allows sales and receipts to continue in other parts of the company while a single store's count is in progress, by snapshotting `inventory.getSnapshot(storeId, frozenAt)` at session freeze and treating *that* snapshot as the variance baseline. Movements between `frozenAt` and `committedAt` are tagged `appliedDuringPhysicalCountSessionId = sessionId` so the variance arithmetic is correct (counted = snapshot + post-freeze movements + delta-from-count). For operators who want the legacy "everything stops" behavior, a `lockStoreDuringCount` flag (see Data model) holds a store-wide advisory lock that POS and receiving check before writing.
- **Device-agnostic scanning.** RICS's portable-reader path is two screens (Get Data, Post Data) and a serial-cable workflow specific to the Percon PT2000 (Ch. 1 p. 18). Zack's Retail drops the device. Three equivalent ingest paths feed the same `CountBatch` primitive:
  1. **Mobile web client** — phone or tablet connects to the session via QR code or six-digit join code; in-browser camera barcode scanning (or HID-paired bluetooth scanner). Each scan is a real-time POST to the session; offline mode buffers and replays.
  2. **HID keyboard-wedge scanner** at a desktop browser — same Enter Physical Counts page; each scan increments the matched cell.
  3. **CSV import** — accepts a flat file `(skuCode | upc), columnLabel, rowLabel, quantity, scannedAt?, deviceId?` for legacy hardware that can only export to file or for spreadsheet-prepared counts. The Percon-style "store number = 00 means it's a transfer not a count" hack does not survive — the session's `storeId` is in the URL, not in the data.
- **Multi-device concurrent counting with conflict resolution at session-close.** RICS is single-device, single-operator at a time (the count file is shared but uncoordinated). Zack's Retail makes a session a multiplayer artifact: many counters can be scanning the same store concurrently from their own phones, each tagged by `deviceId` and `counterUserId`. Each scan creates a `CountEntry` with `cellId, quantity, deviceId, counterUserId, scannedAt`; the session's running count for a cell is the *sum* across all entries (matching RICS's additive semantic, p. 137). On session close, a conflict-detection pass surfaces:
  - **Duplicate-pass risk** — same cell counted from multiple devices within a configurable proximity window (default 30 min). Surface for review; do not auto-merge.
  - **Counter disagreement** — same cell counted by two devices with totals that don't sum to a "natural pass" pattern (i.e., two operators counted the same shelf independently expecting their numbers to *match*, not add). This is opt-in: a session can be configured `mode = ADDITIVE` (the legacy default) or `mode = INDEPENDENT_VERIFICATION` (each cell needs N independent counts, system flags disagreements).
- **Worksheets are PDF-on-demand from the browser.** RICS's "Print Worksheets" (p. 137) becomes a PDF generator with the same filter knobs (sort by Vendor or Category; filter by store / vendor / category / SKU / season / group; all-SKUs mode for new stores). Optionally exported as a CSV for use in a spreadsheet or copied to a tablet for in-store reference. The legacy "send the worksheet to the spool file then to the dot-matrix" path (Ch. 14) is dropped per `MODULES.md`.
- **Items Not Counted is computed live, not printed and re-checked.** RICS's flow (p. 139) is print → walk the report → enter zeros → print again. Zack's Retail surfaces it as a live panel on the session detail page that updates as counts come in, with bulk actions: "Mark all displayed as zero count" (the modern equivalent of running the report and re-keying zero for each line), with a per-row checkbox for selective zeroing. Print-to-PDF still available for the operator who wants paper.
- **Variance Report is computed live and split by *materiality threshold*.** RICS prints "all varying items" (p. 140) in a single list, with the operator scanning visually for big numbers. Zack's Retail bands the variance view: zero-variance / low-variance (within configured tolerance) / material-variance (above tolerance) / extreme-variance (above CEO-attention threshold), with the latter two bands requiring acknowledgement before Update. Tolerances are per-category (`store-ops` Company Setup), with a system default. CSV / PDF export reproduces the RICS one-list format for compatibility.
- **The `Have You?` checklist is a state-machine gate, not a checkbox screen.** RICS shows a four-checkbox modal on Update (p. 140) and trusts the operator to tick each. Zack's Retail makes the same four conditions *automated preconditions* on the `READY_FOR_REVIEW → READY_FOR_UPDATE` transition: (1) Items Not Counted has been viewed within the session (telemetry), (2) Variance Report has been viewed, (3) every material-variance line has been acknowledged, (4) a backup snapshot exists (always true under managed Postgres + WAL — auto-satisfied). The "I have done X" checkbox UI is preserved for operator confidence, but the gating is enforced server-side.
- **Update Inventory is idempotent and resumable.** RICS's Update is fire-and-forget — a crash mid-update leaves the on-hand file in an undefined state. Zack's Retail's `commitSession(sessionId)` is wrapped in a single transaction at the `inventory.applyCountAdjustments(sessionId)` boundary: either every cell's adjustment movement is written or none are. The session moves to `POSTING` before the call and to `COMMITTED` only on successful return; a crash leaves the session in `POSTING` with no partial ledger entries, recoverable by re-running.
- **No "Backup your data" step.** RICS's checklist (p. 140) requires the operator to back up before Update. Managed Postgres (with PITR) auto-satisfies this — the precondition is logged but invisible to the operator.
- **Cancel is first-class and audit-trailed.** RICS doesn't formally model cancellation — an aborted count is just an unposted count file the operator forgets about. Zack's Retail's `CountSession.status = CANCELLED` is an explicit transition with `cancelledBy`, `cancelledAt`, and `cancellationReason`; no ledger entries are written, but the session and its `CountEntry` rows persist for audit (subject to retention).
- **Snapshot at freeze, not at post.** The variance baseline is `inventory.getSnapshot(storeId, frozenAt)`, not `inventory.getSnapshot(storeId, now)`. This is the operational truth of a stocktake — what was on-hand when counting began — and decouples the variance arithmetic from any movement that happens during the count window. Stored as a frozen `CountSessionSnapshot` blob keyed by `sessionId`, never recomputed.
- **The "store number = 00 → transfer/receipt" overload (p. 138) is dropped.** Each ingest path knows what it is. Counts go to a `CountSession`; transfers go to `inventory`'s Manual Transfer surface; manual receipts go to `inventory`'s Manual Receipt surface. We do not multiplex on a magic store number.
- **Worksheet "Print all SKUs for new stores" pattern stays — but new-store seeding moves to Manual Receipts.** RICS already routes new-store beginning inventory through Manual Receipts (p. 137 note). We honor the same: the worksheet's "all SKUs" mode is a one-click toggle, but the canonical new-store flow is `inventory.createManualReceipt`, not a count-then-update.
- **Session scope is explicit.** RICS doesn't formalize "scope of count" — the operator decides what to count, the system reconciles whatever was entered against everything. Zack's Retail makes scope a session field: `scopeJson = { vendors?, categories?, seasons?, groups?, keywords?, skus?, sizeTypes? }`, defaulting to "everything in this store". The Items Not Counted Report and the Update step both honor scope: a vendor-scoped session only zeros uncounted SKUs *within that vendor*, never touches the rest. Resolves the manual's pitfall on p. 140 where filtering Variance Report by a wrong vendor silently lets a stray scan adjust one unit.

## Data model sketch

```prisma
model CountSession {                              // the stocktake event itself
  id                  String   @id @default(uuid())
  sessionNumber       String   @unique             // human-readable, e.g. "PI-S01-2026-04"
  storeId             Int
  status              CountSessionStatus           // DRAFT | OPEN | COUNTING | READY_FOR_REVIEW | READY_FOR_UPDATE | POSTING | COMMITTED | CANCELLED
  mode                CountMode                    // ADDITIVE | INDEPENDENT_VERIFICATION
  scopeJson           Json                         // { vendors?, categories?, seasons?, groups?, keywords?, skus?, sizeTypes? }; null = whole store
  lockStoreDuringCount Boolean @default(false)     // legacy "freeze the store" mode
  joinCode            String?  @unique             // 6-digit code mobile devices use to join (rotated on freeze)
  joinCodeQrPayload   String?                      // QR for one-tap mobile join
  openedBy            String
  openedAt            DateTime @default(now())
  frozenAt            DateTime?                    // baseline snapshot taken here (p. 137 invariant)
  reviewStartedAt     DateTime?
  postingStartedAt    DateTime?
  committedAt         DateTime?
  cancelledAt         DateTime?
  cancellationReason  String?
  cancelledBy         String?
  retentionExpiresAt  DateTime?                    // tracked in platform retention
  notes               String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  snapshot            CountSessionSnapshot?
  batches             CountBatch[]
  entries             CountEntry[]                 // denormalized for fast aggregation
  variances           CountVariance[]              // computed at READY_FOR_REVIEW, frozen at COMMITTED
  acknowledgements    CountReviewAck[]
  ledgerWriteRef      String?                      // FK to inventory.applyCountAdjustments result

  @@index([storeId, status])
  @@index([status, openedAt])
}

model CountSessionSnapshot {                       // baseline on-hand at freeze (RICS p. 137 invariant)
  id              String   @id @default(uuid())
  sessionId       String   @unique
  takenAt         DateTime                         // == CountSession.frozenAt
  // Per-cell snapshot: skuId, columnLabel, rowLabel, snapshotOnHand, snapshotAvgCost, snapshotRetail
  cellsJson       Json                             // compressed; large stores may have 100k+ cells
  cellCount       Int
  totalUnitsOnHand Int
  totalCostValue  Decimal
}

model CountBatch {                                 // one ingest event — one mobile session, one CSV upload, one Percon-style import
  id              String   @id @default(uuid())
  sessionId       String
  source          CountBatchSource                 // MOBILE_WEB | HID_SCANNER | CSV_IMPORT | MANUAL_KEYED | LEGACY_PERCON_BUFFER
  deviceId        String?                          // mobile device fingerprint or COM-port ID
  deviceLabel     String?                          // operator-facing ("Maria's iPhone", "Front register")
  counterUserId   String?
  importedAt      DateTime @default(now())
  acknowledgedAt  DateTime?                        // operator marks the batch as "fully posted, safe to clear" (Percon-style)
  exceptionsJson  Json?                            // { invalidSku, invalidCell, unknownUpc } with previous/next valid anchors (p. 138)
  rawPayloadRef   String?                          // S3 key for CSV / raw mobile payload
}

model CountEntry {                                 // additive — one row per scan / per save
  id              String   @id @default(uuid())
  sessionId       String
  batchId         String
  skuId           String
  columnLabel     String   @default("")
  rowLabel        String   @default("")
  quantity        Int                              // signed — RICS's revising-counts pattern (p. 137) supports negative deltas
  scannedAt       DateTime @default(now())
  counterUserId   String?
  isZeroFlag      Boolean  @default(false)         // true when the entry is the explicit "this SKU has zero of every size" marker (p. 137)

  @@index([sessionId, skuId, columnLabel, rowLabel])
  @@index([sessionId, scannedAt])
}

model CountVariance {                              // one per (sessionId × skuId × cell) for cells with at least one entry
  id              String   @id @default(uuid())
  sessionId       String
  skuId           String
  columnLabel     String   @default("")
  rowLabel        String   @default("")
  countedQty      Int                              // sum of CountEntry.quantity for this cell
  snapshotOnHand  Int                              // from CountSessionSnapshot
  delta           Int                              // countedQty - snapshotOnHand
  unitCost        Decimal                          // from snapshot
  variancePct     Decimal?                         // delta / snapshotOnHand; null when snapshot=0
  band            VarianceBand                     // ZERO | LOW | MATERIAL | EXTREME
  acknowledgedAt  DateTime?                        // material/extreme bands require explicit ack
  acknowledgedBy  String?
  computedAt      DateTime @default(now())

  @@unique([sessionId, skuId, columnLabel, rowLabel])
  @@index([sessionId, band])
}

model CountReviewAck {                             // operator acknowledgements that gate Update (p. 140 "Have You?")
  id              String   @id @default(uuid())
  sessionId       String
  step            ReviewStep                       // VIEWED_ITEMS_NOT_COUNTED | VIEWED_VARIANCE | ACK_MATERIAL_VARIANCES | BACKUP_VERIFIED
  acknowledgedBy  String
  acknowledgedAt  DateTime @default(now())

  @@unique([sessionId, step])
}

// --- Worksheet generation (p. 137) — stateless; nothing persisted besides the export artifact ---

model WorksheetExport {                            // optional audit row when a worksheet PDF is generated
  id              String   @id @default(uuid())
  storeId         Int
  filtersJson     Json                             // sort, vendor/category/SKU/season/group filters, all-SKUs flag
  format          WorksheetFormat                  // PDF | CSV
  generatedBy     String
  generatedAt     DateTime @default(now())
  artifactRef     String                           // S3 key
  rowCount        Int
}

// --- Settings (held in store-ops.CompanyPhysicalInventorySettings) ---
// lowVarianceTolerancePct          Decimal   // default band threshold low → material
// materialVarianceTolerancePct     Decimal   // default band threshold material → extreme
// extremeVarianceCeoNotify         Boolean
// requireZeroAckForExtreme         Boolean
// duplicatePassWindowMinutes       Int       // default 30; conflict-detection window
// defaultLockStoreDuringCount      Boolean
// independentVerificationCountN    Int       // for INDEPENDENT_VERIFICATION mode

enum CountSessionStatus {
  DRAFT
  OPEN
  COUNTING
  READY_FOR_REVIEW
  READY_FOR_UPDATE
  POSTING
  COMMITTED
  CANCELLED
}
enum CountMode             { ADDITIVE  INDEPENDENT_VERIFICATION }
enum CountBatchSource      { MOBILE_WEB  HID_SCANNER  CSV_IMPORT  MANUAL_KEYED  LEGACY_PERCON_BUFFER }
enum VarianceBand          { ZERO  LOW  MATERIAL  EXTREME }
enum ReviewStep            { VIEWED_ITEMS_NOT_COUNTED  VIEWED_VARIANCE  ACK_MATERIAL_VARIANCES  BACKUP_VERIFIED }
enum WorksheetFormat       { PDF  CSV }
```

## API surface

**Session lifecycle**
- `POST   /api/v1/count-sessions` — create DRAFT session. Body: `{ storeId, scope?, mode?, lockStoreDuringCount?, notes? }`.
- `GET    /api/v1/count-sessions` — filter by `storeId`, `status`, date range.
- `GET    /api/v1/count-sessions/:id` — full detail incl. progress aggregates, batches, materiality summary.
- `PATCH  /api/v1/count-sessions/:id` — edit scope/notes (only in DRAFT or OPEN).
- `POST   /api/v1/count-sessions/:id/open` — DRAFT → OPEN; generates `joinCode` + QR.
- `POST   /api/v1/count-sessions/:id/freeze` — OPEN/COUNTING → COUNTING with `frozenAt = now`; takes the `CountSessionSnapshot`. Idempotent.
- `POST   /api/v1/count-sessions/:id/ready-for-review` — COUNTING → READY_FOR_REVIEW; computes `CountVariance` rows.
- `POST   /api/v1/count-sessions/:id/ready-for-update` — READY_FOR_REVIEW → READY_FOR_UPDATE; gated on `CountReviewAck` completeness.
- `POST   /api/v1/count-sessions/:id/commit` — READY_FOR_UPDATE → POSTING → COMMITTED; calls `inventory.applyCountAdjustments(sessionId)`.
- `POST   /api/v1/count-sessions/:id/cancel` — any non-terminal → CANCELLED. Body: `{ reason }`.

**Joining (mobile web client)**
- `POST   /api/v1/count-sessions/by-join-code/:code` — exchange six-digit code for a session-scoped device token + `{ sessionId, storeId, mode, scope }`.
- `POST   /api/v1/count-sessions/:id/devices` — register a device for this session. Body: `{ deviceLabel, counterUserId? }`. Returns a `deviceId` and a websocket URL for live updates.

**Count entry**
- `POST   /api/v1/count-sessions/:id/entries` — single scan. Body: `{ batchId?, skuId? | upc?, columnLabel?, rowLabel?, quantity?, isZero? }`. `quantity` defaults to 1 (one scan = one unit). Returns the matched cell + running total for that cell.
- `POST   /api/v1/count-sessions/:id/entries/bulk` — multi-cell save (the manual Enter Physical Counts grid save). Body: `{ batchId, skuId, cells: [{ columnLabel, rowLabel, quantity }] }`.
- `GET    /api/v1/count-sessions/:id/entries` — paginated list; filters by `skuId`, `batchId`, `deviceId`, `counterUserId`.
- `DELETE /api/v1/count-sessions/:id/entries/:entryId` — remove a single entry (allowed pre-freeze of variance computation, blocks after).
- `GET    /api/v1/count-sessions/:id/cells/:skuId` — running totals for one SKU's cells in this session (powers Place-Counts button, p. 137).
- `GET    /api/v1/count-sessions/:id/cells/:skuId/snapshot` — current on-hand for one SKU at session freeze (powers Place-On-Hand button, p. 137).

**Batch ingestion**
- `POST   /api/v1/count-sessions/:id/batches` — create a batch context. Body: `{ source, deviceLabel?, counterUserId? }`. Returns `batchId`.
- `POST   /api/v1/count-sessions/:id/batches/:batchId/import-csv` — multipart upload; processes rows synchronously up to a small threshold then asynchronously. Returns counts + exceptions.
- `POST   /api/v1/count-sessions/:id/batches/:batchId/acknowledge` — operator confirms the batch is fully ingested (Percon "erase the unit" semantic, Ch. 1 p. 19); blocks new same-source batches until acknowledged.
- `GET    /api/v1/count-sessions/:id/batches/:batchId/exceptions` — invalid-SKU / unknown-UPC / invalid-cell list with previous/next valid anchors (p. 138).

**Reports / live panels**
- `GET /api/v1/count-sessions/:id/items-not-counted` — server-computed list. Query: `includeZeroOnHand=true|false`, plus the same scope filters as session creation. Supports `?format=csv` and `?format=pdf`.
- `POST /api/v1/count-sessions/:id/items-not-counted/zero-out-bulk` — body: `{ skuIds[] }` — creates an `isZeroFlag = true` entry for each (the modern equivalent of "enter a zero count for each item on the report", p. 139).
- `GET /api/v1/count-sessions/:id/variance` — server-computed list. Query: `bands[]=MATERIAL,EXTREME`, `onlyVarying=true|false` (RICS p. 140 toggle), `?format=csv|pdf`.
- `POST /api/v1/count-sessions/:id/variance/:varianceId/acknowledge` — required for MATERIAL/EXTREME bands before commit.
- `GET /api/v1/count-sessions/:id/summary` — aggregate: cells counted / cells in scope / dollar variance by band / pending acknowledgements / batch count / counter count.

**Worksheets**
- `GET /api/v1/worksheets` — generate a worksheet. Query: `storeId`, `sortBy=VENDOR|CATEGORY`, `vendors?`, `categories?`, `skus?`, `seasons?`, `groups?`, `allSkus=true|false`, `format=pdf|csv`. Records a `WorksheetExport` row.
- `GET /api/v1/worksheets/:exportId/artifact` — re-download a previously generated worksheet.

## UI surface

- **Count Sessions list** (`/inventory/count-sessions`) — status pipeline columns (Open / Counting / Review / Pending Update / Committed); filter by store, date, scope. New Session button.
- **New Session wizard** — store picker, scope builder (vendor / category / season / group / SKU multi-pickers, plus "all of store" default), mode selector (Additive vs. Independent Verification), `lockStoreDuringCount` toggle, notes.
- **Session detail page** — at-a-glance dashboard:
  - Status pipeline + current state action button
  - Connected devices panel (live websocket, counter user, last scan timestamp)
  - Live progress bars: cells counted / in scope, total units counted, total $ counted
  - Items Not Counted live panel (count + drill-in list) with bulk zero-out action
  - Variance live panel — banded view (Zero / Low / Material / Extreme), with material+extreme requiring per-row acknowledgement
  - Pre-Update checklist (the `Have You?` gate)
  - Commit button (disabled until checklist complete)
- **Enter Physical Counts (desktop)** — sequential SKU entry pattern shared with `purchasing` and `inventory` Manual Receipt: one active editor at top with SKU lookup + size-grid + UPC-scan input; numbered list of recently committed entries below. `Place On-Hand` and `Place Counts` buttons (p. 137); `Mark this SKU as zero` button (one click → `isZeroFlag = true` entry).
- **Mobile Count Client** (`/m/count`) — minimal mobile web app. Six-digit code entry → session join → camera barcode scan view (or paired bluetooth HID input) → real-time scan log + per-cell running total + offline buffer indicator. Optimised for one-handed phone use; large hit targets; haptic + audio feedback per scan; "switch SKU manually" fallback.
- **CSV Import dialog** — drag-and-drop CSV; preview of detected columns; rejection report inline.
- **Items Not Counted page** — same data as the live panel but full-screen, exportable; bulk zero-out, range filters matching the report toggles (include-zero-on-hand checkbox).
- **Variance Review page** — banded grid with $ totals per band; acknowledgement workflow per material/extreme line; PDF/CSV export reproducing the RICS one-list format.
- **Worksheet generator** (`/inventory/worksheets`) — filter form + output format picker → PDF download. History list of past exports.
- **Conflict Review panel** (shown on session-close in `INDEPENDENT_VERIFICATION` mode or when duplicate-pass risk is detected) — side-by-side view of disagreeing counts, resolution actions: accept device A, accept device B, sum, recount.

## Dependencies

- **inventory** —
  - `getSnapshot(storeId, asOf: Date)` → cell-level on-hand + avg cost frozen at the requested timestamp; called once at session freeze.
  - `getStockLevelsByScope(storeId, scope)` → enumerates all in-scope cells; powers the Items Not Counted list.
  - `applyCountAdjustments(sessionId)` → the moment-of-truth call. Writes `PHYSICAL_ADJUSTMENT` movements for every variance row in one transaction; returns a `ledgerWriteRef`. **This is the only path by which `physical-inventory` mutates inventory.**
  - Subscribes to `StockMovementRecordedEvent` between `frozenAt` and `committedAt` to tag movements `appliedDuringPhysicalCountSessionId = sessionId` for variance arithmetic correctness.
- **products** —
  - `getSku(skuId)`, `resolveUpc(upc)` → scan resolution.
  - `getSizeType(sizeTypeId)` → render the size grid (1-D vs. 2-D, columnDesc/rowDesc, valid columns/rows). Same contract used by `purchasing` and `inventory`.
  - `listSkusInScope(scope)` → for worksheet generation and Items Not Counted.
- **store-ops** —
  - `listStores()`, `getStore(storeId)` → store picker.
  - `getCompanySetting('physicalInventory.*')` → variance band tolerances, conflict window, default lock-during-count, independent-verification N.
  - Holds the optional store-wide advisory lock token consulted by `sales-pos` and `inventory` Manual Receipt when `lockStoreDuringCount = true`.
- **employees** —
  - `getUser(userId)` → counter attribution.
  - `hasPermission(userId, 'physicalInventory.openSession' | 'physicalInventory.commitSession' | 'physicalInventory.acknowledgeMaterialVariance' | 'physicalInventory.cancelSession')`.
- **platform** —
  - Background worker for large CSV imports.
  - Notifications: session opened, session ready for review, session committed, extreme variance flagged.
  - Retention purge of `CountEntry` / `CountSessionSnapshot` after `retentionExpiresAt` (replacing RICS Ch. 8's "Clear Saved Inventory Changes" implication for count files, though counts have no specific Ch. 8 entry).
  - Telemetry channel powering the session-detail live updates (websocket fan-out).
- **sales-pos** —
  - Reads the advisory lock token (when set) and refuses ticket post during the count window. Soft refusal — operator can override with permission `physicalInventory.bypassLock`.

## Contracts exposed

**Outbound (for other modules to consume)**
- `getOpenCountSessions(storeId)` → `[{ sessionId, status, openedAt, frozenAt? }]` — `sales-pos` consults to decide whether to honor the advisory lock.
- `isCountInProgress(storeId)` → `boolean` — convenience wrapper.
- `getSessionMaterialityForReporting(sessionId)` → `{ totalCellsCounted, totalUnitsDelta, totalCostDelta, materialVarianceCount, extremeVarianceCount }` — `sales-reporting` consumes for "shrink by store" rollups.

**Events emitted**
- `CountSessionOpenedEvent { sessionId, storeId, scope }` — `platform` notifies, `sales-pos` evaluates lock.
- `CountSessionFrozenEvent { sessionId, storeId, frozenAt }` — `inventory` starts tagging post-freeze movements.
- `CountSessionReviewReadyEvent { sessionId, totalVarianceCost, materialCount, extremeCount }` — routed to store manager for review.
- `CountSessionCommittedEvent { sessionId, ledgerWriteRef, totalUnitsAdjusted, totalCostAdjusted }` — `sales-reporting` triggers shrink rollup; `accounts-receivable` may include in period close.
- `CountSessionCancelledEvent { sessionId, cancelledBy, reason }` — audit.
- `ExtremeVarianceFlaggedEvent { sessionId, skuId, columnLabel, rowLabel, delta, costDelta }` — CEO notification per Company Setup.

**Events consumed**
- `StockMovementRecordedEvent` (from `inventory`) — between `frozenAt` and `committedAt`, tag with sessionId.
- `SkuDiscontinuedEvent` (from `products`) — abort or warn if a discontinued SKU has open count entries.

## Out of scope for v1

- **Percon PT2000 device driver setup** (Ch. 1 p. 18 — keypad layout, F1/F2/F3/F4 menu, Wedge mode, COM-port configuration, Erase button) — explicitly dropped per `MODULES.md`. Replaced by device-agnostic ingest paths (mobile web, HID, CSV).
- **Get Data from Portable Reader screen** (Ch. 10 p. 138) — no serial-cable transfer flow ships. The CSV import endpoint covers the few legacy devices that may still need to feed batches.
- **Post Data multiplexing on store-number `00`** (Ch. 10 p. 138) — the legacy hack where one device buffer can be posted as Counts / Transfers / Manual Receipts / Manual Returns / PO Receipts based on the embedded store number is dropped. Each surface has its own ingest endpoint.
- **Screen-spool worksheet output** (Ch. 14 p. 186) — already in the registry's "not porting" list; worksheets render as PDF/CSV in-browser.
- **Modem / diskette transfer of count data** (Ch. 13 p. 173 Copy From POS Diskette, p. 177 Copy to POS Diskette) — already in the registry's "not porting" list; the cloud DB is the single store of truth.
- **Manual `Backup your data` step** (Ch. 10 p. 140 "Have You?" item 4) — auto-satisfied by managed Postgres + PITR; surfaced in audit but not as an operator action.
- **Posting counts as "transfers between stores"** (p. 138 Posting transfers) — a stocktake is per-store; cross-store inventory movement is `inventory`'s Manual Transfer surface, not a count session.
- **Posting counts as "manual receipts" or "PO receipts"** (p. 138 Posting manual receipts / PO receipts) — same reason; receipts belong to `inventory` (manual receipt) or `purchasing` (PO receive). The Percon device-buffer overload is a 2007 hardware concession we do not inherit.
- **Per-RICS "process the items in the order they were scanned" semantics for the exception report** — preserved (we still print "previous valid SKU / next valid SKU" anchors), but we don't preserve the raw scan-order file format.
- **Macros / saved keystrokes for count entry** (Ch. 15 p. 205) — generic shortcut layer in `platform` covers the common cases.
- **`RICS.CFG` toggles for physical inventory** (any of them) — settings move to `store-ops` Company Setup.
- **Auto-deletion of "saved physical counts" via Ch. 8** — counts persist in `CountSession` / `CountEntry` until the `platform` retention job purges them based on `CountSession.retentionExpiresAt`. No dedicated Clear menu item.

## Open questions

1. **Snapshot granularity at freeze.** A large multi-store with 100k+ active cells per store will produce a heavy `CountSessionSnapshot.cellsJson` blob. Is the right shape (a) JSON blob keyed by sessionId (current spec), (b) a separate `CountSessionSnapshotCell` table with one row per cell, or (c) a logical snapshot — record the timestamp and reconstruct from the ledger on demand? Recommendation: (b) for queryability + index support; revisit after measuring.
2. **Cell deletion vs. zero count.** RICS treats "no count entered" and "count entered = 0" as opposite truths (p. 137: zero count means *set on-hand to zero*, no entry means *do not change*). Our `isZeroFlag` on `CountEntry` captures this. Confirm the UI surfaces it as a distinct affordance ("Mark zero" button vs. "Enter 0 in cell"), since the operational consequence is large.
3. **Variance band tolerances — per-category or per-store?** Spec puts them in `store-ops` Company Setup as company-wide defaults. Real shrink tolerance varies wildly by category (high-theft footwear ≠ low-theft accessories). Should band thresholds be per-category overrides? If yes, where do they live — `store-ops` taxonomy or `physical-inventory` settings?
4. **Movement during count window — per-store lock or company-wide?** RICS implies a company-wide freeze (p. 136). Multi-store operators almost certainly want per-store granularity. Default: per-store. Confirm.
5. **Independent Verification mode — required N.** What's the right default for `independentVerificationCountN` — 2 (two independent counts must agree) or 3 (majority rules)? RICS doesn't speak to this since it doesn't support the mode.
6. **Conflict resolution authority.** When two counters disagree, who decides — anyone, the session opener, a permission-gated reviewer? Affects who sees the Conflict Review panel and which permissions ship in v1.
7. **Mobile offline buffering — how aggressive?** A phone may lose Wi-Fi mid-count in a back stockroom. Should the mobile client buffer indefinitely (replay on reconnect) or surface a hard error after N minutes? Tradeoff: indefinite buffering risks duplicate scans on flaky reconnect; hard error risks lost counts.
8. **Worksheet pre-fill mode.** RICS prints blank grids (p. 137). Should our PDF optionally pre-fill the system on-hand alongside the blank count column, so the operator can see what to expect? Argument against: nudges confirmation bias. Argument for: helps spot missing inventory before counting. Recommend: opt-in flag, default off.
9. **Cancellation of a partially-counted session.** Does cancelling discard `CountEntry` rows or retain them for audit? Recommend: retain, mark session CANCELLED. Confirm before retention purge logic ships.
10. **Idempotency of `applyCountAdjustments`.** `inventory.applyCountAdjustments(sessionId)` is called at most once per session under normal flow (POSTING → COMMITTED). On retry after a transient failure (POSTING stuck), is the call idempotent on `sessionId`, or do we need a separate `commitAttemptId`? Recommend: idempotent on `sessionId`; `inventory` checks for existing `PHYSICAL_ADJUSTMENT` movements with `sourceDocumentId = sessionId` before writing.
11. **Counted = snapshot + post-freeze movements + delta?** The variance arithmetic in the modernization decision assumes the operator wants `countedQty` to *become* the new on-hand at commit time, accounting for any sales / receipts that landed during the count window. Confirm this is the desired interpretation — alternative is "snapshot truth wins, post-freeze movements are out of scope for the count and stay applied separately".
12. **Audit retention horizon.** RICS doesn't constrain how long count history is kept (Ch. 8 has no entry for it). Default proposal: 7 years for `CountSession` (matches retail audit norms), 90 days for raw `CountEntry` rows once the session is committed (the variance roll-up is the long-term record). Confirm with finance / compliance.
