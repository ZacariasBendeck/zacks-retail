-- Inventory module: additive balancing transfer v2 persistence.
-- Keeps legacy balancing_transfer_run intact while adding a richer v2 row
-- shape for the strategic preview engine.

DO $$ BEGIN
  CREATE TYPE "app"."BalancingGoalPreset" AS ENUM ('DAILY_RESCUE', 'WEEKLY_BALANCE', 'SEASONAL_CONSOLIDATION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "app"."balancing_transfer_run_v2" (
    "id" UUID NOT NULL,
    "status" "app"."RunStatus" NOT NULL,
    "goal_preset" "app"."BalancingGoalPreset" NOT NULL,
    "balancing_method" "app"."BalancingMethod" NOT NULL,
    "performance_metric" "app"."PerformanceMetric" NOT NULL,
    "sales_period" "app"."SalesPeriod" NOT NULL,
    "sort_order" "app"."TransferSort" NOT NULL,
    "tie_break_kind" "app"."TieBreakKind" NOT NULL,
    "tie_break_value" DECIMAL(12,2) NOT NULL,
    "transfer_doubles_to_lower_priority" BOOLEAN NOT NULL DEFAULT false,
    "strip_stores_below_size_count" INTEGER,
    "in_transit_pos" BOOLEAN NOT NULL DEFAULT false,
    "allow_low_confidence_moves" BOOLEAN NOT NULL DEFAULT false,
    "cooldown_days" INTEGER NOT NULL DEFAULT 14,
    "protect_days_override" INTEGER,
    "requested_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previewed_at" TIMESTAMP(3),
    "committed_at" TIMESTAMP(3),
    "generated_transfer_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "criteria_json" JSONB NOT NULL,
    "summary_json" JSONB NOT NULL,
    "lines_json" JSONB NOT NULL,
    "exceptions_json" JSONB,
    "comparison_json" JSONB,
    "compared_legacy_run_id" UUID,

    CONSTRAINT "balancing_transfer_run_v2_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "balancing_transfer_run_v2_status_created_at_idx"
    ON "app"."balancing_transfer_run_v2"("status", "created_at" DESC);
CREATE INDEX "balancing_transfer_run_v2_goal_preset_idx"
    ON "app"."balancing_transfer_run_v2"("goal_preset");
CREATE INDEX "balancing_transfer_run_v2_method_idx"
    ON "app"."balancing_transfer_run_v2"("balancing_method");
