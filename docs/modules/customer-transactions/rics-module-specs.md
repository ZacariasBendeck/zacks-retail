# Module: customer-transactions

**Goal**

`customer-transactions` owns the RICS transaction types that require a customer account and have a lifecycle that extends beyond a single ticket: **Special Orders** (deposit → pickup), **Layaways** (sale → payment(s) → pickup / forfeit), **Gift Certificates** (sale → redemption → maintenance), and **House Charge** (charge → payment). It extends the sales-ticket framework owned by `sales-pos` and binds each lifecycle to a `Customer` record owned by `crm`; where the flow touches money owed to the store or held on the customer's behalf, it reports into `accounts-receivable`. Primary user value: a cashier can take a deposit today, a payment next week, and a pickup the week after — and the system keeps the balance, the customer account, and the inventory reservation coherent across all three events, without the operator having to re-key anything from the original ticket.

This module does **not** own: the regular-sale ticket framework, the batch-of-sales lifecycle, the cash drawer, tender types themselves, post-to-inventory (all `sales-pos`); customer records, family, mailing list, frequent buyer, quotes (all `crm`); A/R account balances, statements, aging, finance charges, dunning (all `accounts-receivable`); SKU pricing, perks, labels (all `products`).

## RICS source mapping

Every RICS behavior ported into this module, with page reference and one-line description.

### Special Orders

