-- Buyer keyword codes are distinct people:
--   ab  -> Alex Bendeck
--   axb -> Alejandro Bendeck
UPDATE app.attribute_value av
SET label_es = CASE av.code
  WHEN 'ab' THEN 'Alex Bendeck'
  WHEN 'axb' THEN 'Alejandro Bendeck'
  ELSE av.label_es
END
FROM app.attribute_dimension ad
WHERE ad.id = av.dimension_id
  AND ad.code = 'buyer'
  AND av.code IN ('ab', 'axb');
