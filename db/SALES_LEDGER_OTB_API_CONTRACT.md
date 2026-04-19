# Sales Ledger + OTB SKU Lines API Contract

Canonical contract for frontend table endpoints that are still running with mock fallbacks.

## 1) Endpoint Paths

- `GET /api/v1/sales/ledger`
- `GET /api/v1/otb/lines`

Both endpoints return the standard server-table envelope:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

## 2) Query Contract

### 2.1 Common pagination/sort params

- `page` (`integer`, default `1`, min `1`)
- `pageSize` (`integer`, default `50`, min `1`, max `200`)
- `sort` (`string`, enum by endpoint whitelist)
- `order` (`asc | desc`, endpoint default when omitted)

### 2.2 Sales ledger query params

- `startDate` (`YYYY-MM-DD`, optional, inclusive)
- `endDate` (`YYYY-MM-DD`, optional, inclusive)
- `department` (`FORMAL | CASUAL | FIESTA | SANDALIAS | BOOTS | COMFORT`, optional)
- `category` (`integer`, optional, `556-599`, RICS code)
- `channel` (`STORE | ONLINE | WHOLESALE`, optional)
- `skuCode` (`string`, optional, case-insensitive contains)
- `style` (`string`, optional, case-insensitive contains)

Default sort:

- `sort=saleDate`
- `order=desc`

### 2.3 OTB SKU lines query params

- `year` (`integer`, optional, default current year)
- `month` (`integer`, optional, `1-12`, default current month)
- `department` (`FORMAL | CASUAL | FIESTA | SANDALIAS | BOOTS | COMFORT`, optional)
- `category` (`integer`, optional, `556-599`, RICS code)
- `skuCode` (`string`, optional, case-insensitive contains)
- `style` (`string`, optional, case-insensitive contains)

Default sort:

- `sort=openToBuyUnits`
- `order=asc`

## 3) Response Field Contract

### 3.1 Sales ledger row

```json
{
  "id": "sale_txn_uuid",
  "saleDate": "2026-04-05T13:34:45Z",
  "channel": "STORE",
  "skuCode": "BRA-STY-COL-SZ",
  "style": "Pump 90",
  "department": "FORMAL",
  "category": 560,
  "unitsSold": 3,
  "netRevenue": 189.99
}
```

Type notes:

- `category` is the business RICS code (`556-599`) in responses and filters.
- `netRevenue` is row-level net amount in base currency.
- `channel` is required in payload even when source systems are single-channel.

### 3.2 OTB SKU line row

```json
{
  "id": "otb_budget_uuid:sku_uuid",
  "skuCode": "BRA-STY-COL-SZ",
  "style": "Pump 90",
  "department": "FORMAL",
  "category": 560,
  "budgetUnits": 80,
  "actualUnits": 42,
  "onOrderUnits": 15,
  "openToBuyUnits": 23
}
```

Type notes:

- `openToBuyUnits` is computed server-side as `budgetUnits - actualUnits - onOrderUnits`.
- `budgetUnits` is sourced from an explicit SKU-level OTB allocation model (see section 5).

## 4) OpenAPI Whitelists

### 4.1 Sales ledger sort whitelist

- `saleDate`
- `channel`
- `skuCode`
- `style`
- `department`
- `category`
- `unitsSold`
- `netRevenue`

### 4.2 Sales ledger filter whitelist

- `startDate`
- `endDate`
- `department`
- `category`
- `channel`
- `skuCode`
- `style`

### 4.3 OTB lines sort whitelist

- `skuCode`
- `style`
- `department`
- `category`
- `budgetUnits`
- `actualUnits`
- `onOrderUnits`
- `openToBuyUnits`

### 4.4 OTB lines filter whitelist

- `year`
- `month`
- `department`
- `category`
- `skuCode`
- `style`

## 5) Data Model + Performance Notes (Implementation Requirements)

### 5.1 Sales ledger read model

- Use transaction grain from `sales_transactions` joined with `skus` and `ref_categories`.
- Channel projection rule:
  - if source channel mapping exists, map to `STORE | ONLINE | WHOLESALE`
  - otherwise return `STORE` as canonical fallback (never `null`)

Required/expected indexes:

- Existing: `idx_sales_transactions_sku_sold_at_v011` (`sales_transactions(sku_id, sold_at DESC)`)
- Add for date-first scans: `sales_transactions(sold_at DESC, sku_id)`
- Keep using `idx_skus_department_category` for department/category filtering path.

### 5.2 OTB SKU lines read model

SKU-level `budgetUnits` is not derivable from current `otb_budgets` alone. Implementation should add a persisted allocation table and read view:

- New table (migration): `otb_sku_plan_lines`
  - `id` (PK)
  - `otb_budget_id` (FK -> `otb_budgets.id`)
  - `sku_id` (FK -> `skus.id`)
  - `budget_units` (`INTEGER >= 0`)
  - `UNIQUE(otb_budget_id, sku_id)`
- Read model/view: `v_otb_sku_lines`
  - joins OTB budget period + SKU plan + actual sold units + open PO units
  - outputs exactly the section 3.2 payload fields

Required/expected indexes:

- `otb_sku_plan_lines(otb_budget_id, sku_id)` unique index
- `otb_sku_plan_lines(sku_id)`
- `purchase_order_lines(sku_id, po_id)`
- `purchase_orders(status, created_at DESC)`

Materialization guidance:

- SQLite local/dev: plain `VIEW` is acceptable.
- Staging/prod with larger volume: promote to materialized snapshot table refreshed by receipt/PO/sales events or scheduled job.
