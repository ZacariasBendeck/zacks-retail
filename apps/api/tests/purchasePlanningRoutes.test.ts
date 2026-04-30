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
  comparePurchasePlan: jest.fn().mockResolvedValue({ plan: { id: 'plan-1' }, departments: [], totals: {} }),
  archivePurchasePlan: jest.fn().mockResolvedValue({ plan: { id: 'plan-1' }, departments: [], adjustments: [], totals: {} }),
  generateSeasonalPurchaseReport: jest.fn().mockResolvedValue({
    storeGroupCode: 'all-stores',
    storeGroupLabel: 'All Stores',
    departmentNumber: 4,
    departmentLabel: '4 - Jeans',
    year: 2026,
    seasons: [],
    warnings: [],
    generatedAt: '2026-04-30T00:00:00.000Z',
  }),
  isPurchasePlanningServiceError: jest.fn().mockReturnValue(false),
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
} from '../src/services/purchasePlanning/purchasePlanningSavedService';

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

  it('lists saved plans', async () => {
    const res = await request(app).get('/api/v1/purchase-planning/plans?status=draft');

    expect(res.status).toBe(200);
    expect(listPurchasePlans).toHaveBeenCalledWith({ status: 'draft', storeGroupCode: undefined });
    expect(res.body.plans[0].id).toBe('plan-1');
  });

  it('generates a consolidated chain department seasonal report', async () => {
    const res = await request(app)
      .post('/api/v1/purchase-planning/seasonal-report')
      .send({
        storeGroupCode: 'all-stores',
        departmentNumber: 4,
        year: 2026,
        forecast: { method: 'holtWinters' },
        eohMethod: 'forward',
        coverMonths: 3,
        discountNormalization: true,
      });

    expect(res.status).toBe(200);
    expect(generateSeasonalPurchaseReport).toHaveBeenCalledWith(expect.objectContaining({
      storeGroupCode: 'all-stores',
      departmentNumber: 4,
      year: 2026,
    }));
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
});
