# Sales Ticket MDB To App Coverage

Last reviewed: 2026-04-27

## Purpose

This is the field-level coverage list for legacy sales ticket data coming from the RICS sales MDB into the Zack's Retail app database.

Current conclusion: the conversion upload does not preserve every raw sales ticket field from the MDB as its own app DB column. It uploads a normalized sales history baseline into `app.sales_history_ticket` and `app.sales_history_ticket_line`, then derives customer KPI tables from that baseline. Several RICS ticket header/detail fields are used only as filters or joins, and several are not preserved at all yet.

This document should be used when testing whether cutover has enough sales-ticket detail for reporting, customer history, refunds, tax review, gift certificates, direct-ship review, and operator audit workflows.

## Source Files And Tables

| Source | Table / CSV | Current use |
|---|---|---|
| `RITRNSSV.MDB` | `TicketHeader` -> `crm/ticket_header.csv` | Main sales ticket header source for the conversion bundle. |
| `RITRNSSV.MDB` | `TicketDetail` -> `crm/ticket_detail.csv` | Main sales ticket line source for the conversion bundle. |
| `RITRNSSV.MDB` | `TicketTender` -> `legacy/ticket_tender.csv` | Canonical MDB extraction includes this table, but the current `import:customer-transactions:rics` path does not load tender rows into app sales history. |
| `RIMAILED.MDB` | `Mail Purch Detail`, `Mail Tender Detail`, `Mail Ticket Detail`, `Mail Comment Detail` | Exported in the canonical MDB list, but not loaded by the sales-history importer because it is treated as a customer-indexed duplicate/derivative of `RITRNSSV`. |

The conversion bundle location for these CSVs is:

```text
<bundle-dir>/crm/ticket_header.csv
<bundle-dir>/crm/ticket_detail.csv
<bundle-dir>/legacy/ticket_tender.csv
```

The header/detail field names below use the current importer CSV/staging names. They correspond to the MDB fields scanned from `RITRNSSV.MDB` with original Access casing, for example `UserID`, `BatchDate`, `TransType`, `MarketingCode`, `DiscPct`, and `ReturnCode`.

## Current Import Scope

The current importer is `apps/api/scripts/customers/import-customer-transactions-from-rics.ts`.

It imports only headers where:

| Rule | Meaning |
|---|---|
| `posted = Y` | Unposted/in-progress tickets are excluded. |
| `voided` is not true/yes/1/Y | Voided tickets are excluded. |
| `trans_type in (1,2,3,4)` | Regular sale, user-defined, special-order pickup, layaway sale are included. Transaction types 5-8 are not imported by this path. |
| `store`, `ticket`, and a usable date are present | Rows missing required ticket identity/date fields are excluded. |

It imports only detail lines where:

| Rule | Meaning |
|---|---|
| Line is not classified as a discount-only line | Discount/coupon-like pseudo-SKUs are rolled into discount totals, not inserted as separate app line rows. |
| `sku` is present | Blank-SKU lines are excluded from `app.sales_history_ticket_line`. |
| `qty <> 0 OR extension <> 0` | Empty rows are excluded. |

## Summary

| Source table | Source fields | Used by current importer | Retained as app columns | Pending full-field coverage |
|---|---:|---:|---:|---:|
| `TicketHeader` | 31 | 12 | 7 direct fields plus derived totals/status/date/id | 19 |
| `TicketDetail` | 47 | 18 | 12 direct fields plus derived amounts/flags | 29 |
| `TicketTender` | 15 | 0 | 0 | 15 |

Counts above mean field coverage, not row coverage. "Retained as app columns" means the specific source value is preserved in an app-owned destination column. A field can be "used" without being preserved raw, for example `posted` is used as an inclusion filter but not stored in the app DB.

## App DB Tables Assigned

These are the current app-owned destinations for the uploaded sales ticket data:

