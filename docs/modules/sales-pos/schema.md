# Sales POS - Schema

## Schema home

`sales-pos` owns runtime register data in the `app` schema.

| Schema | Role | Notes |
|---|---|---|
| `app` | Module-owned Enter Sales runtime and imported sales history baselines | New `pos_*` tables land here. |
| `public` | Shared identity and auth | `public.user` supplies cashier / manager / salesperson references. |
| `app` (existing shared baselines) | Imported or module-owned dependencies | `store_master`, `sku`, `customer`, `sales_history_ticket`, `sales_history_ticket_line`, `inventory`, `taxonomy_return_code`, `taxonomy_promotion_code`. |

New `sales-pos` work does **not** add tables to SQLite and does **not** depend on `rics_mirror`.

## Reused existing tables

The new runtime reuses these existing tables rather than duplicating them:

| Table | Why it is reused |
|---|---|
| `app.store_master` | Store identity, addresses, and legacy last-ticket baseline. |
| `app.sku` | Product identity for ticket lines. |
| `app.customer` | Customer account linkage. |
| `app.sales_history_ticket` | Historical refund / reprint / reporting lookup. |
| `app.sales_history_ticket_line` | Historical line reference for returns and reports. |
| `app.taxonomy_return_code` | Return-code catalog. |
| `app.taxonomy_promotion_code` | Promotion-code catalog. |
| `app.inventory` and `app.inventory_audit_log` | Inventory posting destination. |
| `public.user` | Cashier, manager, and salesperson references. |

## New tables

### `app.pos_store_profile`

Register behavior that belongs to the sales module, not general store identity.

```sql
CREATE TABLE app.pos_store_profile (
  store_id                     SMALLINT PRIMARY KEY REFERENCES app.store_master(number),
  default_transaction_type     SMALLINT NOT NULL DEFAULT 1,
  max_split_tenders            SMALLINT NOT NULL DEFAULT 4,
  posting_mode                 TEXT NOT NULL CHECK (posting_mode IN ('REALTIME','SHIFT_POST')),
  allow_header_discount        BOOLEAN NOT NULL DEFAULT true,
  allow_line_discount          BOOLEAN NOT NULL DEFAULT true,
  allow_tax_override           BOOLEAN NOT NULL DEFAULT true,
  continued_tender_code        TEXT NOT NULL DEFAULT '99',
  cash_tender_code             TEXT NOT NULL DEFAULT '1',
  over_short_limit             NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_charge_label           TEXT NOT NULL DEFAULT 'Other Charges',
  receipt_email_enabled        BOOLEAN NOT NULL DEFAULT true,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Notes:

- Tender codes still come from `store-ops`; this table only records the register behavior that points at them.
- `posting_mode` replaces the old ambiguity around "Automatically Post".

### `app.pos_register`

Browser/register identity under a store.

```sql
CREATE TABLE app.pos_register (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                     SMALLINT NOT NULL REFERENCES app.store_master(number),
  code                         TEXT NOT NULL,
  label                        TEXT NOT NULL,
  active                       BOOLEAN NOT NULL DEFAULT true,
  drawer_mode                  TEXT NOT NULL DEFAULT 'NONE'
                                 CHECK (drawer_mode IN ('NONE','USB','NETWORK','PRINTER_TRIGGER')),
  receipt_profile_code         TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, code)
);
```

### `app.pos_shift`

Open/close batch lifecycle for one register.

```sql
CREATE TABLE app.pos_shift (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                     SMALLINT NOT NULL REFERENCES app.store_master(number),
  register_id                  UUID NOT NULL REFERENCES app.pos_register(id),
  business_date                DATE NOT NULL,
  batch_number                 INTEGER NOT NULL,
  status                       TEXT NOT NULL CHECK (status IN ('OPEN','COUNTING','CLOSED','POSTED','VOIDED')),
  opened_by_user_id            UUID NOT NULL REFERENCES public.user(id),
  opened_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  opening_cash_float           NUMERIC(14,2) NOT NULL DEFAULT 0,
  closed_by_user_id            UUID REFERENCES public.user(id),
  closed_at                    TIMESTAMPTZ,
  counted_cash_amount          NUMERIC(14,2),
  deposit_amount               NUMERIC(14,2),
  expected_cash_amount         NUMERIC(14,2),
  over_short_amount            NUMERIC(14,2),
  over_short_approved_by_user_id UUID REFERENCES public.user(id),
  posting_mode                 TEXT NOT NULL CHECK (posting_mode IN ('REALTIME','SHIFT_POST')),
  posted_at                    TIMESTAMPTZ,
  last_ticket_number_used      INTEGER NOT NULL DEFAULT 0,
  notes                        TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, batch_number),
  UNIQUE (register_id, business_date, batch_number)
);

