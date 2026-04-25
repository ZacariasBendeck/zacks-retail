# Sales POS - API

## Scope

This file defines the forward HTTP contract for Enter Sales. The current split between `/api/v1/shifts`, `/api/v1/tickets`, `/api/v1/pay-outs`, and `/api/v1/reports/pos` is transitional. The governed target is a single `/api/v1/pos/*` namespace backed by Postgres.

All responses should return numeric HNL amounts as plain numbers, not formatted currency strings.

## Bootstrap and register context

### `GET /api/v1/pos/bootstrap?storeId=&registerId=`

Loads everything the Enter Sales page needs to start.

Response shape:

```json
{
  "store": { "id": 1, "name": "Main Store" },
  "register": { "id": "uuid", "code": "A", "label": "Front Register" },
  "profile": {
    "defaultTransactionType": 1,
    "maxSplitTenders": 4,
    "postingMode": "SHIFT_POST",
    "otherChargeLabel": "Caja de Regalo"
  },
  "openShift": null,
  "tenderTypes": [],
  "payoutCategories": [],
  "promotionCodes": [],
  "returnCodes": [],
  "cashier": { "id": "uuid", "displayName": "Cashier Name" }
}
```

### `GET /api/v1/pos/registers?storeId=`

Lists active registers for the store.

## Shift endpoints

### `POST /api/v1/pos/shifts/open`

Open a register shift.

Request:

```json
{
  "storeId": 1,
  "registerId": "uuid",
  "businessDate": "2026-04-25",
  "openingCashFloat": 500,
  "openedByUserId": "uuid"
}
```

### `GET /api/v1/pos/shifts/:shiftId`

Returns shift summary, totals, and current status.

### `GET /api/v1/pos/shifts/:shiftId/cash-totals`

Returns expected drawer totals based on completed tickets and payouts.

### `POST /api/v1/pos/shifts/:shiftId/counts`

Submit count-money results.

Request:

```json
{
  "counts": [
    {
      "tenderCode": "1",
      "countedAmount": 1250,
      "detail": { "bills100": 10, "coins1": 50 }
    }
  ],
  "countedByUserId": "uuid"
}
```

### `POST /api/v1/pos/shifts/:shiftId/close`

Close the shift and calculate over/short.

Request:

```json
{
  "closedByUserId": "uuid",
  "depositAmount": 1000,
  "notes": "Night close",
  "overrideToken": "token-if-required"
}
```

### `POST /api/v1/pos/shifts/:shiftId/post`

Post a closed shift to inventory when the store uses `SHIFT_POST`.

Request:

```json
{
  "postedByUserId": "uuid"
}
```

### `GET /api/v1/pos/shifts/:shiftId/sales-journal`

Returns the register-side journal payload for print or preview.

## Ticket endpoints

### `POST /api/v1/pos/tickets`

Create a new draft ticket for the open shift.

Request:

```json
{
  "shiftId": "uuid",
  "cashierUserId": "uuid",
  "transactionType": 1,
  "clientTicketId": "uuid"
}
```

### `GET /api/v1/pos/tickets/:ticketId`

Returns the full ticket aggregate:

- header,
- lines,
- tenders,
- tax buckets,
- totals,
- event summary,
- row version.

### `PATCH /api/v1/pos/tickets/:ticketId/header`

Update the ticket header.

Request:

```json
{
  "rowVersion": 3,
  "customerId": "uuid",
  "transactionType": 7,
  "headerDiscountPct": 10,
  "promotionCode": "MADRES2026",
  "shipToState": "FM",
  "ticketComment": "Call customer on arrival"
}
```

Validation notes:

- transaction-type changes may require delegation into `customer-transactions`,
- account-required rules come from `store-ops`,
- discount changes may require an employee override token.

### `POST /api/v1/pos/tickets/:ticketId/lines`

Add a line from UPC or SKU.

Request:

```json
{
  "rowVersion": 3,
  "upc": "123456789012",
  "skuCode": null,
  "quantity": 1,
  "priceSlotCode": "RETAIL",
  "salespersonUserId": "uuid",
  "comment": null
}
```

### `PATCH /api/v1/pos/tickets/:ticketId/lines/:lineId`

Modify quantity, price slot, discount, tax flags, salesperson, comment, or return code on an existing line.

### `DELETE /api/v1/pos/tickets/:ticketId/lines/:lineId`

Remove a line from the current draft.

### `POST /api/v1/pos/tickets/:ticketId/lines/:lineId/reverse`

Shortcut for quick return entry. Flips quantity sign and enforces return-code validation.

### `POST /api/v1/pos/tickets/:ticketId/lines/:lineId/next-price`

Rotate to the next allowed price slot from `products`.

### `POST /api/v1/pos/tickets/:ticketId/tenders`

Add or replace a tender row in the payment drawer.

Request:

```json
{
  "rowVersion": 5,
  "sequence": 1,
  "tenderCode": "3",
  "amount": 980,
  "accountNumber": null,
  "referenceNumber": "AUTH123"
}
```

### `DELETE /api/v1/pos/tickets/:ticketId/tenders/:tenderId`

Remove a tender row before completion.

