# Module: products

**Goal**

`products` is the catalog — the canonical, rich record of every item Zack's Retail can sell, buy, or count. It owns the SKU identity (code, description, vendor, taxonomy), the pricing model (current price + scheduled changes + bulk discounts), the size grid (size types, columns/rows, NRF codes), the media (pictures, stock labels), and the UPC cross-reference. Every other module — `inventory`, `purchasing`, `sales-pos`, `sales-reporting`, `crm` — reads from this module. Primary user value: a merchandiser or admin can add, reprice, and retire items without coordinating with engineering.

## RICS features covered

**SKU core** (RICS Ch. 11 and Ch. 4)
- **p. 154, SKUs – File Setup** — up to 15-char alphanumeric SKU code, required Vendor + Category + Description, optional Vendor SKU, Color Code (EDI), Size Type, Group, Style/Color (one field), Location, Comment, Season, Keywords, Coupon SKU flag, Picture File Name. SKU code **cannot be changed** once the SKU has been sold, ordered, or received — the merchandiser must use Discontinue SKUs instead.
- **p. 155, SKU Pricing** — four price slots: List (optional, discount stores), Retail, Markdown 1, Markdown 2. Exactly one is flagged "current". G.P.% is derived from current cost. Changing current cost does **not** update average cost.
- **p. 155, Perks (PMs / spiffs)** — dollar amount attached to the SKU that auto-posts to the salesperson on sale.
- **p. 156, Label Type** — per-SKU label shape (Regular, Hang Tag, Jewelry, Small, Other, or "No Labels").
- **p. 156, Oversize Pricing** — column threshold + extra dollar amount (e.g., "add $2.00 to sizes 10½ and larger").
- **p. 157, SKUs – Picture Configuration** — one picture per SKU, JPG/BMP/GIF, served from a `RICSPICS` directory, with per-screen show/hide toggles via `RICS.CFG`.
- **p. 69, Discontinue SKUs** — merge "item being discontinued" into "item retaining information"; rolls up on-hand, on-order, sales qty, sales $, and rewrites open POs. Model quantities transfer only if the target has no activity. Same Size Type required (exception: can discontinue into a zero-size-type SKU, losing size granularity).

**Taxonomy** (Ch. 11)
- **p. 144, Sector** — 1–99, groups a contiguous range of departments. *See Modernization: dropped from v1.*
- **p. 144, Department** — 1–99, groups contiguous categories. Many reports subtotal by dept.
- **p. 145, Category** — 1–999, required on every SKU.
- **p. 145, Group** — up to 3 chars alphanumeric. Optional, many-to-one on SKU. Used for bulk price discounts and cross-category reporting.
- **p. 165, Keywords** — 1–10 chars per keyword, up to 60 chars of keywords per SKU (space-separated in RICS). Many-to-many between SKU and Keyword.
- **p. 166, Return Codes** — 1–99 code, description, `trackable` flag for returned-sales reporting.
- **p. 167, Promotion Codes** — 6-char code, description, pieces distributed, cost — used by promotion analysis.

**Size Types + NRF Codes** (Ch. 11)
- **p. 147, Size Types** — up to 54 columns × 27 rows. Column description 5 chars (e.g., `SIZE`, `WAIST`), column label 3 chars (`060`, `100`). Row description 5 chars (`WIDTH`, `LNGTH`), row label 2 chars (`N`, `M`, `WW`). SKUs without sizes leave Size Type blank/0.
- **p. 148, NRF Codes** — 5-digit industry codes, mapped per Size Type cell. Needed for UPC cross-reference diskettes, EDI, and Direct Sale.
- **pp. 149–152, Footwear NRF Table** — industry-standard cross-reference: Table type 5, sizes 0–18½ × widths 5A through 5E, plus no-width and S/M/ML/L/XL/XX variants.
- **p. 152, Clothing NRF Table** — alpha sizes XXS–6XL, tall variants, numeric 2–40, toddler 1T–5T.

**Vendors** (Ch. 11)
- **p. 153, Vendors – File Setup** — Vendor # (RICS convention: first 4 letters of name), Name (internal), Mail Name (prints on POs), Fax, Email, Contact, Comment, Terms, Ship Via, EDI Qualifier + ID (hidden unless EDI), per-store Account Number.

**Pricing operations** (Ch. 4)
- **p. 67, Enter Price Changes** — per-SKU change to Retail / Markdown 1 / Markdown 2, effective date (today or future), optional auto-revert date (sale window). Multiple future changes can stack on one SKU.
- **p. 67, Change Average Cost** — manual override of `avg_cost` per (SKU × Store). Avg cost drives reporting GP; it is independent of current cost.
- **p. 73, Enter Price Discounts** — bulk markdown by criteria (SKU / Category / Vendor / Season / Style-Color / Group / Keyword). Decrease by percentage, fixed amount, or "reset original retail". Effective + optional revert date. Force price-ending (e.g., `.99`), rounding method (nearest / up / down), destination slot (current or first available markdown), filters (original-retail-only, compute-from-original, change-perks).

