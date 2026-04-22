# Module: accounts-receivable

**Goal**

`accounts-receivable` owns two tightly coupled domains: (1) **customer A/R** — the per-customer balance, payment posting, statement generation, finance charges, dunning, aging, year rollover, and the audit trail behind every charge / payment / adjustment / finance-charge / write-off — supporting both **Balance Forward** (most individuals) and **Open Item** (commercial / business) statement types; and (2) **fiscal-period operations** — the canonical `Period { storeId, fiscalYear, fiscalMonth, startsOn, endsOn, seasonCode }` primitive, the Close Week / Month / Season / Year state machine, the General Ledger Summary report (Cash / Non-Cash / House / Special Orders / Layaways / Gift Certs / Sales Tax / Sales / COGS / Other / Payouts / Over-Short), and Season Setup. The two halves share the fiscal calendar — A/R statements close on the same period boundaries that close the GL — which is why they live in one module. Primary user value: a back-office user (or scheduled job) can print monthly statements with automatic finance-charge application, post a payment to a customer in seconds, and run a single-button month-close that snapshots GL Summary, drives last-year actuals into `otb-planning`, and locks the fiscal period — all with an audit trail and a reversibility window if a mistake is caught quickly.

## RICS features covered

**A/R Setup** (Ch. 16)
- **p. 208, A/R Setup — General folder** — Current Year (the A/R fiscal year, advanced only by Roll Over A/R Current Year). Open Item Account Options: Terms (free-text terms shown on every Open Item statement). Balance Forward Account Options: **Grace period (days)** (e.g., statement on last day of month, due by the 20th = grace 20), **Minimum Payment** as a fraction of total due (`1/1` means full balance must be paid), **Accumulate minimum payment** flag (carries unmet minimums forward), **Late Charge** (flat amount applied if payment lands after grace).
- **p. 208, A/R Setup — Finance Charges** — Apply Finance Charges flag, **Annual Rate %**, **Minimum Finance Charge** floor. **Allow an additional N days for the payment to be overdue** (a separate "mail float" buffer added to grace before a finance charge accrues; aging itself stays on the original due date). Calculation method is **average daily balance** (RICS p. 208 — explicit). Open Item: charge accrues per invoice that goes unpaid past terms. Balance Forward: charge accrues on the average daily balance since last statement when prior statement balance (less credit adjustments) is not paid in full by grace + buffer.
- **p. 208, A/R Setup — Statement folder** — **Statement Address** (preprinted-form users leave blank), **Statement Detail** level (Ticket Totals — least; Department / Category / SKU detail).
- **p. 208, A/R Setup — Messages folder** — **Statement Messages** for payments and dunning notices (which dunning notice prints is determined by the **oldest balance due** for the customer). **Message to print at the end of each statement** (free-text footer for promotions, hours, etc.).

**Customer A/R accounts** (Ch. 16)
- **p. 209, Enter Customers in A/R** — onboard a customer to A/R. Account # must already exist in Mail List (`crm`) or be looked up by name. **Statement Type** = Balance Forward | Open Item (the per-account override of the system default). **Apply Finance Charge** per-account flag (overrides the company-wide setting). New A/R accounts can be added at the POS only for accounts using the default statement type.
- **p. 209, Enter A/R Payments** — main-computer payment entry. **Batch Date** (overridable), Account # / Lookup, **Reference #** (required — typically the customer's check #; reusing the same Reference # for a corrected payment creates a new Sequence # under the same reference). Balance Forward: payment auto-applies to oldest balance. Open Item: payment must be applied to specific invoices and the system blocks save until the payment is fully applied. **`[Reverse]`** reverses a previously selected payment by Reference #. **`[Auto Apply]`** applies to the oldest open Open Item ticket (faster bulk path; operator can override the auto-applied splits). **`[Detail]`** drills to Ticket Summary / Ticket Detail / Payment Summary / Payment Detail for the account.
- **p. 210, Enter A/R Adjustments** — main-computer adjustments. Batch Date, Account #, **Description + Amount** (signed — positive or negative). When ticket-totals statement detail is on, only the first line's description and the total adjustment print on the statement (so to itemize multiple invoices on a Balance Forward statement, save one adjustment per line).
- **p. 210, Enter A/R Adjustments — Beginning balances** — the same screen seeds beginning balances when implementing A/R: Balance Forward accounts get one adjustment with description `BALANCE FORWARD`; Open Item accounts get one adjustment per open invoice (one per save so each invoice prints separately on the statement; description is typically the invoice number).

**A/R reports** (Ch. 16)
- **p. 211, Print Aged Trial Balance** — **Aging dates in days** (increment per bucket — 30 most common). Include Balance Forward statements toggle. Include Open Item statements toggle. **Include customers with no aging** (when off, omits zero-balance accounts but keeps customers whose open invoice is offset by an open credit — net zero but still shown). **Sort by**: Account # | Name | Current Balance.
- **p. 211, Print A/R Detail** — **List Activity from Last Statement** | **from a selected date range** (Open Item still prints all open invoices regardless of the date filter). Include Balance Forward / Open Item flags. **Print A/R General Information** flag — adds YTD charges/payments, date added to A/R, last payment date+amount, last statement date+amount. **Sort by**: Account # | Name. **Report Detail**: Ticket Totals | Department | Category | SKU.
- **p. 211, Print A/R Transaction Summary** — date-range filter; totals charges, adjustments, payments, finance charges. Include Balance Forward / Open Item toggles.
- **p. 213, Print A/R Statements** — **Date Statements** (the date printed on the statement — typically last day of the period). **Print Statements For**: Only Balance Forward | Only Open Item | All Accounts | **One Account with no updates** (the preview mode — a mid-month statement print for a single account that does NOT advance Balance Forward and does NOT compute finance charges). RICS treats statement printing as a transactional batch — once run for a period, finance charges have been computed and Balance Forward customers have a new opening balance. The manual is emphatic about backups before running statements (p. 213 — "If your power goes off during statements, you would need to restore data from the backup before running statements again") and about the screen-spool-file safety net for printer failures.

**A/R lifecycle** (Ch. 16)
- **p. 213, Purge A/R Detail** — deletes closed (zero-balance / fully paid) A/R activity dated up to a chosen cut-off. Detail is otherwise retained indefinitely (powers Print A/R Detail historical lookbacks). User-driven cadence (some keep one year; some keep months). Once a zero-balance Open Item invoice has been printed on a statement, it falls off both the next statement and the Apply Payments screen — purge just reclaims storage.
- **p. 213, Roll Over A/R Current Year** — increments A/R Current Year, clears every customer's YTD totals to 0. Manual is explicit: must be run before posting A/R sales to a new year.

