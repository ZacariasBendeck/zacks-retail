-- Employees commission override foundation.
-- Adds override storage so slice 5 can manage employee-specific commission
-- rates by department/category/SKU ahead of the ledger/event work.

DO $$ BEGIN
  CREATE TYPE "public"."CommissionOverrideScope" AS ENUM ('SKU', 'CATEGORY', 'DEPARTMENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "public"."CommissionOverride" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "scope" "public"."CommissionOverrideScope" NOT NULL,
  "skuId" TEXT,
  "categoryId" TEXT,
  "departmentId" TEXT,
  "rate" DECIMAL(5,2) NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CommissionOverride_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CommissionOverride_employeeId_scope_idx"
  ON "public"."CommissionOverride"("employeeId", "scope");

CREATE INDEX IF NOT EXISTS "CommissionOverride_effectiveFrom_effectiveTo_idx"
  ON "public"."CommissionOverride"("effectiveFrom", "effectiveTo");

ALTER TABLE "public"."CommissionOverride"
  ADD CONSTRAINT "CommissionOverride_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "public"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