CREATE UNIQUE INDEX pos_shift_one_open_per_register_idx
  ON app.pos_shift(register_id)
  WHERE status IN ('OPEN','COUNTING');
```

### `app.pos_shift_tender_count`

Per-tender count-money results for close-batch.

```sql
CREATE TABLE app.pos_shift_tender_count (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id                     UUID NOT NULL REFERENCES app.pos_shift(id) ON DELETE CASCADE,
  tender_code                  TEXT NOT NULL,
  expected_amount              NUMERIC(14,2) NOT NULL DEFAULT 0,
  counted_amount               NUMERIC(14,2) NOT NULL DEFAULT 0,
  detail_json                  JSONB,
  counted_by_user_id           UUID NOT NULL REFERENCES public.user(id),
  counted_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shift_id, tender_code)
);
```

`detail_json` carries denomination detail for cash and per-item detail for checks / slips.

### `app.pos_ticket`

Header-level sales ticket aggregate.

```sql
CREATE TABLE app.pos_ticket (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id                     UUID NOT NULL REFERENCES app.pos_shift(id),
  store_id                     SMALLINT NOT NULL REFERENCES app.store_master(number),
  register_id                  UUID NOT NULL REFERENCES app.pos_register(id),
  business_date                DATE NOT NULL,
  ticket_number                INTEGER NOT NULL,
  status                       TEXT NOT NULL
                                 CHECK (status IN ('DRAFT','READY_FOR_PAYMENT','COMPLETED','CONTINUED','VOIDED','REFUNDED')),
  transaction_type             SMALLINT NOT NULL,
  direction                    TEXT NOT NULL CHECK (direction IN ('SALE','RETURN','MIXED')),
  cashier_user_id              UUID NOT NULL REFERENCES public.user(id),
  customer_id                  UUID REFERENCES app.customer(id),
  header_discount_pct          NUMERIC(5,2),
  promotion_code               TEXT,
  ship_to_state                TEXT,
  ticket_comment               TEXT,
  receipt_email                TEXT,
  subtotal_amount              NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount              NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount                   NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_charge_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount                 NUMERIC(14,2) NOT NULL DEFAULT 0,
  tendered_amount              NUMERIC(14,2) NOT NULL DEFAULT 0,
  change_amount                NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due_amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  continued_from_ticket_id     UUID REFERENCES app.pos_ticket(id),
  reclaimed_from_ticket_id     UUID REFERENCES app.pos_ticket(id),
  reference_ticket_id          UUID REFERENCES app.pos_ticket(id),
  reference_sales_history_ticket_id UUID REFERENCES app.sales_history_ticket(id),
  completed_by_user_id         UUID REFERENCES public.user(id),
  completed_at                 TIMESTAMPTZ,
  voided_by_user_id            UUID REFERENCES public.user(id),
  voided_at                    TIMESTAMPTZ,
  void_reason                  TEXT,
  receipt_print_count          INTEGER NOT NULL DEFAULT 0,
  last_emailed_at              TIMESTAMPTZ,
  posting_status               TEXT NOT NULL
                                 CHECK (posting_status IN ('NOT_POSTED','PENDING_POST','POSTED','VOIDED_UNPOSTED')),
  client_ticket_id             UUID,
  row_version                  INTEGER NOT NULL DEFAULT 1,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, business_date, ticket_number),
  UNIQUE (client_ticket_id)
);

