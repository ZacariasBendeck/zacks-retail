CREATE TABLE IF NOT EXISTS app.sku_replacement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_sku_id uuid NOT NULL,
  replacement_sku_id uuid NOT NULL,
  replacement_type varchar(24) NOT NULL DEFAULT 'EXACT',
  transfer_demand boolean NOT NULL DEFAULT true,
  effective_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retired_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by varchar(120) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by varchar(120) NOT NULL DEFAULT 'system',
  CONSTRAINT sku_replacement_old_fkey
    FOREIGN KEY (old_sku_id) REFERENCES app.sku(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT sku_replacement_replacement_fkey
    FOREIGN KEY (replacement_sku_id) REFERENCES app.sku(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT sku_replacement_no_self_chk
    CHECK (old_sku_id <> replacement_sku_id),
  CONSTRAINT sku_replacement_type_chk
    CHECK (replacement_type IN ('EXACT', 'SIMILAR', 'VENDOR_SUBSTITUTE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS sku_replacement_active_old_key
  ON app.sku_replacement (old_sku_id)
  WHERE retired_at IS NULL;

CREATE INDEX IF NOT EXISTS sku_replacement_active_replacement_idx
  ON app.sku_replacement (replacement_sku_id)
  WHERE retired_at IS NULL;

CREATE INDEX IF NOT EXISTS sku_replacement_effective_idx
  ON app.sku_replacement (effective_at DESC);

COMMENT ON TABLE app.sku_replacement IS
  'SKU supersession links. Old SKUs stay historically readable and point at the SKU buyers should reorder.';
COMMENT ON COLUMN app.sku_replacement.transfer_demand IS
  'When true, demand from the old SKU may feed replacement SKU reorder planning.';
