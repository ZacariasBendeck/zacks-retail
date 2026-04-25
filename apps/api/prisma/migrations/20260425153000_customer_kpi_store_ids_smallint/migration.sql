ALTER TABLE "app"."customer_transaction_fact"
  ALTER COLUMN "store_id"
  TYPE SMALLINT
  USING CASE
    WHEN "store_id" IS NULL THEN NULL
    WHEN "store_id"::text ~ '^\d+$' THEN ("store_id"::text)::smallint
    ELSE NULL
  END;

ALTER TABLE "app"."customer_metrics"
  ALTER COLUMN "primary_store_id"
  TYPE SMALLINT
  USING CASE
    WHEN "primary_store_id" IS NULL THEN NULL
    WHEN "primary_store_id"::text ~ '^\d+$' THEN ("primary_store_id"::text)::smallint
    ELSE NULL
  END;

ALTER TABLE "app"."customer_features_current"
  ALTER COLUMN "preferred_store_id"
  TYPE SMALLINT
  USING CASE
    WHEN "preferred_store_id" IS NULL THEN NULL
    WHEN "preferred_store_id"::text ~ '^\d+$' THEN ("preferred_store_id"::text)::smallint
    ELSE NULL
  END;
