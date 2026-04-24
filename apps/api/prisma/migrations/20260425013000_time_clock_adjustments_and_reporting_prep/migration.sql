-- Employees time-clock admin adjustments.
-- Adds an append-only adjustment audit table so time-clock edits preserve the
-- original entry values and the actor/reason for the change.

CREATE TABLE IF NOT EXISTS "public"."TimeClockEntryAdjustment" (
  "id" TEXT NOT NULL,
  "timeClockEntryId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "actedByUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "previousStoreId" INTEGER NOT NULL,
  "nextStoreId" INTEGER NOT NULL,
  "previousClockedInAt" TIMESTAMP(3) NOT NULL,
  "nextClockedInAt" TIMESTAMP(3) NOT NULL,
  "previousClockedOutAt" TIMESTAMP(3),
  "nextClockedOutAt" TIMESTAMP(3),
  "previousNonSales" BOOLEAN NOT NULL,
  "nextNonSales" BOOLEAN NOT NULL,
  "previousAutoClosedAtCap" BOOLEAN NOT NULL,
  "nextAutoClosedAtCap" BOOLEAN NOT NULL,
  "previousNote" TEXT,
  "nextNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TimeClockEntryAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TimeClockEntryAdjustment_timeClockEntryId_createdAt_idx"
  ON "public"."TimeClockEntryAdjustment"("timeClockEntryId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "TimeClockEntryAdjustment_employeeId_createdAt_idx"
  ON "public"."TimeClockEntryAdjustment"("employeeId", "createdAt" DESC);

ALTER TABLE "public"."TimeClockEntryAdjustment"
  ADD CONSTRAINT "TimeClockEntryAdjustment_timeClockEntryId_fkey"
  FOREIGN KEY ("timeClockEntryId") REFERENCES "public"."TimeClockEntry"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
