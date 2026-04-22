# Module: crm

**Goal**

`crm` owns the customer record — the authoritative identity that every other module joins against when a transaction is tied to a specific person. It holds mail-list data, family members, per-customer purchase history (Mail Detail), customer-segmentation tooling (Customer Analysis), the Frequent Buyer Plan (tiered loyalty), customer-anchored quotes (special pricing applied at the register), the maintenance edit surface for gift certificates, and the per-tenant Mail List Setup that governs the customer schema. Primary user value: a salesperson at the register can pull up "Mary Johnson" by phone, see her purchase history, her active quote, her loyalty progress, her A/R balance, and her family — and a marketer can slice the customer base on any combination of demographics, sales totals, frequent-buyer tier, and store affinity to drive a campaign or label run.

## RICS features covered

**Customer record + lookup** (Ch. 9)
- **p. 117, Enter Mailing List** — create / edit / delete a customer. Fields: `Account #` (15 chars, any letters or digits — RICS recommends the phone number, with no parens or dashes), `Name` (35 chars, recommended `LAST, FIRST` for alphabetical lookup and so labels reverse-print correctly), the six optional **Extra Mail List Fields** (defined in Mail List Setup, p. 218), `Credit Limit` (settable only on the main computer in RICS), `Current Balance` (system-maintained from house charges + payments — read-only at POS), `Store Credit Balance` (system-maintained from store-credit tenders), Frequent Buyer info (read-only at POS — see below), `Comments`. Buttons: `[Clear]`, `[Delete]`, `[Copy]`, `[Next]`, `[Prev]`, `[Detail]`, `[Label]` (saves a stored label — see p. 131), `[Family]`.
- **p. 117, Customer Lookup** — by Account #, by Name (full or "type the first few letters of the last name and Enter — first match displays"), and via the system-wide Look Up screen.
- **p. 117, Customer ALERT flag** — typing `[ALERT]` in all caps at the start of the first comment line causes the entire comment to display on the sales screen *before a sale can be entered* for that customer. Used for bad-check writers, frequent returners, etc.

**Mail Detail** (Ch. 9)
- **p. 118, Mail Detail – Look At** — shows `Date Added`, `Date of Last Purchase`, and Quantity + Sales totals at three rolling buckets (`PTD`, `YTD`, `TTD`). Each line of detail: `Date sold`, `Str` (store), `Ticket #`, `Slsp` (salesperson), `Trans` (transaction type — see p. 29 list: Regular Sale, User Defined, Special Order Pickup, Layaway Sale, Gift Certificate Sale, Charge Payment, Special Order Deposits, Layaway Payment), `SKU #`, `Col`, `Rw`, `Qty`, `Price paid`, `Fam` (family member code), `Vend`, `Cat`, `Description`. Toggleable sub-views `[Tender]` (per-line tender breakdown + Tax 1/2/3 + Other Charges + Prev Paid + Change) and `[Comments]`.

**Family Members** (Ch. 9)
- **p. 118, Enter Family Member** — `Code` (2 chars), `Name` (35 chars), `Gender` (1 char — `M`/`F`/`C` for child, used by Family Mail List criteria), `Birthday` (`MM-DD-YY` — used for birthday cards, p. 126 + p. 819), the same six Extra Mail List Fields, and per-member `Comments`. Each family member has independent Mail Detail and an independent stored label.
- **p. 32, Family Member at point of sale** — at sales ticket entry, each line can be tagged with a Family Member code so the detail posts to that member's history (one family member per line, multiple per ticket).

**Print Mail List + Labels** (Ch. 9)
- **p. 119, Print Mail List – Reports and Labels** — five output formats: `Wide report (1 line per customer)`, `Narrow report (2 columns)`, `Narrow report with mail detail` (with a date-range filter), `Mail Labels` (printer), `Export comma-delimited file`. The Special-Orders / Layaways / Payments-Charges / Credit-Slips variants are *the same report* with a transaction-type pre-filter and a `Print customers with zero balances` toggle. Sort order: Account #, Name, Zip Code, YTD Sales, TTD Sales, PTD Sales, or Last Year Sales.
- **p. 119, Account Criteria / Sales Criteria / Detail Criteria / File List Criteria / Misc. Options** — five tabs of filters. Account: Account #, Zip, State, Name, the six Extra fields. Sales: date-added range, date-of-last-purchase range, PTD/YTD/TTD sales ranges, plus three Frequent Buyer columns (Plan #, Quantity, Dollars) when the plan is enabled. Detail: made-a-purchase date range, Store, Salesperson, SKU, Col/Row, Category, Vendor, Return Code, Selected Detail Sales. File List: cross-list set algebra — `Include` files (intersection) and `Exclude` files (subtraction) keyed by account # against previously-exported CSVs (the manual at pp. 120–121 walks through a multi-store mailing example using this). Misc: limit to "has e-mail" / "no e-mail" / "ALERT customers".
- **p. 122, Export Options tab** — when output is `Export comma-delimited file`, choose filename + whether to include email + user-defined fields + customer sales totals; check `Export Customer Purchase Detail` to additionally emit a separate Mail Detail file (with optional Detail Criteria sub-filter).
- **p. 126, Print Mail List – Family** — same shape as the parent report but emits one row per family member; adds a Family Criteria tab (Account, Zip, State, Name, Gender filter for birthday-card or gender-targeted runs) and supports the same five output formats.

**Customer Analysis** (Ch. 9)
- **p. 123, Customer Analysis Report** — segments the customer base into a 6-way grouping. Groupings: by Zip Code (with a "how many leading characters of the zip" parameter), by Year-Added cohort, by Year-of-Last-Purchase, etc. Detail-date-range filter ("by restricting the detail to the current year, you tell how much of your current business is due to new customers by analyzing by Year/Added"). Reuses the same Account / Sales / Detail / File List / Misc Criteria tabs as Print Mail List.

**Quotes** (Ch. 9)
- **p. 134, Quote Setup** — a single tenant-level header text that prints at the top of every Quote.
- **p. 134, Enter Quotes** — per-customer special pricing. Fields: `Account #` (required — quotes are customer-anchored), `Quote # 1–99`, `Effective Date`, `Ending Date`, `Active` checkbox (only one Active quote per customer), `Comments to print at bottom`. Body: SKU lines with `Quote at` (the quoted price). Lookup-then-add an SKU that doesn't exist via `[Add]` in the SKU lookup. View all SKUs on a quote with `[Ctrl]+[Q]`. `[Save]` saves and clears for the next SKU. `[Save & Print]` prints + clears the whole quote. `[Merge]` merges this quote with an existing one.
- **p. 134, Pricing applied at sale** — when a customer with an Active Quote rings up an SKU listed on that quote, the quoted price is automatically used at the register on both the main and POS computers. The behaviour is automatic — no salesperson key combo required.
- **p. 134, Print Quotes** — selectable by Account, Effective-from range, Ending-from range, with toggles for `Print cost and G.P. % on quotes` (internal vs. customer copy), `Print Active Quotes`, `Print Inactive Quotes`.

