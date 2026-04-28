import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/db/prisma';

jest.setTimeout(30000);

const TEST_SOURCE = 'customer_kpi_test';
const DAY_MS = 24 * 60 * 60 * 1000;
const STORE_ID_A = 11;
const STORE_ID_B = 12;
const CATEGORY_ID = '33333333-3333-3333-3333-333333333333';
const BRAND_ID = '44444444-4444-4444-4444-444444444444';

async function cleanupFixtures(): Promise<void> {
  await prisma.salesHistoryTicket.deleteMany({
    where: { source: TEST_SOURCE },
  });
  await prisma.customerIntelligenceCustomer.deleteMany({
    where: { source: TEST_SOURCE },
  });
}

async function createCustomer(account: string) {
  return prisma.customerIntelligenceCustomer.create({
    data: {
      source: TEST_SOURCE,
      status: 'active',
      ricsAccount: account,
      fullName: `${account}, Test`,
      contacts: {
        create: [
          {
            contactType: 'email',
            value: `${account.toLowerCase()}@example.test`,
            normalizedValue: `${account.toLowerCase()}@example.test`,
            isPrimary: true,
            acceptsMarketing: true,
            source: TEST_SOURCE,
          },
        ],
      },
    },
    select: { id: true },
  });
}

async function createCustomerWithLegacySummary(account: string, input: {
  dateLastPurchase: Date
  qtySales02?: number
  qtySales03?: number
  dollarSales02?: number
  dollarSales03?: number
}) {
  return prisma.customerIntelligenceCustomer.create({
    data: {
      source: TEST_SOURCE,
      status: 'active',
      ricsAccount: account,
      fullName: `${account}, Test`,
      contacts: {
        create: [
          {
            contactType: 'email',
            value: `${account.toLowerCase()}@example.test`,
            normalizedValue: `${account.toLowerCase()}@example.test`,
            isPrimary: true,
            acceptsMarketing: true,
            source: TEST_SOURCE,
          },
        ],
      },
      salesSummaryLegacy: {
        create: {
          dateLastPurchase: input.dateLastPurchase,
          qtySales02: input.qtySales02 ?? null,
          qtySales03: input.qtySales03 ?? null,
          dollarSales02: input.dollarSales02 ?? null,
          dollarSales03: input.dollarSales03 ?? null,
        },
      },
    },
    select: { id: true },
  });
}

beforeEach(async () => {
  await cleanupFixtures();
});

afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

