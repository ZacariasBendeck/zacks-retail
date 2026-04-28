-- Drop the legacy `style` column from app.sku.
-- Created: 2026-04-27
--
-- Rationale:
--   The `style` column was only ever populated by two test rows
--   ("Smoke 1777013172066" from a smoke test, "asdf" from manual testing) on a
--   total of 203,750 SKUs. Real product identity uses `style_color` instead
--   (e.g. "SPAN/NEGR"). The form field labeled "Estilo" was the only writer.
--   Removing the column eliminates ambiguity between style/style_color.
--
-- Rollback:
--   ALTER TABLE "app"."sku" ADD COLUMN "style" TEXT;
--   The two existing values are throwaway test data and are not preserved.

ALTER TABLE "app"."sku" DROP COLUMN "style";
