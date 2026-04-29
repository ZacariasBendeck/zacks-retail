ALTER TABLE app.attribute_value
  ADD COLUMN IF NOT EXISTS description_es TEXT;

COMMENT ON COLUMN app.attribute_value.description_es IS
  'Operator-facing synonyms or guidance explaining when to choose this attribute value.';
