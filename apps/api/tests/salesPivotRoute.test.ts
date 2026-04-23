/**
 * Route tests for `GET /api/v1/reports/sales/sales-pivot`.
 *
 * Both adapters are mocked at the module boundary so the route → facade pipe
 * runs without any rics_mirror/app schema dependency. The facade's dispatch
 * on `variant` is exercised directly.
 */

jest.mock('../src/services/salesReporting/ricsSalesPivotAdapter', () => ({
  getSalesPivotByDepartment: jest.fn(),
}));
jest.mock('../src/services/salesReporting/ricsSalesPivotByBuyerAdapter', () => ({
  getSalesPivotByBuyer: jest.fn(),
}));

jest.mock('../src/services/salesReporting/ricsSalesReportAdapter', () => {
  const actual = jest.requireActual('../src/services/salesReporting/ricsSalesReportAdapter');
  return {
    ...actual,
    listSalesDimensions: jest.fn().mockResolvedValue({ stores: [], categories: [], groups: [] }),
  };
});

import request from 'supertest';
import type { SalesPivotReport, SalesPivotVariant } from '../src/services/salesReporting/types';

function emptyReport(variant: SalesPivotVariant, overrides: Partial<SalesPivotReport> = {}): SalesPivotReport {
  return {
    variant,
    startDate: '2026-04-01',
    endDate: '2026-04-22',
    currentYear: 2026,
    priorYear: 2025,
    storeNumbers: [],
    rows: [],
    totals: {
      onHandQty: 0, onHandCostVal: 0,
      qtyTY: 0, netSalesTY: 0, profitTY: 0,
      qtyLY: 0, netSalesLY: 0, profitLY: 0,
    },
    ...overrides,
  };
}

function setDeptAdapterReport(report: SalesPivotReport): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const adapter = require('../src/services/salesReporting/ricsSalesPivotAdapter');
  (adapter.getSalesPivotByDepartment as jest.Mock).mockReset();
  (adapter.getSalesPivotByDepartment as jest.Mock).mockResolvedValue(report);
}
function setBuyerAdapterReport(report: SalesPivotReport): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const adapter = require('../src/services/salesReporting/ricsSalesPivotByBuyerAdapter');
  (adapter.getSalesPivotByBuyer as jest.Mock).mockReset();
  (adapter.getSalesPivotByBuyer as jest.Mock).mockResolvedValue(report);
}
function getDeptAdapterMock(): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const adapter = require('../src/services/salesReporting/ricsSalesPivotAdapter');
  return adapter.getSalesPivotByDepartment as jest.Mock;
}
function getBuyerAdapterMock(): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const adapter = require('../src/services/salesReporting/ricsSalesPivotByBuyerAdapter');
  return adapter.getSalesPivotByBuyer as jest.Mock;
}

