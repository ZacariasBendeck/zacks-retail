-- Migration 020 (VERIFY)
-- Sanity-checks that the up migration applied cleanly. Each query should
-- return a single row with `ok = 1`.

-- All 8 tables exist
SELECT 'count_sessions exists' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='count_sessions')
       THEN 1 ELSE 0 END AS ok;
SELECT 'count_session_snapshots exists' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='count_session_snapshots')
       THEN 1 ELSE 0 END AS ok;
SELECT 'count_session_snapshot_cells exists' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='count_session_snapshot_cells')
       THEN 1 ELSE 0 END AS ok;
SELECT 'count_batches exists' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='count_batches')
       THEN 1 ELSE 0 END AS ok;
SELECT 'count_entries exists' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='count_entries')
       THEN 1 ELSE 0 END AS ok;
SELECT 'count_variances exists' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='count_variances')
       THEN 1 ELSE 0 END AS ok;
SELECT 'count_review_acks exists' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='count_review_acks')
       THEN 1 ELSE 0 END AS ok;
SELECT 'worksheet_exports exists' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='worksheet_exports')
       THEN 1 ELSE 0 END AS ok;

-- Critical indexes exist
SELECT 'ux_count_sessions_join_code_v020 exists' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type='index' AND name='ux_count_sessions_join_code_v020')
       THEN 1 ELSE 0 END AS ok;
SELECT 'ux_count_session_snapshot_cells_cell_v020 exists' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type='index' AND name='ux_count_session_snapshot_cells_cell_v020')
       THEN 1 ELSE 0 END AS ok;
SELECT 'ux_count_variances_session_cell_v020 exists' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type='index' AND name='ux_count_variances_session_cell_v020')
       THEN 1 ELSE 0 END AS ok;
SELECT 'idx_count_entries_session_sku_cell_v020 exists' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_count_entries_session_sku_cell_v020')
       THEN 1 ELSE 0 END AS ok;

-- Status CHECK constraint accepts EXPORTED (P1.a terminal status)
SELECT 'count_sessions accepts EXPORTED status' AS check_name,
  CASE WHEN (SELECT sql FROM sqlite_master WHERE type='table' AND name='count_sessions') LIKE '%EXPORTED%'
       THEN 1 ELSE 0 END AS ok;

-- Schema comments installed
SELECT 'schema comments installed for count_sessions' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM schema_table_comments WHERE table_name='count_sessions')
       THEN 1 ELSE 0 END AS ok;
