/**
 * Companion to `export-attribute-catalog.ts` — load an exported JSON snapshot
 * back into `app.*` attribute framework tables. Idempotent upsert; never deletes.
 *
 *   pnpm --filter @benlow-rics/api import:attributes -- --in path/to/export.json
 *   pnpm --filter @benlow-rics/api import:attributes -- --in export.json --dry-run
 *   pnpm --filter @benlow-rics/api import:attributes -- --in export.json --skip-assignments
 *
 * What it does, in order (each step is a Postgres transaction):
 *   1. Upsert `app.attribute_dimension` rows by `code`.
 *   2. Upsert `app.attribute_value` rows by (dimension_id, code). Dimension is
 *      resolved from the dimension code in the JSON.
 *   3. Upsert `app.attribute_family_rule` rows by (dimension_id, family_code).
 *      Rules pointing at a family_code that doesn't exist in target are
 *      skipped with a warning.
 *   4. Upsert `app.attribute_derivation_rule` rows for macro-category rollups.
 *   5. Upsert `app.sku_attribute_assignment` rows. SKU codes are soft-ref.
 *      No FK is used, so any referenced code inserts cleanly. Orphans surface later
 *      via `app.sku_attribute_orphans`.
 *
 * Never deletes. If target has dimensions/values/rules/assignments not present
 * in the export, they survive untouched (matches the soft-orphan policy used
 * by seed:sku-attributes and seed:product-families).
 *
 * Flags:
 *   --in <path>           Required. Path to the export JSON file.
 *   --dry-run             Parse, validate, show counts, but make no writes.
 *   --skip-assignments    Load catalog + rules only; skip sku_attribute_assignment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

interface Args {
  inPath: string;
  dryRun: boolean;
  skipAssignments: boolean;
}

interface DimensionIn {
  code: string;
  labelEs: string;
  descriptionEs: string | null;
  sortOrder: number;
  isMultiValue: boolean;
  values: ValueIn[];
}

interface ValueIn {
  code: string;
  labelEs: string;
  descriptionEs?: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface FamilyRuleIn {
  dimensionCode: string;
  familyCode: string;
  enabled: boolean;
  isRequired: boolean;
  sortOrder: number;
  updatedBy: string;
  updatedAt: string;
}

interface AssignmentIn {
  skuCode: string;
  dimensionCode: string;
  valueCode: string;
  assignedBy: string | null;
  assignedAt: string;
}

interface MacroRuleIn {
  sourceDimensionCode: string;
  sourceValueCode: string;
  targetDimensionCode: string;
  targetValueCode: string;
  updatedBy: string;
  updatedAt: string;
}

interface ExportFile {
  version: string;
  exportedAt: string;
  exportedFromDatabase: string;
  counts: Record<string, unknown>;
  dimensions: DimensionIn[];
  familyRules: FamilyRuleIn[];
  macroRules?: MacroRuleIn[];
  assignments: AssignmentIn[];
}

function parseArgs(): Args {
  const out: Args = { inPath: '', dryRun: false, skipAssignments: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--in':
      case '-i':
        out.inPath = path.resolve(String(argv[++i] ?? ''));
        break;
      case '--dry-run':
        out.dryRun = true;
        break;
      case '--skip-assignments':
        out.skipAssignments = true;
        break;
      case '--help':
      case '-h':
        console.log('See file header for flags.');
        process.exit(0);
    }
  }
  if (!out.inPath) {
    console.error('Missing required flag: --in <path-to-export.json>');
    process.exit(2);
  }
  if (!fs.existsSync(out.inPath)) {
    console.error(`Input file not found: ${out.inPath}`);
    process.exit(2);
  }
  return out;
}

function loadExport(inPath: string): ExportFile {
  const raw = fs.readFileSync(inPath, 'utf8');
  let parsed: ExportFile;
  try {
    parsed = JSON.parse(raw) as ExportFile;
  } catch (err) {
    throw new Error(`Failed to parse JSON: ${(err as Error).message}`);
  }
  if (parsed.version !== '1') {
    throw new Error(`Unsupported export version: ${parsed.version}. This importer handles "1".`);
  }
  if (!Array.isArray(parsed.dimensions)) {
    throw new Error('Export is missing "dimensions" array.');
  }
  if (!Array.isArray(parsed.familyRules)) {
    throw new Error('Export is missing "familyRules" array.');
  }
  if (!Array.isArray(parsed.assignments)) {
    throw new Error('Export is missing "assignments" array.');
  }
  if (parsed.macroRules != null && !Array.isArray(parsed.macroRules)) {
    throw new Error('Export "macroRules" must be an array when present.');
  }
  parsed.macroRules ??= [];
  return parsed;
}

interface ImportCounts {
  dimsInserted: number;
  dimsUpdated: number;
  valuesInserted: number;
  valuesUpdated: number;
  rulesInserted: number;
  rulesUpdated: number;
  rulesSkippedMissingFamily: number;
  macroRulesInserted: number;
  macroRulesUpdated: number;
  macroRulesSkippedMissingValue: number;
  assignmentsInserted: number;
  assignmentsUpdated: number;
  assignmentsSkippedMissingValue: number;
}

async function upsertDimensions(
  client: Client,
  dimensions: DimensionIn[],
  counts: ImportCounts,
): Promise<void> {
  for (const d of dimensions) {
    const r = await client.query<{ inserted: boolean }>(
      `INSERT INTO app.attribute_dimension (code, label_es, description_es, sort_order, is_multi_value)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code) DO UPDATE SET
         label_es       = EXCLUDED.label_es,
         description_es = EXCLUDED.description_es,
         sort_order     = EXCLUDED.sort_order,
         is_multi_value = EXCLUDED.is_multi_value
       RETURNING (xmax = 0) AS inserted`,
      [d.code, d.labelEs, d.descriptionEs, d.sortOrder, d.isMultiValue],
    );
    if (r.rows[0]?.inserted) counts.dimsInserted += 1;
    else counts.dimsUpdated += 1;
  }
}

async function upsertValues(
  client: Client,
  dimensions: DimensionIn[],
  counts: ImportCounts,
): Promise<void> {
  for (const d of dimensions) {
    for (const v of d.values) {
      const r = await client.query<{ inserted: boolean }>(
        `INSERT INTO app.attribute_value (dimension_id, code, label_es, description_es, sort_order, is_active)
         SELECT dim.id, $2, $3, $4, $5, $6
         FROM app.attribute_dimension dim WHERE dim.code = $1
         ON CONFLICT (dimension_id, code) DO UPDATE SET
           label_es       = EXCLUDED.label_es,
           description_es = EXCLUDED.description_es,
           sort_order     = EXCLUDED.sort_order,
           is_active      = EXCLUDED.is_active
         RETURNING (xmax = 0) AS inserted`,
        [d.code, v.code, v.labelEs, v.descriptionEs ?? null, v.sortOrder, v.isActive],
      );
      if (r.rows[0]?.inserted) counts.valuesInserted += 1;
      else counts.valuesUpdated += 1;
    }
  }
}

async function upsertFamilyRules(
  client: Client,
  rules: FamilyRuleIn[],
  counts: ImportCounts,
): Promise<void> {
  for (const rule of rules) {
    // Validate family exists first — rule references family_code with an FK
    // (onDelete: Restrict), so inserting a rule for a missing family would
    // raise a constraint violation. Skip + warn.
    const fam = await client.query<{ code: string }>(
      `SELECT code FROM app.product_family WHERE code = $1`,
      [rule.familyCode],
    );
    if (fam.rowCount === 0) {
      counts.rulesSkippedMissingFamily += 1;
      console.warn(
        `  skipped rule: dimension=${rule.dimensionCode} family=${rule.familyCode} (family not present in target DB)`,
      );
      continue;
    }
    const r = await client.query<{ inserted: boolean }>(
      `INSERT INTO app.attribute_family_rule (dimension_id, family_code, enabled, is_required, sort_order, updated_by, updated_at)
       SELECT dim.id, $2, $3, $4, $5, $6, $7::timestamptz
       FROM app.attribute_dimension dim WHERE dim.code = $1
       ON CONFLICT (dimension_id, family_code) DO UPDATE SET
         enabled     = EXCLUDED.enabled,
         is_required = EXCLUDED.is_required,
         sort_order  = EXCLUDED.sort_order,
         updated_by  = EXCLUDED.updated_by,
         updated_at  = EXCLUDED.updated_at
       RETURNING (xmax = 0) AS inserted`,
      [
        rule.dimensionCode,
        rule.familyCode,
        rule.enabled,
        rule.isRequired,
        rule.sortOrder,
        rule.updatedBy,
        rule.updatedAt,
      ],
    );
    if (r.rows[0]?.inserted) counts.rulesInserted += 1;
    else counts.rulesUpdated += 1;
  }
}

async function upsertMacroRules(
  client: Client,
  rules: MacroRuleIn[],
  counts: ImportCounts,
): Promise<void> {
  for (const rule of rules) {
    const sourceValue = await client.query<{ code: string }>(
      `SELECT v.code
       FROM app.attribute_value v
       JOIN app.attribute_dimension d ON d.id = v.dimension_id
       WHERE d.code = $1 AND v.code = $2`,
      [rule.sourceDimensionCode, rule.sourceValueCode],
    );
    const targetValue = await client.query<{ code: string }>(
      `SELECT v.code
       FROM app.attribute_value v
       JOIN app.attribute_dimension d ON d.id = v.dimension_id
       WHERE d.code = $1 AND v.code = $2`,
      [rule.targetDimensionCode, rule.targetValueCode],
    );
    if (sourceValue.rowCount === 0 || targetValue.rowCount === 0) {
      counts.macroRulesSkippedMissingValue += 1;
      console.warn(
        `  skipped macro rule: ${rule.sourceDimensionCode}.${rule.sourceValueCode} -> ${rule.targetDimensionCode}.${rule.targetValueCode} (source or target value missing)`,
      );
      continue;
    }

    const r = await client.query<{ inserted: boolean }>(
      `INSERT INTO app.attribute_derivation_rule (
         source_dimension_code,
         source_value_code,
         target_dimension_code,
         target_value_code,
         updated_by,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
       ON CONFLICT (source_dimension_code, source_value_code, target_dimension_code)
       DO UPDATE SET
         target_value_code = EXCLUDED.target_value_code,
         updated_by = EXCLUDED.updated_by,
         updated_at = EXCLUDED.updated_at
       RETURNING (xmax = 0) AS inserted`,
      [
        rule.sourceDimensionCode,
        rule.sourceValueCode,
        rule.targetDimensionCode,
        rule.targetValueCode,
        rule.updatedBy,
        rule.updatedAt,
      ],
    );
    if (r.rows[0]?.inserted) counts.macroRulesInserted += 1;
    else counts.macroRulesUpdated += 1;
  }
}

async function upsertAssignments(
  client: Client,
  assignments: AssignmentIn[],
  counts: ImportCounts,
): Promise<void> {
  const chunkSize = 1_000;
  for (let offset = 0; offset < assignments.length; offset += chunkSize) {
    const chunk = assignments.slice(offset, offset + chunkSize);
    const valuesSql: string[] = [];
    const params: Array<string | null> = [];

    chunk.forEach((a, index) => {
      const base = index * 5;
      valuesSql.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::timestamptz)`);
      params.push(a.skuCode, a.dimensionCode, a.valueCode, a.assignedBy, a.assignedAt);
    });

    const r = await client.query<{
      input_count: number;
      resolved_count: number;
      inserted_count: number;
      updated_count: number;
    }>(
      `WITH input (sku_code, dimension_code, value_code, assigned_by, assigned_at) AS (
         VALUES ${valuesSql.join(',\n                ')}
       ),
       resolved AS (
         SELECT DISTINCT ON (i.sku_code, dim.id, val.id)
                i.sku_code,
                dim.id AS dimension_id,
                val.id AS value_id,
                i.assigned_by,
                i.assigned_at
           FROM input i
           JOIN app.sku sku ON sku.code = i.sku_code
           JOIN app.attribute_dimension dim ON dim.code = i.dimension_code
           JOIN app.attribute_value val ON val.dimension_id = dim.id AND val.code = i.value_code
          ORDER BY i.sku_code, dim.id, val.id
       ),
       upserted AS (
         INSERT INTO app.sku_attribute_assignment (sku_code, dimension_id, value_id, assigned_by, assigned_at)
         SELECT sku_code, dimension_id, value_id, assigned_by, assigned_at
           FROM resolved
         ON CONFLICT (sku_code, dimension_id, value_id) DO UPDATE SET
           assigned_by = EXCLUDED.assigned_by,
           assigned_at = EXCLUDED.assigned_at
         RETURNING (xmax = 0) AS inserted
       )
       SELECT
         (SELECT COUNT(*)::int FROM input) AS input_count,
         (SELECT COUNT(*)::int FROM resolved) AS resolved_count,
         COUNT(*) FILTER (WHERE inserted)::int AS inserted_count,
         COUNT(*) FILTER (WHERE NOT inserted)::int AS updated_count
       FROM upserted`,
      params,
    );

    const row = r.rows[0];
    counts.assignmentsInserted += row?.inserted_count ?? 0;
    counts.assignmentsUpdated += row?.updated_count ?? 0;
    counts.assignmentsSkippedMissingValue += Math.max(
      0,
      (row?.input_count ?? chunk.length) - (row?.resolved_count ?? 0),
    );
  }
}

function redactPassword(url: string): string {
  return url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

async function main(): Promise<void> {
  const args = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');

  console.log('=============================================');
  console.log('  import:attributes');
  console.log('=============================================');
  console.log(`  in          : ${args.inPath}`);
  console.log(`  target DB   : ${redactPassword(databaseUrl)}`);
  console.log(`  dry-run     : ${args.dryRun ? 'YES (no writes)' : 'no'}`);
  console.log(`  assignments : ${args.skipAssignments ? 'SKIPPED' : 'included'}`);

  const ex = loadExport(args.inPath);
  console.log('');
  console.log('  loaded snapshot:');
  console.log(`    exported at        : ${ex.exportedAt}`);
  console.log(`    source database    : ${ex.exportedFromDatabase}`);
  console.log(`    dimensions         : ${ex.dimensions.length}`);
  console.log(`    values             : ${ex.dimensions.reduce((s, d) => s + d.values.length, 0)}`);
  console.log(`    family rules       : ${ex.familyRules.length}`);
  console.log(`    macro rules        : ${ex.macroRules?.length ?? 0}`);
  console.log(`    assignments        : ${ex.assignments.length}`);

  if (args.dryRun) {
    console.log('\n  DRY RUN — exiting without writes.');
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const counts: ImportCounts = {
    dimsInserted: 0,
    dimsUpdated: 0,
    valuesInserted: 0,
    valuesUpdated: 0,
    rulesInserted: 0,
    rulesUpdated: 0,
    rulesSkippedMissingFamily: 0,
    macroRulesInserted: 0,
    macroRulesUpdated: 0,
    macroRulesSkippedMissingValue: 0,
    assignmentsInserted: 0,
    assignmentsUpdated: 0,
    assignmentsSkippedMissingValue: 0,
  };

  try {
    await client.query('BEGIN');

    console.log('\n[1/5] Upserting dimensions...');
    await upsertDimensions(client, ex.dimensions, counts);

    console.log('[2/5] Upserting values...');
    await upsertValues(client, ex.dimensions, counts);

    console.log('[3/5] Upserting family rules...');
    await upsertFamilyRules(client, ex.familyRules, counts);

    console.log(`[4/5] Upserting ${ex.macroRules?.length ?? 0} macro rules...`);
    await upsertMacroRules(client, ex.macroRules ?? [], counts);

    if (args.skipAssignments) {
      console.log('[5/5] Skipping assignments (--skip-assignments).');
    } else {
      console.log(`[5/5] Upserting ${ex.assignments.length} assignments...`);
      await upsertAssignments(client, ex.assignments, counts);
    }

    await client.query('COMMIT');

    console.log('');
    console.log('=============================================');
    console.log('  import complete');
    console.log('=============================================');
    console.log(`  dimensions    : ${counts.dimsInserted} inserted, ${counts.dimsUpdated} updated`);
    console.log(`  values        : ${counts.valuesInserted} inserted, ${counts.valuesUpdated} updated`);
    console.log(`  family rules  : ${counts.rulesInserted} inserted, ${counts.rulesUpdated} updated, ${counts.rulesSkippedMissingFamily} skipped (missing family)`);
    console.log(`  macro rules   : ${counts.macroRulesInserted} inserted, ${counts.macroRulesUpdated} updated, ${counts.macroRulesSkippedMissingValue} skipped (missing value)`);
    if (!args.skipAssignments) {
      console.log(`  assignments   : ${counts.assignmentsInserted} inserted, ${counts.assignmentsUpdated} updated, ${counts.assignmentsSkippedMissingValue} skipped (missing SKU/dimension/value)`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[import:attributes] failed:', err?.message ?? err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
