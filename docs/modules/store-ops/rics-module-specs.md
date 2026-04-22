# Module: store-ops

**Goal**

`store-ops` is the **company and store configuration layer** — the slowly-changing reference data that describes *the business* rather than *the inventory moving through it*. It owns stores (identity, addresses, contact info, email, phone, bill-to addresses, local overrides), sectors (the department-grouping taxonomy above `products.department`), tender types (as catalog entries, not as captured payments), sales tax rates and category-level tax overrides, case packs (size-type pre-set quantities), payout categories, and the company-wide preferences surfaced in RICS Ch. 17 Company Setup (fiscal year-end month, report sort keys, manual-transfer journal pricing, PO print options, auto-label generation, OTB entry method default, user-defined transaction type 2). Primary user value: every other module in Zack's Retail pulls its foundational settings from one governed, audited source, instead of re-deriving them locally or tripping over inconsistencies between registers / stores / the A/R calendar. What this module explicitly does **not** own: ticket-time tender *capture* (that's `sales-pos`), tax *calculation* on a ticket (also `sales-pos`, reading the rates from here), fiscal-period *close* or GL-summary aggregation (that's `accounts-receivable`), user accounts / permissions / login (that's `employees`), the SKU taxonomy proper — department / category / group / size type — (that's `products`, though this module references them for sales-tax overrides and case-packs), OTB plan setup (that's `otb-planning`), purchase-order lifecycle (that's `purchasing`, which *reads* bill-to addresses and case packs from here), retention purges / backups / feature flags (that's `platform`), and the RICS legacy modem / communications / COM-port / printer-driver / RICS.CFG plumbing (dropped, per `docs/MODULES.md`).

## RICS features covered

**Stores — core identity** (Ch. 11 pp. 141–142)
- **p. 141, Stores — Store Number** — any integer from `1` to `999`, capped by "number of POS locations purchased". This is the primary key throughout RICS.
- **p. 141, Store Name** — internal name shown on screens and printed on reports.
- **p. 141, Mail Name** — the corporate name printed on POs (distinct from Store Name, which is operational).
- **p. 141, Address / City / State / Zip** — required so labels, POs, and other reports can print them.
- **p. 142, General tab — Last Ticket Used** — fallback ticket counter used when RICS cannot infer the last ticket number for a sales batch at that store.
- **p. 142, General tab — Phone Number / Fax Number** — printed on POs.
- **p. 142, General tab — Other Charge Description** — per-store relabel of the ticket "Other Charges" field (e.g., a mail-order store relabels to "Shipping"). RICS additionally allowed a per-register override via `RICS.CFG` key `Sales Screen / OthChgDesc`.
- **p. 142, General tab — Email Address** — prints on various reports.
- **p. 142, Bill-To Address tab** — Name / Address / City / State / Zip per store, plus `[Bill-To Label]` / `[Label]` buttons that stage the address into Mail List → Print Stored Address Labels for later printing.

**Sectors — the department-grouping taxonomy** (Ch. 11 pp. 142–143)
- **p. 143, Sectors** — a sector is *a group of departments*, not a group of categories. Number 1–99, description up to 20 chars, `Begin department` + `End department` range (inclusive, numeric range over department numbers). Sector totals appear as sub-totals on several sales reports. The manual explicitly advises leaving numbering gaps (sector 10 = departments 10–19, sector 30 = departments 30–39) so new sectors can be inserted later.

**Taxes — store-level rates** (Ch. 11 p. 141)
- **p. 141, Taxes tab** — **up to 3 taxes per store**. For each: Description (up to 10 chars, alphanumeric), Tax Rate, and rounding mode — `Round to the nearest cent` (typical), `Always round up`, or `Always round down`. The Description is required *before* a rate can be entered. The general tax rate of most items is stored here; category-specific exceptions go to Sales Tax Override.
- **p. 141, propagation warning** — "After changing tender types, the store file must be transferred to the POS, and the current batch of sales must be closed before the changes will take effect." The same stale-cache warning applies to tax rate edits.

**Tender Types — per-store catalog of payment methods** (Ch. 11 pp. 141–142)
- **p. 141, Tender Types tab — Description** — up to 10 alphanumeric chars (e.g., `Cash`, `Check`, `Visa`, `MC`, `Amex`, `Gift Cert`, `Store Cr`, `House`, `Other`).
- **p. 141, Cash flag** — "considered cash" determines whether the tender contributes to the cash-drawer balance. Cash / Check / directly-deposited credit cards are usually cash-flagged; store credit / gift cert / house charge typically are not.
- **p. 141, Open Drawer flag** — opens the drawer when this tender type is used at tender time.
- **p. 141, Unused tender types** — tender types that are left unchecked for both flags are "Not Used" and do **not appear on the sales screen**. This is the mechanism for enabling / disabling tender types per store without deleting the row.

**Bill-To Address — per-store** (Ch. 11 p. 142)
- **p. 142, Bill-To Address** — Name / Address / City / State / Zip for *the store's* bill-to. Consumed by `purchasing` when entering a PO: the bill-to store defaults to "Any" and can be fixed to a specific store's bill-to address. Also staged via `[Label]` for Print Stored Address Labels.

**Sales Tax Override — category-level exceptions** (Ch. 11 p. 161)
- **p. 161, Sales Tax Override** — per **(store, category)** override of the store-level tax rate, with optional **price threshold** and **`Only tax amount over threshold`** flag. Example from the manual: a 5% rate with `$50.00` threshold and "only over threshold" checked means a `$75.00` item is taxed on `$25.00` ($1.25). With "only over threshold" unchecked, the first `$50.00` is taxed ($2.50). Optional file; populated only for states / merchandise classes where the rate deviates from the store baseline.
- **p. 170, Print – Sales Tax Override File** — flat listing for verification. In a web-first system this is just the list view — no separate printout.

