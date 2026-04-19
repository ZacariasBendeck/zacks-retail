-- Migration 012 (UP)
-- OTB policy decision audit ledger
--
-- Non-obvious design decisions:
-- 1) event_id is intentionally non-unique because one policy evaluation can emit
--    one row per department+period while still sharing a single correlation id.
-- 2) retention_expires_at is materialized (instead of computed) so retention jobs
--    can scan by indexed ranges without expression indexes.

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS otb_policy_audit_log (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  department TEXT NOT NULL REFERENCES ref_departments(code),
  period_year INTEGER NOT NULL CHECK(period_year BETWEEN 2020 AND 2099),
  period_month INTEGER NOT NULL CHECK(period_month BETWEEN 1 AND 12),
  po_id TEXT NOT NULL REFERENCES purchase_orders(id),
  policy_source TEXT NOT NULL CHECK(policy_source IN ('default', 'configured')),
  warning_threshold_pct REAL NOT NULL CHECK(warning_threshold_pct >= 0),
  hard_stop_threshold_pct REAL NOT NULL CHECK(hard_stop_threshold_pct >= warning_threshold_pct),
  projected_utilization_pct REAL NOT NULL CHECK(projected_utilization_pct >= 0),
  decision TEXT NOT NULL CHECK(decision IN ('allow', 'warn', 'hard_stop', 'override', 'exception')),
  override_reason_code TEXT,
  approver_ids TEXT,
  ceo_exception_approval_id TEXT,
  actor_user_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  retention_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_otb_policy_audit_log_po_id
  ON otb_policy_audit_log(po_id);
CREATE INDEX IF NOT EXISTS idx_otb_policy_audit_log_event_id
  ON otb_policy_audit_log(event_id);
CREATE INDEX IF NOT EXISTS idx_otb_policy_audit_log_trace_id
  ON otb_policy_audit_log(trace_id);
CREATE INDEX IF NOT EXISTS idx_otb_policy_audit_log_decision_created
  ON otb_policy_audit_log(decision, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otb_policy_audit_log_department_period
  ON otb_policy_audit_log(department, period_year, period_month, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otb_policy_audit_log_retention_expires
  ON otb_policy_audit_log(retention_expires_at);

INSERT OR REPLACE INTO schema_table_comments (table_name, comment) VALUES
  ('otb_policy_audit_log', 'Immutable OTB policy decision audit ledger by PO, department, and period with thresholds, approvals, and retention markers.');

COMMIT;