**Frequent Buyer Plan** (Ch. 15)
- **p. 201, What is the Frequent Buyer Plan?** — five award calculation methods, all toggleable per plan:
  1. Buy `X` quantity → discount = `N%` of the average value of those X items, applied to the next purchase. ("Buy 6, get 50% of average on the 7th.")
  2. Buy `$X` cumulative → flat `$N` off next purchase.
  3. Fixed `N%` discount on every purchase (no break point).
  4. Buy `X` quantity → `N%` off next purchase.
  5. Buy `$X` cumulative → `N%` off next purchase.
- **p. 201, Phase from one plan to another** — when the customer hits the break point on plan A and the award fires, RICS automatically switches them to plan B (configured per-plan as `New Plan #`). Used to migrate customers off retired plans without a manual re-tag.
- **p. 201, Change Frequent Buyer Plan** — up to **5 plans** company-wide, each with: `Calculation Method`, `Break Point` (qty or $ depending on method), `Discount` (% or $ depending on method), `New Plan` (next-plan after award), `Credit SKU`, `Discount SKU` (RICS recommends `FB/CREDIT` and `FB/DISC` — created as SKUs in a dedicated `Frequent Buyer` vendor + category 990 with no size type), `Accum Categories` (which categories count toward accrual — leave blank for "all"; supports ranges via `-` and lists via `,`), `No Qty. Categories` (categories whose dollars accrue but whose quantity does not — for coupons / discounts), `Allow Negative Counts` (default on, override only per CSI guidance), `Discount Full Price Only` (exclude markdown / clearance from accrual), `Retain Partial Credit` (carry leftover credit forward when discount > current purchase), `Credit Categories Only` (restrict redemption-eligible SKUs to the same Accum Categories), `Points Factor` (Methods 2 + 5 only — divisor that converts cumulative dollars to a "points" display number, e.g. `50` → `$459.78 = 9 points`, `0.01` → `$459.78 = 45,978 points`).
- **p. 201, Default Plan + per-customer plan #** — `Default Plan` is auto-assigned to each new customer record; an empty Default means "no auto-assign, salesperson types it in".
- **p. 203, Using the Frequent Buyer Plan** — at the register the customer record displays read-only `Plan #`, `Qty Purchased`, `$$$ Purchased`, `Estimated Discount`. The qty/dollars **cannot be manually changed at the POS** (only via the Existing Customers FBP utility on the main computer, p. 203). When the break point is hit and a discount fires, a confirm dialog displays ("`JOHNSON, MARY is now eligible for a Frequent Buyer Discount of $29.99. Apply discount now?`"). Accepting prints the discount as a negative-quantity line of the Discount SKU at the discount amount; the customer's running totals decrement by the break point; the customer's frequent-buyer balance prints at the bottom of the receipt (suppressible via Customer Support).
- **p. 203, Existing Customers FBP / Freq. Buyer Input + Update** — bulk-seed a customer's prior cumulative quantity + dollars when migrating from a manual loyalty program.
- **p. 205, Refunds with FBP** — two refund modes: (1) refund-and-disregard-discount → the qty purchased goes negative, customer must purchase again to re-cross the threshold; (2) refund-and-recreditthe-discount → refund the original SKU at full price *and* sell the Discount SKU for the discount amount, restoring the pre-discount state.

**Per-customer mail-list maintenance** (Ch. 9)
- **p. 127, Change Account Numbers** — ad-hoc renumber. Inputs `Original Account #` + `New Account #`, click `[Change]`. If the new account already exists, the customer detail merges into that target account.
- **p. 127, Delete Mail List Names** — bulk-delete by criteria (`haven't made a purchase after [date]` AND `added before [date]`). **Hard guard**: customers with a current A/R balance OR a balance on their most recent statement are never deleted. Optional "Print listing of deleted names". Optional "Keep customers who haven't made a purchase".
- **p. 128, Delete Mail List Detail** — purge per-line purchase detail by date range and account criteria. Header records remain.
- **p. 128, Clear Mail List PTD Totals** — zero out the PTD column. Operator decides cadence (quarterly, annually, sale-period-end). Leaving the account field blank wipes ALL customers' PTD totals (the manual emphatically warns: "**Leaving the account field blank will delete All Period-to-Date Totals!!!!**").
- **p. 129, Import Mail List Names** — ingest external mail list (purchased list, internet signups, CASS-certified list returned from a bulk-mail vendor). Source file: comma-delimited or DBF. General tab: `File Name`, `Account Number Location` (use a column from the file, OR derive from Phone, OR derive from Name — the manual advises against name-derived), `Account Name Location` (file format — separated `Last`/`First` cols vs. one combined col, use-as-is vs. parse-by-position), `File Format` (flat-fixed-length needs record length), `Overwrite existing mail list accounts`, `Have you made a backup of your data?` (mandatory checkbox per the manual: "It is important that you have a current backup of your data before importing mail list names as all the changes to the mail list data will be permanent."). Fields tab: per-target-field, the position (column index for CSV, start+length for fixed-flat). Audit trail of exceptions written when the job runs.

**Stored labels** (Ch. 9)
- **p. 131, Print Stored Address Labels** — every `[Label]` press in Customer / Family / Vendor / Store entry pushes a label record into a queue. This screen shows the queue count and prints the lot, with a per-address copy multiplier (1–99). Requires the Mailing Label printer to be configured in Printer Setup (Ch. 17).

**Gift certificate maintenance edit surface** (Ch. 9)
- **p. 131, Gift Certificate Maintenance** — *edit* surface for an already-existing gift certificate (issuance via sale lives in `customer-transactions`). Fields: `Gift Certificate ID` (auto-numbered if numeric, manual otherwise), `Sequence` (allows reuse of an ID across vendors / programs), `Account` (purchaser), `Amount` (face), `Redeemed`, `Balance`. Sub-tab `Purchase Info`: `For Account` (recipient), `Store`, `Ticket`, `Date`. Sub-tab `Redeemed Info`: editable grid of redemption rows (`Store`, `Ticket`, `Date`, `Account`, `Amount`) with `[New]` / `[Edit]`. Buttons: `[Clear]`, `[Save]`, `[Save and End]`, `[Delete Gift Cert]`, `[Exit]`. **Crm owns this edit surface only**; the sale-time issuance and the redeem-as-tender-type flow live in `customer-transactions`. Likewise the lookups `getGiftCertificateByCustomer(customerId)` and `getOutstandingGiftCertificateBalance(customerId)` are crm-side wrappers.
- **p. 132, Print Gift Certificate Activity** — activity report. Filters: `Print activity from __ to __`; data sources `Select from posted sales` ∪ `Select from unposted sales` (xor with `Select from gift certificate file`); `Print all detail for any gift certificate selected`; `Only print gift certificates with an outstanding balance`. Sort by `Gift Certificate #` or `Date`. `Combine Stores` toggle. Criteria tab: Stores, Purchasing customers, Redeeming customers, Gift Cert. #'s.