**Case Packs — pre-set size-grid quantities** (Ch. 11 p. 161)
- **p. 161, Case Packs** — a named pre-set of quantities per size-type column × row. Used as a shortcut in any screen that takes a size grid (PO entry, manual receipts / orders / transfers, model quantities, physical inventory). Fields: Case Pack code (up to 6 chars, alphanumeric), Description (up to 20 chars), Size Type (required — the grid shape). When entering SKU data only case packs matching the same Size Type appear in the picker.
- **p. 170, Print – Casepack File** — listing, with totals and totals-by-row. Collapsed into the admin list view.

**Company Setup — company-wide preferences** (Ch. 17 p. 214)
- **p. 214, Year-ending Month** — which month closes the calendar year. Drives when sales-year totals zero out at month/season/year close. May be the *merchandising* year-end, not the tax year-end.
- **p. 214, Current month / Current year** — the active posting period. Sales can only be *posted* for the current month (though sales can be *entered* for any month). `accounts-receivable`'s close routine increments this on Close Month / Close Year.
- **p. 214, Season Ending Months** — checkbox set over the 12 months marking season boundaries. At month close, season-to-date totals zero out on a matched month.
- **p. 214, Automatically Generate Labels — After orders / After receipts** — generates stock / hang-tag / jewelry-tag labels automatically when POs are saved or received. Drives behavior in `products` (label generation) and `purchasing` (receipt flow).
- **p. 214, Print retail price on Purchase Orders / Print cost on Purchase Orders** — two independent flags affecting PO printouts.
- **p. 214, Sort SKUs on reports by** — `SKU #` (15 chars, fastest), `Vendor SKU #` (20 chars), or `SKU description` (20 chars). Primary sort key for all SKU-ordered reports.
- **p. 214, Price to print on manual transfers journal** — `Retail price`, `Average cost`, or `Neither`.
- **p. 214, Open-To-Buy entry Method** — `% of total store sales and fixed monthly percentages` vs. `% change over last years sales for each category`. Default strategy for new OTB plans; see `otb-planning` spec for how this is consumed.
- **p. 214, Save posted sales transactions information when posting sales** — retains post-posting transaction detail so reports like Special Orders, Layaways, House Pymt/Chgs, Salesperson Summary, and Sales by Time can print from posted as well as unposted data. RICS note: "This option should be checked on."
- **p. 214, User-defined Sales Transaction Type 2** — enables the free slot in the transaction-type enum (see `sales-pos` p. 28 — types 1–8, with `2` as the user-defined slot). Also used to set its label.

**Adjacent File Setup surfaces owned by `store-ops`** (Ch. 11 pp. 166–167)
- **p. 166, Return Codes** — numeric code + description + optional `trackable` flag. Used on a sales ticket's return line (`sales-pos`) and filtered in the Returned Sales report. Small reference file — a natural fit here rather than in `products`. *(Note: the registry currently folds Return Codes into `products`; this spec flags it as a candidate move to `store-ops` because it's register-side reference data, not SKU metadata. See Open questions.)*
- **p. 167, Promotion Codes** — numeric code + description + promotion cost. Used on the ticket header as the promo picker value, and as the subject of the Promotion Code Analysis report. *(Same note as Return Codes — currently in `products`; candidate for `store-ops`. See Open questions.)*

## Modernization decisions

