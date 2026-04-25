import request from 'supertest';
import app from '../src/app';
import { PrismaClient } from '../src/prismaClient';
import { bootstrapOwner } from '../src/services/employees/bootstrapOwner';
import { hashPassword } from '../src/services/employees/passwordHash';

const prisma = new PrismaClient();

const RUN_ID = Date.now();
const EMAIL = `pos-routes-owner-${RUN_ID}@example.com`;
const PASSWORD = 'pos-routes-owner-123';
const STORE_NUMBER = 32000 + (RUN_ID % 100);
const SKU_CODE = `POS${String(RUN_ID).slice(-10)}`;
const UPC = `95${String(RUN_ID).slice(-12)}`;

let skuId = '';

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
    await prisma.salesHistoryTicket.deleteMany({ where: { storeId: STORE_NUMBER } });
    await prisma.stockMovement.deleteMany({ where: { storeId: STORE_NUMBER, skuId } });
    await prisma.stockLevel.deleteMany({ where: { storeId: STORE_NUMBER, skuId } });
    await prisma.posShift.deleteMany({ where: { storeId: STORE_NUMBER } });
    await prisma.posRegister.deleteMany({ where: { storeId: STORE_NUMBER } });
    await prisma.posTenderType.deleteMany({ where: { storeId: STORE_NUMBER } });
    await prisma.posPayoutCategory.deleteMany({ where: { storeId: STORE_NUMBER } });
    await prisma.skuUpc.deleteMany({ where: { upc: UPC } });
    if (skuId) {
      await prisma.sku.deleteMany({ where: { id: skuId } });
    }
    await prisma.storeMaster.deleteMany({ where: { number: STORE_NUMBER } });
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.$disconnect();
  });

  it('opens a shift, adds a line, tenders a sale, and writes inventory + sales history', async () => {
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
    expect(salesHistory?.lines).toHaveLength(1);
    expect(salesHistory?.lines[0].skuId).toBe(skuId);
    expect(Number(salesHistory?.lines[0].unitPrice ?? 0)).toBe(100);
  }, 20000);
});
