-- crm module — Customer + FamilyMember tables.
-- Migrates the last two customer-related tables out of the legacy SQLite admin DB
-- into Postgres. Paired with deletion of the SQLite CREATE TABLE blocks in
-- apps/api/src/db/database.ts (migration 0017) and the service layer flip to
-- Prisma in apps/api/src/services/customerService.ts.
--
-- No data backfill — SQLite had no live customer data on any environment we care
-- about. Fresh tables, clean cut.

-- CreateTable: customers
CREATE TABLE "app"."customers" (
    "id" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "phone_e164" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state_region" TEXT,
    "postal_code" TEXT,
    "country" TEXT,
    "credit_limit" DECIMAL(12,2),
    "alert_flag" BOOLEAN NOT NULL DEFAULT false,
    "alert_message" TEXT,
    "comments" TEXT,
    "ptd_qty" INTEGER NOT NULL DEFAULT 0,
    "ptd_sales_cents" INTEGER NOT NULL DEFAULT 0,
    "ytd_qty" INTEGER NOT NULL DEFAULT 0,
    "ytd_sales_cents" INTEGER NOT NULL DEFAULT 0,
    "ttd_qty" INTEGER NOT NULL DEFAULT 0,
    "ttd_sales_cents" INTEGER NOT NULL DEFAULT 0,
    "last_year_sales_cents" INTEGER NOT NULL DEFAULT 0,
    "date_added" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_of_last_purchase" TIMESTAMP(3),
    "last_known_ar_balance_cents" INTEGER NOT NULL DEFAULT 0,
    "ar_balance_as_of" TIMESTAMP(3),
    "last_known_store_credit_cents" INTEGER NOT NULL DEFAULT 0,
    "store_credit_as_of" TIMESTAMP(3),
    "extra_fields_json" JSONB,
    "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- Account number must be unique across the whole tenant (matches the RICS
-- "Mailing List Account #" constraint at Ch. 9 p. 117).
CREATE UNIQUE INDEX "customers_account_number_key" ON "app"."customers"("account_number");

-- Lookup indexes the service's list / search queries depend on.
CREATE INDEX "customers_phone_idx" ON "app"."customers"("phone_e164");
CREATE INDEX "customers_last_first_idx" ON "app"."customers"("last_name", "first_name");
CREATE INDEX "customers_postal_idx" ON "app"."customers"("postal_code");

-- CreateTable: customer_family_members
CREATE TABLE "app"."customer_family_members" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "gender" TEXT,
    "birthday" TEXT,
    "comments" TEXT,
    "alert_flag" BOOLEAN NOT NULL DEFAULT false,
    "alert_message" TEXT,
    "extra_fields_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_family_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_family_members_customer_id_code_key"
    ON "app"."customer_family_members"("customer_id", "code");

CREATE INDEX "customer_family_members_customer_idx"
    ON "app"."customer_family_members"("customer_id");

ALTER TABLE "app"."customer_family_members"
    ADD CONSTRAINT "customer_family_members_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "app"."customers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
