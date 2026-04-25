import { computeFullMetrics, recomputeAllCustomerMetrics } from '../../src/services/customer-kpi/computeFullMetrics';
import { prisma } from '../../src/db/prisma';

type CliArgs = {
  customerId?: string;
  batchSize?: number;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--customer-id') {
      args.customerId = argv[index + 1];
      index += 1;
    } else if (value === '--batch-size') {
      args.batchSize = Number(argv[index + 1]);
      index += 1;
    }
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.customerId) {
    const result = await computeFullMetrics(args.customerId);
    console.info('[customer-kpi] Recomputed single customer metrics', result);
    return;
  }

  const result = await recomputeAllCustomerMetrics({ batchSize: args.batchSize });
  console.info('[customer-kpi] Recomputed all customer metrics', result);
}

main()
  .catch((error) => {
    console.error('[customer-kpi] Recompute job failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
