-- Imported RITRNSSV tickets are the same business records that the browser POS
-- will create after cutover. Keep them in the canonical ticket tables instead
-- of sales-history/import-specific table names.

ALTER TABLE IF EXISTS "app"."sales_history_ticket_import_header"
  RENAME TO "ticket_header";

ALTER TABLE IF EXISTS "app"."sales_history_ticket_import_detail"
  RENAME TO "ticket_detail";

ALTER TABLE IF EXISTS "app"."sales_history_ticket_import_tender"
  RENAME TO "ticket_tender";

ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_import_header_source_external"
  RENAME TO "idx_ticket_header_source_external";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_import_header_identity"
  RENAME TO "idx_ticket_header_identity";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_import_header_ticket"
  RENAME TO "idx_ticket_header_sales_history_ticket";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_import_header_store_ticket"
  RENAME TO "idx_ticket_header_store_ticket";

ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_import_detail_source_external"
  RENAME TO "idx_ticket_detail_source_external";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_import_detail_identity"
  RENAME TO "idx_ticket_detail_identity";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_import_detail_ticket"
  RENAME TO "idx_ticket_detail_sales_history_ticket";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_import_detail_store_ticket"
  RENAME TO "idx_ticket_detail_store_ticket";

ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_import_tender_source_external"
  RENAME TO "idx_ticket_tender_source_external";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_import_tender_identity"
  RENAME TO "idx_ticket_tender_identity";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_import_tender_ticket"
  RENAME TO "idx_ticket_tender_sales_history_ticket";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_import_tender_store_ticket"
  RENAME TO "idx_ticket_tender_store_ticket";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_history_ticket_import_header_pkey'
      AND conrelid = '"app"."ticket_header"'::regclass
  ) THEN
    ALTER TABLE "app"."ticket_header"
      RENAME CONSTRAINT "sales_history_ticket_import_header_pkey"
      TO "ticket_header_pkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_history_ticket_import_header_ticket_fkey'
      AND conrelid = '"app"."ticket_header"'::regclass
  ) THEN
    ALTER TABLE "app"."ticket_header"
      RENAME CONSTRAINT "sales_history_ticket_import_header_ticket_fkey"
      TO "ticket_header_sales_history_ticket_fkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_history_ticket_import_detail_pkey'
      AND conrelid = '"app"."ticket_detail"'::regclass
  ) THEN
    ALTER TABLE "app"."ticket_detail"
      RENAME CONSTRAINT "sales_history_ticket_import_detail_pkey"
      TO "ticket_detail_pkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_history_ticket_import_detail_ticket_fkey'
      AND conrelid = '"app"."ticket_detail"'::regclass
  ) THEN
    ALTER TABLE "app"."ticket_detail"
      RENAME CONSTRAINT "sales_history_ticket_import_detail_ticket_fkey"
      TO "ticket_detail_sales_history_ticket_fkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_history_ticket_import_tender_pkey'
      AND conrelid = '"app"."ticket_tender"'::regclass
  ) THEN
    ALTER TABLE "app"."ticket_tender"
      RENAME CONSTRAINT "sales_history_ticket_import_tender_pkey"
      TO "ticket_tender_pkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_history_ticket_import_tender_ticket_fkey'
      AND conrelid = '"app"."ticket_tender"'::regclass
  ) THEN
    ALTER TABLE "app"."ticket_tender"
      RENAME CONSTRAINT "sales_history_ticket_import_tender_ticket_fkey"
      TO "ticket_tender_sales_history_ticket_fkey";
  END IF;
END $$;
