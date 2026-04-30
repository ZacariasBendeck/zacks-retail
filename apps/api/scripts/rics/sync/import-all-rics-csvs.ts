import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from 'pg';
import { loadManifest, type ArtifactManifest } from './artifactManifest';

const API_DIR = path.resolve(__dirname, '../../..');
const DEFAULT_BUNDLE_DIR = path.resolve(API_DIR, '.tmp', 'render-conversion-bundle');
const PNPM_CMD = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

interface Args {
  bundleDir: string | null;
  manifestPath: string | null;
  dryRun: boolean;
  skipMigrate: boolean;
  skipAttributes: boolean;
  skipSegmentationDefaults: boolean;
}

interface PlannedStep {
  label: string;
  command: string;
  args: string[];
  consumes: string[];
  optional?: boolean;
}

function parseArgs(): Args {
  const args: Args = {
    bundleDir: DEFAULT_BUNDLE_DIR,
    manifestPath: null,
    dryRun: false,
    skipMigrate: false,
    skipAttributes: false,
    skipSegmentationDefaults: false,
  };

  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--':
        break;
      case '--bundle':
        args.bundleDir = path.resolve(String(argv[++index] ?? ''));
        break;
      case '--manifest':
        args.manifestPath = path.resolve(String(argv[++index] ?? ''));
        args.bundleDir = null;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--skip-migrate':
        args.skipMigrate = true;
        break;
      case '--skip-attributes':
        args.skipAttributes = true;
        break;
      case '--skip-segmentation-defaults':
        args.skipSegmentationDefaults = true;
        break;
      case '--help':
      case '-h':
        printHelpAndExit(0);
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }

  return args;
}

function printHelpAndExit(code: number): never {
  console.log(
    [
      'Usage: import-all-rics-csvs [options]',
      '',
      'Imports all currently mapped canonical RICS CSV artifact tables into app-owned tables.',
      '',
      'Options:',
      `  --bundle <dir>       Bundle directory containing legacy/manifest.json (default ${DEFAULT_BUNDLE_DIR})`,
      '  --manifest <path>    Direct path to legacy/manifest.json',
      '  --dry-run           Print planned steps and coverage without importing',
      '  --skip-migrate      Do not run prisma migrate deploy',
      '  --skip-attributes   Do not import app/attribute-catalog-export.json even if present',
      '  --skip-segmentation-defaults',
      '  --help              Show this help',
    ].join('\n'),
  );
  process.exit(code);
}

function requireFile(filePath: string, label: string): string {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`${label} missing: ${absolute}`);
  }
  return absolute;
}

function fileExists(filePath: string | null): filePath is string {
  return Boolean(filePath && fs.existsSync(filePath));
}

function nodeScript(scriptPath: string, args: string[]): PlannedStep {
  return {
    label: path.relative(API_DIR, scriptPath).replace(/\\/g, '/'),
    command: process.execPath,
    args: ['--env-file-if-exists=.env', '-r', 'tsx/cjs', scriptPath, ...args],
    consumes: [],
  };
}

function scriptStep(label: string, scriptRelativePath: string, args: string[], consumes: string[]): PlannedStep {
  const step = nodeScript(path.join(API_DIR, scriptRelativePath), args);
  return { ...step, label, consumes };
}

function manifestHas(manifest: ArtifactManifest, targetTable: string): boolean {
  return manifest.tables.some((table) => table.targetTable === targetTable);
}

function manifestHasAll(manifest: ArtifactManifest, targetTables: readonly string[]): boolean {
  return targetTables.every((targetTable) => manifestHas(manifest, targetTable));
}

function addIfTablesPresent(
  steps: PlannedStep[],
  manifest: ArtifactManifest,
  label: string,
  scriptRelativePath: string,
  args: string[],
  consumes: string[],
  warnings: string[],
): void {
  if (manifestHasAll(manifest, consumes)) {
    steps.push(scriptStep(label, scriptRelativePath, args, consumes));
    return;
  }
  const missing = consumes.filter((table) => !manifestHas(manifest, table));
  warnings.push(`${label} skipped; missing manifest table(s): ${missing.join(', ')}`);
}

