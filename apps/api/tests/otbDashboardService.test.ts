jest.mock('../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

import { prisma } from '../src/db/prisma';
import {
  getOtbDashboardSummary,
  listOtbDashboardPlans,
  listOtbDashboardRows,
} from '../src/services/otbDashboardService';

const queryRawUnsafe = prisma.$queryRawUnsafe as jest.Mock;
const PLAN_ID = '11111111-1111-1111-1111-111111111111';

describe('OTB dashboard service', () => {
  beforeEach(() => {
    queryRawUnsafe.mockReset();
  });

  it('maps non-archived saved plans for the dashboard picker', async () => {
    queryRawUnsafe.mockResolvedValueOnce([
      {
        id: PLAN_ID,
        label: 'Enterprise May Workbook',
        status: 'draft',
        planningScope: 'enterprise',
        scopeLabel: null,
        storeGroupCode: null,
        storeGroupLabel: null,
        season: 'summer',
        seasonYear: 2026,
        seasonMonths: ['2026-05', '2026-06'],
        selectedDepartments: [13, 14],
        rowCount: '4',
        plannedBuyUnits: '300',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        updatedAt: new Date('2026-05-02T00:00:00.000Z'),
      },
    ]);

    const plans = await listOtbDashboardPlans();

    expect(queryRawUnsafe.mock.calls[0][0]).toContain('FROM app.purchase_plan p');
    expect(queryRawUnsafe.mock.calls[0][0]).toContain("COALESCE(p.status, 'draft') <> 'archived'");
    expect(plans[0]).toMatchObject({
      id: PLAN_ID,
      planningScope: 'enterprise',
      planningScopeLabel: 'Enterprise-wide',
      storeGroupCode: 'enterprise',
      selectedDepartments: [13, 14],
      rowCount: 4,
      plannedBuyUnits: 300,
    });
  });

  it('aggregates summary totals and monthly trend from purchase-plan rows', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([{ id: PLAN_ID, status: 'draft', archivedAt: null }])
      .mockResolvedValueOnce([
        {
          periodLabel: '2026-05',
          plannedBuyUnits: '100',
          projectedSalesUnits: '70',
          committedUnits: '40',
          stockPositionUnits: '200',
          openToBuyUnits: '60',
          rowCount: '1',
        },
        {
          periodLabel: '2026-06',
          plannedBuyUnits: '250',
          projectedSalesUnits: '160',
          committedUnits: '90',
          stockPositionUnits: '180',
          openToBuyUnits: '160',
          rowCount: '2',
        },
      ]);

    const summary = await getOtbDashboardSummary({ planId: PLAN_ID, year: 2026, departmentNumber: 13 });

    const summarySql = queryRawUnsafe.mock.calls[1][0] as string;
    expect(summarySql).toContain('SUM(r.current_buy)');
    expect(summarySql).toContain('COALESCE(r.current_on_order, 0) + COALESCE(r.future_on_order, 0) + COALESCE(r.native_open_po, 0)');
    expect(queryRawUnsafe.mock.calls[1].slice(1)).toEqual([PLAN_ID, 2026, 13]);
    expect(summary.totals).toEqual({
      plannedBuyUnits: 350,
      projectedSalesUnits: 230,
      committedUnits: 130,
      stockPositionUnits: 380,
      openToBuyUnits: 220,
      rowCount: 3,
    });
    expect(summary.trend.map((point) => point.periodLabel)).toEqual(['2026-05', '2026-06']);
  });

  it('returns paginated dashboard rows with sort whitelisting and derived unit fields', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([{ id: PLAN_ID, status: 'draft', archivedAt: null }])
      .mockResolvedValueOnce([{ totalItems: '1' }])
      .mockResolvedValueOnce([
        {
          id: 'row-1',
          planId: PLAN_ID,
          planLabel: 'May Plan',
          planningScope: 'store_group',
          scopeLabel: 'Magic Shoes',
          storeGroupCode: 'magic',
          storeGroupLabel: 'Magic Shoes',
          departmentKey: '13',
          departmentNumber: 13,
          departmentLabel: 'ZAPATO MARCA HOMBRE',
          yearMonth: '2026-05',
          plannedBuyUnits: '100',
          projectedSalesUnits: '70',
          currentOnOrderUnits: '10',
          futureOnOrderUnits: '15',
          nativeOpenPoUnits: '5',
          committedUnits: '30',
          stockPositionUnits: '200',
          openToBuyUnits: '70',
        },
      ]);

    const result = await listOtbDashboardRows({
      planId: PLAN_ID,
      year: 2026,
      month: 5,
      page: 2,
      pageSize: 25,
      sort: 'committedUnits',
      order: 'desc',
    });

    const rowsSql = queryRawUnsafe.mock.calls[2][0] as string;
    expect(rowsSql).toContain('ORDER BY (COALESCE(r.current_on_order, 0) + COALESCE(r.future_on_order, 0) + COALESCE(r.native_open_po, 0)) DESC');
    expect(queryRawUnsafe.mock.calls[2].slice(1)).toEqual([PLAN_ID, 2026, 5, 25, 25]);
    expect(result.pagination).toEqual({ page: 2, pageSize: 25, totalItems: 1, totalPages: 1 });
    expect(result.data[0]).toMatchObject({
      id: 'row-1',
      departmentNumber: 13,
      plannedBuyUnits: 100,
      committedUnits: 30,
      openToBuyUnits: 70,
    });
  });

  it('throws a typed 404 when a plan id does not exist', async () => {
    queryRawUnsafe.mockResolvedValueOnce([]);

    await expect(getOtbDashboardSummary({ planId: PLAN_ID })).rejects.toMatchObject({
      status: 404,
      code: 'PLAN_NOT_FOUND',
    });
  });
});
