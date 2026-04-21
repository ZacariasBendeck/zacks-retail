# 6. Sales / POS

> **Status:** Draft
> **Module spec:** [../modules/sales-pos.md](../modules/sales-pos.md)
> **RICS ancestry:** Ch. 2 (register core), Ch. 13 (customer-facing register flow only; sync infrastructure not ported)
> **Last updated:** 2026-04-21

## What this module does

Sales / POS is the register. Cashiers ring sales tickets (header / detail / tender), apply manager overrides, run the batch-of-sales lifecycle (start / close / count money / over-short), process refunds, void / reclaim / reprint tickets, issue credit slips, record pay-outs, manage the cash drawer, and post the batch to inventory. It owns the sales-ticket framework that [Customer Transactions](customer-transactions.md) extends for special orders, layaways, gift certificates, and house charges.

## Audience

- **Cashiers** — ring tickets, tender, refunds.
- **Shift managers** — open/close batches, count money, over-short reconciliation, pay-outs.
- **Accounting** — reads the sales tax recap, sales-by-day, post-to-inventory outputs.

## Prerequisites

- [Products](products.md) — SKU, price, size type.
- [Employees](employees.md) — salespeople, sales passwords, manager overrides.
- [Store Operations](store-ops.md) — tender types, sales-tax configuration.

## Screens

_TODO. Intended screens:_
- _Ticket entry (header + lines + tender)_
- _Batch dashboard (open / close / over-short)_
- _Void / reclaim / reprint_
- _Refund entry_
- _Credit slip issue + redemption_
- _Pay-out entry_
- _Cash drawer open / close / count_
- _Sales tax recap_
- _Post-to-inventory confirmation_
- _Reprint posted sales_

## Common tasks

_TODO. Expected flows:_
- _Open a new batch at start of shift_
- _Ring a simple sale with mixed tender_
- _Ring a refund against a prior ticket_
- _Handle a manager override on a discount_
- _Count money, reconcile, close the batch_
- _Post the closed batch to inventory_

## Reports

_TODO._

| Report | Where | Filters | Exports |
|---|---|---|---|
| Sales by Day | — | Date range, store | CSV / PDF |
| Sales Tax Recap | — | Batch, date range | PDF |
| Returned Sales | — | Date range, reason code | CSV |
| Promotion Code Analysis | — | Code, date range | CSV |

## Keyboard shortcuts

_TODO._

## Common errors

_TODO._

## Data sources (Phase A)

- **Primary read:** `rics_mirror.ticket_header`, `rics_mirror.ticket_detail`, `rics_mirror.ticket_tender`, `rics_mirror.sales_batches`, `rics_mirror.payouts`, `rics_mirror.transmitted`, `rics_mirror.marketing_code`, `rics_mirror.return_codes`.
- **Primary write:** today, none from the app — RICS owns POS writes in Phase A. Phase B flips the register to Zack's Retail, at which point writes land in `sales_pos.*` / `public.*`.
- **Future (Phase C):** `sales_pos.*` schema — ticket, ticket_line, ticket_tender, shift, pay_out.

## Related modules

- [Customer Transactions](customer-transactions.md) — extends ticket framework for special orders, layaways, gift certs, house charges.
- [Products](products.md) — SKU, price, size type.
- [Employees](employees.md) — salespeople, commissions, sales passwords.
- [Inventory](inventory.md) — post-to-inventory decrements on-hand at batch close.
- [Sales Reporting](sales-reporting.md) — historical roll-ups.
- [Accounts Receivable](accounts-receivable.md) — GL summary absorbs batch closeouts.

## What's different from RICS

_TODO. Expected: browser-based register replaces DOS-era keyboard UI; real-time drawer state across registers; no diskette sync; in-app broadcast of price changes to all active registers; touch-friendly layout while preserving keyboard shortcuts for power users._
