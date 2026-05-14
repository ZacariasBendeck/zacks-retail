import request from 'supertest';

jest.mock('../src/services/purchasePlanning/purchasePlanningSavedService', () => ({
  createPurchasePlan: jest.fn().mockResolvedValue({
    plan: { id: 'plan-1', label: 'Plan 1' },
    departments: [],
    adjustments: [],
    totals: { baselineTotalBuy: 0, currentTotalBuy: 0, deltaBuy: 0, totalProjSales: 0 },
  }),
  listPurchasePlans: jest.fn().mockResolvedValue([{ id: 'plan-1', label: 'Plan 1' }]),
  getPurchasePlan: jest.fn().mockResolvedValue({ plan: { id: 'plan-1' }, departments: [], adjustments: [], totals: {} }),
  recalculatePurchasePlan: jest.fn().mockResolvedValue({ plan: { id: 'plan-1' }, departments: [], adjustments: [], totals: {} }),
  addPurchasePlanAdjustment: jest.fn().mockResolvedValue({ plan: { id: 'plan-1' }, departments: [], adjustments: [], totals: {} }),
  updatePurchasePlanRow: jest.fn().mockResolvedValue({ plan: { id: 'plan-1' }, departments: [], adjustments: [], totals: {} }),
  updatePurchasePlanRows: jest.fn().mockResolvedValue({ plan: { id: 'plan-1' }, departments: [], adjustments: [], totals: {} }),
  comparePurchasePlan: jest.fn().mockResolvedValue({ plan: { id: 'plan-1' }, departments: [], totals: {} }),
  archivePurchasePlan: jest.fn().mockResolvedValue({ plan: { id: 'plan-1' }, departments: [], adjustments: [], totals: {} }),
  generateSeasonalPurchaseReport: jest.fn().mockResolvedValue({
    planningScope: 'enterprise',
    planningScopeLabel: 'Enterprise-wide',
    storeGroupCode: 'enterprise',
    storeGroupLabel: 'Enterprise-wide',
    storeGroupCodes: ['enterprise'],
    storeGroupLabels: ['Enterprise-wide'],
    warehouseStoreNumbers: [99],
    departmentNumber: 4,
    departmentLabel: '4 - Jeans',
    year: 2026,
    asOfYearMonth: '2026-05',
    startSeason: 'summer',
    startSeasonYear: 2026,
    endSeason: 'summer',
    endSeasonYear: 2027,
    projectionMonths: [],
    workbook: {
      storeGroupCode: 'enterprise',
      storeGroupLabel: 'Enterprise-wide',
      planId: 'plan-1',
      planLabel: 'Enterprise-wide 4 - Jeans Summer 2026 to Summer 2027',
      autoCreated: true,
      duplicateSourceCount: 1,
    },
    seasons: [],
    warnings: [],
    generatedAt: '2026-04-30T00:00:00.000Z',
  }),
  isPurchasePlanningServiceError: jest.fn().mockReturnValue(false),
}));

jest.mock('../src/services/purchasePlanning/purchasePlanningV3Service', () => ({
  createPurchasePlanV3: jest.fn().mockResolvedValue({
    plan: { id: 'v3-1', label: 'V3 Plan' },
    seasons: [],
    totals: {
      projectedSales: { units: 0 },
      baselineBuy: { units: 0 },
      warehousePlanningCredit: { units: 0 },
      recommendedBuy: { units: 0 },
      warehouseUnallocated: { units: 0 },
    },
    warnings: [],
  }),
  listPurchasePlansV3: jest.fn().mockResolvedValue([{ id: 'v3-1', label: 'V3 Plan' }]),
  getPurchasePlanV3: jest.fn().mockResolvedValue({ plan: { id: 'v3-1' }, seasons: [], totals: {}, warnings: [] }),
  archivePurchasePlanV3: jest.fn().mockResolvedValue({ plan: { id: 'v3-1' }, seasons: [], totals: {}, warnings: [] }),
  generatePurchasePlanV3Report: jest.fn().mockResolvedValue({
    storeGroups: [{ code: 'unlimited', label: 'Unlimited', storeNumbers: [1, 2] }],
    departmentNumber: 10,
    departmentLabel: '10 - Footwear',
    year: 2026,
    seasons: [],
    totals: {
      projectedSales: { units: 100 },
      baselineBuy: { units: 80 },
      warehousePlanningCredit: { units: 20 },
      recommendedBuy: { units: 60 },
      warehouseUnallocated: { units: 0 },
    },
    warnings: [],
  }),
  isPurchasePlanningV3ServiceError: jest.fn().mockReturnValue(false),
}));

