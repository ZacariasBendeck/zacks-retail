/**
 * Seed pipeline for the SKU extended-attribute foundation.
 *
 *   pnpm --filter @benlow-rics/api seed:sku-attributes
 *
 * Idempotent — safe to re-run after sync:rics. Four phases:
 *
 *   1. Catalog upsert from dimensions.csv + values.csv (no assignment writes).
 *      Re-runs refresh labels / sort order without touching assignments. A row
 *      present in the DB but absent from the CSV is logged and the script
 *      exits non-zero; deletion is a deliberate manual SQL step.
 *
 *   2. (Excel import — deferred to the 15-dim phase.)
 *
 *   3. Keyword derivation: DELETE every assignment tagged `seed:keyword:*`,
 *      then re-INSERT from keyword_rules.csv against rics_mirror.inventory_master.
 *      Operator edits and `seed:excel:*` rows are preserved.
 *
 *   4. Coverage report per dimension.
 *
 * Spec: docs/dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { loadManifest, requireTable, stageTable } from '../rics/sync/artifactManifest';

const SEEDS_DIR = path.resolve(__dirname, '../../seeds/sku_extended_attributes');

interface DimensionRow {
  code: string;
  label_es: string;
  description_es: string | null;
  sort_order: number;
  is_multi_value: boolean;
}

interface ValueRow {
  dimension_code: string;
  code: string;
  label_es: string;
  sort_order: number;
}

interface KeywordRule {
  rics_keyword_token: string;
  dimension_code: string;
  value_code: string;
}

interface Args {
  manifestPath: string | null;
  sourceTable: string | null;
  allowCatalogOrphans: boolean;
}

const DEFAULT_SOURCE_TABLE = 'rics_mirror.inventory_master';

function parseArgs(): Args {
  const args: Args = {
    manifestPath: null,
    sourceTable: null,
    allowCatalogOrphans: false,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--':
        break;
      case '--manifest':
        args.manifestPath = String(argv[++i] ?? '').trim() || null;
        break;
      case '--source-table':
        args.sourceTable = String(argv[++i] ?? '').trim() || null;
        break;
      case '--allow-catalog-orphans':
        args.allowCatalogOrphans = true;
        break;
      case '--help':
      case '-h':
        printHelpAndExit(0);
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  if (args.manifestPath && args.sourceTable) {
    throw new Error('Use either --manifest or --source-table, not both');
  }
  return args;
}

function printHelpAndExit(code: number): never {
  console.log(
    [
      'Usage: seed:sku-attributes [--manifest <path> | --source-table <schema.table>]',
      '',
      'Defaults to reading keyword derivation input from rics_mirror.inventory_master.',
      'Use --manifest to stage inventory_master.csv from a cutover artifact bundle instead.',
      'Use --allow-catalog-orphans when a richer app attribute snapshot already exists.',
    ].join('\n'),
  );
  process.exit(code);
}

function quoteQualifiedRef(ref: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(ref)) {
    throw new Error(`Invalid table reference: ${ref}`);
  }
  return ref
    .split('.')
    .map((part) => `"${part}"`)
    .join('.');
}

function parseCsv(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]);
  const out: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = cells[j] ?? '';
    }
    out.push(row);
  }
  return out;
}

/** Minimal CSV splitter — no support for escaped commas or embedded newlines.
 * CSVs in the seeds directory are hand-edited; keep them simple. */
function splitCsvLine(line: string): string[] {
  return line.split(',').map((c) => c.trim());
}

function toBool(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === '') return false;
  throw new Error(`invalid boolean value '${raw}'`);
}

function ruleHash(rule: KeywordRule): string {
  return createHash('sha1')
    .update(`${rule.rics_keyword_token}|${rule.dimension_code}|${rule.value_code}`)
    .digest('hex')
    .slice(0, 10);
}

function fmtNum(n: number | bigint): string {
  return n.toLocaleString('en-US');
}

