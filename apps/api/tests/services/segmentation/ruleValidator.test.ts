import { prisma } from '../../../src/db/prisma';
import { seedDefaultMetrics } from '../../../src/services/segmentation/metricRegistryService';
import { validateRule } from '../../../src/services/segmentation/ruleValidatorService';

describe('ruleValidatorService', () => {
  beforeAll(async () => {
    await seedDefaultMetrics();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accepts a valid simple metric rule', async () => {
    const result = await validateRule({
      all: [
        { metric: 'net_revenue_365d', op: '>=', value: 500 },
        { metric: 'order_count_lifetime', op: '>=', value: 2 },
      ],
    });

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.metricDependencies).toEqual(['net_revenue_365d', 'order_count_lifetime']);
  });

  it('rejects an unknown metric', async () => {
    const result = await validateRule({
      all: [{ metric: 'no_such_metric', op: '>=', value: 1 }],
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'UNKNOWN_METRIC' }),
      ]),
    );
  });

  it('rejects a missing dimension on a dimensioned metric', async () => {
    const result = await validateRule({
      all: [{ metric: 'category_affinity_score', op: '>=', value: 0.7 }],
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_DIMENSION' }),
      ]),
    );
  });

  it('rejects too-deep nesting', async () => {
    const result = await validateRule({
      all: [
        {
          any: [
            {
              all: [
                {
                  any: [
                    {
                      all: [
                        {
                          any: [{ metric: 'order_count_lifetime', op: '>=', value: 1 }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'RULE_TOO_DEEP' }),
      ]),
    );
  });
});
