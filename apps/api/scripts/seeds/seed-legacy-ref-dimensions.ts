/**
 * One-shot seed: migrate the 11 legacy SQLite reference tables into the
 * dimensional-attribute framework on Postgres.
 *
 *   pnpm --filter @benlow-rics/api seed:legacy-ref-dimensions
 *
 * Each ref table becomes a dimension in `app.attribute_dimension`:
 *   colors            → dim `color`
 *   width-types       → dim `width_type`
 *   patterns          → dim `pattern`
 *   finishes          → dim `finish`
 *   accessories       → dim `accessory`
 *   heel-heights      → dim `heel_height`
 *   heel-shapes       → dim `heel_shape`
 *   toe-shapes        → dim `toe_shape`
 *   upper-materials   → dim `upper_material`
 *   outsole-materials → dim `outsole_material`
 *   heel-materials    → dim `heel_material`
 *
 * Each ref-table row becomes an `app.attribute_value` row. The value's `code`
 * is the stringified SQLite id so the existing form-field values (numeric ref
 * ids) continue to resolve after the swap. `label_es` is the ref row's name.
 *
 * Idempotent — ON CONFLICT upserts refresh labels without touching the id.
 * Rows present in Postgres but no longer in the SQLite ref table are left
 * alone (matches the soft-orphan policy of seed-sku-attributes).
 *
 * The API must be running on localhost:4000 (the script calls
 * /api/v1/skus/reference/all to pull the legacy catalog). That endpoint is
 * the single source of truth for the ref tables; hitting it avoids duplicating
 * better-sqlite3 wiring inside this script.
 */
import { Client } from 'pg';

const REF_URL = process.env.REF_URL ?? 'http://localhost:4000/api/v1/skus/reference/all';

interface RefRow {
  id: number;
  name: string;
  active?: boolean;
}

interface DimensionSpec {
  code: string;
  labelEs: string;
  descriptionEs: string | null;
  sortOrder: number;
  refTable: string;
}

const DIMENSIONS: DimensionSpec[] = [
  { code: 'color',            labelEs: 'Color',             descriptionEs: 'Color dominante del zapato',                sortOrder: 500, refTable: 'colors' },
  { code: 'shoe_type',        labelEs: 'Tipo de Zapato',    descriptionEs: 'Clasificación general del zapato',          sortOrder: 505, refTable: 'shoe-types' },
  { code: 'width_type',       labelEs: 'Ancho',             descriptionEs: 'Ancho del zapato (calce)',                  sortOrder: 510, refTable: 'width-types' },
  { code: 'pattern',          labelEs: 'Patrón',            descriptionEs: 'Patrón o estampado del upper',              sortOrder: 520, refTable: 'patterns' },
  { code: 'finish',           labelEs: 'Acabado',           descriptionEs: 'Acabado superficial (brilloso, mate, …)',   sortOrder: 530, refTable: 'finishes' },
  { code: 'closure_type',     labelEs: 'Tipo de Cierre',    descriptionEs: 'Mecanismo de cierre o silueta RICS',        sortOrder: 535, refTable: 'closure-types' },
  { code: 'accessory',        labelEs: 'Accesorio',         descriptionEs: 'Accesorio o adorno principal',              sortOrder: 540, refTable: 'accessories' },
  { code: 'heel_height',      labelEs: 'Altura del Tacón',  descriptionEs: 'Rango de altura del tacón',                 sortOrder: 550, refTable: 'heel-heights' },
  { code: 'heel_shape',       labelEs: 'Forma del Tacón',   descriptionEs: 'Forma/estilo del tacón',                    sortOrder: 560, refTable: 'heel-shapes' },
  { code: 'toe_shape',        labelEs: 'Forma de la Punta', descriptionEs: 'Forma de la punta (redonda, cuadrada, …)',  sortOrder: 570, refTable: 'toe-shapes' },
  { code: 'upper_material',   labelEs: 'Material Superior', descriptionEs: 'Material del upper (parte superior)',       sortOrder: 580, refTable: 'upper-materials' },
  { code: 'outsole_material', labelEs: 'Material de Suela', descriptionEs: 'Material de la suela exterior',             sortOrder: 590, refTable: 'outsole-materials' },
  { code: 'heel_material',    labelEs: 'Material del Tacón', descriptionEs: 'Material del tacón',                       sortOrder: 600, refTable: 'heel-materials' },
  { code: 'occasion',         labelEs: 'Ocasión',            descriptionEs: 'Ocasión de uso',                            sortOrder: 640, refTable: 'occasions' },
  { code: 'target_audience',  labelEs: 'Público Objetivo',   descriptionEs: 'Segmento objetivo',                         sortOrder: 650, refTable: 'target-audiences' },
  { code: 'label_type',       labelEs: 'Tipo de Etiqueta',   descriptionEs: 'Tipo de etiqueta RICS',                     sortOrder: 660, refTable: 'label-types' },
];

async function fetchRefData(): Promise<Record<string, RefRow[]>> {
  const res = await fetch(REF_URL);
  if (!res.ok) throw new Error(`GET ${REF_URL} failed: ${res.status}`);
  return (await res.json()) as Record<string, RefRow[]>;
}

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

async function upsertValues(client: Client, dimCode: string, rows: RefRow[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (!('name' in r) || typeof r.name !== 'string') continue;
    await client.query(
      `INSERT INTO app.attribute_value (dimension_id, code, label_es, sort_order)
       SELECT d.id, $2, $3, $4 FROM app.attribute_dimension d WHERE d.code = $1
       ON CONFLICT (dimension_id, code) DO UPDATE SET
         label_es   = EXCLUDED.label_es,
         sort_order = EXCLUDED.sort_order`,
      [dimCode, String(r.id), r.name, (i + 1) * 10],
    );
    n += 1;
  }
  return n;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');

  console.log('=========================================');
  console.log('  seed:legacy-ref-dimensions');
  console.log('=========================================');
  console.log(`  fetching ref data from ${REF_URL}`);
  const refData = await fetchRefData();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    for (const dim of DIMENSIONS) {
      await upsertDimension(client, dim);
      const rows = refData[dim.refTable] ?? [];
      const n = await upsertValues(client, dim.code, rows);
      console.log(`  ${dim.code.padEnd(18)} ← ${dim.refTable.padEnd(20)} ${String(n).padStart(3)} values`);
    }
  } finally {
    await client.end();
  }

  console.log(`\n  OK - ${DIMENSIONS.length} dimensions seeded.`);
}

main().catch((err) => {
  console.error(`[seed:legacy-ref-dimensions] unhandled error: ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
