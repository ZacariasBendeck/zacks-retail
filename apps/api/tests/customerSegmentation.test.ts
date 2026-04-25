import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/services/employees/passwordHash';
import { PERMISSIONS } from '../src/services/employees/permissions';
import { seedDefaultMetrics } from '../src/services/segmentation/metricRegistryService';

const suffix = Date.now();
const ROLE_NAME = `SEGMENTATION_TEST_${suffix}`;
const USER_EMAIL = `segmentation-${suffix}@example.com`;
const PASSWORD = 'segmentation-password-123';

async function login(): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({
    email: USER_EMAIL,
    password: PASSWORD,
  });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'][0];
}

describe('customer segmentation routes', () => {
  let cookie: string;
  let customerAId: string;
  let customerBId: string;

  beforeAll(async () => {
    await seedDefaultMetrics();
    const role = await prisma.role.create({
      data: {
        name: ROLE_NAME,
        permissions: [
          PERMISSIONS.SEGMENTATION_READ,
          PERMISSIONS.SEGMENTATION_WRITE,
          PERMISSIONS.SEGMENTATION_ACTIVATE,
          PERMISSIONS.SEGMENTATION_EVALUATE,
        ],
      },
    });
    const passwordHash = await hashPassword(PASSWORD);
    await prisma.user.create({
      data: {
        email: USER_EMAIL,
        passwordHash,
        displayName: 'Segmentation Tester',
        roleId: role.id,
      },
    });
    cookie = await login();

    const [customerA, customerB] = await Promise.all([
      prisma.customerIntelligenceCustomer.create({
        data: {
          fullName: 'Segmentation Match A',
          ricsAccount: `SEG-A-${suffix}`,
          source: 'test',
          status: 'active',
        },
      }),
      prisma.customerIntelligenceCustomer.create({
        data: {
          fullName: 'Segmentation Match B',
          ricsAccount: `SEG-B-${suffix}`,
          source: 'test',
          status: 'active',
        },
      }),
    ]);
    customerAId = customerA.id;
    customerBId = customerB.id;

    await prisma.customerFeatureCurrent.createMany({
      data: [
        {
          customerId: customerAId,
          orderCountLifetime: 3,
          orderCount365d: 3,
          netRevenue365d: 900,
          netRevenueLifetime: 1200,
          grossMargin365d: 400,
          emailOptIn: true,
          daysSinceLastPurchase: 40,
          daysSinceFirstPurchase: 120,
        },
        {
          customerId: customerBId,
          orderCountLifetime: 2,
          orderCount365d: 2,
          netRevenue365d: 700,
          netRevenueLifetime: 700,
          grossMargin365d: 250,
          emailOptIn: false,
          daysSinceLastPurchase: 55,
          daysSinceFirstPurchase: 80,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.activationAudienceMember.deleteMany({});
    await prisma.activationAudience.deleteMany({});
    await prisma.customerSegmentHistory.deleteMany({});
    await prisma.customerSegmentCurrent.deleteMany({});
    await prisma.customerSegmentEvaluationRun.deleteMany({});
    await prisma.segmentVersionMetricDependency.deleteMany({});
    await prisma.customerSegmentVersion.deleteMany({});
    await prisma.customerSegment.deleteMany({});
    await prisma.customerFeatureCurrent.deleteMany({
      where: { customerId: { in: [customerAId, customerBId].filter(Boolean) } },
    });
    await prisma.customerIntelligenceCustomer.deleteMany({
      where: { id: { in: [customerAId, customerBId].filter(Boolean) } },
    });
    await prisma.session.deleteMany({ where: { user: { email: USER_EMAIL } } });
    await prisma.user.deleteMany({ where: { email: USER_EMAIL } });
    await prisma.role.deleteMany({ where: { name: ROLE_NAME } });
    await prisma.$disconnect();
  });

  it('creates, activates, evaluates, and reads segment membership', async () => {
    const createSegment = await request(app)
      .post('/api/v1/customer-segments')
      .set('Cookie', cookie)
      .send({
        segmentKey: `vip-active-${suffix}`,
        name: 'VIP Active Test',
        description: 'Test segment',
        segmentFamily: 'value',
        evaluationMode: 'batch',
        priority: 10,
      });

    expect(createSegment.status).toBe(201);
    const segmentId = createSegment.body.id;

    const createVersion = await request(app)
      .post(`/api/v1/customer-segments/${segmentId}/versions`)
      .set('Cookie', cookie)
      .send({
        ruleAst: {
          all: [
            { metric: 'order_count_lifetime', op: '>=', value: 2 },
            { metric: 'net_revenue_365d', op: '>=', value: 600 },
          ],
        },
      });

    expect(createVersion.status).toBe(201);
    expect(createVersion.body.validationStatus).toBe('valid');

    const activate = await request(app)
      .post(`/api/v1/customer-segments/${segmentId}/versions/${createVersion.body.id}/activate`)
      .set('Cookie', cookie)
      .send({ evaluateImmediately: true });

    expect(activate.status).toBe(200);
    expect(activate.body.evaluation.status).toBe('completed');
    expect(activate.body.evaluation.customersMatched).toBe(2);

    const customerSegments = await request(app)
      .get(`/api/v1/customers/${customerAId}/segments`)
      .set('Cookie', cookie);

    expect(customerSegments.status).toBe(200);
    expect(customerSegments.body.segments).toHaveLength(1);
    expect(customerSegments.body.segments[0].segmentKey).toBe(`vip-active-${suffix}`);

    const members = await request(app)
      .get(`/api/v1/customer-segments/${segmentId}/members?limit=10&offset=0`)
      .set('Cookie', cookie);

    expect(members.status).toBe(200);
    expect(members.body.total).toBe(2);
  });

  it('builds an activation audience with suppression and export', async () => {
    const build = await request(app)
      .post('/api/v1/activation-audiences')
      .set('Cookie', cookie)
      .send({
        name: 'VIP Audience',
        segmentKeys: [`vip-active-${suffix}`],
        requireAllSegments: true,
        channel: 'email',
        holdoutPercent: 0,
      });

    expect(build.status).toBe(201);
    expect(build.body.totalCandidates).toBe(2);
    expect(build.body.eligibleCustomers).toBe(1);
    expect(build.body.activationCustomers).toBe(1);

    const audienceMembers = await request(app)
      .get(`/api/v1/activation-audiences/${build.body.audienceId}/members?treatmentGroup=suppressed&limit=10&offset=0`)
      .set('Cookie', cookie);

    expect(audienceMembers.status).toBe(200);
    expect(audienceMembers.body.total).toBe(1);
    expect(audienceMembers.body.items[0].suppressionReasons).toContain('email_opt_in_required');

    const exportCsv = await request(app)
      .get(`/api/v1/activation-audiences/${build.body.audienceId}/export.csv`)
      .set('Cookie', cookie);

    expect(exportCsv.status).toBe(200);
    expect(exportCsv.text).toContain('customer_id,treatment_group,score,segment_keys,segment_version_ids,suppression_reasons');
    expect(exportCsv.text).toContain(`vip-active-${suffix}`);
  });
});
