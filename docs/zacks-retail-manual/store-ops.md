# 12. Store Operations

> **Status:** Draft
> **Module spec:** [../modules/store-ops.md](../modules/store-ops.md)
> **RICS ancestry:** Ch. 11 (Stores, Sales Tax Override, Case Packs), Ch. 17 (Company Setup)
> **Last updated:** 2026-04-21

## What this module does

Store Operations is the chain-level administration: the store roster (addresses, phone, managers, sector assignment), sales taxes (rates, effective dates, per-category overrides), tender types (cash, check, each card brand, gift cert, house charge), bill-to addresses, case packs, company setup (fiscal-year start, OTB calculation method, default behaviors), and sectors (1–99 groupings of contiguous departments).

## Audience

- **System administrators** — store creation and configuration, tender types, company setup.
- **Accountants** — tax-rate maintenance, bill-to addresses.
- **Merchandisers** — sector assignment, case packs, per-category tax overrides.
- **Executives** — read-only view of chain configuration.

## Prerequisites

- None within the app — this module seeds the baseline other modules depend on.

## Screens

_TODO. Intended screens:_
- _Store list + detail (identity, address, manager, sector)_
- _Sales Tax setup_
- _Sales Tax override (per category)_
- _Tender Types list + detail_
- _Bill-to Addresses_
- _Case Packs_
- _Company Setup_
- _Sector list (1–99, contiguous department ranges)_

## Common tasks

_TODO. Expected flows:_
- _Add a new store_
- _Change the default sales-tax rate with an effective date_
- _Override sales tax for a specific category_
- _Add a new tender type (e.g. a new credit-card brand)_
- _Adjust the fiscal-year calendar_
- _Reassign departments to a new sector_

## Reports

_TODO._

| Report | Where | Filters | Exports |
|---|---|---|---|
| Store Roster | — | Status | CSV / PDF |
| Sales Tax Configuration | — | Effective date | CSV |

## Keyboard shortcuts

_TODO._

## Common errors

_TODO._

## Data sources (Phase A)

- **Primary read:** `rics_mirror.store_master`, `rics_mirror.sectors`, `rics_mirror.dept_override`, `rics_mirror.vendor_accounts`.
- **Primary write:** Phase A is read-only for the app; RICS owns writes.
- **Future (Phase C):** `store_ops.*` schema — store, tax_rate, tender_type, company_setting.

## Related modules

- [Products](products.md) — department / category / sector / size-type hierarchy.
- [Inventory](inventory.md) — store is the partition key for every on-hand row.
- [Sales / POS](sales-pos.md) — per-register store assignment, tender acceptance.
- [Accounts Receivable](accounts-receivable.md) — bill-to addresses, A/R setup anchors.
- [Employees](employees.md) — per-salesperson store assignment.

## What's different from RICS

_TODO. Expected: store list gets rich fields (timezone, GPS, open hours for status pages); sales-tax effective-date scheduling replaces "change it the night before" overnight job; tender-type activation per store; OTB calculation method flag surfaced in-app instead of in RICS.CFG._
