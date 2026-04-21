# 11. Employees

> **Status:** Draft
> **Module spec:** [../modules/employees.md](../modules/employees.md)
> **RICS ancestry:** Ch. 7 (time clock, commissions, salesperson period close), Ch. 11 (Users)
> **Last updated:** 2026-04-21

## What this module does

Employees is the HR spine plus the auth system. It holds the salesperson roster, time-clock entries (login / logout / admin / print), commission overrides per SKU or category, hours + perks, salesperson analysis, close-salesperson-period rollups, application users + auth + permissions, sales passwords, and the manager-override record.

## Audience

- **HR / office managers** — onboard salespeople, adjust commission rates, close periods.
- **Store managers** — approve time-clock corrections, resolve missing punches.
- **Cashiers / salespeople** — clock in / out, view their own hours and commissions.
- **System administrators** — user accounts, roles, permissions, sales passwords.

## Prerequisites

- [Store Operations](store-ops.md) — stores, assigned per salesperson.

## Screens

_TODO. Intended screens:_
- _Salesperson list + detail_
- _Time Clock (kiosk mode + admin mode)_
- _Missing-punch correction_
- _Commission overrides (per SKU / category / salesperson)_
- _Perks + hours review_
- _Salesperson Analysis_
- _Close Salesperson Period_
- _User list + detail (auth)_
- _Roles + permissions_
- _Sales password maintenance_
- _Manager overrides log_

## Common tasks

_TODO. Expected flows:_
- _Add a new salesperson_
- _Set up a commission override for a promoted category_
- _Review and close a salesperson's period_
- _Correct a missing time-clock punch_
- _Invite a new user with a specific role_
- _Rotate sales passwords_

## Reports

_TODO._

| Report | Where | Filters | Exports |
|---|---|---|---|
| Time Clock Print | — | Date range, salesperson | PDF |
| Salesperson Analysis | — | Period, store | CSV / PDF |
| Manager Override Log | — | Date range, salesperson | CSV |

## Keyboard shortcuts

_TODO._

## Common errors

_TODO._

## Data sources (Phase A)

- **Primary read:** `rics_mirror.salespeople`, `rics_mirror.salespeople_sales`, `rics_mirror.time_clock`.
- **Primary write:** app auth tables in `public.*` (User, Session, Role) — these are already live and **preserved across `rics_mirror` reloads**.
- **Future (Phase C):** `employees.*` schema — user, role, permission, session, salesperson, time_clock.

## Related modules

- [Sales / POS](sales-pos.md) — salesperson attribution on each ticket.
- [Sales Reporting](sales-reporting.md) — sales-by-salesperson rollups.
- [Store Operations](store-ops.md) — store assignment.
- [Platform](platform.md) — audit log captures sensitive employee changes.

## What's different from RICS

_TODO. Expected: web-based time clock with optional mobile punch; modern auth (password hashing, MFA); granular permissions vs. role-based simple scheme; SSO option; structured audit log on commission changes._
