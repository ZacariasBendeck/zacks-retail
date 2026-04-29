# Accounts Payable

Vendor-side payables foundation for supplier invoices, freight/insurance/customs invoices, tax/customs authority obligations, payment applications, balances, due dates, and vendor statements.

**Phase:** Spec - net-new module; future implementation.
**RICS chapters:** _TBD / no direct current module owner._
**Registry:** [`../MODULES.md`](../MODULES.md)

Accounts Payable is separate from `accounts-receivable`. Accounts Receivable is customer-side money owed to the business. Accounts Payable is vendor-side money the business owes.

## Scope

- Vendor invoice headers and lines.
- Invoice source currency and HNL converted amounts.
- Partial payments, payment references, paid dates, and remaining balances.
- Vendor statements and aging.
- Links to Import Management shipments, supplier invoices, freight forwarders, insurers, customs brokers, and customs/tax authority obligations.
- Future links to domestic purchasing vendor bills.

## Boundaries

- **Import Management** creates AP obligations for import supplier invoices and landed-cost charges, but AP owns payment state and vendor balances.
- **Purchasing** may create AP obligations for normal domestic supplier bills in a future phase.
- **Inventory** consumes valuation results; it does not own payable balances.
- **Accounts Receivable** remains customer-side and should not absorb vendor AP concerns.

## Documents in this module

| File | Purpose |
|---|---|
| [`README.md`](./README.md) | Forward module spec |
| [`decisions.md`](./decisions.md) | Module-scoped design decisions |
