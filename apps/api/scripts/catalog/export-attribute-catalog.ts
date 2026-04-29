/**
 * Export the current `app.*` attribute framework to a single JSON snapshot
 * you can carry forward across database rebuilds or into the big-bang cutover.
 *
 *   pnpm --filter @benlow-rics/api export:attributes
 *   pnpm --filter @benlow-rics/api export:attributes -- --out path/to/file.json
 *   pnpm --filter @benlow-rics/api export:attributes -- --with-seed-assignments
 *
 * What's captured:
 *   - Every row of `app.attribute_dimension`
 *   - Every row of `app.attribute_value` (nested under its parent dimension)
 *   - Every row of `app.attribute_family_rule` (family-scoping + required flags)
 *   - Every row of `app.attribute_derivation_rule` (macro-category rollups)
 *   - Operator-authored rows of `app.sku_attribute_assignment` — i.e. any row
 *     whose `assigned_by` does NOT start with `seed:`. Those are the ones
 *     representing human work; `seed:keyword:*` and `seed:excel:*` rows are
 *     reproducible by re-running the seeds, so they are excluded by default.
 *     Pass `--with-seed-assignments` to include them too.
 *
 * The output JSON is self-describing and versioned. A companion import script
 * can upsert this shape back into a fresh Postgres in one pass.
 *
 * Read-only — makes no writes. Safe to run anytime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

interface Args {
  outPath: string;
  withSeedAssignments: boolean;
}

function parseArgs(): Args {
  const today = new Date().toISOString().slice(0, 10);
  const defaultOut = path.resolve(process.cwd(), `attribute-catalog-export-${today}.json`);
  const out: Args = { outPath: defaultOut, withSeedAssignments: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--out':
      case '-o':
        out.outPath = path.resolve(String(argv[++i] ?? ''));
        break;
      case '--with-seed-assignments':
        out.withSeedAssignments = true;
        break;
      case '--help':
      case '-h':
        console.log('See file header for flags.');
        process.exit(0);
    }
  }
  return out;
}

interface DimensionOut {
  code: string;
  labelEs: string;
  descriptionEs: string | null;
  sortOrder: number;
  isMultiValue: boolean;
  values: ValueOut[];
}

interface ValueOut {
  code: string;
  labelEs: string;
  descriptionEs: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface FamilyRuleOut {
  dimensionCode: string;
  familyCode: string;
  enabled: boolean;
  isRequired: boolean;
  sortOrder: number;
  updatedBy: string;
  updatedAt: string;
}

interface AssignmentOut {
  skuCode: string;
  dimensionCode: string;
  valueCode: string;
  assignedBy: string | null;
  assignedAt: string;
}

interface MacroRuleOut {
  sourceDimensionCode: string;
  sourceValueCode: string;
  targetDimensionCode: string;
  targetValueCode: string;
  updatedBy: string;
  updatedAt: string;
}

interface ExportFile {
  version: '1';
  exportedAt: string;
  exportedFromDatabase: string;
  counts: {
    dimensions: number;
    values: number;
    familyRules: number;
    macroRules: number;
    assignments: number;
    assignmentsMode: 'operator-only' | 'all';
  };
  dimensions: DimensionOut[];
  familyRules: FamilyRuleOut[];
  macroRules: MacroRuleOut[];
  assignments: AssignmentOut[];
}

function redactPassword(url: string): string {
  return url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

async function main(): Promise<void> {
  const args = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log(`[export:attributes] connected → ${redactPassword(databaseUrl)}`);
    console.log(`[export:attributes] assignments mode: ${args.withSeedAssignments ? 'all (incl. seed-derived)' : 'operator-only'}`);

    // ──────────── Dimensions + values ────────────
    const dimRows = await client.query<{
      id: number;
      code: string;
      label_es: string;
      description_es: string | null;
      sort_order: number;
      is_multi_value: boolean;
    }>(`
      SELECT id, code, label_es, description_es, sort_order, is_multi_value
      FROM app.attribute_dimension
      ORDER BY sort_order, id
    `);

    const valueRows = await client.query<{
      dimension_id: number;
      code: string;
      label_es: string;
      description_es: string | null;
      sort_order: number;
      is_active: boolean;
    }>(`
      SELECT dimension_id, code, label_es, description_es, sort_order, is_active
      FROM app.attribute_value
      ORDER BY dimension_id, sort_order, id
    `);

    const valuesByDim = new Map<number, ValueOut[]>();
    for (const v of valueRows.rows) {
      const list = valuesByDim.get(v.dimension_id) ?? [];
      list.push({
        code: v.code,
        labelEs: v.label_es,
        descriptionEs: v.description_es,
        sortOrder: v.sort_order,
        isActive: v.is_active,
      });
      valuesByDim.set(v.dimension_id, list);
    }

    const dimensions: DimensionOut[] = dimRows.rows.map((d) => ({
      code: d.code,
      labelEs: d.label_es,
      descriptionEs: d.description_es,
      sortOrder: d.sort_order,
      isMultiValue: d.is_multi_value,
      values: valuesByDim.get(d.id) ?? [],
    }));

    // ──────────── Family rules ────────────
    const ruleRows = await client.query<{
      dimension_code: string;
      family_code: string;
      enabled: boolean;
      is_required: boolean;
      sort_order: number;
      updated_by: string;
      updated_at: string;
    }>(`
      SELECT d.code AS dimension_code,
             r.family_code,
             r.enabled,
             r.is_required,
             r.sort_order,
             r.updated_by,
             r.updated_at::text AS updated_at
      FROM app.attribute_family_rule r
      JOIN app.attribute_dimension d ON d.id = r.dimension_id
      ORDER BY d.sort_order, r.family_code
    `);

    const familyRules: FamilyRuleOut[] = ruleRows.rows.map((r) => ({
      dimensionCode: r.dimension_code,
      familyCode: r.family_code,
      enabled: r.enabled,
      isRequired: r.is_required,
      sortOrder: r.sort_order,
      updatedBy: r.updated_by,
      updatedAt: r.updated_at,
    }));

    // ──────────── Macro derivation rules ────────────
    const macroRuleRows = await client.query<{
      source_dimension_code: string;
      source_value_code: string;
      target_dimension_code: string;
      target_value_code: string;
      updated_by: string;
      updated_at: string;
    }>(`
      SELECT source_dimension_code,
             source_value_code,
             target_dimension_code,
             target_value_code,
             updated_by,
             updated_at::text AS updated_at
      FROM app.attribute_derivation_rule
      ORDER BY source_dimension_code, target_dimension_code, source_value_code
    `);

    const macroRules: MacroRuleOut[] = macroRuleRows.rows.map((r) => ({
      sourceDimensionCode: r.source_dimension_code,
      sourceValueCode: r.source_value_code,
      targetDimensionCode: r.target_dimension_code,
      targetValueCode: r.target_value_code,
      updatedBy: r.updated_by,
      updatedAt: r.updated_at,
    }));

    // ──────────── Operator assignments ────────────

    const assignmentFilter = args.withSeedAssignments
      ? '1=1'
      : "(a.assigned_by IS NULL OR a.assigned_by NOT LIKE 'seed:%')";

    const assignmentRows = await client.query<{
      sku_code: string;
      dimension_code: string;
      value_code: string;
      assigned_by: string | null;
      assigned_at: string;
    }>(`
      SELECT a.sku_code,
             d.code AS dimension_code,
             v.code AS value_code,
             a.assigned_by,
             a.assigned_at::text AS assigned_at
      FROM app.sku_attribute_assignment a
      JOIN app.attribute_dimension d ON d.id = a.dimension_id
      JOIN app.attribute_value v ON v.id = a.value_id
      WHERE ${assignmentFilter}
      ORDER BY a.sku_code, d.sort_order, v.sort_order
    `);

    const assignments: AssignmentOut[] = assignmentRows.rows.map((r) => ({
      skuCode: r.sku_code,
      dimensionCode: r.dimension_code,
      valueCode: r.value_code,
      assignedBy: r.assigned_by,
      assignedAt: r.assigned_at,
    }));

    // ──────────── Assemble + write ────────────
    const total = dimensions.reduce((s, d) => s + d.values.length, 0);
    const out: ExportFile = {
      version: '1',
      exportedAt: new Date().toISOString(),
      exportedFromDatabase: redactPassword(databaseUrl),
      counts: {
        dimensions: dimensions.length,
        values: total,
        familyRules: familyRules.length,
        macroRules: macroRules.length,
        assignments: assignments.length,
        assignmentsMode: args.withSeedAssignments ? 'all' : 'operator-only',
      },
      dimensions,
      familyRules,
      macroRules,
      assignments,
    };

    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');

    console.log('');
    console.log('=============================================');
    console.log('  attribute catalog export complete');
    console.log('=============================================');
    console.log(`  dimensions    : ${out.counts.dimensions}`);
    console.log(`  values        : ${out.counts.values}`);
    console.log(`  family rules  : ${out.counts.familyRules}`);
    console.log(`  macro rules   : ${out.counts.macroRules}`);
    console.log(`  assignments   : ${out.counts.assignments}  (${out.counts.assignmentsMode})`);
    console.log('');
    console.log(`  written to:`);
    console.log(`    ${args.outPath}`);
    console.log('');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[export:attributes] failed:', err?.message ?? err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
