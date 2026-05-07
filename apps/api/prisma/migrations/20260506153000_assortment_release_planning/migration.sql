-- Assortment release planning.
-- Plans gradual warehouse-to-store release waves before inventory is moved.

ALTER TYPE "app"."TransferOrigin" ADD VALUE IF NOT EXISTS 'ASSORTMENT';

CREATE TABLE IF NOT EXISTS "app"."assortment_color_alias" (
  "raw_key" TEXT NOT NULL,
  "canonical_color" TEXT NOT NULL,
  "color_family" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_by" TEXT NOT NULL DEFAULT 'seed',

  CONSTRAINT "assortment_color_alias_pkey" PRIMARY KEY ("raw_key")
);

CREATE TABLE IF NOT EXISTS "app"."assortment_plan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "label" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "category_number" SMALLINT NOT NULL,
  "category_label" TEXT NOT NULL,
  "warehouse_store_id" INTEGER NOT NULL,
  "warehouse_store_label" TEXT NOT NULL,
  "target_store_ids" INTEGER[] NOT NULL,
  "start_date" DATE NOT NULL,
  "horizon_months" SMALLINT NOT NULL DEFAULT 12,
  "high_season_months" SMALLINT[] NOT NULL DEFAULT ARRAY[6,11,12]::SMALLINT[],
  "history_from_year_month" VARCHAR(7) NOT NULL,
  "history_to_year_month" VARCHAR(7) NOT NULL,
  "metadata" JSONB,
  "created_by" TEXT NOT NULL DEFAULT 'system',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "archived_at" TIMESTAMPTZ,

  CONSTRAINT "assortment_plan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "assortment_plan_status_updated_idx"
  ON "app"."assortment_plan"("status", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "assortment_plan_category_idx"
  ON "app"."assortment_plan"("category_number", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "app"."assortment_plan_pool_item" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_id" UUID NOT NULL,
  "sku_id" UUID NOT NULL,
  "sku_code" VARCHAR(32) NOT NULL,
  "sku_description" TEXT,
  "raw_color_key" TEXT NOT NULL,
  "canonical_color" TEXT NOT NULL,
  "color_family" TEXT NOT NULL,
  "inclusion_reason" TEXT NOT NULL,
  "warehouse_units" INTEGER NOT NULL,
  "keywords" TEXT,
  "assigned_wave_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "assortment_plan_pool_item_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "assortment_plan_pool_item_plan_sku_key"
  ON "app"."assortment_plan_pool_item"("plan_id", "sku_id");

CREATE INDEX IF NOT EXISTS "assortment_plan_pool_item_plan_color_idx"
  ON "app"."assortment_plan_pool_item"("plan_id", "canonical_color");

CREATE TABLE IF NOT EXISTS "app"."assortment_plan_wave" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_id" UUID NOT NULL,
  "sequence" SMALLINT NOT NULL,
  "release_date" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "generated_transfer_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "committed_at" TIMESTAMPTZ,

  CONSTRAINT "assortment_plan_wave_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "assortment_plan_wave_plan_sequence_key"
  ON "app"."assortment_plan_wave"("plan_id", "sequence");

CREATE INDEX IF NOT EXISTS "assortment_plan_wave_plan_status_idx"
  ON "app"."assortment_plan_wave"("plan_id", "status", "release_date");

CREATE TABLE IF NOT EXISTS "app"."assortment_plan_wave_line" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "wave_id" UUID NOT NULL,
  "pool_item_id" UUID NOT NULL,
  "sku_id" UUID NOT NULL,
  "sku_code" VARCHAR(32) NOT NULL,
  "raw_color_key" TEXT NOT NULL,
  "canonical_color" TEXT NOT NULL,
  "warehouse_units" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "assortment_plan_wave_line_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "assortment_plan_wave_line_pool_item_key"
  ON "app"."assortment_plan_wave_line"("pool_item_id");

CREATE INDEX IF NOT EXISTS "assortment_plan_wave_line_wave_idx"
  ON "app"."assortment_plan_wave_line"("wave_id", "canonical_color");

CREATE TABLE IF NOT EXISTS "app"."assortment_plan_store_allocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "wave_line_id" UUID NOT NULL,
  "store_id" INTEGER NOT NULL,
  "store_label" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "assortment_plan_store_allocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "assortment_plan_store_allocation_line_store_key"
  ON "app"."assortment_plan_store_allocation"("wave_line_id", "store_id");

CREATE INDEX IF NOT EXISTS "assortment_plan_store_allocation_store_idx"
  ON "app"."assortment_plan_store_allocation"("store_id");

CREATE TABLE IF NOT EXISTS "app"."assortment_plan_transfer_link" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_id" UUID NOT NULL,
  "wave_id" UUID NOT NULL,
  "transfer_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "assortment_plan_transfer_link_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "assortment_plan_transfer_link_transfer_key"
  ON "app"."assortment_plan_transfer_link"("transfer_id");

CREATE INDEX IF NOT EXISTS "assortment_plan_transfer_link_wave_idx"
  ON "app"."assortment_plan_transfer_link"("wave_id");

ALTER TABLE "app"."assortment_plan_pool_item"
  ADD CONSTRAINT "assortment_plan_pool_item_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "app"."assortment_plan"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."assortment_plan_pool_item"
  ADD CONSTRAINT "assortment_plan_pool_item_sku_id_fkey"
  FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."assortment_plan_pool_item"
  ADD CONSTRAINT "assortment_plan_pool_item_wave_id_fkey"
  FOREIGN KEY ("assigned_wave_id") REFERENCES "app"."assortment_plan_wave"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."assortment_plan_wave"
  ADD CONSTRAINT "assortment_plan_wave_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "app"."assortment_plan"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."assortment_plan_wave_line"
  ADD CONSTRAINT "assortment_plan_wave_line_wave_id_fkey"
  FOREIGN KEY ("wave_id") REFERENCES "app"."assortment_plan_wave"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."assortment_plan_wave_line"
  ADD CONSTRAINT "assortment_plan_wave_line_pool_item_id_fkey"
  FOREIGN KEY ("pool_item_id") REFERENCES "app"."assortment_plan_pool_item"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."assortment_plan_wave_line"
  ADD CONSTRAINT "assortment_plan_wave_line_sku_id_fkey"
  FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."assortment_plan_store_allocation"
  ADD CONSTRAINT "assortment_plan_store_allocation_wave_line_id_fkey"
  FOREIGN KEY ("wave_line_id") REFERENCES "app"."assortment_plan_wave_line"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."assortment_plan_transfer_link"
  ADD CONSTRAINT "assortment_plan_transfer_link_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "app"."assortment_plan"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."assortment_plan_transfer_link"
  ADD CONSTRAINT "assortment_plan_transfer_link_wave_id_fkey"
  FOREIGN KEY ("wave_id") REFERENCES "app"."assortment_plan_wave"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."assortment_plan_transfer_link"
  ADD CONSTRAINT "assortment_plan_transfer_link_transfer_id_fkey"
  FOREIGN KEY ("transfer_id") REFERENCES "app"."transfer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "app"."assortment_color_alias" ("raw_key", "canonical_color", "color_family", "updated_by")
VALUES
  ('BK', 'Negro', 'black', 'seed:assortment'),
  ('BLK', 'Negro', 'black', 'seed:assortment'),
  ('NEGR', 'Negro', 'black', 'seed:assortment'),
  ('NEGRO', 'Negro', 'black', 'seed:assortment'),
  ('BL', 'Azul', 'blue', 'seed:assortment'),
  ('AZUL', 'Azul', 'blue', 'seed:assortment'),
  ('DBL', 'Azul', 'blue', 'seed:assortment'),
  ('LBL', 'Azul', 'blue', 'seed:assortment'),
  ('SBL', 'Azul', 'blue', 'seed:assortment'),
  ('NV', 'Navy', 'blue', 'seed:assortment'),
  ('NAVY', 'Navy', 'blue', 'seed:assortment'),
  ('CELE', 'Celeste', 'blue', 'seed:assortment'),
  ('RD', 'Rojo', 'red', 'seed:assortment'),
  ('ROJO', 'Rojo', 'red', 'seed:assortment'),
  ('VINO', 'Vino', 'red', 'seed:assortment'),
  ('GN', 'Verde', 'green', 'seed:assortment'),
  ('VERD', 'Verde', 'green', 'seed:assortment'),
  ('GY', 'Gris', 'gray', 'seed:assortment'),
  ('GRIS', 'Gris', 'gray', 'seed:assortment'),
  ('SL', 'Plateado', 'metallic', 'seed:assortment'),
  ('BG', 'Beige', 'neutral', 'seed:assortment'),
  ('BE', 'Beige', 'neutral', 'seed:assortment'),
  ('BEIG', 'Beige', 'neutral', 'seed:assortment'),
  ('KH', 'Khaki', 'neutral', 'seed:assortment'),
  ('CF', 'Cafe', 'brown', 'seed:assortment'),
  ('CAFE', 'Cafe', 'brown', 'seed:assortment'),
  ('PR', 'Morado', 'purple', 'seed:assortment'),
  ('PURP', 'Morado', 'purple', 'seed:assortment'),
  ('MORA', 'Morado', 'purple', 'seed:assortment'),
  ('PK', 'Rosa', 'pink', 'seed:assortment'),
  ('ROSA', 'Rosa', 'pink', 'seed:assortment'),
  ('YL', 'Amarillo', 'yellow', 'seed:assortment'),
  ('AMAR', 'Amarillo', 'yellow', 'seed:assortment'),
  ('DISE', 'Diseno', 'print', 'seed:assortment'),
  ('RAYA', 'Raya', 'print', 'seed:assortment'),
  ('PUNT', 'Punto', 'print', 'seed:assortment'),
  ('FLOR', 'Floral', 'print', 'seed:assortment'),
  ('CUAD', 'Cuadros', 'print', 'seed:assortment'),
  ('ROMB', 'Rombo', 'print', 'seed:assortment'),
  ('GEOM', 'Geometrico', 'print', 'seed:assortment'),
  ('MODE', 'Diseno', 'print', 'seed:assortment')
ON CONFLICT ("raw_key") DO NOTHING;
