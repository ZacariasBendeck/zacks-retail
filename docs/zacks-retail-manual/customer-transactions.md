# 7. Customer Transactions

> **Status:** Draft
> **Module spec:** [../modules/customer-transactions.md](../modules/customer-transactions.md)
> **RICS ancestry:** Ch. 2 (Special Orders, Layaways, Gift Certificates, House Charges), Ch. 9 (Gift Certificate Maintenance, Print Gift Certificate Activity)
> **Last updated:** 2026-04-21

## What this module does

Customer Transactions covers transaction types that require a customer account and have their own lifecycle beyond a single ticket: **special orders** (deposit → pickup → refund), **layaways** (sale → payment → pickup → refund), **gift certificate** sales + redemptions + maintenance, and **house charges** (sale + payment + print). Each type extends the [Sales / POS](sales-pos.md) ticket flow, depends on [CRM](crm.md) for customer accounts, and reports into [Accounts Receivable](accounts-receivable.md) where relevant.

## Audience

- **Cashiers** — initial ticket entry, take deposits, apply payments.
- **Customer service** — pickup handoff, refund processing, gift-certificate lookup.
- **Managers** — dispute resolution, aging review.
- **Accounting** — reconciliation of deposits, layaway liability, gift-cert liability.

## Prerequisites

- [Sales / POS](sales-pos.md) — ticket framework must exist.
- [CRM](crm.md) — a customer account is required for special orders, layaways, and house charges.
- [Accounts Receivable](accounts-receivable.md) — house charges integrate with A/R ledgering.

## Screens

_TODO. Intended screens:_
- _Special orders list + detail_
- _Layaway list + payment schedule_
- _Gift certificate maintenance (issue / void / reissue)_
- _Gift certificate redemption at POS_
- _House charge entry + payment_
- _Transaction type aging reports_

## Common tasks

_TODO. Expected flows:_
- _Take a special order with deposit_
- _Apply a layaway payment_
- _Complete a layaway pickup_
- _Refund a canceled special order_
- _Sell a gift certificate_
- _Redeem a gift certificate_
- _Record a house charge sale_
- _Apply a house charge payment_

## Reports

_TODO._

| Report | Where | Filters | Exports |
|---|---|---|---|
| Print Special Orders | — | Status, date range, store | PDF |
| Print Layaways | — | Status, date range, store | PDF |
| Print House Payments / Charges | — | Date range, customer | PDF |
| Print Gift Certificate Activity | — | Date range, certificate # | PDF |

## Keyboard shortcuts

_TODO._

## Common errors

_TODO._

## Data sources (Phase A)

- **Primary read:** `rics_mirror` ticket + customer tables (tables TBD per module spec).
- **Primary write (Phase A):** none from app; RICS owns writes.
- **Future (Phase C):** `customer_tx.*` schema — special_order, layaway, gift_cert, house_charge.

## Related modules

- [Sales / POS](sales-pos.md) — parent ticket framework.
- [CRM](crm.md) — customer account lookup.
- [Accounts Receivable](accounts-receivable.md) — house-charge balances roll into A/R.

## What's different from RICS

_TODO. Expected: real-time customer-facing status lookups; automated pickup reminders via email / SMS; gift certificate barcodes instead of carbon forms; layaway-schedule payment reminders._
