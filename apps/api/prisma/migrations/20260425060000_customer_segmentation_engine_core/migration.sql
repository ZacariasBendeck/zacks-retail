-- Customer-intelligence segmentation engine core.
-- Adds app-owned customer feature snapshots, segment definitions/versions,
-- durable memberships + history, activation audience snapshots, and audit log.
-- Source contract:
--   docs/modules/customer-intelligence-module/retail_customer_segmentation_engine_implementation_plan.md

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "app"."customer_features_current" (
    "customer_id" UUID NOT NULL,
    "first_purchase_at" TIMESTAMPTZ(6),
    "last_purchase_at" TIMESTAMPTZ(6),
    "days_since_first_purchase" INTEGER,
    "days_since_last_purchase" INTEGER,
    "order_count_lifetime" INTEGER NOT NULL DEFAULT 0,
    "order_count_7d" INTEGER NOT NULL DEFAULT 0,
    "order_count_30d" INTEGER NOT NULL DEFAULT 0,
    "order_count_90d" INTEGER NOT NULL DEFAULT 0,
    "order_count_180d" INTEGER NOT NULL DEFAULT 0,
    "order_count_365d" INTEGER NOT NULL DEFAULT 0,
    "item_count_lifetime" INTEGER NOT NULL DEFAULT 0,
    "item_count_365d" INTEGER NOT NULL DEFAULT 0,
    "net_revenue_lifetime" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_revenue_30d" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_revenue_90d" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_revenue_180d" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_revenue_365d" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross_revenue_lifetime" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross_revenue_365d" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross_margin_lifetime" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross_margin_90d" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross_margin_365d" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "avg_order_value_lifetime" DECIMAL(14,2),
    "avg_order_value_365d" DECIMAL(14,2),
    "avg_items_per_order_365d" DECIMAL(10,2),
    "return_count_lifetime" INTEGER NOT NULL DEFAULT 0,
    "return_count_365d" INTEGER NOT NULL DEFAULT 0,
    "returned_item_count_365d" INTEGER NOT NULL DEFAULT 0,
    "return_rate_365d" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "markdown_revenue_share_365d" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "average_discount_percent_365d" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "coupon_redemption_count_365d" INTEGER NOT NULL DEFAULT 0,
    "coupon_redemption_rate_365d" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "full_price_purchase_count_365d" INTEGER NOT NULL DEFAULT 0,
    "promo_purchase_count_365d" INTEGER NOT NULL DEFAULT 0,
    "preferred_store_id" UUID,
    "preferred_channel" TEXT,
    "primary_store_purchase_count_365d" INTEGER NOT NULL DEFAULT 0,
    "web_order_count_365d" INTEGER NOT NULL DEFAULT 0,
    "store_order_count_365d" INTEGER NOT NULL DEFAULT 0,
    "email_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "sms_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "push_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "loyalty_tier" TEXT,
    "loyalty_points_balance" INTEGER,
    "employee_flag" BOOLEAN NOT NULL DEFAULT false,
    "fraud_risk_flag" BOOLEAN NOT NULL DEFAULT false,
    "abuse_risk_flag" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_features_current_pkey" PRIMARY KEY ("customer_id"),
    CONSTRAINT "customer_features_current_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "app"."customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_customer_features_last_purchase"
  ON "app"."customer_features_current"("last_purchase_at");
CREATE INDEX IF NOT EXISTS "idx_customer_features_days_since_purchase"
  ON "app"."customer_features_current"("days_since_last_purchase");
CREATE INDEX IF NOT EXISTS "idx_customer_features_net_revenue_365d"
  ON "app"."customer_features_current"("net_revenue_365d");
CREATE INDEX IF NOT EXISTS "idx_customer_features_gross_margin_365d"
  ON "app"."customer_features_current"("gross_margin_365d");
CREATE INDEX IF NOT EXISTS "idx_customer_features_preferred_store"
  ON "app"."customer_features_current"("preferred_store_id");
CREATE INDEX IF NOT EXISTS "idx_customer_features_channel"
  ON "app"."customer_features_current"("preferred_channel");

CREATE TABLE IF NOT EXISTS "app"."customer_category_features" (
    "customer_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "category_key" TEXT,
    "purchase_count_lifetime" INTEGER NOT NULL DEFAULT 0,
    "purchase_count_365d" INTEGER NOT NULL DEFAULT 0,
    "net_revenue_lifetime" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_revenue_365d" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross_margin_365d" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "last_purchase_at" TIMESTAMPTZ(6),
    "affinity_score" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_category_features_pkey" PRIMARY KEY ("customer_id", "category_id"),
    CONSTRAINT "customer_category_features_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "app"."customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_customer_category_features_category_score"
  ON "app"."customer_category_features"("category_id", "affinity_score" DESC);
CREATE INDEX IF NOT EXISTS "idx_customer_category_features_category_key_score"
  ON "app"."customer_category_features"("category_key", "affinity_score" DESC);
CREATE INDEX IF NOT EXISTS "idx_customer_category_features_customer"
  ON "app"."customer_category_features"("customer_id");

CREATE TABLE IF NOT EXISTS "app"."customer_brand_features" (
    "customer_id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "brand_key" TEXT,
    "purchase_count_lifetime" INTEGER NOT NULL DEFAULT 0,
    "purchase_count_365d" INTEGER NOT NULL DEFAULT 0,
    "net_revenue_lifetime" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_revenue_365d" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross_margin_365d" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "last_purchase_at" TIMESTAMPTZ(6),
    "affinity_score" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_brand_features_pkey" PRIMARY KEY ("customer_id", "brand_id"),
    CONSTRAINT "customer_brand_features_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "app"."customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_customer_brand_features_brand_score"
  ON "app"."customer_brand_features"("brand_id", "affinity_score" DESC);
CREATE INDEX IF NOT EXISTS "idx_customer_brand_features_brand_key_score"
  ON "app"."customer_brand_features"("brand_key", "affinity_score" DESC);
CREATE INDEX IF NOT EXISTS "idx_customer_brand_features_customer"
  ON "app"."customer_brand_features"("customer_id");

CREATE TABLE IF NOT EXISTS "app"."customer_size_profiles" (
    "customer_id" UUID NOT NULL,
    "size_type" TEXT NOT NULL,
    "size_value" TEXT NOT NULL,
    "confidence_score" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "purchase_count" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_size_profiles_pkey" PRIMARY KEY ("customer_id", "size_type", "size_value"),
    CONSTRAINT "customer_size_profiles_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "app"."customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_customer_size_profiles_type_value"
  ON "app"."customer_size_profiles"("size_type", "size_value", "confidence_score" DESC);
CREATE INDEX IF NOT EXISTS "idx_customer_size_profiles_customer"
  ON "app"."customer_size_profiles"("customer_id");

CREATE TABLE IF NOT EXISTS "app"."segment_metric_registry" (
    "metric_key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "value_type" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_table" TEXT NOT NULL,
    "source_column" TEXT,
    "allowed_operators" TEXT[] NOT NULL,
    "supports_window" BOOLEAN NOT NULL DEFAULT false,
    "supports_dimension" BOOLEAN NOT NULL DEFAULT false,
    "dimension_config" JSONB,
    "sql_template" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "segment_metric_registry_pkey" PRIMARY KEY ("metric_key"),
    CONSTRAINT "segment_metric_registry_value_type_check"
      CHECK ("value_type" IN ('integer', 'numeric', 'boolean', 'text', 'date', 'timestamp')),
    CONSTRAINT "segment_metric_registry_source_type_check"
      CHECK ("source_type" IN ('customer_feature', 'category_feature', 'brand_feature', 'size_profile', 'custom_sql_view'))
);

CREATE TABLE IF NOT EXISTS "app"."customer_segments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "segment_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "segment_family" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "evaluation_mode" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_segments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_segments_segment_key_key" UNIQUE ("segment_key"),
    CONSTRAINT "customer_segments_family_check"
      CHECK ("segment_family" IN ('lifecycle', 'value', 'rfm', 'category_affinity', 'brand_affinity', 'promo_behavior', 'channel_behavior', 'churn_risk', 'inventory_activation', 'custom')),
    CONSTRAINT "customer_segments_status_check"
      CHECK ("status" IN ('draft', 'active', 'paused', 'archived')),
    CONSTRAINT "customer_segments_evaluation_mode_check"
      CHECK ("evaluation_mode" IN ('batch', 'realtime', 'hybrid'))
);

CREATE INDEX IF NOT EXISTS "idx_customer_segments_status"
  ON "app"."customer_segments"("status");
CREATE INDEX IF NOT EXISTS "idx_customer_segments_family"
  ON "app"."customer_segments"("segment_family");
CREATE INDEX IF NOT EXISTS "idx_customer_segments_priority"
  ON "app"."customer_segments"("priority");

CREATE TABLE IF NOT EXISTS "app"."customer_segment_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "segment_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "rule_ast" JSONB NOT NULL,
    "scoring_config" JSONB,
    "activation_policy" JSONB,
    "suppression_policy" JSONB,
    "status" TEXT NOT NULL,
    "validation_status" TEXT NOT NULL DEFAULT 'pending',
    "validation_errors" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMPTZ(6),
    "retired_at" TIMESTAMPTZ(6),

    CONSTRAINT "customer_segment_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_segment_versions_segment_version_key" UNIQUE ("segment_id", "version_number"),
    CONSTRAINT "customer_segment_versions_segment_id_fkey"
      FOREIGN KEY ("segment_id") REFERENCES "app"."customer_segments"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customer_segment_versions_status_check"
      CHECK ("status" IN ('draft', 'active', 'retired')),
    CONSTRAINT "customer_segment_versions_validation_status_check"
      CHECK ("validation_status" IN ('pending', 'valid', 'invalid'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_one_active_version_per_segment"
  ON "app"."customer_segment_versions"("segment_id")
  WHERE "status" = 'active';
CREATE INDEX IF NOT EXISTS "idx_customer_segment_versions_segment"
  ON "app"."customer_segment_versions"("segment_id");

CREATE TABLE IF NOT EXISTS "app"."segment_version_metric_dependencies" (
    "segment_version_id" UUID NOT NULL,
    "metric_key" TEXT NOT NULL,

    CONSTRAINT "segment_version_metric_dependencies_pkey" PRIMARY KEY ("segment_version_id", "metric_key"),
    CONSTRAINT "segment_version_metric_dependencies_version_fkey"
      FOREIGN KEY ("segment_version_id") REFERENCES "app"."customer_segment_versions"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "segment_version_metric_dependencies_metric_fkey"
      FOREIGN KEY ("metric_key") REFERENCES "app"."segment_metric_registry"("metric_key")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_segment_metric_dependencies_metric"
  ON "app"."segment_version_metric_dependencies"("metric_key");

CREATE TABLE IF NOT EXISTS "app"."customer_segment_evaluation_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "segment_id" UUID,
    "segment_version_id" UUID,
    "evaluation_mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "customers_evaluated" INTEGER,
    "customers_matched" INTEGER,
    "customers_entered" INTEGER,
    "customers_exited" INTEGER,
    "customers_refreshed" INTEGER,
    "customers_score_changed" INTEGER,
    "error_message" TEXT,
    "metadata" JSONB,

    CONSTRAINT "customer_segment_evaluation_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_segment_evaluation_runs_segment_fkey"
      FOREIGN KEY ("segment_id") REFERENCES "app"."customer_segments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "customer_segment_evaluation_runs_version_fkey"
      FOREIGN KEY ("segment_version_id") REFERENCES "app"."customer_segment_versions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "customer_segment_evaluation_runs_mode_check"
      CHECK ("evaluation_mode" IN ('batch', 'realtime', 'hybrid', 'preview', 'manual')),
    CONSTRAINT "customer_segment_evaluation_runs_status_check"
      CHECK ("status" IN ('running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS "idx_segment_evaluation_runs_segment_time"
  ON "app"."customer_segment_evaluation_runs"("segment_id", "started_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_segment_evaluation_runs_status"
  ON "app"."customer_segment_evaluation_runs"("status");

CREATE TABLE IF NOT EXISTS "app"."customer_segment_current" (
    "customer_id" UUID NOT NULL,
    "segment_id" UUID NOT NULL,
    "segment_version_id" UUID NOT NULL,
    "score" DECIMAL(10,4),
    "reason_codes" JSONB,
    "entered_at" TIMESTAMPTZ(6) NOT NULL,
    "last_matched_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "evaluation_run_id" UUID,

    CONSTRAINT "customer_segment_current_pkey" PRIMARY KEY ("customer_id", "segment_id"),
    CONSTRAINT "customer_segment_current_customer_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "app"."customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customer_segment_current_segment_fkey"
      FOREIGN KEY ("segment_id") REFERENCES "app"."customer_segments"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customer_segment_current_version_fkey"
      FOREIGN KEY ("segment_version_id") REFERENCES "app"."customer_segment_versions"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "customer_segment_current_run_fkey"
      FOREIGN KEY ("evaluation_run_id") REFERENCES "app"."customer_segment_evaluation_runs"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_segment_current_segment_score"
  ON "app"."customer_segment_current"("segment_id", "score" DESC);
CREATE INDEX IF NOT EXISTS "idx_segment_current_customer"
  ON "app"."customer_segment_current"("customer_id");
CREATE INDEX IF NOT EXISTS "idx_segment_current_version"
  ON "app"."customer_segment_current"("segment_version_id");

CREATE TABLE IF NOT EXISTS "app"."customer_segment_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "segment_id" UUID NOT NULL,
    "segment_version_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "previous_score" DECIMAL(10,4),
    "score" DECIMAL(10,4),
    "reason_codes" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluation_run_id" UUID,

    CONSTRAINT "customer_segment_history_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_segment_history_customer_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "app"."customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customer_segment_history_segment_fkey"
      FOREIGN KEY ("segment_id") REFERENCES "app"."customer_segments"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customer_segment_history_version_fkey"
      FOREIGN KEY ("segment_version_id") REFERENCES "app"."customer_segment_versions"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "customer_segment_history_run_fkey"
      FOREIGN KEY ("evaluation_run_id") REFERENCES "app"."customer_segment_evaluation_runs"("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "customer_segment_history_event_type_check"
      CHECK ("event_type" IN ('entered', 'exited', 'refreshed', 'score_changed', 'version_changed'))
);

CREATE INDEX IF NOT EXISTS "idx_segment_history_customer_time"
  ON "app"."customer_segment_history"("customer_id", "occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_segment_history_segment_time"
  ON "app"."customer_segment_history"("segment_id", "occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_segment_history_run"
  ON "app"."customer_segment_history"("evaluation_run_id");

CREATE TABLE IF NOT EXISTS "app"."activation_audiences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "audience_key" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requested_by" UUID,
    "request" JSONB NOT NULL,
    "total_candidates" INTEGER NOT NULL DEFAULT 0,
    "eligible_customers" INTEGER NOT NULL DEFAULT 0,
    "holdout_customers" INTEGER NOT NULL DEFAULT 0,
    "activation_customers" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "error_message" TEXT,

    CONSTRAINT "activation_audiences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "activation_audiences_audience_key_key" UNIQUE ("audience_key"),
    CONSTRAINT "activation_audiences_status_check"
      CHECK ("status" IN ('building', 'ready', 'failed', 'expired'))
);

CREATE TABLE IF NOT EXISTS "app"."activation_audience_members" (
    "audience_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "treatment_group" TEXT NOT NULL,
    "suppression_reasons" JSONB,
    "segment_ids" UUID[] NOT NULL,
    "segment_version_ids" UUID[] NOT NULL,
    "score" DECIMAL(10,4),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_audience_members_pkey" PRIMARY KEY ("audience_id", "customer_id"),
    CONSTRAINT "activation_audience_members_audience_fkey"
      FOREIGN KEY ("audience_id") REFERENCES "app"."activation_audiences"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "activation_audience_members_customer_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "app"."customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "activation_audience_members_group_check"
      CHECK ("treatment_group" IN ('activation', 'holdout', 'suppressed'))
);

CREATE INDEX IF NOT EXISTS "idx_activation_audience_members_customer"
  ON "app"."activation_audience_members"("customer_id");
CREATE INDEX IF NOT EXISTS "idx_activation_audience_members_group"
  ON "app"."activation_audience_members"("audience_id", "treatment_group");

CREATE TABLE IF NOT EXISTS "app"."customer_segment_audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_segment_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_customer_segment_audit_entity"
  ON "app"."customer_segment_audit_log"("entity_type", "entity_id", "occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_customer_segment_audit_event"
  ON "app"."customer_segment_audit_log"("event_type", "occurred_at" DESC);
