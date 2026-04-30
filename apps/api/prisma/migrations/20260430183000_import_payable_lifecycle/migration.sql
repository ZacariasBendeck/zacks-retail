ALTER TABLE app.import_payable_handoff
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS paid_by TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by TEXT,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

ALTER TABLE app.import_payable_handoff
  DROP CONSTRAINT IF EXISTS import_payable_handoff_status_check,
  ADD CONSTRAINT import_payable_handoff_status_check
    CHECK (handoff_status IN ('READY', 'SENT_TO_AP', 'PAID', 'VOIDED'));