**Mail List Setup** (Ch. 17)
- **p. 218, Mail List Setup** — defines the optional **Extra Mail List Fields** (up to 6) that surface across Customer / Family entry and on every Mail List filter screen. Each: `Description` (15 char) + `Length` (up to 24 char). Tenant-wide settings:
  - `Save Mail Detail` toggle — when off, no per-line purchase detail is stored (saves disk; loses Mail Detail screen, Detail Criteria filters, and the Frequent Buyer detail-sourced columns).
  - `Omit these categories from posting to Mail Detail` — categories whose sales line up to the customer's totals but are *not* recorded in Mail Detail (RICS recommends accessories: laces, polish, etc.).
  - `Prevent these categories from adding quantities to purchase totals` — categories that contribute dollars but not quantity to PTD/YTD/TTD (used for coupon / promo / discount SKUs).

**Account-number-required policy** (Ch. 2 cross-ref, p. 1253–1254)
- **p. 1253–1254, Required Account Numbers for Selected Transaction Types / Tender Types** — `sales-pos` enforces, but the policy itself is per-tenant config that lives with the customer module's surface (because it's about *when* a customer must be linked). Enumerated transaction types: 1=Regular, 2=User Defined, 3=Special Order Pickup, 4=Layaway Sale, 5=Gift Certificate Sale, 6=Charge Payment, 7=Special Order Deposit, 8=Layaway Payment.

## Modernization decisions

- **Customer ID is a UUID; account number is a separate, mutable, indexed string.** RICS overloads `Account #` to be both the natural key and the lookup string (p. 117), with the awkward result that "Change Account Numbers" (p. 127) is its own batch utility. Zack's Retail makes the customer's primary key a UUID and treats `accountNumber` as a regular indexed unique string field — renaming is a normal `PATCH /customers/:id`. The standalone Change Account Numbers screen disappears (per the legacy-cut rule on `MODULES.md` lines 45–67 about batch-rename tools collapsing into ordinary admin edit). The merge-on-rename behaviour ("transfer detail to an existing account" — p. 127) becomes a separate explicit `mergeCustomers(sourceId, targetId)` action with a preview.
- **Account number defaults to phone but does not have to be the phone.** RICS recommends the phone (p. 117) but treats it as a freeform string. Zack's Retail keeps the freeform field with a phone-default helper ("Use phone as account #" button at create time) and adds a separate `phoneE164` field for proper telephony validation. Lookup hits both. This sidesteps the legacy "DO NOT use parens or dashes" trap.
- **Name stored as separate `lastName` + `firstName` + `displayName` fields, not a free-form `LAST, FIRST` string.** RICS uses a single 35-char field with a comma convention (p. 117). Zack's Retail splits the fields so label flipping ("`JOHNSON, MARY` → `MARY JOHNSON`") becomes deterministic, sort-by-last-name is trivial, and the existing comma-anchor parsing for Mail Detail and exports is unnecessary. We keep `displayName` as a denormalized convenience for legacy downstream consumers (NPD export, label printers).
- **Mail List Setup is a single tenant-level `MailListSettings` record, not per-machine config.** RICS Mail List Setup (p. 218) writes config that has to be replicated to each POS. Zack's Retail collapses to one row in `mail_list_settings` keyed by tenant, with sensible defaults: `saveMailDetail: true`, `omitCategoriesFromMailDetail: []`, `excludeCategoriesFromQtyTotals: []`, `extraFields: []`. Settings updates emit `MailListSettingsChangedEvent` so the storefront and admin UI invalidate caches.
- **Extra Mail List Fields become a typed `extraFields` JSON column with a schema record.** RICS hardcodes 6 generic fields (p. 218). The modern shape is `extraFields: [{ key, label, type: 'string'|'number'|'date'|'enum', maxLength, options? }]` — supports the same 6+ fields with explicit types, validation at write time, and per-field lookup support. The cap of 6 is dropped (no UI or storage reason to keep it).
- **Frequent Buyer Plan stays — modeled as a `LoyaltyProgram` aggregate with versioned `LoyaltyProgramRules`.** RICS has up to 5 plans (p. 202) with a hand-wired `New Plan` chain for migration. Zack's Retail keeps the same five calculation methods (faithful port of pp. 201–202) but adds:
  - **Versioned rule snapshots.** When a customer's points were accrued under v3 of plan #2, that's the rule that gets applied at redemption time — even if an admin edits plan #2 to v4 the next day. Prevents retroactive discount changes.
  - **Plan migration is event-driven.** The `New Plan` field becomes a `nextPlanIdAfterRedemption` foreign key; the migration fires as a `LoyaltyPlanMigratedEvent` when the redemption posts, with an audit row.
  - **No 5-plan cap.** Storage and UX support arbitrary N plans; the cap was a RICS DB-shape constraint, not a business rule.
  - **Redemption is a tender type, not a negative-qty line.** RICS rings the discount as a negative-quantity line of the Discount SKU (p. 203) so the math falls out of the existing line-item engine. Zack's Retail models loyalty redemption as a `LoyaltyRedemptionTender` that subtracts from the ticket total at tender time; `sales-pos` knows about it via the existing tender-type contract. The Discount SKU is preserved as an *optional* presentation overlay for receipts that want the legacy line-item style — but the truth is the tender, not a phantom SKU.
  - **Dollars-vs-points display is a per-program render hint, not a data shape.** RICS's `Points Factor` (p. 202) becomes `displayMode: 'dollars' | 'points'` plus `pointsPerDollar: number`. Storage stays in dollars-and-cents.
