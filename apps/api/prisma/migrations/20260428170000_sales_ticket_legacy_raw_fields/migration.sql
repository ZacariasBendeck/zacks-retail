-- Preserve complete RITRNSSV sales-ticket source rows in app-owned Postgres tables.
-- The existing app.sales_history_ticket* tables remain the normalized reporting
-- baseline. These raw tables keep every legacy TicketHeader, TicketDetail, and
-- TicketTender field available for cutover audit, tax review, gift certificate
-- reconciliation, and later module-specific normalization.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "app"."sales_history_ticket_legacy_raw" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL DEFAULT 'rics_ticket_import',
    "external_transaction_id" TEXT,
    "ticket_identity_key" TEXT,
    "ticket_id" UUID,
    "user_id" TEXT,
    "batch_date" TEXT,
    "use_date" TEXT,
    "terminal" TEXT,
    "store" TEXT,
    "ticket" TEXT,
    "real_date" TEXT,
    "cashier" TEXT,
    "trans_type" TEXT,
    "account" TEXT,
    "tax_01" TEXT,
    "tax_02" TEXT,
    "tax_03" TEXT,
    "tax_change" TEXT,
    "oth_chg" TEXT,
    "prev_paid" TEXT,
    "comment" TEXT,
    "change_amount" TEXT,
    "alt_change" TEXT,
    "exch_rate" TEXT,
    "discount" TEXT,
    "apply_to" TEXT,
    "apply_tender" TEXT,
    "apply_amount" TEXT,
    "ship_state" TEXT,
    "ship_county" TEXT,
    "ship_city" TEXT,
    "marketing_code" TEXT,
    "voided" TEXT,
    "printed" TEXT,
    "posted" TEXT,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_history_ticket_legacy_raw_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_history_ticket_legacy_raw_ticket_fkey"
      FOREIGN KEY ("ticket_id") REFERENCES "app"."sales_history_ticket"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_legacy_raw_source_external"
  ON "app"."sales_history_ticket_legacy_raw"("source", "external_transaction_id");
CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_legacy_raw_identity"
  ON "app"."sales_history_ticket_legacy_raw"("ticket_identity_key");
CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_legacy_raw_ticket"
  ON "app"."sales_history_ticket_legacy_raw"("ticket_id");
CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_legacy_raw_store_ticket"
  ON "app"."sales_history_ticket_legacy_raw"("store", "ticket", "real_date");

CREATE TABLE IF NOT EXISTS "app"."sales_history_ticket_line_legacy_raw" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL DEFAULT 'rics_ticket_import',
    "source_row_number" BIGINT NOT NULL,
    "external_transaction_id" TEXT,
    "ticket_identity_key" TEXT,
    "ticket_id" UUID,
    "user_id" TEXT,
    "batch_date" TEXT,
    "use_date" TEXT,
    "terminal" TEXT,
    "store" TEXT,
    "ticket" TEXT,
    "real_date" TEXT,
    "line_no" TEXT,
    "sku" TEXT,
    "column_label" TEXT,
    "row_label" TEXT,
    "qty" TEXT,
    "price" TEXT,
    "disc_pct" TEXT,
    "disc_amt" TEXT,
    "perks" TEXT,
    "salesperson" TEXT,
    "fam_member" TEXT,
    "prices_01" TEXT,
    "prices_02" TEXT,
    "prices_03" TEXT,
    "prices_04" TEXT,
    "ovs_amt" TEXT,
    "this_ovs_amt" TEXT,
    "category" TEXT,
    "vendor" TEXT,
    "real_price" TEXT,
    "extension" TEXT,
    "orig_ticket" TEXT,
    "tax_01" TEXT,
    "tax_02" TEXT,
    "tax_03" TEXT,
    "taxamt_01" TEXT,
    "taxamt_02" TEXT,
    "taxamt_03" TEXT,
    "fb_gen" TEXT,
    "ds_ship_code" TEXT,
    "ds_ship_desc" TEXT,
    "ds_dest_code" TEXT,
    "ds_dye_code" TEXT,
    "ds_ship_chg" TEXT,
    "return_code" TEXT,
    "gift_cert" TEXT,
    "gift_seq" TEXT,
    "gift_acct" TEXT,
    "cost" TEXT,
    "comment" TEXT,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_history_ticket_line_legacy_raw_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_history_ticket_line_legacy_raw_ticket_fkey"
      FOREIGN KEY ("ticket_id") REFERENCES "app"."sales_history_ticket"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_line_legacy_raw_source_external"
  ON "app"."sales_history_ticket_line_legacy_raw"("source", "external_transaction_id");
CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_line_legacy_raw_identity"
  ON "app"."sales_history_ticket_line_legacy_raw"("ticket_identity_key");
CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_line_legacy_raw_ticket"
  ON "app"."sales_history_ticket_line_legacy_raw"("ticket_id");
CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_line_legacy_raw_store_ticket"
  ON "app"."sales_history_ticket_line_legacy_raw"("store", "ticket", "real_date");

CREATE TABLE IF NOT EXISTS "app"."sales_history_ticket_tender_legacy_raw" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL DEFAULT 'rics_ticket_import',
    "source_row_number" BIGINT NOT NULL,
    "external_transaction_id" TEXT,
    "ticket_identity_key" TEXT,
    "ticket_id" UUID,
    "user_id" TEXT,
    "batch_date" TEXT,
    "use_date" TEXT,
    "terminal" TEXT,
    "store" TEXT,
    "ticket" TEXT,
    "real_date" TEXT,
    "tender" TEXT,
    "amount" TEXT,
    "alt_amount" TEXT,
    "alt_currency" TEXT,
    "exch_rate" TEXT,
    "gift_cert" TEXT,
    "gift_seq" TEXT,
    "gift_new" TEXT,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_history_ticket_tender_legacy_raw_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_history_ticket_tender_legacy_raw_ticket_fkey"
      FOREIGN KEY ("ticket_id") REFERENCES "app"."sales_history_ticket"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_tender_legacy_raw_source_external"
  ON "app"."sales_history_ticket_tender_legacy_raw"("source", "external_transaction_id");
CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_tender_legacy_raw_identity"
  ON "app"."sales_history_ticket_tender_legacy_raw"("ticket_identity_key");
CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_tender_legacy_raw_ticket"
  ON "app"."sales_history_ticket_tender_legacy_raw"("ticket_id");
CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_tender_legacy_raw_store_ticket"
  ON "app"."sales_history_ticket_tender_legacy_raw"("store", "ticket", "real_date");
