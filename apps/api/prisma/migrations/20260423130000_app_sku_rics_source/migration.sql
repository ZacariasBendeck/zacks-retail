-- app.sku: add source-tracking columns so sync:rics can bulk-mirror
-- rics_mirror.inventory_master into app.sku without ever touching
-- operator-created rows. See docs/operations/sku-lifecycle-backfill.md.
--
--   source              app  = operator-created via POST /sku-drafts (NEVER touched by sync)
--                       rics = mirrored from rics_mirror.inventory_master by sync:rics
--   rics_last_synced_at timestamp of the last sync:rics run that wrote this row
--   rics_status         mirrors inventory_master.status (CHAR(1); 'D' = marked-deleted in RICS)

ALTER TABLE "app"."sku"
  ADD COLUMN "source"              TEXT NOT NULL DEFAULT 'app',
  ADD COLUMN "rics_last_synced_at" TIMESTAMPTZ,
  ADD COLUMN "rics_status"         CHAR(1);

ALTER TABLE "app"."sku"
  ADD CONSTRAINT "sku_source_check" CHECK (source IN ('app','rics'));

CREATE INDEX "sku_source_state_idx" ON "app"."sku" ("source", "sku_state");
CREATE INDEX "sku_source_code_idx"  ON "app"."sku" ("source", "code")
  WHERE "code" IS NOT NULL;

COMMENT ON COLUMN "app"."sku"."source" IS
  'Provenance: app=operator-created via POST /sku-drafts; rics=mirrored from rics_mirror.inventory_master by sync:rics. Operator rows are NEVER touched by sync.';
COMMENT ON COLUMN "app"."sku"."rics_last_synced_at" IS
  'Updated on every sync:rics run for source=rics rows. NULL for source=app rows.';
COMMENT ON COLUMN "app"."sku"."rics_status" IS
  'Mirrors inventory_master.status CHAR(1). D means marked-deleted in RICS.';
