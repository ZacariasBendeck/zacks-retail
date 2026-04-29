-- "Plano" describes heel height/absence, not the material or covering of a heel.
-- Keep the value out of the Postgres dimensional catalog and ensure the
-- espadrille/jute heel-covering value remains available.

UPDATE app.attribute_value av
SET is_active = false
FROM app.attribute_dimension ad
WHERE ad.id = av.dimension_id
  AND ad.code = 'heel_material'
  AND lower(trim(av.label_es)) IN ('plano', 'flat', 'none');

UPDATE app.attribute_value av
SET label_es = 'Espartillo',
    is_active = true
FROM app.attribute_dimension ad
WHERE ad.id = av.dimension_id
  AND ad.code = 'heel_material'
  AND lower(trim(av.label_es)) IN ('espartillo', 'espadrille');
