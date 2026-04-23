import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/app';
import { hashPassword } from '../src/services/employees/passwordHash';
import { PERMISSIONS } from '../src/services/employees/permissions';

const prisma = new PrismaClient();

// Focused integration test for the snapshots (runs) POST path. Live operators
// reported a 500 when clicking Save snapshot; this test pins the minimum
// happy-path payload we expect to round-trip cleanly so regressions on the
// zod schema, the service's envelope computation, or the Prisma call fail
// loudly.
const suffix = Date.now();
const OWNER_EMAIL = `rr-owner-${suffix}@example.com`;
const PW = 'test-password-123';

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PW });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'][0];
}

describe('POST /api/v1/reports/runs — snapshot capture', () => {
  let ownerCookie: string;

  beforeAll(async () => {
    const ownerRole = await prisma.role.upsert({
      where: { name: 'OWNER' },
      update: {},
      create: { name: 'OWNER', permissions: [PERMISSIONS.REPORTS_ADMIN, PERMISSIONS.REPORTS_VIEW] },
    });
    const hash = await hashPassword(PW);
    await prisma.user.create({
      data: { email: OWNER_EMAIL, passwordHash: hash, displayName: 'Snap Tester', roleId: ownerRole.id },
    });
    ownerCookie = await login(OWNER_EMAIL);
  });

  afterAll(async () => {
    await prisma.reportRun.deleteMany({ where: { user: { email: OWNER_EMAIL } } });
    await prisma.session.deleteMany({ where: { user: { email: OWNER_EMAIL } } });
    await prisma.user.deleteMany({ where: { email: OWNER_EMAIL } });
    await prisma.$disconnect();
  });

  it('accepts a realistic Sales Analysis payload and returns the envelope', async () => {
    // Mirror the shape the SaveSnapshotButton actually sends from a live
    // SalesAnalysisPage — paramsJson with a dateSpec object, resultJson with
    // the rows + totals the viewer consumes.
    const body = {
      reportType: 'sales-analysis',
      title: 'Sales Analysis — 2026-04-23 15:00',
      paramsJson: {
        dimension: 'CATEGORY',
        reportType: 'SKU_DETAIL',
        storeOption: 'COMBINE',
        dateSpec: { type: 'trailing_days', days: 7 },
        priorYear: false,
      },
      resultJson: {
        dimension: 'CATEGORY',
        reportType: 'SKU_DETAIL',
        storeOption: 'COMBINE',
        rows: [
          {
            dimensionKey: 'TRLR7812-39-BK',
            dimensionLabel: null,
            storeNumber: null,
            qty: 3,
            netSales: 450,
            cogs: 225,
            grossProfit: 225,
            gpPct: 50,
            onHandAtCost: 600,
            turns: 1.5,
            roiPct: 0.75,
            priorYearNetSales: null,
            pyPctChange: null,
          },
        ],
        totals: {
          qty: 3,
          netSales: 450,
          cogs: 225,
          grossProfit: 225,
          onHandAtCost: 600,
          gpPct: 50,
          turns: 1.5,
          roiPct: 0.75,
          priorYearNetSales: null,
        },
        periodDays: 7,
      },
      visibility: 'private',
    };
    const res = await request(app)
      .post('/api/v1/reports/runs')
      .set('Cookie', ownerCookie)
      .send(body);
    expect(res.status).toBe(201);
    expect(res.body.run.rowCount).toBe(1);
    expect(res.body.run.resultSizeBytes).toBeGreaterThan(0);
    expect(res.body.run.reportTypeVersion).toBe(1);
  });

  it('accepts a blank-string sourceTemplateId by ignoring it (not 500)', async () => {
    // Frontend occasionally passes an empty string when the URL has no
    // templateId; the zod schema treats that as invalid uuid. Matches the
    // user-visible failure — make sure it doesn't land as a 500.
    const res = await request(app)
      .post('/api/v1/reports/runs')
      .set('Cookie', ownerCookie)
      .send({
        reportType: 'sales-analysis',
        paramsJson: { foo: 'bar' },
        resultJson: { rows: [] },
        sourceTemplateId: '',
      });
    // Either 201 (if we tolerate and null it) or 400 (if zod rejects) —
    // but NOT 500. Failing loud here pins the contract.
    expect([201, 400]).toContain(res.status);
  });

  it('accepts when title is omitted entirely', async () => {
    const res = await request(app)
      .post('/api/v1/reports/runs')
      .set('Cookie', ownerCookie)
      .send({
        reportType: 'stock-status',
        paramsJson: { sortBy: 'CATEGORY' },
        resultJson: { rows: [] },
      });
    expect(res.status).toBe(201);
    expect(res.body.run.title).toBeNull();
  });

  it('rejects an unknown reportType with 400, not 500', async () => {
    const res = await request(app)
      .post('/api/v1/reports/runs')
      .set('Cookie', ownerCookie)
      .send({
        reportType: 'not-a-real-report',
        paramsJson: {},
        resultJson: {},
      });
    expect(res.status).toBe(400);
  });
});
