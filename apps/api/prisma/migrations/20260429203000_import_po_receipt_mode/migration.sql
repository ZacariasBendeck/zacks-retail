ALTER TABLE "app"."po_receipt"
    DROP CONSTRAINT IF EXISTS "po_receipt_mode_check";

ALTER TABLE "app"."po_receipt"
    ADD CONSTRAINT "po_receipt_mode_check"
    CHECK ("mode" IN ('MANUAL','FULL','SCAN','ASN','IMPORT'));