async function phase1CatalogUpsert(
  client: Client,
  dimensions: DimensionRow[],
  values: ValueRow[]
): Promise<{ orphanDims: string[]; orphanValues: { dim: string; code: string }[] }> {
  console.log('\n[1/4] Catalog upsert...');

  for (const d of dimensions) {
    await client.query(
      `INSERT INTO app.attribute_dimension (code, label_es, description_es, sort_order, is_multi_value)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code) DO UPDATE SET
         label_es       = EXCLUDED.label_es,
         description_es = EXCLUDED.description_es,
         sort_order     = EXCLUDED.sort_order,
         is_multi_value = EXCLUDED.is_multi_value`,
      [d.code, d.label_es, d.description_es, d.sort_order, d.is_multi_value]
    );
  }

  for (const v of values) {
    await client.query(
      `INSERT INTO app.attribute_value (dimension_id, code, label_es, sort_order)
       SELECT d.id, $2, $3, $4 FROM app.attribute_dimension d WHERE d.code = $1
       ON CONFLICT (dimension_id, code) DO UPDATE SET
         label_es   = EXCLUDED.label_es,
         sort_order = EXCLUDED.sort_order`,
      [v.dimension_code, v.code, v.label_es, v.sort_order]
    );
  }

  const csvDimCodes = new Set(dimensions.map((d) => d.code));
  const { rows: dbDims } = await client.query<{ code: string }>(
    `SELECT code FROM app.attribute_dimension`
  );
  const orphanDims = dbDims.map((r) => r.code).filter((c) => !csvDimCodes.has(c));

  const csvValueKeys = new Set(values.map((v) => `${v.dimension_code}|${v.code}`));
  const { rows: dbValues } = await client.query<{ dim: string; code: string }>(
    `SELECT d.code AS dim, v.code AS code
     FROM app.attribute_value v JOIN app.attribute_dimension d ON d.id = v.dimension_id`
  );
  const orphanValues = dbValues
    .filter((r) => !csvValueKeys.has(`${r.dim}|${r.code}`))
    .map((r) => ({ dim: r.dim, code: r.code }));

  console.log(
    `  dimensions upserted: ${dimensions.length}   values upserted: ${values.length}`
  );
  if (orphanDims.length > 0) {
    console.warn(`  ORPHAN dimensions (in DB, not in CSV): ${orphanDims.join(', ')}`);
  }
  if (orphanValues.length > 0) {
    console.warn(
      `  ORPHAN values (in DB, not in CSV): ${orphanValues.map((v) => `${v.dim}/${v.code}`).join(', ')}`
    );
  }
  return { orphanDims, orphanValues };
}

