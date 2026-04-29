import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const API_DIR = path.resolve(__dirname, '../..');
const DEFAULT_OUT_DIR = path.resolve(API_DIR, '.tmp', 'render-conversion-bundle');

interface Args {
  outDir: string;
  mdbDir: string | null;
  scope: string | null;
  includeTables: string[];
  withSeedAssignments: boolean;
  customerCsvPath: string | null;
  mailListNamesCsvPath: string | null;
}

interface BundleManifest {
  version: 1;
  createdAt: string;
  bundleDir: string;
  scope: string;
  legacyManifestPath: string;
  attributeSnapshotPath: string;
  optionalFiles: Record<string, string>;
  warnings: string[];
  knownFullResetBlockers: string[];
  durationsMs: {
    extractLegacyArtifact: number;
    exportAttributeSnapshot: number;
    total: number;
  };
}

function parseArgs(): Args {
  const args: Args = {
    outDir: DEFAULT_OUT_DIR,
    mdbDir: null,
    scope: 'all-canonical',
    includeTables: [],
    withSeedAssignments: false,
    customerCsvPath: null,
    mailListNamesCsvPath: null,
  };

  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--':
        break;
      case '--out':
        args.outDir = path.resolve(String(argv[++i] ?? ''));
        break;
      case '--mdb-dir':
        args.mdbDir = path.resolve(String(argv[++i] ?? ''));
        break;
      case '--scope':
        args.scope = String(argv[++i] ?? '').trim() || null;
        break;
      case '--include':
        args.includeTables = String(argv[++i] ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        break;
      case '--with-seed-assignments':
        args.withSeedAssignments = true;
        break;
      case '--customer':
        args.customerCsvPath = path.resolve(String(argv[++i] ?? ''));
        break;
      case '--mail':
        args.mailListNamesCsvPath = path.resolve(String(argv[++i] ?? ''));
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
      'Usage: cutover:render-export [options]',
      '',
      'Creates a Render cutover bundle with:',
      '  - legacy/manifest.json + canonical RICS CSV artifact pack',
      '  - app/attribute-catalog-export.json',
      '  - optional customer CRM CSVs copied into the bundle when supplied',
      '',
      'Options:',
      `  --out <dir>                 Bundle output directory (default ${DEFAULT_OUT_DIR})`,
      '  --mdb-dir <dir>             RICS MDB source folder (sets RICS_DB_DIR for this export)',
      '  --scope <name>              Artifact scope (default all-canonical)',
      '  --include <a,b,c>           Extra canonical target tables to include',
      '  --with-seed-assignments     Include seed:* attribute assignments in snapshot',
      '  --customer <path>           Optional Customer.csv path',
      '  --mail <path>               Optional MailListNames.csv path',
      '  --help                      Show this help',
    ].join('\n'),
  );
  process.exit(code);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function rel(basePath: string, targetPath: string): string {
  return path.relative(basePath, targetPath).replace(/\\/g, '/');
}

function knownFullResetBlockers(): string[] {
  return [
    'No export/import bundle exists yet for ProductContent, SeasonOverlay edits, vendor overlays, SKU override tables, size-type overrides, custom segment definitions, or non-owner users.',
    'verify:cutover-readiness still expects rics_mirror and is not Render-safe yet.',
  ];
}

async function runNodeTsScript(label: string, scriptPath: string, args: string[]): Promise<void> {
  const started = Date.now();
  console.log(`[cutover:render-export] ${label}`);
  const child = spawn(
    process.execPath,
    ['--env-file-if-exists=.env', '-r', 'tsx/cjs', scriptPath, ...args],
    {
      cwd: API_DIR,
      stdio: 'inherit',
      env: process.env,
    },
  );

  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (value) => resolve(value ?? 1));
  });

  if (code !== 0) {
    throw new Error(`${label} failed with exit ${code}`);
  }

  console.log(`[cutover:render-export] ${label} done in ${Date.now() - started}ms`);
}

