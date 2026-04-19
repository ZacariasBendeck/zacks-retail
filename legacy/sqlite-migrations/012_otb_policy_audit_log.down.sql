-- Migration 012 (DOWN)
-- Revert OTB policy decision audit ledger

BEGIN TRANSACTION;

DROP INDEX IF EXISTS idx_otb_policy_audit_log_retention_expires;
DROP INDEX IF EXISTS idx_otb_policy_audit_log_department_period;
DROP INDEX IF EXISTS idx_otb_policy_audit_log_decision_created;
DROP INDEX IF EXISTS idx_otb_policy_audit_log_trace_id;
DROP INDEX IF EXISTS idx_otb_policy_audit_log_event_id;
DROP INDEX IF EXISTS idx_otb_policy_audit_log_po_id;

DROP TABLE IF EXISTS otb_policy_audit_log;

DELETE FROM schema_table_comments
WHERE table_name = 'otb_policy_audit_log';

COMMIT;
