# Accounts Payable

Vendor-side payables foundation for supplier invoices, freight/insurance/customs invoices, tax/customs authority obligations, payment applications, balances, due dates, and vendor statements.

**Phase:** Spec - net-new module; import payable handoff bridge in initial implementation.
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

## Import payable handoff bridge

Import Management now stages source-linked payable handoff records before the full Accounts Payable ledger exists. This bridge keeps shipment liquidation connected to every payable source while leaving full vendor balances, terms, aging, partial payments, and statement logic for the future AP module.

Current bridge sources:

- Import supplier invoices.
- Final landed-cost charges for freight, insurance, customs agency, local freight, duties, taxes, and other charges.

Current bridge lifecycle:

- `READY` - payable source is staged from Import Management and ready to send to AP/accounting.
- `SENT_TO_AP` - accounting/AP has accepted the payable handoff; the import source document is locked from normal edits.
- `PAID` - payment reference and paid date were recorded against the handoff.
- `VOIDED` - staged or sent handoff was voided with a reason. Paid handoffs require a future AP reversal workflow instead of a simple void.

Every handoff remains linked back to the import shipment, source document type, source document id, source currency amount, FX rate/date, HNL amount, AP reference, payment reference, and audit actor/timestamps.

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