**Fiscal-period close** (Ch. 8)
- **p. 113, Close Week** — clears weekly sales counters (`Avail/Week`, `Sales/Week`, `Rec-Tran-Adj/Week`) so the next week starts at zero. A "week" is operator-defined (Mon-Sun, Sun-Sat, biweekly are all valid). Recommended cadence: every Monday after posting last week's sales. **Required** if 8-Week Trending is in use. Backup-before-close advised (p. 113). Per-store scoping supported.
- **p. 113, Close Month** — clears month-to-date sales counters and increments the current posting month. **Required**: RICS will not accept new sales posts for the next month until close-month has run for the current month (p. 113). Backup-before-close advised. Per-store scoping supported. RICS hard-warns: monthly reports cannot be re-run after month close, so run reports first.
- **p. 113, Close Season** — automatic side-effect of Close Month when the closed month is configured as a season-ending month in Season Setup (p. 218). Zeroes season-to-date counters.
- **p. 113, Close Year** — automatic side-effect of Close Month when the closed month equals the year-ending month from Company Setup (p. 214). Increments fiscal year, clears YTD counters, populates last-year actuals (which then become visible to the OTB Plan's Last-Year-Sales column — p. 158 / `otb-planning.md`).

**General Ledger Summary** (Ch. 6)
- **p. 100, General Ledger Summary Report** — monthly debit/credit totals per store, by GL bucket: **Cash, Non-Cash, House Accounts, Special Orders, Layaways, Gift Certificates, Sales Tax, Sales, Cost of Goods Sold, Other Charges, Payouts, Over/Short**. Designed to be transcribed into an external general ledger. Store-only filter (no SKU / category dimension). RICS exports as comma-delimited (`.TXT` / `.CSV`) with an Export Filename text box — Zack's Retail replaces both with browser CSV/PDF download.

**Fiscal calendar inputs** (Ch. 17)
- **p. 214, Company Setup — Year-ending Month** — the month whose close-month event also closes the fiscal year. Defines the fiscal calendar's anchor.
- **p. 214, Company Setup — Current month / Current year** — the active posting period. Sales can be *entered* for any month, but only *posted* for the current month. Close Month/Season/Year increments these.
- **p. 218, Season Setup** — checkbox row over months 1-12: which months end which seasons. The closes that fire on those months zero season-to-date counters and label the just-closed period with its season code.

## Modernization decisions

- **Fiscal calendar is a first-class entity, not a counter.** RICS represents the fiscal calendar as `Company.currentMonth + currentYear` (a moving cursor, p. 214) plus implicit boundaries derived from `seasonEndingMonths` and `yearEndingMonth`. Zack's Retail materialises every fiscal period as a `Period { id, storeId, fiscalYear, fiscalMonth, startsOn, endsOn, seasonCode, status }` row — rows for the next two fiscal years are projected on year rollover and on Company Setup edits (`store-ops.CompanySettingsChangedEvent`). Every dependent module (`otb-planning`, `sales-reporting`, `customer-transactions` for A/R-affecting events) keys off `periodId`. **Get this right or the rest of the system drifts** — period IDs are the join key for the entire fiscal data model.
- **Per-store fiscal calendar with shared inputs.** RICS effectively assumes one fiscal calendar across the chain. Spec persists `Period` per-store so a chain that operates stores on different fiscal cycles is supported, but in v1 every store inherits the same `yearEndingMonth` and `seasonEndingMonths` from `store-ops.CompanySettings`. Per-store calendar overrides are an Open Question.
- **Close is a state machine, not a destructive batch.** RICS's close zeroes counters in place and is effectively immutable (the Sales reports relied on those counters being zero). Modern: `Period.status = OPEN | CLOSING | CLOSED | REOPENED`. Closing emits `MonthClosedEvent` (and `SeasonClosedEvent` / `YearClosedEvent` when applicable). Counters are derived from event streams, not stored — close simply locks the period and snapshots a `PeriodCloseSnapshot` (GL Summary, A/R aging, OTB last-year actuals).
- **Reopen window with an audit trail.** A closed period can be reopened by an admin within a configurable window (default 14 days) **with a typed reason**. After the window, the only path to retroactive correction is a journal-entry adjustment that lands in the next open period with a back-reference. Each reopen is an `audit_log` row in `platform`.
- **A/R balance is computed from an immutable ledger, not stored on the customer.** RICS persists `currentBalance` on the mail list (p. 119) and updates it inline. Modern: `crm.Customer.currentBalance` is a denormalised mirror of `accounts-receivable.getCustomerArSnapshot(customerId).currentBalance`, which itself sums an append-only `ArLedgerEntry` table. Balance Forward Open Items are aging buckets into the same ledger, not separate tables.
- **Balance Forward vs. Open Item is per-customer state, not two tables.** Same `ArLedgerEntry` rows in both modes — the difference is how the **statement renderer** consumes them and how **payment auto-application** works. BF: any balance > 0 produces a single "BALANCE FORWARD" line on the next statement plus the period's new charges/payments/adjustments; payment auto-applies to oldest balance (p. 208). OI: every charge stays as its own open invoice on the statement until paid in full; payment must be allocated to specific invoices (with `[Auto Apply]` covering the common case). Both share aging math but use different bucket-boundary defaults (configurable — see below).
- **Statements are PDF + email, not dot-matrix.** RICS prints to a printer (often a 1-part or 2-part preprinted form from Moore Business Forms, p. 208) and stores a screen-spool fallback. Modern: every statement is rendered as a PDF, archived as an immutable `StatementDocument` (object storage), made available for download in the admin UI, and optionally emailed via `platform.sendEmail`. The double-window envelope and pre-printed-form workflow is dropped; `Statement Address` becomes a CompanySettings field that always prints (no preprinted-form mode).
- **Finance-charge application is a typed, deterministic engine.** RICS calculates "average daily balance" (p. 208) but doesn't show the formula. Spec defines `FinanceChargeEngine.compute({ customerId, periodId })` returning `{ averageDailyBalance, ratePerDay, daysInPeriod, gross, minimumFloor, applied, exempt? }` with a stored breakdown row per customer per period (`FinanceChargeApplication`). The engine is invoked once during Print Statements (BF and OI alike) and is replayable / auditable. Per-customer `applyFinanceCharges = false` (RICS p. 209) skips the engine entirely.
- **Dunning buckets are configurable.** RICS hardcodes the dunning bucket boundaries to 30/60/90/120 days implicitly (the manual mentions "the oldest balance due for each customer will determine which dunning notice will print" without specifying boundaries — p. 208). Spec exposes `DunningRule { id, name, ageBucketStartDays, ageBucketEndDays?, message, escalationLevel }` ordered by `escalationLevel`. Default seed: 0-29 (no message), 30-59, 60-89, 90-119, 120+. Per-customer overrides supported.
- **Aged Trial Balance bucket boundaries are configurable.** RICS p. 211 exposes a single "Aging dates in days" increment (typically 30) which produces fixed buckets. Spec accepts a `bucketBoundaries: number[]` (defaults `[0, 30, 60, 90, 120]`) so the operator can produce 15/30/45/60/90 or any other slicing without recompiling.
- **Reference # collisions become Sequence # rows in a single payment record.** RICS's "re-enter the previously used Reference # to correct a payment, system assigns a new Sequence #" (p. 209) is a clever in-place pattern. Spec models it as `ArPayment { id, referenceNumber, sequenceNumber, ... }` with `(customerId, referenceNumber, sequenceNumber)` unique. Reverse becomes `[Reverse]` on a specific `(referenceNumber, sequenceNumber)` pair, emitting a compensating `ArLedgerEntry` rather than a destructive update.
- **Payment auto-apply is a contract, not a UI button.** `applyArPayment(payment)` always runs auto-apply server-side per the customer's statement type; the UI's `[Auto Apply]` button (p. 210) is now the default behaviour and the operator can override individual allocations afterward via `previewPaymentApplication(...)` before commit. Open Item save still blocks on unallocated funds (p. 209).
- **GL Summary is a derived report, not a maintained ledger.** RICS treats GL Summary as the readout of a maintained set of monthly counters. Modern: `getGlSummary(periodId)` queries the `sales-pos.TicketPostedEvent` stream, `customer-transactions.{LayawayPaymentEvent, SpecialOrderDepositEvent, GiftCertSoldEvent, GiftCertRedeemedEvent, HouseChargeAppliedEvent, HouseChargePaymentEvent}`, and the A/R ledger, projecting them into the 12 GL buckets on demand. On Close Month the result is snapshotted to `PeriodCloseSnapshot.glSummaryJson` so subsequent reads return the closed-period number even if upstream events are restated within the reopen window.
- **GL Summary bucket definitions are explicit and configurable.** RICS bundles "House Accounts", "Special Orders", "Layaways", "Gift Certificates" each as one bucket without specifying which event types (deposit vs. pickup vs. payment vs. sale) flow into which side of debit/credit. Spec defines a `GlBucketMapping { bucketCode, eventType, sign: DEBIT | CREDIT, scope: NET_REVENUE | LIABILITY | RECEIVABLE | ... }` table, seeded with the standard interpretation:
  - **Cash** = sum of Cash-treated tender amounts (`store-ops.TenderType.isConsideredCash = true`).
  - **Non-Cash** = sum of non-cash, non-house tender amounts (cards, checks, store credit redemptions, gift cert redemptions).
  - **House Accounts** = `HouseChargeAppliedEvent` (debit A/R) + `HouseChargePaymentEvent` (credit A/R).
  - **Special Orders** = `SpecialOrderDepositEvent` (credit liability) + Special Order pickup recognition (debit liability, credit Sales).
  - **Layaways** = `LayawayPaymentEvent` accumulating against the layaway balance (handled per `customer-transactions.md` LA-1 noting layaway recognises full revenue at sale; the Layaways GL bucket here captures only the deferred deposit/payment movement, not the sale itself).
  - **Gift Certificates** = `GiftCertSoldEvent` (credit liability) + `GiftCertRedeemedEvent` (debit liability).
  - **Sales Tax** = sum of `SalesTicket.taxTotal` per period.
  - **Sales** = sum of `SalesTicket.subtotal` per period excluding non-revenue transaction types (Charge Payment, Special Order Deposit, Layaway Payment).
  - **COGS** = sum of `SalesTicketLine.unitCostSnapshot * qty` over the same Sales scope.
  - **Other** = `SalesTicket.otherCharges` (the per-store labelled "other charges" field, p. 142).
  - **Payouts** = sum of `PayOut` rows per shift.
  - **Over/Short** = sum of `OverShortEntry.amount` per shift (signed; cash and non-cash difference both roll up here per RICS).
- **Year rollover archives at two grains.** RICS's `Roll Over A/R Current Year` (p. 213) clears YTD customer totals — silent about category-level archival. Spec explicitly archives **both** (a) per-customer YTD actuals (`CustomerYearArchive`) AND (b) per-(store × category × period) net sales (`CategoryPeriodArchive`) so `otb-planning.getCategorySalesByPeriod()` can return last-year actuals. The archive row is the source of truth for last-year columns going forward; the live ledger is purgeable.
- **Statements are queued, not foreground.** RICS's Print A/R Statements (p. 213) is a synchronous batch that locks the database and risks data corruption on power failure. Modern: `runStatementBatch(periodId, scope)` enqueues a `platform` job that processes customers in chunks with idempotent commit (each customer's statement is its own transaction with a finance-charge engine call + a `StatementDocument` write + the BF balance roll-forward). Job progress is observable in the admin UI; partial failure resumes from the last committed customer.
- **Preview statement is read-only and cannot mutate state.** RICS's "One Account with no updates" mode (p. 213) is an inline option on the same screen as the destructive batch. Spec splits them into two routes: `previewStatement(customerId, asOf)` (read-only; computes finance charge in-memory but never writes) and `runStatementBatch(...)` (the mutating path). UI exposes both clearly.
- **Late Charge becomes a typed adjustment, not a balance arithmetic side-effect.** RICS p. 208 says "If payment is made after grace period this amount is added to the balance due." Spec models it as a distinct `ArLedgerEntry { kind: LATE_CHARGE }` row with the rule version that produced it stamped on the row, so a reversal can find its origin.
- **Grace period and finance-charge buffer are visible in the customer view.** RICS hides them in A/R Setup (p. 208). Modern UI surfaces "Due by: <date>", "Finance charge accrues: <date>" on every Open Item invoice and on the BF customer summary, so operators answering customer calls don't have to do the arithmetic.
- **Purge A/R Detail moves into `platform`'s retention framework.** RICS treats it as a manual A/R action (p. 213). Spec exposes the policy through `platform.retention.definePolicy({ key: 'ar.closed_detail', lookbackDays })` so a single retention dashboard governs A/R alongside saved sales transactions, time-clock data, and inventory changes. The cut-off rule (only purge zero-balance / fully paid invoices) is enforced by an `ar.closed_detail` retention handler exported by this module.
- **Settings are typed and live in `store-ops.CompanySettings` + a module-local `ArSettings` row.** RICS keeps A/R settings in three folders (General / Statement / Messages, p. 208) backed by RICS.CFG. Spec keeps the *fiscal* inputs (`yearEndingMonth`, `seasonEndingMonths`) in `store-ops.CompanySettings` (already there) and the *A/R-specific* inputs (`gracePeriodDays`, `minimumPaymentFraction`, `accumulateMinimumPayment`, `lateChargeAmount`, `applyFinanceCharges`, `annualRatePct`, `minimumFinanceCharge`, `additionalGraceBufferDays`, `statementDetailLevel`, `statementFooterMessage`, default `statementType`) in a singleton `ArSettings` row owned by this module.
- **Reference # is required and unique-per-customer.** RICS p. 209 is silent on uniqueness; the "re-enter to correct" pattern implies the (customer, ref#) is the natural key. Spec enforces `(customerId, referenceNumber)` as the parent of `(sequenceNumber)` so the correction pattern works without ambiguity.
- **Beginning-balance import is a typed flow, not freeform adjustments.** RICS reuses Enter A/R Adjustments for this (p. 210). Spec adds a dedicated `POST /api/v1/ar/customers/:id/seed-balance` route that accepts either a single BF amount or a list of OI invoices, writes one `ArLedgerEntry` per invoice tagged `kind = OPENING_BALANCE`, and is gated to admin permission `ar.seedBalance`.

