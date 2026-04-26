/**
 * Integration tests for the `format=xlsx` output on every report route that
 * already supports `format=csv`. Covers the 5 report routes in
 * `reportRoutes.ts` (on-hand, sales-performance, inventory-turnover,
 * sell-through, inventory-aging) plus the 2 sales-by-day variants (the RICS
 * adapter route `/reports/rics-sales-by-day-store` and its newer sibling
 * `/reports/sales/by-day`).
 *
 * Contract: each endpoint must return
 *  - HTTP 200
 *  - Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
 *  - Content-Disposition: attachment; filename="..."
 *  - A binary buffer that `exceljs` can re-open (truthy proof it's a valid
 *    XLSX file, not a CSV / JSON blob mislabelled)
 *
 * The sales-by-day tests mock the RICS adapter so no MDBs are required.
 */

import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';

// ─────────────────────────── RICS adapter mocks (for sales-by-day) ────────
// Same pattern the existing ricsSalesReport.test.ts uses: force fs.existsSync
// to true and stub the PowerShell entry point so no MDB is needed.
jest.spyOn(fs, 'existsSync').mockImplementation(() => true);

type Rowset = unknown[];
type MockSpec = { match: (sql: string) => boolean; rows: Rowset };
let mockSpecs: MockSpec[] = [];
function setMockRows(specs: MockSpec[]): void { mockSpecs = specs; }

jest.mock('../src/services/accessOleDb', () => {
  const actual = jest.requireActual('../src/services/accessOleDb');
  return {
    ...actual,
    ricsDbPath: (f: string) => path.join('/fake', f),
    getOrRecoverPassword: () => 'fake-password',
    runPowerShellJson: <T,>(script: string): T => {
      for (const spec of mockSpecs) {
        if (spec.match(script)) return spec.rows as unknown as T;
      }
      return [] as unknown as T;
    },
    buildSelectScript: (_db: string, _pw: string, sql: string) => sql,
    buildListTablesScript: (_db: string, _pw: string) => '',
    buildListColumnsScript: (_db: string, _pw: string, _t: string) => '',
  };
});

// Supertest + app imports MUST come after the mocks above.
// eslint-disable-next-line import/first
import request from 'supertest';
// eslint-disable-next-line import/first
import app from '../src/app';
// eslint-disable-next-line import/first
import { getDb, resetDb } from '../src/db/database';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function expectXlsxHeaders(res: request.Response, filenameFragment: string): void {
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toBe(XLSX_MIME);
  expect(res.headers['content-disposition']).toContain('attachment');
  expect(res.headers['content-disposition']).toContain(filenameFragment);
}

async function assertValidXlsxBuffer(buf: Buffer): Promise<ExcelJS.Workbook> {
  expect(buf).toBeInstanceOf(Buffer);
  expect(buf.byteLength).toBeGreaterThan(0);
  // XLSX files are ZIPs — the PK\x03\x04 magic is the cheapest "is this
  // really an xlsx" check before we hand it to exceljs.
  expect(buf[0]).toBe(0x50);
  expect(buf[1]).toBe(0x4b);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  expect(wb.worksheets.length).toBeGreaterThanOrEqual(1);
  return wb;
}

// ══════════════════════════════════════════════════════════════════════════
// 1) reportRoutes.ts routes (SQLite-backed)
// ══════════════════════════════════════════════════════════════════════════