import app from '../src/app';
import {
  addPurchasePlanAdjustment,
  archivePurchasePlan,
  comparePurchasePlan,
  createPurchasePlan,
  getPurchasePlan,
  generateSeasonalPurchaseReport,
  listPurchasePlans,
  recalculatePurchasePlan,
  updatePurchasePlanRow,
  updatePurchasePlanRows,
} from '../src/services/purchasePlanning/purchasePlanningSavedService';
import {
  archivePurchasePlanV3,
  createPurchasePlanV3,
  generatePurchasePlanV3Report,
  getPurchasePlanV3,
  listPurchasePlansV3,
} from '../src/services/purchasePlanning/purchasePlanningV3Service';

describe('purchase planning saved-plan routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a saved seasonal chain department plan', async () => {
    const res = await request(app)
      .post('/api/v1/purchase-planning/plans')
      .send({
        storeGroupCode: 'unlimited',
        season: 'spring',
        seasonYear: 2026,
        departmentNumbers: [5, 6],
        forecast: { method: 'holtWinters' },
        eohMethod: 'forward',
        coverMonths: 3,
        discountNormalization: true,
      });

    expect(res.status).toBe(201);
    expect(createPurchasePlan).toHaveBeenCalledWith(expect.objectContaining({
      storeGroupCode: 'unlimited',
      season: 'spring',
      seasonYear: 2026,
      departmentNumbers: [5, 6],
    }));
  });

  it('creates a saved category-dimension plan without department numbers', async () => {
    const res = await request(app)
      .post('/api/v1/purchase-planning/plans')
      .send({
        planningDimension: 'category',
        storeGroupCode: 'enterprise',
        season: 'summer',
        seasonYear: 2026,
        categoryNumbers: [262],
        forecast: { method: 'holtWinters' },
        eohMethod: 'forward',
        coverMonths: 3,
        discountNormalization: true,
      });

    expect(res.status).toBe(201);
    expect(createPurchasePlan).toHaveBeenCalledWith(expect.objectContaining({
      planningDimension: 'category',
      storeGroupCode: 'enterprise',
      departmentNumbers: [],
      categoryNumbers: [262],
    }));
  });

  it('lists saved plans', async () => {
    const res = await request(app).get('/api/v1/purchase-planning/plans?status=draft');

    expect(res.status).toBe(200);
    expect(listPurchasePlans).toHaveBeenCalledWith({ status: 'draft', storeGroupCode: undefined });
    expect(res.body.plans[0].id).toBe('plan-1');
  });

  it('generates an enterprise monthly workbook report without chain or year inputs', async () => {
    const res = await request(app)
      .post('/api/v1/purchase-planning/seasonal-report')
      .send({
        departmentNumber: 4,
        asOfYearMonth: '2026-05',
        forecast: { method: 'holtWinters' },
        eohMethod: 'forward',
        coverMonths: 3,
        discountNormalization: true,
      });

    expect(res.status).toBe(200);
    expect(generateSeasonalPurchaseReport).toHaveBeenCalledWith(expect.objectContaining({
      departmentNumber: 4,
      asOfYearMonth: '2026-05',
    }));
  });

  it('rejects seasonal report chain and year fields', async () => {
    const res = await request(app)
      .post('/api/v1/purchase-planning/seasonal-report')
      .send({
        storeGroupCodes: ['all-stores'],
        departmentNumber: 4,
        year: 2026,
        forecast: { method: 'holtWinters' },
      });

    expect(res.status).toBe(400);
    expect(generateSeasonalPurchaseReport).not.toHaveBeenCalled();
  });

  it('gets, recalculates, compares, and archives a saved plan', async () => {
    const getRes = await request(app).get('/api/v1/purchase-planning/plans/plan-1');
    expect(getRes.status).toBe(200);
    expect(getPurchasePlan).toHaveBeenCalledWith('plan-1');

    const recalcRes = await request(app)
      .post('/api/v1/purchase-planning/plans/plan-1/recalculate')
      .send({ actor: 'buyer' });
    expect(recalcRes.status).toBe(200);
    expect(recalculatePurchasePlan).toHaveBeenCalledWith('plan-1', 'buyer');

    const compareRes = await request(app).get('/api/v1/purchase-planning/plans/plan-1/compare');
    expect(compareRes.status).toBe(200);
    expect(comparePurchasePlan).toHaveBeenCalledWith('plan-1');

    const archiveRes = await request(app)
      .post('/api/v1/purchase-planning/plans/plan-1/archive')
      .send({ actor: 'buyer' });
    expect(archiveRes.status).toBe(200);
    expect(archivePurchasePlan).toHaveBeenCalledWith('plan-1', 'buyer');
  });

  it('applies audited season-total adjustments', async () => {
    const percentRes = await request(app)
      .post('/api/v1/purchase-planning/plans/plan-1/adjustments')
      .send({
        departmentKey: '5',
        kind: 'percent_lift',
        value: 12.5,
        reason: 'Season launch lift',
        appliedBy: 'buyer',
      });

    const absoluteRes = await request(app)
      .post('/api/v1/purchase-planning/plans/plan-1/adjustments')
      .send({
        departmentKey: '6',
        kind: 'absolute_total',
        value: 240,
        reason: 'Known fixture order',
        appliedBy: 'buyer',
      });

    expect(percentRes.status).toBe(201);
    expect(absoluteRes.status).toBe(201);
    expect(addPurchasePlanAdjustment).toHaveBeenNthCalledWith(1, 'plan-1', {
      departmentKey: '5',
      kind: 'percent_lift',
      value: 12.5,
      reason: 'Season launch lift',
      appliedBy: 'buyer',
    });
    expect(addPurchasePlanAdjustment).toHaveBeenNthCalledWith(2, 'plan-1', {
      departmentKey: '6',
      kind: 'absolute_total',
      value: 240,
      reason: 'Known fixture order',
      appliedBy: 'buyer',
    });
  });

  it('rejects adjustment requests without a reason', async () => {
    const res = await request(app)
      .post('/api/v1/purchase-planning/plans/plan-1/adjustments')
      .send({ departmentKey: '5', kind: 'absolute_total', value: 100 });

    expect(res.status).toBe(400);
    expect(addPurchasePlanAdjustment).not.toHaveBeenCalled();
  });

  it('updates an audited monthly row override', async () => {
    const res = await request(app)
      .patch('/api/v1/purchase-planning/plans/plan-1/rows/row-1')
      .send({
        currentProjSales: 80,
        currentEohTarget: 60,
        currentBuy: 70,
        reason: 'Buyer override for launch month',
        appliedBy: 'buyer',
      });

    expect(res.status).toBe(200);
    expect(updatePurchasePlanRow).toHaveBeenCalledWith('plan-1', 'row-1', {
      currentProjSales: 80,
      currentEohTarget: 60,
      currentBuy: 70,
      reason: 'Buyer override for launch month',
      appliedBy: 'buyer',
    });
  });

  it('updates audited worksheet row overrides in bulk', async () => {
    const res = await request(app)
      .patch('/api/v1/purchase-planning/plans/plan-1/rows')
      .send({
        rows: [
          { rowId: 'row-1', currentProjSales: 80, currentEohTarget: 60, currentBuy: 70 },
          { rowId: 'row-2', currentProjSales: 77, currentEohTarget: 72, currentBuy: 88 },
        ],
        reason: 'Worksheet edit',
        appliedBy: 'buyer',
      });

    expect(res.status).toBe(200);
    expect(updatePurchasePlanRows).toHaveBeenCalledWith('plan-1', {
      rows: [
        { rowId: 'row-1', currentProjSales: 80, currentEohTarget: 60, currentBuy: 70 },
        { rowId: 'row-2', currentProjSales: 77, currentEohTarget: 72, currentBuy: 88 },
      ],
      reason: 'Worksheet edit',
      appliedBy: 'buyer',
    });
  });

  it('rejects monthly row updates without changed values', async () => {
    const res = await request(app)
      .patch('/api/v1/purchase-planning/plans/plan-1/rows/row-1')
      .send({ reason: 'Missing values', appliedBy: 'buyer' });

    expect(res.status).toBe(400);
    expect(updatePurchasePlanRow).not.toHaveBeenCalled();
  });

  it('serves V3 report and saved-plan routes separately from V2', async () => {
    const reportRes = await request(app)
      .post('/api/v1/purchase-planning/v3/seasonal-report')
      .send({
        storeGroupCodes: ['unlimited', 'magic-shoes'],
        departmentNumber: 10,
        year: 2026,
        forecast: { method: 'holtWinters' },
        eohMethod: 'forward',
        coverMonths: 3,
        discountNormalization: true,
      });

    expect(reportRes.status).toBe(200);
    expect(generatePurchasePlanV3Report).toHaveBeenCalledWith(expect.objectContaining({
      storeGroupCodes: ['unlimited', 'magic-shoes'],
      departmentNumber: 10,
      year: 2026,
    }));

    const createRes = await request(app)
      .post('/api/v1/purchase-planning/v3/plans')
      .send({ departmentNumber: 10, year: 2026, storeGroupCodes: ['unlimited'] });
    expect(createRes.status).toBe(201);
    expect(createPurchasePlanV3).toHaveBeenCalledWith(expect.objectContaining({
      departmentNumber: 10,
      year: 2026,
      storeGroupCodes: ['unlimited'],
    }));

    const listRes = await request(app).get('/api/v1/purchase-planning/v3/plans?status=draft');
    expect(listRes.status).toBe(200);
    expect(listPurchasePlansV3).toHaveBeenCalledWith({ status: 'draft' });

    const getRes = await request(app).get('/api/v1/purchase-planning/v3/plans/v3-1');
    expect(getRes.status).toBe(200);
    expect(getPurchasePlanV3).toHaveBeenCalledWith('v3-1');

    const archiveRes = await request(app)
      .post('/api/v1/purchase-planning/v3/plans/v3-1/archive')
      .send({ actor: 'buyer' });
    expect(archiveRes.status).toBe(200);
    expect(archivePurchasePlanV3).toHaveBeenCalledWith('v3-1', 'buyer');
  });
});