- **Store primary key is a UUID; RICS's `1..999` integer survives as a stable `storeCode`.** RICS makes the store number the PK throughout (p. 141). Zack's Retail uses `Store.id: string` (UUID) internally and keeps `Store.code: int (1..999, unique)` as the human-readable identifier that prints on receipts, POs, and reports. The POS-location cap ("number of POS locations purchased") disappears — our licensing isn't per-location.
- **Sectors numbering is decoupled from department numbering.** RICS encodes the sector-to-department relationship via a numeric range (begin / end department, p. 143) with a strong cultural convention that sector 10 = departments 10–19, sector 30 = departments 30–39. Zack's Retail makes the relationship **explicit many-to-one from `Department` → `Sector`** via `Department.sectorId` (FK). A sector's `beginDepartmentCode` / `endDepartmentCode` stays only as display metadata on the sector row (so the "numbering gap" convention still renders on the list view for shops that keep it), but the authoritative relation is the FK. A department can move between sectors by updating the FK; no batch-renumbering utility is needed (Ch. 15 had one — dropped).
- **Taxes are normalized from a 3-slot struct to a `StoreTax` table, limited in the UI.** RICS p. 141 caps at 3 taxes per store, stored as 3 fixed fields. Zack's Retail uses a child table `StoreTax { storeId, slot (1|2|3), description, rate, roundingMode, effectiveFrom, effectiveTo? }` with a UI cap of 3 active slots per store. The `slot` column preserves RICS ordering for back-compat on reports (Sales Tax Recap orders by slot). `effectiveFrom` / `effectiveTo` replace RICS's "close the batch, retransfer the file" propagation model (see next bullet).
- **Tax rate changes are effective-dated, not batch-gated.** RICS propagates tax changes only after *batch close + file transfer to POS* (p. 141 warning). Zack's Retail stores each rate change as a new `StoreTax` row with an `effectiveFrom`; fresh tickets pick up the new rate immediately, and in-progress tickets keep their opening rate (frozen at ticket-header creation). Emits `StoreTaxChangedEvent { storeId, slot, effectiveFrom }`. No batch close required.
- **Tender Types split into a global catalog + per-store enablement.** RICS stores tender types per store (p. 141), which forces operators to re-enter the same Visa / MC / Amex definitions for every store. Zack's Retail models `TenderType` as a **company-level catalog** (one row per distinct payment method) with per-store `StoreTenderType { storeId, tenderTypeId, enabled, isConsideredCash, opensDrawer, displayOrder, requireAccountNumber?, notes? }`. The cash / open-drawer flags move to the per-store row because those behaviors are store-specific (one store's Amex might deposit same-day, another's might not). Sort order becomes explicit (the RICS order-by-ID accident goes away).
- **`TenderKind` enum on `TenderType` disambiguates behavior without magic integers.** `sales-pos` needs to dispatch behavior on the *kind* of tender — is it cash-treated, does it decrement a gift-certificate balance, does it post to A/R, etc. The `TenderKind` enum (`CASH | CHECK | CARD | GIFT_CERT | STORE_CREDIT | HOUSE_CHARGE | CONTINUATION | FOREIGN_CURRENCY | OTHER`) lives on `TenderType` and is the authoritative dispatch key. RICS's magic tender IDs (`#10` Gift Cert, `#11` Store Credit, `#99` Continued) go away as integer identifiers — they're preserved as `kind` values on the catalog rows.
- **"Not Used" tender-type state becomes an explicit `enabled` flag per store.** RICS infers "not used" from both checkboxes being unchecked (p. 141). Zack's Retail uses an explicit `StoreTenderType.enabled: boolean`; you can have a tender type that opens the drawer but is currently disabled at one store. Cleaner semantics, same UX (a single toggle on the admin list).
- **Bill-To Address is a reusable `Address` record referenced by `Store.billToAddressId`.** RICS bundles the bill-to into the store record (p. 142), which implies one bill-to per store. In practice, a multi-store chain sometimes has one corporate bill-to used by many stores, sometimes per-store. Zack's Retail extracts `Address` into its own entity (label, name, line1, line2, city, state, zip, country, phone?, notes?) and lets `Store.billToAddressId` be nullable-FK. The `[Label]` button (p. 142) becomes "Print Stored Address Label" in the Stores list, calling into `crm`'s shared-address-label render.
- **Sales Tax Override carries an `effectiveFrom` and is scoped by `categoryId`, not a begin/end category range.** RICS models the override per (store, category) directly (p. 161), but the print dump (p. 170) sorts by category ranges. Zack's Retail keeps the direct per-category row. The threshold + "only tax amount over threshold" flag survive verbatim — that's a real business rule (border-state handbags & jewelry, p. 161 example).
- **Case Pack entries are keyed by Size Type and stored as an envelope of cell quantities.** RICS stores the case pack as a denormalized parallel to the size grid — a row per case pack, with one column-row cell per position. Zack's Retail stores `CasePack { id, code, description, sizeTypeId }` + child `CasePackCell { casePackId, columnLabel, rowLabel, quantity }`. The UI still renders as a grid. Consumed identically by `purchasing`, `physical-inventory`, and `inventory.enterModelQuantities`.
- **Company Setup's "Current month / Current year" collapses into `accounts-receivable`'s fiscal calendar.** RICS keeps a tiny `(currentMonth, currentYear)` tuple on Company Setup (p. 214) that gates posting. That same state is in `accounts-receivable`'s `Period` model (see its spec). `store-ops` **does not duplicate** it; the Company Setup screen in Zack's Retail *renders* the active period from `accounts-receivable` read-only. Only the `yearEndingMonth` and `seasonEndingMonths` (as an array of month numbers) live in `store-ops` as inputs that `accounts-receivable`'s close cycle consumes.
- **Automatic label generation — flags live here, *behavior* lives in `products` + `purchasing`.** RICS mixes the flag (Company Setup, p. 214) with the action (label queue in Ch. 5). Zack's Retail keeps the two flags `autoGenerateLabelsAfterOrders` / `autoGenerateLabelsAfterReceipts` on `CompanySettings`; `products`'s label-queue service subscribes to events from `purchasing` and checks those flags before auto-queuing.
- **RICS Communications tab is dropped entirely.** Per `docs/MODULES.md`, modem / dial-up / `RICS.CFG` / "call waiting T*70," / baud rates / port numbers / LAN vs. direct-connect / INTERNET-vs-DIRECT phone-number hacks (p. 161–162, p. 214–216) are replaced by real-time cloud sync. No screen surfaces in this module for any of it.
- **Printer Setup, Mail List Setup move out.** Printer Setup (Ch. 17 p. 216) is browser-side — not a first-class admin surface. Mail List Setup (Ch. 17 p. 218 — up to 6 extra customer fields + per-category mail-detail omit rules) belongs to `crm`, not `store-ops`. Referenced here only to document where they *don't* live.
- **System Status Report (Ch. 17 p. 219) moves to `platform`.** Its three parts — Job History, File Statistics, RICS System Information — are all platform telemetry, not company configuration. `store-ops` exposes a read API for company+store metadata that `platform` can fold into the report, but doesn't own it.
- **Payout Categories surface here as a tiny admin screen.** `sales-pos` needs a curated list of pay-out categories (`Postage`, `Supplies`, `Petty`, `Refund Adjust`, `Other`) for the payout picker; RICS stores this implicitly via a `RICS.CFG` toggle `ValidatePayouts` (p. 35). `store-ops` owns the list.
- **Other Charge label — store-level only.** RICS allowed per-register override via `RICS.CFG / OthChgDesc` (p. 142). Zack's Retail drops the per-register override — the label is a store-level setting on `StoreSettings`. If a chain needs per-register labels, raise it as a future enhancement.
- **No per-store "POS count purchased" licensing constraint.** RICS p. 141 caps stores by how many POS licenses were bought. Zack's Retail removes this — license counting is a `platform` concern and doesn't touch the store file.

## Data model sketch

