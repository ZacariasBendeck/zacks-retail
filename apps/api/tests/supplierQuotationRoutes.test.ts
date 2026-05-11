import request from 'supertest';
import { Err, Ok } from '../src/repositories/rics/repoResult';

const quote = {
  id: '11111111-1111-4111-8111-111111111111',
  quoteNumber: 'SQ-2026-000001',
  vendorCode: 'ABCD',
  vendorName: 'ACME',
  buyer: 'buyer',
  season: '26',
  chainId: null,
  chainLabel: null,
  sourceCurrency: 'HNL',
  quoteDate: '2026-05-10',
  validUntil: null,
  status: 'DRAFT',
  lineCount: 0,
  acceptedLineCount: 0,
  acceptedCostHnl: 0,
  updatedAt: '2026-05-10T00:00:00.000Z',
  fxRate: 1,
  fxDate: '2026-05-10',
  incotermCode: null,
  incotermPlace: null,
  paymentTerms: null,
  leadTimeDays: null,
  sourceDocumentRef: null,
  notes: null,
  createdAt: '2026-05-10T00:00:00.000Z',
  createdBy: 'system',
  updatedBy: 'system',
  lines: [],
  relations: [],
};

const line = {
  id: '22222222-2222-4222-8222-222222222222',
  quotationId: quote.id,
  lineSequence: 1,
  linkedSkuId: null,
  linkedSkuCode: null,
  linkedSkuProvisionalCode: null,
  supplierStyle: 'LOAFER-1',
  supplierColorCode: 'BLK',
  supplierColorName: 'Black',
  description: 'Black loafer',
  familyCode: 'zapatos',
  familyLabelEs: 'Zapatos',
  categoryNumber: 10,
  categoryDescription: 'Shoes',
  colorFamilyValueId: null,
  colorFamilyCode: null,
  colorFamilyLabelEs: null,
  materialValueId: null,
  materialCode: null,
  materialLabelEs: null,
  styleElementValueId: null,
  styleElementCode: null,
  styleElementLabelEs: null,
  keywords: 'loafer leather',
  imageUrl: null,
  moqQty: 12,
  quotedQty: 24,
  unitCost: 10,
  estimatedLandedUnitCostHnl: 250,
  targetRetailHnl: 699,
  marginPct: 0.64,
  plannedReceiptDate: null,
  decisionStatus: 'NEW',
  decisionReason: null,
  decisionAt: null,
  decisionBy: null,
  createdAt: '2026-05-10T00:00:00.000Z',
  updatedAt: '2026-05-10T00:00:00.000Z',
};

const mockSupplierQuotationService = {
  list: jest.fn(async () => Ok([quote])),
  get: jest.fn(async () => Ok(quote)),
  create: jest.fn(async () => Ok(quote)),
  update: jest.fn(async () => Ok(quote)),
  archive: jest.fn(async () => Ok({ ...quote, status: 'ARCHIVED' })),
  addLine: jest.fn(async () => Ok(line)),
  updateLine: jest.fn(async () => Ok(line)),
  deleteLine: jest.fn(async () => Ok(undefined)),
  decideLine: jest.fn(async () => Ok({ ...line, decisionStatus: 'ACCEPTED' })),
  addRelation: jest.fn(async () => Ok({
    id: '33333333-3333-4333-8333-333333333333',
    sourceLineId: line.id,
    relationType: 'SIMILAR',
    targetType: 'SKU',
    targetId: '44444444-4444-4444-8444-444444444444',
    note: null,
    title: 'SKU-1',
    subtitle: 'Related',
    createdAt: '2026-05-10T00:00:00.000Z',
    createdBy: 'system',
  })),
  removeRelation: jest.fn(async () => Ok(undefined)),
  similarity: jest.fn(async () => Ok([
    {
      targetType: 'SKU',
      targetId: '44444444-4444-4444-8444-444444444444',
      relationType: null,
      manual: false,
      score: 3,
      signals: ['category', 'color', 'keywords'],
      title: 'SKU-1',
      subtitle: 'Related',
      vendorCode: 'ABCD',
      vendorName: 'ACME',
      unitCost: 200,
      retailPrice: 699,
      imageUrl: null,
    },
  ])),
  convertAcceptedToPurchaseOrders: jest.fn(async () => Ok({ purchaseOrders: [{ id: 'po-1', poNumber: 'PO-000001' }], createdSkuIds: [] })),
};

jest.mock('../src/services/supplierQuotationService', () => ({
  supplierQuotationService: mockSupplierQuotationService,
}));

import app from '../src/app';

describe('/api/v1/purchasing/supplier-quotations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists supplier quotations with filters', async () => {
    const res = await request(app).get('/api/v1/purchasing/supplier-quotations?status=DRAFT&vendorCode=ABCD');
    expect(res.status).toBe(200);
    expect(res.body[0].quoteNumber).toBe('SQ-2026-000001');
    expect(mockSupplierQuotationService.list).toHaveBeenCalledWith(expect.objectContaining({
      status: 'DRAFT',
      vendorCode: 'ABCD',
    }));
  });

  it('creates a supplier quotation', async () => {
    const res = await request(app)
      .post('/api/v1/purchasing/supplier-quotations')
      .send({ vendorCode: 'ABCD', buyer: 'buyer' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(quote.id);
    expect(mockSupplierQuotationService.create).toHaveBeenCalledWith(expect.objectContaining({ vendorCode: 'ABCD' }), expect.any(String));
  });

  it('adds and decides a quotation line', async () => {
    const added = await request(app)
      .post(`/api/v1/purchasing/supplier-quotations/${quote.id}/lines`)
      .send({ supplierStyle: 'LOAFER-1', unitCost: 10, quotedQty: 24 });
    expect(added.status).toBe(201);
    expect(added.body.supplierStyle).toBe('LOAFER-1');

    const decided = await request(app)
      .patch(`/api/v1/purchasing/supplier-quotations/lines/${line.id}/decision`)
      .send({ decisionStatus: 'ACCEPTED' });
    expect(decided.status).toBe(200);
    expect(decided.body.decisionStatus).toBe('ACCEPTED');
  });

  it('returns similarity candidates and accepts manual relations', async () => {
    const similar = await request(app).get(`/api/v1/purchasing/supplier-quotations/lines/${line.id}/similarity`);
    expect(similar.status).toBe(200);
    expect(similar.body[0].signals).toContain('category');

    const relation = await request(app)
      .post(`/api/v1/purchasing/supplier-quotations/lines/${line.id}/relations`)
      .send({ relationType: 'SIMILAR', targetType: 'SKU', targetId: '44444444-4444-4444-8444-444444444444' });
    expect(relation.status).toBe(201);
    expect(relation.body.targetType).toBe('SKU');
  });

  it('converts accepted lines to draft POs', async () => {
    const res = await request(app).post(`/api/v1/purchasing/supplier-quotations/${quote.id}/convert-to-po`);
    expect(res.status).toBe(201);
    expect(res.body.purchaseOrders[0].poNumber).toBe('PO-000001');
  });

  it('maps service errors to HTTP status codes', async () => {
    mockSupplierQuotationService.create.mockResolvedValueOnce(Err({ kind: 'ConstraintViolation', message: 'bad quote' }));
    const res = await request(app)
      .post('/api/v1/purchasing/supplier-quotations')
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CONSTRAINT_VIOLATION');
  });
});