describe('reportRoutes XLSX export', () => {
  beforeEach(() => {
    resetDb();
    // Seed one SKU with on-hand stock so every report has at least one row.
    const db = getDb();
    const cat = db.prepare('SELECT id FROM ref_categories WHERE rics_code = 560').get() as { id: number };
    const brand = db.prepare('SELECT id FROM ref_brands WHERE code = ?').get('KISS') as { id: number };
    const color = db.prepare('SELECT id FROM ref_colors WHERE code = ?').get('BK') as { id: number };
    const vendorId = randomUUID();
    const skuId = randomUUID();
    const invId = randomUUID();
    db.prepare(`
      INSERT INTO vendors (id, name, payment_terms, lead_time_days)
      VALUES (?, 'XLSX Vendor', 'NET_30', 10)
    `).run(vendorId);
    db.prepare(`
      INSERT INTO skus (id, sku_code, style, price, category_id, department, vendor_id, brand_id, color_id, active)
      VALUES (?, 'XLSX-001', 'Style XLSX', 49.99, ?, 'SANDALIAS', ?, ?, ?, 1)
    `).run(skuId, cat.id, vendorId, brand.id, color.id);
    db.prepare(`
      INSERT INTO inventory (id, sku_id, quantity_on_hand, quantity_reserved)
      VALUES (?, ?, 7, 0)
    `).run(invId, skuId);
  });

  afterAll(() => { resetDb(); });

  it('GET /on-hand?format=xlsx returns a valid XLSX workbook', async () => {
    const res = await request(app).get('/api/v1/reports/on-hand?format=xlsx').buffer(true).parse(binaryParser);
    expectXlsxHeaders(res, 'on-hand-report.xlsx');
    const wb = await assertValidXlsxBuffer(res.body);
    const ws = wb.worksheets[0];
    const headerCells = ws.getRow(1).values as Array<string | undefined>;
    expect(headerCells).toContain('SKU Code');
    expect(headerCells).toContain('Quantity On Hand');
  });

  it('GET /sales-performance?format=xlsx returns a valid XLSX workbook', async () => {
    const res = await request(app)
      .get('/api/v1/reports/sales-performance?format=xlsx&startDate=2026-01-01&endDate=2026-01-31')
      .buffer(true)
      .parse(binaryParser);
    expectXlsxHeaders(res, 'sales-performance.xlsx');
    const wb = await assertValidXlsxBuffer(res.body);
    const ws = wb.worksheets[0];
    const headerCells = ws.getRow(1).values as Array<string | undefined>;
    expect(headerCells).toContain('Revenue');
  });

  it('GET /inventory-turnover?format=xlsx returns a valid XLSX workbook', async () => {
    const res = await request(app).get('/api/v1/reports/inventory-turnover?format=xlsx').buffer(true).parse(binaryParser);
    expectXlsxHeaders(res, 'inventory-turnover-report.xlsx');
    const wb = await assertValidXlsxBuffer(res.body);
    const ws = wb.worksheets[0];
    const headerCells = ws.getRow(1).values as Array<string | undefined>;
    expect(headerCells).toContain('Turnover Ratio');
  });

  // Sell-through reads against the real `app.*` data (sales_history_ticket*,
  // purchase_order_legacy*) — an unfiltered export scans millions of rows and
  // genuinely needs a wider window than the Jest 5s default.
  it('GET /sell-through?format=xlsx returns a valid XLSX workbook', async () => {
    const res = await request(app).get('/api/v1/reports/sell-through?format=xlsx').buffer(true).parse(binaryParser);
    expectXlsxHeaders(res, 'sell-through-report.xlsx');
    const wb = await assertValidXlsxBuffer(res.body);
    const ws = wb.worksheets[0];
    const headerCells = ws.getRow(1).values as Array<string | undefined>;
    expect(headerCells).toContain('Sell-Through %');
  }, 60_000);

  it('GET /inventory-aging?format=xlsx returns a valid XLSX workbook', async () => {
    const res = await request(app).get('/api/v1/reports/inventory-aging?format=xlsx').buffer(true).parse(binaryParser);
    expectXlsxHeaders(res, 'inventory-aging-report.xlsx');
    const wb = await assertValidXlsxBuffer(res.body);
    const ws = wb.worksheets[0];
    const headerCells = ws.getRow(1).values as Array<string | undefined>;
    expect(headerCells).toContain('Aging Bucket');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2) Sales-by-day routes (RICS-adapter-backed, MDBs mocked)
// ══════════════════════════════════════════════════════════════════════════

const STORE_ROWS = [
  { Number: 2, Desc: 'UNLIMITED C. 2000' },
  { Number: 13, Desc: 'TEST STORE 13' },
];

function dateMs(isoDate: string, hour = 12): string {
  return `/Date(${Date.UTC(
    Number(isoDate.slice(0, 4)),
    Number(isoDate.slice(5, 7)) - 1,
    Number(isoDate.slice(8, 10)),
    hour,
  )})/`;
}

function ticketLine(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    H_Store: 2,
    H_Ticket: 100,
    H_RealDate: dateMs('2024-11-04', 10),
    H_Cashier: 'PONK',
    H_Posted: 'Y',
    D_SKU: 'SKU-A',
    D_Column: '090',
    D_Row: 'M',
    D_Qty: 1,
    D_Extension: 100,
    D_Perks: 0,
    D_SalesPerson: 'GAMU',
    D_Category: 560,
    D_Vendor: 'VEND',
    D_Cost: 40,
    D_ReturnCode: 0,
    D_RealPrice: 100,
    ...overrides,
  };
}

describe('sales-by-day XLSX export', () => {
  let originalSource: string | undefined;

  beforeAll(() => {
    originalSource = process.env.SALES_SOURCE;
    process.env.SALES_SOURCE = 'rics';
  });

  afterAll(() => {
    if (originalSource === undefined) delete process.env.SALES_SOURCE;
    else process.env.SALES_SOURCE = originalSource;
  });

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const adapter = require('../src/services/salesReporting/ricsSalesReportAdapter');
    adapter.clearCache();
    setMockRows([
      { match: (sql) => sql.includes('FROM [StoreMaster]'), rows: STORE_ROWS },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [
          ticketLine({ H_RealDate: dateMs('2024-11-04'), D_Extension: 100 }),
          ticketLine({ H_RealDate: dateMs('2024-11-05'), D_Extension: 200 }),
        ],
      },
    ]);
  });

  it('GET /rics-sales-by-day-store?format=xlsx returns a valid XLSX workbook with Weekly Totals row', async () => {
    const res = await request(app)
      .get('/api/v1/reports/rics-sales-by-day-store?store=2&startDate=2024-11-04&endDate=2024-11-10&format=xlsx')
      .buffer(true)
      .parse(binaryParser);
    expectXlsxHeaders(res, 'rics-sales-by-day-store-2-2024-11-04-to-2024-11-10.xlsx');
    const wb = await assertValidXlsxBuffer(res.body);
    const ws = wb.worksheets[0];
    const headerCells = ws.getRow(1).values as Array<string | undefined>;
    expect(headerCells).toContain('Net Sales');
    expect(headerCells).toContain('% Change');
    // 1 header + 7 date rows + 1 Weekly Totals row = 9.
    expect(ws.rowCount).toBe(9);
    const totalsRow = ws.getRow(9).values as Array<unknown>;
    expect(totalsRow).toContain('Weekly Totals');
  });

  it('GET /sales/by-day?format=xlsx returns a valid XLSX workbook', async () => {
    const res = await request(app)
      .get('/api/v1/reports/sales/by-day?stores=2&startDate=2024-11-04&endDate=2024-11-10&format=xlsx')
      .buffer(true)
      .parse(binaryParser);
    expectXlsxHeaders(res, 'sales-by-day-2-2024-11-04-to-2024-11-10.xlsx');
    const wb = await assertValidXlsxBuffer(res.body);
    const ws = wb.worksheets[0];
    const headerCells = ws.getRow(1).values as Array<string | undefined>;
    expect(headerCells).toContain('Net Sales');
    expect(headerCells).toContain('Compared Profit');
    expect(headerCells).toContain('Profit Change');
  });
});

// ─────────────────────────── supertest binary parser ──────────────────────
//
// supertest's default parser treats the response as text. For binary
// downloads we need to accumulate the raw bytes into a Buffer and expose
// that as `res.body`.
function binaryParser(res: any, cb: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}