async function queryAppSkuCount(databaseUrl: string): Promise<number> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM app.sku');
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await client.end();
  }
}

async function runStep(step: PlannedStep): Promise<void> {
  const started = Date.now();
  console.log(`[import:all-rics-csvs] ${step.label}`);
  const child = spawn(step.command, step.args, {
    cwd: API_DIR,
    stdio: 'inherit',
    env: process.env,
  });
  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (value) => resolve(value ?? 1));
  });
  if (code !== 0) {
    throw new Error(`${step.label} failed with exit ${code}`);
  }
  console.log(`[import:all-rics-csvs] ${step.label} done in ${Date.now() - started}ms`);
}

function buildPlan(args: Args, manifestPath: string, manifest: ArtifactManifest, attributeSnapshotPath: string | null): {
  steps: PlannedStep[];
  warnings: string[];
  consumedTables: Set<string>;
} {
  const steps: PlannedStep[] = [];
  const warnings: string[] = [];
  const manifestArg = ['--manifest', manifestPath];

  if (!args.skipMigrate) {
    steps.push({
      label: 'prisma migrate deploy',
      command: PNPM_CMD,
      args: ['exec', 'prisma', 'migrate', 'deploy'],
      consumes: [],
    });
  }

  if (!args.skipAttributes && fileExists(attributeSnapshotPath)) {
    steps.push(scriptStep(
      'import:attributes',
      path.join('scripts', 'catalog', 'import-attribute-catalog.ts'),
      ['--in', attributeSnapshotPath],
      [],
    ));
  } else if (!args.skipAttributes) {
    warnings.push('attribute catalog snapshot not found; app attribute catalog import skipped.');
  }

  addIfTablesPresent(
    steps,
    manifest,
    'seed:taxonomy-from-mirror',
    path.join('scripts', 'seeds', 'seed-taxonomy-from-mirror.ts'),
    manifestArg,
    ['departments', 'categories', 'group_codes', 'keywords', 'sectors', 'return_codes', 'marketing_code', 'size_types'],
    warnings,
  );
  steps.push(scriptStep('seed:product-families', path.join('scripts', 'seeds', 'seed-product-families.ts'), [], []));
  addIfTablesPresent(
    steps,
    manifest,
    'import:app-skus-from-artifact',
    path.join('scripts', 'rics', 'sync', 'import-app-skus-from-artifact.ts'),
    manifestArg,
    ['inventory_master'],
    warnings,
  );
  addIfTablesPresent(
    steps,
    manifest,
    'seed:sku-attributes',
    path.join('scripts', 'seeds', 'seed-sku-attributes.ts'),
    manifestArg,
    ['inventory_master'],
    warnings,
  );
  addIfTablesPresent(
    steps,
    manifest,
    'import:app-reference-baselines-from-artifact',
    path.join('scripts', 'rics', 'sync', 'import-app-reference-baselines-from-artifact.ts'),
    manifestArg,
    [
      'vendor_master',
      'vendor_accounts',
      'store_master',
      'upc_cross_reference',
      'case_packs',
      'case_pack_qtys',
      'future_price_changes',
      'purchase_master',
      'purchase_detail',
      'asn_carton_head',
      'asn_carton_det',
      'inv_transfers',
    ],
    warnings,
  );
  addIfTablesPresent(
    steps,
    manifest,
    'import:native-purchase-orders-from-artifact',
    path.join('scripts', 'rics', 'sync', 'import-native-purchase-orders-from-artifact.ts'),
    manifestArg,
    ['purchase_master', 'purchase_detail'],
    warnings,
  );
  addIfTablesPresent(
    steps,
    manifest,
    'import:app-replenishment-targets-from-artifact',
    path.join('scripts', 'rics', 'sync', 'import-app-replenishment-targets-from-artifact.ts'),
    manifestArg,
    ['inventory_quantities', 'size_types'],
    warnings,
  );
  if (!args.skipSegmentationDefaults) {
    steps.push(scriptStep('seed:segmentation-defaults', path.join('scripts', 'seeds', 'seed-segmentation-defaults.ts'), [], []));
  }
  addIfTablesPresent(
    steps,
    manifest,
    'import:app-stock-from-artifact',
    path.join('scripts', 'rics', 'sync', 'import-app-stock-from-artifact.ts'),
    manifestArg,
    ['inv_changes', 'inventory_quantities', 'size_types'],
    warnings,
  );
  addIfTablesPresent(
    steps,
    manifest,
    'import:app-inventory-history-from-artifact',
    path.join('scripts', 'rics', 'sync', 'import-app-inventory-history-from-artifact.ts'),
    manifestArg,
    ['inv_his'],
    warnings,
  );
  addIfTablesPresent(
    steps,
    manifest,
    'import:employees-from-rics',
    path.join('scripts', 'employees', 'import-rics-salespeople.ts'),
    manifestArg,
    ['salespeople'],
    warnings,
  );
  addIfTablesPresent(
    steps,
    manifest,
    'import:customers:bulk',
    path.join('scripts', 'customers', 'import-customers-bulk.ts'),
    [...manifestArg, '--source', 'rics_manifest_bulk', '--replace'],
    ['mail_list_family', 'mail_list_names'],
    warnings,
  );
  addIfTablesPresent(
    steps,
    manifest,
    'import:tickets:rics',
    path.join('scripts', 'sales', 'import-rics-tickets.ts'),
    [...manifestArg, '--source', 'rics_ticket_manifest'],
    ['ticket_header', 'ticket_detail'],
    warnings,
  );

  const consumedTables = new Set<string>();
  for (const step of steps) {
    for (const table of step.consumes) consumedTables.add(table);
  }
  if (
    manifestHasAll(manifest, ['ticket_header', 'ticket_detail']) &&
    manifestHas(manifest, 'ticket_tender')
  ) {
    consumedTables.add('ticket_tender');
  }

  return { steps, warnings, consumedTables };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl && !args.dryRun) {
    throw new Error('DATABASE_URL env var is required');
  }

  const bundleDir = args.bundleDir ? path.resolve(args.bundleDir) : null;
  const manifestPath = args.manifestPath
    ? requireFile(args.manifestPath, 'legacy manifest')
    : requireFile(path.join(bundleDir ?? DEFAULT_BUNDLE_DIR, 'legacy', 'manifest.json'), 'legacy manifest');
  const attributeSnapshotPath = bundleDir
    ? path.join(bundleDir, 'app', 'attribute-catalog-export.json')
    : null;
  const { manifest, absoluteManifestPath } = loadManifest(manifestPath);
  const started = Date.now();
  const { steps, warnings, consumedTables } = buildPlan(args, absoluteManifestPath, manifest, attributeSnapshotPath);
  const unmapped = manifest.tables
    .map((table) => table.targetTable)
    .filter((targetTable) => !consumedTables.has(targetTable))
    .sort();

  console.log('========================================');
  console.log('  import:all-rics-csvs');
  console.log('========================================');
  if (bundleDir) console.log(`bundle  : ${bundleDir}`);
  console.log(`manifest: ${absoluteManifestPath}`);
  console.log(`tables  : ${manifest.tables.length}`);
  console.log('----------------------------------------');
  console.log('planned steps:');
  steps.forEach((step, index) => console.log(`  ${index + 1}. ${step.label}`));

  if (warnings.length > 0) {
    console.log('warnings:');
    warnings.forEach((warning) => console.log(`  - ${warning}`));
  }
  if (unmapped.length > 0) {
    console.log('manifest tables without app importer coverage:');
    unmapped.forEach((table) => console.log(`  - ${table}`));
  }

  if (args.dryRun) {
    console.log('----------------------------------------');
    console.log('dry run only; no imports executed.');
    console.log('========================================');
    return;
  }

  for (const step of steps) {
    await runStep(step);
  }

  const appSkuCount = await queryAppSkuCount(databaseUrl!);
  console.log('----------------------------------------');
  console.log(`app.sku : ${appSkuCount.toLocaleString('en-US')}`);
  console.log(`total   : ${Date.now() - started}ms`);
  console.log('========================================');
}

main().catch((error) => {
  console.error(`[import:all-rics-csvs] ${(error as Error).message}`);
  if ((error as Error).stack) {
    console.error((error as Error).stack);
  }
  process.exit(1);
});
