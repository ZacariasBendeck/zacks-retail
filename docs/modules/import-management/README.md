# Import Management

ERP-style landed-cost workflow for international buying. Import Management owns voyages/shipments, containers, goods in transit, foreign-currency supplier invoices, customs/taxes, shipment liquidation, estimated/final landed costs, and suggested retail pricing.

**Phase:** Initial implementation - net-new module; no RICS predecessor.
**RICS chapters:** _none - RICS did not model import voyages/liquidation._
**Registry:** [`../MODULES.md`](../MODULES.md)

This module is not CSV/RICS/customer "importing." It is import operations: the business workflow that starts with foreign proformas and supplier invoices, moves goods through freight and customs, and ends with HNL landed cost on inventory.

## Why this is a separate module

The suit proforma shows material bought in meters plus CMT labor. The Panama liquidation workbook shows a shipment-level liquidation with many supplier invoices, taxable and non-taxable invoice groups, freight, insurance, customs policy, duties, agency fees, verification checks, item landed cost, and suggested retail prices. That is larger than purchase order entry and larger than inventory receiving.

Import Management follows the ERP landed-cost/voyage pattern:

- Dynamics 365 models landed cost around voyages, containers, goods in transit, estimated/actual costs, and apportionment back to item lines: <https://learn.microsoft.com/en-us/dynamics365/supply-chain/landed-cost/landed-cost-overview>
- NetSuite validates per-line landed cost allocation by value, quantity, or weight: <https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N2418831.html>
- Odoo and ERPNext validate the inventory valuation/AP connection, but their receipt-centered landed-cost models are narrower than Zack's shipment liquidation workflow.

## Scope

- Import voyages/shipments and shipment-level liquidation.
- Containers, cargo groups, BL/guide numbers, customs policy numbers, arrival dates, and goods-in-transit state.
- Supplier invoices inside a shipment, including taxable and non-taxable invoice groups.
- Invoice item lines with style, description, item code, box data, ordered/received quantity, source cost, discounts, and HNL landed cost.
- Import charges: freight, insurance, internal freight, customs duties, import taxes, customs agency fees, local delivery, and other costs.
- Estimated landed cost before final invoices are known, final landed cost after liquidation, and true-up from estimate to final.
- Manual verification checks for customs policy totals, liquidation totals, invoice/charge reconciliation, FX review, and other shipment exceptions.
- Suggested retail prices from landed cost and buyer-selected markup/factor.
- Payable handoff bridge for supplier invoices and final landed-cost charges until the full Accounts Payable module owns the vendor ledger.
- Shipment-level JSON/CSV/XLSX reports for liquidation, goods in transit, expected PO shipment lines, landed-cost allocation, suggested pricing review, and AP handoff.
- Shipment-level audit history for cost changes, invoice matches, receiving, true-ups, AP handoff actions, and status transitions.
- Spreadsheet staging from known workbooks, with review and reconciliation before records are posted.

## Module Boundaries

- **Purchasing** owns normal POs, PO status, PO receiving mechanics, ASN/carton receiving, and PO reports. Import Management may create or link POs and provide HNL landed unit costs, but purchasing does not own voyage/container/liquidation logic.
- **Inventory** owns stock movements, stock levels, and valuation snapshots. It consumes landed unit cost from Import Management when goods are received or true-up adjustments post.
- **Accounts Payable** owns vendor invoices, payments, balances, due dates, and vendor statements. Import Management creates AP obligations for suppliers, freight forwarders, insurers, customs brokers, and tax/customs authorities.
- **Products/Pricing** owns final SKU price updates. Import Management can suggest retail prices but cannot update product prices without pricing approval.
- **OTB Planning** consumes estimated committed HNL cost before final liquidation and final landed HNL cost after approval.

## Core Entities

- `ImportShipment` - parent voyage/liquidation record; examples include "CARGA SUELTA PANAMA # 2 IB".
- `ImportContainer` - container, cargo group, loose cargo, or carton grouping within a shipment.
- `ImportSupplierInvoice` - supplier invoice or proforma inside the shipment.
- `ImportInvoiceLine` - purchasable item, material, CMT labor, accessory, or finished-good line from a supplier invoice.
- `ImportCharge` - freight, insurance, duty, tax, customs agency, local delivery, or other landed-cost charge.
- `ImportLandedCostAllocation` - per-line allocation result, preserving source charge, allocation basis, allocated amount, and final HNL landed cost.
- `GoodsInTransitRecord` - ownership and movement state before warehouse receipt.
- `ImportVerificationCheck` - reconciliation row for invoice totals, taxable/non-taxable groups, FX, charges, and liquidation totals.
- `ImportSuggestedPrice` - calculated sale-price recommendation from landed cost.
- `ImportInventoryReceipt` - direct stock receipt for SKU-linked import lines that are not linked to native PO lines.
- `ImportInventoryTrueUp` - final landed-cost adjustment posted after goods were first received at estimated cost.

