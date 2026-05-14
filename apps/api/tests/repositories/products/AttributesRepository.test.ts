const mockQueryRawUnsafe = jest.fn();
const mockTransaction = jest.fn();
const mockAttributeDimensionFindMany = jest.fn();
const mockSkuAttributeAssignmentFindMany = jest.fn();
const mockSkuAttributeAssignmentCreateMany = jest.fn();
const mockTxExecuteRawUnsafe = jest.fn();

jest.mock('../../../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    attributeDimension: {
      findMany: (...args: unknown[]) => mockAttributeDimensionFindMany(...args),
    },
    skuAttributeAssignment: {
      findMany: (...args: unknown[]) => mockSkuAttributeAssignmentFindMany(...args),
      createMany: (...args: unknown[]) => mockSkuAttributeAssignmentCreateMany(...args),
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
    mockTransaction.mockReset();
    mockAttributeDimensionFindMany.mockReset();
    mockSkuAttributeAssignmentFindMany.mockReset();
    mockSkuAttributeAssignmentCreateMany.mockReset();
    mockTxExecuteRawUnsafe.mockReset();
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

describe('AttributesRepository.replaceSkuAttributeDimension', () => {
  beforeEach(() => {
    mockQueryRawUnsafe.mockReset();
    mockTransaction.mockReset();
    mockAttributeDimensionFindMany.mockReset();
    mockSkuAttributeAssignmentFindMany.mockReset();
    mockSkuAttributeAssignmentCreateMany.mockReset();
    mockTxExecuteRawUnsafe.mockReset();
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $executeRawUnsafe: (...args: unknown[]) => mockTxExecuteRawUnsafe(...args),
        skuAttributeAssignment: {
          createMany: (...args: unknown[]) => mockSkuAttributeAssignmentCreateMany(...args),
        },
      }),
    );
  });

  it('deletes keyword-derived rows for the edited dimension before inserting the manual value', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ family_code: null }])
      .mockResolvedValueOnce([]);
    mockAttributeDimensionFindMany.mockResolvedValueOnce([
      {
        ...dim(1, 'color'),
        values: [
          { id: 10, code: 'blue', labelEs: 'Azul', isActive: true, sortOrder: 1 },
        ],
      },
    ]);
    mockSkuAttributeAssignmentFindMany
      .mockResolvedValueOnce([
        {
          skuCode: 'PA3053839BL',
          dimensionId: 1,
          value: { code: 'red', labelEs: 'Rojo' },
          assignedBy: 'seed:keyword:color',
          assignedAt: new Date('2026-05-12T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          skuCode: 'PA3053839BL',
          dimensionId: 1,
          value: { code: 'blue', labelEs: 'Azul' },
          assignedBy: 'operator@example',
          assignedAt: new Date('2026-05-12T01:00:00.000Z'),
        },
      ]);

    const result = await AttributesRepository.replaceSkuAttributeDimension(
      'PA3053839BL',
      'color',
      ['blue'],
      'operator@example',
    );

    expect(result.ok).toBe(true);
    expect(mockTxExecuteRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM app.sku_attribute_assignment'),
      'PA3053839BL',
      1,
    );
    expect(mockTxExecuteRawUnsafe.mock.calls[0][0]).not.toContain('seed:keyword');
    expect(mockSkuAttributeAssignmentCreateMany).toHaveBeenCalledWith({
      data: [
        {
          skuCode: 'PA3053839BL',
          dimensionId: 1,
          valueId: 10,
          assignedBy: 'operator@example',
        },
      ],
      skipDuplicates: true,
    });
    if (!result.ok) return;
    expect(result.value.previous[0]).toEqual(
      expect.objectContaining({ code: 'red', assignedBy: 'seed:keyword:color' }),
    );
    expect(result.value.next[0]).toEqual(
      expect.objectContaining({ code: 'blue', assignedBy: 'operator@example' }),
    );
  });
});
