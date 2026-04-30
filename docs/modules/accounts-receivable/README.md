# Accounts Receivable

A/R setup (terms, grace period, finance charges, statement format, dunning messages), customer A/R accounts (balance-forward vs. open-item), payments, adjustments, aged trial balance, A/R detail + transaction summary, statements (monthly rollover with finance-charge application), purge A/R detail, A/R year rollover. **Also**: fiscal-period operations — General Ledger summary (monthly debit/credit by Cash / Non-Cash / House / Special Orders / Layaways / Gift Certs / Sales Tax / Sales / COGS / Other / Payouts / Over-Short), close week / month / season / year, period-to-date rollups, fiscal calendar, Season Setup.

**Phase:** TBD
**RICS chapters:** Ch. 16, Ch. 8 (Close Week / Month / Season / Year — retention purges moved to `platform`), Ch. 6 (GL Summary p. 100), Ch. 17 (Season Setup p. 218)
**Registry:** [`../MODULES.md`](../MODULES.md)

## Accounts Payable boundary

Accounts Receivable remains customer-side: customer balances, payments, statements, finance charges, fiscal close, and related sales-ledger summaries. Vendor-side bills, import supplier invoices, freight/insurance/customs-broker invoices, customs/tax authority obligations, vendor payments, and vendor balances belong to the future `accounts-payable` module.

## Documents in this module

| File | Purpose |
|---|---|
| [`tech-description.md`](./tech-description.md) | Forward technical description (current implementation) |
| [`rics-module-specs.md`](./rics-module-specs.md) | RICS port lineage — what RICS did, what we're changing |
| [`business-functional.md`](./business-functional.md) | Business / functional spec |
| [`api.md`](./api.md) | HTTP API contracts |
| [`schema.md`](./schema.md) | Postgres schema |
| [`tasks.md`](./tasks.md) | Engineering ticket breakdown |
| [`decisions.md`](./decisions.md) | Module-scoped design decisions (ADRs) |

Files that don't exist yet are TBD — see the generating slash command in the layout section of [`../../../CLAUDE.md`](../../../CLAUDE.md).
