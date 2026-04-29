INSERT INTO app.attribute_dimension (code, label_es, description_es, sort_order, is_multi_value)
VALUES
  ('shoe_type', 'Tipo de Zapato', 'Clasificación general del zapato', 505, false),
  ('closure_type', 'Tipo de Cierre', 'Mecanismo de cierre o silueta RICS', 535, false),
  ('occasion', 'Ocasión', 'Ocasión de uso', 640, false),
  ('target_audience', 'Público Objetivo', 'Segmento objetivo', 650, false),
  ('label_type', 'Tipo de Etiqueta', 'Tipo de etiqueta RICS', 660, false)
ON CONFLICT (code) DO UPDATE SET
  label_es = EXCLUDED.label_es,
  description_es = EXCLUDED.description_es,
  sort_order = EXCLUDED.sort_order,
  is_multi_value = EXCLUDED.is_multi_value;

WITH seed_values(dimension_code, value_code, label_es, sort_order) AS (
  VALUES
    ('shoe_type', '3', 'Bota', 10),
    ('shoe_type', '12', 'Bota Corta', 20),
    ('shoe_type', '13', 'Chancla', 30),
    ('shoe_type', '15', 'Derby', 40),
    ('shoe_type', '10', 'Espadrille', 50),
    ('shoe_type', '5', 'Flat', 60),
    ('shoe_type', '8', 'Loafer', 70),
    ('shoe_type', '11', 'Mocasin', 80),
    ('shoe_type', '6', 'Mule', 90),
    ('shoe_type', '7', 'Oxford', 100),
    ('shoe_type', '14', 'Plataforma', 110),
    ('shoe_type', '1', 'Pump', 120),
    ('shoe_type', '2', 'Sandalia', 130),
    ('shoe_type', '4', 'Sneaker', 140),
    ('shoe_type', '9', 'Wedge', 150),
    ('closure_type', '10', '3/4', 10),
    ('closure_type', '11', 'Alta', 20),
    ('closure_type', '4', 'Ankle Strap', 30),
    ('closure_type', '5', 'Atletico', 40),
    ('closure_type', '12', 'Ballerina', 50),
    ('closure_type', '21', 'Clog', 60),
    ('closure_type', '25', 'De Seguridad', 70),
    ('closure_type', '23', 'De Servicio', 80),
    ('closure_type', '14', 'High Top', 90),
    ('closure_type', '24', 'Hiking', 100),
    ('closure_type', '9', 'Loafer', 110),
    ('closure_type', '1', 'Low Top', 120),
    ('closure_type', '13', 'Mary Jane', 130),
    ('closure_type', '19', 'Mocasin', 140),
    ('closure_type', '3', 'Mule', 150),
    ('closure_type', '22', 'Oxford', 160),
    ('closure_type', '6', 'Plataforma Cerrada', 170),
    ('closure_type', '2', 'Plataforma Sandalia', 180),
    ('closure_type', '20', 'Plataforma Tacon', 190),
    ('closure_type', '16', 'Pump', 200),
    ('closure_type', '7', 'Sling Back', 210),
    ('closure_type', '18', 'Slip On', 220),
    ('closure_type', '15', 'T-Bar', 230),
    ('closure_type', '8', 'Thong', 240),
    ('closure_type', '17', 'Vaquera', 250),
    ('occasion', '1', 'Casual', 10),
    ('occasion', '4', 'Deportivo', 20),
    ('occasion', '7', 'Diario', 30),
    ('occasion', '3', 'Fiesta/Gala', 40),
    ('occasion', '6', 'Formal', 50),
    ('occasion', '5', 'Playa', 60),
    ('occasion', '2', 'Trabajo/Oficina', 70),
    ('target_audience', '2', 'Hombre', 10),
    ('target_audience', '1', 'Mujer', 20),
    ('target_audience', '3', 'Niña', 30),
    ('target_audience', '4', 'Niño', 40),
    ('label_type', '4', 'Hang Tags', 10),
    ('label_type', '1', 'No Labels', 20),
    ('label_type', '5', 'Other Labels', 30),
    ('label_type', '2', 'Regular Labels', 40),
    ('label_type', '3', 'Small Labels', 50)
)
INSERT INTO app.attribute_value (dimension_id, code, label_es, sort_order)
SELECT d.id, s.value_code, s.label_es, s.sort_order
FROM seed_values s
JOIN app.attribute_dimension d ON d.code = s.dimension_code
ON CONFLICT (dimension_id, code) DO UPDATE SET
  label_es = EXCLUDED.label_es,
  sort_order = EXCLUDED.sort_order,
  is_active = true;
