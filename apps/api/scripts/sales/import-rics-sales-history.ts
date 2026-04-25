import { prisma } from '../../src/db/prisma';
import { importRicsSalesHistory } from '../customers/import-customer-transactions-from-rics';

async function main(): Promise<void> {
  await importRicsSalesHistory();
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('[sales-history] RITRNSSV import failed', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
