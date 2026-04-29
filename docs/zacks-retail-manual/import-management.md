# N2. Import Management

> **Status:** Spec
> **Module spec:** [../modules/import-management/README.md](../modules/import-management/README.md)
> **RICS ancestry:** none - net-new module
> **Last updated:** 2026-04-29

## What this module does

Import Management controls international buying from proforma through warehouse receipt. It tracks voyages/shipments, containers, goods in transit, supplier invoices, customs/tax treatment, freight, insurance, duties, agency fees, local charges, landed-cost allocation, and suggested retail prices.

This is not customer/RICS CSV importing. It is the operational workflow for imported merchandise.

## Audience

- **Buyers** - create import shipments, review supplier invoices, approve estimated cost, and review suggested retail prices.
- **Import coordinators** - track voyages, containers, BL/guide numbers, customs policy numbers, freight, insurance, and customs documents.
- **Receivers** - receive goods against approved final cost or authorized estimated cost.
- **Accounting / AP** - track supplier, freight, insurance, customs broker, and tax/customs obligations.
- **Executives** - review total shipment cost, landed margin, and import exceptions.

## Prerequisites

- [Products](products.md) - SKUs, vendor relationships, product families, and final price approval.
- [Purchasing](purchasing.md) - linked POs and receiving mechanics.
- [Inventory](inventory.md) - stock movements and valuation snapshots.
- [Open-To-Buy Planning](otb-planning.md) - estimated and final committed HNL cost against plan.
- Accounts Payable - future vendor invoice and payment ledger.

## Screens

_Intended screens:_

- _Import shipment list_
- _Voyage / shipment detail_
- _Containers and cargo groups_
- _Supplier invoices_
- _Invoice item lines_
- _Landed cost allocation_
- _Goods in transit_
- _Liquidation verification_
- _Suggested pricing review_
- _AP links and payment status_

## Common tasks

_Expected flows:_

- _Create an import shipment from a workbook._
- _Add supplier invoices and split taxable vs. non-taxable invoices._
- _Add freight, insurance, customs duties, taxes, customs agency fees, local freight, and other charges._
- _Review verification checks before approving estimated cost._
- _Allocate landed costs by product-cost share._
- _Receive goods with estimated landed cost by permission and audit reason._
- _Finalize liquidation and true-up inventory cost._
- _Review suggested retail prices before sending them to Products/Pricing for approval._

## Reports

_TODO._

| Report | Where | Filters | Exports |
|---|---|---|---|
| Import Shipment Summary | - | Shipment, vendor, buyer, status, arrival date | CSV / XLSX / PDF |
| Landed Cost Detail | - | Shipment, invoice, SKU, charge category | CSV / XLSX |
| Goods in Transit | - | Shipment, container, expected arrival, buyer | CSV |
| Liquidation Verification | - | Shipment, check status | CSV / PDF |
| Suggested Pricing Review | - | Shipment, category, buyer, approval status | CSV / XLSX |

## Common errors

- **Shipment totals do not reconcile** - invoice values, freight, insurance, taxes, or agency fees differ from the liquidation total.
- **Missing exchange rate** - non-HNL source amounts require a rate and rate date before costing approval.
- **Estimated receiving requires permission** - receiving before final liquidation is blocked unless the user has permission and enters an audit reason.
- **Suggested price not approved** - calculated prices do not update product pricing until Products/Pricing approves them.

## Data sources

- **Primary write:** future `app.import_*` tables for shipments, containers, invoices, charges, allocations, goods-in-transit records, verification checks, and suggested prices.
- **Workbook staging:** direct `.xlsx` parsing into review/audit tables before operational records are created.
- **No RICS dependency:** RICS does not own import voyages or liquidation.

## Related modules

- [Purchasing](purchasing.md) - linked POs and receiving.
- [Inventory](inventory.md) - stock movements and HNL valuation snapshots.
- [Products](products.md) - SKU identity and final price approval.
- [Open-To-Buy Planning](otb-planning.md) - estimated/final committed HNL cost.
- Accounts Payable - vendor invoices, payments, balances, and statements.

## What's different from RICS

Everything. This module is a Zack's Retail workflow based on actual import spreadsheets and modern ERP landed-cost practice. It adds voyage/container/goods-in-transit structure, estimated vs. final landed cost, FX capture, customs liquidation, AP links, and suggested price review that RICS did not provide.