**Labels & UPC** (Ch. 5)
- **p. 82, Enter Stock Labels** — five generation modes (all SKUs × on-hand; selected SKU × on-hand; selected SKU user-entered; PO SKUs × on-PO; display labels × SKU/Store). Generation does not change inventory counts.
- **p. 83, Print Stock Labels** — label-code filter, indent, print-date code, price format (8 variants), print UPC checkbox, restore-last-batch, delete unprinted.
- **p. 84, Enter UPC Cross Reference** — manual mapping: UPC → (SKU, Column, Row).
- **p. 84 + p. 153, Import Vendor UPCs (GMAIC)** — 160-byte fixed-width record + CRLF. Fields: Qualifier (pos 1, 2 chars), Vendor ID (pos 3, 10 chars), UPC (pos 21, 12 chars), Product ID / Vendor SKU (pos 33, 20 chars), NRF Size Code (pos 85, 5 chars). Deduplicates on Qualifier + Vendor ID when two vendors share a Vendor SKU. Exception report for missing NRF codes.
- **p. 85, Print UPC Cross Reference** — list vendor UPCs + user-generated UPCs, optional SKUs-with-no-vendor-UPC filter.
- **p. 86, Generate UPC Numbers** — bulk-create a user UPC for every (SKU × Column × Row) so POS terminals can print labels without waiting for vendor UPCs.

## Modernization decisions

- **Sectors (p. 144) — DEFERRED, not dropped (Phase 1 update).** Original v1 plan was to drop Sectors; Phase 1 data discovery revealed 9 active sector rows the business uses for reporting rollups. Phase 1 mirrors Access including full Sector CRUD. The original "drop Sectors" modernization decision re-enters Phase 2+ as "revisit — either migrate as a taxonomy layer or replace with report-time rollups." See `docs/superpowers/specs/2026-04-18-products-phase1-design.md` Step 2 implementation log.
- **Future-dated price changes + discounts become scheduled jobs in `platform`.** RICS's "prompt the user on next login to apply today's changes" (p. 67, p. 73) is replaced by a background worker that fires at store-open. This module exposes the schedule; `platform` runs the worker. Users also gain an admin view of upcoming changes.
- **Average cost is owned here, updated by `inventory`.** Avg cost is a property of (SKU × Store). On receive/transfer, `inventory` calls `products.updateAverageCost(skuId, storeId, newAvg)`. The manual-override UI (p. 67) lives in `products`. Reporting GP% reads avg cost from here.
- **Pictures move to object storage.** The `RICSPICS` directory + `RICS.CFG ShowPictures` toggle (p. 157) → images in an S3-compatible bucket, served via CDN. Per-screen show/hide becomes a user preference in `platform` settings, not a config file.
- **Label printing moves to the browser.** No printer-driver setup, no Zebra/Eltron toggle, no test-pattern alignment button — browser renders labels via CSS `@page` + SVG barcodes. Label-Type stays as a SKU attribute so label templates can be filtered.
- **NRF tables are read-only seed data, not user-editable screens.** Footwear (pp. 149–152) and Clothing (p. 152) tables are industry standard. We ship them as seed data and expose a picker when editing a Size Type cell. Drops the RICS NRF-code editor grid (p. 148).
- **GMAIC vendor UPC import stays first-class but ingests via HTTP upload.** Accept `.txt` and `.zip` (unzipped server-side). Drops RICS's `.EXE` self-extractor support (p. 84) and diskette pathing (`A:`) — modern vendors ship TXT or ZIP, and everything is HTTPS.
- **SKU code renaming is hard-forbidden post-activity** (matches RICS p. 154). Enforce at the API; the UI surfaces Discontinue SKUs as the only path.
- **Keywords become a proper many-to-many join.** RICS's 60-char-per-SKU cap (p. 165) disappears; keyword-per-string length stays as a UX guideline only.
- **Style/Color stays one field** (RICS p. 155 policy: "style OR color, not both"), but it's indexed case-normalized. Existing scaffolding (`StyleColorLink` in `apps/api/src/models/sku.ts`) stays.
- **Change-utilities collapsed.** Change Salespeople / Size Columns / Size Types / Categories / Vendors / Seasons / Groups / Keywords (Ch. 15 renumber tools) are merged into ordinary admin edits. Renumbering a foreign key is a DB-level concern, not a user feature.

## Data model sketch

