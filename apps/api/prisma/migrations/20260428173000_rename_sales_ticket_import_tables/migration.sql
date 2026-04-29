-- These ticket import tables are POS/sales-ticket data, not CRM sidecars and
-- not a separate legacy subsystem. Rename the raw preservation tables to the
-- sales-history import namespace.

ALTER TABLE IF EXISTS "app"."sales_history_ticket_legacy_raw"
  RENAME TO "sales_history_ticket_import_header";

ALTER TABLE IF EXISTS "app"."sales_history_ticket_line_legacy_raw"
  RENAME TO "sales_history_ticket_import_detail";

ALTER TABLE IF EXISTS "app"."sales_history_ticket_tender_legacy_raw"
  RENAME TO "sales_history_ticket_import_tender";

ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_legacy_raw_source_external"
  RENAME TO "idx_sales_history_ticket_import_header_source_external";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_legacy_raw_identity"
  RENAME TO "idx_sales_history_ticket_import_header_identity";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_legacy_raw_ticket"
  RENAME TO "idx_sales_history_ticket_import_header_ticket";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_legacy_raw_store_ticket"
  RENAME TO "idx_sales_history_ticket_import_header_store_ticket";

ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_line_legacy_raw_source_external"
  RENAME TO "idx_sales_history_ticket_import_detail_source_external";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_line_legacy_raw_identity"
  RENAME TO "idx_sales_history_ticket_import_detail_identity";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_line_legacy_raw_ticket"
  RENAME TO "idx_sales_history_ticket_import_detail_ticket";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_line_legacy_raw_store_ticket"
  RENAME TO "idx_sales_history_ticket_import_detail_store_ticket";

ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_tender_legacy_raw_source_external"
  RENAME TO "idx_sales_history_ticket_import_tender_source_external";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_tender_legacy_raw_identity"
  RENAME TO "idx_sales_history_ticket_import_tender_identity";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_tender_legacy_raw_ticket"
  RENAME TO "idx_sales_history_ticket_import_tender_ticket";
ALTER INDEX IF EXISTS "app"."idx_sales_history_ticket_tender_legacy_raw_store_ticket"
  RENAME TO "idx_sales_history_ticket_import_tender_store_ticket";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_history_ticket_legacy_raw_pkey'
      AND conrelid = '"app"."sales_history_ticket_import_header"'::regclass
  ) THEN
    ALTER TABLE "app"."sales_history_ticket_import_header"
      RENAME CONSTRAINT "sales_history_ticket_legacy_raw_pkey"
      TO "sales_history_ticket_import_header_pkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_history_ticket_legacy_raw_ticket_fkey'
      AND conrelid = '"app"."sales_history_ticket_import_header"'::regclass
  ) THEN
    ALTER TABLE "app"."sales_history_ticket_import_header"
      RENAME CONSTRAINT "sales_history_ticket_legacy_raw_ticket_fkey"
      TO "sales_history_ticket_import_header_ticket_fkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_history_ticket_line_legacy_raw_pkey'
      AND conrelid = '"app"."sales_history_ticket_import_detail"'::regclass
  ) THEN
    ALTER TABLE "app"."sales_history_ticket_import_detail"
      RENAME CONSTRAINT "sales_history_ticket_line_legacy_raw_pkey"
      TO "sales_history_ticket_import_detail_pkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_history_ticket_line_legacy_raw_ticket_fkey'
      AND conrelid = '"app"."sales_history_ticket_import_detail"'::regclass
  ) THEN
    ALTER TABLE "app"."sales_history_ticket_import_detail"
      RENAME CONSTRAINT "sales_history_ticket_line_legacy_raw_ticket_fkey"
      TO "sales_history_ticket_import_detail_ticket_fkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_history_ticket_tender_legacy_raw_pkey'
      AND conrelid = '"app"."sales_history_ticket_import_tender"'::regclass
  ) THEN
    ALTER TABLE "app"."sales_history_ticket_import_tender"
      RENAME CONSTRAINT "sales_history_ticket_tender_legacy_raw_pkey"
      TO "sales_history_ticket_import_tender_pkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_history_ticket_tender_legacy_raw_ticket_fkey'
      AND conrelid = '"app"."sales_history_ticket_import_tender"'::regclass
  ) THEN
    ALTER TABLE "app"."sales_history_ticket_import_tender"
      RENAME CONSTRAINT "sales_history_ticket_tender_legacy_raw_ticket_fkey"
      TO "sales_history_ticket_import_tender_ticket_fkey";
  END IF;
END $$;
