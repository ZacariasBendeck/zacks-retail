-- Buyer Checklist seasonal No Budget decisions.

ALTER TABLE "app"."buyer_purchase_category_card"
  DROP CONSTRAINT IF EXISTS "buyer_purchase_category_card_status_check";

ALTER TABLE "app"."buyer_purchase_category_card"
  ADD CONSTRAINT "buyer_purchase_category_card_status_check"
    CHECK ("status" IN (
      'NOT_STARTED',
      'HISTORY_REVIEWED',
      'CARRYOVER_REVIEW',
      'CARRYOVERS',
      'NEW_STYLES',
      'PO_LINKED',
      'COMPLETE',
      'NO_BUDGET'
    ));

CREATE TABLE IF NOT EXISTS "app"."buyer_purchase_no_budget_category" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "category_number" SMALLINT NOT NULL,
  "buying_season" VARCHAR(16) NOT NULL,
  "season_year" SMALLINT NOT NULL,
  "buyer_code" TEXT,
  "note" TEXT,
  "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  "marked_by" TEXT NOT NULL DEFAULT 'system',
  "marked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reopened_by" TEXT,
  "reopened_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "buyer_purchase_no_budget_category_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "buyer_purchase_no_budget_category_category_fkey"
    FOREIGN KEY ("category_number") REFERENCES "app"."taxonomy_category"("number")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_no_budget_category_season_check"
    CHECK ("buying_season" IN ('SPRING_SUMMER', 'FALL_WINTER')),
  CONSTRAINT "buyer_purchase_no_budget_category_status_check"
    CHECK ("status" IN ('ACTIVE', 'REOPENED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "buyer_purchase_no_budget_category_active_key"
  ON "app"."buyer_purchase_no_budget_category"("category_number", "buying_season", "season_year")
  WHERE "status" = 'ACTIVE';

CREATE INDEX IF NOT EXISTS "buyer_purchase_no_budget_category_season_idx"
  ON "app"."buyer_purchase_no_budget_category"("buying_season", "season_year", "status", "category_number");
