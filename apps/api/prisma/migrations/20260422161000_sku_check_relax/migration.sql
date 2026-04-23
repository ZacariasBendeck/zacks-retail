-- Relax the sku_code_matches_state check constraint.
--
-- The original constraint required `code IS NOT NULL` for both ACTIVE and
-- DISCONTINUED. That blocked a legitimate transition: discontinuing a DRAFT
-- that was never finalized (no code set). The corrected rule:
--
--   ACTIVE       → code MUST be populated (the finalize invariant)
--   DRAFT        → code can be NULL or set (operator may type ahead of finalize)
--   DISCONTINUED → code can be NULL (discontinued drafts) or set (discontinued actives)
--
-- Spec: C:\Users\zbend\.claude\plans\http-localhost-3000-inventory-skus-new-i-piped-galaxy.md
--       §"Phase 5 — SKU lifecycle"

ALTER TABLE "app"."sku" DROP CONSTRAINT IF EXISTS "sku_code_matches_state";

ALTER TABLE "app"."sku"
    ADD CONSTRAINT "sku_code_matches_state" CHECK (
        sku_state <> 'ACTIVE' OR code IS NOT NULL
    );
