# 10. Accounts Receivable

> **Status:** Draft
> **Module spec:** [../modules/accounts-receivable.md](../modules/accounts-receivable.md)
> **RICS ancestry:** Ch. 16 (A/R core), Ch. 8 (Close Week / Month / Season / Year — retention purges moved to [Platform](platform.md)), Ch. 6 (GL Summary), Ch. 17 (Season Setup)
> **Last updated:** 2026-04-21

## What this module does

Accounts Receivable owns two related concerns that share the fiscal-period primitive:

1. **A/R ledger** — customer A/R accounts (balance-forward or open-item), payments, adjustments, aged trial balance, A/R detail, transaction summary, statement generation (with finance-charge application + dunning), purge A/R detail, A/R year rollover.
2. **Fiscal close** — General Ledger summary (monthly debit/credit by Cash / Non-Cash / House / Special Orders / Layaways / Gift Certs / Sales Tax / Sales / COGS / Other / Payouts / Over-Short), close week / month / season / year, period-to-date rollups, fiscal calendar, Season Setup.

These stay together because they share the same primitive (fiscal period) and the same stakeholders (bookkeepers, accountants).

## Audience

- **Accountants** — payments, adjustments, statement cycles, GL summary reconciliation.
- **Bookkeepers** — aging review, statement generation + mail.
- **Managers** — monthly / seasonal / yearly close.
- **Executives** — GL summary read, aged trial balance.

## Prerequisites

- [CRM](crm.md) — customer accounts back A/R accounts.
- [Customer Transactions](customer-transactions.md) — house charges create A/R entries.
- [Sales / POS](sales-pos.md) — batch closeouts feed GL summary.
- [Store Operations](store-ops.md) — A/R setup (terms, grace period, finance charges, statement format, dunning messages).

## Screens

_TODO. Intended screens:_
- _A/R Setup (terms, finance charges, statement format, dunning messages)_
- _A/R Account list + detail_
- _Enter Payments_
- _Enter Adjustments_
- _Aged Trial Balance_
- _A/R Detail / Transaction Summary_
- _Generate Statements (monthly rollover + finance-charge application)_
- _Purge A/R Detail_
- _A/R Year Rollover_
- _GL Summary (period-to-date view)_
- _Close Week / Month / Season / Year_
- _Fiscal Calendar / Season Setup_

## Common tasks

_TODO. Expected flows:_
- _Set up a new A/R customer account with balance-forward terms_
- _Apply a payment_
- _Make a balance adjustment with a note_
- _Run the aged trial balance as of last month-end_
- _Generate statements for all active A/R accounts_
- _Run the week-close_
- _Run the month-close_
- _Review the GL summary for the closed period_

## Reports

_TODO._

| Report | Where | Filters | Exports |
|---|---|---|---|
| Aged Trial Balance | — | As-of date, aging buckets | CSV / PDF |
| A/R Detail | — | Customer, date range | CSV |
| Statements | — | Statement cycle | PDF (batch) |
| GL Summary | — | Month / period | CSV / PDF |

## Keyboard shortcuts

_TODO._

## Common errors

_TODO._

## Data sources (Phase A)

- **Primary read:** `rics_mirror` A/R and ticket tables.
- **Primary write:** Phase A is read-only for the app; RICS owns A/R writes.
- **Future (Phase C):** `accounts_rec.*` schema — ar_account, ar_payment, gl_summary.

## Related modules

- [CRM](crm.md) — customer identity underlies A/R.
- [Customer Transactions](customer-transactions.md) — house charges are A/R drivers.
- [Sales / POS](sales-pos.md) — batch closeouts feed GL.
- [Platform](platform.md) — retention purges (separate from A/R purges proper).

## What's different from RICS

_TODO. Expected: statement generation emails PDFs instead of printing + mailing; aging bucket thresholds configurable without code change; close operations publish events for downstream automation; GL summary drills into detail on click._
