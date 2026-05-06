import request from 'supertest';

jest.mock('../src/services/otbDashboardService', () => ({
  listOtbDashboardPlans: jest.fn().mockResolvedValue([
    {
      id: '11111111-1111-1111-1111-111111111111',
      label: 'May Plan',
      status: 'draft',
      seasonMonths: ['2026-05'],
    },
  ]),
  getOtbDashboardSummary: jest.fn().mockResolvedValue({
    planId: '11111111-1111-1111-1111-111111111111',
    totals: {
      plannedBuyUnits: 100,
      projectedSalesUnits: 75,
      committedUnits: 40,
      stockPositionUnits: 200,
      openToBuyUnits: 60,
      rowCount: 1,
    },
    trend: [],
    generatedAt: '2026-05-05T00:00:00.000Z',
  }),
  listOtbDashboardRows: jest.fn().mockResolvedValue({
    data: [],
    pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 1 },
  }),
  isOtbDashboardServiceError: jest.fn((err) => Boolean((err as any)?.status && (err as any)?.code)),
}));

import app from '../src/app';
import {
  getOtbDashboardSummary,
  listOtbDashboardPlans,
  listOtbDashboardRows,
} from '../src/services/otbDashboardService';

const PLAN_ID = '11111111-1111-1111-1111-111111111111';

describe('OTB dashboard routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists non-archived saved purchase plans for the picker', async () => {
    const res = await request(app).get('/api/v1/otb/dashboard/plans');

    expect(res.status).toBe(200);
    expect(listOtbDashboardPlans).toHaveBeenCalledWith({ status: 'all' });
    expect(res.body.plans[0].id).toBe(PLAN_ID);
  });

  it('returns summary aggregation with parsed filters', async () => {
    const res = await request(app)
      .get(`/api/v1/otb/dashboard/summary?planId=${PLAN_ID}&year=2026&month=5&departmentNumber=13`);

    expect(res.status).toBe(200);
    expect(getOtbDashboardSummary).toHaveBeenCalledWith({
      planId: PLAN_ID,
      year: 2026,
      month: 5,
      departmentNumber: 13,
    });
    expect(res.body.totals.openToBuyUnits).toBe(60);
  });

  it('returns paginated rows with server-table controls', async () => {
    const res = await request(app)
      .get(`/api/v1/otb/dashboard/rows?planId=${PLAN_ID}&page=2&pageSize=25&sort=plannedBuyUnits&order=desc`);

    expect(res.status).toBe(200);
    expect(listOtbDashboardRows).toHaveBeenCalledWith({
      planId: PLAN_ID,
      page: 2,
      pageSize: 25,
      sort: 'plannedBuyUnits',
      order: 'desc',
    });
  });

  it('rejects missing or invalid plan ids before hitting the service', async () => {
    const missingRes = await request(app).get('/api/v1/otb/dashboard/summary?year=2026');
    const invalidRes = await request(app).get('/api/v1/otb/dashboard/summary?planId=not-a-uuid');

    expect(missingRes.status).toBe(400);
    expect(invalidRes.status).toBe(400);
    expect(getOtbDashboardSummary).not.toHaveBeenCalled();
  });

  it('rejects row sort fields outside the whitelist', async () => {
    const res = await request(app).get(`/api/v1/otb/dashboard/rows?planId=${PLAN_ID}&sort=drop_table`);

    expect(res.status).toBe(400);
    expect(listOtbDashboardRows).not.toHaveBeenCalled();
  });

  it('surfaces service errors with their API status and code', async () => {
    jest.mocked(getOtbDashboardSummary).mockRejectedValueOnce({
      status: 404,
      code: 'PLAN_NOT_FOUND',
      message: 'Purchase plan not found.',
    });

    const res = await request(app).get(`/api/v1/otb/dashboard/summary?planId=${PLAN_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({
      code: 'PLAN_NOT_FOUND',
      message: 'Purchase plan not found.',
    });
  });
});
