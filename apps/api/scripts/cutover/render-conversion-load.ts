import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from 'pg';

const API_DIR = path.resolve(__dirname, '../..');
const DEFAULT_BUNDLE_DIR = path.resolve(API_DIR, '.tmp', 'render-conversion-bundle');
const PNPM_CMD = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

interface Args {
  bundleDir: string;
  strictFull: boolean;
  skipInventoryHistory: boolean;
  skipCustomers: boolean;
  skipTickets: boolean;
  skipSegmentationDefaults: boolean;
  inventoryHistoryAsOf: string | null;
}

function parseArgs(): Args {
  const args: Args = {
    bundleDir: DEFAULT_BUNDLE_DIR,
    strictFull: false,
    skipInventoryHistory: false,
    skipCustomers: false,
    skipTickets: false,
    skipSegmentationDefaults: false,
    inventoryHistoryAsOf: null,
  };

  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--':
        break;
      case '--bundle':
        args.bundleDir = path.resolve(String(argv[++i] ?? ''));
        break;
      case '--strict-full':
        args.strictFull = true;
        break;
      case '--skip-inventory-history':
        args.skipInventoryHistory = true;
        break;
      case '--skip-customers':
        args.skipCustomers = true;
        break;
      case '--skip-tickets':
      case '--skip-sales-history':
      case '--skip-customer-transactions':
        args.skipTickets = true;
        break;
      case '--skip-segmentation-defaults':
        args.skipSegmentationDefaults = true;
        break;
      case '--inventory-history-as-of':
        args.inventoryHistoryAsOf = String(argv[++i] ?? '').trim() || null;
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
      'Usage: cutover:render-load [options]',
      '',
      'Loads the supported Render-safe pieces of a cutover bundle:',
      '  - prisma migrate deploy',
      '  - import:attributes',
      '  - seed:taxonomy-from-mirror -- --manifest <legacy-manifest>',
      '  - seed:product-families',
      '  - import:app-skus-from-artifact',
      '  - seed:sku-attributes -- --manifest <legacy-manifest>',
      '  - import:app-reference-baselines-from-artifact',
      '  - import:native-purchase-orders-from-artifact',
      '  - import:app-replenishment-targets-from-artifact',
      '  - import:app-stock-from-artifact',
      '  - import:app-inventory-history-from-artifact',
      '  - import:employees-from-rics',
      '  - import:customers (when Customer.csv + MailListNames.csv are bundled)',
      '  - import:tickets:rics (when RITRNSSV ticket CSVs are bundled)',
      '  - seed:segmentation-defaults',
      '',
      'Options:',
      `  --bundle <dir>                Bundle directory (default ${DEFAULT_BUNDLE_DIR})`,
      '  --strict-full                 Exit non-zero if known full-reset blockers remain',
      '  --skip-inventory-history      Skip app.inventory_history_* import',
      '  --skip-customers              Skip customer master import',
      '  --skip-tickets                Skip RITRNSSV ticket import',
      '  --skip-segmentation-defaults  Skip default segment seed',
      '  --inventory-history-as-of <d> Pass --as-of to inventory-history import',
      '  --help                        Show this help',
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

function fileExists(filePath: string): boolean {
  return fs.existsSync(path.resolve(filePath));
}

function knownFullResetBlockers(): string[] {
  return [
    'No bundle export/import exists yet for ProductContent, SeasonOverlay edits, vendor overlays, SKU override tables, size-type overrides, or custom segment definitions.',
    'verify:cutover-readiness is still mirror-era and should not be used as the Render cutover gate yet.',
  ];
}

async function runCommand(
  label: string,
  command: string,
  args: string[],
  options?: { cwd?: string },
): Promise<void> {
  const started = Date.now();
  console.log(`[cutover:render-load] ${label}`);
  const child = spawn(command, args, {
    cwd: options?.cwd ?? API_DIR,
    stdio: 'inherit',
    env: process.env,
  });
  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (value) => resolve(value ?? 1));
  });
  if (code !== 0) {
    throw new Error(`${label} failed with exit ${code}`);
  }
  console.log(`[cutover:render-load] ${label} done in ${Date.now() - started}ms`);
}

