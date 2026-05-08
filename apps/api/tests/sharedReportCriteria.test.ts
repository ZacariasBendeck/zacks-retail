jest.mock('../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

import { prisma } from '../src/db/prisma';
import {
  parseIntegerCriteriaExpression,
  resolveSharedProductCriteriaSkuWhitelist,
} from '../src/services/salesReporting/sharedReportCriteria';
import { matchesCriteria } from '../src/utils/criteriaGrammar';

const mockQuery = prisma.$queryRawUnsafe as jest.Mock;

function skuRow(sku: string, category: number) {
  return {
    sku,
    category,
    vendor: null,
    season: null,
    group_code: null,
    style_color: null,
    keywords: null,
    department: null,
    sector: null,
    buyer_code: null,
  };
}

describe('shared report criteria', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('parses integer ranges with different digit counts', () => {
    const expr = parseIntegerCriteriaExpression('1-888');

    expect(matchesCriteria(expr, 1)).toBe(true);
    expect(matchesCriteria(expr, 560)).toBe(true);
    expect(matchesCriteria(expr, 889)).toBe(false);
  });

  it('resolves category raw ranges such as 1-888 for app-native reports', async () => {
    mockQuery.mockResolvedValue([
      skuRow('SKU-001', 1),
      skuRow('SKU-560', 560),
      skuRow('SKU-888', 888),
      skuRow('SKU-889', 889),
    ]);

    await expect(resolveSharedProductCriteriaSkuWhitelist({ categoriesRaw: '1-888' }))
      .resolves.toEqual(['SKU-001', 'SKU-560', 'SKU-888']);
  });

  it('keeps integer-range exclusions for category raw criteria', async () => {
    mockQuery.mockResolvedValue([
      skuRow('SKU-001', 1),
      skuRow('SKU-560', 560),
      skuRow('SKU-888', 888),
    ]);

    await expect(resolveSharedProductCriteriaSkuWhitelist({ categoriesRaw: '1-888,<>560' }))
      .resolves.toEqual(['SKU-001', 'SKU-888']);
  });
});
