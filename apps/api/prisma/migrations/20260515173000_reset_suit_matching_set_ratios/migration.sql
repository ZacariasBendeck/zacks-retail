-- Reset existing suit matching-set planning ratios to the operator default.
--
-- Suit ratio: jacket:pant:vest = 1:1.2:0.5. This intentionally updates all
-- suit rows for those three roles, not only untouched 1.000 defaults, because
-- the initial creation UI sent 1.000 explicitly for every drafted member.

WITH desired AS (
  SELECT * FROM (VALUES
    ('jacket'::text, 1.000::numeric),
    ('pant'::text, 1.200::numeric),
    ('vest'::text, 0.500::numeric)
  ) AS v(role_code, quantity_ratio)
),
changed_members AS (
  UPDATE "app"."matching_set_member" m
  SET "quantity_ratio" = d.quantity_ratio,
      "updated_at" = CURRENT_TIMESTAMP,
      "updated_by" = 'migration:20260515173000_reset_suit_matching_set_ratios'
  FROM "app"."matching_set" s, desired d
  WHERE s."id" = m."set_id"
    AND d.role_code = m."role_code"
    AND s."set_type_code" = 'suit'
    AND m."quantity_ratio" IS DISTINCT FROM d.quantity_ratio
  RETURNING m."set_id"
)
UPDATE "app"."matching_set" s
SET "updated_at" = CURRENT_TIMESTAMP,
    "updated_by" = 'migration:20260515173000_reset_suit_matching_set_ratios'
WHERE s."id" IN (SELECT DISTINCT "set_id" FROM changed_members);
