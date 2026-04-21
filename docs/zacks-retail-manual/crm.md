# 9. CRM

> **Status:** Draft
> **Module spec:** [../modules/crm.md](../modules/crm.md)
> **RICS ancestry:** Ch. 9 (customer / mail list), Ch. 15 (Frequent Buyer Plan), Ch. 17 (Mail List Setup)
> **Last updated:** 2026-04-21

## What this module does

CRM is the customer record. It holds each customer's account — identity, contact, family members (linked accounts), mail-list preferences — and the marketing machinery around them: customer analysis, stored and printed mailing labels, frequent-buyer program enrollment + points, and customer quotes (pricing that carries forward to the sale).

## Audience

- **Store managers** — create accounts, resolve duplicates.
- **Customer service** — look up accounts, add family members, enroll in frequent buyer.
- **Marketing** — run customer analysis, export mailing labels.
- **Cashiers** — search and attach a customer to the ticket at [Sales / POS](sales-pos.md).

## Prerequisites

- [Store Operations](store-ops.md) — mail list setup (frequency rules, categorization).
- [Products](products.md) — quote pricing depends on SKU catalog.

## Screens

_TODO. Intended screens:_
- _Customer list + search + filter_
- _Customer detail (identity, contact, family, analysis snapshot)_
- _Family-member linking_
- _Quote entry + list + detail_
- _Frequent Buyer enrollment + points history_
- _Mail-list detail + preferences_
- _Mail-list print + label generation_
- _Mail-list import + dedupe_
- _Change account numbers_

## Common tasks

_TODO. Expected flows:_
- _Create a new customer account_
- _Link a new family member to an existing account_
- _Enter a quote for a future sale_
- _Apply a quote at the register_
- _Enroll a customer in frequent-buyer_
- _Redeem frequent-buyer points at the register_
- _Run customer analysis for top-N customers_
- _Import a CSV mail list with dedupe_

## Reports

_TODO._

| Report | Where | Filters | Exports |
|---|---|---|---|
| Print Mail List | — | Filters on preferences, zip, last-purchase | PDF / CSV |
| Mailing Labels | — | Same | PDF |
| Customer Analysis | — | Period, store, category | CSV / PDF |
| Frequent Buyer Activity | — | Date range, customer | CSV |

## Keyboard shortcuts

_TODO._

## Common errors

_TODO._

## Data sources (Phase A)

- **Primary read:** `rics_mirror` customer / mail-list / quote tables (specific names TBD per module spec).
- **Primary write:** none from app in Phase A; RICS owns writes.
- **Future (Phase C):** `crm.*` schema — customer, family_member, quote.

## Related modules

- [Sales / POS](sales-pos.md) — customer attached to ticket; quote pulled into ticket.
- [Customer Transactions](customer-transactions.md) — special orders, layaways, house charges depend on a customer.
- [Accounts Receivable](accounts-receivable.md) — A/R accounts tie to CRM customers.

## What's different from RICS

_TODO. Expected: richer dedupe on import; self-service mail-list preferences via email link; real-time frequent-buyer points at the register; customer analysis with charts not just tables._
