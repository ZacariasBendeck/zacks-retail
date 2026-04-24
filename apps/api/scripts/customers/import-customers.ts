import path from 'node:path';
import { importCustomerCsvFiles } from '../../src/services/customers/customerImportService';

interface Args {
  customerCsvPath: string;
  mailListNamesCsvPath: string;
  source: string;
}

function parseArgs(): Args {
  const args: Args = {
    customerCsvPath: '',
    mailListNamesCsvPath: '',
    source: 'rics_csv',
  };

  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--customer':
      case '-c':
        args.customerCsvPath = path.resolve(String(argv[++i] ?? ''));
        break;
      case '--mail':
      case '-m':
        args.mailListNamesCsvPath = path.resolve(String(argv[++i] ?? ''));
        break;
      case '--source':
        args.source = String(argv[++i] ?? 'rics_csv') || 'rics_csv';
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
    }
  }

  if (!args.customerCsvPath || !args.mailListNamesCsvPath) {
    printUsage();
    process.exit(2);
  }

  return args;
}

function printUsage(): void {
  console.log(
    'Usage: pnpm --filter @benlow-rics/api import:customers -- --customer <Customer.csv> --mail <MailListNames.csv> [--source rics_csv]',
  );
}

async function main(): Promise<void> {
  const args = parseArgs();
  const summary = await importCustomerCsvFiles(args);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
