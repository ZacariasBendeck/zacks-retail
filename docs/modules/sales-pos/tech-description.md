# Sales POS - Technical Description

## Scope

This file describes the current implementation snapshot for the register surfaces already in the repo and the target Postgres-first runtime for Enter Sales.

## Current implementation snapshot

The repo now has only the shared pieces that the future Enter Sales runtime will build on:

- [`apps/api/src/app.ts`](../../../apps/api/src/app.ts) mounts `/api/v1/pos` only for POS SKU / promotion / return-code lookup via [`apps/api/src/routes/posSkuRoutes.ts`](../../../apps/api/src/routes/posSkuRoutes.ts).
- Shared store reads now live at [`apps/api/src/routes/storeRoutes.ts`](../../../apps/api/src/routes/storeRoutes.ts) backed by Postgres `app.store_master`.
- Inventory posting already bridges into Postgres through [`apps/api/src/services/postgresInventoryLedger.ts`](../../../apps/api/src/services/postgresInventoryLedger.ts).
- Employee sales-password verification already exists in the `employees` module via [`apps/api/src/routes/employeeRoutes.ts`](../../../apps/api/src/routes/employeeRoutes.ts) and [`apps/api/src/services/employees/salesPasswordBridgeService.ts`](../../../apps/api/src/services/employees/salesPasswordBridgeService.ts).
- The web app does not yet have a real Enter Sales UI. [`apps/web/src/pages/products/inquiry/tabs/PosTab.tsx`](../../../apps/web/src/pages/products/inquiry/tabs/PosTab.tsx) is only a placeholder.

Conclusion: the repo has the lookup, inventory, employee-override, and store-master primitives needed for Enter Sales, but the runtime shift/ticket/tender stack and the `/sales/enter` UI still need to be built.

## Target runtime

The forward Enter Sales stack is:

- **Database:** Postgres `app.pos_*` tables for runtime register state.
- **Backend:** Prisma-backed `sales-pos` services in `apps/api/src/services/salesPos/*`.
- **Frontend:** a dedicated `/sales/enter` route in `apps/web` that owns the full cashier workflow.
- **Integrations:** products, employees, store-ops, customer-transactions, crm, inventory, and accounts-receivable via explicit contracts.

No request-path behavior in this module should depend on:

- direct MDB reads,
- a revived `rics_mirror` schema,
- register-local files as the source of truth.

## Route shape

The current API is split across `/shifts`, `/tickets`, `/pay-outs`, and `/reports/pos`. The forward contract should converge under `/api/v1/pos/*` while keeping compatibility shims only as long as needed during migration.

Recommended route families:

- `/api/v1/pos/bootstrap`
- `/api/v1/pos/registers/*`
- `/api/v1/pos/shifts/*`
- `/api/v1/pos/tickets/*`
- `/api/v1/pos/payouts/*`
- `/api/v1/pos/reports/*`

The frontend route should be:

- `/sales/enter`

That route owns:

- shift launcher,
- active ticket workspace,
- payment drawer,
- header / manager drawer,
- reclaim and reprint dialogs,
- payout drawer,
- close-batch and count-money dialogs.

## Service boundaries

Recommended backend service split:

| Service | Responsibility |
|---|---|
| `bootstrapService` | Load stores, registers, open shift, tender types, payout categories, promotions, return codes, and cashier context. |
| `shiftService` | Open shift, cash totals, count money, close shift, post shift, over/short calculations. |
| `ticketService` | Create ticket, load snapshot, update header, add/edit/remove lines, compute totals, complete ticket, continue, reclaim, void, reprint. |
| `pricingService` | Resolve product pricing, price-slot rotation, discounts, coupon behavior, tax inputs. |
| `tenderService` | Split tenders, change calculations, account-number validation, continuation logic. |
| `payoutService` | Shift payouts and cash expectations. |
| `receiptService` | Receipt payload rendering, print count, email-delivery request emission. |
| `reportService` | Sales Journal, Sales Tax Recap, Sales by Day, Returned Sales, Promotion Code Analysis, Reprint Posted Sales. |
| `overrideService` | Consume employee override tokens and enforce permission-gated actions. |

