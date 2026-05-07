/**
 * One-shot seed: add the 5 attribute dimensions that `seed-legacy-ref-dimensions`
 * doesn't cover but which skuService historically wrote via SQLite `*_id`
 * FKs (`color_family_id`, `shoe_type_id`, `closure_type_id`, `occasion_id`,
 * `label_type_id`).
 *
 * Usage:
 *   pnpm --filter @benlow-rics/api tsx scripts/seeds/seed-missing-attribute-dimensions.ts
 *
 * This seed deliberately does NOT pre-populate any `app.attribute_value` rows.
 * The SQLite ref tables those values used to live in no longer exist (per the
 * 2026-04-23 Postgres-only cutover), and the operator can author fresh values
 * through the existing Attributes Catalog UI at `/products/attributes`.
 *
 * Idempotent — `ON CONFLICT (code) DO UPDATE` refreshes label/description/sort
 * order without renumbering existing dimension ids.
 */
import { Client } from 'pg';

interface DimensionSpec {
  code: string;
  labelEs: string;
  descriptionEs: string | null;
  sortOrder: number;
}

// Five dimensions. Sort orders start at 610 so they slot after the
// legacy-ref block (500–600) populated by `seed-legacy-ref-dimensions`.
// The `label_type` dimension is the RICS "size label" slot (adult / kid /
// infant / etc.) — kept as a dimension rather than a boolean so future
// label types can be added without migration.
const DIMENSIONS: DimensionSpec[] = [
  { code: 'color_family',    labelEs: 'Familia de Color',     descriptionEs: 'Familia cromática del color principal',                  sortOrder: 610 },
  { code: 'shoe_type',       labelEs: 'Tipo de Zapato',       descriptionEs: 'Clasificación general del zapato (sandalia, botín, …)',  sortOrder: 620 },
  { code: 'closure_type',    labelEs: 'Tipo de Cierre',       descriptionEs: 'Mecanismo de cierre (cordones, velcro, sin cierre, …)',  sortOrder: 630 },
  { code: 'occasion',        labelEs: 'Ocasión',              descriptionEs: 'Ocasión de uso (formal, casual, deportivo, …)',           sortOrder: 640 },
  { code: 'label_type',      labelEs: 'Tipo de Etiqueta',     descriptionEs: 'Slot de etiqueta RICS (adulto, infantil, …)',             sortOrder: 660 },
];

async function upsertDimension(client: Client, spec: DimensionSpec): Promise<void> {
  await client.query(
    `INSERT INTO app.attribute_dimension (code, label_es, description_es, sort_order, is_multi_value)
     VALUES ($1, $2, $3, $4, false)
     ON CONFLICT (code) DO UPDATE SET
       label_es       = EXCLUDED.label_es,
       description_es = EXCLUDED.description_es,
       sort_order     = EXCLUDED.sort_order`,
    [spec.code, spec.labelEs, spec.descriptionEs, spec.sortOrder],
  );
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    console.log(`Seeding ${DIMENSIONS.length} attribute dimensions…`);
    for (const spec of DIMENSIONS) {
      await upsertDimension(client, spec);
      console.log(`  ✓ ${spec.code} (${spec.labelEs})`);
    }
    console.log('Done. Add values through the Attributes Catalog UI at /products/attributes.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