async function phase3KeywordDerivation(
  client: Client,
  rules: KeywordRule[],
  sourceTable: string
): Promise<{ rulesApplied: number; assignmentsInserted: number; unmapped: { token: string; count: number }[] }> {
  console.log('\n[3/4] Keyword derivation...');
  const sourceRef = quoteQualifiedRef(sourceTable);

  // Look up dim + value ids for every rule; fail loudly if a rule references a missing catalog row.
  const { rows: lookup } = await client.query<{
    dim_code: string;
    val_code: string;
    dim_id: number;
    val_id: number;
  }>(
    `SELECT d.code AS dim_code, v.code AS val_code, d.id AS dim_id, v.id AS val_id
     FROM app.attribute_value v JOIN app.attribute_dimension d ON d.id = v.dimension_id`
  );
  const catalogKey = new Map<string, { dimId: number; valueId: number }>();
  for (const r of lookup) {
    catalogKey.set(`${r.dim_code}|${r.val_code}`, { dimId: r.dim_id, valueId: r.val_id });
  }
  for (const rule of rules) {
    if (!catalogKey.has(`${rule.dimension_code}|${rule.value_code}`)) {
      throw new Error(
        `keyword_rules.csv references missing catalog entry ${rule.dimension_code}/${rule.value_code} (token ${rule.rics_keyword_token})`
      );
    }
  }

  // Wipe prior keyword-derived rows (operator + excel rows untouched).
  const delRes = await client.query(
    `DELETE FROM app.sku_attribute_assignment
     WHERE assigned_by LIKE 'seed:keyword:%'`
  );
  console.log(`  wiped ${fmtNum(delRes.rowCount ?? 0)} prior keyword-derived assignments.`);

  // Tokenize inventory_master.key_words once into a session-scoped temp table.
  // No ON COMMIT DROP — the script auto-commits each statement, so we'd lose
  // the table between CREATE and INSERT. It's dropped when the connection closes.
  await client.query(`DROP TABLE IF EXISTS tmp_sku_keyword_tokens`);
  await client.query(`
    CREATE TEMP TABLE tmp_sku_keyword_tokens (
      sku   VARCHAR(15) NOT NULL,
      token TEXT        NOT NULL
    )
  `);
  await client.query(`
    INSERT INTO tmp_sku_keyword_tokens (sku, token)
    SELECT sku, upper(btrim(t))
    FROM ${sourceRef},
         LATERAL regexp_split_to_table(coalesce(key_words, ''), '\\s+') AS t
    WHERE t IS NOT NULL AND btrim(t) <> ''
  `);
  await client.query(`CREATE INDEX ON tmp_sku_keyword_tokens (token)`);

  // Apply rules — one pass per rule inserts matching assignments.
  let totalInserted = 0;
  for (const rule of rules) {
    const entry = catalogKey.get(`${rule.dimension_code}|${rule.value_code}`)!;
    const tag = `seed:keyword:${ruleHash(rule)}`;
    const upperToken = rule.rics_keyword_token.toUpperCase();
    const res = await client.query(
      `INSERT INTO app.sku_attribute_assignment (sku_code, dimension_id, value_id, assigned_by)
       SELECT DISTINCT tk.sku, $1::SMALLINT, $2::SMALLINT, $3
       FROM tmp_sku_keyword_tokens tk
       WHERE tk.token = $4
       ON CONFLICT (sku_code, dimension_id, value_id) DO NOTHING`,
      [entry.dimId, entry.valueId, tag, upperToken]
    );
    totalInserted += res.rowCount ?? 0;
  }

  // Unmapped-token frequency (top 10) for the operator.
  const mappedTokens = new Set(rules.map((r) => r.rics_keyword_token.toUpperCase()));
  const { rows: freq } = await client.query<{ token: string; count: string }>(
    `SELECT token, COUNT(*)::text AS count
     FROM tmp_sku_keyword_tokens
     GROUP BY token
     ORDER BY COUNT(*) DESC
     LIMIT 50`
  );
  const unmapped = freq
    .filter((r) => !mappedTokens.has(r.token))
    .slice(0, 10)
    .map((r) => ({ token: r.token, count: Number(r.count) }));

  console.log(
    `  rules applied: ${rules.length}   assignments inserted: ${fmtNum(totalInserted)}`
  );
  if (unmapped.length > 0) {
    console.log('  top unmapped tokens:');
    for (const u of unmapped) {
      console.log(`    ${u.token.padEnd(12)} ${fmtNum(u.count).padStart(10)}`);
    }
  }

  return { rulesApplied: rules.length, assignmentsInserted: totalInserted, unmapped };
}

interface CoverageRow {
  dimension_code: string;
  label_es: string;
  total_skus: number;
  classified_skus: number;
  coverage_pct: number;
  by_source: { keyword: number; excel: number; operator: number };
}