## Status Model

- `DRAFT` - shipment shell exists; invoices and charges are incomplete.
- `REVIEWING_COSTS` - source invoices, charges, and FX are being checked.
- `APPROVED_ESTIMATE` - estimated landed cost is approved for planning and authorized estimated receiving.
- `IN_TRANSIT` - goods are owned or en route before warehouse receipt.
- `RECEIVING_ESTIMATED` - authorized user received against estimated landed cost with audit reason.
- `FINAL_LIQUIDATION` - final customs/tax/freight/AP documents are entered and being reconciled.
- `RECEIVED_FINAL` - final landed cost has posted to receiving/inventory.
- `CLOSED` - shipment, AP links, and pricing recommendations are complete.
- `CANCELLED` - shipment is voided before operational posting or cancelled with reversal audit.

## Costing Rules

- Base accounting, reporting, inventory valuation, OTB, and margin currency remains HNL.
- V1 source currencies are `CNY`, `USD`, and `HNL`.
- Every non-HNL amount stores source amount, source currency, FX rate to HNL, FX date, and computed HNL amount.
- Landed costs allocate by product-cost share in v1.
- Verification checks can be imported from workbooks or entered manually. `FAIL` checks block final liquidation when they are part of readiness; `WARN` and `PENDING` checks remain visible for review.
- Estimated receiving is allowed only by users with `import_management.receive_estimated` and requires an audit reason. The same permission is required when manually setting goods-in-transit or shipment status to `RECEIVING_ESTIMATED`.
- Receiving may be scoped to the full shipment, a container/cargo group, selected expected PO shipment lines, or selected goods-in-transit records. Repeated receiving actions are idempotent and must not duplicate receipts or true-ups.
- Final liquidation can post a true-up adjustment when estimated receiving differs from final landed cost. The true-up records estimated unit cost, final unit cost, unit delta, quantity, and total HNL delta.
- Suggested retail prices are recommendations only. They must be SKU-linked and approved before they can be marked `POSTED`; posting requires `products.write` and records the handoff to Products/Pricing without directly mutating product price in v1.
- Posted suggested prices lock landed-cost recalculation and SKU remapping for that shipment. Corrections after posting require a controlled correction workflow instead of silently overwriting a pricing handoff.
- Import supplier invoices and final landed-cost charges can be staged as payable handoffs. Handoff statuses are `READY`, `SENT_TO_AP`, `PAID`, and `VOIDED`.
- Import supplier invoices and final landed-cost charges lock after their payable handoff is marked `SENT_TO_AP` or `PAID`. Corrections after AP handoff should be handled by AP adjustment/void/reissue workflow, not by editing the sent source document in place.
- Staged or sent payable handoffs may be voided with a reason. Paid handoffs require a future AP reversal workflow.

## Permissions and Audit

- `import_management.view` allows users to see import shipments, costs, receiving readiness, AP handoffs, and reports.
- `import_management.cost_override` is required to enter or edit supplier invoices, invoice lines, import charges, expected-line landed-cost estimates, and landed-cost allocation.
- `import_management.receive_estimated` is required to receive against estimated landed cost or manually move records into `RECEIVING_ESTIMATED`; an audit reason is required.
- `import_management.final_liquidation` is required to move shipments into final liquidation/received-final/closed status and to post final receiving or inventory true-ups.
- `import_management.approve_mismatch` is required to approve or clear supplier-invoice match warnings on expected PO shipment lines.
- Import Management records platform audit events for cost changes, FX-bearing source document changes, invoice matches and mismatch approvals, estimated receiving, final receiving/true-ups, landed-cost allocation, and status transitions.
- The shipment detail Audit tab shows both shipment-level events and related line/invoice/charge events linked by `metadata.shipmentId`.

## Spreadsheet Evidence

- `09 Suits repeat order.xlsx` proves the material-plus-labor model: fabric is bought by meters, priced per meter, and then CMT labor is added by garment component.
- `Liquizacion Carga Suelta Panama # 2 IB.xlsx` proves the shipment liquidation model: one shipment has many supplier invoices, taxable/non-taxable groups, customs policy, freight/insurance, taxes, agency fees, verification checks, item landed cost, and suggested retail prices.

## Documents in this module

| File | Purpose |
|---|---|
| [`README.md`](./README.md) | Forward module spec |
| [`decisions.md`](./decisions.md) | Module-scoped design decisions |
