import { prisma } from '../../src/db/prisma';
import { importRicsTickets } from '../customers/import-customer-transactions-from-rics';

async function main(): Promise<void> {
  await importRicsTickets();
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('[tickets] RITRNSSV import failed', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
