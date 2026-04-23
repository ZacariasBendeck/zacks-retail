/**
 * Ad-hoc diagnostic — print the current contents of the app attribute tables.
 *
 *   pnpm --filter @benlow-rics/api tsx scripts/catalog/inspect-attribute-tables.ts
 *
 * Reports:
 *   - per-dimension row counts
 *   - full value catalog, grouped by dimension
 *   - per-dimension assignment counts (how many SKUs carry each dimension)
 *   - family-rule scoping rows, if any
 *
 * Read-only. Safe to run anytime.
 */
import { Client } from 'pg';

interface DimRow {
  id: number;
  code: string;
  label_es: string;
  description_es: string | null;
  sort_order: number;
  is_multi_value: boolean;
  value_count: number;
  assignment_count: number;
  rule_count: number;
}

interface ValueRow {
  dimension_code: string;
  code: string;
  label_es: string;
  sort_order: number;
  is_active: boolean;
  assignment_count: number;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const dims = await client.query<DimRow>(`
      SELECT d.id, d.code, d.label_es, d.description_es, d.sort_order, d.is_multi_value,
             (SELECT COUNT(*)::int FROM app.attribute_value v WHERE v.dimension_id = d.id) AS value_count,
             (SELECT COUNT(DISTINCT a.sku_code)::int FROM app.sku_attribute_assignment a WHERE a.dimension_id = d.id) AS assignment_count,
             (SELECT COUNT(*)::int FROM app.attribute_family_rule r WHERE r.dimension_id = d.id) AS rule_count
      FROM app.attribute_dimension d
      ORDER BY d.sort_order, d.id
    `);

    console.log('\n=============================================');
    console.log('  app.attribute_dimension');
    console.log('=============================================');
    console.log(`  Total dimensions: ${dims.rowCount}`);
    console.log('');
    console.log('  sort | code                 | values | SKUs | rules | multi | label_es');
    console.log('  -----|----------------------|--------|------|-------|-------|------------------------');
    for (const d of dims.rows) {
      console.log(
        `  ${String(d.sort_order).padStart(4)} | ${d.code.padEnd(20)} | ${String(d.value_count).padStart(6)} | ${String(d.assignment_count).padStart(4)} | ${String(d.rule_count).padStart(5)} | ${d.is_multi_value ? '  yes' : '   no'} | ${d.label_es}`,
      );
    }

    const values = await client.query<ValueRow>(`
      SELECT d.code AS dimension_code,
             v.code,
             v.label_es,
             v.sort_order,
             v.is_active,
             (SELECT COUNT(*)::int FROM app.sku_attribute_assignment a WHERE a.value_id = v.id) AS assignment_count
      FROM app.attribute_value v
      JOIN app.attribute_dimension d ON d.id = v.dimension_id
      ORDER BY d.sort_order, d.id, v.sort_order, v.id
    `);

    console.log('\n=============================================');
    console.log('  app.attribute_value (grouped by dimension)');
    console.log('=============================================');
    console.log(`  Total values: ${values.rowCount}`);

    let currentDim = '';
    for (const v of values.rows) {
      if (v.dimension_code !== currentDim) {
        currentDim = v.dimension_code;
        console.log(`\n  ── ${currentDim} ──`);
        console.log('    sort | code                 | SKUs | active | label_es');
        console.log('    -----|----------------------|------|--------|-------------------------');
      }
      console.log(
        `    ${String(v.sort_order).padStart(4)} | ${v.code.padEnd(20)} | ${String(v.assignment_count).padStart(4)} | ${v.is_active ? '   yes' : '    no'} | ${v.label_es}`,
      );
    }

    const rules = await client.query(`
      SELECT d.code AS dim, f.code AS family, r.enabled, r.is_required, r.sort_order
      FROM app.attribute_family_rule r
      JOIN app.attribute_dimension d ON d.id = r.dimension_id
      JOIN app.product_family f ON f.code = r.family_code
      ORDER BY d.sort_order, f.sort_order
    `);
    console.log('\n=============================================');
    console.log('  app.attribute_family_rule');
    console.log('=============================================');
    console.log(`  Total rules: ${rules.rowCount}`);
    if (rules.rowCount && rules.rowCount > 0) {
      console.log('\n    dimension            | family             | enabled | required | sort');
      console.log('    ---------------------|--------------------|---------|----------|-----');
      for (const r of rules.rows) {
        console.log(
          `    ${String(r.dim).padEnd(20)} | ${String(r.family).padEnd(18)} | ${r.enabled ? '     yes' : '      no'} | ${r.is_required ? '      yes' : '       no'} | ${String(r.sort_order).padStart(4)}`,
        );
      }
    } else {
      console.log('  (none — dimensions are universal across all families)');
    }

    const assignmentsMeta = await client.query<{ assigned_by: string; n: number }>(`
      SELECT COALESCE(assigned_by, '(null)') AS assigned_by, COUNT(*)::int AS n
      FROM app.sku_attribute_assignment
      GROUP BY assigned_by
      ORDER BY n DESC
    `);
    console.log('\n=============================================');
    console.log('  app.sku_attribute_assignment (provenance)');
    console.log('=============================================');
    console.log(`  Total assignments: ${assignmentsMeta.rows.reduce((s, r) => s + r.n, 0)}`);
    if (assignmentsMeta.rowCount && assignmentsMeta.rowCount > 0) {
      console.log('');
      for (const r of assignmentsMeta.rows) {
        console.log(`    ${String(r.n).padStart(8).toLocaleString()} by ${r.assigned_by}`);
      }
    } else {
      console.log('  (no assignments yet)');
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[inspect-attribute-tables] failed:', err?.message ?? err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