async function phase4CoverageReport(client: Client, sourceTable: string): Promise<CoverageRow[]> {
  console.log('\n[4/4] Coverage report...');
  const sourceRef = quoteQualifiedRef(sourceTable);

  const { rows: totalRow } = await client.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM ${sourceRef}`
  );
  const totalSkus = Number(totalRow[0].n);

  const { rows: dims } = await client.query<{ code: string; label_es: string; id: number }>(
    `SELECT id, code, label_es FROM app.attribute_dimension ORDER BY sort_order`
  );

  const out: CoverageRow[] = [];
  for (const d of dims) {
    const { rows: classified } = await client.query<{ n: string }>(
      `SELECT COUNT(DISTINCT sku_code)::text AS n
       FROM app.sku_attribute_assignment
       WHERE dimension_id = $1`,
      [d.id]
    );
    const classifiedSkus = Number(classified[0].n);

    const { rows: bySource } = await client.query<{ source: string; n: string }>(
      `SELECT
         CASE
           WHEN assigned_by LIKE 'seed:keyword:%' THEN 'keyword'
           WHEN assigned_by LIKE 'seed:excel:%'   THEN 'excel'
           ELSE 'operator'
         END AS source,
         COUNT(DISTINCT sku_code)::text AS n
       FROM app.sku_attribute_assignment
       WHERE dimension_id = $1
       GROUP BY source`,
      [d.id]
    );
    const by_source = { keyword: 0, excel: 0, operator: 0 };
    for (const row of bySource) {
      if (row.source === 'keyword') by_source.keyword = Number(row.n);
      else if (row.source === 'excel') by_source.excel = Number(row.n);
      else by_source.operator = Number(row.n);
    }

    out.push({
      dimension_code: d.code,
      label_es: d.label_es,
      total_skus: totalSkus,
      classified_skus: classifiedSkus,
      coverage_pct: totalSkus === 0 ? 0 : Math.round((classifiedSkus / totalSkus) * 1000) / 10,
      by_source,
    });
  }

  const dimWidth = Math.max(...out.map((r) => r.dimension_code.length), 14);
  console.log(
    `  ${'dimension'.padEnd(dimWidth)}  ${'total'.padStart(8)}  ${'classified'.padStart(11)}  ${'coverage'.padStart(9)}  by source (keyword / excel / operator)`
  );
  console.log(`  ${'-'.repeat(dimWidth)}  ${'-'.repeat(8)}  ${'-'.repeat(11)}  ${'-'.repeat(9)}  ${'-'.repeat(40)}`);
  for (const r of out) {
    console.log(
      `  ${r.dimension_code.padEnd(dimWidth)}  ${fmtNum(r.total_skus).padStart(8)}  ${fmtNum(
        r.classified_skus
      ).padStart(11)}  ${`${r.coverage_pct}%`.padStart(9)}  ${fmtNum(r.by_source.keyword).padStart(6)} / ${fmtNum(
        r.by_source.excel
      ).padStart(5)} / ${fmtNum(r.by_source.operator).padStart(5)}`
    );
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');

  console.log('============================================');
  console.log('  seed:sku-attributes');
  console.log('============================================');

  const dimensions = parseCsv(path.join(SEEDS_DIR, 'dimensions.csv')).map<DimensionRow>((r) => ({
    code: r.code,
    label_es: r.label_es,
    description_es: r.description_es.length > 0 ? r.description_es : null,
    sort_order: Number(r.sort_order),
    is_multi_value: toBool(r.is_multi_value),
  }));
  const values = parseCsv(path.join(SEEDS_DIR, 'values.csv')).map<ValueRow>((r) => ({
    dimension_code: r.dimension_code,
    code: r.code,
    label_es: r.label_es,
    sort_order: Number(r.sort_order),
  }));
  const rules = parseCsv(path.join(SEEDS_DIR, 'keyword_rules.csv')).map<KeywordRule>((r) => ({
    rics_keyword_token: r.rics_keyword_token,
    dimension_code: r.dimension_code,
    value_code: r.value_code,
  }));

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const start = Date.now();
  let orphansDetected = false;
  try {
    let sourceTable = args.sourceTable ?? DEFAULT_SOURCE_TABLE;
    if (args.manifestPath) {
      const { manifest, manifestDir } = loadManifest(args.manifestPath);
      const inventoryMasterTable = requireTable(manifest, 'inventory_master');
      sourceTable = await stageTable(client, manifestDir, inventoryMasterTable);
      console.log(`source table: ${sourceTable} (staged from manifest)`);
    } else {
      console.log(`source table: ${sourceTable}`);
    }

    const { orphanDims, orphanValues } = await phase1CatalogUpsert(client, dimensions, values);
    orphansDetected = orphanDims.length > 0 || orphanValues.length > 0;

    console.log('\n[2/4] Excel import — DEFERRED (15-dim phase, not Phase 1).');

    await phase3KeywordDerivation(client, rules, sourceTable);
    await phase4CoverageReport(client, sourceTable);
  } finally {
    await client.end();
  }

  const ms = Date.now() - start;
  const s = (ms / 1000).toFixed(1);
  console.log('\n============================================');
  if (orphansDetected && !args.allowCatalogOrphans) {
    console.log(`  FINISHED WITH WARNINGS — catalog orphans detected (${s}s)`);
    console.log('  remove orphans deliberately via SQL before the next seed run.');
    console.log('============================================');
    process.exit(1);
  }
  if (orphansDetected) {
    console.log(`  OK WITH WARNINGS - catalog orphans preserved (${s}s)`);
    console.log('  richer app-owned attribute catalog was already present; no deletions were performed.');
    console.log('============================================');
    return;
  }
  console.log(`  OK — seeded in ${s}s`);
  console.log('============================================');
}

main().catch((err) => {
  console.error(`[seed:sku-attributes] unhandled error: ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(2);
});
