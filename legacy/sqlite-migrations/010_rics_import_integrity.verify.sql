-- Migration 010 verification queries
-- Run these in order:
-- 1) Apply 010_rics_import_integrity.up.sql
-- 2) Execute section A checks
-- 3) Apply 010_rics_import_integrity.down.sql
-- 4) Execute section B checks

-- --------------------------------------------------
-- A) Post-UP checks
-- --------------------------------------------------

-- A1: New tables should exist.
SELECT name, type
FROM sqlite_master
WHERE type = 'table'
  AND name IN (
    'schema_table_comments',
    'rics_import_batches',
    'rics_import_files',
    'rics_import_rows',
    'rics_import_quarantine',
    'rics_import_apply_log'
  )
ORDER BY name;

-- A2: Identity index should exist.
SELECT name, sql
FROM sqlite_master
WHERE type = 'index'
  AND name = 'ux_skus_brand_style_color';

-- A3: Triggers should exist.
SELECT name
FROM sqlite_master
WHERE type = 'trigger'
  AND name IN (
    'trg_skus_require_natural_identity_insert',
    'trg_skus_require_natural_identity_update',
    'trg_sku_sizes_require_nonblank_size_insert',
    'trg_sku_sizes_require_nonblank_size_update'
  )
ORDER BY name;

-- A4: FK/index sanity checks on import rows.
PRAGMA foreign_key_list('rics_import_rows');
PRAGMA index_list('rics_import_rows');

-- A5: Comment rows should exist for core/import tables.
SELECT table_name, length(comment) AS comment_len
FROM schema_table_comments
ORDER BY table_name;

-- --------------------------------------------------
-- B) Post-DOWN checks
-- --------------------------------------------------

-- B1: Import tables should be gone.
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND (name LIKE 'rics_import_%' OR name = 'schema_table_comments')
ORDER BY name;

-- B2: Identity index and triggers should be gone.
SELECT name, type
FROM sqlite_master
WHERE (type = 'index' AND name = 'ux_skus_brand_style_color')
   OR (type = 'trigger' AND name LIKE 'trg_skus_require_natural_identity_%')
   OR (type = 'trigger' AND name LIKE 'trg_sku_sizes_require_nonblank_size_%')
ORDER BY type, name;