Recommended frontend component split:

| Component | Responsibility |
|---|---|
| `EnterSalesPage` | Root page and query orchestration. |
| `ShiftLauncherCard` | Open or resume the current register shift. |
| `TicketHeaderBar` | Ticket summary, cashier, customer, transaction-type badge, promo badge, total note. |
| `SkuEntryPanel` | UPC / SKU entry controls and line editor. |
| `TicketLinesGrid` | Current ticket lines and review state. |
| `PaymentDrawer` | Tender rows, totals, change, and receipt actions. |
| `HeaderDrawer` | Header edits plus manager action launchers. |
| `PayoutDrawer` | Payout entry tied to the open shift. |
| `ReclaimDialog` | Current-batch reclaim and reprint lookups. |
| `CloseBatchDialog` | Count-money, expected totals, over/short approval, and post action. |

## State model

### Shift state

`sales-pos` treats the register shift as the cashier session boundary.

Recommended statuses:

- `OPEN`
- `COUNTING`
- `CLOSED`
- `POSTED`
- `VOIDED`

### Ticket state

The active ticket is a server-owned aggregate, not just browser state.

Recommended statuses:

- `DRAFT`
- `READY_FOR_PAYMENT`
- `COMPLETED`
- `CONTINUED`
- `VOIDED`
- `REFUNDED`

The page should always be able to recover the active draft from the server if the browser reloads.

### Posting mode

Store configuration controls whether inventory is updated:

- in real time at ticket completion, or
- when the closed shift is explicitly posted.

The ticket and shift models need a clear posting status so the register, inventory, and reporting layers all agree on whether a sale is still pending.

## Cross-module dependencies

### Products

`sales-pos` does not own SKU lookup or pricing rules. It consumes:

- SKU and UPC resolution,
- size / column / row metadata,
- current price slots,
- promotion code catalog,
- return code catalog,
- coupon and perks flags.

The existing `posSkuRoutes` and `ricsProductAdapter` can help guide the interface, but the final request path should read owned product baselines from Postgres-backed module contracts.

### Employees

`sales-pos` depends on `employees` for:

- cashier and salesperson identity,
- permissions such as `SALES_POS_OPERATE` and `SALES_REFUND`,
- sales-password verification and token consumption,
- manager attribution on approvals.

This is why register-side shared passwords cannot remain the authority path.

### Store operations

`store-ops` owns:

- store metadata,
- sales tax definitions,
- tender types,
- payout categories,
- receipt defaults,
- required-account rules,
- posting mode and related store-level switches.

`sales-pos` reads those contracts; it does not recreate them.

### Customer transactions

The Enter Sales header is where a cashier chooses transaction type, but `sales-pos` only owns the shared shell. Typed extension rows and state machines for special orders, layaways, gift-card sales, and house-charge payments remain in `customer-transactions`.

### CRM and inventory

CRM supplies customer lookup, store-credit / house-charge context, family members, and receipt-email targets. Inventory consumes completed and refunded ticket postings.

## Migration path from the current prototype

1. Create Prisma models and migrations for `app.pos_*`.
2. Build repository and service layers against Postgres without deleting the old SQLite routes yet.
3. Re-point the current route handlers or replace them with the governed `/api/v1/pos/*` endpoints.
4. Replace the store-shared sales-password routes with calls into the employee override bridge.
5. Build the `/sales/enter` UI and stop treating POS as a placeholder inside Product Inquiry.
6. Retire SQLite route state once the Postgres runtime covers shift, ticket, payout, and reporting behavior end to end.

## Non-negotiable technical rules

- Enter Sales must remain keyboard-first even though it moves to a browser UI.
- All monetary values remain plain numeric HNL displays with no currency symbol in table cells.
- Every state-changing action needs audit coverage through `pos_ticket_event`, `pos_payout`, or shift/post-run records.
- Ticket and shift writes must be idempotent enough to survive retries from the browser.
- Rehearsal and cutover require one authoritative Postgres runtime, not local register file divergence.
