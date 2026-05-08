-- Buyer Purchase Planning restart.
-- App-owned six-month buyer workbooks, separate from purchase_plan V2/V3.

CREATE TABLE IF NOT EXISTS "app"."store_category_carrying" (
  "store_id" INTEGER NOT NULL,
  "category_number" SMALLINT NOT NULL,
  "carries" BOOLEAN NOT NULL DEFAULT true,
  "source" VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
  "chain_code" VARCHAR(64),
  "note" TEXT,
  "updated_by" TEXT NOT NULL DEFAULT 'system',
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "store_category_carrying_pkey" PRIMARY KEY ("store_id", "category_number"),
  CONSTRAINT "store_category_carrying_source_check"
    CHECK ("source" IN ('SEED', 'CHAIN', 'MANUAL')),
  CONSTRAINT "store_category_carrying_store_fkey"
    FOREIGN KEY ("store_id") REFERENCES "app"."store_master"("number")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "store_category_carrying_category_fkey"
    FOREIGN KEY ("category_number") REFERENCES "app"."taxonomy_category"("number")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "store_category_carrying_category_idx"
  ON "app"."store_category_carrying"("category_number", "carries", "store_id");

CREATE INDEX IF NOT EXISTS "store_category_carrying_chain_idx"
  ON "app"."store_category_carrying"("chain_code", "category_number");

CREATE TABLE IF NOT EXISTS "app"."buyer_purchase_workbook" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "label" TEXT NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  "buying_season" VARCHAR(16) NOT NULL,
  "season_year" SMALLINT NOT NULL,
  "season_months" TEXT[] NOT NULL,
  "seed_store_id" INTEGER NOT NULL,
  "target_store_ids" INTEGER[] NOT NULL DEFAULT '{}',
  "buyer" TEXT NOT NULL DEFAULT 'buyer',
  "created_by" TEXT NOT NULL DEFAULT 'system',
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMPTZ(6),

  CONSTRAINT "buyer_purchase_workbook_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "buyer_purchase_workbook_status_check"
    CHECK ("status" IN ('DRAFT', 'ARCHIVED')),
  CONSTRAINT "buyer_purchase_workbook_season_check"
    CHECK ("buying_season" IN ('SPRING_SUMMER', 'FALL_WINTER')),
  CONSTRAINT "buyer_purchase_workbook_months_check"
    CHECK (COALESCE(array_length("season_months", 1), 0) = 6),
  CONSTRAINT "buyer_purchase_workbook_seed_store_fkey"
    FOREIGN KEY ("seed_store_id") REFERENCES "app"."store_master"("number")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "buyer_purchase_workbook_status_updated_idx"
  ON "app"."buyer_purchase_workbook"("status", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "buyer_purchase_workbook_season_idx"
  ON "app"."buyer_purchase_workbook"("buying_season", "season_year", "status");

CREATE TABLE IF NOT EXISTS "app"."buyer_purchase_category_card" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workbook_id" UUID NOT NULL,
  "department_number" SMALLINT,
  "department_label" TEXT NOT NULL,
  "category_number" SMALLINT NOT NULL,
  "category_label" TEXT NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'NOT_STARTED',
  "seed_store_id" INTEGER NOT NULL,
  "target_store_ids" INTEGER[] NOT NULL DEFAULT '{}',
  "suggested_new_sku_count" INTEGER NOT NULL DEFAULT 0,
  "suggested_carryover_sku_count" INTEGER NOT NULL DEFAULT 0,
  "target_new_sku_count" INTEGER NOT NULL DEFAULT 0,
  "target_carryover_sku_count" INTEGER NOT NULL DEFAULT 0,
  "history_json" JSONB,
  "attribute_mix_json" JSONB,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "buyer_purchase_category_card_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "buyer_purchase_category_card_workbook_fkey"
    FOREIGN KEY ("workbook_id") REFERENCES "app"."buyer_purchase_workbook"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_category_card_status_check"
    CHECK ("status" IN (
      'NOT_STARTED',
      'HISTORY_REVIEWED',
      'CARRYOVERS',
      'NEW_STYLES',
      'PO_LINKED',
      'COMPLETE'
    )),
  CONSTRAINT "buyer_purchase_category_card_category_fkey"
    FOREIGN KEY ("category_number") REFERENCES "app"."taxonomy_category"("number")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_category_card_seed_store_fkey"
    FOREIGN KEY ("seed_store_id") REFERENCES "app"."store_master"("number")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "buyer_purchase_category_card_key"
  ON "app"."buyer_purchase_category_card"("workbook_id", "category_number");

CREATE INDEX IF NOT EXISTS "buyer_purchase_category_card_status_idx"
  ON "app"."buyer_purchase_category_card"("workbook_id", "status", "category_number");

CREATE TABLE IF NOT EXISTS "app"."buyer_purchase_store_category_plan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workbook_id" UUID NOT NULL,
  "card_id" UUID NOT NULL,
  "store_id" INTEGER NOT NULL,
  "copied_from_store_id" INTEGER,
  "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  "target_new_sku_count" INTEGER NOT NULL DEFAULT 0,
  "target_carryover_sku_count" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "buyer_purchase_store_category_plan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "buyer_purchase_store_category_plan_workbook_fkey"
    FOREIGN KEY ("workbook_id") REFERENCES "app"."buyer_purchase_workbook"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_store_category_plan_card_fkey"
    FOREIGN KEY ("card_id") REFERENCES "app"."buyer_purchase_category_card"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_store_category_plan_store_fkey"
    FOREIGN KEY ("store_id") REFERENCES "app"."store_master"("number")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_store_category_plan_status_check"
    CHECK ("status" IN ('DRAFT', 'COPIED', 'EDITED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "buyer_purchase_store_category_plan_key"
  ON "app"."buyer_purchase_store_category_plan"("card_id", "store_id");

CREATE TABLE IF NOT EXISTS "app"."buyer_purchase_carryover_line" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workbook_id" UUID NOT NULL,
  "card_id" UUID NOT NULL,
  "store_id" INTEGER,
  "sku_id" UUID,
  "sku_code" VARCHAR(32) NOT NULL,
  "sku_description" TEXT,
  "color" TEXT,
  "size_cells" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "total_quantity" INTEGER NOT NULL DEFAULT 0,
  "source" VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
  "unavailable" BOOLEAN NOT NULL DEFAULT false,
  "unavailable_reason" TEXT,
  "replacement_style_id" UUID,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "buyer_purchase_carryover_line_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "buyer_purchase_carryover_line_workbook_fkey"
    FOREIGN KEY ("workbook_id") REFERENCES "app"."buyer_purchase_workbook"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_carryover_line_card_fkey"
    FOREIGN KEY ("card_id") REFERENCES "app"."buyer_purchase_category_card"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_carryover_line_sku_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_carryover_line_store_fkey"
    FOREIGN KEY ("store_id") REFERENCES "app"."store_master"("number")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_carryover_line_source_check"
    CHECK ("source" IN ('SEED', 'COPY', 'MANUAL', 'REORDER_PLANNER'))
);

CREATE INDEX IF NOT EXISTS "buyer_purchase_carryover_line_card_idx"
  ON "app"."buyer_purchase_carryover_line"("card_id", "store_id", "sku_code");

CREATE TABLE IF NOT EXISTS "app"."buyer_purchase_planned_style" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workbook_id" UUID NOT NULL,
  "card_id" UUID NOT NULL,
  "replacement_for_carryover_line_id" UUID,
  "vendor_code" VARCHAR(32),
  "vendor_name" TEXT,
  "working_style" TEXT,
  "description" TEXT,
  "color" TEXT,
  "color_family" TEXT,
  "attributes_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "quoted_unit_cost" NUMERIC(12,2),
  "target_new_sku_count" INTEGER NOT NULL DEFAULT 1,
  "target_units" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PLANNED',
  "linked_sku_id" UUID,
  "linked_sku_code" VARCHAR(32),
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "buyer_purchase_planned_style_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "buyer_purchase_planned_style_workbook_fkey"
    FOREIGN KEY ("workbook_id") REFERENCES "app"."buyer_purchase_workbook"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_planned_style_card_fkey"
    FOREIGN KEY ("card_id") REFERENCES "app"."buyer_purchase_category_card"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_planned_style_replacement_fkey"
    FOREIGN KEY ("replacement_for_carryover_line_id") REFERENCES "app"."buyer_purchase_carryover_line"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_planned_style_sku_fkey"
    FOREIGN KEY ("linked_sku_id") REFERENCES "app"."sku"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_planned_style_status_check"
    CHECK ("status" IN ('PLANNED', 'SELECTED', 'LINKED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS "buyer_purchase_planned_style_card_idx"
  ON "app"."buyer_purchase_planned_style"("card_id", "status", "vendor_code");

ALTER TABLE "app"."buyer_purchase_carryover_line"
  ADD CONSTRAINT "buyer_purchase_carryover_line_replacement_fkey"
  FOREIGN KEY ("replacement_style_id") REFERENCES "app"."buyer_purchase_planned_style"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "app"."buyer_purchase_po_link" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workbook_id" UUID NOT NULL,
  "card_id" UUID NOT NULL,
  "carryover_line_id" UUID,
  "planned_style_id" UUID,
  "po_id" UUID NOT NULL,
  "po_number" TEXT NOT NULL,
  "po_line_id" UUID,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "linked_by" TEXT NOT NULL DEFAULT 'system',
  "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "buyer_purchase_po_link_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "buyer_purchase_po_link_workbook_fkey"
    FOREIGN KEY ("workbook_id") REFERENCES "app"."buyer_purchase_workbook"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_po_link_card_fkey"
    FOREIGN KEY ("card_id") REFERENCES "app"."buyer_purchase_category_card"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_po_link_carryover_fkey"
    FOREIGN KEY ("carryover_line_id") REFERENCES "app"."buyer_purchase_carryover_line"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_po_link_style_fkey"
    FOREIGN KEY ("planned_style_id") REFERENCES "app"."buyer_purchase_planned_style"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_po_link_po_fkey"
    FOREIGN KEY ("po_id") REFERENCES "app"."purchase_order"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_po_link_po_line_fkey"
    FOREIGN KEY ("po_line_id") REFERENCES "app"."purchase_order_line"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_po_link_target_check"
    CHECK ("carryover_line_id" IS NOT NULL OR "planned_style_id" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "buyer_purchase_po_link_card_idx"
  ON "app"."buyer_purchase_po_link"("card_id", "po_number");

CREATE TABLE IF NOT EXISTS "app"."buyer_purchase_workbook_audit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workbook_id" UUID NOT NULL,
  "action" VARCHAR(48) NOT NULL,
  "actor" TEXT NOT NULL DEFAULT 'system',
  "before_json" JSONB,
  "after_json" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "buyer_purchase_workbook_audit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "buyer_purchase_workbook_audit_workbook_fkey"
    FOREIGN KEY ("workbook_id") REFERENCES "app"."buyer_purchase_workbook"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "buyer_purchase_workbook_audit_idx"
  ON "app"."buyer_purchase_workbook_audit"("workbook_id", "created_at" DESC);
