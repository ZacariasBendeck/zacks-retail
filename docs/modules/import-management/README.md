# Import Management

ERP-style landed-cost workflow for international buying. Import Management owns voyages/shipments, containers, goods in transit, foreign-currency supplier invoices, customs/taxes, shipment liquidation, estimated/final landed costs, and suggested retail pricing.

**Phase:** Spec - net-new module; no RICS predecessor.
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
- Suggested retail prices from landed cost and buyer-selected markup/factor.
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
- Estimated receiving is allowed only by permission and requires an audit reason.
- Final liquidation can post a true-up adjustment when estimated receiving differs from final landed cost.
- Suggested retail prices are recommendations only; price updates require Products/Pricing approval.

## Spreadsheet Evidence

- `09 Suits repeat order.xlsx` proves the material-plus-labor model: fabric is bought by meters, priced per meter, and then CMT labor is added by garment component.
- `Liquizacion Carga Suelta Panama # 2 IB.xlsx` proves the shipment liquidation model: one shipment has many supplier invoices, taxable/non-taxable groups, customs policy, freight/insurance, taxes, agency fees, verification checks, item landed cost, and suggested retail prices.

## Documents in this module

| File | Purpose |
|---|---|
| [`README.md`](./README.md) | Forward module spec |
| [`decisions.md`](./decisions.md) | Module-scoped design decisions |
