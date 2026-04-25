# Design: Enter Sales browser workspace

**Date:** 2026-04-25
**Module:** `sales-pos`
**Scope:** Enter Sales UI, register API alignment, and the path from today's shared primitives to a Postgres-first cashier workflow

## Purpose

Design the full Enter Sales experience from the four supplied legacy screens:

- `Pictures/Enter Sales first screen .png`
- `Pictures/Enter Sales (Ticket Detail).png`
- `Pictures/Enter Sales (Ticket Payment).png`
- `Pictures/Enter Sales(Change Ticket Header).png`

The output of this spec is one coherent browser workflow that preserves RICS cashier behavior but fits Zack's Retail's module boundaries and Postgres-only runtime rules.

## Goals

1. Preserve all cashier-visible functions shown in the legacy Enter Sales flow.
2. Replace the four-screen Windows/Access interaction with one web route and context-preserving drawers.
3. Keep explicit batch controls, reclaim, payout, close-batch, and transaction-type selection because operators rely on them.
4. Reuse adjacent modules instead of rebuilding their responsibilities inside `sales-pos`.
5. Land on a shape that feels modern enough to compete with current POS products without losing RICS parity.

## Non-goals

- Implementing the downstream lifecycle details for special orders, layaways, gift-card balances, or house-charge ledgers. Those stay in `customer-transactions`.
- Designing receipt-printer drivers or hardware protocols in detail.
- Reworking long-range sales analytics that belong in `sales-reporting`.

## Current state

- The old POS-local runtime has been removed.
- Inventory posting already touches Postgres.
- POS SKU / promotion / return-code lookup still exists under `/api/v1/pos`.
- Employee override verification already exists in the `employees` module.
- The web app has no real Enter Sales page yet.

So the design is now a forward build plan, not a retrofit over an existing register runtime.

## Design stance compared to other POS systems

### What to borrow

- **Square / Shopify POS:** one cart workspace, fast payment surface, obvious totals, and barcode-first interaction.
- **Odoo / ERPNext POS:** explicit document states and extension hooks for customer-account-backed flows.
- **Modern web apps generally:** drawers and dialogs for secondary tasks instead of route changes or pop-up windows.

### What not to copy blindly

Many modern POS products hide shift close, cash count, payouts, and post-to-inventory behind back-office menus. Zack's Retail cannot do that because RICS parity requires those controls to remain part of the cashier and manager rhythm.

### Resulting design rule

Build a modern cart-first workspace, but keep the RICS operational spine visible:

- current batch,
- last ticket,
- transaction type,
- reclaim / reprint,
- payout,
- count money,
- close batch,
- posting state.

## Screen mapping

| Legacy screen | Browser surface | Design note |
|---|---|---|
| Start New Batch | Shift launcher card | Shown when no shift is open, and also available as a compact summary when a shift is active. |
| Ticket Detail | Main Enter Sales canvas | This is always visible while the cashier is working on a ticket. |
| Ticket Payment | Right-side payment drawer | Keeps the line grid visible behind the tender workflow. |
| Change Ticket Header | Left-side header / manager drawer | Keeps header edits and operational actions one click away. |

## Route and layout

Route:

- `/sales/enter`

Top-level layout:

```text
+----------------------------------------------------------------------------------+
| Shift card: store | register | batch | last ticket | business date | manager     |
+----------------------------------------------------------------------------------+
| Ticket summary strip: ticket # | cashier | transaction | customer | promo | note |
+-------------------------------------------+--------------------------------------+
| SKU entry / line editor                    | Totals rail                          |
| - UPC / SKU                               | - Qty                                |
| - size / color                            | - Subtotal                           |
| - qty / price / discount                  | - ISV                                |
| - tax flags / salesperson / comment       | - ISV Ad                             |
| - action buttons                          | - Other charges                      |
+-------------------------------------------+--------------------------------------+
| Ticket lines grid                                                                |
+----------------------------------------------------------------------------------+
| Action bar: Save/Next SKU | Save/Tender | Review | Next Price | Change Header ...|
+----------------------------------------------------------------------------------+
```

Overlay surfaces:

- right drawer: payment
- left drawer: header and manager actions
- dialog: reclaim / reprint
- dialog: payout
- dialog: count money / close batch
- dialog: ticket review

## Visual direction

This should not look like a generic admin table page.

Visual rules:

- dense but intentional cashier layout,
- large running totals and change due,
- scanner field pinned in a predictable location,
- action buttons grouped by cashier task instead of by CRUD category,
- strong status chips for `DRAFT`, `CONTINUED`, `COMPLETED`, `VOIDED`, and posting state,
- an always-visible note that amounts are in Lempira (HNL),
- no currency symbols inside table cells or total cells.

## Detailed workflow

### 1. Shift launcher

When the page loads:

- if no shift is open for the selected register, show the launcher card,
- if a shift is already open, show the active workspace and the compact shift summary.

Launcher actions:

