const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

const mockPrisma = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
  $transaction: jest.fn(),
};

jest.mock('../../src/db/prisma', () => ({
  prisma: mockPrisma,
}));

import { createPurchasePlan, getPurchasePlan, updatePurchasePlanRow } from '../../src/services/purchasePlanning/purchasePlanningSavedService';

const planId = '00000000-0000-0000-0000-000000000001';

function headerRow() {
  return {
    id: planId,
    label: 'All Stores Spring 2026',
    status: 'draft',
    planningScope: 'store_group',
    scopeLabel: 'All Stores',
    storeGroupCode: 'all-stores',
    storeGroupLabel: 'All Stores',
    season: 'spring',
    seasonYear: 2026,
    seasonMonths: ['2026-03', '2026-04', '2026-05'],
    selectedDepartments: [5],
    forecastMethod: 'holtWinters',
    eohMethod: 'forward',
    coverMonths: 3,
    discountNormalization: true,
    historyFromYearMonth: '2023-03',
    historyToYearMonth: '2026-02',
    createdBy: 'system',
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    archivedAt: null,
  };
}

function savedRow(overrides: Record<string, unknown>) {
  return {
    id: 'row-1',
    planId,
    departmentKey: '5',
    departmentNumber: 5,
    departmentLabel: '5 - CAMISAS MARCA HOMBRE',
    yearMonth: '2026-03',
    baselineBoh: 70,
    baselineProjSales: 60,
    baselineEohTarget: 55,
    baselineBuy: 45,
    baselineEohActual: 55,
    currentBoh: 70,
    currentProjSales: 60,
    currentEohTarget: 55,
    currentBuy: 45,
    currentEohActual: 55,
    onHand: 40,
    currentOnOrder: 10,
    futureOnOrder: 10,
    nativeOpenPo: 10,
    stockPosition: 70,
    normalizationFactor: null,
    rawProjSales: null,
    ...overrides,
  };
}

describe('purchase planning saved service department scoping', () => {
  const includeUnmappedFlags: unknown[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    includeUnmappedFlags.length = 0;

    const queryHandler = jest.fn(async (sql: string, ...args: unknown[]) => {
      const text = String(sql);
      if (text.includes('FROM app.taxonomy_department') && text.includes('WHERE number = ANY')) {
        return [{ number: 5, description: 'CAMISAS MARCA HOMBRE' }];
      }
      if (text.includes('FROM app.store_group sg') && text.includes('WHERE sg.code = $1')) {
        return [{ code: 'all-stores', label: 'All Stores', storeNumbers: [1, 2] }];
      }
      if (text.includes('MAX(snapshot_as_of)')) {
        return [{ yearMonth: '2026-02' }];
      }
      if (text.includes('WITH src AS')) {
        includeUnmappedFlags.push(args[4]);
        return [];
      }
      if (text.includes('SUM(h.on_hand)')) {
        includeUnmappedFlags.push(args[2]);
        return [];
      }
      if (text.includes('nativeOpenPo')) {
        includeUnmappedFlags.push(args[2]);
        return [];
      }
      if (text.includes('INSERT INTO app.purchase_plan')) {
        return [{ id: planId }];
      }
      if (text.includes('FROM app.purchase_plan p') && text.includes('WHERE p.id = $1::uuid')) {
        return [headerRow()];
      }
      if (text.includes('purchase_plan_row')) {
        return [];
      }
      if (text.includes('FROM app.purchase_plan_adjustment')) {
        return [];
      }
      return [];
    });

    mockPrisma.$queryRawUnsafe.mockImplementation(queryHandler);
    mockTx.$queryRawUnsafe.mockImplementation(queryHandler);
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
    mockTx.$executeRawUnsafe.mockResolvedValue(0);
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx));
  });

  it('does not include unmapped categories when creating a selected-department worksheet', async () => {
    await createPurchasePlan({
      storeGroupCode: 'all-stores',
      season: 'spring',
      seasonYear: 2026,
      departmentNumbers: [5],
      forecast: { method: 'holtWinters' },
    });

    expect(includeUnmappedFlags).toEqual([false, false, false]);
  });

  it('filters saved worksheet reads to the plan selected departments', async () => {
    await getPurchasePlan(planId);

    const rowSql = mockPrisma.$queryRawUnsafe.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('purchase_plan_row'));
    expect(rowSql).toContain('r.department_number = ANY(p.selected_departments)');
  });

  it('updates monthly projection and target values and rolls EOH forward', async () => {
    const rows = [
      savedRow({ id: 'row-1', yearMonth: '2026-03' }),
      savedRow({
        id: 'row-2',
        yearMonth: '2026-04',
        baselineBoh: 55,
        baselineProjSales: 70,
        baselineEohTarget: 65,
        baselineBuy: 80,
        baselineEohActual: 65,
        currentBoh: 55,
        currentProjSales: 70,
        currentEohTarget: 65,
        currentBuy: 80,
        currentEohActual: 65,
        onHand: 0,
        currentOnOrder: 0,
        futureOnOrder: 0,
        nativeOpenPo: 0,
        stockPosition: 0,
      }),
    ];
    const queryHandler = jest.fn(async (sql: string) => {
      const text = String(sql);
      if (text.includes('FROM app.purchase_plan p') && text.includes('WHERE p.id = $1::uuid')) {
        return [headerRow()];
      }
      if (text.includes('FROM app.purchase_plan_row r')) {
        return rows;
      }
      if (text.includes('FROM app.purchase_plan_adjustment')) {
        return [];
      }
      return [];
    });
    mockPrisma.$queryRawUnsafe.mockImplementation(queryHandler);
    mockTx.$queryRawUnsafe.mockImplementation(queryHandler);

    await updatePurchasePlanRow(planId, 'row-1', {
      currentProjSales: 80,
      currentEohTarget: 60,
      reason: 'Monthly target override',
      appliedBy: 'buyer',
    });

    const updateCalls = mockTx.$executeRawUnsafe.mock.calls
      .filter(([sql]) => String(sql).includes('UPDATE app.purchase_plan_row'));
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0]?.slice(1)).toEqual(['row-1', 70, 80, 60, 70, 60]);
    expect(updateCalls[1]?.slice(1)).toEqual(['row-2', 60, 70, 65, 80, 70]);
  });
});
