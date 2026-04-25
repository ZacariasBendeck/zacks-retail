# Sales POS - Business / Functional

> **Scope of this file.** Documents the governed forward contract for the register core: shift and batch lifecycle, ticket entry, tendering, payouts, refunds, reprint/reclaim/void, receipt delivery, and register-side reports. Transaction types 3 through 8 dispatch into `customer-transactions`; product lookup and pricing, employee overrides, store configuration, and customer account surfaces stay owned by their home modules.

## Objective

Replicate the operational behavior of RICS Enter Sales while presenting it as one browser-based cashier workspace. A cashier must be able to:

- open a batch / shift,
- ring a ticket from barcode or SKU entry,
- change ticket header fields,
- tender a sale with mixed tenders,
- continue and reclaim tickets,
- void, refund, and reprint tickets,
- record payouts,
- count money, close the batch, and post to inventory,
- produce the register-side reports operators use today.

This contract is anchored by:

- [`rics-module-specs.md`](./rics-module-specs.md),
- the supplied legacy screens:
  - `Pictures/Enter Sales first screen .png`
  - `Pictures/Enter Sales (Ticket Detail).png`
  - `Pictures/Enter Sales (Ticket Payment).png`
  - `Pictures/Enter Sales(Change Ticket Header).png`
- the module boundaries in [`../../MODULES.md`](../../MODULES.md).

## Users / Roles

| Role | What they do here |
|---|---|
| **Cashier** | Open shift, ring sales, apply allowed discounts, collect tenders, print or mail receipts, continue/reclaim tickets. |
| **Shift manager** | Approve sensitive actions, record payouts, count money, close the batch, approve over/short, reprint and void completed tickets. |
| **Accounting / back office** | Read Sales Journal, Sales Tax Recap, Sales by Day, Returned Sales, Promotion Code Analysis, and post-to-inventory outputs. |
| **Store operator** | Configure register behavior through `store-ops` and `employees`, then rehearse and validate parity against RICS. |

## Enter Sales screen map

| Legacy screen | Web surface | Why |
|---|---|---|
| Start New Batch / first screen | Shift launcher card at the top of `/sales/enter` | Cashier sees store, register, current batch, last ticket, business date, and open/close actions before ticket entry begins. |
| Ticket Detail | Main Enter Sales workspace | This is the persistent cashier canvas: scan SKU, review lines, watch running totals, and branch to payment or header actions. |
| Ticket Payment | Payment drawer | Tendering is a focused subtask, but it should not discard the active ticket context. |
| Change Ticket Header | Header and manager drawer | Header edits, transaction-type changes, payouts, reprint, reclaim, and close-batch all belong to one operations drawer. |

Every Enter Sales screen must show a one-line note such as `Amounts in Lempira (HNL)` and must not render `$`, `USD`, or currency-style cells.

## Functional surface

### 1. Shift open / launcher

The first Enter Sales surface replaces the legacy "Store / Current Batch / Last Ticket / Date" form.

Functions:

- choose store and register,
- show whether a shift is already open on that register,
- show business date, current batch number, and last ticket number used,
- capture opening cash float,
- enter the workspace when the shift is open,
- expose manager actions when the cashier is not yet on a ticket.

Business rules:

- only one open shift per register at a time,
- a store may have multiple registers open at once,
- a register cannot open a new shift while it still has an open shift in `OPEN` or `COUNTING` status,
- ticket numbering stays monotonic per store according to the batch's current sequence,
- opening-float and business-date changes are auditable events.

### 2. Ticket header

The header drawer preserves the fields shown on RICS p. 30 and in the "Change Ticket Header" screenshot.

Header fields:

- store / register / business date (read-only once the shift is open),
- ticket number,
- cashier,
- transaction type,
- customer account,
- header discount percent,
- ship-to state,
- promotion code,
- ticket comment,
- receipt email target.

Transaction-type contract:

| Code | Label | Owner | Notes |
|---|---|---|---|
| `1` | Regular Sale | `sales-pos` | Default path. |
| `2` | User Defined | `sales-pos` | Preserved for parity; behaves like Regular Sale until operators define otherwise. |
| `3` | Special Order Pickup | `customer-transactions` | Requires customer and a matching special-order record. |
| `4` | Layaway Sale | `customer-transactions` | Requires customer and layaway rules. |
| `5` | Gift Card Sale | `customer-transactions` | Cashier still works inside Enter Sales; liability tracking lives elsewhere. |
| `6` | Charge Payment | `customer-transactions` | Requires customer account and charge balance context. |
| `7` | Special Order Deposit | `customer-transactions` | Requires customer and open special order. |
| `8` | Layaway Payment | `customer-transactions` | Requires customer and open layaway. |

