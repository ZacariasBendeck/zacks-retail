-- Move imported RICS salesperson master data out of auth users and into the
-- app-owned employee table.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "app"."employee" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "salesperson_code" VARCHAR(16) NOT NULL,
  "display_name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "other_information" TEXT,
  "commission_rate" DECIMAL(5,2),
  "commission_base" TEXT NOT NULL DEFAULT 'NET_SALES',
  "rics_commission_method" VARCHAR(8),
  "time_clock_enabled" BOOLEAN NOT NULL DEFAULT true,
  "time_clock_pin_hash" TEXT,
  "time_clock_admin" BOOLEAN NOT NULL DEFAULT false,
  "time_clock_full_user" BOOLEAN NOT NULL DEFAULT false,
  "legacy_cashier_pin_hash" TEXT,
  "rics_salesperson_changed_at" TIMESTAMP(3),
  "rics_salesperson_imported_at" TIMESTAMP(3),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "employee_salesperson_code_key"
  ON "app"."employee"("salesperson_code");

CREATE INDEX IF NOT EXISTS "employee_active_idx"
  ON "app"."employee"("active");

WITH legacy_pin AS (
  SELECT DISTINCT ON (esp."employeeId")
    esp."employeeId",
    esp."pinHash"
  FROM "public"."EmployeeSalesPassword" esp
  WHERE esp."issuedByUserId" = 'legacy-rislspsn-import'
  ORDER BY esp."employeeId", esp."createdAt" DESC
)
INSERT INTO "app"."employee" (
  "salesperson_code",
  "display_name",
  "active",
  "other_information",
  "commission_rate",
  "commission_base",
  "rics_commission_method",
  "time_clock_enabled",
  "time_clock_pin_hash",
  "time_clock_admin",
  "time_clock_full_user",
  "legacy_cashier_pin_hash",
  "rics_salesperson_changed_at",
  "rics_salesperson_imported_at",
  "created_at",
  "updated_at"
)
SELECT
  u."salespersonCode",
  u."displayName",
  u."active",
  u."otherInformation",
  u."commissionRate",
  u."commissionBase",
  u."ricsCommissionMethod",
  u."timeClockEnabled",
  u."timeClockPinHash",
  u."timeClockAdmin",
  u."timeClockFullUser",
  lp."pinHash",
  u."ricsSalespersonChangedAt",
  u."ricsSalespersonImportedAt",
  u."createdAt",
  CURRENT_TIMESTAMP
FROM "public"."User" u
LEFT JOIN legacy_pin lp
  ON lp."employeeId" = u."id"
WHERE u."salespersonCode" IS NOT NULL
  AND u."ricsSalespersonImportedAt" IS NOT NULL
ON CONFLICT ("salesperson_code") DO UPDATE SET
  "display_name" = EXCLUDED."display_name",
  "active" = EXCLUDED."active",
  "other_information" = EXCLUDED."other_information",
  "commission_rate" = EXCLUDED."commission_rate",
  "commission_base" = EXCLUDED."commission_base",
  "rics_commission_method" = EXCLUDED."rics_commission_method",
  "time_clock_enabled" = EXCLUDED."time_clock_enabled",
  "time_clock_pin_hash" = COALESCE(EXCLUDED."time_clock_pin_hash", "app"."employee"."time_clock_pin_hash"),
  "time_clock_admin" = EXCLUDED."time_clock_admin",
  "time_clock_full_user" = EXCLUDED."time_clock_full_user",
  "legacy_cashier_pin_hash" = COALESCE(EXCLUDED."legacy_cashier_pin_hash", "app"."employee"."legacy_cashier_pin_hash"),
  "rics_salesperson_changed_at" = EXCLUDED."rics_salesperson_changed_at",
  "rics_salesperson_imported_at" = EXCLUDED."rics_salesperson_imported_at",
  "updated_at" = CURRENT_TIMESTAMP;

DELETE FROM "public"."EmployeeSalesPassword"
WHERE "issuedByUserId" = 'legacy-rislspsn-import';

DELETE FROM "public"."User"
WHERE "salespersonCode" IS NOT NULL
  AND "ricsSalespersonImportedAt" IS NOT NULL;

DROP INDEX IF EXISTS "public"."User_salespersonCode_key";
CREATE INDEX IF NOT EXISTS "User_salespersonCode_idx"
  ON "public"."User"("salespersonCode");

ALTER TABLE "public"."User"
  DROP COLUMN IF EXISTS "ricsCommissionMethod",
  DROP COLUMN IF EXISTS "timeClockAdmin",
  DROP COLUMN IF EXISTS "timeClockFullUser",
  DROP COLUMN IF EXISTS "ricsSalespersonChangedAt",
  DROP COLUMN IF EXISTS "ricsSalespersonImportedAt";