```prisma
// --- Stores ----------------------------------------------------------------

model Store {                                     // p. 141
  id               String   @id @default(uuid())
  code             Int      @unique              // RICS 1..999 (p. 141), kept as human-readable code
  name             String                         // Store Name (p. 141)
  mailName         String?                        // Mail Name (printed on POs) (p. 141)
  addressId        String                         // FK Address — operational / storefront address
  billToAddressId  String?                        // FK Address — separate bill-to (p. 142)
  phone            String?
  fax              String?
  email            String?
  active           Boolean  @default(true)
  openedOn         DateTime?
  closedOn         DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  settings         StoreSettings?
  taxes            StoreTax[]
  salesTaxOverrides SalesTaxOverride[]
  tenderEnrollments StoreTenderType[]
  registerList     Register[]                     // owned by sales-pos; Store is the parent
  @@index([active])
}

model StoreSettings {                              // p. 142 General tab (minus fiscal / legacy items)
  storeId              String   @id
  lastTicketUsed       Int      @default(0)       // fallback ticket counter (p. 142)
  otherChargeLabel     String   @default("Other Charges") // (p. 142)
  defaultReceiptTemplateId String?                // see sales-pos
  postingMode          PostingMode @default(REALTIME) // REALTIME | BATCH — mirrors sales-pos posting mode
  requireReturnCodeOnNegativeQty Boolean @default(true)
  returnCodeTrackingEnabled Boolean @default(true)
  secondaryCurrencyEnabled Boolean @default(false)
  secondaryCurrencyRate Decimal?
  secondaryCurrencyPrintOnReceipt Boolean @default(false)
  secondaryCurrencyDecimals Int @default(2)
  updatedAt            DateTime @updatedAt
  updatedByUserId      String?

  store Store @relation(fields: [storeId], references: [id])
}

model Address {                                    // reusable — Store address, Store bill-to, and CRM share shape
  id        String   @id @default(uuid())
  label     String?                                // e.g., "Corp HQ", "Main Street"
  name      String?
  line1     String
  line2     String?
  city      String
  state     String
  zip       String
  country   String   @default("US")
  phone     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// --- Sectors (Ch. 11 p. 143) ----------------------------------------------

model Sector {                                     // a group of departments
  id              String   @id @default(uuid())
  code            Int      @unique                // 1..99 (p. 143)
  name            String                          // up to 20 chars (p. 143)
  beginDepartmentCode Int?                        // cosmetic — display only (p. 143)
  endDepartmentCode   Int?                        // cosmetic
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  // NOTE: Department.sectorId (owned by `products`) carries the authoritative FK.
}

// --- Taxes (Ch. 11 p. 141) -------------------------------------------------

model StoreTax {                                   // up to 3 per store (p. 141)
  id             String   @id @default(uuid())
  storeId        String
  slot           Int                               // 1, 2, or 3 — preserves RICS order
  description    String                            // up to 10 chars (p. 141)
  rate           Decimal                           // e.g. 0.0825
  roundingMode   TaxRoundingMode                   // NEAREST | UP | DOWN (p. 141)
  effectiveFrom  DateTime
  effectiveTo    DateTime?                         // null = current
  createdByUserId String
  createdAt      DateTime @default(now())

  @@unique([storeId, slot, effectiveFrom])
  @@index([storeId, effectiveFrom])
  store Store @relation(fields: [storeId], references: [id])
}

model SalesTaxOverride {                           // Ch. 11 p. 161 — (store, category) override
  id                String   @id @default(uuid())
  storeId           String
  categoryId        String                          // FK → products.Category
  description       String?
  rate              Decimal
  roundingMode      TaxRoundingMode
  priceThreshold    Decimal?                       // p. 161
  onlyTaxAmountOverThreshold Boolean @default(false) // p. 161
  effectiveFrom     DateTime
  effectiveTo       DateTime?
  createdByUserId   String
  createdAt         DateTime @default(now())

  @@unique([storeId, categoryId, effectiveFrom])
  @@index([storeId])
  store Store @relation(fields: [storeId], references: [id])
}

enum TaxRoundingMode { NEAREST  UP  DOWN }

// --- Tender Types (Ch. 11 p. 141) ----------------------------------------

model TenderType {                                 // catalog — company-level
  id            String   @id @default(uuid())
  code          String   @unique                  // short code, e.g. "CASH", "VISA"
  description   String                            // up to 10 chars (p. 141)
  kind          TenderKind                        // dispatch key for sales-pos
  sortOrder     Int      @default(100)
  active        Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model StoreTenderType {                            // per-store enrollment
  id                  String   @id @default(uuid())
  storeId             String
  tenderTypeId        String
  enabled             Boolean  @default(true)     // RICS "not used" replacement (p. 141)
  isConsideredCash    Boolean  @default(false)    // p. 141
  opensDrawer         Boolean  @default(false)    // p. 141
  requireAccountNumber Boolean @default(false)    // echoes Sales Ticket Options (p. 24)
  displayOrder        Int      @default(100)
  notes               String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@unique([storeId, tenderTypeId])
  @@index([storeId, enabled])
  store      Store      @relation(fields: [storeId], references: [id])
  tenderType TenderType @relation(fields: [tenderTypeId], references: [id])
}

enum TenderKind {
  CASH  CHECK  CARD  GIFT_CERT  STORE_CREDIT  HOUSE_CHARGE
  CONTINUATION  FOREIGN_CURRENCY  OTHER
}

// --- Case Packs (Ch. 11 p. 161) ------------------------------------------

model CasePack {
  id          String   @id @default(uuid())
  code        String   @unique                    // up to 6 chars (p. 161)
  description String                              // up to 20 chars (p. 161)
  sizeTypeId  String                              // FK → products.SizeType (required, p. 161)
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  cells       CasePackCell[]
}

model CasePackCell {
  id           String  @id @default(uuid())
  casePackId   String
  columnLabel  String                              // matches SizeType column label
  rowLabel     String?                             // matches SizeType row label (nullable if size type has no rows)
  quantity     Int

  casePack CasePack @relation(fields: [casePackId], references: [id])
  @@unique([casePackId, columnLabel, rowLabel])
  @@index([casePackId])
}

// --- Payout Categories (referenced by sales-pos p. 35) ---------------------

model PayoutCategory {
  id           String   @id @default(uuid())
  code         String   @unique
  label        String
  active       Boolean  @default(true)
  displayOrder Int      @default(100)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

// --- Company Setup (Ch. 17 p. 214) ---------------------------------------

model CompanySettings {
  id                        String  @id @default(uuid())     // singleton row
  legalName                 String
  displayName               String?
  primaryAddressId          String?                           // FK Address

  // Fiscal calendar inputs (consumed by accounts-receivable)
  yearEndingMonth           Int                               // 1..12 (p. 214)
  seasonEndingMonths        Int[]                             // subset of 1..12 (p. 214)

  // Label / PO print preferences (p. 214)
  autoGenerateLabelsAfterOrders   Boolean @default(false)
  autoGenerateLabelsAfterReceipts Boolean @default(false)
  printRetailOnPO                 Boolean @default(false)
  printCostOnPO                   Boolean @default(false)

  // Report sort / display preferences (p. 214)
  skuReportSortKey          SkuSortKey @default(SKU)          // SKU | VENDOR_SKU | DESCRIPTION
  manualTransferJournalPrice TransferJournalPrice @default(RETAIL) // RETAIL | AVERAGE_COST | NEITHER

  // OTB defaults (p. 214 — read by otb-planning)
  otbDefaultStrategy        OtbDefaultStrategy @default(CHANGE_OVER_LAST_YEAR)

  // Sales retention (p. 214)
  savePostedSalesTransactions Boolean @default(true)

  // User-defined transaction type 2 (p. 214; extended slot in sales-pos p. 28)
  transactionType2Enabled   Boolean @default(false)
  transactionType2Label     String?

  updatedAt                 DateTime @updatedAt
  updatedByUserId           String?
}

enum SkuSortKey             { SKU  VENDOR_SKU  DESCRIPTION }
enum TransferJournalPrice   { RETAIL  AVERAGE_COST  NEITHER }
enum OtbDefaultStrategy     { FIXED_MONTHLY_MIX  CHANGE_OVER_LAST_YEAR }
enum PostingMode            { REALTIME  BATCH }

// --- Audit (company + store config changes) --------------------------------

model StoreOpsAuditEvent {
  id          String   @id @default(uuid())
  entity      String                               // "Store" | "StoreTax" | "TenderType" | ...
  entityId    String
  action      AuditAction                          // CREATED | UPDATED | DELETED | ENABLED | DISABLED
  actorUserId String
  beforeJson  Json?
  afterJson   Json?
  createdAt   DateTime @default(now())
  @@index([entity, entityId])
  @@index([createdAt])
}

enum AuditAction { CREATED  UPDATED  DELETED  ENABLED  DISABLED }
```