Business rules:

- once a ticket has saved detail lines, transaction-type changes require validation against the target module; invalid transitions must be blocked before tender,
- some transaction types and tender types may require a customer account based on `store-ops` rules,
- header discount and manual promotion changes may require an employee override,
- ticket comments print on the receipt and flow to CRM mail detail,
- ship-to state controls tax recap grouping and receipt text, not shipping fulfillment.

### 3. Ticket detail

The main workspace preserves the RICS detail-grid behavior from pp. 31-32.

Functions:

- scan UPC or type SKU,
- resolve size / column / row,
- add quantity,
- reverse quantity for a fast return,
- rotate through price slots with `Next Price`,
- apply line discount percent or amount,
- toggle tax flags (`15% ISV`, `ISV.Ad`) where store policy allows,
- assign salesperson per line,
- assign family member / CRM attribution per line,
- capture line comment,
- review, remove, or edit prior lines on the current ticket,
- save and keep scanning,
- save and move to payment,
- clear the draft ticket,
- void the current ticket.

Business rules:

- the running line grid is the source of truth for ticket totals until payment starts,
- returns are represented by negative quantity, never negative price,
- a return code is required when quantity is negative and the store tracks return codes,
- line-level tax flags roll up into ticket-level tax buckets,
- `Next Price` rotates the product module's slot order rather than inventing a register-side price table,
- coupon SKUs and product-side perks rules are honored through product metadata,
- only four split tenders are allowed later at payment time, so the detail screen must surface when a line mix is likely to exceed that path.

### 4. Payment drawer

The payment drawer preserves the tender workflow from RICS p. 33 and the supplied "Ticket Payment" screen.

Functions:

- display subtotal, `15% ISV`, `ISV.Ad`, other charges / gift box, total due, total tender, and change,
- allow up to four split tenders on one ticket,
- expose the legacy tender hotkeys and labels,
- update promo code and ticket comment during tender,
- end the sale,
- go back to add more SKUs,
- clear tenders,
- void from the payment stage,
- mail the receipt detail.

Default tender hotkeys:

| Key | Default meaning |
|---|---|
| `1` | Cash |
| `2` | Check |
| `3` | Card / Creditomatic |
| `4` | Secondary currency or store-configured alternate tender |
| `7` | Credit slip |
| `9` | House charge |
| `10` | Gift card |
| `11` | Store credit |
| `99` | Continued ticket |

Business rules:

- the UI keeps the legacy numeric shortcuts, but the labels and enablement come from `store-ops`,
- over-tendered cash calculates change immediately,
- store-credit and house-charge tenders require customer account context,
- tax may still be edited at tender time, but every change must be audited with before/after values and the approving employee,
- `99 Continued` creates a linked follow-on ticket and does not count as a completed sale until the chain is completed,
- if any link in a continued chain is voided, the full chain voids atomically,
- `End Sale` prints or renders the receipt, opens the drawer when appropriate, records the final ticket state, and returns the cashier to the next header-ready state.

### 5. Header and manager drawer

The "Change Ticket Header" screen contains both normal header edits and operator tools that must remain close to the cashier workflow.

Functions:

- change ticket header fields,
- open manager options,
- run UPC price scan,
- open payouts,
- close batch,
- reclaim ticket,
- reprint ticket,
- open mail list / mail detail,
- exit back to the launcher when no active ticket is in progress.

Manager-only or override-gated actions:

- close batch,
- payout approval,
- post-end void,
- tax override,
- price override when outside allowed product slots,
- discount above the allowed threshold,
- over/short approval,
- tender correction and refund edge cases.

### 6. Reclaim, reprint, void, and refund

These actions are part of the register core and are not optional parity work.

Reclaim:

- list reclaimable tickets in the current open batch,
- reload the selected ticket into the workspace,
- block reclaim across batches or posted-history sales,
- block reclaim for completed continued chains that must be voided as a unit.

Reprint:

- reprint ended tickets from the current batch,
- reprint posted tickets by date/store/ticket number,
- allow gift-receipt formatting later without changing the ticket model,
- increment print counters and audit the actor.

Void:

- void an unsaved or draft ticket,
- void a completed but unposted ticket with override,
- keep voided tickets visible in journal and void-summary outputs,
- prevent inventory posting for voided tickets.

Refund:

