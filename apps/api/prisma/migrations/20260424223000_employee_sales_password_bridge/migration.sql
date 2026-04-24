-- Employees sales-password bridge.
-- Adds a Postgres-backed employee-scoped override PIN surface that can coexist
-- with the legacy per-store shared passwords still stored in the POS SQLite DB.

CREATE TABLE IF NOT EXISTS "public"."EmployeeSalesPassword" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "pinHash" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "failedAttemptWindowStartedAt" TIMESTAMP(3),
  "dailyFailedCount" INTEGER NOT NULL DEFAULT 0,
  "dailyFailedWindowStartedAt" TIMESTAMP(3),
  "lockedUntil" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "issuedByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmployeeSalesPassword_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmployeeSalesPassword_employeeId_active_idx"
  ON "public"."EmployeeSalesPassword"("employeeId", "active");

CREATE INDEX IF NOT EXISTS "EmployeeSalesPassword_lockedUntil_idx"
  ON "public"."EmployeeSalesPassword"("lockedUntil");

ALTER TABLE "public"."EmployeeSalesPassword"
  ADD CONSTRAINT "EmployeeSalesPassword_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "public"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "public"."EmployeeSalesPasswordAudit" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "passwordId" TEXT,
  "scope" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "invokingUserId" TEXT,
  "ticketId" TEXT,
  "action" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmployeeSalesPasswordAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmployeeSalesPasswordAudit_employeeId_createdAt_idx"
  ON "public"."EmployeeSalesPasswordAudit"("employeeId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "EmployeeSalesPasswordAudit_scope_createdAt_idx"
  ON "public"."EmployeeSalesPasswordAudit"("scope", "createdAt" DESC);

ALTER TABLE "public"."EmployeeSalesPasswordAudit"
  ADD CONSTRAINT "EmployeeSalesPasswordAudit_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "public"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."EmployeeSalesPasswordAudit"
  ADD CONSTRAINT "EmployeeSalesPasswordAudit_passwordId_fkey"
  FOREIGN KEY ("passwordId") REFERENCES "public"."EmployeeSalesPassword"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "public"."EmployeeSalesOverrideToken" (
  "id" TEXT NOT NULL,
  "passwordId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "ticketId" TEXT,
  "action" TEXT,
  "invokingUserId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmployeeSalesOverrideToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeSalesOverrideToken_tokenHash_key"
  ON "public"."EmployeeSalesOverrideToken"("tokenHash");

CREATE INDEX IF NOT EXISTS "EmployeeSalesOverrideToken_employeeId_scope_expiresAt_idx"
  ON "public"."EmployeeSalesOverrideToken"("employeeId", "scope", "expiresAt");

CREATE INDEX IF NOT EXISTS "EmployeeSalesOverrideToken_consumedAt_idx"
  ON "public"."EmployeeSalesOverrideToken"("consumedAt");

ALTER TABLE "public"."EmployeeSalesOverrideToken"
  ADD CONSTRAINT "EmployeeSalesOverrideToken_passwordId_fkey"
  FOREIGN KEY ("passwordId") REFERENCES "public"."EmployeeSalesPassword"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."EmployeeSalesOverrideToken"
  ADD CONSTRAINT "EmployeeSalesOverrideToken_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "public"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
