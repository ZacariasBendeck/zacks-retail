CREATE INDEX IF NOT EXISTS "idx_sales_history_ticket_source_date"
  ON "app"."sales_history_ticket"("source", "purchased_at");
