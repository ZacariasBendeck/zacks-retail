# 4. Purchasing

> **Status:** Draft
> **Module spec:** [../modules/purchasing.md](../modules/purchasing.md)
> **RICS ancestry:** Ch. 3
> **Last updated:** 2026-04-29

## What this module does

Purchasing is how stock gets into the stores. Buyers create purchase orders against vendors and distribute lines across stores; auto-POs generate from reorder points; order worksheets batch-build POs from sales velocity; receivers post arrivals (full or partial), handle ASN cartons, and reconcile discrepancies; accountants read PO reports and open-PO-by-month roll-ups.

## Audience

- **Buyers** - PO entry, auto-POs, order worksheets, vendor terms.
- **Receivers** - receive POs, reconcile ASN cartons, flag discrepancies.
- **Accounts Payable** - open-PO-by-month, vendor statements cross-check.
- **Store managers** - read-only PO status for their stores.

## Prerequisites

- [Products](products.md) - SKUs + vendor master.
- [Store Operations](store-ops.md) - stores to distribute lines across.
- [Import Management](import-management.md) - linked import shipments can provide estimated or final landed unit costs for international PO lines.

## Screens

_TODO. Intended screens:_
- _PO list + filter (status, vendor, date, store)_
- _PO entry (header + lines + store distribution)_
- _Auto-PO - review + approve_
- _Order worksheet (velocity-driven batch)_
- _Receive PO (full / partial / carton-level)_
- _ASN carton reconciliation_
- _PO combine / merge / replicate / duplicate_
- _Reset future orders_

## Common tasks

_TODO. Expected flows:_
- _Create a manual PO for a vendor across N stores_
- _Generate auto-POs from reorder points_
- _Build an order worksheet from sales history_
- _Receive a full PO_
- _Receive partial + leave remainder open_
- _Process ASN cartons with discrepancy handling_
- _Combine two POs into one_
- _Replicate a seasonal PO to next year_

## Import Management boundary

Normal PO entry, status, and receiving stay in Purchasing. Imported shipments, voyages, containers, goods-in-transit, customs/tax liquidation, freight/insurance allocation, and landed-cost verification live in [Import Management](import-management.md). When an import shipment reaches receiving, Purchasing consumes the linked PO lines and the estimated or final HNL landed unit costs supplied by Import Management.

## Reports

_TODO._

| Report | Where | Filters | Exports |
|---|---|---|---|
| Open POs | - | Vendor, store, date | CSV / PDF |
| Open P.O. by Month | - | Month range | CSV / PDF |
| Receipt discrepancies | - | Date range, vendor | CSV |

## Keyboard shortcuts

_TODO._

## Common errors

_TODO._

## Data Sources

- **Legacy baseline read:** imported `app.purchase_order_legacy` and `app.purchase_order_legacy_line` rows from direct CSV artifact imports.
- **Development write:** native purchase-order work lands in Postgres `app.*` tables only. RICS remains the operational source of truth until cutover, and Zack's Retail must not write back to MDB files.
- **Cutover target:** native `app.purchase_order`, `app.purchase_order_line`, `app.purchase_order_line_size_cell`, `app.po_receipt`, and related purchasing tables become the operational source after rehearsal validation.

## Related modules

- [Products](products.md) - SKU + vendor master.
- [Inventory](inventory.md) - on-order and receipts create inventory movements.
- [Import Management](import-management.md) - voyages, containers, goods in transit, and landed-cost liquidation for international buying.
- Accounts Payable - vendor-side invoices, payables, and payments (future).
- [OTB Planning](otb-planning.md) - PO commitments count against plan.

## What's different from RICS

_TODO. Expected: real-time on-order updates; richer ASN handling (EDI + manual); receipt via mobile scanner; explicit audit of every PO modification._
