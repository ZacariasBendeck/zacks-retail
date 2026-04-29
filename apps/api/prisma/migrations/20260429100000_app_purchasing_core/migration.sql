-- Purchasing module: native Postgres PO core.
-- RICS remains operational until cutover; this schema is the app-owned write
-- surface for rehearsal/development POs and the cutover target.

CREATE SEQUENCE "app"."purchase_order_number_seq"
    AS INTEGER
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE "app"."purchase_order" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "po_number" VARCHAR(32) NOT NULL,
    "bill_to_store_id" SMALLINT,
    "ship_to_store_id" SMALLINT,
    "vendor_code" VARCHAR(4) NOT NULL,
    "order_type" VARCHAR(8) NOT NULL DEFAULT 'RO',
    "classification" VARCHAR(16) NOT NULL DEFAULT 'AT_ONCE',
    "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "origin" VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
    "origin_source_po_id" UUID,
    "confirmation_number" TEXT,
    "account_number" TEXT,
    "terms" TEXT,
    "ship_via" TEXT,
    "backorder_allowed" BOOLEAN NOT NULL DEFAULT false,
    "split_shipment" BOOLEAN NOT NULL DEFAULT false,
    "program_code" TEXT,
    "store_labels_on_receive" BOOLEAN NOT NULL DEFAULT false,
    "comments" TEXT,
    "order_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ship_date" TIMESTAMPTZ,
    "cancel_date" TIMESTAMPTZ,
    "payment_date" TIMESTAMPTZ,
    "created_by" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_order_status_check" CHECK ("status" IN ('DRAFT','SUBMITTED','CONFIRMED','PARTIALLY_RECEIVED','RECEIVED','CLOSED','CANCELLED')),
    CONSTRAINT "purchase_order_classification_check" CHECK ("classification" IN ('AT_ONCE','FUTURE')),
    CONSTRAINT "purchase_order_origin_check" CHECK ("origin" IN ('MANUAL','DUPLICATE','REPLICATE','AUTO','MERGED','ASN_INBOUND')),
    CONSTRAINT "purchase_order_order_type_check" CHECK ("order_type" IN ('RO','RE','SA'))
);

CREATE UNIQUE INDEX "purchase_order_po_number_key"
    ON "app"."purchase_order"("po_number");
CREATE INDEX "purchase_order_vendor_status_idx"
    ON "app"."purchase_order"("vendor_code", "status");
CREATE INDEX "purchase_order_ship_store_ship_date_idx"
    ON "app"."purchase_order"("ship_to_store_id", "ship_date");
CREATE INDEX "purchase_order_classification_status_idx"
    ON "app"."purchase_order"("classification", "status");

CREATE TABLE "app"."purchase_order_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "po_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "line_sequence" INTEGER NOT NULL,
    "case_pack_id" TEXT,
    "case_pack_multiplier" INTEGER DEFAULT 1,
    "retail_price" DECIMAL(12,2),
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "quantity_ordered" INTEGER NOT NULL,
    "quantity_received" INTEGER NOT NULL DEFAULT 0,
    "write_back_to_master" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_line_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_order_line_quantity_ordered_check" CHECK ("quantity_ordered" > 0),
    CONSTRAINT "purchase_order_line_quantity_received_check" CHECK ("quantity_received" >= 0 AND "quantity_received" <= "quantity_ordered"),
    CONSTRAINT "purchase_order_line_unit_cost_check" CHECK ("unit_cost" >= 0)
);

CREATE UNIQUE INDEX "purchase_order_line_sequence_key"
    ON "app"."purchase_order_line"("po_id", "line_sequence");
CREATE INDEX "purchase_order_line_po_id_idx"
    ON "app"."purchase_order_line"("po_id");
CREATE INDEX "purchase_order_line_sku_id_idx"
    ON "app"."purchase_order_line"("sku_id");