| App table | Purpose | Source / derivation |
|---|---|---|
| `app.sales_history_ticket` | Imported completed historical ticket headers/facts. | Built from `ticket_header.csv` plus line rollups from `ticket_detail.csv`. |
| `app.sales_history_ticket_line` | Imported historical merchandise line rows. | Built from `ticket_detail.csv`, joined to `app.sales_history_ticket` by generated external transaction id. |
| `app.customer_metrics` | Derived customer metrics. | Refreshed after ticket import unless `--skip-metrics` is used. |
| `app.customer_features_current` | Derived current customer feature row. | Refreshed after ticket import unless `--skip-metrics` is used. |
| `app.customer_category_features` | Derived customer/category affinity rows. | Refreshed from imported sales history. |
| `app.customer_brand_features` | Derived customer/brand affinity rows. | Refreshed from imported sales history. |
| `app.customer_size_profiles` | Derived customer/size affinity rows. | Refreshed from imported sales history. |

## Header Field Coverage

| MDB / CSV field | Current app destination | Usage | Status |
|---|---|---|---|
| `user_id` | `app.sales_history_ticket.external_transaction_id` | Part of generated id and header/detail join key. | Used, not retained as its own app column. |
| `batch_date` | `app.sales_history_ticket.purchased_at`, `external_transaction_id` | Fallback date and join/id input. | Used, not retained raw. |
| `use_date` | None | No current import use. | Pending. |
| `terminal` | `app.sales_history_ticket.terminal`, `external_transaction_id` | Register/terminal identity and id input. | Uploaded. |
| `store` | `app.sales_history_ticket.store_id`, `external_transaction_id` | Store identity and id input. | Uploaded. |
| `ticket` | `app.sales_history_ticket.ticket_number`, `external_transaction_id` | Legacy ticket number and id input. | Uploaded. |
| `real_date` | `app.sales_history_ticket.purchased_at`, `external_transaction_id` | Primary purchase timestamp and id input. | Uploaded as timestamp, not retained raw. |
| `cashier` | `app.sales_history_ticket.cashier_code` | Legacy cashier code. | Uploaded. |
| `trans_type` | `app.sales_history_ticket.transaction_type`, `external_transaction_id` | Transaction type and inclusion filter. | Uploaded. |
| `account` | `app.sales_history_ticket.account_key`, `matched_customer_id` | Preserves account key and attempts match to `app.customer`. | Uploaded. |
| `tax_01` | None | Header tax flag/code not currently stored. | Pending. |
| `tax_02` | None | Header tax flag/code not currently stored. | Pending. |
| `tax_03` | None | Header tax flag/code not currently stored. | Pending. |
| `tax_change` | None | Tax override/change indicator not currently stored. | Pending. |
| `oth_chg` | None | Other charge amount not currently stored. | Pending. |
| `prev_paid` | None | Prior paid amount for layaway/special-order/payment flows not currently stored. | Pending. |
| `comment` | None | Header comment not currently stored. | Pending. |
| `change_amount` | None | Tender change not currently stored. | Pending. |
| `alt_change` | None | Alternate tender/currency change not currently stored. | Pending. |
| `exch_rate` | None | Exchange rate not currently stored. | Pending. |
| `discount` | None | Header discount field not retained; app discount amount is derived from line data. | Pending raw coverage. |
| `apply_to` | None | Apply-to ticket/account reference not currently stored. | Pending. |
| `apply_tender` | None | Apply tender not currently stored. | Pending. |
| `apply_amount` | None | Apply amount not currently stored. | Pending. |
| `ship_state` | None | Ship/tax state not currently stored. | Pending. |
| `ship_county` | None | Ship/tax county not currently stored. | Pending. |
| `ship_city` | None | Ship/tax city not currently stored. | Pending. |
| `marketing_code` | `app.sales_history_ticket.promotion_code` | Promotion/marketing code. | Uploaded. |
| `voided` | None | Used to exclude voided tickets. | Used as filter, not retained. |
| `printed` | None | Printed flag not currently stored. | Pending. |
| `posted` | None | Used to include only posted tickets. | Used as filter, not retained. |

## Detail Field Coverage

