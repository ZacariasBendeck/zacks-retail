# 4. Purchasing

> **Status:** Draft
> **Module spec:** [../modules/purchasing.md](../modules/purchasing.md)
> **RICS ancestry:** Ch. 3
> **Last updated:** 2026-04-21

## What this module does

Purchasing is how stock gets into the stores. Buyers create purchase orders against vendors and distribute lines across stores; auto-POs generate from reorder points; order worksheets batch-build POs from sales velocity; receivers post arrivals (full or partial), handle ASN cartons, and reconcile discrepancies; accountants read PO reports and open-PO-by-month roll-ups.

## Audience

- **Buyers** — PO entry, auto-POs, order worksheets, vendor terms.
- **Receivers** — receive POs, reconcile ASN cartons, flag discrepancies.
- **Accounts Payable** — open-PO-by-month, vendor statements cross-check.
- **Store managers** — read-only PO status for their stores.

## Prerequisites

- [Products](products.md) — SKUs + vendor master.
- [Store Operations](store-ops.md) — stores to distribute lines across.

## Screens

_TODO. Intended screens:_
- _PO list + filter (status, vendor, date, store)_
- _PO entry (header + lines + store distribution)_
- _Auto-PO — review + approve_
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

## Reports

_TODO._

| Report | Where | Filters | Exports |
|---|---|---|---|
| Open POs | — | Vendor, store, date | CSV / PDF |
| Open P.O. by Month | — | Month range | CSV / PDF |
| Receipt discrepancies | — | Date range, vendor | CSV |

## Keyboard shortcuts

_TODO._

## Common errors

_TODO._

## Data sources (Phase A)

- **Primary read:** `rics_mirror` PO tables (specific table names TBD — see module spec).
- **Primary write (Phase A):** none from app; RICS owns writes. Phase B flips this.
- **Future (Phase C):** `purchasing.*` schema — purchase_order, po_line, po_receipt.

## Related modules

- [Products](products.md) — SKU + vendor master.
- [Inventory](inventory.md) — on-order and receipts create inventory movements.
- [Accounts Receivable](accounts-receivable.md) — PO dollars feed vendor-side ledgering (future).
- [OTB Planning](otb-planning.md) — PO commitments count against plan.

## What's different from RICS

_TODO. Expected: real-time on-order updates; richer ASN handling (EDI + manual); receipt via mobile scanner; explicit audit of every PO modification._
