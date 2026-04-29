# Decisions: Accounts Payable

Running log of module-scoped design decisions. Append new entries at the top.

---

## 2026-04-29 - Vendor AP is separate from customer AR

**Context:** Import Management creates payables to merchandise suppliers, material suppliers, CMT/factory suppliers, freight forwarders, insurers, customs brokers, and tax/customs authorities. The existing `accounts-receivable` module is customer-side and also owns fiscal close concepts inherited from RICS.

**Decision:** Introduce `accounts-payable` as a separate future module for vendor invoices, payments, balances, due dates, and vendor statements.

**Consequences:** Import Management links to AP for payment tracking. Accounts Receivable remains customer-side. Vendor balances should not be stored in Purchasing or Import Management.

**Alternatives considered:**
- Add vendor payments to Accounts Receivable. Rejected because AR and AP have opposite account direction and different operators/reports.
- Store payable status directly in Import Management. Rejected because AP must eventually cover all vendor bills, not only import shipments.
