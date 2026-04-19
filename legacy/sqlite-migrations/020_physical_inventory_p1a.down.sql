-- Migration 020 (DOWN)
-- Reverse of 020_physical_inventory_p1a.up.sql

BEGIN TRANSACTION;

DROP INDEX IF EXISTS idx_worksheet_exports_store_v020;
DROP TABLE IF EXISTS worksheet_exports;

DROP INDEX IF EXISTS ux_count_review_acks_session_step_v020;
DROP TABLE IF EXISTS count_review_acks;

DROP INDEX IF EXISTS idx_count_variances_session_band_v020;
DROP INDEX IF EXISTS ux_count_variances_session_cell_v020;
DROP TABLE IF EXISTS count_variances;

DROP INDEX IF EXISTS idx_count_entries_batch_v020;
DROP INDEX IF EXISTS idx_count_entries_session_scanned_at_v020;
DROP INDEX IF EXISTS idx_count_entries_session_sku_cell_v020;
DROP TABLE IF EXISTS count_entries;

DROP INDEX IF EXISTS idx_count_batches_source_v020;
DROP INDEX IF EXISTS idx_count_batches_session_v020;
DROP TABLE IF EXISTS count_batches;

DROP INDEX IF EXISTS idx_count_session_snapshot_cells_sku_v020;
DROP INDEX IF EXISTS idx_count_session_snapshot_cells_snapshot_v020;
DROP INDEX IF EXISTS ux_count_session_snapshot_cells_cell_v020;
DROP TABLE IF EXISTS count_session_snapshot_cells;

DROP TABLE IF EXISTS count_session_snapshots;

DROP INDEX IF EXISTS ux_count_sessions_join_code_v020;
DROP INDEX IF EXISTS idx_count_sessions_status_opened_at_v020;
DROP INDEX IF EXISTS idx_count_sessions_store_status_v020;
DROP TABLE IF EXISTS count_sessions;

DELETE FROM schema_table_comments WHERE table_name IN (
  'count_sessions',
  'count_session_snapshots',
  'count_session_snapshot_cells',
  'count_batches',
  'count_entries',
  'count_variances',
  'count_review_acks',
  'worksheet_exports'
);

COMMIT;
