const mockQueryRawUnsafe = jest.fn();
const mockAttributeDimensionFindMany = jest.fn();
const mockSkuAttributeAssignmentFindMany = jest.fn();

jest.mock('../../../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
    attributeDimension: {
      findMany: (...args: unknown[]) => mockAttributeDimensionFindMany(...args),
    },
    skuAttributeAssignment: {
      findMany: (...args: unknown[]) => mockSkuAttributeAssignmentFindMany(...args),
    },
  },
}));

import { AttributesRepository } from '../../../src/repositories/products/AttributesRepository';

function dim(
  id: number,
  code: string,
  familyRules: Array<{ familyCode: string; enabled: boolean }> = [],
) {
  return {
    id,
    code,
    labelEs: code,
    descriptionEs: null,
    sortOrder: id,
    isMultiValue: false,
    familyRules,
  };
}

describe('AttributesRepository.getSkuAttributes', () => {
  beforeEach(() => {
    mockQueryRawUnsafe.mockReset();
    mockAttributeDimensionFindMany.mockReset();
    mockSkuAttributeAssignmentFindMany.mockReset();
  });

  it('only returns unassigned dimensions that apply to the SKU product family', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ family_code: 'pants' }]);
    mockAttributeDimensionFindMany.mockResolvedValueOnce([
      dim(1, 'color'),
      dim(2, 'fit_pantalon', [{ familyCode: 'pants', enabled: true }]),
      dim(3, 'heel_height', [{ familyCode: 'shoes', enabled: true }]),
      dim(4, 'shoe_type', [{ familyCode: 'shoes', enabled: false }]),
    ]);
    mockSkuAttributeAssignmentFindMany.mockResolvedValueOnce([]);

    const result = await AttributesRepository.getSkuAttributes('PA3053839BL');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value.byDimension)).toEqual(['color', 'fit_pantalon']);
    expect(result.value.byDimension.heel_height).toBeUndefined();
    expect(result.value.byDimension.shoe_type).toBeUndefined();
  });

  it('keeps assigned dimensions visible even if they are no longer applicable', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ family_code: 'pants' }]);
    mockAttributeDimensionFindMany.mockResolvedValueOnce([
      dim(1, 'heel_height', [{ familyCode: 'shoes', enabled: true }]),
    ]);
    mockSkuAttributeAssignmentFindMany.mockResolvedValueOnce([
      {
        skuCode: 'PA3053839BL',
        dimensionId: 1,
        value: { code: 'high', labelEs: 'Alto' },
        assignedBy: 'operator@example',
        assignedAt: new Date('2026-05-12T00:00:00.000Z'),
      },
    ]);

    const result = await AttributesRepository.getSkuAttributes('PA3053839BL');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.byDimension.heel_height.values).toEqual([
      {
        code: 'high',
        labelEs: 'Alto',
        assignedBy: 'operator@example',
        assignedAt: '2026-05-12T00:00:00.000Z',
      },
    ]);
  });
});