- **Loyalty accrual is event-driven from `sales-pos`, not a register-side mutation.** `sales-pos` publishes `TicketPostedEvent` (already in the registry); `crm` subscribes and runs `accrueLoyaltyForTicket(ticket)` which respects `Accum Categories`, `No Qty Categories`, `Discount Full Price Only`, and `Allow Negative Counts`. This means accrual is a single deterministic function over the posted ticket — testable, replayable, and not duplicated across register clients. Refund handling (p. 205 modes 1 + 2) becomes two named operations: `reverseAccrual(ticketId)` and `reverseAccrualAndRedemption(ticketId, originalRedemptionId)`. The salesperson picks the mode at refund time; the system does the right thing without manual SKU gymnastics.
- **Quotes are persistent, customer-anchored pricing rules; not "draft tickets".** The original spec instruction framed quotes as "stored draft tickets" — re-read of p. 134 shows quotes are a richer thing: per-customer, per-SKU price overrides with effective + ending dates, an Active flag (only one Active per customer), and automatic application at the register. Zack's Retail models them as `Quote { id, customerId, quoteNumber, effectiveDate, endingDate, isActive, footerComment, lines: [{ skuId, quotedPrice }] }`. At register time, when a ticket header is bound to a customer, the existing `sales-pos` price-resolution chain calls `crm.resolveQuotedPrice(customerId, skuId)` *before* falling through to discounts and base price. The "convert quote to sale" UX in the original instruction is then a different thing — a `[Apply Quote to Ticket]` action that adds every SKU on the quote to the active ticket, used as a shortcut for B2B or special-order workflows. We expose both: automatic price overlay (default) AND an explicit "load whole quote into ticket" action.
- **Quote merge is a first-class action, not a modal flag.** RICS's `[Merge]` button (p. 134) becomes `POST /quotes/:id/merge { sourceQuoteId }`. Source SKUs are appended; conflicting SKUs prefer the destination's quoted price unless `overrideOnConflict: true`. Audited.
- **Mail-list reports collapse from N variants to one parameterized engine.** RICS prints the same data five different ways (Wide / Narrow / Narrow-with-detail / Labels / Export) plus four transaction-type pre-filters (Special Orders / Layaways / Payments-Charges / Credit Slips) — that's a 20-row variant matrix on one screen (p. 119). Zack's Retail ships **one** `Mail List Report` UI with: filter tabs (the same five from p. 119) + a `Output Format` toggle (Screen / CSV / PDF / Labels). The transaction-type pre-filter is a regular Detail-Criteria filter, not a variant. The "Print customers with zero balances" toggle becomes a generic balance filter on the Sales Criteria tab.
- **Labels print browser-side, not via a barcode-printer driver.** RICS's `[Label]` button queues to a printer-side label spool (Ch. 1 + Ch. 17 Printer Setup). Zack's Retail collects the same queue (`StoredLabel { id, addressKind: 'CUSTOMER'|'FAMILY'|'STORE'|'VENDOR', addressId, copies, queuedAt }`) and renders to PDF / browser print at print time, with a label-template picker (Avery 5160, 5161, etc.). Drops barcode-printer driver setup (Ch. 1) and Mailing Label printer config in Printer Setup (Ch. 17).
- **Import Mail List is a CSV upload UI, not a diskette transfer or DBF parser.** RICS's import (p. 129) supports comma-delimited *and* DBase DBF (the latter because legacy mail-house deliverables shipped as DBFs in 2007). Zack's Retail accepts UTF-8 CSV (with auto-detect of delimiter and quoting). DBF support is dropped from v1; an admin who actually needs it can `csvkit`-convert before upload. The mandatory backup checkbox becomes an automatic pre-import snapshot of the affected customer rows held in `customer_import_snapshots` for 30 days, queryable as a "rollback this import" action.
- **Import is a two-step: upload + preview + confirm.** RICS commits as soon as the field-mapping screen runs. Zack's Retail uploads into a staging table, runs the per-row validation + dedupe-by-account-number check, presents a preview of `{ willCreate: N, willUpdate: M, willSkip: K, errors: [] }`, and only commits on user confirm. Audit trail of every applied row.
- **Customer Analysis becomes a generic faceting + cohort engine.** RICS's 6 hardcoded groupings (p. 123) become a configurable `groupBy` array — `['zipPrefix(3)', 'yearAdded']` produces the 2-D Year-Added × Zip cohort table that RICS forces you to run twice. Faithful to the original use case, more flexible.
- **The big "Leaving the account field blank will delete All PTD Totals!!!!" footgun (p. 128) becomes an explicit two-step confirm.** Zack's Retail's `Clear PTD Totals` action requires either a non-empty account criteria *or* an explicit "I want to clear ALL customers" checkbox plus typed-in tenant name. Same outcome, no accidental wipe.
- **A/R balance, store credit, and gift-certificate balance are projections, not stored counters.** RICS persists `Current Balance` (p. 117), `Store Credit Balance`, and per-customer FB qty/dollars on the customer record. Zack's Retail keeps loyalty totals on the customer (because they're an aggregate of the loyalty domain) but reads A/R balance and store-credit balance through `accounts-receivable.getBalance(customerId)` and `customer-transactions.getStoreCreditBalance(customerId)` respectively. The customer record carries cached `lastKnownArBalanceCents` + `arBalanceAsOf` for snappy UI display, with a "stale by N seconds" indicator.
- **ALERT flag is a typed field, not magic-string parsing in `Comments`.** RICS scans the first comment line for the literal `[ALERT]` (p. 117). Zack's Retail makes it `alertFlag: boolean` + `alertMessage: text`. Migration converts existing RICS records by stripping the `[ALERT]` prefix and copying the rest into `alertMessage`. The display behaviour at the register (block sale entry until the operator dismisses) stays.
- **Family member is a lightweight one-to-many under a head-of-household customer record.** Faithful port of p. 118 — same fields, same per-member Mail Detail, same per-member stored labels. Modeled as `FamilyMember { id, customerId, code, firstName, lastName, gender, birthday, extraFieldsJson, comments, alertFlag, alertMessage }`. Used by `customer-transactions` for gift-certificate addressee lookup (`getEligibleAddressees(customerId)` returns head + family). `code` stays a 2-char string for register-keypress compatibility, but a UUID `id` is the actual key.
- **Account-number-required policy is centralized in `crm` settings.** RICS sprinkles the toggles across Sales Ticket Options (p. 1253–1254). Zack's Retail centralizes them in `MailListSettings` as `requireAccountFor: { transactionTypes: TxType[], tenderTypes: TenderType[] }`. `sales-pos` and `customer-transactions` read this on ticket save and block the save if the customer is missing.
- **Gift certificate maintenance is a thin admin surface; the issuance + redemption ledger lives in `customer-transactions`.** Per the registry split — `crm` exposes the per-customer view ("show me all gift certificates this customer purchased / received") and the admin edit form (p. 131). The activity report (p. 132) reads from `customer-transactions`'s ledger. No double-write.

## Data model sketch