| MDB / CSV field | Current app destination | Usage | Status |
|---|---|---|---|
| `user_id` | None | Header/detail join key. | Used, not retained. |
| `batch_date` | None | Header/detail join key. | Used, not retained. |
| `use_date` | None | No current import use. | Pending. |
| `terminal` | None | Header/detail join key. | Used, not retained on line. |
| `store` | None | Header/detail join key. | Used, not retained on line. |
| `ticket` | None | Header/detail join key. | Used, not retained on line. |
| `real_date` | None | Header/detail join key. | Used, not retained on line. |
| `line_no` | `app.sales_history_ticket_line.line_number` | Legacy line number. | Uploaded. |
| `sku` | `app.sales_history_ticket_line.sku_code`, `sku_id` | SKU code and optional match to `app.sku`. | Uploaded. |
| `column_label` | `app.sales_history_ticket_line.column_label`, `size_type`, `size_value` | Size/grid column. | Uploaded. |
| `row_label` | `app.sales_history_ticket_line.row_label`, `size_type`, `size_value` | Size/grid row. | Uploaded. |
| `qty` | `app.sales_history_ticket_line.quantity`, `is_return` | Quantity and return classification. | Uploaded. |
| `price` | `app.sales_history_ticket_line.unit_price`, `discount_amount` derivation | Unit price and discount calculation input. | Uploaded. |
| `disc_pct` | None | Discount percent not currently stored. | Pending. |
| `disc_amt` | None | Staged, but not directly stored; final discount amount is derived from price/extension and discount-line logic. | Pending raw coverage. |
| `perks` | None | Perks indicator not currently stored. | Pending. |
| `salesperson` | `app.sales_history_ticket_line.salesperson_code` | Legacy salesperson code. | Uploaded. |
| `fam_member` | None | Customer family/member attribution not currently stored. | Pending. |
| `prices_01` | None | Price slot 1 snapshot not currently stored. | Pending. |
| `prices_02` | None | Price slot 2 snapshot not currently stored. | Pending. |
| `prices_03` | None | Price slot 3 snapshot not currently stored. | Pending. |
| `prices_04` | None | Price slot 4 snapshot not currently stored. | Pending. |
| `ovs_amt` | None | Override/special amount not currently stored. | Pending. |
| `this_ovs_amt` | None | Current-line override amount not currently stored. | Pending. |
| `category` | `app.sales_history_ticket_line.category_key` | Legacy category key. | Uploaded. |
| `vendor` | `app.sales_history_ticket_line.brand_key` | Legacy vendor key used as brand key. | Uploaded. |
| `real_price` | None | Real price snapshot not currently stored. | Pending. |
| `extension` | `app.sales_history_ticket_line.net_amount`, header rollups | Net line amount and ticket totals. | Uploaded. |
| `orig_ticket` | None | Original ticket reference not currently stored. | Pending. |
| `tax_01` | None | Line tax flag/code not currently stored. | Pending. |
| `tax_02` | None | Line tax flag/code not currently stored. | Pending. |
| `tax_03` | None | Line tax flag/code not currently stored. | Pending. |
| `taxamt_01` | None | Line tax amount 1 not currently stored. | Pending. |
| `taxamt_02` | None | Line tax amount 2 not currently stored. | Pending. |
| `taxamt_03` | None | Line tax amount 3 not currently stored. | Pending. |
| `fb_gen` | None | Frequent-buyer generated flag/value not currently stored. | Pending. |
| `ds_ship_code` | None | Direct-ship code not currently stored. | Pending. |
| `ds_ship_desc` | None | Direct-ship description not currently stored. | Pending. |
| `ds_dest_code` | None | Direct-ship destination not currently stored. | Pending. |
| `ds_dye_code` | None | Direct-ship dye code not currently stored. | Pending. |
| `ds_ship_chg` | None | Direct-ship charge not currently stored. | Pending. |
| `return_code` | `app.sales_history_ticket_line.return_code`, `is_return` | Return reason/classification. | Uploaded. |
| `gift_cert` | None | Gift certificate id/reference not currently stored. | Pending. |
| `gift_seq` | None | Gift certificate sequence not currently stored. | Pending. |
| `gift_acct` | None | Gift certificate account not currently stored. | Pending. |
| `cost` | `app.sales_history_ticket_line.unit_cost`, `cost_amount`, header `cost_amount` | Unit and extended cost. | Uploaded. |
| `comment` | None | Line comment not currently stored. | Pending. |