**Invariants**
- Exactly **one** `CompanySettings` row. Treated as a singleton with app-level guard.
- `Store.code` is globally unique; constrained `1..999` in v1 for back-compat with RICS, widened later.
- `StoreTax` has at most **3 currently-effective** (no `effectiveTo`) rows per `storeId`. Enforced in service + UI (not a DB constraint since history rows count).
- `SalesTaxOverride` is unique per `(storeId, categoryId, effectiveFrom)`; the currently-effective row per `(storeId, categoryId)` is `effectiveTo = null`.
- `StoreTenderType` is unique per `(storeId, tenderTypeId)`.
- `CasePackCell` unique per `(casePackId, columnLabel, rowLabel)`; all cells of a case pack must belong to a column/row of the parent `CasePack.sizeTypeId` (enforced in service layer).
- `Sector.code` ∈ `1..99` (RICS convention, p. 143); deletion is blocked if any `Department` FK still points to it (`products` enforces via its Department model).
- `CompanySettings.yearEndingMonth` ∈ `1..12`; `seasonEndingMonths` is a subset of `1..12` and is strictly monotonic if the client renders it in calendar order.
- `TenderType` rows are **not** deletable once referenced by a captured `SalesTicketTender` — soft-delete via `active = false` only.

## Surfaces

### Admin screens (web UI in `apps/web`)

- **Company Setup** — single-page form for `CompanySettings`. Sections: Identity (legal/display names, primary address), Fiscal Calendar (year-ending month, season-ending months checkbox row), PO & Labels (four flags), Reports (SKU sort key, manual-transfer journal price), OTB Defaults (strategy dropdown, read-only note: "change per-plan under OTB Planning"), Sales Retention, Transaction Type 2.
- **Stores — list** — table of all stores. Columns: Code, Name, City, State, Active, Last Updated. Filter by active/inactive. Action: "New Store", "Bulk Disable".
- **Store — detail** — tabbed editor echoing RICS tabs (p. 141–142):
  - **General** — code, name, mail name, address (Address picker or edit inline), phone, fax, email, active.
  - **Settings** — other-charge label, posting mode, last ticket used, receipt template (link out to `sales-pos` template mgmt), secondary-currency options.
  - **Taxes** — up to 3 slots, each with description / rate / rounding. "Add rate change" button starts a new effective-dated row.
  - **Tender Types** — per-store enrollment list. Toggle Enabled / Cash / Open Drawer / Require Account # per tender type. Reorder via drag. "Add from catalog" opens the `TenderType` catalog picker.
  - **Bill-To** — Address picker (separate from store address), `[Print Bill-To Label]` action.
  - **Sales Tax Override** — list per (store, category). Inline editor for threshold + "only over" flag. "Add override" opens a category picker (from `products`).
- **Sectors** — list + editor. Code, name, begin/end department (cosmetic). Link out to `products` Departments list showing which departments belong via FK.
- **Tender Type Catalog** — list + editor. Code, description, kind (dropdown), sort order, active. Separate from the per-store enrollment.
- **Case Packs** — list + editor. Picker for Size Type (from `products`), grid editor for cells based on selected Size Type's columns/rows. Preview total quantity.
- **Payout Categories** — list + editor. Code, label, active, sort order.
- **Address Book** — reusable addresses (stores, bill-tos, and addresses shared with `crm`). Label, name, line1/2, city/state/zip/country, phone.
- **Audit Log view** — filterable list of `StoreOpsAuditEvent` rows (entity, who, when, before/after diff).

All list views export CSV; detail views have in-browser JSON diff on save.

### Read APIs (for other modules — internal `api/v1/store-ops/...`)

Thin HTTP surface; the primary consumer pattern is **in-process contract adapters** similar to `PurchasingContractAdapter` (see `otb-planning` spec). HTTP routes exist for admin UI and for cross-service reads when workers are split.

