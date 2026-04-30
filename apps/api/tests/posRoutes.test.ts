import request from 'supertest';
import app from '../src/app';
import { PrismaClient } from '../src/prismaClient';
import { bootstrapOwner } from '../src/services/employees/bootstrapOwner';
import { hashPassword } from '../src/services/employees/passwordHash';
import { grantStoreScope } from '../src/services/identityAccess/storeScopeService';

const prisma = new PrismaClient();

const RUN_ID = Date.now();
const EMAIL = `pos-routes-owner-${RUN_ID}@example.com`;
const PASSWORD = 'pos-routes-owner-123';
const STORE_NUMBER = 32000 + (RUN_ID % 100);
const OTHER_STORE_NUMBER = STORE_NUMBER + 100;
const SKU_CODE = `POS${String(RUN_ID).slice(-10)}`;
const UPC = `95${String(RUN_ID).slice(-12)}`;
const CUSTOMER_ACCOUNT = `POSCUST${String(RUN_ID).slice(-8)}`;

let skuId = '';
let importedCustomerId = '';

async function ensureOwnerUser(email: string, password: string): Promise<void> {
  await bootstrapOwner(prisma);
  const ownerRole = await prisma.role.findUnique({ where: { name: 'OWNER' } });
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      roleId: ownerRole!.id,
      active: true,
      displayName: 'POS Routes Owner',
    },
    create: {
      email,
      passwordHash,
      roleId: ownerRole!.id,
      active: true,
      displayName: 'POS Routes Owner',
    },
  });
}

async function ownerCookie(): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'][0];
}

