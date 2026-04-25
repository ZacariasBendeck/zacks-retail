# Module: sales-pos

**Goal**

`sales-pos` is the cash register. It owns the **sales-ticket framework** — header (cashier, transaction type, customer, promotion), detail (SKU / column / row / qty / price / discount / perks / return code / salesperson / family member), tender (split payments, store credit, change, other charges, tax override, ticket comment) — and the **shift lifecycle** around it (open shift, count cash drawer, close shift, over/short, pay outs, post to inventory). It also owns the register-level audit reports that fall out of the tickets: sales tax recap, sales-by-day, reprint posted sales, returned sales, promotion code analysis, salesperson summary (at the register). Primary user value: a cashier can ring, tender, void, refund, reclaim, and reprint a ticket in a web browser with keyboard or scanner, and a manager can close the shift and post the day — without any diskettes, modems, or "main computer" roundtrips. Downstream: `customer-transactions` extends the ticket framework for special orders, layaways, gift certificates, and house charges (transaction types 3–8); `sales-reporting` reads the same tickets for analysis; `accounts-receivable` rolls them into GL at fiscal close.

## RICS features covered

**Manager / Ticket / Currency Options — setup that precedes sales** (Ch. 2)
- **p. 21, Overview** — before entering sales a manager sets Manager Options, optional Sales Ticket Options, optional Currency Options. The complete sales cycle: Start Batch → Enter Tickets → Close Batch → (legacy: Copy Sales) → Print Sales Journal → Post Sales to Inventory.
- **pp. 22–23, Manager Options** — Beginning / Ending Receipt Messages (up to 5 lines each, with Bold/Large flags and `[Center Messages]`), `# Lines on receipt` / `# Lines to print` (40-col receipt, 6 lines/in), Default tender type, Default transaction, Auto # receipts (vs. manual ticket #), Allow perks $, Allow discounts, Automatically Post, Receipt Format, Net-only vs. Retail+Discount vs. Retail+Discount+Net receipt price mode, Cash Drawer (none / COM port / attached-to-printer with decimal codes), `# of Receipts to print`, `[Cash Totals]` Sales Recap preview, `[Open Drawer]`.
- **p. 24, Sales Ticket Options** — Require Account # for selected transaction types, Require Account # for selected tender types, Auto-reprint selected transaction types (default: layaway sale, layaway payment, special-order deposit), Additional Ending Messages for all tickets / selected transaction types / tender = House Charge / negative-total refund.
- **p. 25, Currency Options** — Conversion Factor, Print Foreign Currency Total on receipt, Decimals on Receipt (0–4); split-column tender at pay time with "Give Change in ___" selector.

**Batch of Sales lifecycle** (Ch. 2)
- **p. 25, Start New Batch of Sales** — Store #, Last ticket # (defaults from store; first ticket = last+1; RICS.CFG `ChgTicket=N` locks it), Date (defaults now). A Batch of Sales must be closed before a new one can open for the same store.
- **pp. 25–26, Close Batch of Sales** — Manager Password (if set), Cash Count / Deposit, `[Cash Totals]` (Sales Recap + Cash Drawer Recap + Void Summary), `[Salesperson Summary]` print, `[Open Drawer]`, `[Count Money]`. Starting Cash Drawer Amount is carried forward from last close's Ending Cash Drawer Amount; differences flow to the Cash Count (Deposit) as a drawer adjustment so G/L Summary sees an over/short entry.
- **pp. 26–27, Count Money** — Per tender-type counter. Cash-treated types get bills/coins grid (computer total vs. count → difference); non-cash types get a per-item value list (each check, each credit slip). Ending Cash Drawer Amount entry on the Count Money screen feeds the drawer-difference logic above.

**Ticket entry — header, detail, tender** (Ch. 2)
- **p. 28, Overview** — three required sections, keyboard-first (`[Enter]`/`[Tab]` forward, `[Shift]+[Tab]` back), status bar names the current section. Eight transaction types: `1 Regular Sale`, `2 User Defined`, `3 Special Order Pickup`, `4 Layaway Sale`, `5 Gift Certificate Sale`, `6 Charge Payment`, `7 Special Order Deposit`, `8 Layaway Payment`. Transaction type is locked once saved — to change, void and re-enter.
- **p. 30, Ticket Header** — Cashier (defaults to last used), Transaction (defaults to `1`), Customer Account (optional or required per Sales Ticket Options), Discount__% (if Manager Options allows), Promotion Code (assignable here or on Tender). Adjacent buttons: Mail Detail, Manager Options, Payouts, Close Batch, Reclaim Ticket, Reprint Ticket, Mail List.
- **pp. 31–32, Ticket Detail** — unlimited lines. Per line: UPC (if enabled) → auto-fills SKU/Column/Row/Qty/Price; or manual SKU + Column + Row + Qty + Price. Discount% / Amount (if allowed). Tax checkboxes (per-line non-taxable override; no effect when store tax rate = 0). Salesperson (defaults to cashier, per-line overridable for split sales). Family Member (per-line, for mail-list detail attribution). Comment (prints on receipt). Return Code (required if item is a return). `[Save/Next SKU]` clears and returns focus to UPC; `[Save/Tender]` advances to Tender. `[Next Price]` cycles through the SKU's price slots. `[Reverse Qtys]` negates the qty (quick return). `[Review]` opens Ticket Review; `[Change Header]` returns to header; `[Void]` voids the current ticket.
- **p. 33, Ticket Tender** — default tender = total; default tender type = Manager Option default. Up to **four split tenders** per ticket. Change shown if over-tendered. **Tax is editable here** (line-by-line above, ticket-level here). Other Charges (named per store; e.g., "Shipping") adds to total. Ticket Comment (prints on receipt, saved to Mail Detail, prints on Sales Journal). `[End Sale]` saves, prints receipt, opens drawer, returns to Header.
- **p. 33, Tender #99 "Continued Ticket"** — chain two tickets for the same customer. Used to ring a gift-certificate sale and a regular sale in one customer interaction with one collection of payment. If any part of a continued chain is voided, the **entire chain** is voided.
- **p. 33, Retroactive tender correction trick** — ring a zero-merchandise ticket with `(wrong_tender: -amount, correct_tender: +amount)` to re-classify a prior day's tender without touching the sale.

