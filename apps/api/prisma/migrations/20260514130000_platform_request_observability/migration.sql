CREATE TABLE IF NOT EXISTS platform.platform_request_trace (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  method TEXT NOT NULL,
  route TEXT NULL,
  original_url TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  actor_user_id TEXT NULL,
  actor_session_id TEXT NULL,
  error_code TEXT NULL,
  error_message TEXT NULL,
  timing_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_json JSONB NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS platform_request_trace_trace_idx
  ON platform.platform_request_trace(trace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_request_trace_request_idx
  ON platform.platform_request_trace(request_id);
CREATE INDEX IF NOT EXISTS platform_request_trace_route_idx
  ON platform.platform_request_trace(route, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_request_trace_status_idx
  ON platform.platform_request_trace(status_code, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_request_trace_duration_idx
  ON platform.platform_request_trace(duration_ms DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_request_trace_created_idx
  ON platform.platform_request_trace(created_at DESC);
