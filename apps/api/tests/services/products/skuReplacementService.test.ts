const mockQueryRawUnsafe = jest.fn();
const mockTransaction = jest.fn();
const mockTxQueryRawUnsafe = jest.fn();
const mockTxExecuteRawUnsafe = jest.fn();
const mockSkuActivityCreate = jest.fn();

jest.mock('../../../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { saveReplacementForSku } from '../../../src/services/products/skuReplacementService';

const oldSkuId = '11111111-1111-4111-8111-111111111111';
const replacementSkuId = '22222222-2222-4222-8222-222222222222';

const oldSku = {
  id: oldSkuId,
  code: 'OLD-SKU',
  provisional_code: 'OLD-SKU',
  sku_state: 'ACTIVE',
  size_type: 1,
  description: 'Old SKU',
};

const replacementSku = {
  id: replacementSkuId,
  code: 'PA3053839SBL2',
  provisional_code: 'PA3053839SBL2',
  sku_state: 'ACTIVE',
  size_type: 1,
  description: 'Replacement SKU',
};

const savedReplacement = {
  id: '33333333-3333-4333-8333-333333333333',
  old_sku_id: oldSkuId,
  old_sku_code: 'OLD-SKU',
  old_description: 'Old SKU',
  replacement_sku_id: replacementSkuId,
  replacement_sku_code: 'PA3053839SBL2',
  replacement_description: 'Replacement SKU',
  replacement_type: 'EXACT',
  transfer_demand: true,
  effective_at: '2026-05-12T00:00:00.000Z',
  retired_at: null,
  note: null,
  created_at: '2026-05-12T00:00:00.000Z',
  created_by: 'tester',
  updated_at: '2026-05-12T00:00:00.000Z',
  updated_by: 'tester',
};

describe('skuReplacementService.saveReplacementForSku', () => {
  beforeEach(() => {
    mockQueryRawUnsafe.mockReset();
    mockTransaction.mockReset();
    mockTxQueryRawUnsafe.mockReset();
    mockTxExecuteRawUnsafe.mockReset();
    mockSkuActivityCreate.mockReset();

    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $queryRawUnsafe: (...args: unknown[]) => mockTxQueryRawUnsafe(...args),
        $executeRawUnsafe: (...args: unknown[]) => mockTxExecuteRawUnsafe(...args),
        skuActivity: { create: (...args: unknown[]) => mockSkuActivityCreate(...args) },
      }),
    );
    mockTxExecuteRawUnsafe.mockResolvedValue(undefined);
    mockSkuActivityCreate.mockResolvedValue({});
  });

  it('resolves replacementSkuId as a SKU code when the lookup returns code-shaped ids', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([oldSku])
      .mockResolvedValueOnce([replacementSku])
      .mockResolvedValueOnce([{ has_cycle: false }])
      .mockResolvedValueOnce([savedReplacement]);
    mockTxQueryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: savedReplacement.id }]);

    const result = await saveReplacementForSku(
      oldSkuId,
      { replacementSkuId: 'PA3053839SBL2', replacementType: 'EXACT', transferDemand: true },
      'tester',
    );

    expect(result.ok).toBe(true);
    const [replacementLookupSql, replacementLookupParam] = mockQueryRawUnsafe.mock.calls[1];
    expect(replacementLookupSql).toContain('UPPER(COALESCE(code, provisional_code)) = UPPER($1)');
    expect(replacementLookupParam).toBe('PA3053839SBL2');
    expect(mockTxQueryRawUnsafe.mock.calls[1][2]).toBe(replacementSkuId);
  });
});
