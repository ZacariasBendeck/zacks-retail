-- Store buying eligibility for taxonomy categories.
-- Kept idempotent because buyer purchase planning also uses this table.

CREATE TABLE IF NOT EXISTS "app"."store_category_carrying" (
  "store_id" INTEGER NOT NULL,
  "category_number" SMALLINT NOT NULL,
  "carries" BOOLEAN NOT NULL DEFAULT true,
  "source" VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
  "chain_code" VARCHAR(64),
  "note" TEXT,
  "updated_by" TEXT NOT NULL DEFAULT 'system',
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "store_category_carrying_pkey" PRIMARY KEY ("store_id", "category_number"),
  CONSTRAINT "store_category_carrying_source_check"
    CHECK ("source" IN ('SEED', 'CHAIN', 'MANUAL')),
  CONSTRAINT "store_category_carrying_store_fkey"
    FOREIGN KEY ("store_id") REFERENCES "app"."store_master"("number")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "store_category_carrying_category_fkey"
    FOREIGN KEY ("category_number") REFERENCES "app"."taxonomy_category"("number")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "store_category_carrying_category_idx"
  ON "app"."store_category_carrying"("category_number", "carries", "store_id");

CREATE INDEX IF NOT EXISTS "store_category_carrying_chain_idx"
  ON "app"."store_category_carrying"("chain_code", "category_number");
