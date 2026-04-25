import { prisma } from '../../../src/db/prisma';
import { seedDefaultMetrics } from '../../../src/services/segmentation/metricRegistryService';
import { compileRule } from '../../../src/services/segmentation/ruleCompilerService';

describe('ruleCompilerService', () => {
  beforeAll(async () => {
    await seedDefaultMetrics();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('compiles a simple numeric comparison into parameterized SQL', async () => {
    const compiled = await compileRule({
      all: [{ metric: 'net_revenue_365d', op: '>=', value: 500 }],
    });

    expect(compiled.sql).toContain('cfc."net_revenue_365d" >= $1');
    expect(compiled.params).toEqual([500]);
    expect(compiled.metricDependencies).toEqual(['net_revenue_365d']);
  });

  it('compiles a category affinity exists subquery', async () => {
    const compiled = await compileRule({
      all: [
        {
          metric: 'category_affinity_score',
          dimension: { category_key: 'running-shoes' },
          op: '>=',
          value: 0.7,
        },
      ],
    });

    expect(compiled.sql).toContain('SELECT 1 FROM app."customer_category_features" ccf');
    expect(compiled.sql).toContain('ccf."category_key" = $1');
    expect(compiled.sql).toContain('ccf."affinity_score" >= $2');
    expect(compiled.params).toEqual(['running-shoes', 0.7]);
  });

  it('rejects unknown metrics before compile', async () => {
    await expect(
      compileRule({ all: [{ metric: 'wat', op: '>=', value: 1 }] } as any),
    ).rejects.toThrow('RULE_VALIDATION_FAILED');
  });
});
