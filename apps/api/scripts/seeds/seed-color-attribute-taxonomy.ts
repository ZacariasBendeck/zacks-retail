/**
 * Seed the canonical color attribute values and derived color_family metadata.
 *
 * color_family is intentionally not a normal operator-editable SKU field. It is
 * derived from the selected color through app.color_family_derivation_rule and
 * written to sku_attribute_assignment with assigned_by='seed:derived:color_family'.
 */
import { Client } from 'pg';

interface ColorSpec {
  code: string;
  labelEs: string;
  familyCode: string;
}

const COLOR_DIMENSION = {
  code: 'color',
  labelEs: 'Color',
  descriptionEs: 'Color principal del SKU',
  sortOrder: 500,
};

const COLOR_FAMILY_DIMENSION = {
  code: 'color_family',
  labelEs: 'Familia de Color',
  descriptionEs: 'Familia cromatica derivada del color principal',
  sortOrder: 610,
};

const COLOR_FAMILIES = [
  'black',
  'white',
  'neutral',
  'brown',
  'gray',
  'metallic',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'pink',
  'purple',
  'print',
  'transparent',
  'multicolor',
];

const COLORS: ColorSpec[] = [
  { code: '1', labelEs: 'Negro', familyCode: 'black' },
  { code: '2', labelEs: 'Blanco', familyCode: 'white' },
  { code: 'crema', labelEs: 'Crema', familyCode: 'neutral' },
  { code: '3', labelEs: 'Beige', familyCode: 'neutral' },
  { code: '4', labelEs: 'Nude', familyCode: 'neutral' },
  { code: '7', labelEs: 'Tan', familyCode: 'neutral' },
  { code: '6', labelEs: 'Camel', familyCode: 'neutral' },
  { code: '5', labelEs: 'Café', familyCode: 'brown' },
  { code: 'chocolate', labelEs: 'Chocolate', familyCode: 'brown' },
  { code: '18', labelEs: 'Gris', familyCode: 'gray' },
  { code: '16', labelEs: 'Plateado', familyCode: 'metallic' },
  { code: '15', labelEs: 'Dorado', familyCode: 'metallic' },
  { code: '17', labelEs: 'Rose Gold', familyCode: 'metallic' },
  { code: '8', labelEs: 'Rojo', familyCode: 'red' },
  { code: '9', labelEs: 'Bordo/Vino', familyCode: 'red' },
  { code: 'coral', labelEs: 'Coral', familyCode: 'orange' },
  { code: '20', labelEs: 'Naranja', familyCode: 'orange' },
  { code: '19', labelEs: 'Amarillo', familyCode: 'yellow' },
  { code: '12', labelEs: 'Verde', familyCode: 'green' },
  { code: 'verde_oliva', labelEs: 'Verde Oliva', familyCode: 'green' },
  { code: '11', labelEs: 'Azul', familyCode: 'blue' },
  { code: '10', labelEs: 'Navy', familyCode: 'blue' },
  { code: 'celeste', labelEs: 'Celeste', familyCode: 'blue' },
  { code: 'turquesa', labelEs: 'Turquesa', familyCode: 'blue' },
  { code: '13', labelEs: 'Rosa', familyCode: 'pink' },
  { code: '14', labelEs: 'Fucsia', familyCode: 'pink' },
  { code: '21', labelEs: 'Morado/Lila', familyCode: 'purple' },
  { code: 'animal_print', labelEs: 'Animal Print', familyCode: 'print' },
  { code: 'transparente', labelEs: 'Transparente', familyCode: 'transparent' },
  { code: '22', labelEs: 'Multicolor', familyCode: 'multicolor' },
];

async function upsertDimension(
  client: Client,
  spec: { code: string; labelEs: string; descriptionEs: string; sortOrder: number },
): Promise<void> {
  await client.query(
    `INSERT INTO app.attribute_dimension (code, label_es, description_es, sort_order, is_multi_value)
     VALUES ($1, $2, $3, $4, false)
     ON CONFLICT (code) DO UPDATE SET
       label_es = EXCLUDED.label_es,
       description_es = EXCLUDED.description_es,
       sort_order = EXCLUDED.sort_order,
       is_multi_value = false`,
    [spec.code, spec.labelEs, spec.descriptionEs, spec.sortOrder],
  );
}

async function upsertValue(
  client: Client,
  dimensionCode: string,
  code: string,
  labelEs: string,
  sortOrder: number,
): Promise<void> {
  await client.query(
    `INSERT INTO app.attribute_value (dimension_id, code, label_es, sort_order, is_active)
     SELECT d.id, $2, $3, $4, true
     FROM app.attribute_dimension d
     WHERE d.code = $1
     ON CONFLICT (dimension_id, code) DO UPDATE SET
       label_es = EXCLUDED.label_es,
       sort_order = EXCLUDED.sort_order,
       is_active = true`,
    [dimensionCode, code, labelEs, sortOrder],
  );
}

