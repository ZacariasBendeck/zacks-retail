import { prisma } from '../../src/db/prisma';
import { evaluateCustomerSegments } from '../../src/services/segmentation/segmentEvaluationService';

async function main(): Promise<void> {
  const customerId = process.argv[2];
  if (!customerId) {
    throw new Error('Usage: tsx scripts/customers/evaluate-customer-segments.ts <customer-id>');
  }
  const result = await evaluateCustomerSegments({ customerId });
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