```prisma
model Sku {
  id            String   @id @default(uuid())
  code          String   @unique  // RICS SKU#, 15 chars max (p. 154)
  description   String
  vendorId      String
  categoryId   Int
  departmentId  Int?                // derived from category but denormalized
  sizeTypeId    Int?                // null = quantity-only SKU (p. 154)
  groupCode     String?             // 3 chars (p. 145)
  seasonCode    String?             // 1 char (p. 218 Season Setup)
  styleColor    String?             // one field, style OR color (p. 155)
  location      String?             // warehouse (p. 155)
  labelTypeId   Int                 // FK LabelType; "No Labels" is a real row
  isCoupon      Boolean  @default(false)  // Coupon SKU flag (p. 155)
  comment       String?
  discontinuedInto String?          // FK to surviving Sku after merge (p. 69)
  createdAt     DateTime @default(now())
  // ... relations
}

model SkuPrice {
  skuId       String
  storeId     Int?         // null = all stores (multi-price mode)
  slot        PriceSlot    // LIST | RETAIL | MARKDOWN1 | MARKDOWN2
  amount      Decimal
  isCurrent   Boolean      // exactly one row per (skuId, storeId) has isCurrent=true
  @@id([skuId, storeId, slot])
}

model SkuOversizePricing {         // p. 156
  skuId             String
  columnThreshold   String         // e.g., "105" for size 10½
  extraAmount       Decimal
  @@id([skuId])
}

model SkuPerk {                    // p. 155
  skuId   String  @id
  amount  Decimal
}

model SkuPicture {                 // p. 157 modernized
  id          String   @id @default(uuid())
  skuId       String
  storageUrl  String   // S3 URL
  isPrimary   Boolean
  position    Int      // for gallery ordering (see Open Questions)
}

model SkuKeyword {                 // p. 165, M:N
  skuId     String
  keywordId Int
  @@id([skuId, keywordId])
}

model SkuUpc {                     // pp. 84, 86
  upc       String   @id           // 12 chars
  skuId     String
  columnLbl String?                // null for size-less SKUs
  rowLbl    String?
  source    UpcSource              // VENDOR_GMAIC | USER_GENERATED | MANUAL
  vendorQualifier String?          // for GMAIC disambiguation (p. 153)
  vendorId  String?
}

model SkuAverageCost {             // p. 67; per (SKU × Store)
  skuId     String
  storeId   Int
  avgCost   Decimal
  updatedAt DateTime
  @@id([skuId, storeId])
}

model Vendor {                     // p. 153
  id              String  @id
  name            String
  mailName        String
  fax             String?
  email           String?
  contact         String?
  comment         String?
  terms           String?
  shipVia         String?
  ediQualifier    String?
  ediId           String?
}

model VendorStoreAccount {          // p. 153 per-store account #
  vendorId   String
  storeId    Int
  accountNo  String
  @@id([vendorId, storeId])
}

model Category {   id Int @id  name String  departmentId Int }
model Department { id Int @id  name String }               // no Sector (dropped)
model Group {      code String @id  name String }
model SizeType {
  id                  Int     @id
  description         String
  columnDescription   String
  rowDescription      String
}
model SizeTypeColumn { sizeTypeId Int  label String  position Int  @@id([sizeTypeId, label]) }
model SizeTypeRow    { sizeTypeId Int  label String  position Int  @@id([sizeTypeId, label]) }
model NrfCode {                   // seed-only, read-only (pp. 148–152)
  code        String  @id
  tableType   Int
  size        String
  width       String?
  description String?
}
model Keyword      { id Int @id  code String @unique  description String }
model ReturnCode   { code Int @id  description String  isTrackable Boolean }
model PromotionCode { code String @id  description String  pieces Int?  cost Decimal? }
model LabelType    { id Int @id  name String  templateKey String? }

model ScheduledPriceChange {        // p. 67
  id            String   @id @default(uuid())
  skuId         String
  storeId       Int?
  targetSlot    PriceSlot
  amount        Decimal
  effectiveAt   DateTime
  revertAt      DateTime?
  status        ScheduleStatus      // PENDING | APPLIED | REVERTED | CANCELLED
}

model ScheduledPriceDiscount {      // p. 73
  id            String   @id @default(uuid())
  criteria      Json                // serialized selection criteria
  decreaseBy    DiscountMethod      // PERCENT | AMOUNT | RESET_TO_ORIGINAL
  decreaseValue Decimal?
  forceCents    String?             // e.g., "99" or "-1" for "round to penny"
  roundingMethod Rounding            // NEAREST | UP | DOWN
  effectiveAt   DateTime
  revertAt      DateTime?
  destSlot      PriceSlot
  filters       Json                // { origRetailOnly, computeFromOriginal, changePerks }
  status        ScheduleStatus
  previewSnapshot Json?             // captured preview when Preview is clicked
}

model DiscontinuedSkuMerge {        // audit log for p. 69
  id            String   @id @default(uuid())
  fromSkuCode   String
  intoSkuId     String
  mergedAt      DateTime
  mergedByUserId String
}
```