async function ensureMappingTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app.color_family_derivation_rule (
      color_value_code TEXT PRIMARY KEY,
      color_label TEXT NOT NULL,
      family_value_code TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by TEXT NOT NULL DEFAULT 'seed'
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS color_family_derivation_rule_family_idx
      ON app.color_family_derivation_rule(family_value_code)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS app.attribute_derivation_rule (
      source_dimension_code TEXT NOT NULL,
      source_value_code TEXT NOT NULL,
      target_dimension_code TEXT NOT NULL,
      target_value_code TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by TEXT NOT NULL DEFAULT 'seed',
      PRIMARY KEY (source_dimension_code, source_value_code, target_dimension_code)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS attribute_derivation_rule_source_idx
      ON app.attribute_derivation_rule(source_dimension_code, target_dimension_code)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS attribute_derivation_rule_target_idx
      ON app.attribute_derivation_rule(target_dimension_code, target_value_code)
  `);
}

async function backfillDerivedAssignments(client: Client): Promise<number> {
  await client.query(
    `DELETE FROM app.sku_attribute_assignment a
     USING app.attribute_dimension d
     WHERE a.dimension_id = d.id
       AND d.code = 'color_family'
       AND a.assigned_by = 'seed:derived:color_family'`,
  );

  const inserted = await client.query(
    `WITH color_dim AS (
       SELECT id FROM app.attribute_dimension WHERE code = 'color'
     ),
     family_dim AS (
       SELECT id FROM app.attribute_dimension WHERE code = 'color_family'
     ),
     current_color AS (
       SELECT DISTINCT ON (a.sku_code)
              a.sku_code,
              cv.code AS color_value_code
       FROM app.sku_attribute_assignment a
       JOIN app.attribute_value cv ON cv.id = a.value_id
       JOIN color_dim cd ON cd.id = a.dimension_id
       ORDER BY a.sku_code, a.assigned_at DESC
     )
     INSERT INTO app.sku_attribute_assignment (sku_code, dimension_id, value_id, assigned_by)
     SELECT cc.sku_code,
            fd.id,
            fv.id,
            'seed:derived:color_family'
     FROM current_color cc
     JOIN app.attribute_derivation_rule rule
       ON rule.source_dimension_code = 'color'
      AND rule.source_value_code = cc.color_value_code
      AND rule.target_dimension_code = 'color_family'
     JOIN family_dim fd ON true
     JOIN app.attribute_value fv ON fv.dimension_id = fd.id AND fv.code = rule.target_value_code
     ON CONFLICT (sku_code, dimension_id, value_id) DO UPDATE SET
       assigned_by = EXCLUDED.assigned_by,
       assigned_at = now()`,
  );
  return inserted.rowCount ?? 0;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL environment variable is required');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await ensureMappingTable(client);
    await upsertDimension(client, COLOR_DIMENSION);
    await upsertDimension(client, COLOR_FAMILY_DIMENSION);

    for (let i = 0; i < COLORS.length; i++) {
      const color = COLORS[i]!;
      await upsertValue(client, 'color', color.code, color.labelEs, (i + 1) * 10);
    }

    for (let i = 0; i < COLOR_FAMILIES.length; i++) {
      const family = COLOR_FAMILIES[i]!;
      await upsertValue(client, 'color_family', family, family, (i + 1) * 10);
    }

    for (const color of COLORS) {
      await client.query(
        `INSERT INTO app.color_family_derivation_rule
           (color_value_code, color_label, family_value_code, updated_by, updated_at)
         VALUES ($1, $2, $3, 'seed:color-attribute-taxonomy', now())
         ON CONFLICT (color_value_code) DO UPDATE SET
           color_label = EXCLUDED.color_label,
           family_value_code = EXCLUDED.family_value_code,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()`,
        [color.code, color.labelEs, color.familyCode],
      );
      await client.query(
        `INSERT INTO app.attribute_derivation_rule
           (source_dimension_code, source_value_code, target_dimension_code, target_value_code, updated_by, updated_at)
         VALUES ('color', $1, 'color_family', $2, 'seed:color-attribute-taxonomy', now())
         ON CONFLICT (source_dimension_code, source_value_code, target_dimension_code) DO NOTHING`,
        [color.code, color.familyCode],
      );
    }

    const derivedAssignments = await backfillDerivedAssignments(client);
    await client.query('COMMIT');

    console.log(`Seeded ${COLORS.length} colors.`);
    console.log(`Seeded ${COLOR_FAMILIES.length} color families.`);
    console.log(`Backfilled ${derivedAssignments} derived color_family assignments.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
