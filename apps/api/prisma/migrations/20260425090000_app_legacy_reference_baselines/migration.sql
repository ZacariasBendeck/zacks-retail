-- Promote the remaining MDB-derived reference / legacy baseline tables into
-- app.* so request paths and rehearsal imports no longer depend on
-- rics_mirror for these surfaces.
--
-- Included:
--   - vendor + vendor_store_account
--   - store_master
--   - sku_upc
--   - case_pack + case_pack_cell
--   - future_price_change
--   - purchase_order_legacy + purchase_order_legacy_line
--   - asn_carton_legacy + asn_carton_legacy_line
--   - transfer_legacy_summary

CREATE TABLE "app"."vendor" (
    "code" VARCHAR(4) NOT NULL,
    "short_name" TEXT NOT NULL,
    "mail_name" TEXT NOT NULL,
    "addr1" TEXT,
    "addr2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "contact" TEXT,
    "terms" TEXT,
    "ship_inst" TEXT,
    "comment" TEXT,
    "manu_code" TEXT,
    "manu_name" TEXT,
    "qualifier_id" TEXT,
    "qualifier_code" TEXT,
    "color_code" BOOLEAN NOT NULL DEFAULT false,
    "long_comment" TEXT,
    "e_mail" TEXT,
    "date_last_changed" TIMESTAMP(3),

    CONSTRAINT "vendor_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "app"."vendor_store_account" (
    "vendor_code" VARCHAR(4) NOT NULL,
    "store_id" SMALLINT NOT NULL,
    "account" TEXT NOT NULL DEFAULT '',
    "date_last_changed" TIMESTAMP(3),

    CONSTRAINT "vendor_store_account_pkey" PRIMARY KEY ("vendor_code", "store_id")
);

CREATE INDEX "vendor_store_account_store_id_idx"
    ON "app"."vendor_store_account"("store_id");

ALTER TABLE "app"."vendor_store_account"
    ADD CONSTRAINT "vendor_store_account_vendor_code_fkey"
    FOREIGN KEY ("vendor_code") REFERENCES "app"."vendor"("code")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "app"."store_master" (
    "number" SMALLINT NOT NULL,
    "desc" TEXT NOT NULL,
    "mail_name" TEXT,
    "addr1" TEXT,
    "addr2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "e_mail" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "last_ticket" INTEGER,
    "bill_mail_name" TEXT,
    "bill_addr1" TEXT,
    "bill_addr2" TEXT,
    "bill_city" TEXT,
    "bill_state" TEXT,
    "bill_zip" TEXT,
    "other_charge_desc" TEXT,
    "region" SMALLINT,
    "date_last_changed" TIMESTAMP(3),
    "raw_json" JSONB NOT NULL,

    CONSTRAINT "store_master_pkey" PRIMARY KEY ("number")
);

CREATE TABLE "app"."sku_upc" (
    "upc" VARCHAR(16) NOT NULL,
    "sku_code" VARCHAR(15) NOT NULL,
    "sku_id" UUID,
    "column_label" TEXT NOT NULL DEFAULT '',
    "row_label" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'RICS_IMPORT',
    "vendor_sku" TEXT,
    "nrma_code" TEXT,
    "status" CHAR(1),
    "legacy_prefix" TEXT,
    "legacy_number" TEXT,
    "legacy_check_digit" TEXT,
    "date_last_changed" TIMESTAMP(3),

    CONSTRAINT "sku_upc_pkey" PRIMARY KEY ("upc")
);

CREATE INDEX "sku_upc_sku_code_idx"
    ON "app"."sku_upc"("sku_code");
CREATE INDEX "sku_upc_sku_id_idx"
    ON "app"."sku_upc"("sku_id");
CREATE INDEX "sku_upc_vendor_sku_idx"
    ON "app"."sku_upc"("vendor_sku");

ALTER TABLE "app"."sku_upc"
    ADD CONSTRAINT "sku_upc_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "app"."case_pack" (
    "code" VARCHAR(6) NOT NULL,
    "desc" TEXT NOT NULL,
    "size_type_code" SMALLINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "date_last_changed" TIMESTAMP(3),

    CONSTRAINT "case_pack_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "case_pack_size_type_code_idx"
    ON "app"."case_pack"("size_type_code");

CREATE TABLE "app"."case_pack_cell" (
    "case_pack_code" VARCHAR(6) NOT NULL,
    "column_label" TEXT NOT NULL,
    "row_label" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "case_pack_cell_pkey" PRIMARY KEY ("case_pack_code", "column_label", "row_label")
);

CREATE INDEX "case_pack_cell_case_pack_code_idx"
    ON "app"."case_pack_cell"("case_pack_code");

