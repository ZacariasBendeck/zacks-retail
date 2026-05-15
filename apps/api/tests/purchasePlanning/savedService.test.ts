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

import {
  createPurchasePlan,
  getPurchasePlan,
  getPurchasePlanSalesTrendSummary,
  updatePurchasePlanRow,
} from '../../src/services/purchasePlanning/purchasePlanningSavedService';

const planId = '00000000-0000-0000-0000-000000000001';

function headerRow(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
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

  it('uses all enterprise stores and warehouses for generated sales and on-hand units', async () => {
    const monthlyFactStoreArgs: unknown[] = [];
    const inventoryStoreArgs: unknown[] = [];
    const latestStoreArgs: unknown[] = [];
    const queryHandler = jest.fn(async (sql: string, ...args: unknown[]) => {
      const text = String(sql);
      if (text.includes('FROM app.taxonomy_department') && text.includes('WHERE number = ANY')) {
        return [{ number: 5, description: 'CAMISAS MARCA HOMBRE' }];
      }
      if (text.includes('FROM app.store_group sg') && text.includes('WHERE sg.active = true')) {
        return [{ code: 'selling-stores', label: 'Selling Stores', storeNumbers: [1, 2] }];
      }
      if (text.includes('FROM app.store_master')) {
        return [{ number: 99 }];
      }
      if (text.includes('MAX(snapshot_as_of)')) {
        latestStoreArgs.push(args[0]);
        return [{ yearMonth: '2026-02' }];
      }
      if (text.includes('INNER JOIN app.inventory_history_month')) {
        monthlyFactStoreArgs.push(args[2]);
        return [];
      }
      if (text.includes('SUM(h.on_hand)')) {
        inventoryStoreArgs.push(args[0]);
        return [];
      }
      if (text.includes('nativeOpenPo')) {
        return [];
      }
      if (text.includes('INSERT INTO app.purchase_plan')) {
        return [{ id: planId }];
      }
      if (text.includes('FROM app.purchase_plan p') && text.includes('WHERE p.id = $1::uuid')) {
        return [headerRow({
          planningScope: 'enterprise',
          storeGroupCode: null,
          storeGroupLabel: null,
        })];
      }
      if (text.includes('FROM app.purchase_plan_row r')) {
        return [];
      }
      if (text.includes('FROM app.purchase_plan_adjustment')) {
        return [];
      }
      return [];
    });
    mockPrisma.$queryRawUnsafe.mockImplementation(queryHandler);
    mockTx.$queryRawUnsafe.mockImplementation(queryHandler);

    await createPurchasePlan({
      planningScope: 'enterprise',
      season: 'spring',
      seasonYear: 2026,
      departmentNumbers: [5],
      forecast: { method: 'holtWinters' },
    });

    expect(latestStoreArgs).toEqual([[1, 2, 99]]);
    expect(monthlyFactStoreArgs).toEqual([[1, 2, 99]]);
    expect(inventoryStoreArgs).toContainEqual([1, 2, 99]);
  });

  it('filters saved worksheet reads to the plan selected departments', async () => {
    await getPurchasePlan(planId);

    const rowSql = mockPrisma.$queryRawUnsafe.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('purchase_plan_row'));
    expect(rowSql).toContain('r.department_number = ANY(p.selected_departments)');
  });

  it('adds prior-year sales and next-month BOH to saved worksheet rows', async () => {
    const rows = [savedRow({ id: 'row-1', yearMonth: '2026-03' })];
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
      if (text.includes('FROM app.store_group sg') && text.includes('WHERE sg.code = $1')) {
        return [{ code: 'all-stores', label: 'All Stores', storeNumbers: [1, 2] }];
      }
      if (text.includes('FROM app.sales_history_ticket')) {
        return [];
      }
      if (text.includes('INNER JOIN app.inventory_history_month')) {
        return [
          {
            departmentKey: '5',
            departmentNumber: 5,
            departmentLabel: 'CAMISAS MARCA HOMBRE',
            yearMonth: '2025-03',
            qty: 42,
            netSales: 0,
            referenceRetail: 0,
            beginningOnHand: 91,
          },
          {
            departmentKey: '5',
            departmentNumber: 5,
            departmentLabel: 'CAMISAS MARCA HOMBRE',
            yearMonth: '2025-04',
            qty: 0,
            netSales: 0,
            referenceRetail: 0,
            beginningOnHand: 84,
          },
        ];
      }
      return [];
    });
    mockPrisma.$queryRawUnsafe.mockImplementation(queryHandler);
    mockTx.$queryRawUnsafe.mockImplementation(queryHandler);

    const detail = await getPurchasePlan(planId);

    expect(detail.departments[0]?.months[0]?.lastYearSalesUnits).toBe(42);
    expect(detail.departments[0]?.months[0]?.lastYearBeginningOnHand).toBe(91);
    expect(detail.departments[0]?.months[0]?.lastYearNextMonthBeginningOnHand).toBe(84);
  });

  it('uses ticket history for year-before-last sales outside the rolling inventory window', async () => {
    const rows = [savedRow({ id: 'row-1', yearMonth: '2026-03' })];
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
      if (text.includes('FROM app.store_group sg') && text.includes('WHERE sg.code = $1')) {
        return [{ code: 'all-stores', label: 'All Stores', storeNumbers: [1, 2] }];
      }
      if (text.includes('FROM app.sales_history_ticket')) {
        return [{
          departmentKey: '5',
          yearMonth: '2024-03',
          qty: 37,
        }];
      }
      if (text.includes('INNER JOIN app.inventory_history_month')) {
        return [];
      }
      return [];
    });
    mockPrisma.$queryRawUnsafe.mockImplementation(queryHandler);
    mockTx.$queryRawUnsafe.mockImplementation(queryHandler);

    const detail = await getPurchasePlan(planId);

    expect(detail.departments[0]?.months[0]?.yearBeforeLastSalesUnits).toBe(37);
    expect(detail.departments[0]?.months[0]?.yearBeforeLastBeginningOnHand).toBeNull();
  });

  it('calculates recent trend windows against the same months last year', async () => {
    const priorYearMonths = [
      '2024-05', '2024-06', '2024-07', '2024-08', '2024-09', '2024-10',
      '2024-11', '2024-12', '2025-01', '2025-02', '2025-03', '2025-04',
    ];
    const currentYearMonths = [
      '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10',
      '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04',
    ];
    const factRows = [
      ...priorYearMonths.map((yearMonth) => ({
        departmentKey: '5',
        departmentNumber: 5,
        departmentLabel: 'CAMISAS MARCA HOMBRE',
        yearMonth,
        qty: 10,
        netSales: 0,
        referenceRetail: 0,
        beginningOnHand: 0,
      })),
      ...currentYearMonths.map((yearMonth) => ({
        departmentKey: '5',
        departmentNumber: 5,
        departmentLabel: 'CAMISAS MARCA HOMBRE',
        yearMonth,
        qty: 20,
        netSales: 0,
        referenceRetail: 0,
        beginningOnHand: 0,
      })),
    ];
    const queryHandler = jest.fn(async (sql: string) => {
      const text = String(sql);
      if (text.includes('FROM app.purchase_plan p') && text.includes('WHERE p.id = $1::uuid')) {
        return [headerRow({
          historyFromYearMonth: '2023-05',
          historyToYearMonth: '2026-04',
          seasonMonths: ['2026-05', '2026-06', '2026-07'],
        })];
      }
      if (text.includes('FROM app.store_group sg') && text.includes('WHERE sg.code = $1')) {
        return [{ code: 'all-stores', label: 'All Stores', storeNumbers: [1, 2] }];
      }
      if (text.includes('WITH src AS')) {
        return factRows;
      }
      return [];
    });
    mockPrisma.$queryRawUnsafe.mockImplementation(queryHandler);
    mockTx.$queryRawUnsafe.mockImplementation(queryHandler);

    const summary = await getPurchasePlanSalesTrendSummary(planId);

    expect(summary.last12).toMatchObject({
      currentFromYearMonth: '2025-05',
      currentToYearMonth: '2026-04',
      comparisonFromYearMonth: '2024-05',
      comparisonToYearMonth: '2025-04',
      currentUnits: 240,
      comparisonUnits: 120,
      changePct: 100,
    });
    expect(summary.recent6).toMatchObject({
      label: 'Recent 6M YoY',
      currentFromYearMonth: '2025-11',
      currentToYearMonth: '2026-04',
      comparisonFromYearMonth: '2024-11',
      comparisonToYearMonth: '2025-04',
      currentUnits: 120,
      comparisonUnits: 60,
      changePct: 100,
    });
    expect(summary.recent3).toMatchObject({
      label: 'Recent 3M YoY',
      currentFromYearMonth: '2026-02',
      currentToYearMonth: '2026-04',
      comparisonFromYearMonth: '2025-02',
      comparisonToYearMonth: '2025-04',
      currentUnits: 60,
      comparisonUnits: 30,
      changePct: 100,
    });
  });

  it('uses ticket history for prior-year trend comparisons missing from rolling inventory history', async () => {
    const currentYearMonths = [
      '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10',
      '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04',
    ];
    const ticketYearMonths = [
      '2024-05', '2024-06', '2024-07', '2024-08', '2024-09', '2024-10',
      '2024-11', '2024-12', '2025-01', '2025-02', '2025-03', '2025-04',
    ];
    const inventoryRows = currentYearMonths.map((yearMonth) => ({
      departmentKey: '5',
      departmentNumber: 5,
      departmentLabel: 'CAMISAS MARCA HOMBRE',
      yearMonth,
      qty: 20,
      netSales: 0,
      referenceRetail: 0,
      beginningOnHand: 0,
    }));
    const ticketRows = ticketYearMonths.map((yearMonth) => ({
      departmentKey: '5',
      yearMonth,
      qty: 10,
    }));
    const queryHandler = jest.fn(async (sql: string) => {
      const text = String(sql);
      if (text.includes('FROM app.purchase_plan p') && text.includes('WHERE p.id = $1::uuid')) {
        return [headerRow({
          historyFromYearMonth: '2023-05',
          historyToYearMonth: '2026-04',
          seasonMonths: ['2026-05', '2026-06', '2026-07'],
        })];
      }
      if (text.includes('FROM app.store_group sg') && text.includes('WHERE sg.code = $1')) {
        return [{ code: 'all-stores', label: 'All Stores', storeNumbers: [1, 2] }];
      }
      if (text.includes('FROM app.sales_history_ticket')) {
        return ticketRows;
      }
      if (text.includes('INNER JOIN app.inventory_history_month')) {
        return inventoryRows;
      }
      return [];
    });
    mockPrisma.$queryRawUnsafe.mockImplementation(queryHandler);
    mockTx.$queryRawUnsafe.mockImplementation(queryHandler);

    const summary = await getPurchasePlanSalesTrendSummary(planId);

    expect(summary.last12).toMatchObject({
      currentUnits: 240,
      comparisonUnits: 120,
      changePct: 100,
    });
    expect(summary.recent6).toMatchObject({
      currentUnits: 120,
      comparisonUnits: 60,
      changePct: 100,
    });
    expect(summary.recent3).toMatchObject({
      currentUnits: 60,
      comparisonUnits: 30,
      changePct: 100,
    });
  });

  it('uses all enterprise stores and warehouses for trend summary comparisons', async () => {
    const inventoryStoreArgs: unknown[] = [];
    const ticketStoreArgs: unknown[] = [];
    const queryHandler = jest.fn(async (sql: string, ...args: unknown[]) => {
      const text = String(sql);
      if (text.includes('FROM app.purchase_plan p') && text.includes('WHERE p.id = $1::uuid')) {
        return [headerRow({
          planningScope: 'enterprise',
          storeGroupCode: null,
          storeGroupLabel: null,
          historyFromYearMonth: '2023-05',
          historyToYearMonth: '2026-04',
          seasonMonths: ['2026-05', '2026-06', '2026-07'],
        })];
      }
      if (text.includes('FROM app.store_group sg') && text.includes('WHERE sg.active = true')) {
        return [{ code: 'selling-stores', label: 'Selling Stores', storeNumbers: [1, 2] }];
      }
      if (text.includes('FROM app.store_master')) {
        return [{ number: 99 }];
      }
      if (text.includes('INNER JOIN app.inventory_history_month')) {
        inventoryStoreArgs.push(args[2]);
        return [];
      }
      if (text.includes('FROM app.sales_history_ticket')) {
        ticketStoreArgs.push(args[2]);
        return [];
      }
      return [];
    });
    mockPrisma.$queryRawUnsafe.mockImplementation(queryHandler);
    mockTx.$queryRawUnsafe.mockImplementation(queryHandler);

    await getPurchasePlanSalesTrendSummary(planId);

    expect(inventoryStoreArgs).toEqual([[1, 2, 99]]);
    expect(ticketStoreArgs).toEqual([[1, 2, 99]]);
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
      if (text.includes('FROM app.store_group sg') && text.includes('WHERE sg.code = $1')) {
        return [{ code: 'all-stores', label: 'All Stores', storeNumbers: [1, 2] }];
      }
      if (text.includes('WITH src AS')) {
        return [];
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
