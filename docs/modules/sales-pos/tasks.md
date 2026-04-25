# Sales POS - Tasks

## Goal

Deliver a full Enter Sales module that replaces the current SQLite-backed prototype with a governed Postgres runtime and a production-grade web cashier workflow.

## Work breakdown

### 1. Lock the contract set

Deliverables:

- `README.md`
- `business-functional.md`
- `tech-description.md`
- `schema.md`
- `api.md`
- `decisions.md`
- `docs/dev/specs/2026-04-25-sales-pos-enter-sales-design.md`
- `docs/zacks-retail-manual/sales-pos.md`

Acceptance:

- module boundaries with `customer-transactions`, `store-ops`, `products`, `employees`, `crm`, and `inventory` are explicit,
- the four supplied legacy screens are all represented in the new workflow.

### 2. Add Prisma models and migrations for `app.pos_*`

Deliverables:

- Prisma schema entries,
- SQL migration for all `app.pos_*` tables and `app.pos_ticket_lookup_vw`,
- indexes and constraints described in [`schema.md`](./schema.md).

Acceptance:

- migration applies cleanly on a fresh database,
- migration is additive and does not touch SQLite,
- ticket, shift, payout, and posting relations are queryable through Prisma.

### 3. Build Postgres repositories and domain services

Deliverables:

- repository layer for shifts, tickets, tenders, payouts, and post runs,
- server-side totals calculator,
- inventory-posting integration,
- ticket event audit writer.

Acceptance:

- there is no direct write path to `apps/api/src/db/posDatabase.ts` from the new service layer,
- a test can create a shift, create a ticket, add lines, add tenders, and complete the ticket fully in Postgres.

### 4. Re-home configuration reads onto module contracts

Deliverables:

- register bootstrap service,
- store profile reader,
- tender-type and payout-category readers,
- products lookup adapter wrapper,
- employee override wrapper,
- customer-transactions validation hook.

Acceptance:

- Enter Sales can load without hardcoded store, tender, or promotion metadata,
- override flow uses the employee sales-password bridge, not the current store-shared SQLite password table.

### 5. Implement shift lifecycle

Deliverables:

- open shift,
- cash totals,
- count money,
- close shift,
- post shift,
- batch salesperson summary.

Acceptance:

- only one open shift per register,
- over/short is calculated from ticket totals plus payouts and tender counts,
- shift-post mode writes a `pos_post_run` and inventory entries.

### 6. Implement ticket header and detail behavior

Deliverables:

- create ticket,
- header updates,
- add/edit/remove/review lines,
- reverse quantity,
- next price,
- line comments,
- return-code validation,
- transaction-type validation hooks.

Acceptance:

- RICS parity functions from the supplied detail and header screens are covered,
- product price-slot rotation and coupon behavior work through module contracts,
- negative-quantity refunds are supported.

### 7. Implement tendering and receipt actions

Deliverables:

- split-tender handling,
- tender removal/edit,
- change calculation,
- continued-ticket chain,
- complete sale,
- receipt print count,
- receipt email request.

Acceptance:

- max four split tenders,
- tender `99` continuation works end to end,
- inventory posting status is correct for real-time and shift-post stores.

### 8. Implement manager actions

Deliverables:

- payout drawer,
- reclaim ticket,
- reprint ticket,
- draft void,
- completed unposted void,
- tax override audit,
- discount / refund / close override checks.

Acceptance:

- every sensitive action consumes an employee override token when policy requires it,
- reclaim and reprint search against both runtime and imported historical tickets where appropriate.

### 9. Build the web Enter Sales route

Deliverables:

- `/sales/enter` page,
- launcher card,
- ticket detail workspace,
- payment drawer,
- header / manager drawer,
- payout drawer,
- reclaim / reprint dialog,
- close-batch dialog,
- keyboard-first focus management.

Acceptance:

- a cashier can complete the full sale flow without route changes,
- the page recovers the active ticket after refresh,
- no part of the UI still depends on the placeholder POS tab.

### 10. Build report endpoints and views

Deliverables:

- Sales Journal,
- Sales Tax Recap,
- Sales by Day,
- Returned Sales,
- Promotion Code Analysis,
- Reprint Posted Sales.

Acceptance:

- report outputs reconcile to runtime ticket data and imported history,
- register-side reports remain distinct from broader `sales-reporting` analytics.

### 11. Migrate or retire the SQLite prototype

Deliverables:

- replace current route implementations with Postgres-backed services or compatibility wrappers,
- remove write usage of `posDatabase.ts`,
- update tests to use Postgres fixtures.

Acceptance:

- no active Enter Sales code path writes to SQLite,
- route coverage remains intact during the namespace transition.

### 12. Rehearsal and operator validation

Deliverables:

- rehearsal checklist for Enter Sales,
- parity test matrix by workflow,
- operator signoff notes for cashier and manager flows.

Acceptance:

- regular sale, mixed tender, refund, payout, close batch, post to inventory, reclaim, and reprint all pass against rehearsal data,
- no unresolved high-impact mismatch remains for the register core.

## Suggested implementation order

1. Schema + repositories
2. Shift lifecycle
3. Ticket header/detail
4. Tendering
5. Manager actions
6. Web UI
7. Reports
8. Rehearsal and cleanup

## Explicit non-tasks

- do not add new SQLite tables,
- do not add new request-path MDB reads,
- do not fold `customer-transactions` lifecycles into the base `sales-pos` tables,
- do not create a separate branch or worktree for this module.
