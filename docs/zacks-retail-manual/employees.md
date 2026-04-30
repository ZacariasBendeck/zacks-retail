# 12. Employees

> **Status:** Draft
> **Module spec:** [../modules/employees/README.md](../modules/employees/README.md)
> **RICS ancestry:** Ch. 7 (time clock, commissions, salesperson period close)
> **Last updated:** 2026-04-30

## What this module does

Employees is the retail HR/salesperson spine. It holds the salesperson roster, time-clock entries (login / logout / admin / print), commission overrides per SKU or category, hours + perks, salesperson analysis, close-salesperson-period rollups, sales passwords, and the manager-override record.

Application users, login, roles, sessions, MFA, SSO, and access scopes live in [Identity & Access](identity-access.md).

## Audience

- **HR / office managers** -- onboard salespeople, adjust commission rates, close periods.
- **Store managers** -- approve time-clock corrections, resolve missing punches.
- **Cashiers / salespeople** -- clock in / out, view their own hours and commissions.
- **System administrators** -- sales passwords and employee-linked operational access; user accounts and roles are managed in Identity & Access.

## Prerequisites

- [Store Operations](store-ops.md) -- stores, assigned per salesperson.
- [Identity & Access](identity-access.md) -- authenticated app users and permission checks.

## Screens

_TODO. Intended screens:_

- _Salesperson list + detail_
- _Time Clock (kiosk mode + admin mode)_
- _Missing-punch correction_
- _Commission overrides (per SKU / category / salesperson)_
- _Perks + hours review_
- _Salesperson Analysis_
- _Close Salesperson Period_
- _Sales password maintenance_
- _Manager overrides log_

## Common tasks

_TODO. Expected flows:_

- _Add a new salesperson_
- _Set up a commission override for a promoted category_
- _Review and close a salesperson's period_
- _Correct a missing time-clock punch_
- _Rotate sales passwords_

## Reports

_TODO._

| Report | Where | Filters | Exports |
|---|---|---|---|
| Time Clock Print | -- | Date range, salesperson | PDF |
| Salesperson Analysis | -- | Period, store | CSV / PDF |
| Manager Override Log | -- | Date range, salesperson | CSV |

## Data sources (Phase A)

- **Primary read:** `rics_mirror.salespeople`, `rics_mirror.salespeople_sales`, `rics_mirror.time_clock`.
- **Primary write:** app employee/salesperson operational tables in `public.*` / `app.*`, depending on slice.
- **Identity dependency:** app auth tables in `public.*` (`User`, `Session`, `Role`) are owned by Identity & Access and are preserved across `rics_mirror` reloads.
- **Future (Phase C):** `employees.*` schema -- salesperson, time_clock, commission, perks, period close.

## Related modules

- [Sales / POS](sales-pos.md) -- salesperson attribution on each ticket.
- [Sales Reporting](sales-reporting.md) -- sales-by-salesperson rollups.
- [Store Operations](store-ops.md) -- store assignment.
- [Identity & Access](identity-access.md) -- app users, login, roles, sessions, MFA, SSO, access scopes.
- [Platform](platform.md) -- audit log captures sensitive employee changes.

## What's different from RICS

_TODO. Expected: web-based time clock with optional mobile punch; app identity handled through Identity & Access; structured audit log on commission changes._
