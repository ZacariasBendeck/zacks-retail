import { prisma } from '../../src/db/prisma';
import { evaluateSegmentById } from '../../src/services/segmentation/segmentEvaluationService';

async function main(): Promise<void> {
  const segmentId = process.argv[2];
  if (!segmentId) {
    throw new Error('Usage: tsx scripts/customers/evaluate-segment.ts <segment-id>');
  }
  const result = await evaluateSegmentById(segmentId);
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
