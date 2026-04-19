-- Migration 012 verification queries
-- Run these in order:
-- 1) Apply 012_otb_policy_audit_log.up.sql
-- 2) Execute section A checks
-- 3) Apply 012_otb_policy_audit_log.down.sql
-- 4) Execute section B checks

-- --------------------------------------------------
-- A) Post-UP checks
-- --------------------------------------------------

-- A1: Table should exist with expected columns.
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name = 'otb_policy_audit_log';

PRAGMA table_info('otb_policy_audit_log');

-- A2: Index coverage for FK and read paths.
PRAGMA index_list('otb_policy_audit_log');

-- A3: Table-level comment should be present.
SELECT table_name, comment
FROM schema_table_comments
WHERE table_name = 'otb_policy_audit_log';

-- --------------------------------------------------
-- B) Post-DOWN checks
-- --------------------------------------------------

-- B1: Table should be removed.
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name = 'otb_policy_audit_log';

-- B2: Comment row should be removed.
SELECT table_name
FROM schema_table_comments
WHERE table_name = 'otb_policy_audit_log';
