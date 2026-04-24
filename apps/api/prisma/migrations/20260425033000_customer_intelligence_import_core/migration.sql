-- Customer-intelligence direct CSV import foundation.
-- Adds app-owned customer import tables per
-- docs/modules/customer-intelligence-module/schema.md and
-- docs/modules/customer-intelligence-module/import.md.
--
-- This surface is intentionally independent from rics_mirror:
-- customer data lands directly in app.* from CSV imports and request-path
-- customer functionality must not depend on rics_mirror as its source.

CREATE TABLE "app"."customer_import_batch" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'rics_csv',
    "file_name" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "customer_import_batch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_import_batch_started_at_idx"
    ON "app"."customer_import_batch"("started_at");

CREATE TABLE "app"."customer" (
    "id" UUID NOT NULL,
    "honduran_id_raw" TEXT,
    "honduran_id_normalized" TEXT,
    "full_name" TEXT,
    "gender" TEXT,
    "birth_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'rics_csv',
    "first_seen_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6),
    "imported_from_batch_id" UUID,
    "rics_account" TEXT,
    "rics_code" TEXT,
    "rics_date_added" TIMESTAMPTZ(6),
    "rics_date_last_changed" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_honduran_id_normalized_key"
    ON "app"."customer"("honduran_id_normalized");
CREATE UNIQUE INDEX "customer_rics_account_key"
    ON "app"."customer"("rics_account");
CREATE UNIQUE INDEX "customer_rics_code_key"
    ON "app"."customer"("rics_code");
CREATE INDEX "customer_imported_from_batch_idx"
    ON "app"."customer"("imported_from_batch_id");

ALTER TABLE "app"."customer"
    ADD CONSTRAINT "customer_imported_from_batch_id_fkey"
    FOREIGN KEY ("imported_from_batch_id") REFERENCES "app"."customer_import_batch"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "app"."customer_identity" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "identity_type" TEXT NOT NULL,
    "identity_value" TEXT NOT NULL,
    "normalized_value" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'rics_csv',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_identity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_identity_type_check"
      CHECK ("identity_type" IN ('honduran_id', 'rics_account', 'rics_code', 'email', 'phone', 'webstore_user_id'))
);

CREATE UNIQUE INDEX "customer_identity_type_normalized_key"
    ON "app"."customer_identity"("identity_type", "normalized_value");
CREATE INDEX "customer_identity_customer_idx"
    ON "app"."customer_identity"("customer_id");
CREATE INDEX "customer_identity_normalized_idx"
    ON "app"."customer_identity"("normalized_value");

ALTER TABLE "app"."customer_identity"
    ADD CONSTRAINT "customer_identity_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "app"."customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "app"."customer_contact" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "contact_type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalized_value" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "accepts_marketing" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'rics_csv',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_contact_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_contact_type_check"
      CHECK ("contact_type" IN ('email', 'phone', 'whatsapp'))
);

CREATE INDEX "customer_contact_customer_idx"
    ON "app"."customer_contact"("customer_id");
CREATE INDEX "customer_contact_lookup_idx"
    ON "app"."customer_contact"("contact_type", "normalized_value");

ALTER TABLE "app"."customer_contact"
    ADD CONSTRAINT "customer_contact_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "app"."customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "app"."customer_address" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "addr1" TEXT,
    "addr2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "county" TEXT,
    "zip" TEXT,
    "country" TEXT NOT NULL DEFAULT 'HN',
    "source" TEXT NOT NULL DEFAULT 'rics_csv',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_address_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_address_customer_idx"
    ON "app"."customer_address"("customer_id");

ALTER TABLE "app"."customer_address"
    ADD CONSTRAINT "customer_address_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "app"."customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "app"."customer_legacy_profile" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "customer_extra_01" TEXT,
    "customer_extra_02" TEXT,
    "customer_extra_03" TEXT,
    "customer_extra_04" TEXT,
    "customer_extra_05" TEXT,
    "customer_extra_06" TEXT,
    "mail_extra_01" TEXT,
    "mail_extra_02" TEXT,
    "mail_extra_03" TEXT,
    "mail_extra_04" TEXT,
    "mail_extra_05" TEXT,
    "mail_extra_06" TEXT,
    "customer_comment" TEXT,
    "mail_comment" TEXT,
    "change_to" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_legacy_profile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_legacy_profile_customer_id_key"
    ON "app"."customer_legacy_profile"("customer_id");

ALTER TABLE "app"."customer_legacy_profile"
    ADD CONSTRAINT "customer_legacy_profile_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "app"."customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "app"."customer_financial_profile" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "credit_limit" DECIMAL(18,4),
    "current_balance" DECIMAL(18,4),
    "credit_slip_balance" DECIMAL(18,4),
    "non_taxable" BOOLEAN NOT NULL DEFAULT false,
    "plan_num" SMALLINT,
    "plan_count" SMALLINT,
    "plan_dollars" DECIMAL(18,4),
    "plan_last_credit_at" TIMESTAMPTZ(6),
    "plan_credit_balance" DECIMAL(18,4),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_financial_profile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_financial_profile_customer_id_key"
    ON "app"."customer_financial_profile"("customer_id");

ALTER TABLE "app"."customer_financial_profile"
    ADD CONSTRAINT "customer_financial_profile_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "app"."customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "app"."customer_sales_summary_legacy" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "date_last_purchase" TIMESTAMPTZ(6),
    "qty_sales_01" INTEGER,
    "qty_sales_02" INTEGER,
    "qty_sales_03" INTEGER,
    "qty_sales_04" INTEGER,
    "dollar_sales_01" DECIMAL(18,4),
    "dollar_sales_02" DECIMAL(18,4),
    "dollar_sales_03" DECIMAL(18,4),
    "dollar_sales_04" DECIMAL(18,4),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sales_summary_legacy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_sales_summary_legacy_customer_id_key"
    ON "app"."customer_sales_summary_legacy"("customer_id");

ALTER TABLE "app"."customer_sales_summary_legacy"
    ADD CONSTRAINT "customer_sales_summary_legacy_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "app"."customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "app"."customer_import_reject" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "source_file" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "account" TEXT,
    "code" TEXT,
    "name" TEXT,
    "honduran_id_raw" TEXT,
    "honduran_id_normalized" TEXT,
    "email" TEXT,
    "reject_reason" TEXT NOT NULL,
    "raw_row" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_import_reject_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_import_reject_batch_idx"
    ON "app"."customer_import_reject"("batch_id");
CREATE INDEX "customer_import_reject_reason_idx"
    ON "app"."customer_import_reject"("reject_reason");

ALTER TABLE "app"."customer_import_reject"
    ADD CONSTRAINT "customer_import_reject_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "app"."customer_import_batch"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