- allow refund lines on a regular sale ticket using negative quantities,
- optionally reference the original current ticket or imported historical ticket,
- require return code where policy demands it,
- support cash refund, store credit, or other approved tender-out path,
- post reversing inventory movement and tender/account effects.

### 7. Payouts, count money, close batch, and post to inventory

Batch controls remain explicit, even though the UI becomes more modern than RICS.

Functions:

- create payouts against the currently open shift,
- categorize each payout,
- count drawer totals by tender type,
- compare expected versus counted amounts,
- capture ending cash drawer amount and deposit,
- calculate over/short,
- close the shift,
- print or view Sales Journal and Cash Totals summaries,
- post the closed batch to inventory when the store uses shift-post mode.

Business rules:

- a shift cannot close while draft tickets remain open,
- payouts reduce expected cash before over/short is calculated,
- cash-treated tenders use count-money denomination detail; non-cash tenders use per-item total entry,
- over/short beyond store tolerance requires employee override,
- inventory posting mode is store-configured: real-time or shift-post,
- every posting run must be auditable and idempotent.

### 8. Reports owned by sales-pos

`sales-pos` owns the register-side operational reports below. Long-range historical analysis belongs in `sales-reporting`.

| Report | Minimum contract |
|---|---|
| Sales Journal | Detail listing for the current shift or unposted date range; printable before posting. |
| Sales Tax Recap | Summaries by store/state and state/store, with total-based and line-based source selection. |
| Sales by Day | Compare current range to a prior range, preserving the legacy compare modes. |
| Returned Sales | Filter by date, store, return code, cashier, salesperson, SKU, category, or vendor. |
| Promotion Code Analysis | Ticket and margin analysis for promotion codes used at the register. |
| Reprint Posted Sales | Reprint prior posted tickets or journal-format sales listings. |
| Batch Salesperson Summary | Current-batch summary for close-batch operations. |

## Cross-module ownership

| Module | What `sales-pos` reads or triggers |
|---|---|
| [`products`](../products/README.md) | SKU / UPC lookup, price slots, return codes, promotion codes, coupon flags, perk values, size metadata. |
| [`employees`](../employees/README.md) | Cashier identity, salesperson identity, permissions, sales-password override tokens. |
| [`store-ops`](../store-ops/README.md) | Store settings, taxes, tender types, payout categories, receipt defaults, posting mode, required-account rules. |
| [`customer-transactions`](../customer-transactions/README.md) | Special-order, layaway, gift-card, and house-charge extensions behind transaction types 3-8. |
| `crm` | Customer lookup, mail detail, family members, mail list, receipt email targets, store-credit and charge context. |
| `inventory` | On-hand validation and ticket/return posting into inventory movement history. |
| `accounts-receivable` | Shift close, over/short, and payment summaries for GL and account-ledger downstreams. |

## Comparison to other POS modules

Zack's Retail should borrow the good parts of modern POS systems without erasing the RICS workflows operators still need.

What we should copy:

- Square / Shopify style single-cart workspace with a dedicated payment surface instead of multiple windows.
- Odoo / ERPNext style typed state transitions and extension points so special-order and layaway flows do not get hard-coded into the regular-sale path.
- Barcode-first interaction, quick tender keys, and obvious running totals.

What we must keep because of RICS parity:

- explicit shift and batch open/close,
- reclaim, reprint, payout, and close-batch actions from inside Enter Sales,
- transaction-type visibility at the header level,
- continued-ticket support,
- post-to-inventory visibility and auditability,
- returned-sales and promotion-code reporting at the register boundary.

## Acceptance criteria

This module is not ready for cutover until all of the following can be demonstrated against rehearsal data and validated by operators:

- a cashier opens a shift, rings a regular sale, tenders it with cash or mixed tender, and ends the sale without leaving the Enter Sales route,
- a cashier changes ticket header data, including customer, promo code, and transaction type, with the correct validations,
- a cashier uses `Next Price`, reverse quantity, review/remove line, and line comment flows successfully,
- a manager approves a discount or refund through the employee override path and the audit trail records who approved it,
- a cashier creates a continued ticket and later reclaims or completes it correctly,
- a manager records a payout, counts money, closes the shift, and sees the correct over/short result,
- inventory posting and returned-sales reporting reflect completed and refunded tickets correctly,
- special-order, layaway, gift-card, and house-charge transaction types hand off to `customer-transactions` without duplicating its lifecycle state,
- operator testing confirms that the browser workflow is still fast enough for keyboard-first cashier use.