## Data model sketch

```prisma
// --- Fiscal calendar (the central primitive) -----------------------------

model Period {
  id             String        @id @default(uuid())
  storeId        Int                                 // per-store; v1 inherits company-wide cadence
  fiscalYear     Int                                 // e.g. 2026
  fiscalMonth    Int                                 // 1..12 within the fiscal year (1 = month after yearEndingMonth)
  calendarYear   Int                                 // e.g. 2026 — for human-readable display
  calendarMonth  Int                                 // 1..12 calendar
  startsOn       DateTime                            // inclusive
  endsOn         DateTime                            // exclusive
  seasonCode     String?                             // populated only for season-ending periods (Ch. 17 p. 218)
  isSeasonEnd    Boolean   @default(false)           // matches Company.seasonEndingMonths
  isYearEnd      Boolean   @default(false)           // matches Company.yearEndingMonth
  status         PeriodStatus                         // OPEN | CLOSING | CLOSED | REOPENED
  closedAt       DateTime?
  closedBy       String?
  reopenWindowEndsAt DateTime?                        // closedAt + reopenWindowDays
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  weeks          Week[]
  closeSnapshots PeriodCloseSnapshot[]

  @@unique([storeId, fiscalYear, fiscalMonth])
  @@index([storeId, status, startsOn])
}

model Week {                                          // Close Week, p. 113
  id             String   @id @default(uuid())
  storeId        Int
  periodId       String                              // owning fiscal month
  weekNumber     Int                                 // ordinal within store calendar
  startsOn       DateTime
  endsOn         DateTime                            // operator-defined (Mon-Sun, Sun-Sat, biweekly all valid)
  status         WeekStatus                          // OPEN | CLOSED
  closedAt       DateTime?
  closedBy       String?

  @@unique([storeId, weekNumber])
  @@index([storeId, status])
}

model PeriodCloseSnapshot {                           // immutable; written on Close Month
  id             String   @id @default(uuid())
  periodId       String
  closedAt       DateTime
  closedBy       String
  scope          CloseScope                           // WEEK | MONTH | SEASON | YEAR (which transition the snapshot belongs to)
  glSummaryJson  Json                                 // 12-bucket totals (p. 100)
  arAgingJson    Json                                 // aging buckets at close (Ch. 16)
  customerArchiveCount Int                            // # CustomerYearArchive rows written (only on YEAR scope)
  categoryArchiveCount Int                            // # CategoryPeriodArchive rows written
  reopenedAt     DateTime?
  reopenReason   String?
  reopenedBy     String?

  @@index([periodId, scope])
}

// --- A/R settings (singleton) -------------------------------------------

model ArSettings {                                    // p. 208 General + Finance + Statement folders
  id                          String  @id @default(uuid())  // singleton
  defaultStatementType        ArStatementType  @default(BALANCE_FORWARD)
  // Balance Forward
  gracePeriodDays             Int     @default(20)
  minimumPaymentNumerator     Int     @default(1)             // p. 208 "1/1" = full
  minimumPaymentDenominator   Int     @default(1)
  accumulateMinimumPayment    Boolean @default(false)
  lateChargeAmount            Decimal @default(0)
  // Finance charges
  applyFinanceCharges         Boolean @default(true)
  annualRatePct               Decimal @default(0)
  minimumFinanceCharge        Decimal @default(0)
  additionalGraceBufferDays   Int     @default(0)             // mail-float buffer (p. 208)
  // Statements
  statementAddressLine1       String?
  statementAddressLine2       String?
  statementAddressCity        String?
  statementAddressState       String?
  statementAddressZip         String?
  statementDetailLevel        StatementDetailLevel @default(TICKET_TOTALS)
  statementFooterMessage      String?
  // Open Item terms (free-text, p. 208)
  openItemTermsText           String?
  // Defaults for aging report
  agedTrialBalanceBuckets     Int[]   @default([0, 30, 60, 90, 120])
  // Period reopen window
  reopenWindowDays            Int     @default(14)
  updatedAt                   DateTime @updatedAt
  updatedByUserId             String?
}

model DunningRule {                                   // p. 208 Statement Messages
  id                  String   @id @default(uuid())
  name                String
  ageBucketStartDays  Int                             // inclusive
  ageBucketEndDays    Int?                            // exclusive; null = open-ended
  escalationLevel     Int                             // ordering — higher = more severe
  message             String
  active              Boolean  @default(true)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([active, escalationLevel])
}

// --- Customer A/R account ------------------------------------------------

model ArCustomerAccount {                              // p. 209
  id                          String   @id @default(uuid())
  customerId                  String   @unique         // FK to crm.Customer
  statementType               ArStatementType          // BALANCE_FORWARD | OPEN_ITEM
  applyFinanceCharges         Boolean                  // p. 209 per-account override
  customGracePeriodDays       Int?                     // null = inherit ArSettings
  customDunningRuleSetId      String?                  // null = inherit ArSettings
  enrolledAt                  DateTime
  enrolledBy                  String
  active                      Boolean  @default(true)
  // Last-statement snapshot (BF only)
  lastStatementDate           DateTime?
  lastStatementBalance        Decimal  @default(0)
  // YTD counters (visible on Print A/R Detail with general info — p. 211)
  ytdCharges                  Decimal  @default(0)
  ytdPayments                 Decimal  @default(0)
  ytdAdjustments              Decimal  @default(0)
  ytdFinanceCharges           Decimal  @default(0)
  lastPaymentDate             DateTime?
  lastPaymentAmount           Decimal?
  // Audit
  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt

  ledgerEntries               ArLedgerEntry[]
  payments                    ArPayment[]
  statements                  StatementDocument[]
}

// --- Append-only ledger -------------------------------------------------

model ArLedgerEntry {
  id              String   @id @default(uuid())
  customerId      String
  occurredAt      DateTime                            // event time (e.g. ticket.endedAt for charges)
  postedAt        DateTime @default(now())            // when the entry hit the ledger
  periodId        String                              // bucketing for GL Summary
  kind            ArLedgerKind                         // CHARGE | PAYMENT | ADJUSTMENT | FINANCE_CHARGE | LATE_CHARGE | WRITE_OFF | OPENING_BALANCE | REVERSAL
  amount          Decimal                             // signed: + receivable, - credit
  // Origin pointers — populated by the originator
  sourceTicketId  String?                             // sales-pos.SalesTicket — for CHARGE / PAYMENT from a HC ticket
  sourceInvoiceId String?                             // self-reference for OI applies-to
  sourcePaymentId String?                             // ArPayment.id — for the constituent applies of a payment
  reversalOfEntryId String?                           // for REVERSAL entries
  description     String                              // shown on the statement; required
  // Open Item state
  oiInvoiceNumber String?                             // human-readable invoice reference (p. 210)
  oiOriginalAmount Decimal?                           // for OI; null for BF
  oiRemainingAmount Decimal?                          // OI: original - applied payments; closed when 0
  // Audit
  createdByUserId String
  traceId         String?

  @@index([customerId, occurredAt])
  @@index([periodId])
  @@index([customerId, kind, oiRemainingAmount])     // hot path for OI auto-apply
}

// --- A/R payments (Reference # + Sequence # as natural key) -------------

model ArPayment {                                      // p. 209
  id                String   @id @default(uuid())
  customerId        String
  batchDate         DateTime                          // operator-overridable (p. 209)
  referenceNumber   String                            // typically check # — required
  sequenceNumber    Int      @default(1)              // increments on correction (p. 209)
  amount            Decimal
  tenderType        String                            // store-ops.TenderType.code
  notes             String?
  reversedByPaymentId String?                          // when [Reverse] runs (p. 209)
  // Application links — derived rows in ArPaymentApplication
  fullyApplied      Boolean  @default(false)          // OI: blocks save until true (p. 209)
  enteredByUserId   String
  createdAt         DateTime @default(now())

  applications      ArPaymentApplication[]
  @@unique([customerId, referenceNumber, sequenceNumber])
  @@index([batchDate])
}

model ArPaymentApplication {                            // OI: links payment $ to specific invoices
  id              String  @id @default(uuid())
  paymentId       String
  invoiceLedgerEntryId String                          // FK to ArLedgerEntry of kind=CHARGE for OI
  amountApplied   Decimal
  createdAt       DateTime @default(now())
}

// --- Finance charge engine output ---------------------------------------

model FinanceChargeApplication {                        // produced once per (customerId, periodId)
  id                  String   @id @default(uuid())
  customerId          String
  periodId            String
  computedAt          DateTime @default(now())
  averageDailyBalance Decimal
  daysInPeriod        Int
  annualRatePct       Decimal
  ratePerDay          Decimal
  graceDaysApplied    Int
  bufferDaysApplied   Int
  grossCharge         Decimal
  minimumFloor        Decimal
  appliedAmount       Decimal                            // max(grossCharge, minimumFloor) or 0 if exempt
  exempt              Boolean
  ledgerEntryId       String?                            // FK to the ArLedgerEntry of kind=FINANCE_CHARGE
  inputsJson          Json                                // breakdown — daily balances list etc.

  @@unique([customerId, periodId])
}

// --- Statements ---------------------------------------------------------

model StatementDocument {                               // p. 213
  id                  String   @id @default(uuid())
  customerId          String
  periodId            String
  statementDate       DateTime
  statementType       ArStatementType
  pdfObjectKey        String                            // platform object storage
  emailSentAt         DateTime?
  emailSentTo         String?
  printedAt           DateTime?
  // Roll-forward for Balance Forward
  openingBalance      Decimal
  newCharges          Decimal
  newPayments         Decimal
  newAdjustments      Decimal
  newFinanceCharges   Decimal
  closingBalance      Decimal
  // For Open Item, the line-by-line invoice list lives in the PDF + the linked ledger entries
  generatedByJobId    String?
  generatedAt         DateTime @default(now())

  @@unique([customerId, periodId])
}

// --- Year rollover archives ----------------------------------------------

model CustomerYearArchive {                              // p. 213 Roll Over A/R Current Year
  id              String   @id @default(uuid())
  customerId      String
  fiscalYear      Int
  totalCharges    Decimal
  totalPayments   Decimal
  totalAdjustments Decimal
  totalFinanceCharges Decimal
  endingBalance   Decimal
  archivedAt      DateTime @default(now())

  @@unique([customerId, fiscalYear])
}

model CategoryPeriodArchive {                            // feeds otb-planning last-year actuals (p. 158)
  id            String   @id @default(uuid())
  storeId       Int
  categoryId    Int
  periodId      String
  netSales      Decimal
  netReturns    Decimal
  netCogs       Decimal
  archivedAt    DateTime @default(now())

  @@unique([storeId, categoryId, periodId])
  @@index([storeId, periodId])
}

// --- GL Summary bucket mapping (data-driven) -----------------------------

model GlBucketMapping {
  id           String      @id @default(uuid())
  bucketCode   GlBucket                                // CASH | NON_CASH | HOUSE | SPECIAL_ORDER | LAYAWAY | GIFT_CERT | SALES_TAX | SALES | COGS | OTHER | PAYOUT | OVER_SHORT
  eventType    String                                  // 'sales-pos.TicketPostedEvent' | etc
  filterJson   Json                                    // tender kind filters, transaction-type filters
  sign         GlSign                                   // DEBIT | CREDIT
  description  String

  @@unique([bucketCode, eventType, filterJson])
}

// --- Enums ---------------------------------------------------------------

enum PeriodStatus           { OPEN  CLOSING  CLOSED  REOPENED }
enum WeekStatus             { OPEN  CLOSED }
enum CloseScope             { WEEK  MONTH  SEASON  YEAR }
enum ArStatementType        { BALANCE_FORWARD  OPEN_ITEM }
enum ArLedgerKind           { CHARGE  PAYMENT  ADJUSTMENT  FINANCE_CHARGE  LATE_CHARGE  WRITE_OFF  OPENING_BALANCE  REVERSAL }
enum StatementDetailLevel   { TICKET_TOTALS  DEPARTMENT  CATEGORY  SKU }
enum GlBucket               { CASH  NON_CASH  HOUSE  SPECIAL_ORDER  LAYAWAY  GIFT_CERT  SALES_TAX  SALES  COGS  OTHER  PAYOUT  OVER_SHORT }
enum GlSign                 { DEBIT  CREDIT }
```