**Ticket workflow — review, reclaim, reprint, refund** (Ch. 2)
- **p. 34, Ticket Review** — from Ticket Detail, list all items already on the *current* ticket; `[Remove Item]` deletes a line; `[Modify SKU]` re-opens the line in the editor. Does not touch previously-ended tickets.
- **p. 34, Ticket Reclaim** — from Ticket Header, list voided tickets in the *current batch*; `[Select]` reloads the ticket at Header for editing. Cannot reclaim across batches, voided-after-completion tickets, or voided continued chains.
- **p. 34, Ticket Reprint** — from Ticket Header, list ended tickets in the *current batch*; `[Select]` reprints. Cross-batch reprint is handled by Reprint Posted Sales (p. 47).
- **p. 34, Refunds** — ring a regular sale with `quantity = -N` (never `price = -N`), tender the return amount negative (tender #11 Store Credit if giving credit). Account number may be required per Sales Ticket Options.
- **p. 35, Store Credit / Credit Slip** — always tender #11, always require Account Number (tracks customer's store-credit balance). If credit > purchase, ring for purchase amount only; RICS carries the remainder under the account.
- **p. 35, Void (mid-ticket)** — `[Alt]+[V]` voids the current unsaved ticket. If Ticket Password is set, prompt. Voided tickets can be reclaimed while the batch is open.
- **p. 51, Void After Sale (unposted)** — list unposted tickets by store/date/ticket#; select and void. A voided ended ticket still prints on the Sales Journal as a record (and on the Void Summary) but does not post to inventory.
- **p. 35, Pay Outs** — cash taken out of the drawer (postage-due, petty). Password (optional), Cashier, Description (free-text if RICS.CFG `ValidatePayouts=N`, else must pick from a curated list), Amount. Prints on Cash Totals recap.

**Register reports owned here** (Ch. 2)
- **p. 41, Print Sales by Time** — two date ranges side-by-side for comparison; hourly qty + $; posted / unposted / both; Print % of Total. (Note: registry also cites this in `sales-reporting`; `sales-pos` owns the *register-side* realtime view; deep historical analysis is in `sales-reporting`.)
- **p. 42, Print Salesperson Summary** — at the register (Cash Totals), summary by salesperson for the current batch (qty, $, perks). Cross-batch / date-range version is in `sales-reporting`.
- **p. 44, Print Sales Journal** — daily detailed listing per day × store × register. Must print before Post Sales to Inventory. Sales Journal may be run repeatedly until posted; post is one-way. Date-range acts as a filter — blank = all unposted.
- **pp. 45–46, Post Sales to Inventory** — deducts sold items from inventory; marks tickets posted. Preconditions: Sales Journal printed for the selected range, previous fiscal month closed (sales for March cannot post until February close). Options: `Print negative on-hand report`, `Print A/R Detail`. Reasons sales don't post: not journalled, wrong store, outside date range. Sales for a *future* month warn and offer to post into current month.
- **p. 47, Print Sales Tax Recap** — sales and taxes summarized by customer's state (for mail-order / catalog multi-state remittance). Store/State and State/Store orderings. Calculation source: ticket totals vs. ticket detail lines (with the line-level rounding example — 2 × $10.95 @ 8% → calculated $1.76 vs. collected $1.75).
- **pp. 47–49, Reprint Posted Sales** — reprint from saved sales file in journal format; all batches totaled, markdown/GP omitted. Individual ticket reprint available (Store, Ticket, Date → `[Print]` or `[Print Gift Receipt]`). `Print Special Tickets Only` checkbox filters to unmatched-price and/or with-returns.
- **p. 50, Print Returned Sales** — track returns. Date range, posted/unposted, sort by SKU/Category/Vendor/Cashier/Salesperson/Return Code, Combine Stores, Include Price, Include Only Trackable Returns (per Return Code setup), Include Return Code Subtotals.
- **p. 51, Promotion Code Analysis** — sales using promotion codes vs. promotion cost → response rate and profit per promo. Combine Stores should normally be on; otherwise response rate is not calculated.
- **p. 52, Sales By Day** — compare current range to 52-weeks-ago / N-days-ago / N-weeks-ago; pick Week Ends On day; Combine Stores.
- **p. 52, Change Sales Passwords** — register-side password maintenance for Manager Password (close batch / Manager Options / pay out) and Ticket Password (void / return / price change / perks / discount). Separate from the user-auth `employees` admin UI — this is a cashier quick-change surface.

**Register-facing bits of Ch. 13** (customer-facing register flow only)
- **p. 180, Logout From System** — log out of the current cashier session so the drawer can't be operated by someone else. Everything else in Ch. 13 (Copy From POS Diskette p. 173, Send Messages to Stores p. 173, Call POS Registers p. 173, Poll POS Registers via Internet p. 174, Backup Files for POS p. 176, Copy to POS Diskette p. 177, Communicate with Main p. 178, Import Internet Sales p. 180) is legacy sync infrastructure — **dropped** per `MODULES.md`.

## Modernization decisions

- **No "main vs. POS" computer split. Cloud sync replaces Ch. 13.** RICS assumes two classes of machine (main inventory computer + POS registers) and ~8 pages of sync plumbing to move tickets between them (Copy From POS Diskette, Call POS, Poll via Internet, Copy to POS Diskette, Communicate with Main). Zack's Retail makes the register a web client writing directly to the same Postgres runtime. A ticket is visible everywhere the instant it is saved. This collapses Ch. 13 to a login/logout concern.
- **"Post Sales to Inventory" becomes a ledger semantic, not a manual batch step** (RICS pp. 45–46). Zack's Retail records every ticket-line into the `inventory` movement ledger at ticket-end time, tagged with a `postingStatus = POSTED | PENDING_POST`. Two modes per store:
  - **Real-time mode (default)**: `postingStatus = POSTED` at ticket end; on-hand updates live. The Sales Journal and Post Sales screen still exist for auditability but are a retroactive report + a state transition, not a deduction event.
  - **Batch mode (opt-in per store in Company Setup)**: `postingStatus = PENDING_POST` at ticket end; an explicit Post Sales to Inventory action flips the batch to `POSTED` and emits the ledger write. This preserves RICS's "post once a day" operating model for shops that still want it.
  The underlying ledger is the single source of truth in both modes. The Sales Journal is a read over that ledger.
- **Batch of Sales → Shift.** RICS's "batch of sales" maps 1:1 onto a modern **Shift**: (storeId, registerId, openedAt, openedByUserId, openingCashFloat, closedAt, closingCashCount, overShort, status). Every ticket, pay out, drawer event carries a `shiftId`. Replaces the implicit state of "there is one open batch per store".
- **Register as a first-class entity.** RICS lets "any letter A–Z" be a register per store (p. 5955 Communications Setup). Zack's Retail models `Register` as a row under Store with a stable identifier; each browser session associates to a register by login. Multi-register per store falls out naturally; RICS.CFG's one-register default goes away.
- **Cash drawer is hardware-optional.** RICS assumes a physical drawer wired to COM port or printer pass-through with decimal-code strings (p. 23). The modern register supports:
  - No drawer (browser-only register — common for phone/desktop test).
  - OPOS / webUSB / webHID drawer on supported browsers (Chrome/Edge).
  - Printer-triggered drawer via the receipt printer driver (unchanged in spirit).
  Drawer wiring is per-register configuration in `platform`, not RICS.CFG. The Count Money screen works identically whether or not a physical drawer is wired.
- **Receipt is rendered in-browser and optionally printed.** RICS's 40-col receipt format, `# Lines on receipt`, `# Lines to print`, Bold/Large message flags (pp. 22–23) map to a **receipt template** (handlebars-style) owned per-store. Browser-side print via ESC/POS-over-USB for a thermal printer OR plain PDF download OR email-a-receipt for remote customers. Beginning/Ending Receipt Messages become template variables; Additional Ending Messages (p. 24) become conditional template blocks keyed on transaction type / tender type.
- **Keypress codes become real UI.** RICS's `[Alt]+[S] Save`, `[Alt]+[V] Void`, `[F4] Save/Next SKU`, `[F5] Save/Tender`, `[Ctrl]+[P] Lookup` (pp. 31–33) are a complete keymap. Zack's Retail:
  - Renders labelled buttons for every action.
  - Exposes a **cashier keymap** in user preferences (`platform`), seeded with sensible defaults that echo the RICS muscle memory (Alt+S/V/T for seasoned cashiers).
  - Scanner support is just keyboard input into the UPC field — no driver setup (the `Percon PT2000` flow in Ch. 1 goes away).
- **Customer Account number lookup is online, not typed.** RICS types a numeric account (p. 30). Zack's Retail lets the cashier search by last name / phone / email / account #, via a typeahead that calls `crm`. The account # stays as the durable FK.
- **Promotion Code is applied from a picker, not remembered.** RICS asks the cashier to know the promo code (pp. 30, 33). Zack's Retail lists currently-active promotions (from `products`) in a picker on the header, and also allows manual code entry for unlisted / one-off codes.
- **Continued Tickets (tender #99) are modelled as a parent `TicketChain`.** RICS uses a magic tender code `99` to link two tickets (p. 33). In the new model the second ticket references `parentTicketId` and the chain is atomic: voiding one voids all, balances roll up to the last link in the chain at tender time. Tender 99 becomes a UI action ("Continue on next ticket") that materializes the linkage — no magic number exposed to the user.
- **Currency Options move from RICS.CFG gate to a store feature flag.** RICS hides the entire screen unless an operator edits `RICS.CFG` (p. 25). In Zack's Retail, each store has `secondaryCurrencyEnabled: boolean` + `{ rate, printOnReceipt, decimals, changeCurrencyDefault }` under Company Setup. The Tender screen renders the dual-column tender grid when the flag is on; otherwise it's a single column.
- **Register override challenges move to employee-scoped PINs owned by `employees`.** RICS's Change Sales Passwords screen (p. 52) maintained two shared per-store passwords. Zack's Retail replaces that with employee-scoped override PINs and short-lived override tokens issued by `employees`, so every close-batch, payout, void, refund, price-change, perks, and discount challenge is attributable to a real employee instead of to a shared store secret.
- **Pay Out description — curated list is the only mode.** RICS has a config flag `ValidatePayouts` (p. 35) that flips free-text vs. list. Zack's Retail always requires a list pick + an optional freeform note. Eliminates a stray RICS.CFG entry and forces category hygiene. Payout categories are maintained by `store-ops` (tiny admin screen).
- **Over/Short becomes a dedicated ledger concept.** RICS tracks it implicitly as the difference between Cash Count (Deposit) and expected cash, adjusted by drawer-difference (p. 26). Zack's Retail surfaces an explicit `OverShortEntry` per closed shift, signed, with an approving manager. Feeds `accounts-receivable` GL Summary directly (replaces the "G/L Summary entries when there is a difference" note on p. 26).
- **Reprint Posted Sales + Returned Sales + Promotion Code Analysis + Sales Tax Recap + Sales By Day stay in this module** (per the registry) — they are register-generated data slices that a manager needs at shift/day boundaries, not seasonal merchandising analysis. The heavier cross-period / cross-store analytics (Sales Analysis, 8-Week Trending, Best Sellers, Sales History by Month, Stock Status, Size-Type Analysis, Sales Journal as a historical surface) live in `sales-reporting`.
- **Salesperson Summary splits in two.** The at-the-register batch-scope summary (p. 1332 `[Salesperson Summary]` button on Close Batch) lives here. The date-ranged / criteria-rich Print Salesperson Summary report (p. 42) lives in `sales-reporting`. Both read the same ticket data.
- **Tender #99 Continued, #10 Gift Cert, #11 Store Credit are *semantic* tender kinds, not magic integers.** Reserve a `TenderKind` enum (CASH / CHECK / CARD / GIFT_CERT / STORE_CREDIT / HOUSE_CHARGE / CONTINUATION / OTHER) on the store-ops `TenderType` row. `sales-pos` looks up behavior by kind, not by hard-coded ID. This lets `store-ops` model any number of card processors without breaking the register flow.
- **Tax edit on Tender stays — with audit.** RICS lets the cashier overwrite tax at tender time (p. 33). Zack's Retail keeps this but logs it in `TicketTaxOverride` with user + before/after. Feeds Sales Tax Recap as a reconciliation line.
- **Other Charges remains, renamed per store.** RICS's `Other Charge Description` (p. 142, default "Other Charges", configurable to "Shipping", etc.) survives as `StoreSettings.otherChargeLabel`. The per-register override via local RICS.CFG goes away (central setting only).
- **Coupon SKU behavior preserved.** RICS's Coupon SKU flag (p. 5756, see `products` module) makes the SKU default to `qty = -1` on sale. Keep this: on Ticket Detail, `Sku.isCoupon = true` seeds the line with `qty = -1` and skips tax. No separate discount primitive for coupons.
- **Perks flow to the salesperson via contract, not by side-effect.** RICS sets SKU perks on the SKU row and "auto-posts to the salesperson" at sale time (p. 155, `products` module). Zack's Retail emits a `SaleLineCommittedEvent` at ticket end; `employees` subscribes and writes the perk.
- **Receipt `# Lines` padding disappears.** `# Lines on receipt` / `# Lines to print` (p. 22) assumes a pre-printed perforated paper roll. The browser template prints what it prints; line padding is a print-style concern, not a data concern. Drop as config; leave as a template-level attribute if someone asks.
- **Automatically Post under Manager Options — dropped.** RICS warned "This should be left unchecked. If you have a network, contact your support person" (p. 22). The semantics are now governed by the store's real-time vs. batch posting mode above; the ambiguous Manager Option goes away.
- **Receipt Format 40-col — template-level, not a switch.** RICS has essentially one format (p. 22). Zack's Retail supports multiple templates per store; 40-col-thermal is the default seed template.

## Data model sketch

```prisma
// --- Shifts (RICS "batch of sales") --------------------------------------

model Shift {                                     // pp. 25–26 Start/Close Batch
  id                    String   @id @default(uuid())
  storeId               Int
  registerId            String                    // FK Register (new entity)
  openedAt              DateTime
  openedByUserId        String
  openingCashFloat      Decimal                   // Starting Cash Drawer Amount (p. 26)
  closedAt              DateTime?
  closedByUserId        String?
  closingCashCount      Decimal?                  // Ending Cash Drawer Amount (p. 27)
  closingDepositCount   Decimal?                  // Cash Count (Deposit) (p. 26)
  expectedCashAtClose   Decimal?                  // computed from tickets + payouts + float
  overShortAmount       Decimal?                  // closingCashCount + deposit − expected
  overShortApprovedBy   String?                   // manager userId, for signed off over/short
  status                ShiftStatus               // OPEN | CLOSING | CLOSED | VOIDED
  postingMode           PostingMode               // REALTIME | BATCH (inherited from store at open)
  postedAt              DateTime?                 // Post Sales to Inventory committed (batch mode only)
  lastTicketNumberUsed  Int                       // p. 25 Last ticket #
  notes                 String?

  tickets               SalesTicket[]
  payouts               PayOut[]
  drawerCounts          DrawerTenderCount[]

  @@index([storeId, openedAt])
  @@index([registerId, status])
}

model Register {                                  // New entity — replaces RICS A–Z register letter (p. 5955)
  id          String   @id                        // human code, e.g. "A", "CHECK-1", "MAIN"
  storeId     Int
  label       String
  drawerKind  DrawerKind                          // NONE | OPOS | WEBUSB | PRINTER_TRIGGERED
  drawerConfigJson Json?                          // printer decimal codes, COM/HID id, etc.
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())

  shifts      Shift[]
  @@index([storeId])
}

// --- Sales ticket framework (the polymorphic core) ----------------------

model SalesTicket {                               // Ticket Header (p. 30)
  id                  String   @id @default(uuid())
  ticketNumber        Int                         // local to store + business date (p. 25)
  storeId             Int
  registerId          String
  shiftId             String
  businessDate        DateTime                    // calendar day of the shift
  createdAt           DateTime @default(now())
  endedAt             DateTime?                   // null until [End Sale]

  transactionType     TransactionType             // discriminator (p. 28): REGULAR | USER_DEFINED |
                                                  //   SPECIAL_ORDER_PICKUP | LAYAWAY_SALE |
                                                  //   GIFT_CERT_SALE | HOUSE_CHARGE_PAYMENT |
                                                  //   SPECIAL_ORDER_DEPOSIT | LAYAWAY_PAYMENT
                                                  // (3–8 extended by `customer-transactions`)

  cashierUserId       String
  customerAccountId   String?                     // FK → crm.Customer; required when Sales Ticket Options says so
  headerDiscountPct   Decimal?                    // p. 30 ticket-level discount
  promotionCode       String?                     // p. 30 / p. 33
  familyMemberId      String?                     // header-level default; per-line override exists

  // Tender + totals are denormalized for read perf; source of truth is the child rows
  subtotal            Decimal
  taxTotal            Decimal                     // final applied tax (may differ from line-sum if overridden at tender)
  taxOverrideReason   String?                     // audit: set when cashier edits tax at tender (p. 33)
  otherCharges        Decimal  @default(0)        // Other Charges (p. 33)
  otherChargesLabel   String?                     // snapshot of store.otherChargeLabel at time of sale
  grandTotal          Decimal
  changeGiven         Decimal  @default(0)
  comment             String?                     // Ticket Comment (p. 33)

  // Lifecycle + linkage
  parentTicketId      String?                     // for Continued chain (tender #99, p. 33)
  continuationHeadId  String?                     // root of chain, for atomic void
  voidedAt            DateTime?
  voidedByUserId      String?
  voidPasswordUsed    Boolean  @default(false)
  reclaimedFromTicketId String?                   // Ticket Reclaim (p. 34)

  // Posting
  postingStatus       PostingStatus               // REALTIME_POSTED | PENDING_POST | BATCH_POSTED | VOIDED_UNPOSTED
  postedAt            DateTime?

  // Receipts
  receiptPrintCount   Int      @default(0)

  lines               SalesTicketLine[]
  tenders             SalesTicketTender[]
  taxLines            SalesTicketTax[]            // per-tax-code breakdown (store may have 1–3 taxes per p. 141)
  auditEvents         TicketAuditEvent[]

  // Pointer to the per-type extension record owned by `customer-transactions`
  specialOrderExtId   String?                     // → customer-transactions.SpecialOrder
  layawayExtId        String?                     // → customer-transactions.Layaway
  houseChargeExtId    String?                     // → customer-transactions.HouseChargeTxn
  giftCertSaleExtId   String?                     // → customer-transactions.GiftCertSale

  @@unique([storeId, businessDate, ticketNumber]) // RICS ticket-numbering pattern
  @@index([shiftId])
  @@index([customerAccountId])
  @@index([postingStatus, businessDate])
  @@index([transactionType, businessDate])
}

model SalesTicketLine {                           // Ticket Detail (pp. 31–32)
  id                  String   @id @default(uuid())
  ticketId            String
  lineNumber          Int
  lineKind            LineKind                    // MERCHANDISE | COUPON | COMMENT_ONLY
  skuId               String?                     // null for COMMENT_ONLY
  skuCodeSnapshot     String?                     // preserve SKU code even if SKU later discontinued
  columnLabel         String?                     // SizeType coord (products module)
  rowLabel            String?
  quantity            Int                         // negative = refund (p. 34); auto −1 for Coupon SKU
  unitPrice           Decimal                     // snapshot; may differ from current master price
  priceSlotUsed       String?                     // RETAIL | MARKDOWN1 | MARKDOWN2 | NEXT_PRICE_OVERRIDE | MANUAL
  lineDiscountPct     Decimal?
  lineDiscountAmount  Decimal?
  perksAmount         Decimal  @default(0)        // from SKU; can be set manually if Allow Perks
  salespersonUserId   String                      // defaults from cashier, per-line override (p. 32)
  familyMemberId      String?                     // per-line override (p. 32)
  returnCodeId        Int?                        // p. 32; required when qty < 0 and return-code tracking on
  taxable             Boolean  @default(true)     // per-line tax override (p. 32)
  comment             String?                     // prints on receipt
  extendedNet         Decimal                     // qty * unitPrice − discount
  extendedTax         Decimal                     // calculated at line level (for Sales Tax Recap ticket-detail mode)

  @@index([ticketId, lineNumber])
  @@index([skuId])
  @@index([salespersonUserId])
}

model SalesTicketTender {                         // Ticket Tender (p. 33)
  id                String   @id @default(uuid())
  ticketId          String
  sequence          Int                           // up to 4 split tenders per ticket (p. 33)
  tenderTypeId      String                        // FK store-ops.TenderType
  tenderKind        TenderKind                    // snapshot of the kind; avoids joins for reporting
  amount            Decimal                       // can be negative (refund)
  foreignCurrencyAmount Decimal?                  // for Currency Options (p. 25)
  accountNumber     String?                       // Store Credit / House Charge reference
  giftCertNumber    String?                       // + sequence for Gift Cert redeem (p. 40 / customer-transactions)
  authReference     String?                       // card processor ref, check #, etc. (free-text in RICS)
  isContinuation    Boolean  @default(false)      // true when this tender is the virtual #99 continuation
  @@index([ticketId, sequence])
}

model SalesTicketTax {                            // Tax breakdown per store/tax (p. 141 — up to 3 taxes)
  id             String  @id @default(uuid())
  ticketId       String
  taxCode        String
  taxRate        Decimal
  taxableBase    Decimal
  taxAmount      Decimal
}

model TicketAuditEvent {                          // Void / Reclaim / Tax Override / Price Override / Password
  id          String   @id @default(uuid())
  ticketId    String
  eventType   TicketEventType
  actorUserId String
  payloadJson Json
  createdAt   DateTime @default(now())
}

// --- Pay Outs + Drawer counts --------------------------------------------

model PayOut {                                    // p. 35
  id              String   @id @default(uuid())
  shiftId         String
  cashierUserId   String
  categoryId      String                          // FK PayoutCategory (store-ops)
  categoryLabel   String                          // snapshot
  amount          Decimal
  note            String?
  createdAt       DateTime @default(now())
  @@index([shiftId])
}

model DrawerTenderCount {                         // Count Money (pp. 26–27)
  id            String   @id @default(uuid())
  shiftId       String
  tenderTypeId  String
  tenderKind    TenderKind
  countedAmount Decimal
  expectedAmount Decimal                          // from tickets (computed on close)
  difference    Decimal                           // countedAmount − expectedAmount
  detailJson    Json?                             // per-denom (bills/coins) for cash; per-item list for checks
  @@unique([shiftId, tenderTypeId])
}

// --- Receipt templates + Sales Passwords ---------------------------------

model ReceiptTemplate {                           // replaces Manager Options receipt-message config (pp. 22–23)
  id           String  @id @default(uuid())
  storeId      Int
  code         String                             // e.g. "40COL_THERMAL"
  isDefault    Boolean
  handlebars   String                             // full template (header msgs, body, footer msgs)
  paperWidthCols Int                              // 40 in the RICS default
  @@unique([storeId, code])
}

model SalesPassword {                             // p. 52 Change Sales Passwords (register-side)
  id          String   @id @default(uuid())
  storeId     Int
  kind        SalesPasswordKind                   // MANAGER | TICKET
  hash        String
  updatedAt   DateTime @updatedAt
  updatedByUserId String
  @@unique([storeId, kind])
}

// --- Enums ---------------------------------------------------------------

enum TransactionType {
  REGULAR                // 1
  USER_DEFINED           // 2 — preserved; defaults to behaving like REGULAR
  SPECIAL_ORDER_PICKUP   // 3 — customer-transactions
  LAYAWAY_SALE           // 4 — customer-transactions
  GIFT_CERT_SALE         // 5 — customer-transactions
  HOUSE_CHARGE_PAYMENT   // 6 — customer-transactions
  SPECIAL_ORDER_DEPOSIT  // 7 — customer-transactions
  LAYAWAY_PAYMENT        // 8 — customer-transactions
}

enum LineKind           { MERCHANDISE  COUPON  COMMENT_ONLY }
enum TenderKind         { CASH  CHECK  CARD  GIFT_CERT  STORE_CREDIT  HOUSE_CHARGE  CONTINUATION  FOREIGN_CURRENCY  OTHER }
enum PostingMode        { REALTIME  BATCH }
enum PostingStatus      { REALTIME_POSTED  PENDING_POST  BATCH_POSTED  VOIDED_UNPOSTED }
enum ShiftStatus        { OPEN  CLOSING  CLOSED  VOIDED }
enum DrawerKind         { NONE  OPOS  WEBUSB  PRINTER_TRIGGERED }
enum TicketEventType    { VOID_MID  VOID_POST_END  RECLAIM  TAX_OVERRIDE  PRICE_OVERRIDE  PASSWORD_CHALLENGE  COMMENT_EDIT }
enum SalesPasswordKind  { MANAGER  TICKET }
```

Notes on the polymorphism:
- `SalesTicket` carries the discriminator (`transactionType`) and the four nullable extension-FK slots (`specialOrderExtId`, `layawayExtId`, `houseChargeExtId`, `giftCertSaleExtId`). `customer-transactions` owns those tables and references `SalesTicket.id` back. Both sides hold FKs so a ticket can be traversed in either direction.
- `SalesTicketLine.lineKind` is extensible. `customer-transactions` will add `DEPOSIT_LINE`, `LAYAWAY_PAYMENT_LINE`, `GIFT_CERT_SALE_LINE`, `HOUSE_PAYMENT_LINE` without changing the ticket framework.
- `SalesTicketTender.tenderKind = CONTINUATION` models RICS's tender #99 without a magic integer.
- Per-type reports (Print Special Orders, Print Layaways, Print House Payments/Charges, Print Gift Certificate Activity) live in `customer-transactions` and query `SalesTicket` by `transactionType`.

## API surface

**Shift lifecycle (Batch of Sales)**
- `POST   /api/v1/pos/shifts/open` — open a shift `{ storeId, registerId, openingCashFloat, lastTicketNumberUsed? }` (p. 25)
- `GET    /api/v1/pos/shifts/:id` — shift detail + running totals
- `GET    /api/v1/pos/shifts?storeId=&status=OPEN` — currently-open shifts per store
- `GET    /api/v1/pos/shifts/:id/cash-totals` — compute Cash Totals recap (sales recap + cash drawer recap + void summary) (p. 23)
- `POST   /api/v1/pos/shifts/:id/counts` — submit per-tender-type counts `{ tenderTypeId, countedAmount, detailJson? }[]` (pp. 26–27)
- `POST   /api/v1/pos/shifts/:id/close` — close the shift; body `{ closingCashCount, closingDepositCount, overrideToken?, overShortApprovedBy? }` (p. 26)
- `POST   /api/v1/pos/shifts/:id/open-drawer` — kick the drawer without a sale (p. 23)
- `POST   /api/v1/pos/shifts/:id/post` — (batch-mode only) trigger Post Sales to Inventory (p. 45)
- `GET    /api/v1/pos/shifts/:id/sales-journal` — Sales Journal for this shift (p. 44)

**Ticket lifecycle (Header → Detail → Tender → End)**
- `POST   /api/v1/pos/tickets` — create header `{ shiftId, transactionType, cashierUserId, customerAccountId?, headerDiscountPct?, promotionCode? }`
- `GET    /api/v1/pos/tickets/:id` — full ticket
- `PATCH  /api/v1/pos/tickets/:id/header` — change header fields (only before End)
- `POST   /api/v1/pos/tickets/:id/lines` — add line (merchandise / comment / coupon)
- `PATCH  /api/v1/pos/tickets/:id/lines/:lineId` — modify line
- `DELETE /api/v1/pos/tickets/:id/lines/:lineId` — remove line (Ticket Review remove, p. 34)
- `POST   /api/v1/pos/tickets/:id/lines/:lineId/reverse` — `[Reverse Qtys]` (p. 32)
- `POST   /api/v1/pos/tickets/:id/lines/:lineId/next-price` — `[Next Price]` cycle (p. 32)
- `POST   /api/v1/pos/tickets/:id/tenders` — add a split tender (up to 4)
- `POST   /api/v1/pos/tickets/:id/continue` — start a Continued chain (RICS tender #99) — returns new child ticket id (p. 33)
- `POST   /api/v1/pos/tickets/:id/complete` — `[End Sale]` — prints receipt, opens drawer, transitions status (p. 33)
- `POST   /api/v1/pos/tickets/:id/void` — mid-ticket or post-end void (p. 35, p. 51); body: `{ overrideToken?, reason? }`
- `POST   /api/v1/pos/tickets/:id/reclaim` — reclaim a voided ticket in the current batch (p. 34)
- `POST   /api/v1/pos/tickets/:id/reprint` — reprint in current batch (p. 34) OR posted (p. 47, see below)
- `POST   /api/v1/pos/tickets/:id/tax-override` — cashier edits tax at tender time; audit-logged (p. 33)

**Lookup / scan helpers**
- `GET    /api/v1/pos/resolve-upc/:upc` — forwards to `products.resolveUpc` + current price + on-hand preview
- `GET    /api/v1/pos/customer-search?q=` — forwards to `crm` for typeahead
- `GET    /api/v1/pos/active-promotions?storeId=` — for the promo picker on header

**Pay Outs**
- `POST /api/v1/pos/payouts` — body `{ shiftId, cashierUserId, categoryId, amount, note? }` (p. 35)
- `GET  /api/v1/pos/payouts?shiftId=` — list for a shift

**Sales Passwords (employee override path)**
- `POST /api/v1/employees/sales-passwords/verify` — verify the override PIN for void / close-batch / refund / payout / price-change challenges
- `POST /api/v1/employees/sales-passwords/consume-token` — consume the one-time override token on the protected mutation

**Register management**
- `GET|POST|PATCH /api/v1/pos/registers` — register CRUD
- `POST /api/v1/pos/registers/:id/drawer-test` — hardware test (kicks drawer, prints test receipt)

**Receipt templates + Manager Options**
- `GET|PUT /api/v1/stores/:storeId/receipt-template` — beginning/ending messages, line counts, tax-print mode
- `GET|PUT /api/v1/stores/:storeId/manager-options` — default tender, default transaction, auto ticket #, allow perks, allow discounts, posting mode
- `GET|PUT /api/v1/stores/:storeId/sales-ticket-options` — required account # per transaction type, required account # per tender type, auto-reprint rules, additional ending messages
- `GET|PUT /api/v1/stores/:storeId/currency-options` — enable second currency, rate, decimals, change-currency

**Register reports (the ones the registry assigns here)**
- `GET /api/v1/pos/reports/sales-tax-recap?storeId=&from=&to=&mode=STORE_STATE|STATE_STORE&source=TOTALS|LINES` (p. 47)
- `GET /api/v1/pos/reports/sales-by-day?storeId=&from=&to=&compareMode=52W|NDAYS|NWEEKS&compareValue=&weekEndsOn=` (p. 52)
- `GET /api/v1/pos/reports/returned-sales?from=&to=&sort=SKU|CAT|VEN|CASH|SP|RETCODE&combineStores=&includePrice=&trackableOnly=` (p. 50)
- `GET /api/v1/pos/reports/promotion-code-analysis?promotionCodes=&stores=&from=&to=&combineStores=` (p. 51)
- `GET /api/v1/pos/reports/reprint-posted-sales?storeId=&from=&to=&specialOnly=&unmatchedPrice=&withReturns=` (p. 47)
- `GET /api/v1/pos/reports/reprint-posted-ticket?storeId=&ticketNumber=&date=&giftReceipt=` (p. 49)
- All reports support `?format=csv|pdf` and share the posted/unposted/both filter.

## Integration points

**Reads**
- **`products`** — `getSku(code|upc)` for line entry; `resolveUpc(upc)` for UPC scan; `getCurrentPrice(skuId, storeId, now)` for the default line price and `[Next Price]` cycle; `SkuOversizePricing` for column-threshold surcharge (p. 156); per-SKU `perksAmount` and `isCoupon` flag; `PromotionCode` list for the promo picker; `ReturnCode` list for refund lines; `SizeType` columns/rows for the grid (identical shape to `purchasing`).
- **`inventory`** — `getOnHand(skuId, storeId, columnLabel?, rowLabel?)` for the Inventory Inquiry panel (pp. 53–54); on-order + model + short for the "from Sales" inquiry overlay; negative-on-hand warning for the post-sales flow (p. 45).
- **`crm`** — `Customer.find(query)` for account lookup; `Customer.storeCreditBalance(customerId)` for the Store Credit tender prompt (p. 35); `Customer.houseChargeBalance` for display at tender (p. 40); quote lookup `Customer.activeQuotes(customerId)` so a cashier can convert a quote to a ticket; frequent-buyer stamp (points/$ accrual) on `SaleLineCommittedEvent`.
- **`employees`** — user authentication (cashier login); `getUser(userId)` for the salesperson picker on line detail; commission/perk-receive contract (`employees` subscribes to events, no direct call from here).
- **`store-ops`** — `Store.taxes[]` (up to 3 taxes per p. 141); `TenderType` catalog (per-store enabled set, `isConsideredCash`, `opensDrawer`, `tenderKind`, `requireAccountNumber`); `PayoutCategory` list; `StoreSettings.otherChargeLabel`; `CasePack` (not used on sales side but read by `customer-transactions` for special orders); `Company.postingMode`, `Company.futureOrderThresholdDays` (read by `purchasing`, not here); `Company.currencyOptions`.

**Writes / events emitted**
- **`inventory`** — via `PurchasingContractAdapter`-style sibling `SalesContractAdapter`. Emits:
  - `TicketLineCommittedEvent { ticketId, lineId, skuId, storeId, column, row, qty, unitCost, effectiveDate }` on ticket End. Inventory writes a movement-ledger row (`MovementType = SALE` or `RETURN` for negative qty).
  - `TicketVoidedEvent { ticketId }` — inventory reverses previously-applied ledger rows if the ticket had posted in realtime mode.
  - `BatchPostedEvent { shiftId }` — in batch mode, fires one bulk ledger write per shift.
- **`products`** — subscribes to `TicketLineCommittedEvent` to update `SkuAverageCost` only on REFUND with a positive-qty-return that rebalances cost? — **no**: avg cost is purchase-side only. Sales events do not touch avg cost. (Noted here explicitly to avoid accidental coupling.)
- **`crm`** — subscribes to `TicketEndedEvent` → Mail Detail append (p. 32 Family Member, Ticket Comment, line history); on `store_credit` tender → customer balance decrement; on Gift Certificate redemption → certificate balance decrement (via `customer-transactions`, not directly).
- **`employees`** — subscribes to `TicketLineCommittedEvent` for perks accrual and salesperson commission; subscribes to `ShiftOpenedEvent` / `ShiftClosedEvent` for time-clock correlation (optional).
- **`accounts-receivable`** — subscribes to `ShiftClosedEvent` and `BatchPostedEvent` for GL Summary categories: Cash, Non-Cash, House Accounts, Special Orders, Layaways, Gift Certificates, Sales Tax, Sales, Cost of Goods Sold, Other Charges, Payouts, Over/Short (p. 100, per `accounts-receivable` spec). Also reads `PayOut`, `OverShortEntry`, and tender totals.
- **`customer-transactions`** — creates `SalesTicket` rows with `transactionType ∈ {3,4,5,6,7,8}` via this module's contract `createTicketFrom(input)` (see below); reads `SalesTicket` for its per-type reports.
- **`sales-reporting`** — reads `SalesTicket`, `SalesTicketLine`, `SalesTicketTender` as its fact tables for Sales Analysis, 8-week trending, etc.

**Contracts exposed (outbound)**
- `createTicket(input)` — returns a ticket ID in `DRAFT` header state. Used by `customer-transactions` to start a special order / layaway / gift cert / house charge / payment.
- `appendTicketLine(ticketId, line)` — idempotent by line payload hash; used by `customer-transactions` + internal UI.
- `applyTender(ticketId, tender)` — validates against store `TenderType` rules; used by the same.
- `endTicket(ticketId, { printReceipt?, openDrawer? })` — atomic commit; emits events.
- `voidTicket(ticketId, { reason, password? })`.
- `reprintTicket(ticketId, { giftReceipt?, channel: PRINT | PDF | EMAIL })`.
- `reclaimVoidedTicket(ticketId)` — same-batch only.
- `getShiftCashTotals(shiftId)` — Sales Recap + Cash Drawer Recap + Void Summary.
- **Events emitted** (summary):
  - `ShiftOpenedEvent`, `ShiftClosedEvent`, `ShiftPostedEvent`
  - `TicketHeaderCreatedEvent`, `TicketLineCommittedEvent`, `TicketEndedEvent`, `TicketVoidedEvent`, `TicketReclaimedEvent`
  - `PayOutRecordedEvent`, `OverShortRecordedEvent`
  - `BatchPostedEvent`

**Events consumed**
- `SkuDiscontinuedEvent` from `products` — if an open ticket's line references a now-discontinued SKU, remap on next save (RICS p. 2071 handles this as a Sales Journal error; we prevent it earlier).
- `PriceChangeAppliedEvent` from `products` — invalidate any cached current-price lookup on the register (per-store).
- `StoreTaxChangedEvent` from `store-ops` — same (p. 5185 warns store tax changes don't take effect until batch close; in the new model we invalidate immediately for fresh tickets but freeze tax on already-open tickets).
- `CustomerAccountMergedEvent` from `crm` — rewrite dangling `customerAccountId` on open tickets.

## Open questions / deferred

1. **Ticket numbering — per (store × business date) or per (store × shift)?** RICS uses `Last ticket #` as a monotonic counter across the whole store (p. 25) — the same counter on the next day just keeps going. Spec has it as `(storeId, businessDate, ticketNumber)` unique; revisit to match RICS muscle memory exactly or adopt a per-shift reset with a separate human-readable prefix. Recommendation: keep per-store monotonic across days (matches RICS), but surface a "today's count" badge in the UI for the cashier.
2. **Real-time vs. batch posting — per-store or per-register?** Spec makes it per-store via Company Setup. A chain with a mix of training registers and production registers might want per-register; revisit if users ask.
3. **Continued Ticket atomicity — void propagates up or down the chain?** RICS says "if any part of a continued ticket is voided, the entire transaction will be voided" (p. 33). Clear enough for 2-link chains; for 3+ the exact rollback order isn't in the manual. Proposed: void the entire chain atomically regardless of which link was voided; all links flip to `VOIDED_UNPOSTED` in one transaction.
4. **Tender #99 / Continuation — one carry-forward balance or an explicit "pay once"?** RICS charges the customer at the last link in the chain, and the earlier links' tenders are just "marker" #99 rows. Clean modelling: the parent ticket has a `CONTINUATION` pseudo-tender for its grand total; the child ticket starts with a balance equal to (parent grand_total − parent real-tenders) and is tendered normally at End. Confirm with users before implementing.
5. **Currency Options scope — per store or per register?** RICS treats it as a global gate via `RICS.CFG`. Modern stores near a border (dual-currency) might want per-register — and the spec is per-store. Revisit.
6. **Cash Drawer "Attached to Printer" decimal codes** (p. 23) — RICS pre-configures STAR (`07`) and EPSON (`27,112,0,25,250`). Port these as seed receipt-template variants keyed on printer family, or drop and require per-store printer config? Current plan: seed; allow override per register.
7. **"User Defined" transaction type (code 2)** — RICS allocates this slot without describing it (p. 28). Our enum preserves it for data round-trip; behavior defaults to REGULAR. Confirm with users whether any real workflow uses it before shipping.
8. **`Automatically Post` Manager Option** (p. 22) — RICS warns not to touch it without support. Dropped in this spec (replaced by store.postingMode). Confirm no production Zack's deployment relies on the old flag's semantics before removing the data migration path.
9. **Per-store tax change propagation to open shifts** (p. 5185) — RICS forces a batch close before a tax change takes effect. Modern model applies new tax rates to *new* tickets immediately but freezes already-open tickets to their opening rate. Need to confirm this matches operator expectations (and whether `StoreTaxChangedEvent` should include an effective-date to let already-queued tickets pick their rate deterministically).
10. **Over/Short categorical breakdown.** GL Summary (in `accounts-receivable`) wants Cash Over/Short as one line (p. 100). Our data model has `DrawerTenderCount.difference` per tender type; cash-treated types aggregate to "cash over/short" and non-cash differences are… what? RICS rolls them into Cash Over/Short too (per its G/L categories). Confirm.
11. **Line-level vs. ticket-level tax as the source of truth for Sales Tax Recap** (p. 47). Spec stores both; the report exposes a selector. Default = ticket totals. Recheck the rounding example on p. 47 once we have the first real tax table to ensure our line-level math matches RICS to the cent.
12. **Sales Ticket Options: required account numbers — per transaction type, per tender type, or both?** RICS (p. 24) has two separate required-account-number lists (transaction type AND tender type). Model them both but confirm the UI treats them as OR (either condition fires the prompt) vs. AND.
13. **Family Member lookup surface.** RICS lets a cashier set Family Member per line (p. 32) for mail-detail attribution. Needs a `crm` contract: `Customer.familyMembers(customerId)`. Not in the `crm` spec yet — raise there.
14. **Quote → ticket materialization.** A cashier should be able to pull an active quote (from `crm`) and drop its lines into a new ticket. Not explicitly in RICS Ch. 2 (quotes are in Ch. 9). Propose: add `POST /api/v1/pos/tickets/from-quote/:quoteId` as a convenience endpoint. Defer if quotes v1 doesn't ship in `crm`.
15. **Gift receipt layout.** RICS mentions `Print Gift Receipt` (p. 49) with coded pricing. Need a receipt-template variant that masks prices with a code (e.g., letters for digits). Defer template detail to first real use.
16. **Return Code requirement when `qty < 0`.** RICS makes Return Code conditional on return-code tracking being on (p. 32). Our model allows `returnCodeId?` as optional; enforce at API when `returnCodeTrackingEnabled` store setting is true. Confirm the setting lives in `store-ops`.
17. **Reclaim across registers in the same store.** RICS scopes Reclaim to the *current batch* — which means *the register's open batch*. Our Shift is per-register. Confirm that reclaim is register-scoped, not store-scoped; doc'd as register-scoped in the spec.
18. **Receipt print failures.** RICS assumes the printer works (and offers `[Reprint Ticket]` if it didn't). Modern model: ticket End is transactional (commits regardless of print success); print failure is a printer-side retry through `[Reprint Ticket]`. Confirm.
19. **`Automatically Reprint` for selected transaction types** (p. 24) — default is layaway sale, layaway payment, special-order deposit. These are in `customer-transactions`; this module surfaces the config (`StoreSalesTicketOptions.autoReprintTransactionTypes`) and respects it on End. `customer-transactions` does not need a separate config.
20. **Pay Out category list — seeded or user-defined only?** RICS's list is curated per-store (p. 35). Plan: ship a small seed (`Postage`, `Supplies`, `Petty`, `Refund Adjust`, `Other`) and allow user-defined additions. Confirm before shipping.
