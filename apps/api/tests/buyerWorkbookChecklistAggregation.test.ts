jest.mock('../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../src/db/prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const service = require('../src/services/purchasePlanning/buyerWorkbookService');

type MockChecklistQueryInput = {
  categories?: Array<{
    buyerCode?: string | null;
    buyerLabel?: string | null;
    categoryNumber: number;
    categoryLabel?: string;
    departmentNumber?: number | null;
    departmentLabel?: string | null;
  }>;
  sales?: Array<{
    categoryNumber: number;
    last12MonthsSales: number;
    last12MonthsUnits: number;
  }>;
  inventory?: Array<{
    categoryNumber: number;
    currentInventoryUnits: number;
    currentInventoryValue: number;
  }>;
  planRows?: Array<Record<string, unknown>>;
  attributePlans?: Array<Record<string, unknown>>;
  attributeActualRows?: Array<Record<string, unknown>>;
  noBudget?: Array<{
    id: string;
    categoryNumber: number;
    buyingSeason: string;
    seasonYear: number;
    buyerCode: string | null;
    note: string | null;
    markedBy: string | null;
    markedAt: string;
    updatedAt: string;
  }>;
};

function mockChecklistQueries(input: MockChecklistQueryInput = {}) {
  const categories = input.categories ?? [
    {
      buyerCode: 'ZB',
      buyerLabel: 'Zacarias',
      categoryNumber: 262,
      categoryLabel: '262 - Ladies Casual',
      departmentNumber: 56,
      departmentLabel: '56 - Ladies',
    },
    {
      buyerCode: 'ZB',
      buyerLabel: 'Zacarias',
      categoryNumber: 560,
      categoryLabel: '560 - Accessories',
      departmentNumber: 59,
      departmentLabel: '59 - Accessories',
    },
  ];

  (prisma.$queryRawUnsafe as jest.Mock)
    .mockResolvedValueOnce([{ yearMonth: '2026-05' }])
    .mockResolvedValueOnce(categories)
    .mockResolvedValueOnce(input.planRows ?? [])
    .mockResolvedValueOnce(input.noBudget ?? [])
    .mockResolvedValueOnce(input.sales ?? [
      { categoryNumber: 262, last12MonthsSales: 1000.49, last12MonthsUnits: 12.2 },
    ])
    .mockResolvedValueOnce(input.inventory ?? [
      { categoryNumber: 262, currentInventoryUnits: 20, currentInventoryValue: 500.25 },
    ]);

  if ((input.planRows?.length ?? 0) > 0 || input.attributePlans || input.attributeActualRows) {
    (prisma.$queryRawUnsafe as jest.Mock)
      .mockResolvedValueOnce(input.attributePlans ?? [])
      .mockResolvedValueOnce(input.attributeActualRows ?? []);
  }
}

function sqlCallContaining(fragment: string) {
  const call = (prisma.$queryRawUnsafe as jest.Mock).mock.calls.find(([sql]) => String(sql).includes(fragment));
  expect(call).toBeDefined();
  return call as [string, ...unknown[]];
}

describe('listBuyerChecklistCategories aggregation', () => {
  beforeEach(() => {
    (prisma.$queryRawUnsafe as jest.Mock).mockReset();
    (prisma.$executeRawUnsafe as jest.Mock).mockReset();
  });

  it('uses buyer-owned Sales History style SQL for checklist sales and current inventory', async () => {
    mockChecklistQueries();

    const rows = await service.listBuyerChecklistCategories({
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
    });

    const [salesSql, ...salesParams] = sqlCallContaining('AS "last12MonthsSales"');
    expect(salesSql).toContain('m.slot_number');
    expect(salesSql).toContain('UNION ALL');
    expect(salesSql).toContain('s.month_qty_sales');
    expect(salesSql).toContain('s.month_dol_sales');
    expect(salesSql).toContain('s.month_profit');
    expect(salesSql).toContain('m.qty_sales <> 0');
    expect(salesSql).toContain('COALESCE(m.net_sales, 0) <> 0');
    expect(salesSql).toContain('COALESCE(m.profit, 0) <> 0');
    expect(salesSql).toContain('JOIN app.inventory_history_snapshot s');
    expect(salesSql).toContain('ON s.sku_code = COALESCE(k.code, k.provisional_code)');
    expect(salesSql).not.toContain('sku_attribute_assignment');
    expect(salesSql).not.toMatch(/\bBTRIM\b/i);
    expect(salesSql).not.toMatch(/s\.sku_id\s*=\s*k\.id/i);
    expect(salesSql).not.toMatch(/ticket/i);
    expect(salesSql).not.toMatch(/m\.year_month\s*(>=|<=|between)/i);
    expect(salesParams).toEqual(['2025-06', '2026-05', 2026, 5, [262, 560]]);

    const [inventorySql, ...inventoryParams] = sqlCallContaining('AS "currentInventoryUnits"');
    expect(inventorySql).toContain('JOIN app.inventory_history_snapshot s');
    expect(inventorySql).toContain('ON s.sku_code = COALESCE(k.code, k.provisional_code)');
    expect(inventorySql).toContain('COALESCE(k.current_cost, s.average_cost, 0)');
    expect(inventorySql).not.toContain('sku_attribute_assignment');
    expect(inventorySql).not.toMatch(/\bBTRIM\b/i);
    expect(inventorySql).not.toMatch(/s\.sku_id\s*=\s*k\.id/i);
    expect(inventorySql).not.toContain('inventory_history_month');
    expect(inventoryParams).toEqual([[262, 560]]);
    expect((prisma.$queryRawUnsafe as jest.Mock).mock.calls.some(([sql]) => String(sql).includes('purchase_plan_row'))).toBe(false);

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        categoryNumber: 262,
        last12MonthsSales: 1000.49,
        last12MonthsUnits: 12,
        currentInventoryUnits: 20,
        currentInventoryValue: 500.25,
        departmentOtbUnits: null,
        currentSeason: expect.objectContaining({
          steps: expect.objectContaining({
            salesProjection: expect.objectContaining({ status: 'missing' }),
            inventoryPlan: expect.objectContaining({ status: 'missing', currentInventoryUnits: 20, departmentOtbUnits: null }),
            carryovers: expect.objectContaining({ status: 'missing' }),
            attributePlan: expect.objectContaining({ status: 'missing' }),
          }),
        }),
      }),
      expect.objectContaining({
        categoryNumber: 560,
        last12MonthsSales: 0,
        last12MonthsUnits: 0,
        currentInventoryUnits: 0,
        currentInventoryValue: 0,
        departmentOtbUnits: null,
      }),
    ]));
  });

  it('summarizes current-season workflow steps from projection, carryover, PO, and attribute rows', async () => {
    mockChecklistQueries({
      inventory: [
        { categoryNumber: 262, currentInventoryUnits: 20, currentInventoryValue: 500.25 },
        { categoryNumber: 560, currentInventoryUnits: 8, currentInventoryValue: 250 },
      ],
      planRows: [
        {
          categoryNumber: 262,
          buyingSeason: 'FALL_WINTER',
          seasonYear: 2026,
          workbookId: 'workbook-1',
          cardId: 'card-1',
          status: 'NOT_STARTED',
          updatedAt: '2026-05-01T00:00:00.000Z',
          salesProjectionPlanId: 'plan-1',
          salesProjectionUnits: 120,
          salesProjectionUpdatedAt: null,
          targetCarryoverSkuCount: 3,
          plannedCarryoverCount: 2,
          boughtCarryoverCount: 1,
        },
        {
          categoryNumber: 560,
          buyingSeason: 'FALL_WINTER',
          seasonYear: 2026,
          workbookId: 'workbook-2',
          cardId: 'card-2',
          status: 'HISTORY_REVIEWED',
          updatedAt: '2026-05-02T00:00:00.000Z',
          salesProjectionPlanId: 'plan-2',
          salesProjectionUnits: 48,
          salesProjectionUpdatedAt: '2026-05-02T01:00:00.000Z',
          targetCarryoverSkuCount: 1,
          plannedCarryoverCount: 1,
          boughtCarryoverCount: 1,
        },
      ],
      attributePlans: [
        {
          id: 'attr-1',
          workbookId: 'workbook-1',
          cardId: 'card-1',
          dimensionCode: 'color_family',
          dimensionLabel: 'Color Family',
          valueCode: 'black',
          valueLabel: 'Black',
          plannedStyleCount: 2,
          plannedUnits: 70,
          notes: null,
          updatedBy: 'buyer',
          updatedAt: '2026-05-03T00:00:00.000Z',
        },
      ],
      attributeActualRows: [
        {
          cardId: 'card-1',
          dimensionCode: 'color_family',
          dimensionLabel: 'Color Family',
          valueCode: 'black',
          valueLabel: 'Black',
          currentInventoryUnits: 100,
          purchaseUnits: 0,
        },
        {
          cardId: 'card-1',
          dimensionCode: 'color_family',
          dimensionLabel: 'Color Family',
          valueCode: 'brown',
          valueLabel: 'Brown',
          currentInventoryUnits: 30,
          purchaseUnits: 0,
        },
      ],
    });

    const rows = await service.listBuyerChecklistCategories({
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
    });

    const draftRow = rows.find((row: { categoryNumber: number }) => row.categoryNumber === 262);
    expect(draftRow.currentSeason.steps).toMatchObject({
      salesProjection: {
        status: 'draft',
        projectedUnits: 120,
        planId: 'plan-1',
        updatedAt: null,
      },
      inventoryPlan: {
        status: 'draft',
        hasProjectionPlan: true,
        currentInventoryUnits: 20,
        departmentOtbUnits: null,
      },
      carryovers: {
        status: 'draft',
        targetCount: 3,
        plannedCount: 2,
        boughtCount: 1,
      },
      attributePlan: {
        status: 'alert',
        plannedUnits: 70,
        currentInventoryUnits: 130,
        actualUnits: 130,
        maxVarianceUnits: 30,
        alertCount: 2,
        updatedAt: '2026-05-03T00:00:00.000Z',
      },
    });

    const confirmedRow = rows.find((row: { categoryNumber: number }) => row.categoryNumber === 560);
    expect(confirmedRow.currentSeason.steps).toMatchObject({
      salesProjection: {
        status: 'confirmed',
        projectedUnits: 48,
        planId: 'plan-2',
        updatedAt: '2026-05-02T01:00:00.000Z',
      },
      inventoryPlan: {
        status: 'draft',
        hasProjectionPlan: true,
        currentInventoryUnits: 8,
        departmentOtbUnits: null,
      },
      carryovers: {
        status: 'complete',
        targetCount: 1,
        plannedCount: 1,
        boughtCount: 1,
      },
      attributePlan: {
        status: 'missing',
      },
    });
  });

  it('does not auto-complete carryovers when the category has a zero carryover target', async () => {
    mockChecklistQueries({
      categories: [{
        buyerCode: 'ZB',
        buyerLabel: 'Zacarias',
        categoryNumber: 262,
        categoryLabel: '262 - Ladies Casual',
        departmentNumber: 56,
        departmentLabel: '56 - Ladies',
      }],
      planRows: [{
        categoryNumber: 262,
        buyingSeason: 'FALL_WINTER',
        seasonYear: 2026,
        workbookId: 'workbook-1',
        cardId: 'card-1',
        status: 'HISTORY_REVIEWED',
        updatedAt: '2026-05-02T00:00:00.000Z',
        salesProjectionPlanId: 'plan-1',
        salesProjectionUnits: 48,
        salesProjectionUpdatedAt: '2026-05-02T01:00:00.000Z',
        targetCarryoverSkuCount: 0,
        plannedCarryoverCount: 0,
        boughtCarryoverCount: 0,
      }],
    });

    const rows = await service.listBuyerChecklistCategories({
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
    });

    expect(rows[0].currentSeason.steps).toMatchObject({
      salesProjection: { status: 'confirmed' },
      inventoryPlan: { status: 'draft' },
      carryovers: {
        status: 'not_applicable',
        targetCount: 0,
        plannedCount: 0,
        boughtCount: 0,
      },
    });
  });

  it('uses the buyer filter only to select category-owned checklist rows', async () => {
    mockChecklistQueries({
      categories: [{
        buyerCode: 'ZB',
        buyerLabel: 'Zacarias',
        categoryNumber: 262,
        categoryLabel: '262 - Ladies Casual',
        departmentNumber: 56,
        departmentLabel: '56 - Ladies',
      }],
    });

    const rows = await service.listBuyerChecklistCategories({
      buyer: 'ZB',
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
    });

    const baseCall = sqlCallContaining('app.category_buyer_assignment');
    expect(baseCall[0]).toContain('JOIN category_assignment ca ON ca.category_number = c.number');
    expect(baseCall[0]).toContain('UPPER(BTRIM(av.code)) = UPPER(BTRIM($1::text))');
    expect(baseCall.slice(1)).toEqual(['ZB']);
    expect(sqlCallContaining('AS "last12MonthsSales"').slice(1)).toEqual([
      '2025-06',
      '2026-05',
      2026,
      5,
      [262],
    ]);
    expect(sqlCallContaining('AS "currentInventoryUnits"').slice(1)).toEqual([[262]]);
    expect(rows[0]).toEqual(expect.objectContaining({ buyerCode: 'ZB', categoryNumber: 262 }));
  });

  it('keeps checklist categories with no sales aggregate rows', async () => {
    mockChecklistQueries({
      sales: [],
      inventory: [],
    });

    const rows = await service.listBuyerChecklistCategories({
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
    });

    expect(rows.map((row: { categoryNumber: number }) => row.categoryNumber)).toEqual([262, 560]);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        categoryNumber: 262,
        last12MonthsSales: 0,
        last12MonthsUnits: 0,
        currentInventoryUnits: 0,
        currentInventoryValue: 0,
      }),
      expect.objectContaining({
        categoryNumber: 560,
        last12MonthsSales: 0,
        last12MonthsUnits: 0,
        currentInventoryUnits: 0,
        currentInventoryValue: 0,
      }),
    ]));
  });

  it('filters active no-budget categories unless includeNoBudget is true', async () => {
    const noBudget = [{
      id: 'no-budget-1',
      categoryNumber: 560,
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
      buyerCode: null,
      note: null,
      markedBy: 'buyer',
      markedAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    }];
    mockChecklistQueries({ noBudget });

    const filtered = await service.listBuyerChecklistCategories({
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
    });
    expect(filtered.map((row: { categoryNumber: number }) => row.categoryNumber)).toEqual([262]);
    expect(sqlCallContaining('AS "last12MonthsSales"').slice(1)).toEqual([
      '2025-06',
      '2026-05',
      2026,
      5,
      [262],
    ]);
    expect(sqlCallContaining('AS "currentInventoryUnits"').slice(1)).toEqual([[262]]);

    (prisma.$queryRawUnsafe as jest.Mock).mockReset();
    mockChecklistQueries({ noBudget });
    const included = await service.listBuyerChecklistCategories({
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
      includeNoBudget: true,
    });
    expect(included.map((row: { categoryNumber: number }) => row.categoryNumber)).toEqual([262, 560]);
    expect(included[1].currentSeason).toEqual(expect.objectContaining({
      status: 'NO_BUDGET',
      noBudgetId: 'no-budget-1',
      steps: expect.objectContaining({
        salesProjection: expect.objectContaining({ status: 'not_applicable' }),
        inventoryPlan: expect.objectContaining({ status: 'not_applicable' }),
        carryovers: expect.objectContaining({ status: 'not_applicable' }),
        attributePlan: expect.objectContaining({ status: 'not_applicable' }),
      }),
    }));
  });
});
