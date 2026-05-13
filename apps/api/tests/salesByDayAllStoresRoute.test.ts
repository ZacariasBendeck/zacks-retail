import request from 'supertest';
import { prisma } from '../src/db/prisma';
import app from '../src/app';
import { clearCache } from '../src/services/salesReporting/ricsSalesReportAdapter';

jest.mock('../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

const mockQueryRawUnsafe = prisma.$queryRawUnsafe as jest.Mock;

describe('GET /api/v1/reports/sales/by-day all stores', () => {
  let originalSalesSource: string | undefined;

  beforeAll(() => {
    originalSalesSource = process.env.SALES_SOURCE;
    process.env.SALES_SOURCE = 'rics';
  });

  afterAll(() => {
    if (originalSalesSource === undefined) delete process.env.SALES_SOURCE;
    else process.env.SALES_SOURCE = originalSalesSource;
  });

  beforeEach(() => {
    clearCache();
    mockQueryRawUnsafe.mockReset();
    mockQueryRawUnsafe.mockImplementation((sql: string, startDate?: string, _endDate?: string, _storeNumbers?: number[]) => {
      if (sql.includes('FROM app.store_master')) {
        return Promise.resolve([
          { Number: 2, Desc: 'UNLIMITED C. 2000' },
          { Number: 13, Desc: 'UNLIMITED MIRAFLORES' },
        ]);
      }

      if (sql.includes('FROM app.sales_history_ticket')) {
        if (startDate === '2024-11-04') {
          return Promise.resolve([
            { d: '2024-11-04', store: 2, ticket_count: 2, net_sales: 100, profit: 60 },
            { d: '2024-11-04', store: 13, ticket_count: 1, net_sales: 50, profit: 30 },
          ]);
        }
        if (startDate === '2023-11-06') {
          return Promise.resolve([
            { d: '2023-11-06', store: 2, ticket_count: 1, net_sales: 75, profit: 40 },
            { d: '2023-11-06', store: 13, ticket_count: 1, net_sales: 25, profit: 10 },
          ]);
        }
        return Promise.resolve([]);
      }

      return Promise.resolve([]);
    });
  });

  it('resolves omitted stores to the store master list instead of returning a blank report', async () => {
    const res = await request(app).get(
      '/api/v1/reports/sales/by-day?startDate=2024-11-04&endDate=2024-11-10&comparisonOffsetDays=364&combineStores=true',
    );

    expect(res.status).toBe(200);
    expect(res.body.storeNumbers).toEqual([2, 13]);
    expect(res.body.storeBreakdowns).toHaveLength(2);
    expect(res.body.combined).toMatchObject({
      storeLabel: 'Combined (2 stores)',
      totals: {
        ticketCount: 3,
        netSales: 150,
        avgTicket: 50,
        profit: 90,
        comparedTicketCount: 2,
        comparedNetSales: 100,
        comparedAvgTicket: 50,
        comparedProfit: 50,
        dollarChange: 50,
        profitChange: 40,
        pctChange: 50,
        profitPctChange: 80,
      },
    });
    expect(res.body.combined.rows[0]).toMatchObject({
      date: '2024-11-04',
      ticketCount: 3,
      netSales: 150,
      avgTicket: 50,
      profit: 90,
      comparedToDate: '2023-11-06',
      comparedTicketCount: 2,
      comparedNetSales: 100,
      comparedAvgTicket: 50,
      comparedProfit: 50,
    });

    const salesCalls = mockQueryRawUnsafe.mock.calls.filter(([sql]) =>
      String(sql).includes('FROM app.sales_history_ticket'),
    );
    expect(salesCalls).toHaveLength(2);
    expect(salesCalls[0][3]).toEqual([2, 13]);
    expect(salesCalls[1][3]).toEqual([2, 13]);
  });

  it('honors combineStores=false as a query string value', async () => {
    const res = await request(app).get(
      '/api/v1/reports/sales/by-day?startDate=2024-11-04&endDate=2024-11-10&comparisonOffsetDays=364&combineStores=false',
    );

    expect(res.status).toBe(200);
    expect(res.body.combineStores).toBe(false);
    expect(res.body.combined).toBeNull();
    expect(res.body.storeBreakdowns).toHaveLength(2);
    expect(res.body.storeBreakdowns.map((store: { storeNumber: number }) => store.storeNumber)).toEqual([2, 13]);
  });

  it('expands store ranges before querying sales history', async () => {
    const res = await request(app).get(
      '/api/v1/reports/sales/by-day?stores=2-3,13&startDate=2024-11-04&endDate=2024-11-10&comparisonOffsetDays=364&combineStores=true',
    );

    expect(res.status).toBe(200);
    expect(res.body.storeNumbers).toEqual([2, 3, 13]);
    const salesCalls = mockQueryRawUnsafe.mock.calls.filter(([sql]) =>
      String(sql).includes('FROM app.sales_history_ticket'),
    );
    expect(salesCalls[0][3]).toEqual([2, 3, 13]);
  });

  it('aggregates ticket header totals instead of merchandise lines for RICS parity', async () => {
    const res = await request(app).get(
      '/api/v1/reports/sales/by-day?stores=2,13&startDate=2024-11-04&endDate=2024-11-10&comparisonOffsetDays=364&combineStores=true',
    );

    expect(res.status).toBe(200);

    const salesCalls = mockQueryRawUnsafe.mock.calls.filter(([sql]) =>
      String(sql).includes('FROM app.sales_history_ticket'),
    );
    expect(salesCalls).toHaveLength(2);

    for (const [sql] of salesCalls) {
      const text = String(sql);
      expect(text).toContain('SUM(COALESCE(t.net_amount, 0))');
      expect(text).toContain('SUM(COALESCE(t.net_amount, 0) - COALESCE(t.cost_amount, 0))');
      expect(text).toContain('COUNT(*)::int AS ticket_count');
      expect(text).not.toContain('sales_history_ticket_line');
      expect(text).not.toContain("transaction_kind = 'purchase'");
    }
  });
});
