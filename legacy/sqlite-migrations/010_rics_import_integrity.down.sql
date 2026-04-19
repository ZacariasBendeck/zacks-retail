-- Migration 010 (DOWN)
-- Revert RICS import staging model + SKU natural key integrity helpers + schema comments registry

BEGIN TRANSACTION;

DROP TRIGGER IF EXISTS trg_sku_sizes_require_nonblank_size_update;
DROP TRIGGER IF EXISTS trg_sku_sizes_require_nonblank_size_insert;
DROP TRIGGER IF EXISTS trg_skus_require_natural_identity_update;
DROP TRIGGER IF EXISTS trg_skus_require_natural_identity_insert;

DROP INDEX IF EXISTS ux_skus_brand_style_color;

DROP INDEX IF EXISTS idx_rics_import_apply_log_row;
DROP INDEX IF EXISTS idx_rics_import_apply_log_batch_created_at;
DROP INDEX IF EXISTS idx_rics_import_quarantine_status_created_at;
DROP INDEX IF EXISTS idx_rics_import_rows_category_code;
DROP INDEX IF EXISTS idx_rics_import_rows_target_sku;
DROP INDEX IF EXISTS idx_rics_import_rows_dedupe_hash;
DROP INDEX IF EXISTS idx_rics_import_rows_file_validation;
DROP INDEX IF EXISTS idx_rics_import_files_status_uploaded_at;
DROP INDEX IF EXISTS idx_rics_import_files_batch_id;
DROP INDEX IF EXISTS idx_rics_import_batches_department_month;
DROP INDEX IF EXISTS idx_rics_import_batches_status_created_at;

DROP TABLE IF EXISTS rics_import_apply_log;
DROP TABLE IF EXISTS rics_import_quarantine;
DROP TABLE IF EXISTS rics_import_rows;
DROP TABLE IF EXISTS rics_import_files;
DROP TABLE IF EXISTS rics_import_batches;

DROP TABLE IF EXISTS schema_table_comments;

COMMIT;