ALTER TABLE "app"."case_pack_cell"
    ADD CONSTRAINT "case_pack_cell_case_pack_code_fkey"
    FOREIGN KEY ("case_pack_code") REFERENCES "app"."case_pack"("code")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "app"."future_price_change" (
    "id" UUID NOT NULL,
    "import_key" TEXT NOT NULL,
    "sku_code" VARCHAR(15) NOT NULL,
    "sku_id" UUID,
    "store_id" SMALLINT NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL,
    "change_master" BOOLEAN NOT NULL DEFAULT false,
    "revert" BOOLEAN NOT NULL DEFAULT false,
    "list_price" DECIMAL(12,2),
    "retail_price" DECIMAL(12,2),
    "mark_down_price1" DECIMAL(12,2),
    "mark_down_price2" DECIMAL(12,2),
    "current_price_slot" TEXT,
    "over_size_amount" DECIMAL(12,2),
    "perks" DECIMAL(12,2),
    "source" TEXT NOT NULL DEFAULT 'RICS_IMPORT',
    "date_last_changed" TIMESTAMP(3),

    CONSTRAINT "future_price_change_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "future_price_change_import_key"
    ON "app"."future_price_change"("import_key");
CREATE INDEX "future_price_change_sku_effective_at_idx"
    ON "app"."future_price_change"("sku_code", "effective_at");
CREATE INDEX "future_price_change_store_effective_at_idx"
    ON "app"."future_price_change"("store_id", "effective_at");

ALTER TABLE "app"."future_price_change"
    ADD CONSTRAINT "future_price_change_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "app"."purchase_order_legacy" (
    "po_number" TEXT NOT NULL,
    "bill_store" SMALLINT,
    "ship_store" SMALLINT,
    "vendor_code" TEXT,
    "confirmation" TEXT,
    "account" TEXT,
    "terms" TEXT,
    "ship_via" TEXT,
    "back_order" BOOLEAN NOT NULL DEFAULT false,
    "split_shipment" BOOLEAN NOT NULL DEFAULT false,
    "order_date" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "cancel_date" TIMESTAMP(3),
    "payment_date" TIMESTAMP(3),
    "last_received_at" TIMESTAMP(3),
    "comment" TEXT,
    "export_flag" BOOLEAN NOT NULL DEFAULT false,
    "export_comment" TEXT,
    "order_type" TEXT,
    "release_dt" TEXT,
    "department" TEXT,
    "buyer" TEXT,
    "not_before" TIMESTAMP(3),
    "not_after" TIMESTAMP(3),
    "ship_code" TEXT,
    "carrier" TEXT,
    "terms_period" TEXT,
    "terms_day" TEXT,
    "current" BOOLEAN,
    "legacy_status" TEXT,
    "date_last_changed" TIMESTAMP(3),

    CONSTRAINT "purchase_order_legacy_pkey" PRIMARY KEY ("po_number")
);

CREATE INDEX "purchase_order_legacy_vendor_code_idx"
    ON "app"."purchase_order_legacy"("vendor_code");
CREATE INDEX "purchase_order_legacy_ship_store_order_date_idx"
    ON "app"."purchase_order_legacy"("ship_store", "order_date");

CREATE TABLE "app"."purchase_order_legacy_line" (
    "po_number" TEXT NOT NULL,
    "sku_code" VARCHAR(15) NOT NULL,
    "sku_id" UUID,
    "row_label" TEXT NOT NULL DEFAULT '',
    "segment" SMALLINT NOT NULL,
    "ordered_qtys" INTEGER[] NOT NULL,
    "received_qtys" INTEGER[] NOT NULL,
    "cost" DECIMAL(12,2),
    "vendor_code" TEXT,
    "case_pack_code" TEXT,
    "case_multiplier" SMALLINT,
    "date_last_changed" TIMESTAMP(3),

    CONSTRAINT "purchase_order_legacy_line_pkey" PRIMARY KEY ("po_number", "sku_code", "row_label", "segment")
);

CREATE INDEX "purchase_order_legacy_line_sku_code_idx"
    ON "app"."purchase_order_legacy_line"("sku_code");
CREATE INDEX "purchase_order_legacy_line_sku_id_idx"
    ON "app"."purchase_order_legacy_line"("sku_id");

ALTER TABLE "app"."purchase_order_legacy_line"
    ADD CONSTRAINT "purchase_order_legacy_line_po_number_fkey"
    FOREIGN KEY ("po_number") REFERENCES "app"."purchase_order_legacy"("po_number")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."purchase_order_legacy_line"
    ADD CONSTRAINT "purchase_order_legacy_line_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "app"."asn_carton_legacy" (
    "carton_number" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "received_at" TIMESTAMP(3),
    "status" TEXT,
    "date_last_changed" TIMESTAMP(3),

    CONSTRAINT "asn_carton_legacy_pkey" PRIMARY KEY ("carton_number", "po_number")
);

CREATE INDEX "asn_carton_legacy_po_number_idx"
    ON "app"."asn_carton_legacy"("po_number");

CREATE TABLE "app"."asn_carton_legacy_line" (
    "carton_number" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "upc" TEXT NOT NULL,
    "quantity" SMALLINT NOT NULL,
    "date_last_changed" TIMESTAMP(3),

    CONSTRAINT "asn_carton_legacy_line_pkey" PRIMARY KEY ("carton_number", "po_number", "upc")
);

CREATE INDEX "asn_carton_legacy_line_po_number_idx"
    ON "app"."asn_carton_legacy_line"("po_number");

ALTER TABLE "app"."asn_carton_legacy_line"
    ADD CONSTRAINT "asn_carton_legacy_line_carton_fkey"
    FOREIGN KEY ("carton_number", "po_number") REFERENCES "app"."asn_carton_legacy"("carton_number", "po_number")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "app"."transfer_legacy_summary" (
    "id" UUID NOT NULL,
    "import_key" TEXT NOT NULL,
    "from_store_id" SMALLINT NOT NULL,
    "legacy_type" TEXT NOT NULL,
    "to_store_id" SMALLINT NOT NULL,
    "transferred_at" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" DECIMAL(12,2),

    CONSTRAINT "transfer_legacy_summary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transfer_legacy_summary_import_key"
    ON "app"."transfer_legacy_summary"("import_key");
CREATE INDEX "transfer_legacy_summary_from_store_idx"
    ON "app"."transfer_legacy_summary"("from_store_id", "transferred_at");
CREATE INDEX "transfer_legacy_summary_to_store_idx"
    ON "app"."transfer_legacy_summary"("to_store_id", "transferred_at");
