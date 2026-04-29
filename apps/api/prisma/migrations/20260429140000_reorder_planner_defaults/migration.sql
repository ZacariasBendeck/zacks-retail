CREATE TABLE IF NOT EXISTS app.reorder_planner_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type varchar(16) NOT NULL,
  scope_key varchar(64) NOT NULL,
  lead_time_days smallint NOT NULL DEFAULT 90,
  order_cycle_days smallint NOT NULL DEFAULT 90,
  moq_qty integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by varchar(120) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by varchar(120) NOT NULL DEFAULT 'system',
  CONSTRAINT reorder_planner_defaults_scope_type_chk
    CHECK (scope_type IN ('SKU', 'VENDOR')),
  CONSTRAINT reorder_planner_defaults_lead_time_chk
    CHECK (lead_time_days > 0),
  CONSTRAINT reorder_planner_defaults_order_cycle_chk
    CHECK (order_cycle_days > 0),
  CONSTRAINT reorder_planner_defaults_moq_chk
    CHECK (moq_qty >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS reorder_planner_defaults_scope_key
  ON app.reorder_planner_defaults (scope_type, scope_key);