## Tender Field Coverage

`TicketTender` is part of the canonical `RITRNSSV.MDB` sales ticket record set. It is extracted by the canonical MDB artifact path, but the current sales-history import does not load it into app-owned historical tender tables.

Some tender fields duplicate the same ticket identity already stored from `TicketHeader`, such as store and ticket number. The status below answers a narrower question: whether the `TicketTender` row and that tender-specific source value are preserved. Today they are not, because no app tender-history table exists yet.

| MDB field | Current app destination | Usage | Status |
|---|---|---|---|
| `UserID` | None from `TicketTender` | Same ticket identity value is used from `TicketHeader` for the historical ticket. No tender row is stored. | Pending tender-row preservation. |
| `BatchDate` | None from `TicketTender` | Same ticket identity/date value is used from `TicketHeader` for the historical ticket. No tender row is stored. | Pending tender-row preservation. |
| `UseDate` | None | No current import use. | Pending. |
| `Terminal` | None from `TicketTender` | Same ticket identity value is stored from `TicketHeader` as `app.sales_history_ticket.terminal`. No tender row is stored. | Pending tender-row preservation. |
| `Store` | None from `TicketTender` | Store is already stored from `TicketHeader` as `app.sales_history_ticket.store_id`. No tender row is stored. | Pending tender-row preservation. |
| `Ticket` | None from `TicketTender` | Ticket number is already stored from `TicketHeader` as `app.sales_history_ticket.ticket_number`. No tender row is stored. | Pending tender-row preservation. |
| `RealDate` | None from `TicketTender` | Purchase timestamp is already stored from `TicketHeader` as `app.sales_history_ticket.purchased_at`. No tender row is stored. | Pending tender-row preservation. |
| `Tender` | None | Tender type/code not currently stored. | Pending. |
| `Amount` | None | Tender amount not currently stored. | Pending. |
| `AltAmount` | None | Alternate tender/currency amount not currently stored. | Pending. |
| `AltCurrency` | None | Alternate currency/tender marker not currently stored. | Pending. |
| `ExchRate` | None | Exchange rate not currently stored. | Pending. |
| `GiftCert` | None | Gift certificate tender id not currently stored. | Pending. |
| `GiftSeq` | None | Gift certificate tender sequence not currently stored. | Pending. |
| `GiftNew` | None | Gift certificate new/issued marker not currently stored. | Pending. |

## App Table Assignment Detail

### `app.sales_history_ticket`

| App column | Source / derivation |
|---|---|
| `external_transaction_id` | Generated from `RITRNSSV`, `store`, `ticket`, `real_date`, `terminal`, `user_id`, `trans_type`. |
| `source` | Import argument, default `rics_ticket_import`. |
| `matched_customer_id` | Lookup from `TicketHeader.account` to `app.customer.rics_account` or `app.customer.rics_code`. |
| `account_key` | `TicketHeader.account`. |
| `transaction_type` | `TicketHeader.trans_type`. |
| `transaction_kind` | Derived from line mix; `return` only when no positive merchandise lines and return lines exist, otherwise `purchase`. |
| `status` | Constant `completed` for imported rows. |
| `store_id` | `TicketHeader.store`. |
| `terminal` | `TicketHeader.terminal`. |
| `ticket_number` | `TicketHeader.ticket`. |
| `cashier_code` | `TicketHeader.cashier`. |
| `channel` | Constant `store`. |
| `promotion_code` | `TicketHeader.marketing_code`. |
| `coupon_code` | Always `NULL` in current importer. |
| `total_amount` | Derived from absolute net line extension plus line discount/discount-line amounts. |
| `net_amount` | Sum of `TicketDetail.extension`. |
| `cost_amount` | Sum of `TicketDetail.cost * qty`. |
| `discount_amount` | Derived from `(qty * price) - extension` plus discount-line logic. |
| `purchased_at` | `TicketHeader.real_date`, fallback to `batch_date`, interpreted in `America/Guatemala`. |

### `app.sales_history_ticket_line`