function copyIfPresent(
  label: string,
  sourcePath: string | null,
  destPath: string,
  warnings: string[],
  outFiles: Record<string, string>,
  bundleDir: string,
): void {
  if (!sourcePath) {
    warnings.push(`${label} not supplied`);
    return;
  }
  if (!fs.existsSync(sourcePath)) {
    warnings.push(`${label} missing: ${sourcePath}`);
    return;
  }

  ensureDir(path.dirname(destPath));
  fs.copyFileSync(sourcePath, destPath);
  outFiles[label] = rel(bundleDir, destPath);
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.mdbDir) {
    process.env.RICS_DB_DIR = args.mdbDir;
  }
  const {
    extractRicsArtifact,
    formatArtifactScopeSummary,
  } = await import('../../src/services/sync/ricsArtifact');

  const started = Date.now();
  const bundleDir = path.resolve(args.outDir);
  const legacyDir = path.join(bundleDir, 'legacy');
  const appDir = path.join(bundleDir, 'app');
  const crmDir = path.join(bundleDir, 'crm');
  ensureDir(bundleDir);
  ensureDir(legacyDir);
  ensureDir(appDir);
  ensureDir(crmDir);

  console.log('========================================');
  console.log('  cutover:render-export');
  console.log('========================================');
  console.log(`mdb dir : ${process.env.RICS_DB_DIR ?? '<default>'}`);
  console.log(`bundle  : ${bundleDir}`);
  console.log(`scope   : ${formatArtifactScopeSummary(args.scope)}`);
  if (args.includeTables.length > 0) {
    console.log(`include : ${args.includeTables.join(', ')}`);
  }
  console.log('----------------------------------------');

  const extractStarted = Date.now();
  const extractResult = await extractRicsArtifact({
    outDir: legacyDir,
    scope: args.scope,
    includeTables: args.includeTables,
  });
  const extractMs = Date.now() - extractStarted;

  const attributeSnapshotPath = path.join(appDir, 'attribute-catalog-export.json');
  const exportArgs = ['--out', attributeSnapshotPath];
  if (args.withSeedAssignments) {
    exportArgs.push('--with-seed-assignments');
  }
  const attributeStarted = Date.now();
  await runNodeTsScript(
    'export:attributes',
    path.join(API_DIR, 'scripts', 'catalog', 'export-attribute-catalog.ts'),
    exportArgs,
  );
  const attributeMs = Date.now() - attributeStarted;

  const warnings: string[] = [];
  const optionalFiles: Record<string, string> = {};
  copyIfPresent('Customer.csv', args.customerCsvPath, path.join(crmDir, 'Customer.csv'), warnings, optionalFiles, bundleDir);
  copyIfPresent(
    'MailListNames.csv',
    args.mailListNamesCsvPath,
    path.join(crmDir, 'MailListNames.csv'),
    warnings,
    optionalFiles,
    bundleDir,
  );

  const manifest: BundleManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    bundleDir,
    scope: (args.scope ?? '').trim() || 'custom',
    legacyManifestPath: rel(bundleDir, extractResult.manifestPath),
    attributeSnapshotPath: rel(bundleDir, attributeSnapshotPath),
    optionalFiles,
    warnings,
    knownFullResetBlockers: knownFullResetBlockers(),
    durationsMs: {
      extractLegacyArtifact: extractMs,
      exportAttributeSnapshot: attributeMs,
      total: Date.now() - started,
    },
  };

  const bundleManifestPath = path.join(bundleDir, 'bundle-manifest.json');
  fs.writeFileSync(bundleManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log('----------------------------------------');
  console.log(`legacy  : ${extractResult.manifest.tables.length} table CSVs`);
  console.log(`manifest: ${extractResult.manifestPath}`);
  console.log(`app     : ${attributeSnapshotPath}`);
  if (Object.keys(optionalFiles).length > 0) {
    console.log(`crm     : ${Object.values(optionalFiles).join(', ')}`);
  }
  if (warnings.length > 0) {
    console.log('warnings:');
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }
  console.log(`bundle  : ${bundleManifestPath}`);
  console.log(`total   : ${manifest.durationsMs.total}ms`);
  console.log('========================================');
}

main().catch((error) => {
  console.error(`[cutover:render-export] ${(error as Error).message}`);
  if ((error as Error).stack) {
    console.error((error as Error).stack);
  }
  process.exit(1);
});
