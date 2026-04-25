# 6. Sales / POS

> **Status:** Draft
> **Module spec:** [../modules/sales-pos/README.md](../modules/sales-pos/README.md)
> **RICS ancestry:** Ch. 2 (register core), Ch. 13 (customer-facing register flow only; sync infrastructure not ported)
> **Last updated:** 2026-04-25

## What this module does

Sales / POS is the register. Cashiers open a shift, create tickets, add or remove items, collect tender, print or mail receipts, and move to the next customer. Managers use the same workspace to approve sensitive actions, record payouts, reclaim and reprint tickets, count money, close the batch, and post the day's sales to inventory.

The Enter Sales workflow is one browser workspace with drawers for Payment and Change Header / Manager actions. It still preserves the RICS batch and tender behavior, but it no longer depends on separate Windows screens.

## Audience

- **Cashiers** - ring tickets, tender sales, continue or reclaim tickets, process returns.
- **Shift managers** - approve overrides, record payouts, count money, close the batch, approve over/short.
- **Accounting** - read the Sales Journal, Sales Tax Recap, Sales by Day, Returned Sales, and Promotion Code Analysis outputs.

## Prerequisites

- [Products](products.md) - SKU, UPC, prices, price slots, promotion codes, return codes.
- [Employees](employees.md) - cashier identity, permissions, override passwords / tokens.
- [Store Operations](store-ops.md) - store profile, tax setup, tender types, payout categories.
- [Customer Transactions](customer-transactions.md) - transaction types 3 through 8.
- [CRM](crm.md) - customer lookup, mail detail, family members, receipt email delivery.

## Screens

### Enter Sales launcher

Shows:

- store,
- register,
- current batch,
- last ticket number,
- business date,
- opening cash float,
- Enter Sales / Exit / Manager actions.

Use this screen to open or resume the register shift.

### Ticket detail workspace

This is the main cashier screen.

Functions:

- scan UPC or type SKU,
- select size / row / column,
- set quantity,
- reverse quantity for returns,
- rotate `Next Price`,
- apply line discount or amount,
- toggle line tax flags,
- assign salesperson,
- add line comment,
- review current ticket lines,
- save and scan the next SKU,
- move to tender,
- void or clear the ticket,
- open Change Header.

### Ticket payment drawer

Shows:

- subtotal,
- `15% ISV`,
- `ISV.Ad`,
- other charges / gift box,
- total due,
- up to four tender rows,
- total tender,
- change,
- promo code,
- ticket comment.

Actions:

- `End Sale`
- `Add More SKUs`
- `Void`
- `Clear`
- `Mail Detail`

### Change Ticket Header / Manager drawer

Shows:

- ticket number,
- cashier,
- transaction type,
- customer,
- discount percent,
- ship-to state,
- promo code.

Actions:

- `Save / SKU Detail`
- `Mail Detail`
- `Manager Options`
- `UPC Price Scan`
- `Payouts`
- `Close Batch`
- `Reclaim Ticket`
- `Reprint Ticket`
- `Mail List`
- `Exit`

## Common tasks

### Open a shift

1. Go to Enter Sales.
2. Choose store and register.
3. Confirm business date and current batch.
4. Enter opening cash float if required.
5. Open the shift.

### Ring a regular sale

1. Scan or enter the SKU on the ticket detail workspace.
2. Confirm size, quantity, and price.
3. Add more lines as needed.
4. Select `Save/Tender`.
5. Enter the tender rows.
6. Select `End Sale`.

### Ring a mixed-tender sale

1. Build the ticket normally.
2. Open the payment drawer.
3. Fill up to four tender rows.
4. Confirm total tender and change.
5. End the sale.

### Continue and reclaim a ticket

1. In the payment drawer, use tender `99` / Continued Ticket.
2. The system saves the ticket chain as continued instead of completed.
3. Later, open `Reclaim Ticket` from the header / manager drawer.
4. Select the ticket and continue working.

### Change header information

1. Open `Change Header`.
2. Update customer, transaction type, discount, ship-to state, or promo code.
3. Save and return to SKU detail.

### Record a payout and close the batch

1. Open `Payouts` from the header / manager drawer.
2. Choose category, amount, and note.
3. When the shift is done, open `Close Batch`.
4. Count money by tender type.
5. Confirm expected cash, deposit, and over/short.
6. Close the shift and post if required.

## Reports

| Report | Where | Filters | Exports |
|---|---|---|---|
| Sales Journal | Shift close / reports | Shift, store, date range | Print / PDF |
| Sales Tax Recap | POS reports | Store, date range, summary mode | Print / PDF |
| Sales by Day | POS reports | Store, date range, compare mode | Print / CSV |
| Returned Sales | POS reports | Date range, store, return code, cashier, salesperson | Print / CSV |
| Promotion Code Analysis | POS reports | Promotion code, store, date range | Print / CSV |
| Reprint Posted Sales | POS reports | Store, date range, ticket number | Print |

## Keyboard shortcuts

Confirmed shortcuts the web Enter Sales flow keeps:

- `Enter` / `Tab` - move forward through fields.
- `Shift+Tab` - move backward.
- `1` - Cash tender.
- `2` - Check tender.
- `3` - Card / Creditomatic tender.
- `4` - Secondary currency or store-configured tender.
- `7` - Credit slip tender.
- `9` - House charge tender.
- `10` - Gift card tender.
- `11` - Store credit tender.
- `99` - Continued ticket.
- `Esc` - close the active drawer or dialog.

## Common errors

- **Shift not open** - you must open or resume a shift before creating tickets.
- **Customer required** - the selected transaction type or tender requires a customer account.
- **Override required** - the action needs manager approval through the employee sales-password flow.
- **Insufficient tender** - total tender is less than the amount due.
- **Return code required** - negative-quantity return lines need a return code when tracking is enabled.
- **Ticket cannot be reclaimed** - only reclaimable current-batch tickets can be re-opened.
- **Shift cannot close** - draft tickets or unresolved count-money issues still exist.

## Data sources

During Development Against Direct CSV Imports:

- **Operational runtime:** Postgres `app.pos_*` tables.
- **Shared baselines:** `app.store_master`, `app.sku`, `app.customer`, `app.sales_history_ticket`, `app.sales_history_ticket_line`, and the relevant taxonomy tables.
- **No request-path MDB reads**
- **No register-local database writes**

## Related modules

- [Products](products.md) - pricing and SKU lookup.
- [Customer Transactions](customer-transactions.md) - special orders, layaways, gift cards, house charges.
- [CRM](crm.md) - customer search, mail detail, mail list, family members.
- [Inventory](inventory.md) - post sales and returns to stock movement history.
- [Sales Reporting](sales-reporting.md) - longer-range reporting outside the register core.

## What's different from RICS

- Enter Sales is one browser workspace instead of four separate Windows screens.
- Payment, header changes, payouts, reclaim, and close-batch actions open as drawers or dialogs instead of switching windows.
- Manager approvals are tied to employee identity and permissions, not only to shared store passwords.
- The workflow keeps explicit batch controls, continuation, payouts, and posting visibility, because operators still need them.
- Amounts are shown as plain HNL numbers with no `$` or `USD` formatting.