CREATE INDEX pos_ticket_shift_status_idx
  ON app.pos_ticket(shift_id, status);

CREATE INDEX pos_ticket_customer_idx
  ON app.pos_ticket(customer_id, business_date);
```

Notes:

- `transaction_type` preserves the RICS codes.
- `reference_*` fields support refunds against either current runtime tickets or imported historical tickets.
- `row_version` supports optimistic concurrency from the browser.

### `app.pos_ticket_line`

Detail lines on a ticket.

```sql
CREATE TABLE app.pos_ticket_line (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id                     UUID NOT NULL REFERENCES app.pos_ticket(id) ON DELETE CASCADE,
  line_number                   INTEGER NOT NULL,
  line_kind                     TEXT NOT NULL CHECK (line_kind IN ('MERCHANDISE','COMMENT','MANUAL_CHARGE')),
  sku_id                        UUID REFERENCES app.sku(id),
  sku_code_snapshot             TEXT,
  upc_scanned                   TEXT,
  description_snapshot          TEXT,
  column_label                  TEXT,
  row_label                     TEXT,
  quantity                      INTEGER NOT NULL,
  unit_price                    NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit_cost                     NUMERIC(14,2) NOT NULL DEFAULT 0,
  price_slot_code               TEXT,
  line_discount_pct             NUMERIC(5,2),
  line_discount_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  perks_amount                  NUMERIC(14,2) NOT NULL DEFAULT 0,
  apply_isv                     BOOLEAN NOT NULL DEFAULT true,
  apply_isv_additional          BOOLEAN NOT NULL DEFAULT false,
  salesperson_user_id           UUID REFERENCES public.user(id),
  family_member_ref             TEXT,
  return_code                   TEXT,
  comment                       TEXT,
  reference_ticket_line_id      UUID REFERENCES app.pos_ticket_line(id),
  reference_sales_history_line_id UUID REFERENCES app.sales_history_ticket_line(id),
  extended_amount               NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount                    NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount                    NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, line_number)
);

CREATE INDEX pos_ticket_line_sku_idx
  ON app.pos_ticket_line(sku_id);