**Invariants**
- Exactly one `ArSettings` row (singleton, app-level enforced).
- `(storeId, fiscalYear, fiscalMonth)` unique on `Period`; `Period.endsOn > Period.startsOn` for every row.
- A `Period` cannot transition `CLOSED → OPEN` directly; it must go `CLOSED → REOPENED → OPEN` and only within `reopenWindowEndsAt`.
- Closing a period requires every constituent `Week` to be `CLOSED` (week → month cascade); closing a period that `isSeasonEnd` cascades to a `SEASON` snapshot; closing a period that `isYearEnd` cascades to a `YEAR` snapshot. Cascade ordering is **strictly**: weeks (all of them) → month → season (if applicable) → year (if applicable). RICS implies this in p. 113 ("Close Season/Year is done automatically when you close the month setup as the End of Year month") — we make it explicit.
- `ArLedgerEntry.amount = 0` is rejected.
- `ArPayment.fullyApplied = false` is rejected for `customer.statementType = OPEN_ITEM` on save (p. 209).
- `ArPayment` reversal creates a new `ArPayment` row with `referenceNumber` echoing the original and `sequenceNumber = max(existing) + 1`, plus a compensating `ArLedgerEntry` of kind `REVERSAL`. The original row is never mutated.
- `FinanceChargeApplication` is unique per `(customerId, periodId)` — running statements twice for the same period does not double-charge (idempotent).
- `StatementDocument` is unique per `(customerId, periodId)` — same idempotency guarantee.
- `CategoryPeriodArchive` is written exactly once per `(storeId, categoryId, periodId)` on year close; subsequent reopens use a different snapshot mechanism (an `Adjusted` flag and a delta record — out of scope for v1, see Open Questions).

