-- Sales-owned imported ticket baseline for legacy RITRNSSV history.
-- RITRNSSV.MDB is a sales/ticket source, not a customer-owned transaction table.
-- This migration creates the sales history tables, moves any already-imported
-- RITRNSSV rows out of app.customer_transaction_* into the new sales-owned
-- tables, and preserves customer linkage only as an optional match.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "app"."sales_history_ticket" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "external_transaction_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'rics_ticket_import',
    "matched_customer_id" UUID,
    "account_key" TEXT,
    "transaction_type" SMALLINT,
    "transaction_kind" TEXT NOT NULL DEFAULT 'purchase',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "store_id" SMALLINT,
    "terminal" TEXT,
    "ticket_number" INTEGER,
    "cashier_code" TEXT,
    "channel" TEXT NOT NULL,
    "promotion_code" TEXT,
    "coupon_code" TEXT,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "purchased_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_history_ticket_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_history_ticket_external_transaction_id_key" UNIQUE ("external_transaction_id"),
    CONSTRAINT "sales_history_ticket_customer_fkey"
      FOREIGN KEY ("matched_customer_id") REFERENCES "app"."customer"("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "sales_history_ticket_kind_check"
      CHECK ("transaction_kind" IN ('purchase', 'return')),
    CONSTRAINT "sales_history_ticket_status_check"
      CHECK ("status" IN ('completed', 'cancelled', 'refunded')),
    CONSTRAINT "sales_history_ticket_channel_check"
      CHECK ("channel" IN ('store', 'online'))
);

CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_customer_date"
  ON "app"."sales_history_ticket"("matched_customer_id", "purchased_at");
CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_status_date"
  ON "app"."sales_history_ticket"("status", "purchased_at");
CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_channel_date"
  ON "app"."sales_history_ticket"("channel", "purchased_at");
CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_store_date"
  ON "app"."sales_history_ticket"("store_id", "purchased_at");
CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_store_ticket"
  ON "app"."sales_history_ticket"("ticket_number", "store_id", "purchased_at");

CREATE TABLE IF NOT EXISTS "app"."sales_history_ticket_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL DEFAULT 0,
    "sku_id" UUID,
    "sku_code" TEXT,
    "category_id" UUID,
    "category_key" TEXT,
    "brand_id" UUID,
    "brand_key" TEXT,
    "column_label" TEXT,
    "row_label" TEXT,
    "size_type" TEXT,
    "size_value" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_markdown" BOOLEAN NOT NULL DEFAULT false,
    "is_return" BOOLEAN NOT NULL DEFAULT false,
    "return_code" TEXT,
    "salesperson_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_history_ticket_line_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_history_ticket_line_ticket_fkey"
      FOREIGN KEY ("ticket_id") REFERENCES "app"."sales_history_ticket"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_line_ticket"
  ON "app"."sales_history_ticket_line"("ticket_id");
CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_line_ticket_line"
  ON "app"."sales_history_ticket_line"("ticket_id", "line_number");
CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_line_sku"
  ON "app"."sales_history_ticket_line"("sku_id");
CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_line_size"
  ON "app"."sales_history_ticket_line"("size_type", "size_value");

INSERT INTO "app"."sales_history_ticket" (
    "id",
    "external_transaction_id",
    "source",
    "matched_customer_id",
    "account_key",
    "transaction_type",
    "transaction_kind",
    "status",
    "store_id",
    "terminal",
    "ticket_number",
    "cashier_code",
    "channel",
    "promotion_code",
    "coupon_code",
    "total_amount",
    "net_amount",
    "cost_amount",
    "discount_amount",
    "purchased_at",
    "created_at",
    "updated_at"
)
SELECT
    f."id",
    f."external_transaction_id",
    f."source",
    f."customer_id",
    NULL,
    NULL,
    f."transaction_kind",
    f."status",
    f."store_id",
    NULL,
    NULL,
    NULL,
    f."channel",
    f."promotion_code",
    f."coupon_code",
    f."total_amount",
    f."net_amount",
    f."cost_amount",
    f."discount_amount",
    f."purchased_at",
    f."created_at",
    f."updated_at"
FROM "app"."customer_transaction_fact" f
WHERE f."external_transaction_id" LIKE 'RITRNSSV:%'
ON CONFLICT ("external_transaction_id") DO NOTHING;

INSERT INTO "app"."sales_history_ticket_line" (
    "id",
    "ticket_id",
    "line_number",
    "sku_id",
    "sku_code",
    "category_id",
    "category_key",
    "brand_id",
    "brand_key",
    "column_label",
    "row_label",
    "size_type",
    "size_value",
    "quantity",
    "unit_price",
    "unit_cost",
    "net_amount",
    "cost_amount",
    "discount_amount",
    "is_markdown",
    "is_return",
    "return_code",
    "salesperson_code",
    "created_at"
)
SELECT
    i."id",
    i."transaction_id",
    ROW_NUMBER() OVER (PARTITION BY i."transaction_id" ORDER BY i."id")::int AS "line_number",
    i."sku_id",
    NULL,
    i."category_id",
    i."category_key",
    i."brand_id",
    i."brand_key",
    NULL,
    NULL,
    i."size_type",
    i."size_value",
    i."quantity",
    CASE
      WHEN i."quantity" <> 0 THEN ROUND((i."net_amount" / i."quantity")::numeric, 2)
      ELSE 0::numeric
    END AS "unit_price",
    CASE
      WHEN i."quantity" <> 0 THEN ROUND((i."cost_amount" / i."quantity")::numeric, 2)
      ELSE 0::numeric
    END AS "unit_cost",
    i."net_amount",
    i."cost_amount",
    i."discount_amount",
    i."is_markdown",
    i."is_return",
    NULL,
    NULL,
    i."created_at"
FROM "app"."customer_transaction_item" i
JOIN "app"."customer_transaction_fact" f
  ON f."id" = i."transaction_id"
WHERE f."external_transaction_id" LIKE 'RITRNSSV:%'
ON CONFLICT ("id") DO NOTHING;

DELETE FROM "app"."customer_transaction_fact"
WHERE "external_transaction_id" LIKE 'RITRNSSV:%';
