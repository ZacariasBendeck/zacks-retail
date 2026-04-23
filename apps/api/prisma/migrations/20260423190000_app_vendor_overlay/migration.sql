-- Vendor overlay — Postgres-native write surface for vendors.
--
-- Context: the previous VendorRepository MDB write path was deleted
-- 2026-04-23. This overlay gives the products-admin UI a place to write
-- vendor changes while RICS remains the operational source for sales/POS.
-- A future sync agent will project overlay rows back to RIVENDOR.MDB so
-- the warehouse sees them; until that agent exists, RICS-side systems won't
-- see overlay-only vendors.
--
-- Single-table design with a `source` discriminator so one row covers three
-- independent concerns:
--
--   source='native'     vendor born in Postgres (no RICS mirror twin).
--                       All columns are the authoritative source.
--
--   source='override'   vendor exists in rics_mirror.vendor_master; this
--                       row is a SPARSE per-column override. Non-null
--                       columns override mirror values; null columns fall
--                       back to the mirror (COALESCE pattern — matches
--                       app.sku_attribute_override).
--
--   source='tombstone'  hide a RICS vendor from reads. All value columns
--                       are ignored (conventionally NULL).
--
-- Read path (in VendorRepository): rics_mirror.vendor_master FULL OUTER JOIN
-- app.vendor_overlay ON code, with COALESCE(overlay.col, mirror.col), filtering
-- rows where source='tombstone'.

CREATE TABLE "app"."vendor_overlay" (
    "code"           VARCHAR(4) NOT NULL,
    "source"         VARCHAR(10) NOT NULL,

    -- Mirror of rics_mirror.vendor_master columns. All nullable.
    "short_name"     TEXT,
    "mail_name"      TEXT,
    "addr1"          TEXT,
    "addr2"          TEXT,
    "city"           TEXT,
    "state"          TEXT,
    "zip"            TEXT,
    "phone"          TEXT,
    "fax"            TEXT,
    "contact"        TEXT,
    "terms"          TEXT,
    "ship_inst"      TEXT,
    "comment"        TEXT,
    "manu_code"      TEXT,
    "manu_name"      TEXT,
    "qualifier_id"   TEXT,
    "qualifier_code" TEXT,
    "color_code"     BOOLEAN,
    "long_comment"   TEXT,
    "e_mail"         TEXT,

    -- Audit
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
    "created_by"     TEXT NOT NULL,
    "updated_by"     TEXT NOT NULL,

    CONSTRAINT "vendor_overlay_pkey" PRIMARY KEY ("code"),
    CONSTRAINT "vendor_overlay_source_check"
        CHECK ("source" IN ('native', 'override', 'tombstone')),

    -- Native rows must have the two required identity columns populated;
    -- other sources can keep them null.
    CONSTRAINT "vendor_overlay_native_identity_check"
        CHECK ("source" != 'native'
               OR ("short_name" IS NOT NULL AND "mail_name" IS NOT NULL))
);

CREATE INDEX "vendor_overlay_source_idx" ON "app"."vendor_overlay"("source");
