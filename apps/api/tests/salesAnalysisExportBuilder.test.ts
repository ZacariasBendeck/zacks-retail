import {
  buildSalesAnalysisHierarchyExport,
  validateSalesAnalysisHierarchyLevels,
} from '../src/services/salesReporting/salesAnalysisExportBuilder';
import type { SalesAnalysisReport, SalesAnalysisRow } from '../src/services/salesReporting/types';

function row(overrides: Partial<SalesAnalysisRow>): SalesAnalysisRow {
  return {
    dimensionKey: 'SKU',
    dimensionLabel: null,
    storeNumber: null,
    qty: 0,
    netSales: 0,
    cogs: 0,
    grossProfit: 0,
    gpPct: null,
    unitsOnHand: 0,
    inventoryUnitCost: null,
    onHandAtCost: 0,
    turnsRoiInventoryValue: 0,
    turns: null,
    roiPct: null,
    priorYearQty: null,
    priorYearNetSales: null,
    pyPctChange: null,
    priorYearGrossProfit: null,
    pyGrossProfitPctChange: null,
    priorYearOnHandAtCost: null,
    pyOnHandPctChange: null,
    ...overrides,
  };
}

function report(): SalesAnalysisReport {
  const rows = [
    row({
      dimensionKey: '6608-BKPU',
      dimensionLabel: 'Black shoe',
      qty: 2,
      netSales: 100,
      cogs: 40,
      grossProfit: 60,
      gpPct: 60,
      unitsOnHand: 10,
      inventoryUnitCost: 20,
      onHandAtCost: 200,
      turnsRoiInventoryValue: 200,
      turns: 7.3,
      roiPct: 11,
      onOrderQty: 2,
      onOrderUnitCost: 40,
      onOrderCost: 80,
      priorYearQty: 1,
      priorYearNetSales: 50,
      priorYearGrossProfit: 20,
      priorYearOnHandAtCost: 100,
      attributes: {
        description: 'Black shoe',
        vendorCode: 'AGO',
        manufacturer: null,
        categoryNumber: 216,
        categoryDesc: 'Sneakers',
        departmentNumber: 5,
        departmentDesc: 'Shoes',
        season: 'A',
        groupCode: 'IBL',
        styleColor: 'PLAN/BK',
        currentPrice: 100,
        currentCost: 20,
        unitsOnHand: 10,
        pictureUrl: null,
        extended: { buyer: 'ANA' },
      },
      attributeAssignments: {
        color: { valueCodes: ['black'], valueLabels: ['Black'], label: 'Black' },
      },
    }),
    row({
      dimensionKey: '6610-BLUE',
      dimensionLabel: 'Blue shoe',
      qty: 1,
      netSales: 200,
      cogs: 120,
      grossProfit: 80,
      gpPct: 40,
      unitsOnHand: 5,
      inventoryUnitCost: 10,
      onHandAtCost: 50,
      turnsRoiInventoryValue: 50,
      turns: 29.2,
      roiPct: 19.5,
      onOrderQty: 4,
      onOrderUnitCost: 25,
      onOrderCost: 100,
      priorYearQty: 1,
      priorYearNetSales: 100,
      priorYearGrossProfit: 50,
      priorYearOnHandAtCost: 50,
      attributes: {
        description: 'Blue shoe',
        vendorCode: 'AGO',
        manufacturer: null,
        categoryNumber: 217,
        categoryDesc: 'Sandals',
        departmentNumber: 5,
        departmentDesc: 'Shoes',
        season: 'A',
        groupCode: 'IBL',
        styleColor: 'PLAN/BL',
        currentPrice: 200,
        currentCost: 10,
        unitsOnHand: 5,
        pictureUrl: null,
        extended: { buyer: 'ANA' },
      },
      attributeAssignments: {
        color: { valueCodes: ['blue'], valueLabels: ['Blue'], label: 'Blue' },
      },
    }),
    row({
      dimensionKey: '8800-RED',
      dimensionLabel: 'Red apparel',
      qty: 3,
      netSales: 500,
      cogs: 300,
      grossProfit: 200,
      gpPct: 40,
      unitsOnHand: 2,
      inventoryUnitCost: 10,
      onHandAtCost: 20,
      turnsRoiInventoryValue: 20,
      turns: 182.5,
      roiPct: 121.7,
      priorYearQty: 2,
      priorYearNetSales: 250,
      priorYearGrossProfit: 100,
      priorYearOnHandAtCost: 20,
      attributes: {
        description: 'Red apparel',
        vendorCode: 'RED',
        manufacturer: null,
        categoryNumber: 301,
        categoryDesc: 'Apparel',
        departmentNumber: 8,
        departmentDesc: 'Clothing',
        season: 'B',
        groupCode: 'APP',
        styleColor: 'PLAN/RD',
        currentPrice: 500,
        currentCost: 10,
        unitsOnHand: 2,
        pictureUrl: null,
        extended: { buyer: 'BOB' },
      },
      attributeAssignments: {
        color: { valueCodes: ['red'], valueLabels: ['Red'], label: 'Red' },
      },
    }),
  ];
  return {
    dimension: 'CATEGORY',
    reportType: 'SKU_DETAIL',
    storeOption: 'COMBINE',
    criteria: {},
    printing: { priorYear: true },
    rows,
    totals: {
      qty: 6,
      netSales: 800,
      cogs: 460,
      grossProfit: 340,
      unitsOnHand: 17,
      inventoryUnitCost: 15.88,
      onHandAtCost: 270,
      gpPct: 42.5,
      turns: 20,
      roiPct: 14.8,
      onOrderQty: 6,
      onOrderUnitCost: 30,
      onOrderCost: 180,
      priorYearQty: 4,
      priorYearNetSales: 400,
      pyPctChange: 100,
      priorYearGrossProfit: 170,
      pyGrossProfitPctChange: 100,
      priorYearOnHandAtCost: 170,
      pyOnHandPctChange: 58.8,
    },
    periodDays: 30,
    turnsRoiAnnualizer: 12,
    attributeDimensions: [
      { code: 'color', label: 'Color', isMultiValue: false, sortOrder: 10 },
    ],
  };
}

