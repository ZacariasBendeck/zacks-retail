import { PrismaClient } from '@prisma/client';
import { bootstrapOwner } from './services/employees/bootstrapOwner';
import app from './app';
import { warmup as warmRicsAdapter } from './services/ricsProductAdapter';
import { warmup as warmRicsInventoryAdapter } from './services/ricsInventoryFacade';
import { warmup as warmRicsSalesReportAdapter } from './services/salesReporting/salesReportFacade';
import { warmupProductsAdmin } from './services/products/warmup';
import { StartupReport } from './services/startupReport';

const PORT = process.env.PORT ?? 4000;

// Prisma bootstrap runs in parallel with `app.listen` so it doesn't delay the
// socket binding. Its timing is folded into the consolidated startup report
// below — `report.track('prisma:bootstrap-owner', ...)` awaits the same
// promise after `listen` fires.
const bootstrapPrisma = new PrismaClient();
const bootstrapOwnerPromise = bootstrapOwner(bootstrapPrisma).finally(() =>
  bootstrapPrisma.$disconnect(),
);

app.listen(PORT, async () => {
  console.log(`RICS API server running on http://localhost:${PORT}`);
  console.log(`Swagger docs: http://localhost:${PORT}/api-docs`);

  const report = new StartupReport();

  // Every warmup phase runs in parallel; `report.track` captures its timing
  // without ever rejecting, so one failure doesn't poison the others.
  const tasks: Promise<unknown>[] = [];

  tasks.push(report.track('prisma:bootstrap-owner', () => bootstrapOwnerPromise));

  if ((process.env.PRODUCT_SOURCE || 'local').toLowerCase() === 'rics') {
    tasks.push(report.track('rics:product-adapter', () => warmRicsAdapter()));
  } else {
    report.skip('rics:product-adapter', 'PRODUCT_SOURCE=local');
  }

  tasks.push(
    report.track('rics:inventory-adapter', () => warmRicsInventoryAdapter()),
  );

  if ((process.env.SALES_SOURCE || 'rics').toLowerCase() === 'rics') {
    tasks.push(
      report.track('rics:sales-report-adapter', () => warmRicsSalesReportAdapter()),
    );
  } else {
    report.skip('rics:sales-report-adapter', 'SALES_SOURCE!=rics');
  }

  // Products-admin warmup returns its 11 sub-task timings so they can be
  // inlined into the consolidated table.
  tasks.push(
    report.track('products:warmup', async () => {
      const subs = await warmupProductsAdmin();
      report.addSubPhases('products', subs);
    }),
  );

  await Promise.allSettled(tasks);
  report.print();
});
