-- Inventory write cutover support.
-- Extends the Postgres inventory tables to preserve the current API contract
-- (versioning + idempotency/source refs) and adds Postgres-backed adjustment
-- document tables so inventory writes no longer need the legacy SQLite store.

ALTER TABLE "app"."inventory"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "app"."inventory_audit_log"
  ADD COLUMN IF NOT EXISTS "source_document_ref_type" TEXT,
  ADD COLUMN IF NOT EXISTS "source_document_ref_id" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_audit_log_idempotency_key"
  ON "app"."inventory_audit_log"("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "inventory_audit_log_source_ref_idx"
  ON "app"."inventory_audit_log"("source_document_ref_type", "source_document_ref_id")
  WHERE "source_document_ref_type" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "app"."inventory_adjustment" (
  "id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "from_location_id" TEXT,
  "to_location_id" TEXT,
  "reason" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "inventory_adjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "inventory_adjustment_type_created_idx"
  ON "app"."inventory_adjustment"("type", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "inventory_adjustment_created_at_idx"
  ON "app"."inventory_adjustment"("created_at" DESC);

CREATE TABLE IF NOT EXISTS "app"."inventory_adjustment_line" (
  "id" UUID NOT NULL,
  "adjustment_id" UUID NOT NULL,
  "sku_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "inventory_adjustment_line_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "inventory_adjustment_line_adjustment_created_idx"
  ON "app"."inventory_adjustment_line"("adjustment_id", "created_at" ASC);

CREATE INDEX IF NOT EXISTS "inventory_adjustment_line_sku_id_idx"
  ON "app"."inventory_adjustment_line"("sku_id");

ALTER TABLE "app"."inventory_adjustment_line"
  ADD CONSTRAINT "inventory_adjustment_line_adjustment_id_fkey"
  FOREIGN KEY ("adjustment_id") REFERENCES "app"."inventory_adjustment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."inventory_adjustment_line"
  ADD CONSTRAINT "inventory_adjustment_line_sku_id_fkey"
  FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