## API surface

**Fiscal calendar**
- `GET    /api/v1/fiscal/periods?storeId=&fiscalYear=` — list periods
- `GET    /api/v1/fiscal/periods/current?storeId=` — current open period
- `GET    /api/v1/fiscal/periods/:id` — period detail incl. status + close snapshot if any
- `POST   /api/v1/fiscal/periods/regenerate` — regenerate projected periods (admin; called on `CompanySettingsChangedEvent` of `yearEndingMonth` or `seasonEndingMonths`)

**Close routines**
- `POST /api/v1/fiscal/weeks/:id/close` — Close Week (p. 113); body `{ scope?: 'singleStore' | 'allStores' }`
- `POST /api/v1/fiscal/periods/:id/close` — Close Month — cascades to season / year per `isSeasonEnd` / `isYearEnd`
- `POST /api/v1/fiscal/periods/:id/reopen` — body `{ reason }`; only valid within `reopenWindowEndsAt`
- `GET  /api/v1/fiscal/periods/:id/preview-close` — dry-run: returns the GL Summary + aging that would snapshot if closed now

**A/R setup**
- `GET|PUT /api/v1/ar/settings` — singleton
- `GET|POST /api/v1/ar/dunning-rules` — list / create
- `GET|PATCH|DELETE /api/v1/ar/dunning-rules/:id`

