CREATE TABLE "app"."pos_register" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" SMALLINT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_register_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_register_store_fkey" FOREIGN KEY ("store_id") REFERENCES "app"."store_master"("number") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "app"."pos_tender_type" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" SMALLINT NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "requires_account" BOOLEAN NOT NULL DEFAULT false,
    "open_drawer" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_tender_type_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_tender_type_store_fkey" FOREIGN KEY ("store_id") REFERENCES "app"."store_master"("number") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "app"."pos_payout_category" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" SMALLINT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_payout_category_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_payout_category_store_fkey" FOREIGN KEY ("store_id") REFERENCES "app"."store_master"("number") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "app"."pos_shift" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" SMALLINT NOT NULL,
    "register_id" UUID NOT NULL,
    "register_code" VARCHAR(20) NOT NULL,
    "business_date" DATE NOT NULL,
    "opened_by_user_id" UUID NOT NULL,
    "opened_by_name" VARCHAR(120) NOT NULL,
    "opening_cash_float" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "last_ticket_number" INTEGER NOT NULL DEFAULT 0,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by_user_id" UUID,
    "closed_by_name" VARCHAR(120),
    "expected_cash_total" NUMERIC(12,2),
    "actual_cash_total" NUMERIC(12,2),
    "over_short_amount" NUMERIC(12,2),
    "count_summary_json" JSONB,
    "notes" TEXT,
    "posted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_shift_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_shift_store_fkey" FOREIGN KEY ("store_id") REFERENCES "app"."store_master"("number") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "pos_shift_register_fkey" FOREIGN KEY ("register_id") REFERENCES "app"."pos_register"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "pos_shift_status_check" CHECK ("status" IN ('OPEN', 'COUNTING', 'CLOSED', 'POSTED', 'VOIDED'))
);

CREATE TABLE "app"."pos_ticket" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shift_id" UUID NOT NULL,
    "store_id" SMALLINT NOT NULL,
    "register_id" UUID NOT NULL,
    "ticket_number" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "transaction_type" VARCHAR(32) NOT NULL DEFAULT 'REGULAR',
    "cashier_user_id" UUID NOT NULL,
    "cashier_name" VARCHAR(120) NOT NULL,
    "customer_id" UUID,
    "customer_account_number" VARCHAR(80),
    "customer_name" VARCHAR(160),
    "header_discount_pct" NUMERIC(5,2),
    "promotion_code" VARCHAR(40),
    "ship_to_state" VARCHAR(40),
    "subtotal" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "tax_total" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "secondary_tax_total" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "other_charges" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "grand_total" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "total_tendered" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "change_given" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "comment" TEXT,
    "receipt_payload_json" JSONB,
    "voided_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "reclaimed_from_ticket_id" UUID,
    "receipt_print_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_ticket_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_ticket_shift_fkey" FOREIGN KEY ("shift_id") REFERENCES "app"."pos_shift"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pos_ticket_store_fkey" FOREIGN KEY ("store_id") REFERENCES "app"."store_master"("number") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "pos_ticket_register_fkey" FOREIGN KEY ("register_id") REFERENCES "app"."pos_register"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "pos_ticket_status_check" CHECK ("status" IN ('DRAFT', 'COMPLETED', 'VOIDED'))
);

CREATE TABLE "app"."pos_ticket_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "sku_id" UUID,
    "sku_code" VARCHAR(15),
    "description" VARCHAR(160) NOT NULL,
    "upc" VARCHAR(16),
    "size_type_code" SMALLINT,
    "column_label" VARCHAR(40) NOT NULL DEFAULT '',
    "row_label" VARCHAR(40) NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL,
    "unit_price" NUMERIC(12,2) NOT NULL,
    "price_mode" VARCHAR(24) NOT NULL DEFAULT 'RETAIL',
    "discount_pct" NUMERIC(5,2),
    "discount_amount" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "tax_rate" NUMERIC(5,4) NOT NULL DEFAULT 0.15,
    "secondary_tax_rate" NUMERIC(5,4) NOT NULL DEFAULT 0,
    "salesperson_user_id" UUID,
    "salesperson_code" VARCHAR(16),
    "salesperson_name" VARCHAR(120),
    "family_member_id" UUID,
    "return_code" SMALLINT,
    "comment" TEXT,
    "line_subtotal" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "line_tax" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "line_secondary_tax" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "line_total" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_ticket_line_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_ticket_line_ticket_fkey" FOREIGN KEY ("ticket_id") REFERENCES "app"."pos_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "app"."pos_ticket_tender" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "tender_type_id" UUID NOT NULL,
    "tender_code" VARCHAR(10) NOT NULL,
    "tender_label" VARCHAR(80) NOT NULL,
    "tender_kind" VARCHAR(32) NOT NULL,
    "amount" NUMERIC(12,2) NOT NULL,
    "account_number" VARCHAR(80),
    "reference" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_ticket_tender_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_ticket_tender_ticket_fkey" FOREIGN KEY ("ticket_id") REFERENCES "app"."pos_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pos_ticket_tender_type_fkey" FOREIGN KEY ("tender_type_id") REFERENCES "app"."pos_tender_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "app"."pos_ticket_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "event_type" VARCHAR(40) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "actor_name" VARCHAR(120),
    "payload_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_ticket_event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_ticket_event_ticket_fkey" FOREIGN KEY ("ticket_id") REFERENCES "app"."pos_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pos_ticket_event_shift_fkey" FOREIGN KEY ("shift_id") REFERENCES "app"."pos_shift"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "app"."pos_payout" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shift_id" UUID NOT NULL,
    "store_id" SMALLINT NOT NULL,
    "register_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "category_code" VARCHAR(20) NOT NULL,
    "category_label" VARCHAR(80) NOT NULL,
    "cashier_user_id" UUID NOT NULL,
    "cashier_name" VARCHAR(120) NOT NULL,
    "amount" NUMERIC(12,2) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_payout_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_payout_shift_fkey" FOREIGN KEY ("shift_id") REFERENCES "app"."pos_shift"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pos_payout_store_fkey" FOREIGN KEY ("store_id") REFERENCES "app"."store_master"("number") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "pos_payout_register_fkey" FOREIGN KEY ("register_id") REFERENCES "app"."pos_register"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "pos_payout_category_fkey" FOREIGN KEY ("category_id") REFERENCES "app"."pos_payout_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "pos_register_store_code_key" ON "app"."pos_register"("store_id", "code");
