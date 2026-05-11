ALTER TABLE "app"."matching_set"
  ADD COLUMN IF NOT EXISTS "display_name" TEXT;

WITH member_hint AS (
  SELECT DISTINCT ON (m.set_id)
    m.set_id,
    COALESCE(k.code, k.provisional_code) AS sku_code
  FROM "app"."matching_set_member" m
  JOIN "app"."sku" k ON k.id = m.sku_id
  ORDER BY m.set_id, m.is_primary DESC, m.added_at ASC
),
name_parts AS (
  SELECT
    s.id,
    array_remove(ARRAY[
      CASE s.set_type_code
        WHEN 'suit' THEN 'Suit'
        WHEN 'bikini' THEN 'Bikini'
        WHEN 'pj_set' THEN 'Pajama'
        WHEN 'coordinate' THEN 'Coordinate'
        ELSE 'Set'
      END,
      NULLIF(s.vendor_id, ''),
      NULLIF(COALESCE(s.vendor_style, split_part(mh.sku_code, '-', 1)), ''),
      NULLIF(COALESCE(
        s.shared_color_label,
        CASE upper(COALESCE(s.shared_color_code, regexp_replace(mh.sku_code, '^.*-', '')))
          WHEN 'BK' THEN 'Black'
          WHEN 'BLK' THEN 'Black'
          WHEN 'NV' THEN 'Navy'
          WHEN 'NAVY' THEN 'Navy'
          WHEN 'BG' THEN 'Beige'
          WHEN 'BR' THEN 'Brown'
          WHEN 'BN' THEN 'Brown'
          WHEN 'WH' THEN 'White'
          WHEN 'WT' THEN 'White'
          WHEN 'GY' THEN 'Gray'
          WHEN 'GRY' THEN 'Gray'
          WHEN 'RD' THEN 'Red'
          WHEN 'GN' THEN 'Green'
          WHEN 'GR' THEN 'Green'
          WHEN 'BL' THEN 'Blue'
          ELSE NULLIF(COALESCE(s.shared_color_code, regexp_replace(mh.sku_code, '^.*-', '')), '')
        END
      ), '')
    ], NULL) AS parts
  FROM "app"."matching_set" s
  LEFT JOIN member_hint mh ON mh.set_id = s.id
)
UPDATE "app"."matching_set" s
SET "display_name" = array_to_string(np.parts, ' - ')
FROM name_parts np
WHERE np.id = s.id
  AND NULLIF(s.display_name, '') IS NULL
  AND cardinality(np.parts) > 0;