**A/R accounts**
- `POST /api/v1/ar/customers` — enroll an existing `crm.Customer` (p. 209)
- `GET  /api/v1/ar/customers/:customerId` — account state, balance, last-statement snapshot
- `GET  /api/v1/ar/customers/:customerId/ledger?from=&to=&kind=` — ledger entries
- `GET  /api/v1/ar/customers/:customerId/snapshot` — `getCustomerArSnapshot()` payload
- `POST /api/v1/ar/customers/:customerId/seed-balance` — beginning-balance import (p. 210)
- `PATCH /api/v1/ar/customers/:customerId` — update statementType, applyFinanceCharges, etc.

**Payments + adjustments**
- `POST /api/v1/ar/payments/preview` — body `{ customerId, amount, autoApply?, allocations? }`; returns proposed apply layout without mutation
- `POST /api/v1/ar/payments` — apply payment (p. 209/210); blocks for OI if not fully allocated
- `POST /api/v1/ar/payments/:id/reverse` — `[Reverse]` (p. 210)
- `POST /api/v1/ar/adjustments` — body `{ customerId, amount, description, batchDate? }` (p. 210)

**Reports**
- `GET /api/v1/ar/reports/aged-trial-balance?bucketBoundaries=&statementTypes=&includeNoAging=&sortBy=` (p. 211)
- `GET /api/v1/ar/reports/detail?from=&to=&fromLastStatement=&statementTypes=&detail=&sortBy=&includeGeneralInfo=` (p. 211)
- `GET /api/v1/ar/reports/transaction-summary?from=&to=&statementTypes=` (p. 211)

**Statements**
- `POST /api/v1/ar/statements/preview` — body `{ customerId, asOf }`; returns rendered PDF without mutation (p. 213 "One Account with no updates")
- `POST /api/v1/ar/statements/run` — body `{ periodId, scope: 'BF'|'OI'|'ALL', dryRun? }`; enqueues the batch
- `GET  /api/v1/ar/statements/runs/:id` — job status
- `GET  /api/v1/ar/statements/:id` — statement document metadata + signed download URL
- `POST /api/v1/ar/statements/:id/email` — re-send by email

**Year rollover**
- `POST /api/v1/ar/year-rollover` — body `{ confirmCurrentYear }`; advances A/R Current Year, runs archives (p. 213)

**GL Summary**
- `GET /api/v1/fiscal/gl-summary?periodId=&storeIds=&format=screen|csv|pdf` (p. 100)
- `GET /api/v1/fiscal/gl-summary/buckets` — current `GlBucketMapping` set
- `PUT /api/v1/fiscal/gl-summary/buckets` — admin edit of bucket mapping

**Season Setup**
- `GET|PUT /api/v1/fiscal/season-setup` — proxies to `store-ops.CompanySettings.seasonEndingMonths` for convenience; the canonical write lives in `store-ops`

**Internal subscribers** (event consumers — not externally invoked)
- `POST /api/v1/internal/ar/events/:eventType` — debug/replay endpoint; production path is the `platform` event bus

## UI surface

- **Fiscal Calendar dashboard** (`/fiscal/calendar`) — per-store grid of upcoming/recent periods; status badges; "Close Week" / "Close Month" actions; reopen action with countdown timer; "Regenerate periods" admin action
- **Close Wizard** — multi-step: (1) confirm reports run, (2) preview close (shows GL Summary + aging diff), (3) confirm + reason, (4) execution progress, (5) snapshot review
- **GL Summary** — per-period table of 12 buckets with debit/credit; drill into source events; CSV/PDF download
- **GL Bucket Mapping admin** — list of mappings with enable/disable toggles and a sandbox tester (paste an event payload, see which bucket it lands in)
- **A/R Settings** (`/ar/settings`) — three tabs mirroring RICS folders (General, Statements, Messages) plus a Finance Charges tab
- **Dunning Rules** — list + editor; preview rendered message at each escalation level
- **A/R Customer list** — filter by statement type, balance range, last-statement age; columns include Account#, Name, Balance, Last Payment, Aging Bucket
- **A/R Customer detail** — header (account info, balance, statement type, finance-charge flag); ledger tab (chronological); open invoices tab (OI only — with apply action); statements tab (download history); finance-charge history tab; "Enroll/Disenroll" action
- **Enter Payment** (`/ar/payments/new`) — Account picker, Reference #, amount, tender type, allocation grid (BF: read-only "applies to oldest"; OI: editable allocations with Auto-Apply button); preview before commit; reverse-by-reference inline
- **Enter Adjustment** (`/ar/adjustments/new`) — Account picker, description, signed amount, batch date
- **Aged Trial Balance** (`/ar/reports/aged-trial-balance`) — filter form (buckets, statement types, include-no-aging, sort); rendered table; CSV/PDF
- **A/R Detail Report** — filter form (date scope, statement types, sort, detail level, include general info); rendered table
- **A/R Transaction Summary** — date range; rendered table
- **Statements Console** (`/ar/statements`) — sub-pages: **Preview** (single customer, no commit); **Run Batch** (with backup confirmation step matching the RICS warning at p. 213); **Run history** with per-job logs and downloadable PDFs; **Resend by email** action
- **Year Rollover** (`/ar/year-rollover`) — current-year banner + confirm-to-advance + audit list of prior rollovers
- **Season Setup** (`/fiscal/season-setup`) — checkbox row over months 1-12 (links into `store-ops.CompanySettings`; rendered here for fiscal grouping convenience)

## Dependencies

**Inbound (this module consumes)**
- **`store-ops`** —
  - `getCompanySettings()` for `yearEndingMonth`, `seasonEndingMonths`
  - `listStores()` for per-store close scoping
  - `getTenderTypes()` to classify Cash vs. Non-Cash for GL Summary
  - **Event** `CompanySettingsChangedEvent` — triggers `regenerateProjectedPeriods()` if `yearEndingMonth` or `seasonEndingMonths` changed
- **`crm`** —
  - `getCustomer(customerId)` for statement formatting (name, address, phone, email)
  - `listCustomersByAccountNumberPrefix()` for the Lookup widget on Enter Payment / Enter Adjustment
  - `customer.email` for statement email delivery