```prisma
model Customer {
  id                       String   @id @default(uuid())
  accountNumber            String   @unique          // RICS Account #, 15 chars (p. 117) — freeform
  phoneE164                String?                    // structured phone, indexed for telephony lookup
  firstName                String?
  lastName                 String?
  displayName              String                     // denormalized "LAST, FIRST" or "FIRST LAST"
  email                    String?                    // RICS p. 122 export hook
  addressLine1             String?
  addressLine2             String?
  city                     String?
  stateRegion              String?
  postalCode               String?
  country                  String?
  creditLimit              Decimal? @db.Decimal(12, 2) // RICS p. 117 — mainframe-only in legacy
  loyaltyPlanId            String?                    // FK → LoyaltyProgram (RICS Plan #, p. 203)
  loyaltyAccruedQty        Int      @default(0)       // RICS Qty Purchased
  loyaltyAccruedDollarsCents BigInt @default(0)      // RICS $$$ Purchased
  loyaltyEstimatedDiscountCents BigInt @default(0)   // RICS Estimated Discount
  loyaltyPartialCreditCents BigInt @default(0)        // p. 202 Retain Partial Credit
  alertFlag                Boolean  @default(false)   // p. 117 ALERT — extracted from legacy [ALERT] prefix
  alertMessage             String?
  comments                 String?
  ptdQty                   Int      @default(0)       // p. 117 PTD totals
  ptdSalesCents            BigInt   @default(0)
  ytdQty                   Int      @default(0)
  ytdSalesCents            BigInt   @default(0)
  ttdQty                   Int      @default(0)
  ttdSalesCents            BigInt   @default(0)
  lastYearSalesCents       BigInt   @default(0)
  dateAdded                DateTime @default(now())
  dateOfLastPurchase       DateTime?
  lastKnownArBalanceCents  BigInt   @default(0)       // cached projection from accounts-receivable
  arBalanceAsOf            DateTime?
  lastKnownStoreCreditCents BigInt  @default(0)       // cached projection from customer-transactions
  storeCreditAsOf          DateTime?
  extraFieldsJson          Json?                      // typed Extra Mail List Fields (p. 218)
  marketingOptIn           Boolean  @default(false)   // GDPR-era addition; used by Mail List filters
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  familyMembers            FamilyMember[]
  quotes                   Quote[]
  storedLabels             StoredLabel[]
  loyaltyEvents            LoyaltyEvent[]

  @@index([phoneE164])
  @@index([lastName, firstName])
  @@index([postalCode])
  @@index([loyaltyPlanId])
}

model FamilyMember {
  id              String   @id @default(uuid())
  customerId      String
  code            String                              // p. 118 — 2 chars, register-keypress
  firstName       String?
  lastName        String?
  gender          String?                             // p. 118 — M/F/C
  birthday        DateTime?                           // p. 118 — birthday-card filter
  extraFieldsJson Json?
  comments        String?
  alertFlag       Boolean  @default(false)
  alertMessage    String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  customer        Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@unique([customerId, code])
}

model MailListSettings {                              // RICS Mail List Setup, p. 218 — one row per tenant
  id                              String   @id @default(uuid())
  saveMailDetail                  Boolean  @default(true)
  omitCategoriesFromMailDetail    Json     @default("[]")  // category id list
  excludeCategoriesFromQtyTotals  Json     @default("[]")  // category id list
  extraFieldDefinitions           Json     @default("[]")  // [{ key, label, type, maxLength, options? }]
  requireAccountForTransactionTypes Json   @default("[]")  // p. 1253 — TxType[]
  requireAccountForTenderTypes    Json     @default("[]")  // p. 1254 — TenderType[]
  defaultLoyaltyPlanId            String?                  // RICS p. 202 Default Plan
  updatedAt                       DateTime @updatedAt
}

// --- Mail Detail (the per-line purchase ledger surfaced on the customer record) ---

model MailDetail {                                    // RICS Mail Detail, p. 118
  id              String   @id @default(uuid())
  customerId      String
  familyMemberId  String?                             // RICS Fam column
  ticketId        String                              // FK → sales-pos ticket
  ticketLineId    String                              // FK → sales-pos ticket line
  storeId         Int
  salespersonId   String?
  transactionType Int                                 // p. 29 enum: 1..8
  skuId           String
  columnLabel     String?
  rowLabel        String?
  quantity        Int
  pricePaidCents  BigInt
  vendorId        String
  categoryId      Int
  description     String
  soldAt          DateTime
  // tender + comments live on the parent ticket; resolved on read for the [Tender] / [Comments] sub-views

  @@index([customerId, soldAt])
  @@index([familyMemberId, soldAt])
  @@index([ticketId])
}

// --- Quotes (RICS p. 134) ---

model Quote {
  id              String   @id @default(uuid())
  customerId      String
  quoteNumber     Int                                 // RICS Quote # 1..99 — but uncapped here
  effectiveDate   DateTime
  endingDate      DateTime
  isActive        Boolean  @default(false)
  footerComment   String?
  status          QuoteStatus                          // DRAFT | ACTIVE | INACTIVE | ARCHIVED
  createdBy       String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  lines           QuoteLine[]
  customer        Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@index([customerId, isActive])
  @@index([effectiveDate, endingDate])
}

model QuoteLine {
  id               String   @id @default(uuid())
  quoteId          String
  skuId            String
  quotedPriceCents BigInt
  notes            String?
  createdAt        DateTime @default(now())

  quote            Quote @relation(fields: [quoteId], references: [id], onDelete: Cascade)

  @@unique([quoteId, skuId])
}

// --- Loyalty (RICS Frequent Buyer Plan, pp. 201–205) ---

model LoyaltyProgram {                                 // RICS "Plan #" — up to 5 in legacy, uncapped here
  id                       String   @id @default(uuid())
  planNumber               Int      @unique            // legacy 1..N
  name                     String
  enabled                  Boolean  @default(true)
  currentRulesVersionId    String?                     // FK → LoyaltyProgramRules
  nextPlanIdAfterRedemption String?                    // RICS New Plan (p. 202) — phase-from-A-to-B chain
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  rules                    LoyaltyProgramRules[]
}

model LoyaltyProgramRules {                            // versioned snapshot — accrual under v1 redeems under v1
  id                        String   @id @default(uuid())
  programId                 String
  version                   Int
  calculationMethod         LoyaltyMethod              // METHOD_1..5 (p. 201)
  breakPointQty             Int?                       // methods 1, 4
  breakPointDollarsCents    BigInt?                    // methods 2, 3, 5
  discountPct               Decimal?                   // methods 1, 3, 4, 5
  discountDollarsCents      BigInt?                    // method 2
  accumCategoryIds          Json     @default("[]")    // p. 202
  noQtyCategoryIds          Json     @default("[]")
  allowNegativeCounts       Boolean  @default(true)    // p. 202
  discountFullPriceOnly     Boolean  @default(false)
  retainPartialCredit       Boolean  @default(false)
  creditCategoriesOnly      Boolean  @default(false)
  pointsDisplayMode         PointsDisplayMode  @default(DOLLARS)  // p. 202
  pointsPerDollar           Decimal?                   // RICS Points Factor inverse
  creditSkuId               String?                    // RICS FB/CREDIT
  discountSkuId             String?                    // RICS FB/DISC
  effectiveAt               DateTime @default(now())
  retiredAt                 DateTime?
  createdBy                 String
  createdAt                 DateTime @default(now())

  program                   LoyaltyProgram @relation(fields: [programId], references: [id])

  @@unique([programId, version])
}

model LoyaltyEvent {                                   // append-only per-customer ledger
  id              String   @id @default(uuid())
  customerId      String
  programId       String
  rulesVersionId  String                               // snapshot pin
  kind            LoyaltyEventKind                     // ACCRUAL | REDEMPTION | ACCRUAL_REVERSAL | REDEMPTION_REVERSAL | MANUAL_ADJUST | PLAN_MIGRATED
  ticketId        String?                              // null for MANUAL_ADJUST
  qtyDelta        Int      @default(0)
  dollarsDeltaCents BigInt @default(0)
  reason          String?
  actorUserId     String?
  createdAt       DateTime @default(now())

  customer        Customer @relation(fields: [customerId], references: [id])

  @@index([customerId, createdAt])
}

// --- Stored labels (RICS p. 131) ---

model StoredLabel {
  id           String   @id @default(uuid())
  addressKind  AddressKind                              // CUSTOMER | FAMILY | STORE | VENDOR
  addressId    String                                   // FK depends on addressKind
  copies       Int      @default(1)
  queuedBy     String
  queuedAt     DateTime @default(now())
  printedAt    DateTime?

  customer     Customer? @relation(fields: [addressId], references: [id])

  @@index([addressKind, printedAt])
}

// --- Import staging (replaces RICS p. 129 import job + the manual backup mandate) ---

model CustomerImportJob {
  id              String   @id @default(uuid())
  filename        String
  uploadedBy      String
  uploadedAt      DateTime @default(now())
  fieldMappingJson Json
  status          ImportStatus                         // UPLOADED | PREVIEWED | COMMITTED | ROLLED_BACK | FAILED
  willCreateCount Int      @default(0)
  willUpdateCount Int      @default(0)
  willSkipCount   Int      @default(0)
  errorCount      Int      @default(0)
  committedAt     DateTime?
  rolledBackAt    DateTime?
}

model CustomerImportRow {
  id            String   @id @default(uuid())
  jobId         String
  rowIndex      Int
  rawJson       Json
  outcome       ImportRowOutcome                       // CREATE | UPDATE | SKIP | ERROR
  customerId    String?                                // set on commit
  beforeSnapshotJson Json?                              // for rollback (UPDATEd customer's prior state)
  errorMessage  String?
}

enum QuoteStatus           { DRAFT  ACTIVE  INACTIVE  ARCHIVED }
enum LoyaltyMethod         { METHOD_1  METHOD_2  METHOD_3  METHOD_4  METHOD_5 }
enum PointsDisplayMode     { DOLLARS  POINTS }
enum LoyaltyEventKind      { ACCRUAL  REDEMPTION  ACCRUAL_REVERSAL  REDEMPTION_REVERSAL  MANUAL_ADJUST  PLAN_MIGRATED }
enum AddressKind           { CUSTOMER  FAMILY  STORE  VENDOR }
enum ImportStatus          { UPLOADED  PREVIEWED  COMMITTED  ROLLED_BACK  FAILED }
enum ImportRowOutcome      { CREATE  UPDATE  SKIP  ERROR }
```

