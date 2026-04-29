-- Allow native purchase-order rows rebuilt from the RICS CSV artifact pack.
ALTER TABLE app.purchase_order
  DROP CONSTRAINT IF EXISTS purchase_order_origin_check;

ALTER TABLE app.purchase_order
  ADD CONSTRAINT purchase_order_origin_check
  CHECK (
    origin IN (
      'MANUAL',
      'DUPLICATE',
      'REPLICATE',
      'AUTO',
      'MERGED',
      'ASN_INBOUND',
      'REORDER_PLANNER',
      'RICS_IMPORT'
    )
  );