## API surface

**SKU**
- `GET /api/v1/skus` — list + criteria filter (vendor/category/season/style-color/group/keyword)
- `POST /api/v1/skus` — create
- `GET /api/v1/skus/:id` — full detail incl. sizes, UPCs, pictures, perks, oversize
- `PATCH /api/v1/skus/:id` — edit (rejects code change if activity exists)
- `POST /api/v1/skus/:id/discontinue` — merge into target SKU (p. 69 wizard)
- `GET /api/v1/skus/by-code/:code` — lookup
- `GET /api/v1/skus/resolve-upc/:upc` — UPC → (SKU, col, row)

**Pricing**
- `POST /api/v1/skus/:id/price-changes` — schedule a change (p. 67)
- `GET /api/v1/price-changes?upcoming=true` — pending changes view
- `DELETE /api/v1/price-changes/:id` — cancel pending
- `POST /api/v1/price-discounts/preview` — preview bulk discount (p. 73)
- `POST /api/v1/price-discounts` — schedule bulk discount
- `GET /api/v1/skus/:id/average-cost?storeId=` — current avg cost
- `PUT /api/v1/skus/:id/average-cost` — manual override (p. 67)

**Taxonomy**
- `GET|POST|PATCH /api/v1/categories` + `/departments` + `/groups` + `/keywords` + `/return-codes` + `/promotion-codes`
- `GET|POST|PATCH /api/v1/size-types` + `/size-types/:id/columns` + `/rows`
- `GET /api/v1/nrf-codes?table=5&size=9.5&width=M` — read-only NRF lookup

**Vendor**
- `GET|POST|PATCH /api/v1/vendors`
- `GET /api/v1/vendors/:id/store-accounts`
- `PUT /api/v1/vendors/:id/store-accounts/:storeId`

**Labels / UPC**
- `POST /api/v1/labels/queue` — enqueue from one of five generation modes (p. 82)
- `GET /api/v1/labels/queue` — pending-print list
- `DELETE /api/v1/labels/queue/:id` — remove unprinted
- `POST /api/v1/labels/queue/last-batch/restore` — re-queue last batch
- `GET /api/v1/labels/print?ids=...` — returns renderable label payload (server picks template by LabelType)
- `POST /api/v1/upcs` — manual cross-ref entry (p. 84)
- `POST /api/v1/upcs/import-gmaic` — multipart upload, txt or zip (p. 84)
- `POST /api/v1/upcs/generate-for-all` — bulk generate (p. 86)

## UI surface

- **SKU list** (`/products/skus`) — filter by vendor/category/season/keyword; show price + on-hand (via `inventory` contract); click for detail
- **SKU detail / edit** — tabs: Core / Pricing / Sizes & UPCs / Pictures / Perks / Discontinue
- **Vendor list / edit** — incl. per-store account numbers
- **Taxonomy admin** — Categories, Departments, Groups, Keywords, Return Codes, Promotion Codes as sibling admin pages
- **Size Type grid editor** — spreadsheet-style with NRF picker when clicking a cell
- **Price Change form** — per-SKU, effective + optional revert, target slot
- **Bulk Price Discount form** — criteria + preview panel showing affected SKUs and their new prices (p. 73 Preview button)
- **Scheduled Changes dashboard** — upcoming / applied / reverted / cancelled
- **Discontinue SKU wizard** — source + target + conflict review + confirm
- **Stock Label queue** — pending-print SKUs; bulk select; "print batch" action
- **UPC Import wizard** — upload GMAIC file, show exception report, commit
- **Product Inquiry** — see dedicated section below (RICS-named "Inventory Inquiry"; this module owns the page, `inventory` owns the data).

## Product Inquiry (the RICS "Inventory Inquiry" screen)

**Ownership note.** In RICS this screen is called **Inventory Inquiry** and is catalogued in Chapter 4 (Stock Maintenance). Structurally it is a single-SKU, all-context view — identity + pricing + sizes + on-hand + on-order + model + shortage + MTD/STD/YTD sales + GP / ROI / Turns + open POs + 8-week trend — and its spine is the product record. We keep RICS's name in the UI for operator familiarity, but ownership of the **page** sits with `products` because every field in the header and every action button resolves through SKU identity. `inventory` still owns the stock-side **data contracts** (see `getOnHand`, `getOnHandGrid`, `getReplenishmentGrid`, `getMovementsForSku` in [docs/modules/inventory.md](inventory.md) § Contracts exposed), and `purchasing` / `sales-reporting` each own their slice as noted below. **This section is the page spec; another module's agent works the contracts.**