## API surface

**Customer record**
- `GET    /api/v1/customers` — list with filters (q, accountNumber, phone, postalCode, loyaltyPlanId, hasEmail, marketingOptIn, alertFlag); cursor pagination
- `POST   /api/v1/customers` — create
- `GET    /api/v1/customers/:id` — full profile (includes balances, loyalty, family count, active quote)
- `GET    /api/v1/customers/by-account/:accountNumber` — `findByAccountNumber` lookup (used at register)
- `PATCH  /api/v1/customers/:id` — edit (replaces the legacy Change Account Numbers screen for renames)
- `DELETE /api/v1/customers/:id` — guarded delete (refuses if A/R balance ≠ 0 or open statement balance ≠ 0)
- `POST   /api/v1/customers/:id/merge` — body `{ intoCustomerId }`; merges all detail + family + quotes + loyalty events
- `GET    /api/v1/customers/:id/mail-detail` — paginated purchase history (RICS Mail Detail p. 118); includes `?include=tender,comments`

**Family**
- `POST  /api/v1/customers/:id/family-members`
- `GET   /api/v1/customers/:id/family-members`
- `PATCH /api/v1/family-members/:id`
- `DELETE /api/v1/family-members/:id`
- `GET   /api/v1/family-members/:id/mail-detail`

**Mail List Settings**
- `GET   /api/v1/mail-list-settings`
- `PATCH /api/v1/mail-list-settings`

**Quotes**
- `GET   /api/v1/customers/:id/quotes`
- `POST  /api/v1/customers/:id/quotes` — create with header + lines
- `GET   /api/v1/quotes/:id`
- `PATCH /api/v1/quotes/:id` — header edits (effective/ending/active/footer)
- `POST  /api/v1/quotes/:id/lines` — add an SKU + quoted price
- `PATCH /api/v1/quotes/:id/lines/:lineId`
- `DELETE /api/v1/quotes/:id/lines/:lineId`
- `POST  /api/v1/quotes/:id/activate` — sets `isActive=true` and deactivates the customer's prior active quote
- `POST  /api/v1/quotes/:id/merge` — body `{ sourceQuoteId, overrideOnConflict?: boolean }`
- `POST  /api/v1/quotes/:id/apply-to-ticket` — body `{ ticketId }`; called from the register

**Loyalty / Frequent Buyer**
- `GET   /api/v1/loyalty/programs`
- `POST  /api/v1/loyalty/programs` — create (rules required)
- `GET   /api/v1/loyalty/programs/:id`
- `POST  /api/v1/loyalty/programs/:id/rules` — write a new rules version (atomic snapshot)
- `POST  /api/v1/loyalty/programs/:id/disable`
- `GET   /api/v1/customers/:id/loyalty` — current Plan #, accrued qty + dollars, estimated discount, partial credit, recent events
- `POST  /api/v1/customers/:id/loyalty/manual-adjust` — admin-only; legacy "Existing Customers FBP" replacement (p. 203)
- `POST  /api/v1/customers/:id/loyalty/migrate-plan` — manual override of automatic plan chaining

**Mail List reports + import**
- `POST  /api/v1/mail-list-reports/run` — body: full filter + output-format payload; returns `{ jobId, downloadUrl?: string }` for async runs
- `GET   /api/v1/mail-list-reports/:jobId` — status + result
- `POST  /api/v1/customer-imports` — multipart upload of CSV; returns `{ jobId }` in `UPLOADED` state
- `POST  /api/v1/customer-imports/:jobId/preview` — returns `{ willCreate, willUpdate, willSkip, errors }`
- `POST  /api/v1/customer-imports/:jobId/commit`
- `POST  /api/v1/customer-imports/:jobId/rollback`

**Customer Analysis**
- `POST  /api/v1/customer-analysis/run` — body: `{ groupBy[], filters[], detailDateRange?, format }`; returns the cohort table

**Stored labels**
- `GET   /api/v1/stored-labels?status=queued|printed`
- `POST  /api/v1/stored-labels` — push a label into the queue (called from `[Label]` button on Customer / Family / Vendor / Store entry)
- `POST  /api/v1/stored-labels/print` — body: `{ ids[], template, copiesOverride?: number }`; returns a PDF

**Gift Certificate maintenance** (edit surface only — issuance lives in `customer-transactions`)
- `GET   /api/v1/customers/:id/gift-certificates` — all gift certs purchased by OR for this customer
- `GET   /api/v1/gift-certificates/:id` — detail with redemption history
- `PATCH /api/v1/gift-certificates/:id` — admin edit (delegates to `customer-transactions.updateGiftCertificate`)
- `POST  /api/v1/gift-certificates/:id/redemption-rows` — admin-only correction (delegates likewise)

**Maintenance / housekeeping** (RICS pp. 127–128)
- `POST  /api/v1/customers/maintenance/clear-ptd` — body: `{ accountIds?: string[], confirmAll?: boolean, confirmTenantName?: string }`; refuses if `accountIds` is empty AND `confirmAll` is not true with a matching tenant name
- `POST  /api/v1/customers/maintenance/delete-by-criteria` — body: `{ noPurchaseAfter, addedBefore, dryRun?: boolean }`; honors the A/R-balance guard
- `POST  /api/v1/customers/maintenance/delete-detail-by-criteria` — body: `{ from, to, accountIds? }`

