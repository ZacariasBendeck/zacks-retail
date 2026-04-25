-- Customer KPI module core.
-- Adds Postgres-native customer transaction facts plus KPI cache tables.
-- Contract:
--   docs/modules/customer-intelligence-module/customer-kpi-module.md
--   docs/modules/customer-intelligence-module/schema.md
--
-- Design note:
-- `app.customer` is the customer-intelligence customer master already used by
-- `customer_features_current` and the segmentation engine. This migration adds
-- an app-owned transaction fact surface so new KPI code stays Postgres-native
-- and does not read or write the legacy SQLite POS tables.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "app"."customer_transaction_fact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "external_transaction_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'api',
    "transaction_kind" TEXT NOT NULL DEFAULT 'purchase',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "store_id" UUID,
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

    CONSTRAINT "customer_transaction_fact_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_transaction_fact_external_transaction_id_key" UNIQUE ("external_transaction_id"),
    CONSTRAINT "customer_transaction_fact_customer_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "app"."customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customer_transaction_fact_kind_check"
      CHECK ("transaction_kind" IN ('purchase', 'return')),
    CONSTRAINT "customer_transaction_fact_status_check"
      CHECK ("status" IN ('completed', 'cancelled', 'refunded')),
    CONSTRAINT "customer_transaction_fact_channel_check"
      CHECK ("channel" IN ('store', 'online'))
);

CREATE INDEX IF NOT EXISTS "idx_customer_transaction_fact_customer_date"
  ON "app"."customer_transaction_fact"("customer_id", "purchased_at");
CREATE INDEX IF NOT EXISTS "idx_customer_transaction_fact_status_date"
  ON "app"."customer_transaction_fact"("status", "purchased_at");
CREATE INDEX IF NOT EXISTS "idx_customer_transaction_fact_channel_date"
  ON "app"."customer_transaction_fact"("channel", "purchased_at");
CREATE INDEX IF NOT EXISTS "idx_customer_transaction_fact_store_date"
  ON "app"."customer_transaction_fact"("store_id", "purchased_at");

CREATE TABLE IF NOT EXISTS "app"."customer_transaction_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transaction_id" UUID NOT NULL,
    "sku_id" UUID,
    "category_id" UUID,
    "category_key" TEXT,
    "brand_id" UUID,
    "brand_key" TEXT,
    "size_type" TEXT,
    "size_value" TEXT,
    "quantity" INTEGER NOT NULL,
    "net_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_markdown" BOOLEAN NOT NULL DEFAULT false,
    "is_return" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_transaction_item_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_transaction_item_transaction_fkey"
      FOREIGN KEY ("transaction_id") REFERENCES "app"."customer_transaction_fact"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_customer_transaction_item_transaction"
  ON "app"."customer_transaction_item"("transaction_id");
CREATE INDEX IF NOT EXISTS "idx_customer_transaction_item_category"
  ON "app"."customer_transaction_item"("category_id");
CREATE INDEX IF NOT EXISTS "idx_customer_transaction_item_brand"
  ON "app"."customer_transaction_item"("brand_id");
CREATE INDEX IF NOT EXISTS "idx_customer_transaction_item_size"
  ON "app"."customer_transaction_item"("size_type", "size_value");

CREATE TABLE IF NOT EXISTS "app"."customer_metrics" (
    "customer_id" UUID NOT NULL,
    "lifetime_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "avg_order_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "margin_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "orders_30d" INTEGER NOT NULL DEFAULT 0,
    "orders_90d" INTEGER NOT NULL DEFAULT 0,
    "orders_365d" INTEGER NOT NULL DEFAULT 0,
    "avg_days_between_orders" DECIMAL(10,2),
    "last_purchase_date" TIMESTAMPTZ(6),
    "recency_days" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "discount_ratio" DECIMAL(8,4),
    "primary_store_id" UUID,
    "store_loyalty_ratio" DECIMAL(8,4),
    "online_ratio" DECIMAL(8,4),
    "churn_risk" TEXT,
    "is_dormant" BOOLEAN NOT NULL DEFAULT false,
    "r_score" INTEGER,
    "f_score" INTEGER,
    "m_score" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_metrics_pkey" PRIMARY KEY ("customer_id"),
    CONSTRAINT "customer_metrics_customer_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "app"."customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customer_metrics_churn_risk_check"
      CHECK ("churn_risk" IS NULL OR "churn_risk" IN ('LOW', 'MEDIUM', 'HIGH'))
);

CREATE INDEX IF NOT EXISTS "idx_customer_metrics_is_active"
  ON "app"."customer_metrics"("is_active");
CREATE INDEX IF NOT EXISTS "idx_customer_metrics_is_dormant"
  ON "app"."customer_metrics"("is_dormant");
CREATE INDEX IF NOT EXISTS "idx_customer_metrics_churn_risk"
  ON "app"."customer_metrics"("churn_risk");

CREATE TABLE IF NOT EXISTS "app"."customer_metrics_daily" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "lifetime_value" DECIMAL(14,2),
    "total_orders" INTEGER,
    "recency_days" INTEGER,
    "orders_90d" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_metrics_daily_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_metrics_daily_customer_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "app"."customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_customer_metrics_daily_customer_date"
  ON "app"."customer_metrics_daily"("customer_id", "snapshot_date");
