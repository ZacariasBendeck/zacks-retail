# N2. Import Management

> **Status:** Initial implementation
> **Module spec:** [../modules/import-management/README.md](../modules/import-management/README.md)
> **RICS ancestry:** none - net-new module
> **Last updated:** 2026-04-30

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
- _Shipment audit history_

## Common tasks

_Expected flows:_

- _Create a shipment from expected PO lines when no supplier invoice or workbook exists yet._
- _Create an import shipment from a workbook._
- _Match later supplier invoice lines back to expected PO lines; approve quantity/currency/amount mismatches only with a reason._
- _Add supplier invoices and split taxable vs. non-taxable invoices._
- _Add freight, insurance, customs duties, taxes, customs agency fees, local freight, and other charges._
- _Record or update verification checks for customs policy totals, liquidation totals, FX review, and invoice/charge reconciliation._
- _Review verification checks before approving estimated or final cost._
- _Allocate landed costs by product-cost share._
- _Receive a full shipment, one container, selected expected PO lines, or selected goods-in-transit lines with estimated landed cost by `import_management.receive_estimated` permission and audit reason._
- _Finalize liquidation and true-up inventory cost; review estimated unit cost, final unit cost, unit delta, and total HNL delta._
- _Stage supplier invoices and final landed-cost charges for AP, mark sent handoffs paid when payment is confirmed, or void staged/sent handoffs with a reason._
- _Export shipment reports as CSV or XLSX from the Reports tab._
- _Review suggested retail prices, approve them, then have a `products.write` user mark the SKU-linked pricing handoff posted._
- _Treat AP-sent source documents and posted pricing handoffs as locked. Use correction documents or the future AP/pricing correction workflow instead of editing those records in place._

## PO-first workflow

Use this when the shipment is planned before the supplier invoices or liquidation workbook are ready:

1. Create the import shipment with buyer, ports, carrier/forwarder, expected sail date, and ETA.
2. Add containers or cargo groups if known.
3. Open **Expected POs** and search open PO lines by PO, vendor, buyer, currency, incoterm, or SKU.
4. Add the expected PO lines to the shipment. The PO keeps the vendor currency commercial cost and estimated landed HNL cost.
5. Build goods-in-transit records from the expected lines once the shipment is confirmed.
6. Add supplier invoices later and use suggested invoice matches. Clean matches can be applied in bulk; warning matches require review and approval reason.
7. Allocate landed cost, receive by estimate or final cost, and let final liquidation post true-up adjustments where needed.

## Receiving and true-up

- **Estimated receiving** posts PO receipts or direct inventory receipts using the estimated landed unit cost. It requires `import_management.receive_estimated` and an audit reason.
- **Final receiving and true-up** require `import_management.final_liquidation`, because this can post final inventory value or adjustment records.
- **Partial receiving** can be scoped to selected receiving rows, a container, or selected expected PO lines. Repeating the same action should not create duplicate receipts or true-ups.
- **Final receiving after estimated receiving** does not duplicate the original stock receipt. It posts a cost true-up that shows estimated unit cost, final unit cost, delta unit cost, and total HNL delta.
- **Final receiving without estimated receiving** posts the receipt at final landed cost.
- The **Receiving** tab shows line readiness plus the posted audit trail: PO receipts, direct inventory receipts, and inventory true-ups.

## Permissions and audit

- `import_management.cost_override` is required before changing supplier invoices, invoice lines, import charges, estimated landed unit cost, or landed-cost allocation.
- `import_management.approve_mismatch` is required before approving or clearing an invoice-match warning.
- `import_management.receive_estimated` is required for estimated receiving and always requires a reason.
- `import_management.final_liquidation` is required for final receiving, final true-up, and final/closed shipment status changes.
- The audit trail records FX and cost changes, invoice matches, mismatch approvals, receiving actions, final true-ups, allocation runs, and shipment status transitions.
- The shipment **Audit** tab shows recent import audit events, including related invoice, line, charge, and receiving events tied back to the shipment.

## Incoterm examples

