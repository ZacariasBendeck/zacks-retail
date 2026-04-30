-- Identity & Access foundation.
-- Keeps existing public."User"/"Role"/"Session" runtime contracts intact while
-- adding durable history/scope/event surfaces for the standalone module.

CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS public.identity_user_role_assignment (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES public."Role"(id) ON DELETE RESTRICT,
  assigned_by_user_id TEXT NULL,
  assigned_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_by_user_id TEXT NULL,
  revoked_at TIMESTAMP(3) NULL,
  reason TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS identity_user_role_assignment_user_active_idx
  ON public.identity_user_role_assignment(user_id, revoked_at);
CREATE INDEX IF NOT EXISTS identity_user_role_assignment_role_active_idx
  ON public.identity_user_role_assignment(role_id, revoked_at);

INSERT INTO public.identity_user_role_assignment (id, user_id, role_id, reason)
SELECT gen_random_uuid()::text, u.id, u."roleId", 'backfill from public.User.roleId'
FROM public."User" u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.identity_user_role_assignment a
  WHERE a.user_id = u.id
    AND a.role_id = u."roleId"
    AND a.revoked_at IS NULL
);

CREATE TABLE IF NOT EXISTS public.identity_user_store_scope (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL,
  scope_id TEXT NULL,
  granted_by_user_id TEXT NULL,
  granted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_by_user_id TEXT NULL,
  revoked_at TIMESTAMP(3) NULL,
  reason TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS identity_user_store_scope_user_active_idx
  ON public.identity_user_store_scope(user_id, revoked_at);
CREATE INDEX IF NOT EXISTS identity_user_store_scope_scope_idx
  ON public.identity_user_store_scope(scope_type, scope_id);

CREATE TABLE IF NOT EXISTS public.identity_mfa_factor (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  factor_type TEXT NOT NULL,
  label TEXT NULL,
  secret_hash TEXT NULL,
  public_key_json JSONB NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  verified_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP(3) NULL
);

CREATE INDEX IF NOT EXISTS identity_mfa_factor_user_active_idx
  ON public.identity_mfa_factor(user_id, active);

CREATE TABLE IF NOT EXISTS public.identity_external_identity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  email_at_provider TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_authenticated_at TIMESTAMP(3) NULL,
  CONSTRAINT identity_external_identity_provider_subject_key UNIQUE (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS identity_external_identity_user_idx
  ON public.identity_external_identity(user_id);

CREATE TABLE IF NOT EXISTS public.identity_login_event (
  id TEXT PRIMARY KEY,
  user_id TEXT NULL,
  role_id TEXT NULL,
  email TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason TEXT NULL,
  ip_address TEXT NULL,
  user_agent TEXT NULL,
  occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS identity_login_event_user_idx
  ON public.identity_login_event(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS identity_login_event_email_idx
  ON public.identity_login_event(email, occurred_at DESC);
CREATE INDEX IF NOT EXISTS identity_login_event_outcome_idx
  ON public.identity_login_event(outcome, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.identity_session_event (
  id TEXT PRIMARY KEY,
  session_id TEXT NULL,
  user_id TEXT NULL,
  event_type TEXT NOT NULL,
  reason TEXT NULL,
  ip_address TEXT NULL,
  user_agent TEXT NULL,
  occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS identity_session_event_user_idx
  ON public.identity_session_event(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS identity_session_event_session_idx
  ON public.identity_session_event(session_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS platform.platform_audit_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NULL,
  actor_user_id TEXT NULL,
  actor_session_id TEXT NULL,
  outcome TEXT NOT NULL DEFAULT 'SUCCESS',
  reason TEXT NULL,
  ip_address TEXT NULL,
  user_agent TEXT NULL,
  before_json JSONB NULL,
  after_json JSONB NULL,
  metadata_json JSONB NULL,
  trace_id TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS platform_audit_log_resource_idx
  ON platform.platform_audit_log(resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_log_actor_idx
  ON platform.platform_audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_log_event_idx
  ON platform.platform_audit_log(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_log_trace_idx
  ON platform.platform_audit_log(trace_id);