## UI surface

- **Customer list** (`/crm/customers`) — searchable grid (account #, name, phone, postal code, alert flag, loyalty plan, marketing opt-in); column chooser; bulk actions (export, label-queue, soft-delete with guard)
- **Customer detail / edit** — header card (name, account, phone, email, alert banner, A/R balance with stale-by indicator, store credit balance, loyalty Plan # + estimated discount); tabs: Profile, Family, Mail Detail, Quotes, Gift Certificates, Loyalty Events, Audit
- **Family member sub-form** — same shape as customer profile, scoped to a member; per-member Mail Detail tab
- **Mail Detail viewer** — virtualised table with `[Tender]` and `[Comments]` toggleable columns; date range filter; export-this-view as CSV
- **Quotes index** (under Customer detail) — list of customer's quotes with active flag; create / edit / merge actions; preview of quoted-vs-base price
- **Quote editor** — sequential SKU entry pattern (matches `purchasing.md` UX rule): single active editor, numbered committed list below; per-line `Quote at` price with live G.P. % display; effective/ending date pickers; active toggle (warns when deactivating an existing active quote)
- **Mail List Report builder** (`/crm/mail-list-reports`) — five filter tabs (Account / Sales / Detail / File List / Misc) + Output Format selector (Screen / CSV / PDF / Labels); save filter presets per user; queue-and-notify pattern for large exports (calls `platform` background job runner)
- **Customer Analysis** (`/crm/customer-analysis`) — multi-select `Group By` builder (zip prefix N, year added, year of last purchase, loyalty plan, gender, salesperson, etc.), date range, criteria tabs reused from Mail List Report, output as a pivoted table + heatmap
- **Frequent Buyer Plan admin** (`/crm/loyalty/programs`) — list of plans, edit rules (creating a new rules version on save), set `Default Plan`, configure plan-chaining
- **Customer Loyalty drilldown** — under Customer detail; recent loyalty events ledger, manual adjust action (with audit memo)
- **Stored Labels queue** (`/crm/labels/queue`) — count by addressKind; bulk print action with template + copies picker; preview pane
- **Mail List Setup** (`/crm/settings/mail-list`) — toggles (Save Mail Detail, omit categories from Mail Detail, exclude categories from Qty totals); Extra Fields editor (typed); account-required-policy toggles for transaction types and tender types; default loyalty plan
- **Customer Import wizard** (`/crm/imports/new`) — step 1 upload, step 2 field mapping (with auto-detect), step 3 preview (counts + first 50 anomalies), step 4 commit; rollback action on any prior import for 30 days
- **Maintenance utilities** (`/crm/maintenance`) — Clear PTD Totals (with hard confirm), Delete by Criteria, Delete Detail by Criteria — each shows a dry-run preview before commit
- **Gift Certificate edit form** (admin-only; opened from Customer detail → Gift Certificates tab) — header + Purchase Info + Redeemed Info grid

## Dependencies

- **products** — `getSku(skuId)`, `getCategory(categoryId)`, `getVendor(vendorId)` for Mail Detail rendering, Quote line lookup, and the loyalty Accum/NoQty/Credit Categories pickers; `validateSkuForLoyaltyAccrual(skuId)` (returns `{ allowed, reason? }` honouring full-price-only). Loyalty admin reads `listSkusByCategoryRange()` for the Categories pickers.
- **store-ops** — `listStores()`, `getStore(storeId)` for Mail Detail filters and report criteria; `listSalespeople()` for the Detail Criteria filter
- **sales-pos** — *consumes* `TicketPostedEvent` (loyalty accrual) and `TicketRefundedEvent` (loyalty reversal); *exposes* `resolveQuotedPrice(customerId, skuId)` and the loyalty redemption tender contract; *consumes* `getTicket(ticketId)` for Mail Detail backfill / repair flows
- **customer-transactions** — *consumes* `getGiftCertificatesByCustomer(customerId)`, `getStoreCreditBalance(customerId)`; *exposes* the maintenance-edit endpoints that wrap CT's writes
- **accounts-receivable** — `getBalance(customerId)`, `getMostRecentStatement(customerId)` for the delete-guard and the cached AR balance display; `MonthClosedEvent` triggers `Last Year Sales` rollup into the customer record
- **employees** — `hasPermission(userId, 'crm.editLoyalty' | 'crm.runImport' | 'crm.maintenance.clearPtd' | 'crm.delete' | 'crm.giftCertEdit')`
- **platform** — async job runner for big report exports + label PDF generation; CSV import staging storage; in-app notification fanout for ALERT customers across stores; audit log overlay
- **storefront (apps/storefront)** — when the storefront acquires customer accounts (post-v1), it will write to the same `Customer` table; the schema here is forward-compatible

## Contracts exposed

**Outbound (for other modules to consume)**
- `getCustomer(id)` → `Customer` (includes loyalty fields, alert, balances) — used by `sales-pos` ticket header bind, `accounts-receivable` statement formatting, `customer-transactions` lookups
- `findByAccountNumber(accountNumber)` → `Customer | null` — register-side lookup
- `findByPhone(phoneE164)` → `Customer | null`
- `searchCustomers(query, limit)` → `Customer[]` — name / phone / account prefix search for the register's lookup palette
- `getEligibleAddressees(customerId)` → `[{ id, name, kind: 'CUSTOMER'|'FAMILY' }]` — used by `customer-transactions` for gift-certificate addressee picker
- `resolveQuotedPrice(customerId, skuId, asOf?: Date)` → `{ priceCents, quoteId, quoteLineId } | null` — `sales-pos` calls before falling through to base-price resolution
- `applyQuoteToTicket(ticketId, quoteId, options?: { skuFilter? })` → `{ addedLineCount, totalCents }` — the explicit "load whole quote" register action
- `accrueFrequentBuyerPoints(customerId, ticket)` → `{ events: LoyaltyEvent[], crossedBreakPoint: boolean, eligibleDiscountCents: BigInt }` — server-side hook (ordinarily invoked via the `TicketPostedEvent` subscription — direct invocation supported for backfills)
- `redeemFrequentBuyerPoints(customerId, points, ticketId)` → `{ event: LoyaltyEvent, discountAppliedCents: BigInt, partialCreditCents: BigInt, planMigratedTo?: string }` — called by the loyalty redemption tender in `sales-pos`
- `reverseAccrual(ticketId)` and `reverseAccrualAndRedemption(ticketId, redemptionEventId)` — refund-time loyalty modes (RICS p. 205)
- `getMailListSettings()` → `MailListSettings` — read by `sales-pos` and `customer-transactions` for the account-required policy
- `getActiveAlerts(customerId)` → `{ alertFlag, alertMessage } | null` — `sales-pos` ticket-header guard

**Events emitted**
- `CustomerCreatedEvent { customerId, accountNumber }`
- `CustomerUpdatedEvent { customerId, fieldsChanged: string[] }`
- `CustomerMergedEvent { sourceCustomerId, targetCustomerId, mergedAt }`
- `CustomerDeletedEvent { customerId }`
- `QuoteActivatedEvent { quoteId, customerId, deactivatedQuoteId? }`
- `LoyaltyAccrualPostedEvent { eventId, customerId, ticketId, qtyDelta, dollarsDeltaCents }`
- `LoyaltyRedemptionPostedEvent { eventId, customerId, ticketId, discountAppliedCents }`
- `LoyaltyPlanMigratedEvent { customerId, fromProgramId, toProgramId, triggeringEventId }`
- `LoyaltyManualAdjustEvent { customerId, eventId, actorUserId, reason }`
- `MailListSettingsChangedEvent { fieldsChanged: string[] }`
- `CustomerImportCommittedEvent { jobId, willCreate, willUpdate, committedAt }`

**Events consumed**
- `TicketPostedEvent` (from `sales-pos`) — triggers Mail Detail write, PTD/YTD/TTD updates, loyalty accrual
- `TicketRefundedEvent` (from `sales-pos`) — triggers Mail Detail reversal + loyalty reversal (mode picked from refund payload)
- `MonthClosedEvent` (from `accounts-receivable`) — triggers PTD reset prompt (admin notification), `lastYearSalesCents` rollup at year-end close
- `GiftCertificateIssuedEvent` (from `customer-transactions`) — denormalises a quick "this customer has a gift cert" badge on the customer header
- `ArBalanceChangedEvent` (from `accounts-receivable`) — refreshes `lastKnownArBalanceCents` cache

## Out of scope for v1

- **Standalone "Change Account Numbers" batch tool (RICS p. 127)** — collapsed into ordinary `PATCH /customers/:id` per the legacy-cut-list rule on `MODULES.md` lines 45–67. The merge-into-existing-account behaviour is preserved as the explicit `mergeCustomers` action.
- **Bar-code / Mailing-Label printer driver setup (Ch. 1, Ch. 17 Printer Setup)** — labels render browser-side via PDF.
- **Modem / diskette mail-list export (Ch. 13 — `A:MAIL.ZIP` convention referenced at p. 119, p. 126)** — replaced by browser CSV download.
- **DBF (DBase) import format (p. 129)** — CSV only in v1; convert externally if needed.
- **The 5-plan cap on Frequent Buyer Plans (p. 202)** — UX permits N plans; underlying model is uncapped.
- **The Save-Mail-Detail-as-disk-saver toggle (p. 218)** — modeled in the schema but defaulted on; the original rationale (extra disk space) is irrelevant on managed Postgres. The toggle stays for tenants who want PII minimisation, not for performance.
- **"Copy this file to the POS computer(s)" replication of the Frequent Buyer Plan (p. 203)** — single source of truth; no sync step.
- **Backup-data prompt before Import Mail List (p. 129)** — replaced by automatic per-import staging snapshot + 30-day rollback.
- **The 6-Extra-Field cap (p. 218)** — schema supports N extra fields; UI defaults to a "common 6" template for migration parity.
- **The literal `[ALERT]` prefix-in-comments convention (p. 117)** — replaced by typed `alertFlag` + `alertMessage`. Migration script extracts on import.
- **Auto-numbering of the gift certificate ID when "ID is a number" (p. 131)** — handled by `customer-transactions`'s issuance flow with a sequence; the maintenance form here just edits the resulting record.
- **Family Code as the family member's primary identifier across modules** — kept as a 2-char register-keypress affordance, but every cross-module reference uses the UUID `id`.
- **The 99-quote-per-customer cap (p. 134)** — uncapped here.
- **Macros for the customer entry screen (Ch. 15 Macro Management, p. 205)** — covered by the generic `platform` keyboard-shortcut + saved-views layer.
- **Per-machine Mail List Setup (RICS implies replication across main + POS)** — collapsed to a single tenant `MailListSettings` row.

## Open questions

1. **Loyalty redemption tender vs. negative-line.** The spec replaces the legacy negative-quantity Discount-SKU line with a true tender type. Confirm with the `sales-pos` owner that the tender-type contract can carry the loyalty event ID and the discount source (so the receipt and the GL Summary show it correctly). If the answer is "no, we need a line", we keep the legacy line shape AND fire the loyalty event in parallel — but that means double-bookkeeping.
2. **Plan-chaining on the *Discount Full Price Only* edge case.** RICS (p. 202) is silent on what happens when an accrual that should fire a discount sits below the break point because most of the customer's purchases were on markdown. Do we surface a "you would have crossed the threshold but X% of your eligible spend was excluded" message, or stay silent? Recommend silent + a per-customer `excludedSpendCents` debug field for support.
3. **Versioned rules vs. live rules.** The spec versions rules so accrual-time-vs-redemption-time rule changes don't retroactively reprice. Is that the desired behaviour, or do operators expect "I changed the rule, it applies to everyone right now"? RICS does the latter (only one set of rules at a time). The versioned model is strictly more flexible but adds UI complexity (which version is "live" right now?).
4. **A/R balance staleness threshold.** The cached `lastKnownArBalanceCents` is fast but stale. What's the acceptable max staleness — 60s, 5 minutes, an hour? Drives whether `accounts-receivable` pushes `ArBalanceChangedEvent` on every transaction or batches.
5. **Family member sales attribution at refund time.** RICS lets a refund line tag a Family Member (p. 32 implication). If the original sale was attributed to family member `01` and the refund is processed without specifying a member, does the reversal flow to `01` or to the head? Default proposal: to `01`, with manual override.
6. **Marketing opt-in is new (GDPR-era).** Does the team want it to default ON (RICS-faithful, customer is implicitly opted in by being on the mail list) or OFF (modern privacy-first)? Per-jurisdiction default? Recommend OFF + a one-time bulk-toggle for migration.
7. **Quote-vs-discount precedence.** When a customer with an Active Quote rings up an SKU on the quote AND the salesperson applies a manual discount, does the discount stack on top of the quoted price, override the quoted price, or get blocked? RICS is silent. Default proposal: discount stacks on quoted price, with a warning banner.
8. **Customer Analysis cohort engine performance.** RICS's 6 hardcoded groupings exist in part because the engine pre-computes them. Our generic `groupBy: string[]` approach risks slow queries on big customer bases. Is the v1 ceiling 50k customers (where naive SQL works), or do we need a materialized-view layer from day one?
9. **Default loyalty plan + default-plan-chain for new customers.** RICS auto-assigns the Default Plan if set, prompts the salesperson otherwise (p. 203). Does our register UX prompt-on-empty, silent-empty, or hard-block? Default proposal: silent-empty + a faint "no loyalty program" badge, since prompting at the register slows down checkout.
10. **Storefront-acquired customers vs. in-store customers.** The storefront (apps/storefront) currently uses anonymous carts (Prisma `Cart.sessionId`). When we add storefront accounts, they should write to the same `Customer` table — but the storefront customer has no Account # in the legacy sense. Do we auto-mint an account number (e.g., from email or a sequence) so the register's lookup-by-account-number flow keeps working? Or do we let the field be nullable and rely on email/phone lookup from the storefront cohort?
