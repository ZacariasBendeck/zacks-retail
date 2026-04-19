import { PrismaClient } from '@prisma/client';
import { bootstrapOwner } from './services/employees/bootstrapOwner';
import app from './app';
import { warmup as warmRicsAdapter } from './services/ricsProductAdapter';
import { warmup as warmRicsInventoryAdapter } from './services/ricsInventoryFacade';
import { warmup as warmRicsSalesReportAdapter } from './services/salesReporting/salesReportFacade';

const PORT = process.env.PORT ?? 4000;

const bootstrapPrisma = new PrismaClient();
bootstrapOwner(bootstrapPrisma)
  .catch((err) => console.warn('[index] bootstrapOwner error:', err))
  .finally(() => bootstrapPrisma.$disconnect());

app.listen(PORT, () => {
  console.log(`RICS API server running on http://localhost:${PORT}`);
  console.log(`Swagger docs: http://localhost:${PORT}/api-docs`);

  // Warm the RICS snapshot + dimension caches in the background so the first
  // storefront request doesn't pay the cold PowerShell+OLEDB spawn tax.
  if ((process.env.PRODUCT_SOURCE || 'local').toLowerCase() === 'rics') {
    warmRicsAdapter().catch((err) => console.warn('RICS product warmup error:', err));
  }
  // Inventory adapter defaults to rics; warm its dimension tables (stores,
  // size types, vendors) so the first Inventory Inquiry is fast.
  warmRicsInventoryAdapter().catch((err) =>
    console.warn('RICS inventory warmup error:', err),
  );
  // Sales-reporting adapter defaults to rics; warm its dimension tables
  // (stores, salespeople) so the first sales report is fast.
  if ((process.env.SALES_SOURCE || 'rics').toLowerCase() === 'rics') {
    warmRicsSalesReportAdapter().catch((err) =>
      console.warn('RICS sales-report warmup error:', err),
    );
  }
});
