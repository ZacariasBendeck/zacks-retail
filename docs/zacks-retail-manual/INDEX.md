# Zack's Retail — User Manual

> **Forward spec for Zack's Retail.** Supersedes the RICS v7.7 manual at [../rics-reference/77manual.pdf](../rics-reference/77manual.pdf) as the system's source of truth. The RICS manual is ancestry — cited as lineage, not live spec.
>
> **Audience:** store operators, cashiers, managers, developers, administrators. The developer-facing module contracts at [../modules/](../modules/) cross-reference these chapters.
>
> **Status:** living document. Chapters can be written ahead of UI (Status: Spec) and evolve as screens ship.

## Conventions

- **Currency:** HNL (Honduran Lempira). Plain numbers with thousands separators — no `$`, no `L` inside tables or on-screen cells. Reports carry one top-of-page note: "Amounts in Lempira (HNL)".
- **Keyboard shortcuts** shown as `Ctrl+S`-style.
- **Screenshots:** `assets/<module-slug>/`.
- **Status legend:** Draft (scaffolded) • Spec (design done, UI pending) • In progress (UI shipping) • Stable (matches UI, reviewed) • Stale (drift detected)

## Chapters

| # | Chapter | Module spec | RICS ancestry | Status |
|---|---|---|---|---|
| 1 | [Products](products.md) | [products](../modules/products.md) | Ch. 4, Ch. 5, Ch. 11 | Draft |
| 2 | [Inventory](inventory.md) | [inventory](../modules/inventory.md) | Ch. 4 | Draft |
| 3 | [Physical Inventory](physical-inventory.md) | [physical-inventory](../modules/physical-inventory.md) | Ch. 10 | Draft |
| 4 | [Purchasing](purchasing.md) | [purchasing](../modules/purchasing.md) | Ch. 3 | Draft |
| 5 | [Open-To-Buy Planning](otb-planning.md) | [otb-planning](../modules/otb-planning.md) | Ch. 6, Ch. 11, Ch. 17 | Draft |
| 6 | [Sales / POS](sales-pos.md) | [sales-pos](../modules/sales-pos.md) | Ch. 2, Ch. 13 | Draft |
| 7 | [Customer Transactions](customer-transactions.md) | [customer-transactions](../modules/customer-transactions.md) | Ch. 2, Ch. 9 | Draft |
| 8 | [Sales Reporting](sales-reporting.md) | [sales-reporting](../modules/sales-reporting.md) | Ch. 2, Ch. 6 | Draft |
| 9 | [CRM](crm.md) | [crm](../modules/crm.md) | Ch. 9, Ch. 15, Ch. 17 | Draft |
| 10 | [Accounts Receivable](accounts-receivable.md) | [accounts-receivable](../modules/accounts-receivable.md) | Ch. 6, Ch. 8, Ch. 16, Ch. 17 | Draft |
| 11 | [Employees](employees.md) | [employees](../modules/employees.md) | Ch. 7, Ch. 11 | Draft |
| 12 | [Store Operations](store-ops.md) | [store-ops](../modules/store-ops.md) | Ch. 11, Ch. 17 | Draft |
| 13 | [Platform](platform.md) | [platform](../modules/platform.md) | Ch. 5, Ch. 8, Ch. 13, Ch. 14, Ch. 15, Ch. 17 | Draft |
| N1 | [Purchase Planning](purchase-planning.md) | [purchase-planning](../modules/purchase-planning.md) | — (net-new) | Draft |

## How this manual relates to the module specs

- **Module specs at `docs/modules/<slug>.md`** are developer contracts — they declare what must be built, why, and how it maps to RICS. Source of truth for implementation decisions, phase-gate state, data surfaces.
- **Manual chapters here** are the user-facing narrative — how operators, managers, and cashiers use the system. Source of truth for UX, training, and "what should this screen look like."

Both point at the same behavior; chapters describe it in user terms, module specs in developer terms.

## How this manual evolves

- Add a chapter: `/new-manual-chapter <slug>`.
- Update Status as UI progresses: Draft → Spec → In progress → Stable.
- When a module's scope changes, update the manual chapter and module spec in the same commit.
- Never reference `legacy/`, branches, or PR workflows in manual content.
