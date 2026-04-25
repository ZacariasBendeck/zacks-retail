import { prisma } from '../../src/db/prisma';
import { seedDefaultSegments } from '../../src/services/segmentation/segmentVersionService';

async function main(): Promise<void> {
  await seedDefaultSegments();
  console.log('[segmentation] default metrics and segments seeded');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