### `POST /api/v1/pos/tickets/:ticketId/complete`

End the sale.

Request:

```json
{
  "rowVersion": 6,
  "completedByUserId": "uuid",
  "openDrawer": true,
  "printReceipt": true,
  "emailReceipt": false
}
```

Effects:

- validates tender totals,
- transitions ticket state,
- records receipt side effects,
- posts inventory immediately or marks the ticket `PENDING_POST`,
- emits downstream events for CRM / A/R / customer-transactions integrations.

### `POST /api/v1/pos/tickets/:ticketId/continue`

Create a continued ticket chain.

Request:

```json
{
  "rowVersion": 6,
  "actorUserId": "uuid"
}
```

Response returns the child ticket id and chain summary.

### `POST /api/v1/pos/tickets/:ticketId/reclaim`

Reload a reclaimable ticket into the workspace.

### `POST /api/v1/pos/tickets/:ticketId/void`

Void a draft or completed unposted ticket.

Request:

```json
{
  "actorUserId": "uuid",
  "reason": "Customer changed mind",
  "overrideToken": "token-if-required"
}
```

### `POST /api/v1/pos/tickets/:ticketId/reprint`

Increment reprint count and return a receipt render payload.

### `POST /api/v1/pos/tickets/:ticketId/email-receipt`

Record a receipt-email request and hand it to the receipt-delivery pipeline.

### `GET /api/v1/pos/tickets/search?storeId=&ticketNumber=&status=&customerId=&source=`

Search current runtime and imported historical tickets through `app.pos_ticket_lookup_vw`.

Used for:

- reclaim,
- reprint,
- refund reference lookup.

## Payout endpoints

### `POST /api/v1/pos/payouts`

Create a payout against the current shift.

Request:

```json
{
  "shiftId": "uuid",
  "categoryCode": "PETTY",
  "amount": 75,
  "note": "Taxi",
  "createdByUserId": "uuid",
  "overrideToken": "token-if-required"
}
```

### `GET /api/v1/pos/payouts?shiftId=`

List payouts for the shift.

## Lookup endpoints owned elsewhere but consumed by Enter Sales

`sales-pos` should consume these contracts rather than duplicating them:

- `GET /api/v1/pos/skus?q=` or the eventual products-owned lookup alias for barcode / SKU search,
- `GET /api/v1/pos/skus/:skuCode/price-slots`,
- `GET /api/v1/pos/promotions`,
- `GET /api/v1/pos/return-codes`,
- `POST /api/v1/employees/sales-passwords/verify`,
- `POST /api/v1/employees/sales-passwords/consume-token`,
- CRM customer search / account endpoints,
- customer-transactions validation endpoints for transaction types 3-8.

## Report endpoints

### `GET /api/v1/pos/reports/sales-tax-recap`

Query params:

- `storeId`
- `from`
- `to`
- `mode=STORE_STATE|STATE_STORE`
- `source=TOTALS|LINES`

### `GET /api/v1/pos/reports/sales-by-day`

Query params:

- `storeId`
- `from`
- `to`
- `compareMode=52W|NDAYS|NWEEKS`
- `compareValue`
- `weekEndsOn`

### `GET /api/v1/pos/reports/returned-sales`

Query params:

- `from`
- `to`
- `storeId`
- `sort=SKU|CATEGORY|VENDOR|CASHIER|SALESPERSON|RETURN_CODE`
- `includePrice`
- `trackableOnly`

### `GET /api/v1/pos/reports/promotion-code-analysis`

Query params:

- `from`
- `to`
- `storeId`
- `promotionCode`
- `combineStores`

### `GET /api/v1/pos/reports/reprint-posted-sales`

Query params:

- `storeId`
- `from`
- `to`
- `specialOnly`

### `GET /api/v1/pos/reports/reprint-posted-ticket`

Query params:

- `storeId`
- `ticketNumber`
- `date`
- `giftReceipt`

## Error model

Use typed error codes rather than generic validation strings. Minimum set:

- `SHIFT_NOT_FOUND`
- `SHIFT_ALREADY_OPEN`
- `SHIFT_NOT_OPEN`
- `SHIFT_NOT_CLOSABLE`
- `REGISTER_NOT_FOUND`
- `TICKET_NOT_FOUND`
- `TICKET_ALREADY_COMPLETED`
- `TICKET_ALREADY_VOIDED`
- `TICKET_HAS_NO_LINES`
- `MAX_SPLIT_TENDERS_EXCEEDED`
- `INSUFFICIENT_TENDER`
- `SKU_NOT_FOUND`
- `RETURN_CODE_REQUIRED`
- `CUSTOMER_REQUIRED`
- `OVERRIDE_REQUIRED`
- `OVERRIDE_INVALID`
- `TRANSACTION_TYPE_INVALID`
- `POSTING_NOT_ALLOWED`

## Compatibility note

Existing `/api/v1/shifts`, `/api/v1/tickets`, `/api/v1/pay-outs`, and `/api/v1/reports/pos` handlers can remain during migration, but they should become thin compatibility wrappers over the same Postgres-backed service layer. They must not continue to point at SQLite once the governed runtime lands.