describe('GET /api/v1/reports/sales/sales-pivot', () => {
  const ORIGINAL_SOURCE = process.env.SALES_SOURCE;
  let app: any;

  beforeAll(async () => {
    process.env.SALES_SOURCE = 'rics';
    jest.resetModules();
    app = (await import('../src/app')).default;
  });

  afterAll(() => {
    if (ORIGINAL_SOURCE === undefined) delete process.env.SALES_SOURCE;
    else process.env.SALES_SOURCE = ORIGINAL_SOURCE;
  });

  it('defaults to the department variant when none is passed', async () => {
    setDeptAdapterReport(emptyReport('department'));
    const res = await request(app).get(
      '/api/v1/reports/sales/sales-pivot?startDate=2026-04-01&endDate=2026-04-22',
    );
    expect(res.status).toBe(200);
    expect(res.body.variant).toBe('department');
    const call = getDeptAdapterMock().mock.calls.at(-1)?.[0];
    expect(call).toMatchObject({ separateStore: false });
  });

  it('dispatches to the department adapter with separateStore=true for department-separate-store', async () => {
    setDeptAdapterReport(emptyReport('department-separate-store'));
    const res = await request(app).get(
      '/api/v1/reports/sales/sales-pivot?startDate=2026-04-01&endDate=2026-04-22&variant=department-separate-store',
    );
    expect(res.status).toBe(200);
    const call = getDeptAdapterMock().mock.calls.at(-1)?.[0];
    expect(call).toMatchObject({ separateStore: true });
    expect(getBuyerAdapterMock()).not.toHaveBeenCalled();
  });

  it('dispatches to the buyer adapter when variant=buyer', async () => {
    setBuyerAdapterReport(emptyReport('buyer'));
    const res = await request(app).get(
      '/api/v1/reports/sales/sales-pivot?startDate=2026-04-01&endDate=2026-04-22&variant=buyer',
    );
    expect(res.status).toBe(200);
    expect(res.body.variant).toBe('buyer');
    const call = getBuyerAdapterMock().mock.calls.at(-1)?.[0];
    expect(call).toMatchObject({ startDate: '2026-04-01', endDate: '2026-04-22' });
  });

  it('rejects an unknown variant with 400', async () => {
    const res = await request(app).get(
      '/api/v1/reports/sales/sales-pivot?startDate=2026-04-01&endDate=2026-04-22&variant=nonsense',
    );
    expect(res.status).toBe(400);
  });

  it('rejects startDate > endDate with 400', async () => {
    setDeptAdapterReport(emptyReport('department'));
    const res = await request(app).get(
      '/api/v1/reports/sales/sales-pivot?startDate=2026-04-30&endDate=2026-04-01',
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a malformed date', async () => {
    const res = await request(app).get(
      '/api/v1/reports/sales/sales-pivot?startDate=04-01-2026&endDate=2026-04-22',
    );
    expect(res.status).toBe(400);
  });

  it('forwards the stores filter to the selected adapter', async () => {
    setDeptAdapterReport(emptyReport('department'));
    await request(app).get(
      '/api/v1/reports/sales/sales-pivot?startDate=2026-04-01&endDate=2026-04-22&stores=2,13',
    );
    const call = getDeptAdapterMock().mock.calls.at(-1)?.[0];
    expect(call).toMatchObject({
      startDate: '2026-04-01',
      endDate: '2026-04-22',
      storeNumbers: [2, 13],
    });
  });

  it('returns a department CSV with YoY-labeled headers', async () => {
    setDeptAdapterReport(emptyReport('department', {
      rows: [
        {
          storeNumber: null, storeName: null,
          buyerCode: null, buyerLabel: null,
          vendorCode: null, vendorLabel: null,
          sector: 1, sectorDesc: 'APPAREL',
          dept: 10, deptDesc: 'MENS',
          categ: 556, categDesc: 'SHIRTS',
          sku: 'SKU-A', skuDescription: 'Blue shirt',
          onHandQty: 12, onHandCostVal: 240.5,
          qtyTY: 3, netSalesTY: 180.25, profitTY: 60.5,
          qtyLY: 2, netSalesLY: 120, profitLY: 40,
        },
      ],
    }));
    const res = await request(app).get(
      '/api/v1/reports/sales/sales-pivot?startDate=2026-04-01&endDate=2026-04-22&format=csv',
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const body = res.text;
    expect(body).toContain('Sector');
    expect(body).toContain('SKU');
    expect(body).not.toContain('Store #'); // not separate-store
    expect(body).toContain('Qty 2026');
    expect(body).toContain('Profit 2025');
    expect(body).toContain('SKU-A');
  });

  it('returns a separate-store CSV with Store columns prepended', async () => {
    setDeptAdapterReport(emptyReport('department-separate-store', {
      rows: [
        {
          storeNumber: 2, storeName: 'STORE 2',
          buyerCode: null, buyerLabel: null,
          vendorCode: null, vendorLabel: null,
          sector: 1, sectorDesc: 'APPAREL',
          dept: 10, deptDesc: 'MENS',
          categ: 556, categDesc: 'SHIRTS',
          sku: 'SKU-A', skuDescription: 'Blue shirt',
          onHandQty: 12, onHandCostVal: 240.5,
          qtyTY: 3, netSalesTY: 180.25, profitTY: 60.5,
          qtyLY: 2, netSalesLY: 120, profitLY: 40,
        },
      ],
    }));
    const res = await request(app).get(
      '/api/v1/reports/sales/sales-pivot?startDate=2026-04-01&endDate=2026-04-22&variant=department-separate-store&format=csv',
    );
    expect(res.status).toBe(200);
    const body = res.text;
    expect(body).toContain('Store #');
    expect(body).toContain('STORE 2');
    expect(body).toContain('SKU-A');
  });

  it('dispatches to the buyer adapter when variant=buyer-vendor', async () => {
    setBuyerAdapterReport(emptyReport('buyer-vendor'));
    const res = await request(app).get(
      '/api/v1/reports/sales/sales-pivot?startDate=2026-04-01&endDate=2026-04-22&variant=buyer-vendor',
    );
    expect(res.status).toBe(200);
    expect(res.body.variant).toBe('buyer-vendor');
    const call = getBuyerAdapterMock().mock.calls.at(-1)?.[0];
    expect(call).toMatchObject({ variant: 'buyer-vendor' });
  });

  it('dispatches to the buyer adapter when variant=buyer-vendor-separate-store', async () => {
    setBuyerAdapterReport(emptyReport('buyer-vendor-separate-store'));
    const res = await request(app).get(
      '/api/v1/reports/sales/sales-pivot?startDate=2026-04-01&endDate=2026-04-22&variant=buyer-vendor-separate-store',
    );
    expect(res.status).toBe(200);
    expect(res.body.variant).toBe('buyer-vendor-separate-store');
    const call = getBuyerAdapterMock().mock.calls.at(-1)?.[0];
    expect(call).toMatchObject({ variant: 'buyer-vendor-separate-store' });
    expect(getDeptAdapterMock()).not.toHaveBeenCalled();
  });

  it('returns a buyer-vendor CSV with Buyer + Vendor + SKU columns (no Store)', async () => {
    setBuyerAdapterReport(emptyReport('buyer-vendor', {
      rows: [
        {
          storeNumber: null, storeName: null,
          buyerCode: 'zb', buyerLabel: 'Zacarias Bendeck',
          vendorCode: 'NIKE', vendorLabel: 'Nike Inc.',
          sector: null, sectorDesc: null,
          dept: 10, deptDesc: 'MENS',
          categ: 556, categDesc: 'SHIRTS',
          sku: 'SKU-A', skuDescription: 'Blue shirt',
          onHandQty: 12, onHandCostVal: 240.5,
          qtyTY: 3, netSalesTY: 180.25, profitTY: 60.5,
          qtyLY: 2, netSalesLY: 120, profitLY: 40,
        },
      ],
    }));
    const res = await request(app).get(
      '/api/v1/reports/sales/sales-pivot?startDate=2026-04-01&endDate=2026-04-22&variant=buyer-vendor&format=csv',
    );
    expect(res.status).toBe(200);
    const body = res.text;
    expect(body).toContain('Buyer Code');
    expect(body).toContain('Vendor Code');
    expect(body).not.toContain('Store #');
    expect(body).toContain('NIKE');
    expect(body).toContain('Nike Inc.');
    expect(body).toContain('Blue shirt');
  });

  it('returns a buyer-vendor-separate-store CSV with Store columns prepended', async () => {
    setBuyerAdapterReport(emptyReport('buyer-vendor-separate-store', {
      rows: [
        {
          storeNumber: 2, storeName: 'STORE 2',
          buyerCode: 'zb', buyerLabel: 'Zacarias Bendeck',
          vendorCode: 'NIKE', vendorLabel: 'Nike Inc.',
          sector: null, sectorDesc: null,
          dept: 10, deptDesc: 'MENS',
          categ: 556, categDesc: 'SHIRTS',
          sku: 'SKU-A', skuDescription: 'Blue shirt',
          onHandQty: 12, onHandCostVal: 240.5,
          qtyTY: 3, netSalesTY: 180.25, profitTY: 60.5,
          qtyLY: 2, netSalesLY: 120, profitLY: 40,
        },
      ],
    }));
    const res = await request(app).get(
      '/api/v1/reports/sales/sales-pivot?startDate=2026-04-01&endDate=2026-04-22&variant=buyer-vendor-separate-store&format=csv',
    );
    expect(res.status).toBe(200);
    const body = res.text;
    expect(body).toContain('Store #');
    expect(body).toContain('STORE 2');
    expect(body).toContain('NIKE');
    expect(body).toContain('SKU-A');
  });

  it('returns a buyer CSV with buyer + SKU columns', async () => {
    setBuyerAdapterReport(emptyReport('buyer', {
      rows: [
        {
          storeNumber: null, storeName: null,
          buyerCode: 'zb', buyerLabel: 'Zacarias Bendeck',
          vendorCode: null, vendorLabel: null,
          sector: null, sectorDesc: null,
          dept: 10, deptDesc: 'MENS',
          categ: 556, categDesc: 'SHIRTS',
          sku: 'SKU-A', skuDescription: 'Blue shirt',
          onHandQty: 12, onHandCostVal: 240.5,
          qtyTY: 3, netSalesTY: 180.25, profitTY: 60.5,
          qtyLY: 2, netSalesLY: 120, profitLY: 40,
        },
      ],
    }));
    const res = await request(app).get(
      '/api/v1/reports/sales/sales-pivot?startDate=2026-04-01&endDate=2026-04-22&variant=buyer&format=csv',
    );
    expect(res.status).toBe(200);
    const body = res.text;
    expect(body).toContain('Buyer Code');
    expect(body).not.toContain('Sector');
    expect(body).toContain('zb');
    expect(body).toContain('Blue shirt');
  });
});