async function runNodeTsScript(label: string, scriptPath: string, args: string[]): Promise<void> {
  await runCommand(
    label,
    process.execPath,
    ['--env-file-if-exists=.env', '-r', 'tsx/cjs', scriptPath, ...args],
  );
}

async function queryAppSkuCount(databaseUrl: string): Promise<number> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ row_count: string }>(
      'SELECT COUNT(*)::text AS row_count FROM app.sku',
    );
    return Number(result.rows[0]?.row_count ?? 0);
  } finally {
    await client.end();
  }
}

async function manifestContainsTable(manifestPath: string, targetTable: string): Promise<boolean> {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw) as { tables?: Array<{ targetTable?: string }> };
  return Array.isArray(manifest.tables)
    ? manifest.tables.some((table) => table.targetTable === targetTable)
    : false;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL env var is required');
  }

  const started = Date.now();
  const bundleDir = path.resolve(args.bundleDir);
  const legacyManifestPath = requireFile(path.join(bundleDir, 'legacy', 'manifest.json'), 'legacy manifest');
  const attributeSnapshotPath = requireFile(
    path.join(bundleDir, 'app', 'attribute-catalog-export.json'),
    'attribute snapshot',
  );
  const customerCsvPath = path.join(bundleDir, 'crm', 'Customer.csv');
  const mailListNamesCsvPath = path.join(bundleDir, 'crm', 'MailListNames.csv');
  const legacyTicketHeaderCsvPath = path.join(bundleDir, 'legacy', 'ticket_header.csv');
  const legacyTicketDetailCsvPath = path.join(bundleDir, 'legacy', 'ticket_detail.csv');
  const legacyTicketTenderCsvPath = path.join(bundleDir, 'legacy', 'ticket_tender.csv');

  console.log('========================================');
  console.log('  cutover:render-load');
  console.log('========================================');
  console.log(`bundle  : ${bundleDir}`);
  console.log(`legacy  : ${legacyManifestPath}`);
  console.log(`app     : ${attributeSnapshotPath}`);
  console.log('----------------------------------------');

  await runCommand('prisma migrate deploy', PNPM_CMD, ['exec', 'prisma', 'migrate', 'deploy']);
  await runNodeTsScript(
    'import:attributes',
    path.join(API_DIR, 'scripts', 'catalog', 'import-attribute-catalog.ts'),
    ['--in', attributeSnapshotPath],
  );

  await runNodeTsScript(
    'seed:taxonomy-from-mirror',
    path.join(API_DIR, 'scripts', 'seeds', 'seed-taxonomy-from-mirror.ts'),
    ['--manifest', legacyManifestPath],
  );

  await runNodeTsScript(
    'seed:product-families',
    path.join(API_DIR, 'scripts', 'seeds', 'seed-product-families.ts'),
    [],
  );

  await runNodeTsScript(
    'import:app-skus-from-artifact',
    path.join(API_DIR, 'scripts', 'rics', 'sync', 'import-app-skus-from-artifact.ts'),
    ['--manifest', legacyManifestPath],
  );

  await runNodeTsScript(
    'seed:sku-attributes',
    path.join(API_DIR, 'scripts', 'seeds', 'seed-sku-attributes.ts'),
    ['--manifest', legacyManifestPath],
  );

  await runNodeTsScript(
    'import:app-reference-baselines-from-artifact',
    path.join(API_DIR, 'scripts', 'rics', 'sync', 'import-app-reference-baselines-from-artifact.ts'),
    ['--manifest', legacyManifestPath],
  );

  await runNodeTsScript(
    'import:native-purchase-orders-from-artifact',
    path.join(API_DIR, 'scripts', 'rics', 'sync', 'import-native-purchase-orders-from-artifact.ts'),
    ['--manifest', legacyManifestPath],
  );

  await runNodeTsScript(
    'import:app-replenishment-targets-from-artifact',
    path.join(API_DIR, 'scripts', 'rics', 'sync', 'import-app-replenishment-targets-from-artifact.ts'),
    ['--manifest', legacyManifestPath],
  );

  if (!args.skipSegmentationDefaults) {
    await runNodeTsScript(
      'seed:segmentation-defaults',
      path.join(API_DIR, 'scripts', 'seeds', 'seed-segmentation-defaults.ts'),
      [],
    );
  }

  const appSkuCount = await queryAppSkuCount(databaseUrl);
  const warnings: string[] = [];
  if (appSkuCount > 0) {
    await runNodeTsScript(
      'import:app-stock-from-artifact',
      path.join(API_DIR, 'scripts', 'rics', 'sync', 'import-app-stock-from-artifact.ts'),
      ['--manifest', legacyManifestPath],
    );

    if (!args.skipInventoryHistory && (await manifestContainsTable(legacyManifestPath, 'inv_his'))) {
      const historyArgs = ['--manifest', legacyManifestPath];
      if (args.inventoryHistoryAsOf) {
        historyArgs.push('--as-of', args.inventoryHistoryAsOf);
      }
      await runNodeTsScript(
        'import:app-inventory-history-from-artifact',
        path.join(API_DIR, 'scripts', 'rics', 'sync', 'import-app-inventory-history-from-artifact.ts'),
        historyArgs,
      );
    }
  } else {
    warnings.push(
      'app.sku is empty after the SKU artifact import, so stock and inventory-history imports were skipped.',
    );
  }

  if (await manifestContainsTable(legacyManifestPath, 'salespeople')) {
    await runNodeTsScript(
      'import:employees-from-rics',
      path.join(API_DIR, 'scripts', 'employees', 'import-rics-salespeople.ts'),
      ['--manifest', legacyManifestPath],
    );
  } else {
    warnings.push('legacy manifest does not contain salespeople; employee salesperson import skipped.');
  }

  if (!args.skipCustomers) {
    if (fileExists(customerCsvPath) && fileExists(mailListNamesCsvPath)) {
      await runNodeTsScript(
        'import:customers',
        path.join(API_DIR, 'scripts', 'customers', 'import-customers.ts'),
        ['--customer', customerCsvPath, '--mail', mailListNamesCsvPath, '--source', 'render_cutover_bundle'],
      );
    } else {
      warnings.push('Customer.csv and/or MailListNames.csv not present in bundle; customer master import skipped.');
    }
  }

  if (!args.skipTickets) {
    const hasLegacyTicketCsvs = fileExists(legacyTicketHeaderCsvPath) && fileExists(legacyTicketDetailCsvPath);

    if (hasLegacyTicketCsvs) {
      const ticketArgs = [
        '--header',
        legacyTicketHeaderCsvPath,
        '--detail',
        legacyTicketDetailCsvPath,
        '--no-csv-header',
        '--source',
        'render_cutover_bundle',
      ];
      if (fileExists(legacyTicketTenderCsvPath)) {
        ticketArgs.push('--tender', legacyTicketTenderCsvPath, '--tender-no-csv-header');
      } else {
        warnings.push('legacy/ticket_tender.csv not present in bundle; ticket tender import skipped.');
      }
      await runNodeTsScript(
        'import:tickets:rics',
        path.join(API_DIR, 'scripts', 'sales', 'import-rics-tickets.ts'),
        ticketArgs,
      );
    } else {
      warnings.push(
        'legacy/ticket_header.csv and/or legacy/ticket_detail.csv not present; sales ticket import skipped.',
      );
    }
  }

  const blockers = knownFullResetBlockers();

  console.log('----------------------------------------');
  console.log(`app.sku : ${appSkuCount}`);
  if (warnings.length > 0) {
    console.log('warnings:');
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }
  console.log('known full-reset blockers:');
  for (const blocker of blockers) {
    console.log(`  - ${blocker}`);
  }
  console.log(`total   : ${Date.now() - started}ms`);
  console.log('========================================');

  if (args.strictFull) {
    throw new Error('strict-full requested, but known full-reset blockers still remain');
  }
}

main().catch((error) => {
  console.error(`[cutover:render-load] ${(error as Error).message}`);
  if ((error as Error).stack) {
    console.error((error as Error).stack);
  }
  process.exit(1);
});
