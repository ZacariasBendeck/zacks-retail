-- Preserve RICS Salespeople records as app-owned employee user accounts.
-- These columns hold the fields from RISLSPSN.MDB / Salespeople that did not
-- already have a truthful slot on public."User".

ALTER TABLE "public"."User"
  ADD COLUMN IF NOT EXISTS "ricsCommissionMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "timeClockAdmin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "timeClockFullUser" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ricsSalespersonChangedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ricsSalespersonImportedAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "public"."User_salespersonCode_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "User_salespersonCode_key"
  ON "public"."User"("salespersonCode");