- **`sales-pos`** —
  - **Event** `TicketPostedEvent { ticketId, storeId, periodId, transactionType, subtotal, taxTotal, otherCharges, tenderBreakdown: { tenderTypeCode, amount, isConsideredCash }[], lines: [{ skuId, categoryId, departmentId, qty, unitCostSnapshot, lineTotal }] }` — feeds Cash, Non-Cash, Sales, Sales Tax, Other, COGS GL buckets and produces `ArLedgerEntry` of kind CHARGE for House Charges (when transaction includes tender code 9)
  - **Event** `BatchPostedEvent { shiftId, storeId, periodId, payouts: [...], overShort: { amount } }` — feeds Payouts and Over/Short buckets
  - **Event** `TicketVoidedEvent` — triggers compensating ledger entry if the voided ticket originally landed in the A/R ledger
- **`customer-transactions`** —
  - **Event** `LayawayPaymentEvent { layawayId, customerId, amount, periodId }` — feeds Layaways bucket
  - **Event** `SpecialOrderDepositEvent { specialOrderId, customerId, amount, periodId }` — feeds Special Orders bucket
  - **Event** `GiftCertSoldEvent { certId, amount, periodId }` — feeds Gift Certificates bucket (credit, deferred liability)
  - **Event** `GiftCertRedeemedEvent { certId, amount, periodId, ticketId }` — feeds Gift Certificates bucket (debit liability) — note redemption recognition flows into Sales via the parent `TicketPostedEvent`
  - **Event** `HouseChargeAppliedEvent { ticketId, customerId, amount, periodId }` — produces `ArLedgerEntry { kind: CHARGE }`
  - **Event** `HouseChargePaymentEvent { ticketId, customerId, amount, periodId }` — produces `ArLedgerEntry { kind: PAYMENT }`; auto-allocated per the customer's statement type
- **`employees`** — `hasPermission(userId, 'ar.payments.enter' | 'ar.adjustments.enter' | 'ar.statements.run' | 'ar.year-rollover.run' | 'fiscal.period.close' | 'fiscal.period.reopen' | 'ar.seedBalance')`
- **`platform`** —
  - `enqueueJob('ar.runStatementBatch', payload)` for the statement batch
  - `enqueueJob('ar.runYearRollover', payload)` for the year-end archives
  - `sendEmail(to, template, vars, attachments)` for emailed statements
  - `objectStorage.put(key, bytes)` for statement PDFs
  - `audit.write(event)` for every close, reopen, payment, adjustment, year-rollover
  - `retention.definePolicy({ key: 'ar.closed_detail', ... })` — the Purge A/R Detail handler is registered here

**Outbound (this module exposes)**
- To **`otb-planning`** —
  - `getActivePeriod(storeId)` → `{ periodId, fiscalYear, fiscalMonth, seasonCode }`
  - `listPeriods(storeId, fiscalYear)` → period rows for plan setup
  - `getCategoryNetSalesByPeriod(storeId, categoryId, periodId)` → close-of-month authoritative net sales
  - `getCategoryRollingActuals(storeId, categoryId, fromPeriodId, toPeriodId)`
  - **Event** `MonthClosedEvent { storeId, periodId, fiscalYear, fiscalMonth, snapshotId }` — `otb-planning` re-snapshots last-year actuals
  - **Event** `SeasonClosedEvent { storeId, periodId, seasonCode }`
  - **Event** `YearClosedEvent { storeId, fiscalYear, archiveSummary: { customerCount, categoryCount } }`
- To **`sales-reporting`** —
  - `getCurrentPeriod(storeId)` and `listPeriods(...)` for fiscal-aware report bucketing
  - `getGlSummary(periodId, { storeIds? })` → 12-bucket projection (consumed by report dashboards as a tile)
  - **Event** `WeekClosedEvent`, `MonthClosedEvent`, `SeasonClosedEvent`, `YearClosedEvent` — `sales-reporting` cuts its `WeeklyTrendFact` materialization at these boundaries (already referenced in `sales-reporting.md`)
- To **`purchasing`** —
  - **Event** `MonthClosedEvent` — triggers optional Reset Future Orders per `store-ops.CompanySettings.resetFutureOnMonthClose` (already referenced in `purchasing.md`)
- To **`crm`** —
  - **Event** `ArBalanceChangedEvent { customerId, newBalance, snapshot }` — `crm` updates the denormalised `Customer.currentBalance` shown on Mail List (p. 119)
  - **Event** `ArAccountEnrolledEvent` / `ArAccountDisenrolledEvent`
- To **`platform`** —
  - **Event** `StatementBatchCompletedEvent { jobId, periodId, customerCount, failures }` — admin telemetry
  - **Event** `PeriodReopenedEvent { periodId, reason, actorUserId }` — admin notification

## Contracts exposed

**Period queries**
- `getCurrentPeriod(storeId): Period`
- `listPeriods(storeId, fiscalYear?): Period[]`
- `getPeriod(periodId): Period`
- `findPeriodForDate(storeId, date): Period`

**Customer A/R**
- `getCustomerArSnapshot(customerId): { currentBalance, agingBuckets: { startDays, endDays, amount }[], openInvoices: OpenInvoice[], lastStatementBalance, lastStatementDate, ytd: { charges, payments, adjustments, financeCharges }, statementType, applyFinanceCharges }`
- `enrollInAr(customerId, { statementType, applyFinanceCharges, customGracePeriodDays? }): ArCustomerAccount`
- `applyArPayment(payment: { customerId, referenceNumber, amount, tenderType, batchDate?, allocations?, autoApply? }): { paymentId, allocations: ArPaymentApplication[], reversed?: false }`
- `reverseArPayment(paymentId, { reason }): { compensatingPaymentId }`
- `applyArAdjustment(adjustment: { customerId, description, amount, batchDate? }): ArLedgerEntry`

**Statements**
- `previewStatement(customerId, asOf: Date): StatementDocument` — read-only; never mutates
- `runStatementBatch(periodId, scope: 'BF'|'OI'|'ALL'): { jobId }`
- `getStatementsForCustomer(customerId): StatementDocument[]`

**Fiscal close**
- `closeWeek(weekId, { scope?: 'singleStore' | 'allStores' }): WeekCloseResult`
- `closePeriod(periodId, { kind: 'week'|'month'|'season'|'year' }): PeriodCloseSnapshot`
  - **Note**: `kind` is informational — the actual cascade is driven by `Period.isSeasonEnd` / `isYearEnd`. The parameter exists so callers can assert their intent (an admin closing a "month" should not be surprised to also close a year).
- `reopenPeriod(periodId, { reason }): PeriodCloseSnapshot` — fails if `Date.now() > reopenWindowEndsAt`
- `previewPeriodClose(periodId): { glSummary, agingSnapshot, warnings }`

**GL Summary**
- `getGlSummary(periodId, { storeIds? }): GlSummaryResult` — computed live for OPEN periods, returned from snapshot for CLOSED
- `getGlBucketMappings(): GlBucketMapping[]`

**Year rollover**
- `runYearRollover({ confirmCurrentYear }): { jobId }`

**Events emitted** (full list)
- `MonthClosedEvent`, `WeekClosedEvent`, `SeasonClosedEvent`, `YearClosedEvent`
- `PeriodReopenedEvent`
- `StatementGeneratedEvent { customerId, statementId, periodId }`
- `StatementBatchCompletedEvent`
- `ArBalanceChangedEvent`
- `ArAccountEnrolledEvent`, `ArAccountDisenrolledEvent`
- `FinanceChargeAppliedEvent { customerId, periodId, appliedAmount }`
- `ArPaymentRecordedEvent`, `ArPaymentReversedEvent`
- `ArAdjustmentRecordedEvent`

