-- Activity Review manager review state.
-- Audit events remain append-only in platform.platform_audit_log; this table
-- stores the manager's review workflow for an event.

CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.activity_review_event_review (
  audit_event_id TEXT PRIMARY KEY REFERENCES platform.platform_audit_log(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('REVIEWED', 'FLAGGED', 'NO_ISSUE')),
  reviewed_by_user_id TEXT NULL REFERENCES public."User"(id) ON DELETE SET NULL,
  review_note TEXT NULL,
  reviewed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS activity_review_event_review_status_idx
  ON platform.activity_review_event_review(status, reviewed_at DESC);

CREATE INDEX IF NOT EXISTS activity_review_event_review_reviewer_idx
  ON platform.activity_review_event_review(reviewed_by_user_id, reviewed_at DESC);
