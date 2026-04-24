-- Promote soft references to real foreign keys.
--
-- Background: four child tables carry app.sku.code as a string but have no
-- FK enforcing the reference. Two cross-schema siblings in public (ProductContent,
-- CartLine) are in the same position. All six are candidates because their data
-- passes orphan validation (verified 2026-04-24) and none reference rics_mirror
-- (which remains FK-free while sync:rics rebuilds it every run).
--
-- Prerequisite for FK creation: app.sku.code must have a unique CONSTRAINT
-- (not just the existing partial unique INDEX — Postgres refuses FKs whose
-- target is only backed by a partial index, even when every child row falls
-- within the predicate). The partial index was originally chosen to permit
-- multiple NULL codes during DRAFT state. Plain UNIQUE constraints preserve
-- that semantic — Postgres' default is NULLS DISTINCT, so multiple NULL rows
-- are still allowed under a full UNIQUE (code) constraint.
--
-- Data check 2026-04-24:
--   203,749 SKU rows total, 0 with NULL code, 0 duplicate non-null codes.
--   Zero orphans across all six child columns.
--
-- ON DELETE rationale:
--   RESTRICT on sku_attribute_assignment: 417,079 live assignments are the
--     backbone of the dimensional attribute framework; never auto-cascade.
--   RESTRICT on products_batch_operation_item: audit record, must survive.
--   RESTRICT on public.CartLine: don't auto-empty shopping carts on SKU delete.
--   CASCADE on sku_attribute_override / sku_keyword_override: sparse overlays
--     become meaningless once their SKU is gone.
--   CASCADE on public.ProductContent: web content is derivative of the SKU.
--
-- ON UPDATE CASCADE everywhere so that if app.sku.code changes (unlikely but
-- possible during draft→active promotion), children follow.
--
-- public.OrderLine.ricsSkuCode is DELIBERATELY left without an FK — OrderLine
-- is a ledger that must survive SKU deletion (historical integrity rule).

-- 1. Replace the partial unique index with a full UNIQUE constraint so it
--    can serve as an FK target. Reusing the existing index name keeps
--    schema.prisma's @unique(map: "sku_code_key") stable.
DROP INDEX "app"."sku_code_key";
ALTER TABLE "app"."sku"
  ADD CONSTRAINT "sku_code_key" UNIQUE ("code");

-- 2. Intra-app foreign keys.
ALTER TABLE "app"."sku_attribute_assignment"
  ADD CONSTRAINT "sku_attribute_assignment_sku_code_fkey"
  FOREIGN KEY ("sku_code") REFERENCES "app"."sku"("code")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."products_batch_operation_item"
  ADD CONSTRAINT "products_batch_operation_item_rics_sku_code_fkey"
  FOREIGN KEY ("rics_sku_code") REFERENCES "app"."sku"("code")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."sku_attribute_override"
  ADD CONSTRAINT "sku_attribute_override_rics_sku_code_fkey"
  FOREIGN KEY ("rics_sku_code") REFERENCES "app"."sku"("code")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."sku_keyword_override"
  ADD CONSTRAINT "sku_keyword_override_rics_sku_code_fkey"
  FOREIGN KEY ("rics_sku_code") REFERENCES "app"."sku"("code")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Cross-schema foreign keys from public.* to app.sku.
--    Declared here in raw SQL rather than via Prisma @relation because
--    cross-schema @relation requires Prisma to model the target column's
--    uniqueness in the same file, and keeping this a raw-SQL migration
--    matches the established convention for app-schema constraints.
ALTER TABLE "public"."ProductContent"
  ADD CONSTRAINT "ProductContent_ricsSkuCode_fkey"
  FOREIGN KEY ("ricsSkuCode") REFERENCES "app"."sku"("code")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."CartLine"
  ADD CONSTRAINT "CartLine_ricsSkuCode_fkey"
  FOREIGN KEY ("ricsSkuCode") REFERENCES "app"."sku"("code")
  ON DELETE RESTRICT ON UPDATE CASCADE;
