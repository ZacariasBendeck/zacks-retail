import request from 'supertest';

jest.mock('../src/services/seasonalityIndexService', () => ({
  getSeasonalityIndexReport: jest.fn().mockResolvedValue({
    basis: 'DEPARTMENT_ALL_STORES',
    generatedAt: '2026-04-29T00:00:00.000Z',
    historyStartMonth: '2025-05',
    historyEndMonth: '2026-04',
    rows: [{
      departmentNumber: 5,
      departmentLabel: '5 - Shoes',
      totalSalesQty: 1200,
      averageMonthlyQty: 100,
      sampleMonths: 12,
      months: [
        { month: 1, label: 'Jan', rawSalesQty: 100, index: 1 },
        { month: 2, label: 'Feb', rawSalesQty: 100, index: 1 },
      ],
    }],
  }),
}));

import app from '../src/app';
import { getSeasonalityIndexReport } from '../src/services/seasonalityIndexService';

describe('seasonality index route', () => {
  it('returns department all-store monthly index rows', async () => {
    const res = await request(app).get('/api/v1/reports/seasonality-index?endMonth=2026-04&department=5');

    expect(res.status).toBe(200);
    expect(getSeasonalityIndexReport).toHaveBeenCalledWith({ endMonth: '2026-04', departmentNumber: 5 });
    expect(res.body.basis).toBe('DEPARTMENT_ALL_STORES');
    expect(res.body.rows[0].departmentLabel).toBe('5 - Shoes');
    expect(res.body.rows[0].months[0]).toMatchObject({ label: 'Jan', index: 1 });
  });
});