async function waitForCustomerMetrics(customerId: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const metrics = await prisma.customerMetrics.findUnique({ where: { customerId } });
    if (metrics) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe('pos routes', () => {
  beforeAll(async () => {
    process.env.AUTH_OWNER_EMAIL = EMAIL;
    process.env.AUTH_OWNER_PASSWORD = PASSWORD;

    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await ensureOwnerUser(EMAIL, PASSWORD);

    await prisma.storeMaster.upsert({
      where: { number: STORE_NUMBER },
      update: {
        description: 'POS Smoke Test Store',
        otherChargeDesc: 'Misc Charge',
        rawJson: {},
      },
      create: {
        number: STORE_NUMBER,
        description: 'POS Smoke Test Store',
        otherChargeDesc: 'Misc Charge',
        rawJson: {},
      },
    });
    await prisma.storeMaster.upsert({
      where: { number: OTHER_STORE_NUMBER },
      update: {
        description: 'POS Scoped Test Store',
        otherChargeDesc: 'Misc Charge',
        rawJson: {},
      },
      create: {
        number: OTHER_STORE_NUMBER,
        description: 'POS Scoped Test Store',
        otherChargeDesc: 'Misc Charge',
        rawJson: {},
      },
    });

    const importedCustomer = await prisma.customerIntelligenceCustomer.create({
      data: {
        source: 'pos_routes_test',
        status: 'active',
        ricsAccount: CUSTOMER_ACCOUNT,
        fullName: 'POS ROUTE CUSTOMER, TEST',
      },
      select: { id: true },
    });
    importedCustomerId = importedCustomer.id;

    const sku = await prisma.sku.create({
      data: {
        provisionalCode: `${SKU_CODE}-PROV`,
        code: SKU_CODE,
        skuState: 'ACTIVE',
        descriptionRics: 'POS Smoke SKU',
        retailPrice: 100,
        markDownPrice1: 90,
        markDownPrice2: 80,
        listPrice: 110,
        currentCost: 40,
        currentPriceSlot: 'RETAIL',
        createdBy: 'pos-routes-test',
        activatedAt: new Date(),
        activatedBy: 'pos-routes-test',
      },
    });
    skuId = sku.id;

    await prisma.skuUpc.create({
      data: {
        upc: UPC,
        skuCode: SKU_CODE,
        skuId,
      },
    });

    await prisma.stockLevel.create({
      data: {
        storeId: STORE_NUMBER,
        skuId,
        onHand: 3,
      },
    });
  });

  afterAll(async () => {
    await prisma.ticketTender.deleteMany({ where: { source: 'pos_live', store: String(STORE_NUMBER) } });
    await prisma.ticketDetail.deleteMany({ where: { source: 'pos_live', store: String(STORE_NUMBER) } });
    await prisma.ticketHeader.deleteMany({ where: { source: 'pos_live', store: String(STORE_NUMBER) } });
    await prisma.salesHistoryTicket.deleteMany({ where: { storeId: STORE_NUMBER } });
    if (importedCustomerId) {
      await prisma.customerMetrics.deleteMany({ where: { customerId: importedCustomerId } });
      await prisma.customerFeatureCurrent.deleteMany({ where: { customerId: importedCustomerId } });
      await prisma.customerMetricsDaily.deleteMany({ where: { customerId: importedCustomerId } });
      await prisma.customerCategoryFeature.deleteMany({ where: { customerId: importedCustomerId } });
      await prisma.customerBrandFeature.deleteMany({ where: { customerId: importedCustomerId } });
      await prisma.customerSizeProfile.deleteMany({ where: { customerId: importedCustomerId } });
    }
    await prisma.customerIntelligenceCustomer.deleteMany({ where: { id: importedCustomerId } });
    await prisma.stockMovement.deleteMany({ where: { storeId: STORE_NUMBER, skuId } });
    await prisma.stockLevel.deleteMany({ where: { storeId: STORE_NUMBER, skuId } });
    await prisma.posShift.deleteMany({ where: { storeId: { in: [STORE_NUMBER, OTHER_STORE_NUMBER] } } });
    await prisma.posRegister.deleteMany({ where: { storeId: { in: [STORE_NUMBER, OTHER_STORE_NUMBER] } } });
    await prisma.posTenderType.deleteMany({ where: { storeId: { in: [STORE_NUMBER, OTHER_STORE_NUMBER] } } });
    await prisma.posPayoutCategory.deleteMany({ where: { storeId: { in: [STORE_NUMBER, OTHER_STORE_NUMBER] } } });
    await prisma.skuUpc.deleteMany({ where: { upc: UPC } });
    if (skuId) {
      await prisma.sku.deleteMany({ where: { id: skuId } });
    }
    await prisma.storeMaster.deleteMany({ where: { number: { in: [STORE_NUMBER, OTHER_STORE_NUMBER] } } });
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.$disconnect();
  });

  it('opens a shift, adds a line, tenders a sale, and writes inventory + canonical ticket tables', async () => {
    const cookie = await ownerCookie();

    const bootstrap = await request(app)
      .get(`/api/v1/pos/bootstrap?storeId=${STORE_NUMBER}`)
      .set('Cookie', cookie);

    expect(bootstrap.status).toBe(200);
    expect(bootstrap.body.selectedStoreId).toBe(STORE_NUMBER);
    expect(bootstrap.body.shift).toBeNull();
    expect(bootstrap.body.activeTicket).toBeNull();

    const openShift = await request(app)
      .post('/api/v1/pos/shifts/open')
      .set('Cookie', cookie)
      .send({
        storeId: STORE_NUMBER,
        openingCashFloat: 25,
      });

    expect(openShift.status).toBe(201);
    expect(openShift.body.shift.storeId).toBe(STORE_NUMBER);
    expect(openShift.body.shift.status).toBe('OPEN');
    expect(openShift.body.activeTicket.status).toBe('DRAFT');
    expect(openShift.body.activeTicket.lines).toHaveLength(0);

    const ticketId = openShift.body.activeTicket.id as string;
    const cashTender = openShift.body.tenderTypes.find((tender: { kind: string }) => tender.kind === 'CASH');
    expect(cashTender).toBeTruthy();

    const lookup = await request(app)
      .get(`/api/v1/pos/catalog/lookup?code=${UPC}`)
      .set('Cookie', cookie);

    expect(lookup.status).toBe(200);
    expect(lookup.body.skuId).toBe(skuId);
    expect(lookup.body.defaultUnitPrice).toBe(100);

    const addLine = await request(app)
      .post(`/api/v1/pos/tickets/${ticketId}/lines`)
      .set('Cookie', cookie)
      .send({
        code: UPC,
        quantity: 1,
      });

    expect(addLine.status).toBe(201);
    expect(addLine.body.ticket.lines).toHaveLength(1);
    expect(addLine.body.ticket.subtotal).toBe(100);
    expect(addLine.body.ticket.taxTotal).toBe(15);
    expect(addLine.body.ticket.grandTotal).toBe(115);

    const patchHeader = await request(app)
      .patch(`/api/v1/pos/tickets/${ticketId}/header`)
      .set('Cookie', cookie)
      .send({
        customerId: importedCustomerId,
        customerAccountNumber: CUSTOMER_ACCOUNT,
        customerName: 'POS ROUTE CUSTOMER, TEST',
      });

    expect(patchHeader.status).toBe(200);
    expect(patchHeader.body.ticket.customerId).toBe(importedCustomerId);
    expect(patchHeader.body.ticket.customerAccountNumber).toBe(CUSTOMER_ACCOUNT);

    const complete = await request(app)
      .post(`/api/v1/pos/tickets/${ticketId}/complete`)
      .set('Cookie', cookie)
      .send({
        tenders: [
          {
            tenderTypeId: cashTender.id,
            amount: 115,
          },
        ],
      });

    expect(complete.status).toBe(200);
    expect(complete.body.ticket.status).toBe('COMPLETED');
    expect(complete.body.ticket.totalTendered).toBe(115);
    expect(complete.body.receipt.ticketNumber).toBe(complete.body.ticket.ticketNumber);
    expect(complete.body.receipt.registerCode).toBe('MAIN');
    expect(complete.body.nextTicket.status).toBe('DRAFT');
    expect(complete.body.nextTicket.id).not.toBe(ticketId);

    const stockLevel = await prisma.stockLevel.findFirst({
      where: {
        storeId: STORE_NUMBER,
        skuId,
        columnLabel: '',
        rowLabel: '',
      },
    });
    expect(stockLevel?.onHand).toBe(2);

    const stockMovement = await prisma.stockMovement.findFirst({
      where: {
        storeId: STORE_NUMBER,
        skuId,
        sourceDocumentType: 'POS_TICKET',
        sourceDocumentId: ticketId,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(stockMovement?.quantityDelta).toBe(-1);
    expect(stockMovement?.movementType).toBe('POS_SALE');

    const salesHistory = await prisma.salesHistoryTicket.findUnique({
      where: { externalTransactionId: ticketId },
      include: { lines: true },
    });
    expect(salesHistory).toBeTruthy();
    expect(salesHistory?.storeId).toBe(STORE_NUMBER);
    expect(salesHistory?.source).toBe('pos_live');
    expect(salesHistory?.status).toBe('completed');
    expect(salesHistory?.matchedCustomerId).toBe(importedCustomerId);
    expect(salesHistory?.accountKey).toBe(CUSTOMER_ACCOUNT);
    expect(salesHistory?.lines).toHaveLength(1);
    expect(salesHistory?.lines[0].skuId).toBe(skuId);
    expect(Number(salesHistory?.lines[0].unitPrice ?? 0)).toBe(100);

    const ticketHeader = await prisma.ticketHeader.findFirst({
      where: { source: 'pos_live', externalTransactionId: ticketId },
    });
    expect(ticketHeader).toBeTruthy();
    expect(ticketHeader?.store).toBe(String(STORE_NUMBER));
    expect(ticketHeader?.ticket).toBe(String(complete.body.ticket.ticketNumber));
    expect(ticketHeader?.account).toBe(CUSTOMER_ACCOUNT);
    expect(ticketHeader?.posted).toBe('Y');
    expect(ticketHeader?.ticketId).toBe(salesHistory?.id);

    const ticketDetail = await prisma.ticketDetail.findMany({
      where: { source: 'pos_live', externalTransactionId: ticketId },
    });
    expect(ticketDetail).toHaveLength(1);
    expect(ticketDetail[0].sku).toBe(SKU_CODE);
    expect(ticketDetail[0].qty).toBe('1');
    expect(ticketDetail[0].price).toBe('100');

    const ticketTender = await prisma.ticketTender.findMany({
      where: { source: 'pos_live', externalTransactionId: ticketId },
    });
    expect(ticketTender).toHaveLength(1);
    expect(ticketTender[0].tender).toBe(cashTender.code);
    expect(ticketTender[0].amount).toBe('115');

    await waitForCustomerMetrics(importedCustomerId);
  }, 20000);

  it('blocks POS store actions outside the user store scope', async () => {
    const cookie = await ownerCookie();
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: EMAIL },
      select: { id: true },
    });

    await grantStoreScope(prisma, {
      userId: owner.id,
      scopeType: 'STORE',
      scopeId: String(OTHER_STORE_NUMBER),
      actorUserId: owner.id,
      reason: 'pos-route store scope denial test',
    });

    const scopedBootstrap = await request(app)
      .get('/api/v1/pos/bootstrap')
      .set('Cookie', cookie);

    expect(scopedBootstrap.status).toBe(200);
    expect(scopedBootstrap.body.selectedStoreId).toBe(OTHER_STORE_NUMBER);
    expect(scopedBootstrap.body.stores.map((store: { id: number }) => store.id)).toEqual([OTHER_STORE_NUMBER]);

    const bootstrap = await request(app)
      .get(`/api/v1/pos/bootstrap?storeId=${STORE_NUMBER}`)
      .set('Cookie', cookie);

    expect(bootstrap.status).toBe(403);
    expect(bootstrap.body.error.code).toBe('STORE_SCOPE_FORBIDDEN');

    const openShift = await request(app)
      .post('/api/v1/pos/shifts/open')
      .set('Cookie', cookie)
      .send({
        storeId: STORE_NUMBER,
        openingCashFloat: 25,
      });

    expect(openShift.status).toBe(403);
    expect(openShift.body.error.code).toBe('STORE_SCOPE_FORBIDDEN');
  });
});
