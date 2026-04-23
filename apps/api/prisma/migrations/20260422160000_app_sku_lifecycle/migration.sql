-- SKU lifecycle foundation — net-new SKUs created in Zack's Retail live here.
-- Legacy RICS SKUs stay in `rics_mirror.inventory_master` (atomically rebuilt by
-- sync:rics). During Phase A both sources coexist and reads UNION them.
--
-- State machine: DRAFT → ACTIVE → DISCONTINUED.
--   DRAFT   = buyer placed a PO but the final SKU code isn't known yet. Fields
--             editable (including `code` rename). Warehouse receipt IS allowed.
--             Barcode print / allocate / POS / ecommerce are blocked.
--   ACTIVE  = finalized. Final `code` set. Code rename blocked. All downstream
--             operations unlocked.
--   DISCONTINUED = merged-into-another-SKU or retired. Read-only. No receipt.
--
-- Spec: C:\Users\zbend\.claude\plans\http-localhost-3000-inventory-skus-new-i-piped-galaxy.md
-- Design: §"Phase 5 — SKU lifecycle (DRAFT → ACTIVE → DISCONTINUED)"

-- ─── Core table ─────────────────────────────────────────────────────────────
CREATE TABLE "app"."sku" (
    "id"                UUID            NOT NULL DEFAULT gen_random_uuid(),

    -- Codes: provisional_code is auto-generated at creation (format
    --   'DRF-YYMMDD-NNNN' enforced in the service layer, not the DB so the
    --   format can evolve). `code` is the final internal code; NULL while DRAFT.
    "provisional_code"  VARCHAR(32)     NOT NULL,
    "code"              VARCHAR(15),

    -- State machine
    "sku_state"         TEXT            NOT NULL DEFAULT 'DRAFT',

    -- Classification (required at finalize, optional during DRAFT)
    "family_code"       TEXT,
    "category_number"   INTEGER,        -- soft-ref rics_mirror.categories.number
    "vendor_id"         TEXT,           -- soft-ref rics_mirror.vendor_master.code
    "vendor_sku"        TEXT,           -- vendor's own code; NEVER reused as `code`
    "brand_id"          INTEGER,

    -- Descriptions
    "description_rics"  TEXT,
    "description_web"   TEXT,
    "comment"           TEXT,
    "keywords"          TEXT,

    -- Pricing (numeric; NULL until operator sets)
    "list_price"        NUMERIC(12,2),
    "retail_price"      NUMERIC(12,2),
    "mark_down_price1"  NUMERIC(12,2),
    "mark_down_price2"  NUMERIC(12,2),
    "current_cost"      NUMERIC(12,2),
    "current_price_slot" TEXT CHECK (current_price_slot IN ('LIST','RETAIL','MD1','MD2')),

    -- Attributes shared with inventory_master (names match for UNION reads)
    "size_type"         SMALLINT,
    "style"             TEXT,
    "style_color"       TEXT,
    "season"            VARCHAR(2),
    "location"          TEXT,
    "label_code"        TEXT,
    "color_code"        TEXT,
    "group_code"        TEXT,
    "picture_file_name" TEXT,
    "manufacturer"      TEXT,           -- kept nullable + unused by the new form; reserved for legacy-import compat
    "coupon"            BOOLEAN         NOT NULL DEFAULT false,
    "order_multiple"    SMALLINT,
    "order_uom"         TEXT,

    -- Lifecycle audit columns
    "activated_at"      TIMESTAMPTZ,
    "activated_by"      TEXT,
    "discontinued_at"   TIMESTAMPTZ,
    "discontinued_by"   TEXT,
    "created_at"        TIMESTAMPTZ     NOT NULL DEFAULT now(),
    "created_by"        TEXT            NOT NULL,
    "updated_at"        TIMESTAMPTZ,

    CONSTRAINT "sku_pkey" PRIMARY KEY ("id"),

    -- State enum (string-typed + check constraint — flipping values later only
    -- needs a constraint ALTER, no data rewrite).
    CONSTRAINT "sku_state_check" CHECK (sku_state IN ('DRAFT','ACTIVE','DISCONTINUED')),

    -- Finalize guard: when state=ACTIVE, code MUST be populated.
    -- When state=DRAFT, code MUST be null (operators set it only via finalize).
    CONSTRAINT "sku_code_matches_state" CHECK (
        (sku_state = 'DRAFT' AND code IS NULL) OR
        (sku_state IN ('ACTIVE','DISCONTINUED') AND code IS NOT NULL)
    ),

    -- FK to product_family (families catalog seeded in prior migration)
    CONSTRAINT "sku_family_code_fkey" FOREIGN KEY ("family_code")
        REFERENCES "app"."product_family"("code")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Provisional codes are always present and always unique — every SKU has one
-- from the moment it's created, regardless of state.
CREATE UNIQUE INDEX "sku_provisional_code_key" ON "app"."sku"("provisional_code");

-- Final `code` is unique when set. Partial index means many DRAFT rows can
-- coexist with NULL codes. Also dedupes against rics_mirror.inventory_master
-- is enforced in the service layer, not the DB (mirror rebuilds nightly).
CREATE UNIQUE INDEX "sku_code_key" ON "app"."sku"("code") WHERE "code" IS NOT NULL;

-- Hot-path indexes
CREATE INDEX "sku_state_family_idx" ON "app"."sku"("sku_state", "family_code");
CREATE INDEX "sku_vendor_idx" ON "app"."sku"("vendor_id") WHERE "vendor_id" IS NOT NULL;
CREATE INDEX "sku_category_idx" ON "app"."sku"("category_number") WHERE "category_number" IS NOT NULL;
CREATE INDEX "sku_created_at_idx" ON "app"."sku"("created_at");

-- ─── State-transition audit log ─────────────────────────────────────────────
-- One row per state change (create, finalize, discontinue, etc.). Service-layer
-- writes are the only source; there's no DB-level trigger because we want the
-- service to own the "who/why" context.
CREATE TABLE "app"."sku_activity" (
    "id"             UUID            NOT NULL DEFAULT gen_random_uuid(),
    "sku_id"         UUID            NOT NULL,
    "event"          TEXT            NOT NULL,   -- 'created' | 'updated' | 'finalized' | 'discontinued' | 'reactivated'
    "from_state"     TEXT,
    "to_state"       TEXT,
    "actor"          TEXT            NOT NULL,
    "payload_json"   JSONB,                       -- before/after diff on updates; final code on finalize
    "occurred_at"    TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT "sku_activity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sku_activity_sku_id_fkey" FOREIGN KEY ("sku_id")
        REFERENCES "app"."sku"("id") ON DELETE CASCADE
);

CREATE INDEX "sku_activity_sku_id_idx" ON "app"."sku_activity"("sku_id", "occurred_at" DESC);
CREATE INDEX "sku_activity_occurred_at_idx" ON "app"."sku_activity"("occurred_at" DESC);

-- ─── Drafts view — convenience for the admin "Borradores" page ──────────────
CREATE VIEW "app"."sku_drafts" AS
    SELECT
        s.id,
        s.provisional_code,
        s.family_code,
        s.vendor_id,
        s.vendor_sku,
        s.description_rics,
        s.retail_price,
        s.created_at,
        s.created_by,
        -- age in days — lets the UI warn about stale drafts
        EXTRACT(DAY FROM (now() - s.created_at))::int AS age_days
    FROM "app"."sku" s
    WHERE s.sku_state = 'DRAFT';

COMMENT ON TABLE "app"."sku" IS
    'Net-new SKUs created in Zack''s Retail. Lifecycle: DRAFT → ACTIVE → DISCONTINUED. Legacy RICS SKUs remain in rics_mirror.inventory_master during Phase A.';
COMMENT ON COLUMN "app"."sku"."provisional_code" IS
    'Auto-generated at create time (e.g. DRF-260422-0001). Always present; never reused as the final code.';
COMMENT ON COLUMN "app"."sku"."code" IS
    'Final internal SKU code. NULL while DRAFT. Set at finalize time. Cannot be renamed after ACTIVE.';
COMMENT ON COLUMN "app"."sku"."sku_state" IS
    'DRAFT = receipt allowed but not allocate/barcode/POS/ecommerce. ACTIVE = all downstream ops unlocked. DISCONTINUED = read-only.';