### RICS features covered

- **Ch. 4 p. 70, Inventory Inquiry** — admin entry point. The screen shows, per Store, a size grid of on-hand, on-order current (At-Once), on-order future, model, shortage (model − on-hand), MTD / STD / YTD sales (qty). Header shows SKU Description, Category, Vendor, Vendor SKU, Style/Color, Size Type, Last Received. Top-right panel: Retail, Markdown 1, Markdown 2, Avg Cost, Current Cost, List Price. Middle band: Qty / Net / Markdown / Profit for Week / Month / Season / Year.
- **Ch. 2 p. 53, Inventory Inquiry (from Sales)** — sales-clerk entry point, same screen, same payload. Reached from the register. The RICS manual explicitly states the two menu entries drop into one inquiry.
- **View-mode function keys (p. 70)** — F2 On Hand, F3 On Order Current, F4 On Order Future, F5 Model, F6 Short, F7 MTD Sales, F8 STD Sales, F9 YTD Sales, F11 Single Column, F12 All Stores On Hand, Shift+F1 All Stores 1 Row, Shift+F2 All Stores Summary, Shift+F3 Max, Shift+F4 Reorder. Zack's Retail surfaces these as a view-mode selector (tabs + keyboard shortcuts), not load-bearing F-keys.
- **Action buttons (p. 70–71)**:
  - `[UPCs]` — all UPCs for the SKU (served by `products.SkuUpc`, this module).
  - `[POs]` — outstanding POs for the SKU (served by `purchasing.getOpenPoLines(skuId)`).
  - `[Trend]` — Eight-Week Trending (served by `sales-reporting.getEightWeekTrend(skuId)`).
  - `[Info]` — Season, Label Code, Group Code, Date 1st Received, Date Last Markdown, Perks, Comments, last-12-months sales qty + $, plus SKU/Store GP% · ROI · TURNS at MTD/STD/YTD.
  - `[Detail]` — opens Inventory Change Detail for the current SKU (served by `inventory.getMovementsForSku(skuId)`; rendered as a side panel or separate route).
- **Navigation — `[Prev]` / `[Next]`** — step through SKUs, optionally in store-then-SKU order (RICS p. 70).

### Modernization decisions for the page

- **Single route, one page, tab-based view modes.** `/products/inquiry/:skuCode` (URL lives under `/products/*` going forward; the current `/inventory/inquiry` route is kept as a redirect until all callers update).
- **Store filter is URL state, not modal.** The sales-path "Ch. 2 p. 53" flow launches with the current register's store pre-selected via `?storeId=<id>`.
- **Prev/Next uses the URL's filter set** — whatever criteria (vendor, category, season) is in the query string defines the cursor sequence. This replaces RICS's global "process in store order" setting (p. 70) with a per-view sort param.
- **`[Trend]`, `[POs]`, `[Info]`, `[Detail]`, `[UPCs]` are tabs or side-drawers on the page** rather than separate screens, so the operator never loses SKU context.
- **F-key shortcuts are supported but not required.** The same state machine drives clicks and keystrokes.
- **The "All Stores" modes (F12, Shift+F1, Shift+F2) render as a pivoted grid** with stores on the Y-axis and sizes on the X-axis; Shift+F3 / Shift+F4 (Max / Reorder) are just additional view-mode options alongside the sales / stock numbers.

### Page surface

