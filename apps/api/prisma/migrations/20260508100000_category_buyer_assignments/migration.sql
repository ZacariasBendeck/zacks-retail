-- Category buyer ownership.
-- A category can be owned by multiple buyers. Buyers are the existing
-- app.attribute_value rows for the `buyer` dimension so planning/reporting
-- continues to use the same buyer catalog.

CREATE TABLE IF NOT EXISTS "app"."category_buyer_assignment" (
  "category_number" SMALLINT NOT NULL,
  "buyer_value_id" SMALLINT NOT NULL,
  "updated_by" TEXT NOT NULL DEFAULT 'system',
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "category_buyer_assignment_pkey"
    PRIMARY KEY ("category_number", "buyer_value_id"),
  CONSTRAINT "category_buyer_assignment_category_fkey"
    FOREIGN KEY ("category_number") REFERENCES "app"."taxonomy_category"("number")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "category_buyer_assignment_buyer_value_fkey"
    FOREIGN KEY ("buyer_value_id") REFERENCES "app"."attribute_value"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "category_buyer_assignment_buyer_idx"
  ON "app"."category_buyer_assignment"("buyer_value_id", "category_number");
