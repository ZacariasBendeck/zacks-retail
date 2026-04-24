-- Employees time-clock core.
-- Adds per-store time-clock policy rows plus basic clock-in / clock-out
-- entries in Postgres so the employees module can move off RICS behavior.

CREATE TABLE IF NOT EXISTS "public"."TimeClockPolicy" (
  "storeId" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "requireClockInBeforeSale" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TimeClockPolicy_pkey" PRIMARY KEY ("storeId")
);

CREATE TABLE IF NOT EXISTS "public"."TimeClockEntry" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "storeId" INTEGER NOT NULL,
  "clockedInAt" TIMESTAMP(3) NOT NULL,
  "clockedOutAt" TIMESTAMP(3),
  "nonSales" BOOLEAN NOT NULL DEFAULT false,
  "clockedInByUserId" TEXT NOT NULL,
  "clockedOutByUserId" TEXT,
  "autoClosedAtCap" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TimeClockEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TimeClockEntry_employeeId_clockedOutAt_idx"
  ON "public"."TimeClockEntry"("employeeId", "clockedOutAt");

CREATE INDEX IF NOT EXISTS "TimeClockEntry_storeId_clockedOutAt_idx"
  ON "public"."TimeClockEntry"("storeId", "clockedOutAt");

CREATE INDEX IF NOT EXISTS "TimeClockEntry_clockedInAt_idx"
  ON "public"."TimeClockEntry"("clockedInAt");

ALTER TABLE "public"."TimeClockEntry"
  ADD CONSTRAINT "TimeClockEntry_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "public"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