- **URL**: `/products/inquiry/:skuCode` (canonical). Also reachable from:
  - SKU list row click (`/products/skus`)
  - `[Inquiry]` action on a PO line (`purchasing`)
  - `[Lookup]` action on the POS register (Ch. 2 p. 53 — sales-pos launches the page with the register's store pre-selected).
- **Query params**: `storeId`, `mode` (one of `ON_HAND | ON_ORDER_CURRENT | ON_ORDER_FUTURE | MODEL | SHORT | MTD_SALES | STD_SALES | YTD_SALES | SINGLE_COLUMN | ALL_STORES_ON_HAND | ALL_STORES_ONE_ROW | ALL_STORES_SUMMARY | MAX | REORDER | COMBINED`), `row` (required for SINGLE_COLUMN / ALL_STORES_ONE_ROW / ALL_STORES_SUMMARY for 2-D size types).
- **Page regions** (top to bottom):
  1. **Header** — SKU code + description + Category + Vendor + Vendor SKU + Style/Color + Size Type + Last Received. Prev / Next cursor buttons at the top-right.
  2. **Pricing panel** — Retail / Markdown 1 / Markdown 2 / Avg Cost / Current Cost / List Price. Highlights the current-price slot.
  3. **Sales roll-up strip** — Qty / Net / Markdown / Profit for Week / Month / Season / Year.
  4. **View-mode selector** — tab row + keyboard-shortcut hints. Default view = `COMBINED` (new, shows on-hand + on-order + model + shortage in one grid).
  5. **Size grid** — renders per the selected mode; rows/columns come from `products.getSizeType(sizeTypeId)`.
  6. **Action drawers / tabs** — UPCs, POs, Trend, Info, Detail (Change Detail).

### Data the page reads (all via outbound contracts, owned elsewhere)

- `products.getSku(skuCode)` → header + pricing panel + size type reference *(this module)*
- `products.getCurrentPrice(skuId, storeId)` → current slot highlight *(this module)*
- `products.listSkuUpcs(skuId)` → `[UPCs]` tab *(this module)*
- `inventory.getOnHandGrid(skuId, storeId)` / `getOnHandAllStores(skuId)` → size grids in all On-Hand / All-Stores modes *(`inventory`)*
- `inventory.getReplenishmentGrid(skuId, storeId)` → Model / Max / Reorder view modes *(`inventory`)*
- `inventory.getMovementsForSku(skuId, { storeId?, dateRange? })` → `[Detail]` tab *(`inventory`)*
- `inventory.getLastReceivedAt(skuId, storeId)` → header Last Received *(`inventory`)*
- `purchasing.getOnOrder(skuId, storeId, col, row, classification)` → On-Order Current / On-Order Future grids *(`purchasing`)*
- `purchasing.getOpenPoLines(skuId)` → `[POs]` tab *(`purchasing`)*
- `sales-reporting.getSkuSalesRollups(skuId, storeId)` → sales roll-up strip (Week / Month / Season / Year × Qty / Net / Markdown / Profit) *(`sales-reporting`)*
- `sales-reporting.getSizeGridSales(skuId, storeId, period)` → MTD / STD / YTD size grid modes *(`sales-reporting`)*
- `sales-reporting.getEightWeekTrend(skuId, storeId)` → `[Trend]` tab *(`sales-reporting`)*
- `sales-reporting.getSkuPerformance(skuId, storeId)` → `[Info]` tab (GP%, ROI, Turns at MTD/STD/YTD + last-12-months qty + $) *(`sales-reporting`)*

### What this module owns vs. what it just composes

- **Owns**: the page route, the component tree, the header + pricing panel + action drawers, the view-mode state machine, keyboard handlers, the Prev/Next cursor, UPC rendering, pricing-slot highlighting, URL state.
- **Composes (does not own)**: the size grid renderer (shared UI primitive — should live in `apps/web/src/components/size-grid/`, used by this page, Find by Size, Replenishment Targets editor, Manual Receipts, etc.); every data fetch above.
- **Does not own**: on-hand / on-order / replenishment reads (→ `inventory` + `purchasing`), movement history (→ `inventory`), sales analytics (→ `sales-reporting`).

### Dispatch note

The owning agent for the page itself is `products-dev`. When implementing:
- Keep all data reads behind the module contracts named above. Do not inline SQL / Prisma calls that bypass the contracts — if a needed contract is missing, raise it to the owning module first.
- If the contracts don't yet exist as concrete endpoints, the first deliverable is to stub them on the frontend with typed hooks + TanStack Query keys that will later be wired to real endpoints. This keeps the page owned by `products-dev` and the backend concerns ownable by `inventory`-maintainer / `purchasing`-maintainer / `sales-reporting`-maintainer.
- The current Phase-1 RICS adapter (`apps/api/src/routes/ricsInventoryRoutes.ts` via `useRicsInventory` hooks) already serves a subset of this page. Phase-1 work can light up tabs against those read paths; Phase-2 work replaces them with the native contracts.

### Phase 1 — deferred items

For the canonical list of view modes, action tabs, and features that v1 stubs (plus the cross-module contract each one is waiting on), see the design doc:

[`docs/superpowers/specs/2026-04-19-inventory-inquiry-design.md` § Deferred / waiting on](../superpowers/specs/2026-04-19-inventory-inquiry-design.md#deferred--waiting-on).

## Dependencies

- **`inventory`** — reads on-hand / sales totals for the SKU detail screen; calls into `products.updateAverageCost()` on receive/transfer
- **`store-ops`** — Stores list for per-store pricing and avg cost; Season Setup; Sales Tax Override keys by Category
- **`platform`** — background worker applies scheduled price changes and discounts; object storage for pictures; EDI transport for GMAIC uploads; retention purges for superseded scheduled changes
- **`employees`** — Perks post from SKU to salesperson at sale time via a shared contract

## Contracts exposed

- `getSku(skuCode | skuId)` → full SKU record
- `resolveUpc(upc)` → `{ skuId, columnLabel, rowLabel }`
- `updateAverageCost(skuId, storeId, newAvg)` — idempotent, called by `inventory`
- `getCurrentPrice(skuId, storeId, effectiveDate)` — resolves current slot + any scheduled change in effect
- `listSkusByCriteria(criteria)` — shared selection primitive (used by `sales-reporting`, `inventory` bulk ops, and this module's discount flow)
- **Events**:
  - `SkuDiscontinuedEvent { fromSkuCode, intoSkuId }` — `inventory` and `purchasing` subscribe to remap open orders
  - `PriceChangeAppliedEvent { skuId, storeId, newSlot, newAmount, effectiveAt }` — `sales-reporting` subscribes to warm any current-price caches
  - `PriceDiscountAppliedEvent { scheduleId, affectedSkuIds[] }` — `sales-reporting` + storefront cache invalidation

## Out of scope for v1

- **Sectors (p. 144)** — reporting grouping of departments; v1 handles this at report time via ad-hoc filters.
- **Per-store SKU price rows** (p. 74 "prices at different stores", RICS.CFG-flagged) — ship single-tier pricing first; revisit on customer ask.
- **Legacy EDI channels — Shoe & Sport Talk and Direct Sale** (referenced at p. 154) — v1 supports SPS Commerce GMAIC only.
- **Printer-driver setup screens (p. 82)** — browser handles printing; no Zebra/Eltron selector, no dot-matrix alignment.
- **Ch. 15 renumber utilities** (Change Salespeople / Size Columns / Size Types / Categories / Vendors / Seasons / Groups / Keywords) — collapsed into ordinary admin edit flows.
- **Print Sector File, Print Category File, Print Group File, etc. (Ch. 12)** — these are legacy "dump the file contents" screens; replaced by the list views with CSV export.

## Data findings reconciliation

Source: [docs/rics-db-schema.md](../rics-db-schema.md), generated 2026-04-17 by `pnpm --filter @benlow-rics/api rics:discover` against the live `Rics Databases/` MDBs. Key observations relevant to this spec:

- **RIINVMAS has two tables**, not one: `InventoryMaster` (the 31-col SKU core — SKU, VendorSKU, Category, Vendor, SizeType, Desc, StyleColor, Season, Location, ListPrice/RetailPrice/MarkDownPrice1/2, CurrentPrice selector, CurrentCost, OverSizeColumn/Amount, Perks, Manufacturer, LabelCode, ColorCode, Comment, GroupCode, KeyWords, PictureFileName, Coupon, LastPriceChange, Status, DateLastChanged, OrderMultiple, OrderUOM) and `InvCatalog` — a web-ish overlay with SKU, LongColor, BoldDesc, ParaDesc, CatalogSKU, 5× BulletText, 2× PictureName, SizeText, CfgFileName, WebFileName, and 5× Categories slots. **RICS already has a "web overlay" concept** that substantially overlaps with the Postgres `ProductContent` model.
- **Keywords are a single space-separated WCHAR field** on `InventoryMaster.KeyWords` (e.g., `'IBL ZB C1911 2D50'`). The standalone `Keyword` table in RIGROUP caps each keyword at 10 chars.
- **Sectors are populated** (9 rows in RIDEPT.Sectors) — the business actively uses them. The v1 "drop" decision was reversed in Phase 1 Step 2 (2026-04-18); see the Modernization decisions section above. Full CRUD lives in `SectorRepository`.
- **NRMACodes table is empty** — this customer doesn't use NRF codes. NRF implementation can be deferred to v2 without losing anything real.
- **SKUs can start with `|`** (e.g., `|DMTDU1BN`). Semantics unclear — likely a legacy archival/sort marker. New open question below.
- **Manufacturer is separate from Vendor** on `InventoryMaster.Manufacturer`, with a matching `Manu Code` / `Manu Name` pair on `Vendor Master`. The spec conflates them; the data distinguishes.
- **`OrderMultiple` + `OrderUOM`** on `InventoryMaster` — purchasing-related fields on the SKU row. Should be exposed here for `purchasing` to read.
- **Picture files live at `C:\RICSWIN\ricspics`** (outside the repo; confirmed by user 2026-04-17). The `InventoryMaster.PictureFileName` and `InvCatalog.PictureName_01/02` / `WebFileName` columns are filenames relative to that directory. For v1 the adapter should serve them via a static-file route (e.g. `/rics-images/*`) with the source directory behind a `RICS_PICTURES_DIR` env var defaulting to `C:\RICSWIN\ricspics`. Migration to S3-style object storage (see `## Modernization decisions`) pulls from this same directory.
- **Vendor Master is much richer than the spec**: 22 cols including full address (Addr1/Addr2/City/State/Zip/Phone), Contact, ShipInst, Manu Code/Name, Qualifier ID/Code, ColorCode flag (gates the SKU form's Color Code field per p. 154), a 2 GB `LongComment` memo, and an EMail field.
- **UPCs are decomposed** into Prefix + Number + Check Digit in `RIUPC.UPC Cross Reference`, not a single 12-char string. The adapter will concatenate on read.
- **Inventory Quantities use a wide-column "segment" pattern** (`Store + Row + Segment + OnHand_01..18 + CurrentOnOrder_01..18`) — 18 size cells per row, with additional segment rows for size types exceeding 18 columns. Same pattern in RILABLS and RICASEPK. Worth normalizing in the Postgres target.

## Open questions (answered where the data settles them)

1. **Per-store average cost vs. per-SKU?** **UNRESOLVED.** `InventoryMaster.CurrentCost` is a single value (not per-store), but that's replacement cost, not average cost. Manual p. 67 says avg cost is calculated per (SKU × Store). The data doesn't expose where it's stored — possibly computed on read from RIINVHIS. Keep the spec's (SKU × Store) model until a future discovery pass into RIINVHIS proves or disproves it.
2. **Scheduled price change scope — per-store or system-wide?** **Per-store, confirmed.** `RIFUTURE.Store SMALLINT` is populated (sample shows stores 1 and 12 receiving the same change). Keep the `storeId` column on `ScheduledPriceChange` as non-null.
3. **Picture model: one per SKU or gallery?** **Gallery (3 slots minimum).** RICS stores up to 3 filenames per SKU: `InventoryMaster.PictureFileName` + `InvCatalog.PictureName_01` + `PictureName_02`, plus a `WebFileName`. Adopt the gallery `SkuPicture` model already in the sketch; migrate all 3–4 legacy slots into it.
4. **Label Type list — fixed or user-defined?** **Fixed.** `InventoryMaster.LabelCode` is a single character (sample: `'H'`), which maps 1:1 to the 5 fixed label types in the manual. Ship as seed data; defer "user-defined label types" to v2.
5. **Per-size label queue representation.** **Flatten (don't mirror the wide-column shape).** RICS stores `RILABLS.Labels` as SKU + Row + Segment + Counts_01..18 (one row per SKU/Row). In Postgres we flatten to `(sku_id, column, row, quantity)` per cell — storage cost is negligible and query shape is far simpler. Migration unpacks segments.
6. **Keyword length cap.** **Keep 10-char cap** as a DB constraint. Confirmed by `RIGROUP.Keywords.Keyword VARCHAR(10)`.
7. **Hard-delete of unused SKUs.** **Allow if zero activity, else force Discontinue.** Matches RICS p. 156 behavior. Implement as an API guard on `DELETE /api/v1/skus/:id` that checks for sales, POs, and inventory history before allowing delete.

### New open questions (raised by the data)

8. **What does a leading `|` on a SKU code mean?** Observed in the wild (`|DMTDU1BN`). Likely a discontinued or archival marker. Needs to be asked of the merchandise team before we either carry the convention forward or strip it during migration.
9. **Migrate `InvCatalog` into `ProductContent`, or read it through?** `InvCatalog` already carries bullet text, bold/para descriptions, two picture names, five category slots, and a web filename — the "web overlay" RICS always had. Options: (a) migrate `InvCatalog` fields into `ProductContent` at cutover, (b) keep RICS as the read source for those fields via the adapter and only put NEW web fields (SEO slug, gallery beyond slot 2) in `ProductContent`, (c) both (dual-write during transition). Decide before we finalize the Postgres schema for this module.
10. **Should Manufacturer be a first-class entity?** Data has `InventoryMaster.Manufacturer` + `Vendor Master.Manu Code` / `Manu Name`. Either model a separate `Manufacturer` entity and point both Vendor and SKU at it, or keep Manufacturer as a string on SKU and a denormalized code on Vendor (matches RICS).
11. **Where do `OrderMultiple` + `OrderUOM` live in Zack's Retail?** RICS puts them on the SKU row. Natural home in Zack's Retail is a `SkuOrderingPolicy` sub-record under `products` (exposed to `purchasing` via contract). Confirm before implementation.
12. **~~Revisit the v1 decision to drop Sectors.~~ RESOLVED 2026-04-18 (Phase 1 Step 2).** Option (a) chosen: Sectors are a first-class taxonomy entity with full CRUD in the Phase 1 products module. The Modernization decisions section above records the reversal; the Phase 2+ question of whether to keep them once modern report-time grouping lands is tracked separately in the Step 2 implementation log.
