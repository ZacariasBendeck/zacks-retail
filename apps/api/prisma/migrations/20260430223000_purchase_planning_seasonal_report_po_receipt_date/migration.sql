ALTER TABLE "app"."purchase_order"
  ADD COLUMN IF NOT EXISTS "planned_receipt_date" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "purchase_order_planned_receipt_status_idx"
  ON "app"."purchase_order" ("planned_receipt_date", "status");
