# Decisions: Import Management

Running log of module-scoped design decisions. Append new entries at the top.

---

## 2026-04-29 - Import Management is a standalone net-new module

**Context:** Zack's import workflows are represented today by spreadsheets rather than RICS. The suit proforma captures material bought in meters plus CMT labor. The Panama liquidation workbook captures a shipment-level liquidation with multiple supplier invoices, taxable/non-taxable groups, freight, insurance, customs policy, duties, agency fees, verification checks, landed unit cost, and suggested retail pricing.

**Decision:** Create `import-management` as a standalone net-new module. Model the workflow after ERP landed-cost systems with voyages/shipments, containers, goods in transit, estimated and final landed cost, and apportionment back to item lines.

**Consequences:** Purchasing integrates with Import Management but does not own voyage, container, customs, liquidation, or goods-in-transit logic. Inventory receives HNL landed unit costs from Import Management. Accounts Payable owns vendor invoices and payments. Products/Pricing owns final price updates.

**Alternatives considered:**
- Put the workflow inside Purchasing. Rejected because the workflow spans voyages, customs, FX, AP, goods in transit, inventory valuation, and pricing.
- Put the workflow inside Inventory. Rejected because supplier invoices, proformas, customs documents, and payable obligations are buying/accounting events before they are inventory movements.
- Put the workflow inside Accounts Payable. Rejected because AP tracks obligations and payments, but does not own shipment operations, containers, or receiving state.

**Related:** `docs/modules/purchasing/README.md`, `docs/modules/accounts-payable/README.md`, `docs/zacks-retail-manual/import-management.md`.