CREATE INDEX "pos_register_store_active_idx" ON "app"."pos_register"("store_id", "active");

CREATE UNIQUE INDEX "pos_tender_type_store_code_key" ON "app"."pos_tender_type"("store_id", "code");
CREATE INDEX "pos_tender_type_store_active_sort_idx" ON "app"."pos_tender_type"("store_id", "active", "sort_order");

CREATE UNIQUE INDEX "pos_payout_category_store_code_key" ON "app"."pos_payout_category"("store_id", "code");
CREATE INDEX "pos_payout_category_store_active_sort_idx" ON "app"."pos_payout_category"("store_id", "active", "sort_order");

CREATE INDEX "pos_shift_store_business_status_idx" ON "app"."pos_shift"("store_id", "business_date", "status");
CREATE INDEX "pos_shift_register_status_idx" ON "app"."pos_shift"("register_id", "status");
CREATE UNIQUE INDEX "pos_shift_open_register_key" ON "app"."pos_shift"("register_id")
    WHERE "status" IN ('OPEN', 'COUNTING');

CREATE UNIQUE INDEX "pos_ticket_shift_ticket_number_key" ON "app"."pos_ticket"("shift_id", "ticket_number");
CREATE INDEX "pos_ticket_shift_status_idx" ON "app"."pos_ticket"("shift_id", "status");
CREATE INDEX "pos_ticket_store_completed_idx" ON "app"."pos_ticket"("store_id", "completed_at");
CREATE UNIQUE INDEX "pos_ticket_open_shift_key" ON "app"."pos_ticket"("shift_id")
    WHERE "status" = 'DRAFT';

CREATE UNIQUE INDEX "pos_ticket_line_ticket_line_number_key" ON "app"."pos_ticket_line"("ticket_id", "line_number");
CREATE INDEX "pos_ticket_line_ticket_idx" ON "app"."pos_ticket_line"("ticket_id");
CREATE INDEX "pos_ticket_line_sku_idx" ON "app"."pos_ticket_line"("sku_id");

CREATE UNIQUE INDEX "pos_ticket_tender_ticket_sequence_key" ON "app"."pos_ticket_tender"("ticket_id", "sequence");
CREATE INDEX "pos_ticket_tender_ticket_idx" ON "app"."pos_ticket_tender"("ticket_id");
CREATE INDEX "pos_ticket_tender_type_idx" ON "app"."pos_ticket_tender"("tender_type_id");

CREATE INDEX "pos_ticket_event_ticket_created_idx" ON "app"."pos_ticket_event"("ticket_id", "created_at");
CREATE INDEX "pos_ticket_event_shift_created_idx" ON "app"."pos_ticket_event"("shift_id", "created_at");

CREATE INDEX "pos_payout_shift_created_idx" ON "app"."pos_payout"("shift_id", "created_at");
CREATE INDEX "pos_payout_store_created_idx" ON "app"."pos_payout"("store_id", "created_at");

INSERT INTO "app"."pos_register" ("store_id", "code", "label")
SELECT "number", 'MAIN', 'Main Register'
FROM "app"."store_master"
ON CONFLICT ("store_id", "code") DO NOTHING;

INSERT INTO "app"."pos_tender_type" (
    "store_id", "code", "label", "kind", "requires_account", "open_drawer", "sort_order"
)
SELECT
    s."number",
    t."code",
    t."label",
    t."kind",
    t."requires_account",
    t."open_drawer",
    t."sort_order"
FROM "app"."store_master" s
CROSS JOIN (
    VALUES
        ('1', 'Cash', 'CASH', false, true, 10),
        ('2', 'Checks', 'CHECK', false, false, 20),
        ('3', 'Credomatic', 'CARD', false, false, 30),
        ('4', 'Card 2', 'CARD', false, false, 40),
        ('7', 'Credit Slip', 'CREDIT_SLIP', false, false, 50),
        ('9', 'House Charge', 'HOUSE_CHARGE', true, false, 60),
        ('10', 'Gift Card', 'GIFT_CARD', false, false, 70),
        ('11', 'Store Credit', 'STORE_CREDIT', true, false, 80),
        ('99', 'Continued', 'CONTINUATION', false, false, 90)
) AS t("code", "label", "kind", "requires_account", "open_drawer", "sort_order")
ON CONFLICT ("store_id", "code") DO NOTHING;

INSERT INTO "app"."pos_payout_category" ("store_id", "code", "label", "sort_order")
SELECT
    s."number",
    p."code",
    p."label",
    p."sort_order"
FROM "app"."store_master" s
CROSS JOIN (
    VALUES
        ('PETTY', 'Petty Cash', 10),
        ('POSTAGE', 'Postage', 20),
        ('BANK', 'Bank Deposit', 30)
) AS p("code", "label", "sort_order")
ON CONFLICT ("store_id", "code") DO NOTHING;