- `GET    /api/v1/stores` — list, with `?active=true|false`, `?q=` name search.
- `GET    /api/v1/stores/:id` — store detail (settings, taxes, tender enrollments, bill-to — all embedded).
- `GET    /api/v1/stores/:id/taxes?asOf=ISO8601` — effective taxes at a timestamp (used by `sales-pos` on ticket-header creation).
- `GET    /api/v1/stores/:id/tax-override?categoryId=&asOf=` — category-level override lookup.
- `GET    /api/v1/stores/:id/tender-types` — enabled tenders with resolved kind / flags.
- `GET    /api/v1/stores/:id/bill-to` — bill-to `Address`.
- `GET    /api/v1/stores/:id/settings` — `StoreSettings` row.
- `POST   /api/v1/stores` / `PATCH /api/v1/stores/:id` — admin mutation.
- `POST   /api/v1/stores/:id/taxes` — record a new effective-dated tax change (closes the previous `effectiveTo`).
- `GET|POST|PATCH /api/v1/stores/:id/sales-tax-overrides`.
- `GET|POST|PATCH /api/v1/stores/:id/tender-types` — per-store enrollment.
- `GET    /api/v1/sectors` / `POST /api/v1/sectors` / `PATCH /api/v1/sectors/:id`.
- `GET    /api/v1/tender-types` — catalog list; `POST`, `PATCH /:id`, `POST /:id/deactivate`.
- `GET    /api/v1/case-packs?sizeTypeId=` — list filtered by size type; `POST`, `PATCH /:id`.
- `GET    /api/v1/payout-categories`; `POST`, `PATCH /:id`.
- `GET    /api/v1/addresses?q=` / `POST`, `PATCH /:id`.
- `GET    /api/v1/company-settings` — single read.
- `PUT    /api/v1/company-settings` — full replace; always emits audit.
- `GET    /api/v1/store-ops/audit?entity=&entityId=&from=&to=` — audit log viewer.

### Outbound events (emitted by this module)

- `StoreCreatedEvent { storeId }`
- `StoreUpdatedEvent { storeId, fields[] }`
- `StoreActiveChangedEvent { storeId, active }` — consumed by any dashboard that filters by active stores.
- `StoreTaxChangedEvent { storeId, slot, effectiveFrom, rate }` — consumed by `sales-pos` to invalidate rate caches; by `sales-reporting` for Sales Tax Recap historical accuracy.
- `SalesTaxOverrideChangedEvent { storeId, categoryId, effectiveFrom }` — same consumers.
- `TenderTypeCatalogChangedEvent { tenderTypeId, action }` — `sales-pos` refreshes dispatch tables.
- `StoreTenderEnrollmentChangedEvent { storeId, tenderTypeId, enabled }`.
- `CasePackChangedEvent { casePackId }` — `purchasing` and `physical-inventory` refresh pickers.
- `SectorChangedEvent { sectorId }` — consumed by `sales-reporting` (sector rollup) and `products` (department list).
- `CompanySettingsChangedEvent { fields[] }` — broadcast; listeners inspect fields to decide whether to refresh (e.g., `otb-planning` only cares about `otbDefaultStrategy`; `accounts-receivable` cares about `yearEndingMonth` and `seasonEndingMonths`).
- `BillToAddressChangedEvent { storeId, addressId }` — `purchasing` refreshes PO defaults.

## Cross-module dependencies (who reads from `store-ops`)

This is the most important section for this module: `store-ops` is upstream of nearly every other module. Changes here cascade.

- **`sales-pos`** —
  - `Store` + `StoreSettings` (otherChargeLabel, postingMode, lastTicketUsed, secondary currency options) on every shift open and ticket create.
  - `StoreTax[]` effective at ticket-header time (up to 3 slots) — drives the tax lines on `SalesTicketTax`.
  - `SalesTaxOverride` per (store, category) at line-add time — drives per-line tax when a category is overridden.
  - `StoreTenderType[]` for the enabled-tender picker on the tender screen; `kind` to dispatch behavior; `isConsideredCash` / `opensDrawer` / `requireAccountNumber` for runtime semantics.
  - `PayoutCategory[]` for the Pay Outs picker (p. 35).
  - `CompanySettings.transactionType2Enabled` / `.transactionType2Label` to decide whether to show type 2 in the transaction-type selector.
- **`customer-transactions`** —
  - Reads tender types with `kind = GIFT_CERT`, `STORE_CREDIT`, `HOUSE_CHARGE` to gate the per-type workflows.
  - Reads `StoreSettings.postingMode` for the special-order / layaway "how do we balance A/R" branch.
- **`purchasing`** —
  - `Store.billToAddressId` as the default Bill-To on PO entry (p. 56); the Ship-To is also a `Store` FK.
  - `CasePack[]` (filtered by the line's SKU's `sizeTypeId`) for the case-pack picker on PO lines (p. 161).
  - `CompanySettings.printRetailOnPO`, `.printCostOnPO`, `.autoGenerateLabelsAfterOrders`, `.autoGenerateLabelsAfterReceipts` for PO printing + label auto-queueing.
- **`inventory`** —
  - `Store[]` (and `Store.active`) as the dimension for on-hand / movement ledger; transfers are (fromStoreId, toStoreId) pairs keyed here.
  - `CasePack[]` for model-quantities entry (`Ch. 4 p. 68`) and manual receipts/transfers.
- **`physical-inventory`** —
  - `Store[]` for worksheet scoping; `CasePack[]` for count entry shortcuts.
