import express from 'express';
import request from 'supertest';
import assortmentPlanningRoutes from '../src/routes/assortmentPlanningRoutes';
import {
  commitAssortmentWave,
  createAssortmentPlan,
  createAssortmentTransferDrafts,
  getAssortmentPlan,
  listAssortmentPlans,
  previewAssortmentPlan,
} from '../src/services/assortmentPlanningService';

jest.mock('../src/services/assortmentPlanningService', () => ({
  previewAssortmentPlan: jest.fn(),
  createAssortmentPlan: jest.fn(),
  getAssortmentPlan: jest.fn(),
  listAssortmentPlans: jest.fn(),
  createAssortmentTransferDrafts: jest.fn(),
  commitAssortmentWave: jest.fn(),
  isAssortmentPlanningServiceError: (err: unknown) =>
    Boolean((err as { isAssortmentPlanningServiceError?: boolean })?.isAssortmentPlanningServiceError),
}));

const service = {
  previewAssortmentPlan: previewAssortmentPlan as jest.Mock,
  createAssortmentPlan: createAssortmentPlan as jest.Mock,
  getAssortmentPlan: getAssortmentPlan as jest.Mock,
  listAssortmentPlans: listAssortmentPlans as jest.Mock,
  createAssortmentTransferDrafts: createAssortmentTransferDrafts as jest.Mock,
  commitAssortmentWave: commitAssortmentWave as jest.Mock,
};

function app() {
  const server = express();
  server.use(express.json());
  server.use('/api/v1/assortment-planning', assortmentPlanningRoutes);
  return server;
}

function report() {
  return {
    categoryNumber: 71,
    categoryLabel: '71 - Corbatas de hombre',
    warehouseStoreId: 99,
    warehouseStoreLabel: '99 - BODEGA GENERAL',
    targetStores: [],
    startDate: '2026-05-06',
    horizonMonths: 12,
    highSeasonMonths: [6, 11, 12],
    historyFromYearMonth: '2025-01',
    historyToYearMonth: '2025-12',
    pool: [],
    colorMix: [],
    waves: [],
    totals: {
      poolSkuCount: 27,
      poolUnits: 2287,
      plannedReleaseUnits: 540,
      reserveUnits: 1747,
      waveCount: 14,
      targetStoreCount: 0,
      transferDraftCount: 0,
      committedWaveCount: 0,
    },
    warnings: [],
    generatedAt: '2026-05-06T00:00:00.000Z',
  };
}

describe('assortment planning routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('previews a plan', async () => {
    service.previewAssortmentPlan.mockResolvedValue(report());
    const res = await request(app())
      .post('/api/v1/assortment-planning/preview')
      .send({ categoryNumber: 71, warehouseStoreId: 99 });

    expect(res.status).toBe(200);
    expect(res.body.totals.poolSkuCount).toBe(27);
    expect(service.previewAssortmentPlan).toHaveBeenCalledWith({ categoryNumber: 71, warehouseStoreId: 99 });
  });

  it('saves a plan', async () => {
    service.createAssortmentPlan.mockResolvedValue({ ...report(), plan: { id: 'plan-1' } });
    const res = await request(app())
      .post('/api/v1/assortment-planning/plans')
      .send({ categoryNumber: 71, label: 'Category 71 May' });

    expect(res.status).toBe(201);
    expect(res.body.plan.id).toBe('plan-1');
    expect(service.createAssortmentPlan).toHaveBeenCalledWith({ categoryNumber: 71, label: 'Category 71 May' }, null);
  });

  it('lists and loads saved plans', async () => {
    service.listAssortmentPlans.mockResolvedValue([{ id: 'plan-1', label: 'A' }]);
    service.getAssortmentPlan.mockResolvedValue({ ...report(), plan: { id: 'plan-1' } });

    const list = await request(app()).get('/api/v1/assortment-planning/plans?status=ACTIVE');
    const detail = await request(app()).get('/api/v1/assortment-planning/plans/plan-1');

    expect(list.status).toBe(200);
    expect(list.body.plans).toHaveLength(1);
    expect(service.listAssortmentPlans).toHaveBeenCalledWith({ status: 'ACTIVE' });
    expect(detail.status).toBe(200);
    expect(detail.body.plan.id).toBe('plan-1');
  });

  it('creates transfer drafts and commits a wave', async () => {
    service.createAssortmentTransferDrafts.mockResolvedValue({ ...report(), totals: { ...report().totals, transferDraftCount: 2 } });
    service.commitAssortmentWave.mockResolvedValue({ ...report(), totals: { ...report().totals, committedWaveCount: 1 } });

    const drafts = await request(app()).post('/api/v1/assortment-planning/plans/plan-1/waves/wave-1/create-transfer-drafts');
    const commit = await request(app()).post('/api/v1/assortment-planning/plans/plan-1/waves/wave-1/commit');

    expect(drafts.status).toBe(200);
    expect(drafts.body.totals.transferDraftCount).toBe(2);
    expect(service.createAssortmentTransferDrafts).toHaveBeenCalledWith('plan-1', 'wave-1', 'system');
    expect(commit.status).toBe(200);
    expect(commit.body.totals.committedWaveCount).toBe(1);
    expect(service.commitAssortmentWave).toHaveBeenCalledWith('plan-1', 'wave-1', 'system');
  });

  it('maps warehouse stock conflicts from the service', async () => {
    service.createAssortmentTransferDrafts.mockRejectedValue({
      isAssortmentPlanningServiceError: true,
      status: 409,
      code: 'WAREHOUSE_STOCK_CONFLICT',
      message: 'Warehouse stock changed.',
    });

    const res = await request(app()).post('/api/v1/assortment-planning/plans/plan-1/waves/wave-1/create-transfer-drafts');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WAREHOUSE_STOCK_CONFLICT');
  });

  it('rejects invalid preview payloads', async () => {
    const res = await request(app())
      .post('/api/v1/assortment-planning/preview')
      .send({ categoryNumber: '71' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(service.previewAssortmentPlan).not.toHaveBeenCalled();
  });
});
