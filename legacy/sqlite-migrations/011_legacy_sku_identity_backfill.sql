-- Legacy SKU identity backfill + StyleColor linkage repair
--
-- Purpose:
-- 1) Normalize legacy SKU rows that still have missing brand/style/color values.
-- 2) Ensure every normalized SKU can be linked to style_colors via sku_style_colors.
--
-- Preconditions:
-- - 011_canonical_rics_model.up.sql has already been applied.
-- - Run this script in the target environment before freeze cutover validation.
--
-- Non-obvious design decisions:
-- - Missing brand/color values are mapped to explicit canonical placeholders so
--   data remains queryable and referentially valid instead of silently dropped.
-- - Rows that require placeholder brand/color get a deterministic LEGACY style
--   token derived from sku_code to avoid natural-key collisions.
-- - The script is idempotent: rerunning will not duplicate style_colors or links.

-- --------------------------------------------------
-- 1) Read-only preflight snapshot
-- --------------------------------------------------
SELECT
  SUM(CASE WHEN brand_id IS NULL THEN 1 ELSE 0 END) AS missing_brand,
  SUM(CASE WHEN style IS NULL OR length(trim(style)) = 0 THEN 1 ELSE 0 END) AS missing_style,
  SUM(CASE WHEN color_id IS NULL THEN 1 ELSE 0 END) AS missing_color,
  SUM(
    CASE
      WHEN brand_id IS NULL OR style IS NULL OR length(trim(style)) = 0 OR color_id IS NULL THEN 1
      ELSE 0
    END
  ) AS missing_any
FROM skus;

SELECT
  COUNT(*) AS eligible_skus,
  SUM(CASE WHEN ssc.sku_id IS NOT NULL THEN 1 ELSE 0 END) AS linked_skus,
  SUM(CASE WHEN ssc.sku_id IS NULL THEN 1 ELSE 0 END) AS unlinked_skus
FROM skus s
LEFT JOIN sku_style_colors ssc ON ssc.sku_id = s.id
WHERE s.brand_id IS NOT NULL
  AND s.color_id IS NOT NULL
  AND s.style IS NOT NULL
  AND length(trim(s.style)) > 0;

-- --------------------------------------------------
-- 2) Backfill transaction
-- --------------------------------------------------
BEGIN TRANSACTION;

INSERT OR IGNORE INTO ref_brands (code, name, active)
VALUES ('LEGACY_UNKNOWN_BRAND', 'Legacy Unknown Brand', 1);

INSERT OR IGNORE INTO ref_colors (code, name, active)
VALUES ('LEGACY_UNKNOWN_COLOR', 'Legacy Unknown Color', 1);

UPDATE skus
SET
  brand_id = COALESCE(
    brand_id,
    (SELECT id FROM ref_brands WHERE code = 'LEGACY_UNKNOWN_BRAND')
  ),
  color_id = COALESCE(
    color_id,
    (SELECT id FROM ref_colors WHERE code = 'LEGACY_UNKNOWN_COLOR')
  ),
  style = CASE
    WHEN brand_id IS NULL
      OR color_id IS NULL
      OR style IS NULL
      OR length(trim(style)) = 0
    THEN 'LEGACY-' || replace(upper(trim(sku_code)), ' ', '-')
    ELSE trim(style)
  END,
  updated_at = datetime('now')
WHERE brand_id IS NULL
   OR color_id IS NULL
   OR style IS NULL
   OR length(trim(style)) = 0;

INSERT OR IGNORE INTO style_colors (
  id,
  brand_id,
  style,
  color_id,
  category_id,
  department,
  heel_type,
  heel_material,
  season
)
SELECT
  lower(hex(randomblob(16))),
  s.brand_id,
  trim(s.style),
  s.color_id,
  s.category_id,
  s.department,
  CASE
    WHEN s.heel_type IS NULL OR length(trim(s.heel_type)) = 0 THEN NULL
    ELSE upper(trim(s.heel_type))
  END,
  CASE
    WHEN s.material IS NULL OR length(trim(s.material)) = 0 THEN NULL
    ELSE upper(trim(s.material))
  END,
  s.season
FROM skus s
WHERE s.brand_id IS NOT NULL
  AND s.color_id IS NOT NULL
  AND s.style IS NOT NULL
  AND length(trim(s.style)) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM style_colors sc
    WHERE sc.brand_id = s.brand_id
      AND sc.color_id = s.color_id
      AND lower(trim(sc.style)) = lower(trim(s.style))
  );

INSERT OR IGNORE INTO sku_style_colors (sku_id, style_color_id)
SELECT
  s.id,
  sc.id
FROM skus s
JOIN style_colors sc
  ON sc.brand_id = s.brand_id
 AND sc.color_id = s.color_id
 AND lower(trim(sc.style)) = lower(trim(s.style))
LEFT JOIN sku_style_colors ssc ON ssc.sku_id = s.id
WHERE s.brand_id IS NOT NULL
  AND s.color_id IS NOT NULL
  AND s.style IS NOT NULL
  AND length(trim(s.style)) > 0
  AND ssc.sku_id IS NULL;

COMMIT;

-- --------------------------------------------------
-- 3) Post-fix validation report (both rows must read PASS)
-- --------------------------------------------------
SELECT
  'sku_identity_preflight' AS check_name,
  CASE WHEN missing_any = 0 THEN 'PASS' ELSE 'FAIL' END AS check_result,
  missing_brand,
  missing_style,
  missing_color,
  missing_any
FROM (
  SELECT
    SUM(CASE WHEN brand_id IS NULL THEN 1 ELSE 0 END) AS missing_brand,
    SUM(CASE WHEN style IS NULL OR length(trim(style)) = 0 THEN 1 ELSE 0 END) AS missing_style,
    SUM(CASE WHEN color_id IS NULL THEN 1 ELSE 0 END) AS missing_color,
    SUM(
      CASE
        WHEN brand_id IS NULL OR style IS NULL OR length(trim(style)) = 0 OR color_id IS NULL THEN 1
        ELSE 0
      END
    ) AS missing_any
  FROM skus
);

SELECT
  'style_color_linkage_preflight' AS check_name,
  CASE WHEN unlinked_skus = 0 THEN 'PASS' ELSE 'FAIL' END AS check_result,
  eligible_skus,
  linked_skus,
  unlinked_skus
FROM (
  SELECT
    COUNT(*) AS eligible_skus,
    SUM(CASE WHEN ssc.sku_id IS NOT NULL THEN 1 ELSE 0 END) AS linked_skus,
    SUM(CASE WHEN ssc.sku_id IS NULL THEN 1 ELSE 0 END) AS unlinked_skus
  FROM skus s
  LEFT JOIN sku_style_colors ssc ON ssc.sku_id = s.id
  WHERE s.brand_id IS NOT NULL
    AND s.color_id IS NOT NULL
    AND s.style IS NOT NULL
    AND length(trim(s.style)) > 0
);

-- Detail list for manual QA sign-off (expect zero rows).
SELECT
  s.id,
  s.sku_code,
  s.brand_id,
  s.style,
  s.color_id
FROM skus s
LEFT JOIN sku_style_colors ssc ON ssc.sku_id = s.id
WHERE s.brand_id IS NOT NULL
  AND s.color_id IS NOT NULL
  AND s.style IS NOT NULL
  AND length(trim(s.style)) > 0
  AND ssc.sku_id IS NULL
ORDER BY s.sku_code;