| App column | Source / derivation |
|---|---|
| `ticket_id` | Match to inserted `app.sales_history_ticket.external_transaction_id`. |
| `line_number` | `TicketDetail.line_no`. |
| `sku_id` | Lookup from `TicketDetail.sku` to `app.sku.code`. |
| `sku_code` | `TicketDetail.sku`. |
| `category_id` | Always `NULL` in current importer. |
| `category_key` | `TicketDetail.category`, excluding blank/zero values. |
| `brand_id` | Always `NULL` in current importer. |
| `brand_key` | `TicketDetail.vendor`, excluding blank/zero values. |
| `column_label` | `TicketDetail.column_label`. |
| `row_label` | `TicketDetail.row_label`. |
| `size_type` | `app.sku.size_type` when available, otherwise `RICS_CELL` if row/column labels exist. |
| `size_value` | `column_label/row_label` joined with `/`. |
| `quantity` | `TicketDetail.qty`. |
| `unit_price` | `TicketDetail.price`. |
| `unit_cost` | `TicketDetail.cost`. |
| `net_amount` | `TicketDetail.extension`. |
| `cost_amount` | `TicketDetail.cost * qty`. |
| `discount_amount` | Derived line discount amount. |
| `is_markdown` | Constant `false` in current importer. |
| `is_return` | Derived from ticket kind, negative quantity, and/or `return_code`. |
| `return_code` | `TicketDetail.return_code`. |
| `salesperson_code` | `TicketDetail.salesperson`. |

## Gaps That Must Be Added For Full Sales Ticket Upload

The following data is not fully uploaded to the app DB today:

| Area | Missing data |
|---|---|
| Tenders | `TicketTender` is not loaded into app-owned historical tender tables. Split tenders, house charge tender, gift certificate tender, check/card tender detail, and change attribution are not preserved from the historical MDB upload. |
| Header tax/charges | Header `tax_01`, `tax_02`, `tax_03`, `tax_change`, `oth_chg`, `prev_paid`, `change_amount`, `alt_change`, `exch_rate`, `discount`, apply-to fields, and shipping/tax location fields are not stored. |
| Header comments/audit flags | Header `comment`, `printed`, raw `posted`, and raw `voided` are not retained. `posted`/`voided` are only filters. |
| Line tax | Line `tax_01`, `tax_02`, `tax_03`, `taxamt_01`, `taxamt_02`, `taxamt_03` are not stored. |
| Line discounts/price snapshots | `disc_pct`, raw `disc_amt`, `prices_01` through `prices_04`, `real_price`, `ovs_amt`, and `this_ovs_amt` are not preserved. |
| CRM/family/perks | `perks`, `fam_member`, and `fb_gen` are not stored. |
| Direct ship | `ds_ship_code`, `ds_ship_desc`, `ds_dest_code`, `ds_dye_code`, `ds_ship_chg` are not stored. |
| Gift certificate line data | `gift_cert`, `gift_seq`, and `gift_acct` are not stored. |
| Original ticket references | `orig_ticket` and header `apply_to` are not stored, limiting historical refund/layaway/special-order tracing. |
| Comments | Line and header comments are not stored. |
| Excluded transaction types | Header `trans_type` 5, 6, 7, and 8 are excluded from this import path, even though `customer-transactions` needs those flows for full RICS parity. |

## Recommendation

To make the sales ticket upload complete, add an app-owned raw preservation layer next to the normalized sales history tables.

Minimum recommended target:

| New table | Purpose |
|---|---|
| `app.sales_history_ticket_legacy_raw` | One row per imported `TicketHeader`, preserving every source header field plus source file/run metadata. |
| `app.sales_history_ticket_line_legacy_raw` | One row per imported `TicketDetail`, preserving every source detail field plus source file/run metadata. |
| `app.sales_history_ticket_tender_legacy_raw` | One row per imported `TicketTender`, preserving every source tender field plus source file/run metadata. |

Then expand normalized tables only where the application needs first-class query fields, for example tax buckets, tender rows, comments, direct-ship fields, gift certificate references, layaway/special-order references, and family-member attribution.

This avoids losing raw RICS cutover evidence while keeping the app's operational model clean.
