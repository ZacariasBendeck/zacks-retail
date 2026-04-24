# Employees Module Build Order

Execution order for bringing the RICS salespeople surface to cutover readiness.

This plan follows the current repo reality:

- Slice 1 auth/users is already shipped.
- The current implementation unified employee-facing fields onto `public.User`.
- The remaining work should continue from that model instead of introducing a second employee identity table mid-stream.

## Build Slices

### Slice 1. Auth / Users foundation

**Status:** shipped

Already live:

- login / logout / me / change-password
- user CRUD
- roles + permission middleware
- owner bootstrap

This slice is the dependency base for everything else in `employees`.

### Slice 2. Employee roster core

**Status:** shipped (backend)

Goal:

- represent a salesperson as an employee-backed user profile
- expose `/api/v1/employees`
- support create, view, update, deactivate, reactivate

Fields in scope:

- salesperson code
- display name
- other information
- default commission rate
- commission basis
- home store
- hire / termination dates
- time-clock enabled flag

Why first:

- unblocks salesperson maintenance
- gives `sales-pos` a stable lookup identity
- gives time-clock / commission work a place to hang fields

### Slice 3. Sales passwords / manager override bridge

**Status:** shipped (backend)

Goal:

- preserve current shared store password behavior
- add a modern employee-scoped override model behind it
- expose audit trail and lockout behavior

Dependencies:

- employee roster core
- sales-pos integration points

### Slice 4. Time clock policy + entry lifecycle

**Status:** shipped (backend)

Goal:

- per-store time-clock policy
- clock in / out
- admin adjustment
- open-punch reconciliation
- print/export time-clock data

Dependencies:

- employee roster core
- store assignment

Current backend surface:

- `GET/PATCH /api/v1/time-clock-policy`
- `POST /api/v1/employees/time-clock/clock-in`
- `POST /api/v1/employees/time-clock/clock-out`
- `GET /api/v1/employees/time-clock/open`
- `GET /api/v1/employees/time-clock/entries`
- `POST /api/v1/employees/time-clock/entries/:id/adjust`
- `GET /api/v1/employees/time-clock/entries/:id/adjustments`
- `GET /api/v1/employees/time-clock/reconciliation`
- `GET /api/v1/reports/time-clock`

Backend notes:

- adjustment edits now preserve an append-only audit row in `TimeClockEntryAdjustment`
- report/export parity is available at the API layer in JSON and CSV
- closed-period locking still depends on Slice 6 `EmployeePeriod`
- operator-facing admin screens still land in Slice 7

### Slice 5. Commission / perks ledger

**Status:** in progress

Goal:

- default commission behavior
- commission overrides
- perks posting from ticket events
- reversing entries on void / return

Dependencies:

- employee roster core
- sales-pos event contract
- products perks source

Current backend surface:

- `GET|POST /api/v1/employees/:id/commission-overrides`
- `PATCH|DELETE /api/v1/employees/commission-overrides/:id`

Still missing in this slice:

- commission ledger append-only rows
- perks ledger rows from sales events
- reversal entries on void / return
- manual hours/perks entry when time clock is off

### Slice 6. Salesperson analysis + period close

Goal:

- salesperson analysis report
- PTD / MTD / STD / YTD rollups
- period close / reopen
- payroll-review-safe totals

Dependencies:

- commission / perks ledger
- time clock

### Slice 7. Web UI completion

Goal:

- employee list / detail
- sales-password maintenance
- time-clock admin
- salesperson analysis UI
- period-close UI

Dependencies:

- slices 2 through 6 API surfaces

### Slice 8. Rehearsal and operator sign-off

Goal:

- run [employees-testing-checklist.md](./employees-testing-checklist.md)
- verify real operator flows
- document any accepted modernization differences

Dependencies:

- all prior slices

## Immediate Next Steps

1. Build Slice 5:
   - commission defaults and overrides
   - perks posting / reversal ledger
2. Then build Slice 6:
   - salesperson analysis
   - period close / reopen
3. Then build Slice 7:
   - employee and time-clock admin UI
   - report screens and operator workflows

## Cutover Rule

Do not treat Slice 1 auth as “employees done.” The module is not deployment-ready until slices 2 through 6 are implemented and the checklist passes.
