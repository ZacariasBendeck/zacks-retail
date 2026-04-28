-- Product Matching Sets / Conjuntos.
--
-- App-owned relationship layer for products that are bought, presented, or
-- analyzed together while remaining separate sellable SKUs.
--
-- Canonical member links point at app.sku(id), not a retired mirror table, so
-- the relationships survive repeated RICS CSV rehearsal imports.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SEQUENCE IF NOT EXISTS "app"."matching_set_code_seq";

CREATE TABLE IF NOT EXISTS "app"."matching_set_type" (
  "code" TEXT NOT NULL,
  "label_es" TEXT NOT NULL,
  "description_es" TEXT,
  "sort_order" SMALLINT NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "matching_set_type_pkey" PRIMARY KEY ("code")
);

CREATE TABLE IF NOT EXISTS "app"."matching_set_role" (
  "set_type_code" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label_es" TEXT NOT NULL,
  "sort_order" SMALLINT NOT NULL DEFAULT 0,
  "required_default" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "matching_set_role_pkey" PRIMARY KEY ("set_type_code", "code"),
  CONSTRAINT "matching_set_role_set_type_fkey"
    FOREIGN KEY ("set_type_code") REFERENCES "app"."matching_set_type"("code")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "app"."matching_set" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "set_type_code" TEXT NOT NULL,
  "description_es" TEXT,
  "vendor_id" VARCHAR(4),
  "vendor_style" TEXT,
  "shared_color_code" TEXT,
  "shared_color_label" TEXT,
  "season" VARCHAR(2),
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL DEFAULT 'system',
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" TEXT NOT NULL DEFAULT 'system',

  CONSTRAINT "matching_set_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "matching_set_code_key" UNIQUE ("code"),
  CONSTRAINT "matching_set_set_type_fkey"
    FOREIGN KEY ("set_type_code") REFERENCES "app"."matching_set_type"("code")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "matching_set_vendor_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "app"."vendor"("code")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "app"."matching_set_member" (
  "set_id" UUID NOT NULL,
  "sku_id" UUID NOT NULL,
  "role_code" TEXT NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "quantity_ratio" NUMERIC(8,3) NOT NULL DEFAULT 1,
  "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "added_by" TEXT NOT NULL DEFAULT 'system',
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" TEXT NOT NULL DEFAULT 'system',

  CONSTRAINT "matching_set_member_pkey" PRIMARY KEY ("set_id", "sku_id"),
  CONSTRAINT "matching_set_member_set_fkey"
    FOREIGN KEY ("set_id") REFERENCES "app"."matching_set"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "matching_set_member_sku_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "matching_set_type_idx"
  ON "app"."matching_set"("set_type_code");

CREATE INDEX IF NOT EXISTS "matching_set_vendor_idx"
  ON "app"."matching_set"("vendor_id");

CREATE INDEX IF NOT EXISTS "matching_set_lookup_idx"
  ON "app"."matching_set"("vendor_id", "vendor_style", "shared_color_code", "season");

CREATE INDEX IF NOT EXISTS "matching_set_active_idx"
  ON "app"."matching_set"("active", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "matching_set_member_sku_idx"
  ON "app"."matching_set_member"("sku_id");

CREATE INDEX IF NOT EXISTS "matching_set_member_role_idx"
  ON "app"."matching_set_member"("role_code");

CREATE UNIQUE INDEX IF NOT EXISTS "matching_set_member_one_primary_idx"
  ON "app"."matching_set_member"("set_id")
  WHERE "is_primary";

INSERT INTO "app"."matching_set_type" ("code", "label_es", "description_es", "sort_order", "active")
VALUES
  ('suit', 'Traje / Conjunto formal', 'Saco, pantalon, chaleco u otras piezas formales que se compran juntas.', 10, true),
  ('bikini', 'Bikini', 'Top, bottom, coverup u otras piezas de bikini.', 20, true),
  ('pj_set', 'Pijama', 'Piezas de pijama o robe que se coordinan.', 30, true),
  ('coordinate', 'Coordinado', 'Piezas de outfit que se presentan o compran como historia coordinada.', 40, true),
  ('other', 'Otro conjunto', 'Relacion general entre SKUs que deben analizarse juntos.', 90, true)
ON CONFLICT ("code") DO UPDATE SET
  "label_es" = EXCLUDED."label_es",
  "description_es" = EXCLUDED."description_es",
  "sort_order" = EXCLUDED."sort_order",
  "active" = EXCLUDED."active",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "app"."matching_set_role" (
  "set_type_code", "code", "label_es", "sort_order", "required_default", "active"
)
VALUES
  ('suit', 'jacket', 'Saco', 10, true, true),
  ('suit', 'pant', 'Pantalon', 20, true, true),
  ('suit', 'vest', 'Chaleco', 30, false, true),
  ('suit', 'tie', 'Corbata', 40, false, true),
  ('suit', 'other', 'Otro', 90, false, true),

  ('bikini', 'top', 'Top', 10, true, true),
  ('bikini', 'bottom', 'Bottom', 20, true, true),
  ('bikini', 'coverup', 'Coverup', 30, false, true),
  ('bikini', 'other', 'Otro', 90, false, true),

  ('pj_set', 'top', 'Top', 10, true, true),
  ('pj_set', 'bottom', 'Bottom', 20, true, true),
  ('pj_set', 'robe', 'Robe', 30, false, true),
  ('pj_set', 'other', 'Otro', 90, false, true),

  ('coordinate', 'top', 'Top', 10, false, true),
  ('coordinate', 'bottom', 'Bottom', 20, false, true),
  ('coordinate', 'skirt', 'Falda', 30, false, true),
  ('coordinate', 'jacket', 'Saco / Chaqueta', 40, false, true),
  ('coordinate', 'other', 'Otro', 90, false, true),

  ('other', 'primary', 'Principal', 10, false, true),
  ('other', 'secondary', 'Secundario', 20, false, true),
  ('other', 'other', 'Otro', 90, false, true)
ON CONFLICT ("set_type_code", "code") DO UPDATE SET
  "label_es" = EXCLUDED."label_es",
  "sort_order" = EXCLUDED."sort_order",
  "required_default" = EXCLUDED."required_default",
  "active" = EXCLUDED."active",
  "updated_at" = CURRENT_TIMESTAMP;