**Events consumed** — see Dependencies (Inbound).

## Out of scope for v1

- **Dot-matrix and continuous-form statement printing** (p. 208 — Moore Business Forms #17889 / #17897 / envelopes #K15438) — replaced by browser PDF + email. The "Statement Address" field stays but is always rendered, never assumed pre-printed.
- **Screen-spool-file fallback for statements** (p. 213) — obsolete; statements are persisted as PDFs in object storage from the moment they're rendered, so a printer failure has no consequence beyond pressing Print again.
- **Modem / dial-up sync of A/R activity between Main and POS** (Ch. 13 — Send/Receive A/R changes) — obsolete; single Postgres source.
- **Diskette transfer of A/R files** (Ch. 13) — obsolete.
- **RICS.CFG-driven A/R configuration** (Ch. 15) — every A/R setting moves to `ArSettings` (this module) or `CompanySettings.yearEndingMonth` / `seasonEndingMonths` (`store-ops`); no config-file editor ships.
- **Retention purges for sales transactions, time-clock data, deleted record keys, auto-delete SKUs, inventory changes, and gift-certificate data** (Ch. 8 pp. 114-116) — those are owned by `platform` per `MODULES.md` rows 18 and 41. Only the *fiscal-close* routines (Close Week / Month / Season / Year) and the A/R-detail purge handler live here.
- **Per-customer multi-currency A/R** — RICS is single-currency. Defer until a customer needs it.
- **Lockbox / bank-feed import of A/R payments** — manual entry only in v1; a future `platform` integration could subscribe to a bank-file feed and call `applyArPayment` per row.
- **NACHA / ACH initiation** — no auto-debit; payments are operator-recorded.
- **Pre-printed envelopes #K15438** (p. 208) — see dot-matrix above.
- **Multiple Reference # corrections within a single batch** beyond the Sequence# pattern — RICS allows arbitrary re-keying; we accept up to 99 sequences before requiring an explicit reverse + new payment. Configurable, but capped to keep the UI sane.
- **Per-store A/R settings** — v1 keeps `ArSettings` company-wide. Per-store overrides are an Open Question, deferred until needed.
- **Write-off bulk action** — RICS has no formal write-off path; A/R adjustments cover it. Spec preserves `ArLedgerKind.WRITE_OFF` for future use but no dedicated UI in v1.
- **GL bucket export to QuickBooks / NetSuite directly** — CSV download is the v1 integration story; a `platform.integrations` adapter ships when the first customer asks.

## Open questions

1. **Per-store fiscal calendar.** Spec models `Period.storeId` so per-store calendars are physically supported. Is per-store calendar configuration in scope for v1, or do all stores inherit the company-wide `yearEndingMonth` / `seasonEndingMonths`? Recommendation: shared in v1, per-store override in v2.
2. **Period reopen scope.** Reopening a closed month: does it cascade open all child weeks (so they can be re-closed individually), or does the month just enter `REOPENED` while child weeks stay `CLOSED`? Recommendation: weeks stay closed unless explicitly reopened — but verify with the operations team.
3. **Year-end reopen forbidden?** A YEAR-scope close runs the year archives (CustomerYearArchive, CategoryPeriodArchive). Reopening a year-end period would invalidate the archives. Proposal: hard-disallow reopen of year-end periods after the snapshot is consumed by `otb-planning` (i.e. once `OtbPlan` has been derived from the archive); use a journal-entry adjustment in the next open period instead.
4. **Finance-charge calculation precision.** "Average daily balance" (p. 208) is unambiguous on simple cases but ambiguous on partial-day events (a payment that lands at noon — does the higher pre-payment balance count for half a day?). Spec assumes day-granular: balance at end-of-day is the balance for the day. Confirm before shipping.
5. **GL bucket sign convention.** Spec defines `GlSign = DEBIT | CREDIT` per mapping. RICS p. 100 doesn't show signs explicitly — it just lists totals. The user's chart of accounts dictates the convention; should the report flip signs based on a per-bucket "natural side" setting? Recommendation: yes, ship the configurable sign on `GlBucketMapping`.
6. **Layaway revenue recognition timing.** `customer-transactions.md` notes layaways recognise full revenue at sale (LA-1). The Layaways GL bucket then captures only the deferred deposit/payment movement. But some accounting policies treat layaway as deferred until pickup. Confirm which policy applies before seeding the bucket mapping.
7. **Special Order revenue recognition timing.** Mirror question for SO: the deposit is liability; pickup recognises revenue. Confirm the `GlBucketMapping` reflects this exactly.
8. **Statement email delivery reliability.** Statements are critical — bounced emails must be visible. Should `StatementDocument` carry `emailDeliveredAt` (parsed from a webhook) in addition to `emailSentAt`? Recommendation: yes; coordinate with `platform.sendEmail` for delivery webhooks.
9. **`[Auto Apply]` on Open Item — apply to oldest by ticket date or by due date?** RICS says "oldest open item ticket" (p. 209) which is ambiguous when terms differ across invoices. Recommendation: oldest *due date*; doc the choice on the UI tooltip.
10. **Beginning-balance adjustments and aging.** When a customer is enrolled with an opening BALANCE FORWARD adjustment dated `2024-01-15`, is the aging anchored to that date or to enrollment date? RICS leaves this to operator discipline (p. 210). Recommendation: aging anchors to `ArLedgerEntry.occurredAt` for OPENING_BALANCE entries — operator must enter the right date.
11. **Reopening a period with already-applied finance charges.** If a customer was charged a finance charge during the period's close, then the period is reopened, then closed again — do we recompute the finance charge from scratch, idempotently keep the original (`FinanceChargeApplication` unique constraint), or void+recompute? Recommendation: keep the original (idempotent), require an admin to manually void+re-run if a recalculation is genuinely needed.
12. **Per-account dunning rule overrides.** `ArCustomerAccount.customDunningRuleSetId` is in the schema. Do we ship a UI for it in v1, or hold for v2 once we know what real overrides look like? Recommendation: hold; expose the API but not the UI.
13. **Aged Trial Balance "Sort by Current Balance" direction.** RICS p. 211 doesn't say ASC or DESC. Recommendation: DESC (largest balances first — what an A/R clerk wants).
14. **Mail-float buffer scope.** `additionalGraceBufferDays` is a single company-wide value (p. 208). Some operators want it only for mailed-payment customers. Per-customer override requested? Recommendation: defer; if needed, add `customAdditionalGraceBufferDays` to `ArCustomerAccount` later.
15. **House Charge over-credit-limit policy.** Cross-references `customer-transactions.md` HC-1 open question 3 (block vs. manager override). Decision needs to land here since A/R holds the credit-limit-aware balance check that `customer-transactions` calls.
16. **Concurrency on Close Month.** If two operators click Close Month for the same period at the same time, what happens? Recommendation: server-side advisory lock on `(storeId, fiscalYear, fiscalMonth)`; second caller gets a 409 with the in-flight close's job ID.