ALTER TABLE "app"."purchase_order_line"
    ADD CONSTRAINT "purchase_order_line_po_id_fkey"
    FOREIGN KEY ("po_id") REFERENCES "app"."purchase_order"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."purchase_order_line"
    ADD CONSTRAINT "purchase_order_line_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "app"."purchase_order_line_size_cell" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "po_line_id" UUID NOT NULL,
    "column_label" TEXT NOT NULL DEFAULT '',
    "row_label" TEXT NOT NULL DEFAULT '',
    "quantity_ordered" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_line_size_cell_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_order_line_size_cell_quantity_check" CHECK ("quantity_ordered" > 0)
);

CREATE UNIQUE INDEX "purchase_order_line_size_cell_key"
    ON "app"."purchase_order_line_size_cell"("po_line_id", "column_label", "row_label");

ALTER TABLE "app"."purchase_order_line_size_cell"
    ADD CONSTRAINT "purchase_order_line_size_cell_po_line_id_fkey"
    FOREIGN KEY ("po_line_id") REFERENCES "app"."purchase_order_line"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "app"."po_receipt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "po_id" UUID NOT NULL,
    "received_at_store_id" SMALLINT,
    "received_by" TEXT NOT NULL,
    "reference_number" TEXT,
    "idempotency_key" TEXT,
    "asn_carton_id" UUID,
    "mode" VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
    "discount_percent" DECIMAL(5,2) DEFAULT 0,
    "freight_each" DECIMAL(12,2) DEFAULT 0,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversal_of_receipt_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "po_receipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "po_receipt_mode_check" CHECK ("mode" IN ('MANUAL','FULL','SCAN','ASN'))
);

CREATE UNIQUE INDEX "po_receipt_idempotency_key"
    ON "app"."po_receipt"("idempotency_key");
CREATE INDEX "po_receipt_po_received_at_idx"
    ON "app"."po_receipt"("po_id", "received_at" DESC);

ALTER TABLE "app"."po_receipt"
    ADD CONSTRAINT "po_receipt_po_id_fkey"
    FOREIGN KEY ("po_id") REFERENCES "app"."purchase_order"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "app"."po_receipt_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_id" UUID NOT NULL,
    "po_line_id" UUID,
    "sku_id" UUID NOT NULL,
    "column_label" TEXT NOT NULL DEFAULT '',
    "row_label" TEXT NOT NULL DEFAULT '',
    "quantity_received" INTEGER NOT NULL,
    "effective_unit_cost" DECIMAL(12,2) NOT NULL,
    "discrepancy_reason" TEXT,
    "audit_reference" TEXT,
    "movement_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "po_receipt_line_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "po_receipt_line_quantity_nonzero_check" CHECK ("quantity_received" <> 0)
);

CREATE INDEX "po_receipt_line_receipt_id_idx"
    ON "app"."po_receipt_line"("receipt_id");
CREATE INDEX "po_receipt_line_po_line_id_idx"
    ON "app"."po_receipt_line"("po_line_id");
CREATE INDEX "po_receipt_line_sku_id_idx"
    ON "app"."po_receipt_line"("sku_id");

ALTER TABLE "app"."po_receipt_line"
    ADD CONSTRAINT "po_receipt_line_receipt_id_fkey"
    FOREIGN KEY ("receipt_id") REFERENCES "app"."po_receipt"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."po_receipt_line"
    ADD CONSTRAINT "po_receipt_line_po_line_id_fkey"
    FOREIGN KEY ("po_line_id") REFERENCES "app"."purchase_order_line"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."po_receipt_line"
    ADD CONSTRAINT "po_receipt_line_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."po_receipt_line"
    ADD CONSTRAINT "po_receipt_line_movement_id_fkey"
    FOREIGN KEY ("movement_id") REFERENCES "app"."stock_movement"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "app"."po_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "po_id" UUID NOT NULL,
    "from_status" VARCHAR(32),
    "to_status" VARCHAR(32) NOT NULL,
    "changed_by" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "po_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "po_status_history_po_created_at_idx"
    ON "app"."po_status_history"("po_id", "created_at");

ALTER TABLE "app"."po_status_history"
    ADD CONSTRAINT "po_status_history_po_id_fkey"
    FOREIGN KEY ("po_id") REFERENCES "app"."purchase_order"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