- **FOB/FCA:** the vendor price excludes international freight and insurance. Add freight and insurance as landed-cost charges with `ALLOCATE_TO_LANDED`.
- **CIF/CIP:** freight and insurance are included in the supplier commercial price. Record freight/insurance documents for visibility, but default them to `INCLUDED_IN_COMMERCIAL_PRICE` so they are not double-counted in landed cost.
- **Estimated cost:** before final liquidation, use the SKU repeat-order estimate or buyer override as estimated landed HNL cost for OTB and authorized receiving.
- **Final true-up:** after final liquidation, compare final landed unit cost to the estimated receipt cost and post only the difference.
- **Invoice mismatch review:** if the invoice line quantity, currency, or HNL amount differs from the expected PO shipment line, approve the mismatch only when the business reason is documented.

## Testing checklist

Use this checklist for a shipment from planning to close:

1. Create a shipment without a workbook.
2. Add expected PO lines and confirm available quantity cannot be over-planned.
3. Add containers or cargo groups and build goods-in-transit records.
4. Add supplier invoices later and match invoice lines to expected PO lines.
5. Verify mismatch warnings and approve one mismatch with a reason.
6. Add FOB freight/insurance charges and confirm they allocate to landed cost.
7. Add a CIF/CIP freight or insurance document and confirm it is not double-counted unless explicitly marked allocatable.
8. Allocate landed cost and review landed unit costs.
9. Receive one selected line or one container at estimated cost with permission and audit reason.
10. Repeat the same estimated receiving action and confirm no duplicate receipt posts.
11. Finalize liquidation and receive final; confirm true-up rows show estimated unit, final unit, unit delta, and HNL delta.
12. Review the receiving audit trail from the shipment.
13. Stage AP handoff and confirm every payable remains linked to the shipment source document.
14. Mark sent AP handoffs paid with a payment reference and paid date, or void a staged/sent handoff with a reason.
15. Approve suggested pricing and mark posted with `products.write`.
16. Review the Audit tab for cost changes, invoice matches, receiving, true-up, and status events.
17. Close the shipment only after receiving, AP handoff, verification checks, audit review, and pricing review are complete.

## Reports

The shipment **Reports** tab exports these datasets as CSV or XLSX. Each export reuses the same shipment records shown in the operational tabs.

| Report | Where | Filters | Exports |
|---|---|---|---|
| Shipment Liquidation | Reports tab | Current shipment | CSV / XLSX |
| Goods in Transit | Reports tab | Current shipment | CSV / XLSX |
| Expected PO Shipment | Reports tab | Current shipment | CSV / XLSX |
| Landed Cost Allocation | Reports tab | Current shipment | CSV / XLSX |
| Suggested Pricing Review | Reports tab | Current shipment | CSV / XLSX |
| AP Handoff | Reports tab | Current shipment | CSV / XLSX |

Future cross-shipment report pages can add buyer, vendor, status, date, and container filters, but they should still reuse these import report row definitions.

## Common errors

- **Shipment totals do not reconcile** - invoice values, freight, insurance, taxes, or agency fees differ from the liquidation total.
- **Verification check failed** - record the expected amount, actual amount, variance, and message before continuing liquidation review.
- **Missing exchange rate** - non-HNL source amounts require a rate and rate date before costing approval.
- **Missing cost override permission** - invoice, charge, estimated landed cost, and allocation changes require `import_management.cost_override`.
- **Missing mismatch approval permission** - approving invoice quantity/currency/amount warnings requires `import_management.approve_mismatch`.
- **Estimated receiving requires permission** - receiving before final liquidation is blocked unless the user has `import_management.receive_estimated` and enters an audit reason.
- **Final receiving requires permission** - final receiving and true-up posting require `import_management.final_liquidation`.
- **Suggested price not posted** - calculated prices must be linked to a SKU, approved, and marked posted by a `products.write` user before Products/Pricing treats them as ready. V1 records the handoff; it does not directly update product prices.
- **Payable already sent** - supplier invoices and final landed-cost charges cannot be edited after their payable handoff is marked sent to AP.
- **Payable already paid** - paid import payables cannot be edited or voided from Import Management. Use the future AP reversal/correction workflow.
- **Pricing handoff already posted** - landed-cost allocation and SKU mapping cannot be changed after suggested prices are posted to Products/Pricing.

## Data sources

- **Primary write:** `app.import_*` tables for shipments, containers, invoices, charges, allocations, goods-in-transit records, verification checks, suggested prices, payable handoffs, inventory receipts, and inventory true-ups.
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
