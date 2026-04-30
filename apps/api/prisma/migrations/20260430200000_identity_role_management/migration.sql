-- Custom role management for Identity & Access.
-- Roles remain in public."Role" for compatibility with existing auth/user code.

ALTER TABLE public."Role"
  ADD COLUMN IF NOT EXISTS description TEXT NULL;

ALTER TABLE public."Role"
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP(3) NULL;

CREATE INDEX IF NOT EXISTS role_archived_at_idx
  ON public."Role"(archived_at);
