CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_line_sku_ticket"
  ON "app"."sales_history_ticket_line"("sku_id", "ticket_id");

CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_line_sku_code"
  ON "app"."sales_history_ticket_line"("sku_code");
