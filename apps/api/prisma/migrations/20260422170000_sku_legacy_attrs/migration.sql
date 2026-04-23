-- Transitional JSONB column on app.sku that carries the form's attribute payload
-- (colorId, shoeTypeId, heelHeightId, etc.) without needing 15 dedicated columns
-- for legacy SQLite ref IDs. Phase 4 will migrate these into the dimension
-- framework (app.sku_attribute_assignment). Until then, Phase 5f keeps the
-- existing full SKU form working end-to-end by round-tripping this payload.
--
-- Spec: C:\Users\zbend\.claude\plans\http-localhost-3000-inventory-skus-new-i-piped-galaxy.md
--       §"Phase 5f — Form submit repoint to products module"

ALTER TABLE "app"."sku" ADD COLUMN "legacy_attrs" JSONB;

COMMENT ON COLUMN "app"."sku"."legacy_attrs" IS
    'Transitional: raw payload of attribute IDs the SKU form submits (colorId, shoeTypeId, etc.). Phase 4 migrates these into app.sku_attribute_assignment and this column is dropped.';
