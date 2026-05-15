ALTER TABLE "public"."User"
  ADD COLUMN IF NOT EXISTS "preferred_locale" TEXT;
