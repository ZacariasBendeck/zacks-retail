import fs from 'node:fs';
import path from 'node:path';
import {
  extractRicsArtifact,
  formatArtifactScopeSummary,
} from '../../src/services/sync/ricsArtifact';

const API_DIR = path.resolve(__dirname, '../..');
const DEFAULT_OUT_DIR = path.resolve(API_DIR, '.tmp', 'render-conversion-bundle');

interface Args {
  outDir: string;
  mdbDir: string | null;
  scope: string | null;
  includeTables: string[];
  withSeedAssignments: boolean;
}

interface BundleManifest {
  version: 1;
  createdAt: string;
  bundleDir: string;
  scope: string;
  legacyManifestPath: string;
  attributeSnapshotPath: string | null;
  appDataSnapshotPath: string | null;
  optionalFiles: Record<string, string>;
  warnings: string[];
  knownFullResetBlockers: string[];
  durationsMs: {
    extractLegacyArtifact: number;
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
      '  - customer data from the RIMAIL MDB tables in the canonical artifact',
      '',
      'Run cutover:render-export-app-data after this step to add:',
      '  - app/attribute-catalog-export.json',
      '  - app/app-data-export.json',
      '',
      'Options:',
      `  --out <dir>                 Bundle output directory (default ${DEFAULT_OUT_DIR})`,
      '  --mdb-dir <dir>             RICS MDB source folder (sets RICS_DB_DIR for this export)',
      '  --scope <name>              Artifact scope (default all-canonical)',
      '  --include <a,b,c>           Extra canonical target tables to include',
      '  --with-seed-assignments     Include seed:* attribute assignments in snapshot',
      '  --help                      Show this help',
    ].join('\n'),
  );
  process.exit(code);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resetBundleOutput(bundleDir: string): void {
  const absoluteBundleDir = path.resolve(bundleDir);
  for (const childName of ['legacy', 'app']) {
    const childPath = path.resolve(absoluteBundleDir, childName);
    if (path.dirname(childPath) !== absoluteBundleDir) {
      throw new Error(`Refusing to clear unexpected output path: ${childPath}`);
    }
    fs.rmSync(childPath, { recursive: true, force: true });
  }
  fs.rmSync(path.join(absoluteBundleDir, 'bundle-manifest.json'), { force: true });
}

function rel(basePath: string, targetPath: string): string {
  return path.relative(basePath, targetPath).replace(/\\/g, '/');
}

function knownFullResetBlockers(): string[] {
  return [
    'Run cutover:render-export-app-data after CSV extraction to add app-owned Postgres data to the bundle.',
    'verify:cutover-readiness still expects rics_mirror and is not Render-safe yet.',
  ];
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.mdbDir) {
    process.env.RICS_DB_DIR = args.mdbDir;
  }

  const started = Date.now();
  const bundleDir = path.resolve(args.outDir);
  const legacyDir = path.join(bundleDir, 'legacy');
  const appDir = path.join(bundleDir, 'app');
  resetBundleOutput(bundleDir);
  ensureDir(bundleDir);
  ensureDir(legacyDir);
  ensureDir(appDir);

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

  const warnings: string[] = [];
  const optionalFiles: Record<string, string> = {};

  const manifest: BundleManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    bundleDir,
    scope: (args.scope ?? '').trim() || 'custom',
    legacyManifestPath: rel(bundleDir, extractResult.manifestPath),
    attributeSnapshotPath: null,
    appDataSnapshotPath: null,
    optionalFiles,
    warnings,
    knownFullResetBlockers: knownFullResetBlockers(),
    durationsMs: {
      extractLegacyArtifact: extractMs,
      total: Date.now() - started,
    },
  };

  const bundleManifestPath = path.join(bundleDir, 'bundle-manifest.json');
  fs.writeFileSync(bundleManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log('----------------------------------------');
  console.log(`legacy  : ${extractResult.manifest.tables.length} table CSVs`);
  console.log(`manifest: ${extractResult.manifestPath}`);
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
