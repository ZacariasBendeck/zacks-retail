# 3. Physical Inventory

> **Status:** Draft
> **Module spec:** [../modules/physical-inventory.md](../modules/physical-inventory.md)
> **RICS ancestry:** Ch. 10
> **Last updated:** 2026-04-21

## What this module does

Physical inventory is the periodic cycle of counting what's actually on the shelves and reconciling it against the system's on-hand. Managers open a count session for a store (or a section of it), count staff enter counts (manually or via scanner ingestion), the variance report surfaces discrepancies, and an authorized user commits the adjustments so the inventory ledger reflects reality.

## Audience

- **Store managers** — schedule, open, and close count sessions; review variance.
- **Count staff** — enter counts on worksheet screens or scan via portable devices.
- **Accountants / auditors** — review variance magnitude and sign-offs before commit.

## Prerequisites

- [Inventory](inventory.md) — on-hand baseline must be trustworthy (post-to-inventory closeouts complete).
- [Products](products.md) — SKU master current.
- [Store Operations](store-ops.md) — session is store-scoped.

## Screens

_TODO. Intended screens:_
- _Count session list + new-session form_
- _Worksheet entry (by SKU / by location / by size grid)_
- _Portable-scanner ingestion (paste or upload)_
- _Items-not-counted report_
- _Variance report (before commit)_
- _Commit + lock-out confirmation_

## Common tasks

_TODO. Expected flows:_
- _Open a new count session for one store / section_
- _Enter a count batch manually_
- _Import counts from a portable scanner export_
- _Review items with zero entries (items-not-counted)_
- _Review variance and attach a note for large discrepancies_
- _Commit the session — apply adjustments to on-hand_

## Reports

_TODO._

| Report | Where | Filters | Exports |
|---|---|---|---|
| Items Not Counted | — | Session | PDF / CSV |
| Variance | — | Session, threshold % | PDF / CSV |
| Post-commit audit | — | Session | CSV |

## Keyboard shortcuts

_TODO._

## Common errors

_TODO._

## Data sources (Phase A)

- **Primary read:** `rics_mirror.inventory_quantities` for on-hand baseline.
- **Primary write:** `app.*` tables for count sessions (schema not yet landed; see module spec for design).
- **Phase A constraint:** commits cannot yet propagate back to RICS on-hand because RICS is the write source. Count sessions in Phase A are informational only; actual adjustments happen in RICS. This flips in Phase B.

## Related modules

- [Inventory](inventory.md) — on-hand baseline read; adjustments write to inventory movements.
- [Products](products.md) — SKU identity + size-type grid for worksheets.
- [Store Operations](store-ops.md) — session is per-store.

## What's different from RICS

_TODO. Expected: richer scanner ingestion (CSV / JSON upload, not serial-port only); audit trail per commit; web UI supports concurrent counters in different sections._
