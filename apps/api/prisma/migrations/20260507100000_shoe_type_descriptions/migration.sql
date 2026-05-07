-- Add Spanish operator guidance for shoe_type attribute values.

WITH shoe_type_descriptions(value_code, description_es) AS (
  VALUES
    ('3', 'Bota con caña media o alta que cubre claramente el tobillo y puede subir hacia la pantorrilla o rodilla; usar cuando no es un botín.'),
    ('12', 'Botín o bota corta que llega al tobillo o apenas arriba de él; se distingue de una bota por tener caña baja.'),
    ('13', 'Calzado abierto y casual tipo flip-flop o slide, fácil de poner, con poca estructura; normalmente para playa, casa o uso muy informal.'),
    ('15', 'Zapato cerrado con cordones y sistema de lazado abierto; luce más flexible y casual que un Oxford, aunque puede ser de vestir.'),
    ('10', 'Alpargata o espadrille con suela, cuña o borde de yute/esparto y upper de tela o lona; estilo veraniego y casual.'),
    ('5', 'Zapato plano femenino sin tacón relevante, generalmente cerrado o semi-cerrado; usar para ballerinas o flats que no sean mocasines ni loafers.'),
    ('8', 'Zapato cerrado sin cordones, de entrada fácil y estructura más formal; suele tener antifaz, borlas o empeine alto.'),
    ('11', 'Mocasín suave y flexible, normalmente sin cordones y con costura visible tipo mocasín; más comfort/casual que un loafer estructurado.'),
    ('6', 'Zapato destalonado que deja el talón descubierto y se pone deslizando el pie; puede tener punta cerrada o abierta.'),
    ('7', 'Zapato cerrado de vestir con cordones y lazado cerrado, donde las aletas van cosidas bajo el empeine; más formal que un Derby.'),
    ('14', 'Calzado con suela gruesa elevada bajo la parte delantera o toda la planta; la altura viene de la plataforma, no solo del tacón.'),
    ('1', 'Zapato de vestir escotado, generalmente cerrado en la punta y sin correas ni cordones, con tacón separado; clásico de oficina o evento.'),
    ('2', 'Calzado abierto con tiras que sujetan el empeine o tobillo y dejan visible gran parte del pie; más estructurado que una chancla.'),
    ('4', 'Zapato deportivo o casual con suela de goma y construcción atlética, usualmente con cordones, velcro o ajuste elástico.'),
    ('9', 'Zapato o sandalia con tacón corrido en forma de cuña, donde el talón y la suela forman una sola pieza elevada; usar cuando la altura principal viene de la cuña.')
)
UPDATE app.attribute_value av
SET description_es = s.description_es
FROM shoe_type_descriptions s
JOIN app.attribute_dimension ad ON ad.code = 'shoe_type'
WHERE av.dimension_id = ad.id
  AND av.code = s.value_code;
