-- Employees roster core on top of the existing auth slice.
-- Adds employee-facing fields directly to public."User" so the next employees
-- slices can extend the shipped unified identity model instead of introducing
-- a second person table mid-stream.

ALTER TABLE "public"."User"
  ADD COLUMN IF NOT EXISTS "isEmployee" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "otherInformation" TEXT,
  ADD COLUMN IF NOT EXISTS "commissionRate" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "commissionBase" TEXT NOT NULL DEFAULT 'NET_SALES',
  ADD COLUMN IF NOT EXISTS "homeStoreId" TEXT,
  ADD COLUMN IF NOT EXISTS "hireDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "terminatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "timeClockEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "timeClockPinHash" TEXT;

UPDATE "public"."User"
SET "isEmployee" = true
WHERE "salespersonCode" IS NOT NULL
  AND "isEmployee" = false;

CREATE INDEX IF NOT EXISTS "User_isEmployee_active_idx"
  ON "public"."User"("isEmployee", "active");

CREATE INDEX IF NOT EXISTS "User_salespersonCode_idx"
  ON "public"."User"("salespersonCode");
