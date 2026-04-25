import { prisma } from '../../src/db/prisma';
import { evaluateActiveSegments } from '../../src/services/segmentation/segmentEvaluationService';

async function main(): Promise<void> {
  const result = await evaluateActiveSegments();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