describe('Customer KPI module', () => {
  it('recomputes metrics for a customer and projects the feature tables', async () => {
    const customer = await createCustomer('TEST-KPI-001');
    const now = Date.now();

    await prisma.customerTransactionFact.create({
      data: {
        customerId: customer.id,
        source: TEST_SOURCE,
        transactionKind: 'purchase',
        status: 'completed',
        storeId: STORE_ID_A,
        channel: 'store',
        totalAmount: 120,
        netAmount: 100,
        costAmount: 60,
        discountAmount: 20,
        purchasedAt: new Date(now - 40 * DAY_MS),
        items: {
          create: [
            {
              categoryId: CATEGORY_ID,
              categoryKey: 'running-shoes',
              brandId: BRAND_ID,
              brandKey: 'fleet-feet',
              sizeType: 'shoe_us_men',
              sizeValue: '10',
              quantity: 1,
              netAmount: 100,
              costAmount: 60,
              discountAmount: 20,
              isMarkdown: true,
            },
          ],
        },
      },
    });

    await prisma.customerTransactionFact.create({
      data: {
        customerId: customer.id,
        source: TEST_SOURCE,
        transactionKind: 'purchase',
        status: 'completed',
        storeId: STORE_ID_B,
        channel: 'online',
        couponCode: 'WELCOME10',
        totalAmount: 90,
        netAmount: 90,
        costAmount: 45,
        discountAmount: 0,
        purchasedAt: new Date(now - 10 * DAY_MS),
        items: {
          create: [
            {
              categoryId: CATEGORY_ID,
              categoryKey: 'running-shoes',
              brandId: BRAND_ID,
              brandKey: 'fleet-feet',
              sizeType: 'shoe_us_men',
              sizeValue: '10',
              quantity: 2,
              netAmount: 90,
              costAmount: 45,
            },
          ],
        },
      },
    });

    await prisma.customerTransactionFact.create({
      data: {
        customerId: customer.id,
        source: TEST_SOURCE,
        transactionKind: 'return',
        status: 'completed',
        storeId: STORE_ID_B,
        channel: 'online',
        totalAmount: -50,
        netAmount: -50,
        costAmount: -25,
        discountAmount: 0,
        purchasedAt: new Date(now - 5 * DAY_MS),
        items: {
          create: [
            {
              categoryId: CATEGORY_ID,
              categoryKey: 'running-shoes',
              brandId: BRAND_ID,
              brandKey: 'fleet-feet',
              sizeType: 'shoe_us_men',
              sizeValue: '10',
              quantity: -1,
              netAmount: -50,
              costAmount: -25,
              isReturn: true,
            },
          ],
        },
      },
    });

    const recompute = await request(app).post(`/api/v1/customers/${customer.id}/recompute-metrics`);
    expect(recompute.status).toBe(200);
    expect(recompute.body.customerId).toBe(customer.id);
    expect(recompute.body.lifetimeValue).toBe(140);
    expect(recompute.body.totalOrders).toBe(2);
    expect(recompute.body.avgOrderValue).toBe(70);
    expect(recompute.body.marginValue).toBe(60);
    expect(recompute.body.orders30d).toBe(1);
    expect(recompute.body.orders90d).toBe(2);
    expect(recompute.body.orders365d).toBe(2);
    expect(recompute.body.discountRatio).toBeCloseTo(20 / 210, 4);
    expect(recompute.body.onlineRatio).toBeCloseTo(0.5, 4);
    expect(recompute.body.churnRisk).toBe('LOW');
    expect(recompute.body.rScore).toBe(5);
    expect(recompute.body.fScore).toBe(2);
    expect(recompute.body.mScore).toBe(1);

    const getMetrics = await request(app).get(`/api/v1/customers/${customer.id}/metrics`);
    expect(getMetrics.status).toBe(200);
    expect(getMetrics.body.customerId).toBe(customer.id);
    expect(getMetrics.body.lastPurchaseDate).not.toBeNull();

    const feature = await prisma.customerFeatureCurrent.findUnique({
      where: { customerId: customer.id },
    });
    expect(feature).not.toBeNull();
    expect(feature?.orderCount90d).toBe(2);
    expect(feature?.netRevenueLifetime.toNumber()).toBe(140);
    expect(feature?.returnCount365d).toBe(1);
    expect(feature?.returnedItemCount365d).toBe(1);
    expect(feature?.couponRedemptionCount365d).toBe(1);
    expect(feature?.preferredChannel).toBe('omnichannel');
    expect(feature?.emailOptIn).toBe(true);

    const categoryFeature = await prisma.customerCategoryFeature.findFirst({
      where: { customerId: customer.id, categoryId: CATEGORY_ID },
    });
    expect(categoryFeature).not.toBeNull();
    expect(categoryFeature?.purchaseCount365d).toBe(3);

    const brandFeature = await prisma.customerBrandFeature.findFirst({
      where: { customerId: customer.id, brandId: BRAND_ID },
    });
    expect(brandFeature).not.toBeNull();
    expect(brandFeature?.purchaseCount365d).toBe(3);

    const sizeProfile = await prisma.customerSizeProfile.findFirst({
      where: { customerId: customer.id, sizeType: 'shoe_us_men', sizeValue: '10' },
    });
    expect(sizeProfile).not.toBeNull();
    expect(sizeProfile?.purchaseCount).toBe(3);
    expect(sizeProfile?.confidenceScore.toNumber()).toBe(1);
  });

  it('computes metrics from imported sales history when customer transaction facts are absent', async () => {
    const customer = await createCustomer('TEST-KPI-SALES-HISTORY');
    const purchasedAt = new Date(Date.now() - 15 * DAY_MS);

    await prisma.salesHistoryTicket.create({
      data: {
        source: TEST_SOURCE,
        externalTransactionId: 'RITRNSSV:TEST-KPI-SALES-HISTORY:1001',
        matchedCustomerId: customer.id,
        accountKey: 'TEST-KPI-SALES-HISTORY',
        transactionType: 1,
        transactionKind: 'purchase',
        status: 'completed',
        storeId: 7,
        terminal: 'A',
        ticketNumber: 1001,
        cashierCode: 'CASHIER-1',
        channel: 'store',
        promotionCode: 'PROMO7',
        totalAmount: 140,
        netAmount: 120,
        costAmount: 70,
        discountAmount: 20,
        purchasedAt,
        lines: {
          create: [
            {
              lineNumber: 1,
              categoryId: CATEGORY_ID,
              categoryKey: 'running-shoes',
              brandId: BRAND_ID,
              brandKey: 'fleet-feet',
              sizeType: 'shoe_us_men',
              sizeValue: '9',
              quantity: 1,
              unitPrice: 120,
              unitCost: 70,
              netAmount: 120,
              costAmount: 70,
              discountAmount: 20,
              isMarkdown: true,
              isReturn: false,
              salespersonCode: 'SP-7',
            },
          ],
        },
      },
    });

    const res = await request(app).get(`/api/v1/customers/${customer.id}/metrics`);
    expect(res.status).toBe(200);
    expect(res.body.customerId).toBe(customer.id);
    expect(res.body.dataSource).toBe('transaction_fact');
    expect(res.body.lifetimeValue).toBe(120);
    expect(res.body.totalOrders).toBe(1);
    expect(res.body.avgOrderValue).toBe(120);
    expect(res.body.marginValue).toBe(50);
    expect(res.body.orders30d).toBe(1);
    expect(res.body.orders365d).toBe(1);
    expect(res.body.discountRatio).toBeCloseTo(20 / 140, 4);
    expect(res.body.primaryStoreId).toBe('7');
    expect(res.body.onlineRatio).toBeCloseTo(0, 4);

    const categoryFeature = await prisma.customerCategoryFeature.findFirst({
      where: { customerId: customer.id, categoryId: CATEGORY_ID },
    });
    expect(categoryFeature?.purchaseCount365d).toBe(1);
    expect(categoryFeature?.netRevenue365d.toNumber()).toBe(120);

    const brandFeature = await prisma.customerBrandFeature.findFirst({
      where: { customerId: customer.id, brandId: BRAND_ID },
    });
    expect(brandFeature?.purchaseCount365d).toBe(1);

    const sizeProfile = await prisma.customerSizeProfile.findFirst({
      where: { customerId: customer.id, sizeType: 'shoe_us_men', sizeValue: '9' },
    });
    expect(sizeProfile?.purchaseCount).toBe(1);
  });

  it('matches sales history tickets by customer account key when matchedCustomerId is missing', async () => {
    const customer = await createCustomer('TEST-KPI-ACCOUNTKEY');
    const purchasedAt = new Date(Date.now() - 8 * DAY_MS);

    await prisma.salesHistoryTicket.create({
      data: {
        source: TEST_SOURCE,
        externalTransactionId: 'RITRNSSV:TEST-KPI-ACCOUNTKEY:2001',
        matchedCustomerId: null,
        accountKey: 'TEST-KPI-ACCOUNTKEY',
        transactionType: 1,
        transactionKind: 'purchase',
        status: 'completed',
        storeId: 9,
        terminal: 'B',
        ticketNumber: 2001,
        cashierCode: 'CASHIER-2',
        channel: 'store',
        totalAmount: 92,
        netAmount: 80,
        costAmount: 45,
        discountAmount: 12,
        purchasedAt,
        lines: {
          create: [
            {
              lineNumber: 1,
              categoryId: CATEGORY_ID,
              categoryKey: 'running-shoes',
              brandId: BRAND_ID,
              brandKey: 'fleet-feet',
              sizeType: 'shoe_us_men',
              sizeValue: '11',
              quantity: 1,
              unitPrice: 80,
              unitCost: 45,
              netAmount: 80,
              costAmount: 45,
              discountAmount: 12,
              isMarkdown: true,
              isReturn: false,
              salespersonCode: 'SP-8',
            },
          ],
        },
      },
    });

    const res = await request(app).get(`/api/v1/customers/${customer.id}/metrics`);
    expect(res.status).toBe(200);
    expect(res.body.customerId).toBe(customer.id);
    expect(res.body.dataSource).toBe('transaction_fact');
    expect(res.body.lifetimeValue).toBe(80);
    expect(res.body.totalOrders).toBe(1);
    expect(res.body.lastPurchaseDate).toBe(purchasedAt.toISOString());
  });

  it('returns zeroed metrics for a customer with no transactions', async () => {
    const customer = await createCustomer('TEST-KPI-EMPTY');

    const res = await request(app).get(`/api/v1/customers/${customer.id}/metrics`);
    expect(res.status).toBe(200);
    expect(res.body.customerId).toBe(customer.id);
    expect(res.body.dataSource).toBe('none');
    expect(res.body.lifetimeValue).toBe(0);
    expect(res.body.totalOrders).toBe(0);
    expect(res.body.avgOrderValue).toBe(0);
    expect(res.body.orders90d).toBe(0);
    expect(res.body.lastPurchaseDate).toBeNull();
    expect(res.body.recencyDays).toBeNull();
    expect(res.body.churnRisk).toBeNull();
    expect(res.body.isActive).toBe(false);
    expect(res.body.isDormant).toBe(false);
  });

  it('falls back to imported legacy sales summary when transaction history is absent', async () => {
    const customer = await createCustomerWithLegacySummary('TEST-KPI-LEGACY', {
      dateLastPurchase: new Date(Date.now() - 45 * DAY_MS),
      qtySales02: 4,
      qtySales03: 11,
      dollarSales02: 980,
      dollarSales03: 3525,
    });

    const res = await request(app).get(`/api/v1/customers/${customer.id}/metrics`);
    expect(res.status).toBe(200);
    expect(res.body.customerId).toBe(customer.id);
    expect(res.body.dataSource).toBe('legacy_sales_summary');
    expect(res.body.lifetimeValue).toBe(3525);
    expect(res.body.totalOrders).toBe(11);
    expect(res.body.avgOrderValue).toBeCloseTo(320.45, 2);
    expect(res.body.orders365d).toBe(4);
    expect(res.body.orders90d).toBe(4);
    expect(res.body.lastPurchaseDate).not.toBeNull();
    expect(res.body.recencyDays).toBeGreaterThanOrEqual(45);
    expect(res.body.isActive).toBe(true);
    expect(res.body.churnRisk).toBe('LOW');

    const feature = await prisma.customerFeatureCurrent.findUnique({
      where: { customerId: customer.id },
    });
    expect(feature?.netRevenueLifetime.toNumber()).toBe(3525);
    expect(feature?.netRevenue365d.toNumber()).toBe(980);
    expect(feature?.orderCountLifetime).toBe(11);
    expect(feature?.orderCount365d).toBe(4);
  });

  it('reports summary deltas after recompute', async () => {
    const baseline = await request(app).get('/api/v1/customers/metrics/summary');
    expect(baseline.status).toBe(200);

    const activeCustomer = await createCustomer('TEST-KPI-SUMMARY-ACTIVE');
    const dormantCustomer = await createCustomer('TEST-KPI-SUMMARY-DORMANT');

    await prisma.customerTransactionFact.create({
      data: {
        customerId: activeCustomer.id,
        source: TEST_SOURCE,
        transactionKind: 'purchase',
        status: 'completed',
        storeId: STORE_ID_A,
        channel: 'store',
        totalAmount: 50,
        netAmount: 50,
        costAmount: 20,
        discountAmount: 0,
        purchasedAt: new Date(Date.now() - 7 * DAY_MS),
      },
    });

    await prisma.customerTransactionFact.create({
      data: {
        customerId: dormantCustomer.id,
        source: TEST_SOURCE,
        transactionKind: 'purchase',
        status: 'completed',
        storeId: STORE_ID_B,
        channel: 'online',
        totalAmount: 75,
        netAmount: 75,
        costAmount: 40,
        discountAmount: 0,
        purchasedAt: new Date(Date.now() - 200 * DAY_MS),
      },
    });

    expect((await request(app).post(`/api/v1/customers/${activeCustomer.id}/recompute-metrics`)).status).toBe(200);
    expect((await request(app).post(`/api/v1/customers/${dormantCustomer.id}/recompute-metrics`)).status).toBe(200);

    const summary = await request(app).get('/api/v1/customers/metrics/summary');
    expect(summary.status).toBe(200);
    expect(summary.body.totalCustomers).toBeGreaterThanOrEqual(baseline.body.totalCustomers + 2);
    expect(summary.body.activeCustomers).toBeGreaterThanOrEqual(baseline.body.activeCustomers + 1);
    expect(summary.body.dormantCustomers).toBeGreaterThanOrEqual(baseline.body.dormantCustomers + 1);
    expect(summary.body.churnDistribution.high).toBeGreaterThanOrEqual(baseline.body.churnDistribution.high);
  });

  it('returns filtered totals and honors server-side sorting for the customer intelligence list', async () => {
    const lowerOrderCustomer = await createCustomer('TEST-KPI-LIST-LOW');
    const higherOrderCustomer = await createCustomer('TEST-KPI-LIST-HIGH');
    const now = Date.now();

    await prisma.customerTransactionFact.create({
      data: {
        customerId: lowerOrderCustomer.id,
        source: TEST_SOURCE,
        transactionKind: 'purchase',
        status: 'completed',
        storeId: STORE_ID_A,
        channel: 'store',
        totalAmount: 100,
        netAmount: 100,
        costAmount: 50,
        discountAmount: 0,
        purchasedAt: new Date(now - 21 * DAY_MS),
      },
    });

    await prisma.customerTransactionFact.createMany({
      data: [
        {
          customerId: higherOrderCustomer.id,
          source: TEST_SOURCE,
          transactionKind: 'purchase',
          status: 'completed',
          storeId: STORE_ID_B,
          channel: 'online',
          totalAmount: 90,
          netAmount: 90,
          costAmount: 40,
          discountAmount: 0,
          purchasedAt: new Date(now - 14 * DAY_MS),
        },
        {
          customerId: higherOrderCustomer.id,
          source: TEST_SOURCE,
          transactionKind: 'purchase',
          status: 'completed',
          storeId: STORE_ID_B,
          channel: 'online',
          totalAmount: 60,
          netAmount: 60,
          costAmount: 30,
          discountAmount: 0,
          purchasedAt: new Date(now - 7 * DAY_MS),
        },
      ],
    });

    await request(app).post(`/api/v1/customers/${lowerOrderCustomer.id}/recompute-metrics`).expect(200);
    await request(app).post(`/api/v1/customers/${higherOrderCustomer.id}/recompute-metrics`).expect(200);

    const res = await request(app).get('/api/v1/customers/metrics/list?q=TEST-KPI-LIST&sort=totalOrders&order=desc&pageSize=10');
    expect(res.status).toBe(200);
    expect(res.body.summary.customerCount).toBe(2);
    expect(res.body.summary.totalLifetimeValue).toBe(250);
    expect(res.body.summary.totalOrders).toBe(3);
    expect(res.body.summary.avgOrderValue).toBeCloseTo(87.5, 4);
    expect(res.body.summary.avgRecencyDays).not.toBeNull();
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].customerId).toBe(higherOrderCustomer.id);
    expect(res.body.data[0].totalOrders).toBe(2);
    expect(res.body.data[1].customerId).toBe(lowerOrderCustomer.id);
    expect(res.body.data[1].totalOrders).toBe(1);
  });
});