| RICS feature | Page | Description |
|---|---|---|
| Special Order — Overview | 36 | Two-part transaction: Deposit (#7) + Pickup (#3); customer account required. |
| Special Order — Deposit | 36 | Record deposit for item not in stock. SKU may be invalid/unknown — description in ticket comments. No inventory deduction, no sale recognition, no salesperson credit until pickup. |
| Special Order — Pickup | 37 | Completes the order. SKU must be valid. Previous-paid shown; remainder tendered. Inventory deducts and sale is recognized on pickup. |
| Special Order — Refund | 37 | Re-enter the deposit ticket with negative quantity and negative tender (matching original amounts). Do NOT negate price. |
| Print Special Orders | 37 | Report by store(s) + date range, from posted and/or unposted sales. Cross-reference to Mail List report. |
| Require Account Numbers for All Special Orders | 21 / 24 | Company-setup toggle forcing account number on Special Order transaction types. |

### Layaways

| RICS feature | Page | Description |
|---|---|---|
| Layaway — Overview | 38 | Two-part transaction: Layaway Sale (#4) + Layaway Payment (#8); customer account required. **Inventory deducts on Layaway Sale**, not on pickup (different from Special Order). |
| Layaway — Payment (Sale) | 38 | Record initial deposit, SKU must be valid, sale recognized and salesperson credited at this step. |
| Layaway — Pickup / Payment | 38 | Subsequent payment against "original ticket #"; shows Originally Due / Less Paid / Balance / New Balance. Final payment = pickup. Alt+D / Mail Detail shows purchase history when original ticket # is unknown. |
| Layaway — Refund | 39 | Re-enter original sale with negative quantity; apply balance to original ticket #; optional layaway fee recorded via Other Charges (Ticket Header tab) (p. 39). |
| Print Layaways | 39 | Same shape as Print Special Orders: store(s) + date range, posted / unposted / both. |
| Require Account Numbers for All Layaways | 21 / 24 | Company-setup toggle. |
| Automatic ticket reprint for Layaway Sale / Payment | 24 | Pre-set default: these ticket types auto-reprint; part of Manager Options. |

### Gift Certificates

| RICS feature | Page | Description |
|---|---|---|
| Gift Certificate — Sale | 40 | Transaction type #5. Ticket Detail captures certificate amount. Customer account optional. If store is "tracking gift certificates," a certificate # is required at sale. |
| Gift Certificate — Redeemed | 40 | Tender type #10 Gift Cert on any ticket. If tracking + requiring cert #, operator is routed to Redeem Gift Certificates screen (cert # + sequence). |
| Gift Certificate Maintenance | 131 | Admin screen: create / edit certificate record out-of-band (e.g. import previously-sold certificates), manually add/edit redemption lines. Fields: Gift Certificate ID, Sequence, Account, Amount, Redeemed, Balance, Purchase Info tab (For Account / Store / Ticket / Date), Redeemed Info tab (grid of store / ticket / date / account / redeemed amount). Buttons: New, Edit, Clear, Save, Save & End, Delete Gift Cert, Exit. |
| Print Gift Certificate Activity | 132 | Report with Report Options (date range, source = posted / unposted / gift-cert-file — mutually exclusive; print all detail; outstanding-balance-only; sort by Cert # or Date; combine stores) + Criteria (stores, purchasing customers, redeeming customers, cert #s). |
| Clear Gift Certificate Data | 116 | Retention purge for fully-redeemed certificates — owned by `platform`, but this module exposes the query. |
| Require Account Numbers for All Gift Certificates | 24 | Company-setup toggle. |

### House Charge

| RICS feature | Page | Description |
|---|---|---|
| House Charge — Sale | 40 | Tender type #9 House Charge on any sale ticket. Customer account always required. Alt+D / Mail Detail shows current house-charge balance + purchase history. Interacts with store-credit tender (#11): if customer has store credit larger than sale, tender only the sale amount and the system keeps the remaining credit on the account. |
| House Charge — Payment | 40 | Transaction type #6 Charge Payment. Ticket Detail captures payment amount; Ticket Tender records how it was paid. |
| Print House Payments/Charges | 41 | Report: store(s) + date range, posted / unposted / both. |
| Require Account Numbers for All House Charges / Charge Payments | 24 | Company-setup toggle (already default-forced per p. 40). |
| A/R integration | 208 | Per Ch. 16 overview (p. 208): "New customers, house charges, and charge payments can be entered and automatically posted to A/R." This module emits the events; `accounts-receivable` owns posting. |

### Cross-cutting

| RICS feature | Page | Description |
|---|---|---|
| Transaction Type table | 28 | The canonical transaction-type enum (1 Regular, 2 User-Defined, 3 SO Pickup, 4 Layaway Sale, 5 Gift Cert Sale, 6 Charge Payment, 7 SO Deposit, 8 Layaway Payment). Once saved, the transaction type cannot be changed — void and re-enter. |
| GL Summary line items | 100 | GL Summary (owned by `accounts-receivable`) breaks out Special Orders, Layaways, Gift Certificates, House Accounts as distinct totals. This module supplies the source data. |
| Mail List → Special Orders / Layaways / Payments-Charges / Credit Slips reports | 119 | Alternative "by customer" view of the same transactions (print detail from __ to __, "print customers with zero balances" toggle). Those reports are generated by `crm` reading this module's data. |

## Feature list

### Special Orders

**SO-1 — Create Special Order Deposit** (p. 36)
- A customer account number is required to open an SO.
- The SKU may be unknown / not yet created. When the SKU is blank or unrecognized, the UI captures: free-text description, column/row (if known), price. A comment on the ticket carries the full description.
- The ticket captures tender type + deposit amount; the Balance Due is derived (ticket total minus deposit) and printed on the receipt.
- **Inventory is not deducted.** **No sale is recognized.** **No salesperson credit is applied.** (p. 36)
- The SO is opened in state `OPEN_DEPOSITED`.
- Acceptance criteria
  - Saving with no account number fails when the company setup toggle "Require account number for Special Orders" is on.
  - Saving an invalid SKU with no description + no comment is rejected.
  - Partial-payment deposits (> $0 but < ticket total) are allowed; full prepayment is also allowed (p. 36 note).
  - The SO appears in `GET /special-orders?customerId=...` immediately after save.

**SO-2 — Special Order Pickup** (p. 37)
- User selects the customer, the UI surfaces their open SOs; pick one.
- The SKU on pickup MUST be a valid SKU. If the deposit captured a draft SKU, the pickup UI blocks until an operator swaps in a real SKU.
- Previous-paid amount is displayed and auto-applied; the remaining balance is tendered.
- **On save**: inventory is deducted, the sale is recognized (ledger entry into `sales-pos`), salesperson credit is applied, and the SO transitions to `PICKED_UP` / terminal.
- Acceptance criteria
  - Inventory deduction at pickup reuses the same `applyTicketLines(ticketId)` contract that regular sales use (`sales-pos`).
  - The pickup ticket records a `linkedSpecialOrderId` on the underlying sales ticket so reports can reconcile.
  - If the deposited tender type is different from the pickup tender type, both are recorded on their respective tickets — no retroactive change.

**SO-3 — Special Order Refund** (p. 37)
- Re-opens the original deposit as a negated mirror ticket: qty = −1 (or negated original), previous-paid = negative of original deposit, balance due = negative.
- **Price stays positive.** Only quantity and tender are negated (p. 37 is explicit).
- SO transitions from `OPEN_DEPOSITED` → `REFUNDED`.
- Acceptance criteria
  - If the SO has already been picked up, the refund flow redirects the operator to a normal refund (Refund is a `sales-pos` concern once the sale has been recognized — p. 37 "you can do a regular Refund on the item").
  - Refund ticket carries a back-reference `linkedSpecialOrderId`.

**SO-4 — Print Special Orders report** (p. 37)
- Filters: stores (blank = all), date range, posted-only / unposted-only / both.
- Columns (one row per SO ticket line): date, ticket #, store, customer account, customer name, SKU, description, column/row, qty, price, deposit paid, balance due.
- Subtotals per customer; grand total.
- CSV / PDF export.
- Note: Mail List's "Special Orders" variant (Ch. 9 p. 119) is the same data sorted by customer and sits in `crm`.

### Layaways

**LA-1 — Create Layaway (Sale)** (p. 38)
- Customer account is required.
- The SKU MUST be a valid SKU (p. 38 — unlike SO, no draft SKUs).
- Ticket Tender captures initial deposit; balance due displayed on the receipt.
- **Inventory is deducted immediately.** **The full ticket amount is recognized as a sale.** **Salesperson is credited.** (p. 38 — this is the critical lifecycle difference from SO).
- Layaway opens in state `ACTIVE`.
- Optional "layaway fee" captured via Other Charges on the ticket header (p. 39). Not itself a line item.
- Acceptance criteria
  - Minimum deposit policy (open question — see Open Questions) is enforced here if set.
  - Automatic ticket reprint runs per Manager Options setting (p. 24).
  - Event: `LayawayCreatedEvent` published — `accounts-receivable` optionally reserves the balance as a receivable line (see Open Questions).

**LA-2 — Layaway Payment** (p. 38)
- Transaction type #8. Customer account + original Layaway Ticket # required; if the ticket # is unknown, Mail Detail / Alt+D surfaces the customer's purchase history to locate it.
- UI shows Originally Due / Less Paid / Balance.
- Ticket Detail captures the payment amount; Tender captures how it was paid.
- System displays the New Balance after the payment is applied; editing the amount recomputes (Alt+A / Change Amount button, p. 38).
- Layaway stays `ACTIVE` unless the payment brings balance to zero — then transitions to `PICKED_UP`.
- Acceptance criteria
  - A payment that would overpay is rejected (or must be split — see Open Questions).
  - Each payment is a row in `LayawayPayment`, linked to its own sales ticket.

**LA-3 — Layaway Pickup** (p. 38)
- Not a separate transaction type in RICS — the final Layaway Payment that zeroes the balance IS the pickup. The customer walks away with the merchandise on that visit.
- Web flow: the Layaway Payment form surfaces a "final payment + pickup" CTA when the entered amount equals the remaining balance; choosing it flips the layaway to `PICKED_UP`.
- Acceptance criteria
  - No separate inventory movement (inventory was already deducted at LA-1).
  - Salesperson credit was already applied at LA-1 — pickup does not re-credit.

**LA-4 — Layaway Refund** (p. 39)
- Two paths depending on state:
  1. **Already picked up** → a regular refund ticket (in `sales-pos`). This module just redirects.
  2. **Active (not picked up)** → the refund flow: re-enter original sale with qty negated (price stays positive). In Tender, "Apply Layaway Balance to Ticket #" references the original Layaway ticket; system shows Originally Due / Less Paid / Balance. Operator enters tender type + negative refund amount; New Balance should recalc to $0. Optional layaway fee captured via Other Charges back-tab (p. 39).
  - Layaway transitions to `REFUNDED`. Inventory is restored.
- Acceptance criteria
  - Previously-received payments are refunded by tender type unless explicitly re-routed to store credit / gift certificate by the operator.
  - The refund ticket holds a back-reference `linkedLayawayId`.

**LA-5 — Forfeiture / Abandonment** (NOT explicitly in RICS — see Open Questions)
- Layaways that go without payment beyond a configurable stale threshold can be marked `FORFEITED` — inventory restored, prior payments kept as store credit or forfeited to revenue per policy.
- Flagged here because every retailer eventually needs it and RICS leaves it to the operator. Scoped as Open Question for v1 on/off.

**LA-6 — Print Layaways report** (p. 39)
- Filters: stores, date range, posted / unposted / both.
- Columns: date, ticket #, store, customer, SKU line(s), qty, ticket total, paid-to-date, balance, status.
- Sub-totals per customer.

### Gift Certificates

**GC-1 — Gift Certificate Sale** (p. 40)
- Transaction type #5. Ticket Detail captures a line "Gift Certificate Sale" with an Amount. Tender captures how the customer paid for the certificate.
- Customer account is optional (p. 40) but encouraged when "For Account" is being set.
- If the company setting "track gift certificates" is on, a Gift Certificate ID is required at sale. If the company further sets "auto-number" on, the ID is generated.
- Sequence field supports multi-use of the same ID (e.g., a gift-cert batch with the same prefix) (p. 131).
- **Not a revenue event** — gift cert sale is deferred revenue. GL Summary (p. 100) separates it from Sales.
- Acceptance criteria
  - A new `GiftCertificate` row is created with status `ACTIVE`, original amount = purchased amount, redeemed = 0, balance = amount.
  - The sale ticket records `linkedGiftCertificateId`.
  - Event: `GiftCertificateIssuedEvent` — `accounts-receivable` books the deferred-revenue liability.

**GC-2 — Gift Certificate Redemption** (p. 40)
- Not its own transaction type — redemption is a tender on any sale (tender #10 Gift Cert).
- If tracking + requiring cert # is on, operator is routed to Redeem Gift Certificates screen (cert # + sequence).
- Amount redeemed ≤ current balance. Partial redemption supported; remaining balance persists.
- Acceptance criteria
  - A new `GiftCertificateTransaction` row with kind `REDEMPTION` is created, linked to the redeeming sales ticket.
  - Balance recomputes; if 0, status → `FULLY_REDEEMED`.
  - Event: `GiftCertificateRedeemedEvent { certId, amount, ticketId }`.

**GC-3 — Gift Certificate Maintenance** (p. 131)
- Admin-only screen to create or adjust a certificate record out-of-band — typically used to import certificates sold before the system was installed, or to correct data after the fact.
- Fields: Gift Certificate ID, Sequence, Account, Amount, Redeemed, Balance.
- Purchase Info tab: For Account, Store, Ticket, Date.
- Redeemed Info tab: grid of store / ticket / date / account / redeemed amount, with New / Edit rows.
- Buttons: New, Edit, Clear, Save, Save & End, Delete Gift Cert, Exit.
- Acceptance criteria
  - Create-via-maintenance bypasses `GiftCertificateIssuedEvent` (these weren't sold via our system) — a `GiftCertificateBackfilledEvent` fires instead so A/R can decide whether to book liability.
  - Delete is allowed; it cascades to all `GiftCertificateTransaction` rows. Audit logged.
  - Edits are versioned (`GiftCertificate` has an `updatedAt` + audit log).

**GC-4 — Print Gift Certificate Activity** (p. 132)
- Report Options tab:
  - Date range (p. 132).
  - Source: posted sales / unposted sales / gift certificate file — mutually exclusive (posted+unposted OR file, not both).
  - "Print all detail for any gift certificate selected" — expand every redemption line per cert.
  - "Only print gift certificates with outstanding balance".
  - Sort by Gift Certificate # or Date.
  - Combine Stores toggle.
- Criteria tab: stores, purchasing customers, redeeming customers, specific Gift Cert #s.
- Columns: cert #, seq, purchase date, purchaser, for-account, amount, redeemed, balance, + optional detail lines.

### House Charge

**HC-1 — House Charge Sale** (p. 40)
- Not its own transaction type — it's tender #9 on a Regular Sale (or any sale ticket type). **Customer account always required** (p. 40 is categorical).
- Store credit interaction (p. 40): if customer's store-credit balance > sale amount, tender tender-#11 Store Credit for just the sale amount. System tracks the remaining store credit on the account.
- Alt+D / Mail Detail on the sale screen surfaces current house-charge balance + purchase history.
- Acceptance criteria
  - Event: `HouseChargeAppliedEvent { ticketId, customerId, amount }` — `accounts-receivable` posts the charge to the customer's A/R account.
  - Credit-limit check: if the new charge would exceed `Customer.creditLimit` (from `crm`, p. 119 "Credit Limit - assigned to each customer at the main computer only"), the sale is either blocked or requires manager override — company-setup flag (see Open Questions).

**HC-2 — Charge Payment** (p. 40)
- Transaction type #6. Customer account required (always, regardless of toggle — p. 40).
- Ticket Detail captures the payment amount.
- Ticket Tender captures how the customer paid (cash / check / card / etc.).
- Acceptance criteria
  - Event: `HouseChargePaymentEvent { ticketId, customerId, amount, tender }` — `accounts-receivable` applies payment to the customer's A/R account (balance-forward: oldest-first; open-item: operator selects which invoice(s), see Ch. 16 p. 208).
  - A payment that would overpay the balance either creates store credit automatically or is rejected — see Open Questions.

**HC-3 — Print House Payments / Charges** (p. 41)
- Filters: stores, date range, posted / unposted / both.
- Columns: date, ticket #, store, customer, amount, type (charge vs. payment), running customer balance.
- Subtotals per customer + grand total.

## Data model sketch

Relationships:
- Every lifecycle row points at a `SalesTicket` from `sales-pos` for each of its constituent events (deposit, pickup, payment, redemption). The ticket is the source of truth for money movement and tender; this module is the source of truth for lifecycle state.
- Every lifecycle row points at a `Customer` from `crm`.
- Events emitted from this module are consumed by `accounts-receivable` for the HC and GC liability/receivable postings.

```prisma
// --- Special Orders (pp. 36–37) ---

model SpecialOrder {
  id               String   @id @default(uuid())
  customerId       String                  // crm.Customer.id — required (p. 36)
  storeId          Int                     // store where deposit was taken
  status           SpecialOrderStatus      // OPEN_DEPOSITED | PICKED_UP | REFUNDED | CANCELLED
  openedAt         DateTime                // = deposit ticket date
  pickedUpAt       DateTime?
  refundedAt       DateTime?
  depositTicketId  String                  // SalesTicket (sales-pos), transaction type 7
  pickupTicketId   String?                 // SalesTicket, transaction type 3
  refundTicketId   String?                 // SalesTicket (negated mirror of deposit)
  totalOrdered     Decimal                 // sum of line prices
  depositPaid      Decimal                 // cumulative; supports multiple deposits if allowed
  balanceDue       Decimal                 // derived; stored for query
  notes            String?                 // free-text (replaces "comment on ticket")
  createdBy        String                  // employee id
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  lines            SpecialOrderLine[]
  deposits         SpecialOrderDeposit[]

  @@index([customerId, status])
  @@index([storeId, status, openedAt])
}

model SpecialOrderLine {
  id               String  @id @default(uuid())
  specialOrderId   String
  // Pre-pickup, skuId can be null — RICS p. 36 allows deposit on an invalid SKU.
  skuId            String?
  draftSkuCode     String?                 // captured literal code if SKU doesn't exist yet
  draftDescription String?
  columnLabel      String?
  rowLabel         String?
  quantity         Int
  priceAtDeposit   Decimal
  resolvedSkuId    String?                 // set at pickup when draft becomes real (see SO-2 AC)
  resolvedAt       DateTime?
}

model SpecialOrderDeposit {                // supports multiple deposits if allowed (see Open Q)
  id               String   @id @default(uuid())
  specialOrderId   String
  ticketId         String                  // SalesTicket; negative for refund deposit
  amount           Decimal                 // may be negative
  takenAt          DateTime
}

enum SpecialOrderStatus { OPEN_DEPOSITED  PICKED_UP  REFUNDED  CANCELLED }

// --- Layaways (pp. 38–39) ---

model Layaway {
  id               String   @id @default(uuid())
  customerId       String                  // required (p. 38)
  storeId          Int
  status           LayawayStatus           // ACTIVE | PICKED_UP | REFUNDED | FORFEITED | CANCELLED
  originalTicketId String                  // SalesTicket, transaction type 4 — inventory already deducted here (p. 38)
  openedAt         DateTime
  pickedUpAt       DateTime?
  refundedAt       DateTime?
  forfeitedAt      DateTime?
  totalOriginallyDue Decimal               // p. 38 "Originally Due"
  totalPaid        Decimal                 // p. 38 "Less Paid"; cumulative
  balance          Decimal                 // p. 38 "Balance"
  layawayFee       Decimal  @default(0)    // p. 39 — Other Charges on refund
  nextPaymentDueAt DateTime?               // if payment cadence policy is set
  lastPaymentAt    DateTime?
  createdBy        String
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  lines            LayawayLine[]
  payments         LayawayPayment[]

  @@index([customerId, status])
  @@index([storeId, status, openedAt])
  @@index([status, nextPaymentDueAt])      // for overdue / forfeit sweep
}

model LayawayLine {
  id           String  @id @default(uuid())
  layawayId    String
  skuId        String                      // p. 38 "SKU entered must be a valid SKU"
  columnLabel  String?
  rowLabel     String?
  quantity     Int
  priceAtSale  Decimal
}

model LayawayPayment {
  id           String   @id @default(uuid())
  layawayId    String
  ticketId     String                      // SalesTicket, transaction type 8
  amount       Decimal
  paidAt       DateTime
  isPickup     Boolean  @default(false)    // true when this payment zeroed the balance
}

enum LayawayStatus { ACTIVE  PICKED_UP  REFUNDED  FORFEITED  CANCELLED }

// --- Gift Certificates (pp. 40, 131–132) ---

model GiftCertificate {
  id               String   @id @default(uuid())
  certificateNo    String                  // p. 131 "Gift Certificate ID"
  sequence         String   @default("")   // p. 131 — allows re-use of same ID
  purchaserCustomerId String?              // the customer who bought it (optional, p. 40)
  forAccountCustomerId String?             // p. 131 "For Account" — optional recipient
  originalAmount   Decimal                 // p. 131 "Amount"
  redeemedAmount   Decimal  @default(0)    // p. 131 "Redeemed"; maintained on every redemption
  balance          Decimal                 // p. 131 "Balance"; derived but stored
  status           GiftCertificateStatus   // ACTIVE | FULLY_REDEEMED | VOIDED
  origin           GiftCertificateOrigin   // POS_SALE | MAINTENANCE_BACKFILL
  purchaseTicketId String?                 // null when origin = MAINTENANCE_BACKFILL
  purchaseStoreId  Int?
  purchaseDate     DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  transactions     GiftCertificateTransaction[]

  @@unique([certificateNo, sequence])
}

model GiftCertificateTransaction {
  id           String   @id @default(uuid())
  certId       String
  kind         GiftCertTxnKind             // REDEMPTION | MANUAL_ADJUSTMENT
  ticketId     String?                     // SalesTicket on which cert was redeemed
  storeId      Int
  customerId   String?                     // who used the cert (p. 131 "account")
  amount       Decimal                     // positive for redemption; signed for adjustment
  occurredAt   DateTime
  enteredBy    String                      // employee id; relevant for MANUAL_ADJUSTMENT
  note         String?
}

enum GiftCertificateStatus { ACTIVE  FULLY_REDEEMED  VOIDED }
enum GiftCertificateOrigin { POS_SALE  MAINTENANCE_BACKFILL }
enum GiftCertTxnKind       { REDEMPTION  MANUAL_ADJUSTMENT }

// --- House Charge (pp. 40–41) ---
// HouseCharge does not itself hold a running balance — that's A/R's job.
// This module stores the per-event record that flows into A/R.

model HouseChargeTransaction {
  id           String   @id @default(uuid())
  customerId   String                      // required (p. 40)
  storeId      Int
  ticketId     String                      // SalesTicket
  kind         HouseChargeKind             // CHARGE | PAYMENT
  amount       Decimal                     // positive; charge or payment
  tenderType   Int?                        // only for PAYMENT: tender used (check/cash/etc.)
  occurredAt   DateTime
  postedToArAt DateTime?                   // set when A/R confirms posting
  createdAt    DateTime @default(now())

  @@index([customerId, occurredAt])
  @@index([storeId, occurredAt])
}

enum HouseChargeKind { CHARGE  PAYMENT }

// --- Cross-cutting ---

model CustomerTransactionSettings {         // Company Setup, p. 24 + p. 21
  id                             Int     @id @default(1)
  requireAccountOnSpecialOrders  Boolean @default(true)
  requireAccountOnLayaways       Boolean @default(true)
  requireAccountOnGiftCerts      Boolean @default(false)
  requireAccountOnHouseCharges   Boolean @default(true)  // p. 40 — always true in practice
  trackGiftCertificates          Boolean @default(true)
  autoNumberGiftCertificates     Boolean @default(true)  // p. 131 — numeric IDs auto-number
  requireCertNumberOnRedeem      Boolean @default(true)
  autoReprintLayawaySale         Boolean @default(true)  // p. 24 pre-set default
  autoReprintLayawayPayment      Boolean @default(true)
  autoReprintSpecialOrderDeposit Boolean @default(true)
  // Policy knobs — see Lifecycle section. Company Setup or A/R setup — TBD (Open Q).
  minLayawayDepositPercent       Int?                    // 0–100; null = no minimum
  layawayPaymentCadenceDays      Int?                    // null = no cadence required
  layawayForfeitStaleDays        Int?                    // null = no auto-forfeit
  layawayDefaultFee              Decimal @default(0)
  enforceCustomerCreditLimit     HouseChargeLimitMode    // OFF | WARN | BLOCK
}

enum HouseChargeLimitMode { OFF  WARN  BLOCK }
```

## Lifecycle / state machines

### Special Order

```
[new]
  │  createDeposit (p. 36; requires customer, tender, >=1 line)
  ▼
OPEN_DEPOSITED ──── pickup (p. 37) ────► PICKED_UP  (terminal: inventory deducted, sale recognized, salesperson credited)
   │
   ├── refund (p. 37) ─────────────────► REFUNDED    (terminal: deposit returned, nothing shipped)
   │
   └── cancel (no pickup intent) ──────► CANCELLED   (terminal; requires refund of deposit first)
```

- Inventory effect is **only** at `PICKED_UP`. That's the key lifecycle guarantee: a Special Order does not reserve inventory at deposit time (p. 36).
- Salesperson credit applied at `PICKED_UP` (not deposit).
- Additional deposits against an OPEN SO are allowed via `SpecialOrderDeposit` rows — see Open Question.

### Layaway

```
[new]
  │  createSale (p. 38; requires customer, valid SKU, initial deposit)
  │    → inventory deducted, sale recognized, salesperson credited
  ▼
ACTIVE ──── payment (p. 38) ────► ACTIVE (balance reduced)
   │                                │
   │                                └── (balance == 0) ──► PICKED_UP  (terminal)
   │
   ├── refund-while-active (p. 39) ─────► REFUNDED  (terminal: inventory restored, payments returned, optional fee retained)
   │
   ├── stale > layawayForfeitStaleDays ─► FORFEITED  (terminal; see Open Q — not explicitly RICS, configurable)
   │
   └── cancel (op override) ─────────────► CANCELLED (terminal; equivalent to refund)
```

- **Inventory effect is at `ACTIVE`** (creation) — RICS's critical divergence from SO (p. 38 "The item is then taken out of inventory, and it becomes a sale").
- On `REFUNDED` / `CANCELLED` / `FORFEITED`: inventory restored via a reversal ledger entry (`sales-pos` contract).
- On `FORFEITED`: disposition of previously-received payments is policy-driven (convert to store credit OR forfeit to revenue) — company-setup flag (Open Q).

### Gift Certificate

```
[new]
  ├── createOnSale (p. 40)     ──► ACTIVE (origin=POS_SALE)
  └── createViaMaintenance (p. 131) ► ACTIVE (origin=MAINTENANCE_BACKFILL)

ACTIVE ──── redemption (p. 40) ────► ACTIVE (balance reduced)
   │                                    │
   │                                    └── (balance == 0) ──► FULLY_REDEEMED (terminal)
   │
   └── voidViaMaintenance (p. 131 Delete) ──► VOIDED (terminal; cascades txn rows)
```

- Monetary recognition is at REDEMPTION, not at creation (the certificate sale itself is deferred revenue per GL Summary p. 100).
- `MAINTENANCE_BACKFILL` path does not emit `GiftCertificateIssuedEvent` — it emits `GiftCertificateBackfilledEvent` so A/R can choose whether to book liability.

### House Charge

House Charge is stateless at the transaction level — each `HouseChargeTransaction` row is an immutable event. The running balance lives in `accounts-receivable` (owner of A/R account state).

```
sale with tender #9 (p. 40)    ──emit──► HouseChargeAppliedEvent     ──►  A/R posts charge
charge payment transaction #6  ──emit──► HouseChargePaymentEvent     ──►  A/R applies payment
```

### Policy knobs

Per-company settings that the lifecycles read at enforcement time:

| Knob | Default | Read by |
|---|---|---|
| `minLayawayDepositPercent` | null (no min) | LA-1 |
| `layawayPaymentCadenceDays` | null | overdue sweep |
| `layawayForfeitStaleDays` | null (no auto-forfeit) | overdue sweep |
| `layawayDefaultFee` | 0 | LA-1, LA-4 |
| `enforceCustomerCreditLimit` | WARN | HC-1 |
| `trackGiftCertificates` | true | GC-1, GC-2 |
| `autoNumberGiftCertificates` | true | GC-1 |
| `requireAccount*` (4 flags) | HC always true, LA/SO true, GC false | all transaction types |

These live in `CustomerTransactionSettings` above. They map to RICS Manager Options / Company Setup (p. 24) and to A/R Setup policy-adjacent fields (Ch. 16 p. 208). **See Open Question on whether some of these move into `store-ops`'s CompanySetup row instead of a dedicated table** — current sketch keeps them here for scope-of-ownership clarity.

## Reports

All four reports share a common shape — filters on stores + date range + posted/unposted/both — and all pull from sales ticket data scoped by transaction type / tender type, joined to this module's lifecycle rows.

| Report | RICS page | Primary source | Filters | Key columns |
|---|---|---|---|---|
| Print Special Orders | 37 | `SalesTicket` WHERE transaction type IN {3, 7}, joined to `SpecialOrder` | Stores, date range, posted/unposted/both | Date, ticket#, store, customer, SKU, desc, col/row, qty, price, deposit, balance due |
| Print Layaways | 39 | `SalesTicket` WHERE transaction type IN {4, 8}, joined to `Layaway` | Stores, date range, posted/unposted/both | Date, original ticket#, store, customer, SKU, qty, total due, paid, balance, status |
| Print House Payments/Charges | 41 | `HouseChargeTransaction` | Stores, date range, posted/unposted/both | Date, ticket#, store, customer, kind (charge/payment), amount, running customer balance |
| Print Gift Certificate Activity | 132 | `GiftCertificate` + `GiftCertificateTransaction`; "gift certificate file" source supersedes posted/unposted (p. 132 mutual exclusion) | Stores, date range, source (posted / unposted / file), outstanding-only, print-all-detail, sort by #/Date, combine stores, criteria (purchaser customers, redeeming customers, specific cert #s) | Cert#, seq, purchase date, purchaser, for-account, amount, redeemed, balance; optional detail lines |

Implementation note: **"posted" vs. "unposted" is a RICS batch-of-sales concept** (Ch. 2 p. 45 Post Sales to Inventory). In Zack's Retail, `sales-pos` retains a `postedAt` timestamp on each ticket even though deduction is real-time (see `sales-pos` modernization decisions). These four reports read that timestamp. If `sales-pos` has not exposed that column, it's an Open Question against `sales-pos` — not resolved here.

## Cross-module dependencies

**Consumes from `sales-pos`** (the ticket framework)
- `SalesTicket` and `SalesTicketLine` entities — every lifecycle event hangs off a ticket.
- `createSalesTicket(input)` contract — used to open the deposit ticket, pickup ticket, payment ticket, etc.
- `applyTicketLines(ticketId)` — deducts inventory + recognizes sale. Called at SO pickup, at LA creation (immediately), and at charge-payment entry (no inventory but records the sale event).
- `reverseTicket(ticketId)` — for refunds.
- `TransactionType` enum (regular, SO pickup, SO deposit, LA sale, LA payment, GC sale, charge payment) — owned by `sales-pos`; this module only references it.
- `TenderType` enum (incl. #9 House Charge, #10 Gift Cert, #11 Store Credit) — owned by `store-ops` per `MODULES.md`, surfaced via `sales-pos` on tickets.
- `postedAt` timestamp on ticket — needed for reports.

**Consumes from `crm`**
- `Customer` entity (account #, name, credit limit, current balance — p. 119).
- `getCustomer(customerId)` contract.
- `getCustomerPurchaseHistory(customerId)` — for Mail Detail / Alt+D lookup when an operator doesn't know the original Layaway Ticket # (p. 38) or wants to see house-charge history (p. 40).
- `getCustomerStoreCreditBalance(customerId)` — for the HC+Store-Credit interaction (p. 40).

**Consumes from `products`**
- `getSku(skuId|skuCode)` — SKU validation at SO pickup and LA creation.
- `resolveUpc(upc)` — for scan-based entry.
- The draft/invalid SKU flow (SO only) does NOT consult `products`; that's the point (p. 36).

**Consumes from `store-ops`**
- Store list.
- `TenderType` catalog.
- CompanySetup: some of the policy knobs above likely move here (Open Q).

**Emits to `accounts-receivable`** (the fiscal side)
- `HouseChargeAppliedEvent { ticketId, customerId, amount, occurredAt }` — A/R books the receivable.
- `HouseChargePaymentEvent { ticketId, customerId, amount, tenderType, occurredAt }` — A/R applies payment.
- `GiftCertificateIssuedEvent { certId, amount, purchaseTicketId }` — A/R books deferred-revenue liability.
- `GiftCertificateRedeemedEvent { certId, amount, saleTicketId }` — A/R releases liability + recognizes revenue.
- `GiftCertificateBackfilledEvent { certId, amount, note }` — A/R decides whether to book liability based on the backfill reason.
- `LayawayCreatedEvent { layawayId, totalOriginallyDue }` (optional — see Open Q) — A/R may or may not mirror unpaid layaway balance as a receivable.
- `LayawayRefundedEvent { layawayId, refundTicketId }` — A/R unwinds any mirrored receivable.
- `SpecialOrderPickedUpEvent { specialOrderId, pickupTicketId }` — A/R recognizes any remainder paid via house charge.

**Emits to `crm`**
- `SpecialOrderCreatedEvent / CompletedEvent / RefundedEvent` — `crm` updates the customer's SO counters (referenced by Mail List → Special Orders report, p. 119).
- `LayawayCreatedEvent / PaymentEvent / PickedUpEvent / RefundedEvent / ForfeitedEvent` — same for Layaway counters.
- `GiftCertificateIssuedEvent` (copy) — `crm` ties the cert to `purchaserCustomerId` / `forAccountCustomerId` for customer-history views.
- `HouseChargeAppliedEvent` / `HouseChargePaymentEvent` (copy) — `crm` maintains the `currentBalance` snapshot visible on the mail list screen (p. 119).

**No direct dep on `inventory`** — inventory effects flow through `sales-pos.applyTicketLines()` / `reverseTicket()`. This keeps the module's footprint small and avoids double-writing.

**Circular-dependency risk**: `customer-transactions` → `sales-pos` → (if `sales-pos` ever reads `customer-transactions` for receipt text) → back here. The sales receipt printer in `sales-pos` needs to render SO deposit language ("Balance Due $X"), LA "Originally Due / Less Paid / Balance", etc. This is handled by having `sales-pos` expose a receipt-renderer extension point where this module registers a formatter keyed by transaction type. Implementation detail: not a data-model circularity, just a UI extension seam.

## Web-first improvements / RICS concepts dropped

- **Paper-slip and hand-tracked deposit receipts become durable records.** RICS leans on a printed ticket as the "artifact" that ties a deposit to a pickup — the customer walks in with the slip, operator looks up the ticket # by reading the paper (p. 38 "If you don't know the Original Layaway Ticket # [Mail Detail]"). In Zack's Retail the customer's account page IS the artifact: pulling up the customer surfaces all open SOs and active LAs with one click, and the operator can claim any of them without needing the ticket #.
- **Digital gift certificates with emailed codes.** RICS's "Gift Certificate ID + Sequence" model (p. 131) is preserved so physical certificate stock remains supportable, but the default issuance path emails a unique redemption code to a recipient address captured at sale. Physical-stock mode stays available for operators who print paper certificates — behind a company flag. Drops the RICS.CFG auto-number-vs-manual bifurcation — default auto-number, manual entry remains possible.
- **Email notifications for layaway lifecycle.** Auto-reminders on LA payment due dates + pickup-ready notifications replace the "customer walks in when they remember" mental model RICS implies. Reuses `platform`'s notification primitives.
- **Overdue-layaway forfeit sweep is a scheduled job.** RICS does not explicitly ship this — it's on the operator. Zack's Retail provides an opt-in nightly sweep: layaways with no payment beyond `layawayForfeitStaleDays` are flagged for operator review (not auto-forfeited), with an email to the store manager.
- **Credit-limit enforcement is enforced, not advisory.** RICS (p. 119) stores a credit limit but doesn't clearly enforce it at HC tender time. Zack's Retail defaults `enforceCustomerCreditLimit = WARN` and offers `BLOCK` mode.
- **"Posted vs. unposted" reporting toggle is deprecated but kept for migration compatibility.** Deduction is real-time in Zack's Retail; `postedAt` becomes a nearly-constant "same as created" timestamp. The filter stays for users migrating from RICS-era report habits; in v2 it collapses to a single date range.
- **Sales-receipt printing** moves from a hardware-printer driver + ticket template to browser-rendered receipts + optional ESC/POS gateway — dropped from the scope of this module (inherited from `sales-pos`'s modernization decisions). Ending Messages per transaction type (p. 24) becomes a template setting in `sales-pos`, consumed here as a read.
- **Alt+D / Alt+A / keyboard macros.** Not replicated as exact keystrokes; the flow (surface customer purchase history inline when looking up an original ticket, quick-edit payment amount) is preserved via the normal web UI affordances.
- **The "cannot select from gift certificate file AND posted/unposted sales" mutex (p. 132)** is preserved as a form-validation rule but relaxed in v2 once unified storage removes the distinction.
- **Store Credit (tender #11)** remains owned by `sales-pos` as a tender type — but the balance is maintained by this module-adjacent path: when an HC sale is partially paid with store credit, or when an SO/LA refund lands in store credit, the balance change is emitted as a `StoreCreditAdjustedEvent`. **Open Question** — does store credit live here, in `sales-pos`, or in `crm`? Flagged; not resolved in this spec.
- **Ticket Comments as the place to describe an unknown SKU** (p. 36) is replaced by a first-class `draftSkuCode` + `draftDescription` on `SpecialOrderLine`. The UI still shows it as a comment on the printed ticket, but internally it's structured data — so a report can filter "all SOs with a draft SKU still unresolved."

## Open questions

1. **Does a Layaway create an A/R receivable at sale time?** RICS's Ch. 16 covers A/R but does not explicitly say the Layaway balance becomes an A/R line — instead it's held in the Layaway record itself (p. 38). Zack's Retail could either mirror the balance into A/R (cleaner single-ledger view) or keep it scoped to this module (matches RICS + avoids double-counting in statements). **Default recommendation**: keep Layaway balance OUT of A/R; surface it separately. Confirm with product.
2. **Multiple deposits on one Special Order.** The manual is silent on whether a customer can make a second partial deposit before pickup. The data model supports it (`SpecialOrderDeposit[]`); the UI needs a decision on whether to expose an "Add Deposit" action.
3. **Layaway overpayment.** If the customer hands over $100 on a $70 balance, does it: (a) reject — must be exact/less; (b) tender $70 + create $30 store credit; (c) tender $70 + $30 change? RICS doesn't say. Recommendation: (b), gated on company flag.
4. **House Charge payment overpayment.** Same question, applied to A/R. Probably (b) as well, but needs confirmation from `accounts-receivable` owner.
5. **Layaway forfeiture policy.** Not in the RICS manual. When a layaway is forfeited, what happens to the previously-received payments? Options: convert entirely to store credit (customer-friendly); forfeit to revenue minus a restocking fee; forfeit entirely; operator-chosen at forfeit time. Recommendation: operator-chosen with a default set via company flag.
6. **Minimum layaway deposit %.** RICS silent. Most retailers require 10–25% upfront. Ship as a company flag defaulted to null (no minimum) to stay parity-with-RICS, and surface it in admin UI.
7. **Gift Certificate expiration.** RICS manual says nothing about expiration. Most jurisdictions regulate it (some prohibit). Scope: ship without expiration in v1; add in v2 with per-jurisdiction config.
8. **Where do the policy knobs live — here or in `store-ops` CompanySetup?** The sketch puts them in a dedicated `CustomerTransactionSettings`. Alternative: merge into `store-ops.CompanySetup`. Recommendation: keep here for module ownership clarity; `store-ops` exposes a generic settings contract that this module consumes — but this is a cross-cutting call that should go through the team.
9. **Store Credit ownership.** Is store credit a tender type maintained by `sales-pos`, a balance on the `Customer` in `crm`, or a sibling of Gift Certificate in this module? The spec flags all three touchpoints; the structural decision is not resolved here. **Gap against `crm` spec** — `crm` should say definitively whether `storeCreditBalance` is a column on Customer or a projection from events elsewhere. Raised as a cross-module gap.
10. **Pickup transaction type for Layaway.** RICS does not define a separate "Layaway Pickup" transaction type — the final Layaway Payment (#8) is the pickup. Do we introduce a synthetic `LayawayPickup` for reporting clarity, or keep RICS's "final payment == pickup" conflation? Recommendation: keep RICS behavior; expose `isPickup: boolean` on the payment row (already in sketch).
11. **Special Order pickup when the deposit was on a draft SKU.** The spec says the operator MUST swap in a real SKU before pickup. What is the UX — a separate "Resolve SKU" step in the SO detail page, or inline on the pickup ticket? Needs a UX spec decision.
12. **Backfilling gift certificates via Maintenance — do they affect GL?** A certificate backfilled via maintenance was never rung up as a sale in this system. A/R shouldn't book a liability for a certificate it has no corresponding cash receipt for. But if we DON'T book liability, a subsequent redemption would recognize revenue with no matching liability — distorting the books. Resolution requires input from the finance owner of `accounts-receivable`.
13. **Cross-module gap: `sales-pos` ticket-reversal contract.** This module assumes `sales-pos` exposes `reverseTicket(ticketId)` for refund flows. That contract is not yet written in a `sales-pos.md` spec (which does not exist). Flagging as a gap for the `sales-pos` author.
14. **Cross-module gap: `crm` does not currently enumerate which counters it maintains per customer.** This module fires several events targeting `crm` counters (`specialOrderCount`, `layawayCount`, `houseChargeBalance`, `giftCertCount`, `storeCreditBalance`). `crm` spec needs to confirm the counter list and whether they're projections or columns.
15. **Cross-module gap: `accounts-receivable` posting rules for Gift Certificate revenue recognition.** Our events assume A/R books liability on issue and releases on redemption. Deferred-revenue accounting has jurisdictional nuances the `accounts-receivable` spec should nail down.