- **`otb-planning`** —
  - `Store[]` for plan-header scoping and the Store selector on every report.
  - `CompanySettings.otbDefaultStrategy` as the seed strategy for new plans.
  - `CompanySettings.yearEndingMonth` / `.seasonEndingMonths` indirectly (via `accounts-receivable`'s `Period`).
- **`sales-reporting`** —
  - `Store[]` with `code`, `name`, `mailName` for all report headers and groupings; `Store.active` for the "Combine Stores" toggle's default filter.
  - `Sector[]` + the `Department → Sector` relation for sector sub-totals on Sales Analysis and 8-Week Trending.
  - `StoreTax[]` (historical — effective-dated) for Sales Tax Recap reconciliation across rate changes.
  - `CompanySettings.skuReportSortKey` as the default sort on every SKU-ordered report.
- **`accounts-receivable`** —
  - `CompanySettings.yearEndingMonth` → `Period` calendar generation on year rollover.
  - `CompanySettings.seasonEndingMonths` → which months close a season on Close Month / Season / Year.
  - `CompanySettings.savePostedSalesTransactions` gates its GL-summary write-through retention.
  - `Store[]` for statement addressing and per-store A/R subtotals.
- **`products`** —
  - `Sector[]` — referenced by `products.Department.sectorId` FK.
  - `CasePack[]` sharing the `SizeType` model (co-owned contract — `products` owns `SizeType`, `store-ops` owns `CasePack`).
- **`crm`** —
  - `Store[]` for mailing-list + customer scoping; `CompanySettings.savePostedSalesTransactions` affects mail-detail retention.
  - `Address` — the shared entity also used by `store-ops` for store/bill-to addresses.
- **`employees`** —
  - `Store[]` for per-store salesperson scoping; `PayoutCategory` is *read* by some salesperson-facing flows if pay-outs are ever attributed to a salesperson.
- **`platform`** —
  - `CompanySettings` + `Store[]` + `StoreOpsAuditEvent` as inputs into the System Status Report (p. 219). Feature flags that override store-level defaults (e.g., disable realtime posting globally) live in `platform` and cross-reference store settings.

## Contracts exposed (outbound)

A typed in-process adapter similar to `PurchasingContractAdapter` lives at `apps/api/src/contracts/storeOpsContract.ts`. Surface:

- `listStores({ activeOnly? })` → `Store[]`
- `getStore(storeId)` → `Store` (with settings embedded)
- `getEffectiveTaxes(storeId, asOf: Date)` → `StoreTax[]` (0–3)
- `getSalesTaxOverride(storeId, categoryId, asOf)` → `SalesTaxOverride | null`
- `computeTicketTaxLines({ storeId, categoryTotals[], asOf })` → `TaxLine[]` — **utility helper; the actual call site for tax calc stays in `sales-pos`.** Provided here so `sales-reporting` can reconcile Sales Tax Recap numbers against the same math.
- `getEnabledTenderTypes(storeId)` → `StoreTenderTypeResolved[]` (joined with catalog `kind`)
- `getTenderTypeByKind(storeId, kind)` → the enrolled tender type for a kind, when `sales-pos` needs to emit a system-generated tender (e.g., internal "continuation" tender).
- `getBillToAddress(storeId)` → `Address | null`
- `listSectors()`, `getSector(sectorId)`
- `listCasePacks({ sizeTypeId? })` → `CasePack[]` with cells.
- `listPayoutCategories({ activeOnly? })`.
- `getCompanySettings()` → `CompanySettings`
- `getCompanySetting(key)` → typed scalar — shortcut for consumers that only want one flag.

All methods are idempotent reads; mutations go through HTTP only (so the audit log is triggered).

## What is explicitly NOT in scope

Per `docs/MODULES.md` — these belong elsewhere or are dropped outright.

- **Modem / dial-up / COM-port / baud-rate / "call waiting T*70," / DIRECT vs. INTERNET phone-number setup** (RICS Ch. 11 Communications p. 161–162, Ch. 17 Communication Setup p. 214–216). Dropped — cloud sync replaces.
- **RICS.CFG editor** (Ch. 15 p. 200). Dropped — settings live in `CompanySettings` / `StoreSettings` or are feature flags in `platform`.
- **Store-to-store modem sync / Send Messages to Stores / Poll POS Registers / Copy to POS Diskette** (Ch. 13). Dropped — not `store-ops`'s concern in any form.
- **Portable Bar Code Reader (Percon PT2000) driver setup / POS Equipment setup** (Ch. 1 p. 15, p. 18). Dropped — browser handles input.
- **Printer Setup** (Ch. 17 p. 216). Dropped — browser handles printing; receipt template per store lives in `sales-pos`.
- **Mail List Setup** (Ch. 17 p. 218). Owned by `crm`. `store-ops` doesn't render that screen.
- **System Status Report** (Ch. 17 p. 219). Owned by `platform`. `store-ops` exposes the data feed but does not own the report surface.
- **Season Setup** (Ch. 17 p. 218). The *list of seasons* (`FW25`, `SS25`, etc., used as SKU season codes) is owned by `products` (seasonal catalog). The *season-ending-month calendar* (which month closes which season for fiscal purposes) is owned here via `CompanySettings.seasonEndingMonths` — two separate concerns, split cleanly.
- **Fiscal-period close / GL Summary / A/R year rollover** (Ch. 8, Ch. 16). Owned by `accounts-receivable`. `store-ops` provides `yearEndingMonth` + `seasonEndingMonths` as *inputs*, nothing else.
- **User setup / permissions / authentication** (Ch. 11 p. 163). Owned by `employees`.
- **OTB Plan setup / OTB Reports** (Ch. 11 p. 158, Ch. 6 p. 100). Owned by `otb-planning`. `store-ops` provides the `otbDefaultStrategy` *default*; the active plan's strategy is stored on the plan itself.
- **SKU / Vendor / Department / Category / Group / Size Type / NRF / Keyword / Return Code / Promotion Code maintenance** (Ch. 11 pp. 144–157, 165–167). Owned by `products`. See Open questions #4 for the candidate moves of Return Codes and Promotion Codes.
- **Data retention purges — Clear Saved Sales Transactions / Clear Deleted Record Keys / Clear Saved Inventory Changes / Auto-Delete SKUs / Clear Time Clock / Clear Gift Cert** (Ch. 8 pp. 114–116). Owned by `platform`.
- **Backups / Restore / Compact / Repair / Create / Delete Database** (Ch. 14, Ch. 15). Owned by `platform` (managed Postgres).
- **Change utilities (Change Salespeople / Size Columns / Size Types / Categories / Vendors / Seasons / Groups / Keywords)** (Ch. 15 pp. 195–199). Dropped — collapsed into ordinary admin edit flows inside each owning module.
- **Per-register `Other Charge Description` override via local `RICS.CFG`** (p. 142). Dropped — store-level only.
- **Per-register-letter A–Z register identifier** (p. 161 Communications, also referenced at p. 5955). Replaced by `Register` rows with stable IDs, owned by `sales-pos`; `store-ops` just parents them via `Store.id`.

## Open questions

1. **Return Codes and Promotion Codes — `store-ops` or `products`?** The current module registry places both in `products` (row 1). Arguments for moving to `store-ops`: they're register-side reference data (consumed on ticket detail), small table, natural fit with Tender Types / Payout Categories as "register reference files". Arguments for keeping in `products`: Promotion Codes participate in pricing (the promo may have an attached discount), Return Codes sometimes cross-reference categories for the "trackable returns" analysis. Needs owner decision before implementation.
2. **Store code width — keep the `1..999` cap?** RICS p. 141 caps at 999 stores. In practice this is plenty. Proposed: keep as a soft cap (`Store.code Int` with CHECK constraint `1..999`), widen to a string later if a chain ever grows past 1000 stores.
3. **Effective-dated taxes — apply the new rate mid-shift or freeze to shift-open?** Spec says new rate applies to *fresh tickets*, in-progress tickets freeze to their header-time rate. RICS forces batch close. Confirm our model matches operator expectations, especially around the rare case of a mid-day tax rate change (e.g., a holiday tax holiday ends at noon).
4. **Sales Tax Override — apply to *taxable base* only, or to line totals including discounts?** RICS p. 161 is ambiguous on the interaction between per-line discounts and the threshold. Proposed: threshold applies to the *discounted extended price* of the category's lines on the ticket, not to the gross. Needs confirmation with a concrete example.
5. **Tender Type Catalog seeding.** What's the initial seed set? Candidates from RICS reality: `CASH`, `CHECK`, `VISA`, `MC`, `AMEX`, `DISC`, `GIFT_CERT` (kind=GIFT_CERT), `STORE_CR` (kind=STORE_CREDIT), `HOUSE` (kind=HOUSE_CHARGE), `OTHER`. Confirm before shipping.
6. **Tender Type rename vs. new catalog entry.** If an operator edits the description of an existing `TenderType`, do historical tender rows still render with the old description (snapshot) or the new one (current)? Spec implies current (description is a catalog attribute). `sales-pos.SalesTicketTender` should snapshot the description at sale time if we want historical fidelity — raise in that spec. For now, assume current-name rendering on `store-ops`'s side and let `sales-pos` carry its own snapshot field.
7. **`yearEndingMonth` mid-year change.** If an operator changes the fiscal year-end month after periods have already been generated for the next fiscal year, what happens? Options: (a) reject the edit unless no `Period` exists beyond the current one; (b) re-project future `Period` rows in `accounts-receivable`. Proposed: (a), with an error message directing the operator to `accounts-receivable`'s fiscal-calendar admin.
8. **`seasonEndingMonths` — number of seasons not just end months.** RICS p. 214 just lists "which months are season-ends". That implicitly defines N seasons. Zack's Retail keeps the same shape but labels each segment — should `CompanySettings` also carry an array of season *labels* (e.g., `["SS", "FW"]`), or does the label live on `products.Season`? Proposed: label lives on `products.Season`; `store-ops` only owns the boundary months.
9. **Address deduplication.** `Address` is shared with `crm` for mailing list + family members. Both modules write addresses. Proposed: single `Address` table owned by `store-ops` with free read from `crm`; `crm` writes via `store-ops.createAddress()`. Confirm before implementation.
10. **Case Pack cells — must every size-type cell be present, or only the non-zero cells?** RICS treats missing cells as `0`. Spec stores only non-zero cells (`CasePackCell` has a FK to `CasePack` but no "fill the grid" requirement). Confirm the UX renders a full grid with empty cells = 0.
11. **Sector code range.** RICS caps at 99 (p. 143). Some chains have >99 departments in total. Does the sector cap need to be widened, or is "1..99 sector codes with many departments per sector" the right shape? Proposed: keep 1..99, as the value of a sector is coarse grouping.
12. **Singleton `CompanySettings` — multi-tenant future-proofing.** Zack's Retail is single-tenant for v1. If it ever multi-tenants, `CompanySettings` would need a `tenantId`. Not in scope now; noted as a forward-compat flag.
13. **Per-store fiscal calendar offset.** RICS assumes all stores share one fiscal calendar (Company Setup). If a chain has stores on different fiscal cycles (rare but possible), do we need per-store year-ending month? Proposed: no — out of scope for v1; raise if users ask.
14. **`[Bill-To Label]` and `[Label]` buttons — is the Mail List "stored labels" queue still the materialization path?** RICS routes these through Ch. 9 Mail List → Print Stored Address Labels. In Zack's Retail the same queue lives in `crm`. Proposed: `store-ops` admin UI has a "Print Bill-To Label" button that calls `crm.printStoredAddressLabel(storeId, kind='BILL_TO')`; `crm` owns the label rendering.
15. **"Transaction Type 2" user-defined slot — does the label live in `store-ops` or `sales-pos`?** RICS enables + labels it in Company Setup (p. 214) and consumes the label in `sales-pos` (p. 28). Proposed: the enablement flag + label live in `store-ops.CompanySettings` (as modelled); `sales-pos` reads via `storeOpsContract.getCompanySetting()`. Confirm.
16. **Audit retention.** `StoreOpsAuditEvent` rows grow without bound. Retention policy? Proposed: 400-day retention aligned with `otb_policy_audit_log` (existing convention), purged by `platform`'s retention worker.
17. **Effective-dated tender enrollment.** `StoreTax` is effective-dated but `StoreTenderType` is not. Should disabling a tender mid-shift affect in-progress tickets? Proposed: no — same as tax; freeze at shift-open. If so, we need either an effective-dated model or a "snapshot at shift open" cache in `sales-pos`. Raise in the `sales-pos` spec.
18. **`[Cash Totals]` preview on tender catalog.** RICS's Sales Recap preview on the tender-type screen (p. 141) — a one-click preview of how the catalog would render on Cash Totals. Nice-to-have; not in v1. Noted for later.
19. **Multi-currency on `StoreTax`.** If `secondaryCurrencyEnabled = true`, does the tax rate apply to the primary or secondary currency amount? Proposed: tax is always calculated on the primary-currency base; the secondary currency is a display conversion. Confirm with accountants.

---

**Spec author notes:** this spec is ~470 lines and sits near the upper end of the target band; the length is driven by the cross-module reads section, which is unavoidable for a foundational module. Implementation should start with the four highest-leverage entities — `Store`, `StoreTax`, `StoreTenderType`, `CompanySettings` — in that order, since every other module in the registry is blocked on at least one of them.