- choose store,
- choose register,
- review current batch / last ticket,
- enter opening cash float,
- open shift,
- open manager options if allowed.

### 2. Ticket detail canvas

Default focus goes to the UPC / SKU field.

Cashier flow:

1. scan UPC or type SKU,
2. resolve size / row / column,
3. adjust quantity or reverse quantity for returns,
4. rotate price slot if needed,
5. apply discount or price override if allowed,
6. save and keep scanning or move to tender.

Supporting actions:

- `Review` opens the current ticket review dialog,
- `Change Header` opens the left drawer,
- `Next Price` rotates product-owned price slots,
- `Void` voids the current ticket with the correct approval path,
- `Mail Detail` launches CRM-linked receipt / customer detail handling.

### 3. Payment drawer

The payment drawer opens from `Save/Tender`.

Contents:

- subtotal,
- `15% ISV`,
- `ISV.Ad`,
- other charges / gift box,
- total due,
- four tender rows,
- total tender,
- change due,
- promo code and ticket comment,
- `End Sale`,
- `Add More SKUs`,
- `Void`,
- `Clear`,
- `Mail Detail`.

Tender UX rules:

- the first tender row defaults to the full balance due,
- legacy numeric tender keys stay available,
- non-cash tenders surface the extra fields they need,
- continuation is presented as a clear action even if the underlying tender code remains `99`.

### 4. Header and manager drawer

This drawer combines the legacy Change Ticket Header screen with operational launchers.

Header edit section:

- cashier,
- transaction type,
- customer,
- discount percent,
- ship-to state,
- promo code.

Operations section:

- manager options,
- UPC price scan,
- payouts,
- close batch,
- reclaim ticket,
- reprint ticket,
- mail list,
- exit back to the launcher when no draft ticket is open.

### 5. Close-batch flow

Close Batch is a guided dialog, not a one-click action.

Steps:

1. show expected tender totals,
2. enter count-money results by tender type,
3. show payouts and expected cash math,
4. capture deposit and ending drawer cash,
5. calculate over/short,
6. request manager approval if outside tolerance,
7. close the shift,
8. offer post-to-inventory when the store uses shift-post mode.

## Keyboard model

Confirmed keys to preserve from the legacy flow:

- `Enter` / `Tab` move forward through ticket entry,
- `Shift+Tab` moves backward,
- numeric tender shortcuts: `1`, `2`, `3`, `4`, `7`, `9`, `10`, `11`, `99`,
- `Esc` closes the active drawer or dialog without leaving the page.

The implementation can add more shortcuts later, but it should not depend on mouse-only interaction for the core sale flow.

## Module interactions

| Module | Enter Sales dependency |
|---|---|
| `products` | SKU lookup, UPC lookup, price slots, promotion codes, return codes, coupon / perks metadata |
| `employees` | cashier identity, permissions, override token verification |
| `store-ops` | taxes, tender types, payout categories, register/store profile |
| `customer-transactions` | validation and extension behavior for transaction types 3-8 |
| `crm` | customer lookup, mail detail, family members, receipt email targets |
| `inventory` | on-hand checks and sale / refund postings |
| `accounts-receivable` | downstream batch close and tender summary effects |

## Proposed frontend structure

```text
apps/web/src/pages/sales/enter/
  EnterSalesPage.tsx
  useEnterSalesSession.ts
  components/
    ShiftLauncherCard.tsx
    TicketHeaderStrip.tsx
    SkuEntryPanel.tsx
    TicketLinesGrid.tsx
    TotalsRail.tsx
    ActionBar.tsx
    drawers/
      PaymentDrawer.tsx
      HeaderDrawer.tsx
      PayoutDrawer.tsx
    dialogs/
      TicketReviewDialog.tsx
      ReclaimTicketDialog.tsx
      ReprintTicketDialog.tsx
      CloseBatchDialog.tsx
```

## Proposed backend alignment

Use the governed `/api/v1/pos/*` namespace documented in `docs/modules/sales-pos/api.md`.

Service ownership:

- `bootstrapService`
- `shiftService`
- `ticketService`
- `pricingService`
- `tenderService`
- `payoutService`
- `receiptService`
- `reportService`
- `overrideService`

All backed by `app.pos_*` tables.

## Why this design is the right compromise

- It feels closer to modern POS software than the legacy four-window flow.
- It preserves the batch and drawer controls that RICS operators explicitly use.
- It respects module boundaries instead of turning Enter Sales into a monolith.
- It gives the team one place to test and rehearse the full register workflow.

## Implementation slices

1. Postgres schema and repositories
2. Shift launcher and open/close flow
3. Ticket detail canvas
4. Payment drawer and tendering
5. Header / manager drawer
6. Reclaim, reprint, payout, and close-batch dialogs
7. Report viewers and print flows

## Open questions

None that block the shape of the workflow. The remaining questions are implementation-level and already tracked in `docs/modules/sales-pos/rics-module-specs.md`.
