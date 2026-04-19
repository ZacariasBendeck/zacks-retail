import { PrismaClient } from '@prisma/client';
import { bootstrapOwner } from './services/employees/bootstrapOwner';
import app from './app';

const PORT = process.env.PORT ?? 4000;

const bootstrapPrisma = new PrismaClient();
bootstrapOwner(bootstrapPrisma)
  .catch((err) => console.warn('[index] bootstrapOwner error:', err))
  .finally(() => bootstrapPrisma.$disconnect());

app.listen(PORT, () => {
  console.log(`RICS API server running on http://localhost:${PORT}`);
  console.log(`Swagger docs: http://localhost:${PORT}/api-docs`);
});