describe('sales analysis hierarchy export builder', () => {
  it('exports hierarchy rows with subtotals, parent percentages, and a grand total', () => {
    const out = buildSalesAnalysisHierarchyExport(report(), {
      levels: ['department', 'category'],
      groupOrder: 'NET_SALES_DESC',
      showPercentOfTotal: true,
      includeOnOrder: true,
      priorYear: true,
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    });

    expect(out.csvHeader.slice(0, 2)).toEqual(['row_type', 'level']);
    expect(out.rows[0]).toMatchObject({ rowType: 'group', level: 1, label: '8 - Clothing', netSales: 500 });

    const shoes = out.rows.find((r) => r.rowType === 'group' && r.label === '5 - Shoes')!;
    expect(shoes).toMatchObject({
      qty: 3,
      netSales: 300,
      cogs: 160,
      grossProfit: 140,
      gpPct: 46.7,
      onOrderQty: 6,
      onOrderUnitCost: 30,
      onOrderCost: 180,
      pyPctChange: 100,
    });
    expect(shoes.qtyPctOfParent).toBe(50);

    const blackSku = out.rows.find((r) => r.rowType === 'detail' && r.sku === '6608-BKPU')!;
    expect(blackSku).toMatchObject({
      hierarchy1: '5 - Shoes',
      hierarchy2: '216 - Sneakers',
      netSalesPctOfParent: 100,
    });

    const grand = out.rows[out.rows.length - 1]!;
    expect(grand).toMatchObject({
      rowType: 'grand_total',
      label: 'Grand Total',
      netSales: 800,
      onHandAtCostPctOfParent: 100,
    });
  });

  it('supports a 3-level attribute hierarchy and workbook metadata sheets', () => {
    const out = buildSalesAnalysisHierarchyExport(report(), {
      levels: ['department', 'category', 'attribute'],
      groupOrder: 'LEFT_GROUP_ASC',
      attributeDimensionCode: 'color',
      showPercentOfTotal: false,
    });

    expect(out.rows[0]).toMatchObject({ rowType: 'group', label: '5 - Shoes' });
    expect(out.rows.some((row) => row.rowType === 'group' && row.level === 3 && row.label === 'Black')).toBe(true);
    expect(out.columns.map((column) => column.header)).toContain('3. Color');
    expect(out.xlsxSheets.map((sheet) => sheet.name)).toEqual(['Sales Analysis', 'Raw Detail', 'Run Info']);
  });

  it('rejects invalid hierarchy level combinations', () => {
    expect(validateSalesAnalysisHierarchyLevels(['attribute', 'category'])).toMatch(/deepest/);
    expect(validateSalesAnalysisHierarchyLevels(['department', 'category', 'category'])).toMatch(/unique/);
    expect(validateSalesAnalysisHierarchyLevels(['department', 'category', 'attribute'])).toBeNull();
  });
});