```

Business notes:

- negative quantity means return,
- `return_code` is enforced by API validation, not by a DB check, because it depends on store policy,
- snapshots preserve receipt and journal history even if the product record changes later.

### `app.pos_ticket_tender`

Split tender rows for a ticket.

```sql
CREATE TABLE app.pos_ticket_tender (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id                    UUID NOT NULL REFERENCES app.pos_ticket(id) ON DELETE CASCADE,
  sequence                     SMALLINT NOT NULL,
  tender_code                  TEXT NOT NULL,
  tender_kind                  TEXT NOT NULL,
  amount                       NUMERIC(14,2) NOT NULL,
  account_number               TEXT,
  reference_number             TEXT,
  approval_code                TEXT,
  foreign_currency_code        TEXT,
  foreign_amount               NUMERIC(14,2),
  exchange_rate                NUMERIC(14,6),
  metadata_json                JSONB,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, sequence)
);
```

`metadata_json` supports gift-card numbers, credit-slip numbers, or processor payloads without widening the table for every tender type.

### `app.pos_ticket_tax`

Tax summary by ticket and tax bucket.

```sql
CREATE TABLE app.pos_ticket_tax (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id                    UUID NOT NULL REFERENCES app.pos_ticket(id) ON DELETE CASCADE,
  tax_code                     TEXT NOT NULL,
  tax_label                    TEXT NOT NULL,
  tax_rate                     NUMERIC(5,2) NOT NULL,
  taxable_base_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount                   NUMERIC(14,2) NOT NULL DEFAULT 0,
  source                       TEXT NOT NULL CHECK (source IN ('LINE_ROLLUP','TENDER_OVERRIDE')),
  UNIQUE (ticket_id, tax_code)
);
```

This table is what the Sales Tax Recap reads.

### `app.pos_ticket_event`

Immutable audit log for ticket actions.

```sql
CREATE TABLE app.pos_ticket_event (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id                    UUID NOT NULL REFERENCES app.pos_ticket(id) ON DELETE CASCADE,
  shift_id                     UUID REFERENCES app.pos_shift(id),
  event_type                   TEXT NOT NULL,
  actor_user_id                UUID REFERENCES public.user(id),
  override_token_id            UUID,
  payload_json                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pos_ticket_event_ticket_created_idx
  ON app.pos_ticket_event(ticket_id, created_at);
```

Typical events:

- `CREATED`
- `HEADER_UPDATED`
- `LINE_ADDED`
- `LINE_REMOVED`
- `PRICE_SLOT_ROTATED`
- `DISCOUNT_APPROVED`
- `TENDER_ADDED`
- `CONTINUED`
- `RECLAIMED`
- `VOIDED`
- `REPRINTED`
- `EMAILED`
- `TAX_OVERRIDDEN`
- `COMPLETED`

### `app.pos_payout`

Drawer payout rows.

```sql
CREATE TABLE app.pos_payout (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id                     UUID NOT NULL REFERENCES app.pos_shift(id) ON DELETE CASCADE,
  store_id                     SMALLINT NOT NULL REFERENCES app.store_master(number),
  register_id                  UUID NOT NULL REFERENCES app.pos_register(id),
  category_code                TEXT NOT NULL,
  amount                       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  note                         TEXT,
  created_by_user_id           UUID NOT NULL REFERENCES public.user(id),
  approved_by_user_id          UUID REFERENCES public.user(id),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `app.pos_post_run`

Audit row for posting closed shifts to inventory and downstream summaries.

```sql
CREATE TABLE app.pos_post_run (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id                     UUID NOT NULL UNIQUE REFERENCES app.pos_shift(id) ON DELETE CASCADE,
  status                       TEXT NOT NULL CHECK (status IN ('STARTED','COMPLETED','FAILED')),
  started_by_user_id           UUID NOT NULL REFERENCES public.user(id),
  started_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at                  TIMESTAMPTZ,
  ticket_count                 INTEGER NOT NULL DEFAULT 0,
  inventory_entry_count        INTEGER NOT NULL DEFAULT 0,
  error_text                   TEXT
);
```

### `app.pos_ticket_lookup_vw`

Read-model view that normalizes current runtime tickets and imported historical tickets for refund, reprint, and search flows.

Recommended columns:

- `source` (`POS_RUNTIME` or `SALES_HISTORY`)
- `store_id`
- `business_date`
- `ticket_number`
- `customer_id`
- `transaction_type`
- `status`
- `total_amount`
- `reference_id`

This avoids forcing the UI to know which backing table holds the ticket being searched.

## Prisma model guidance

The Prisma schema should add `@@schema("app")` models for every new `pos_*` table and reuse existing `StoreMaster`, `Sku`, `CustomerIntelligenceCustomer`, `SalesHistoryTicket`, `SalesHistoryTicketLine`, and `User` models for relations.

Money columns should use `Decimal @db.Decimal(14, 2)` and rate columns should use a wider decimal where needed.

## Indexing and integrity rules

- `pos_shift_one_open_per_register_idx` guarantees only one active shift per register.
- `(store_id, business_date, ticket_number)` guarantees human ticket uniqueness.
- `client_ticket_id` protects against browser retries creating duplicate tickets.
- `row_version` enables optimistic concurrency checks on ticket updates.
- `pos_ticket_event` stays append-only.
- Foreign keys to imported history are optional so runtime tickets can reference either current or historical documents.

## What is intentionally not modeled here

- Tender-type, payout-category, and tax-definition catalogs remain in `store-ops`.
- Gift-card, layaway, special-order, and house-charge lifecycle tables remain in `customer-transactions`.
- Receipt-template rendering details can stay in `store-ops` or `platform`; `sales-pos` only needs a receipt profile reference.
