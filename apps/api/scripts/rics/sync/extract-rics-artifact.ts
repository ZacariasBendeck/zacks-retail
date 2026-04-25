import path from 'node:path';
import {
  extractRicsArtifact,
  formatArtifactScopeSummary,
} from '../../../src/services/sync/ricsArtifact';

interface Args {
  outDir: string;
  scope: string | null;
  includeTables: string[];
}

function parseArgs(): Args {
  const args: Args = {
    outDir: path.resolve(process.cwd(), '.tmp', 'rics-artifact'),
    scope: null,
    includeTables: [],
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
      case '--scope':
        args.scope = String(argv[++i] ?? '').trim() || null;
        break;
      case '--include':
        args.includeTables = String(argv[++i] ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
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
      'Usage: extract-rics-artifact [options]',
      '',
      'Options:',
      '  --out <dir>           Output directory for CSVs + manifest.json',
      '  --scope <name>        Artifact scope (for example: products-inventory-bootstrap, all-canonical)',
      '  --include <a,b,c>     Extra canonical target tables to include by snake_case target table name',
      '  --help                Show this help',
    ].join('\n'),
  );
  process.exit(code);
}

async function main(): Promise<void> {
  const args = parseArgs();
  console.log('========================================');
  console.log('  extract:rics-artifact');
  console.log('========================================');
  console.log(`out dir : ${args.outDir}`);
  console.log(`scope   : ${formatArtifactScopeSummary(args.scope)}`);
  if (args.includeTables.length > 0) {
    console.log(`include : ${args.includeTables.join(', ')}`);
  }
  console.log('----------------------------------------');

  const result = await extractRicsArtifact({
    outDir: args.outDir,
    scope: args.scope,
    includeTables: args.includeTables,
  });

  for (const table of result.manifest.tables) {
    console.log(
      `${table.targetTable.padEnd(24)} ${String(table.rowCount).padStart(10)} rows  ${table.csvFile}`,
    );
  }

  console.log('----------------------------------------');
  console.log(`manifest : ${result.manifestPath}`);
  console.log(`tables   : ${result.manifest.tables.length}`);
  console.log('========================================');
}

main().catch((error) => {
  console.error(`[extract:rics-artifact] ${(error as Error).message}`);
  if ((error as Error).stack) {
    console.error((error as Error).stack);
  }
  process.exit(1);
});
