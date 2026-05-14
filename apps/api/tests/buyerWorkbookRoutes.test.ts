import express from 'express';
import request from 'supertest';
import purchasePlanningRoutes from '../src/routes/purchasePlanningRoutes';
import {
  addCarryoverLine,
  addPlannedStyle,
  bulkUpdateStoreCategoryCarrying,
  createModelLineFromCandidate,
  copySeedModel,
  createBuyerWorkbook,
  flagCandidateUnavailable,
  flagCarryoverUnavailable,
  getBuyerWorkbook,
  linkPurchaseOrder,
  listBuyerChecklistCategories,
  listCarryoverCandidates,
  listBuyerWorkbooks,
  listStoreCategoryCarrying,
  markBuyerChecklistCategoriesNoBudget,
  markBuyerChecklistCategoryNoBudget,
  reopenBuyerChecklistCategoriesBudget,
  reopenBuyerChecklistCategoryBudget,
  updateAttributePlan,
  updateBuyerCategoryCard,
  updateCarryoverCandidate,
  updateCarryoverLine,
  updateNewStyleTargets,
} from '../src/services/purchasePlanning/buyerWorkbookService';

jest.mock('../src/services/purchasePlanning/buyerWorkbookService', () => ({
  addCarryoverLine: jest.fn(),
  addPlannedStyle: jest.fn(),
  archiveBuyerWorkbook: jest.fn(),
  bulkUpdateStoreCategoryCarrying: jest.fn(),
  copySeedModel: jest.fn(),
  createModelLineFromCandidate: jest.fn(),
  createBuyerWorkbook: jest.fn(),
  deletePlannedStyle: jest.fn(),
  flagCandidateUnavailable: jest.fn(),
  flagCarryoverUnavailable: jest.fn(),
  getBuyerWorkbook: jest.fn(),
  isBuyerWorkbookServiceError: (err: unknown) =>
    Boolean((err as { isBuyerWorkbookServiceError?: boolean })?.isBuyerWorkbookServiceError),
  linkPurchaseOrder: jest.fn(),
  listBuyerChecklistCategories: jest.fn(),
  listCarryoverCandidates: jest.fn(),
  listBuyerWorkbooks: jest.fn(),
  listStoreCategoryCarrying: jest.fn(),
  markBuyerChecklistCategoriesNoBudget: jest.fn(),
  markBuyerChecklistCategoryNoBudget: jest.fn(),
  reopenBuyerChecklistCategoriesBudget: jest.fn(),
  reopenBuyerChecklistCategoryBudget: jest.fn(),
  unlinkPurchaseOrder: jest.fn(),
  updateAttributePlan: jest.fn(),
  updateBuyerCategoryCard: jest.fn(),
  updateCarryoverCandidate: jest.fn(),
  updateCarryoverLine: jest.fn(),
  updateNewStyleTargets: jest.fn(),
  updatePlannedStyle: jest.fn(),
}));

const service = {
  addCarryoverLine: addCarryoverLine as jest.Mock,
  addPlannedStyle: addPlannedStyle as jest.Mock,
  bulkUpdateStoreCategoryCarrying: bulkUpdateStoreCategoryCarrying as jest.Mock,
  copySeedModel: copySeedModel as jest.Mock,
  createModelLineFromCandidate: createModelLineFromCandidate as jest.Mock,
  createBuyerWorkbook: createBuyerWorkbook as jest.Mock,
  flagCandidateUnavailable: flagCandidateUnavailable as jest.Mock,
  flagCarryoverUnavailable: flagCarryoverUnavailable as jest.Mock,
  getBuyerWorkbook: getBuyerWorkbook as jest.Mock,
  linkPurchaseOrder: linkPurchaseOrder as jest.Mock,
  listBuyerChecklistCategories: listBuyerChecklistCategories as jest.Mock,
  listCarryoverCandidates: listCarryoverCandidates as jest.Mock,
  listBuyerWorkbooks: listBuyerWorkbooks as jest.Mock,
  listStoreCategoryCarrying: listStoreCategoryCarrying as jest.Mock,
  markBuyerChecklistCategoriesNoBudget: markBuyerChecklistCategoriesNoBudget as jest.Mock,
  markBuyerChecklistCategoryNoBudget: markBuyerChecklistCategoryNoBudget as jest.Mock,
  reopenBuyerChecklistCategoriesBudget: reopenBuyerChecklistCategoriesBudget as jest.Mock,
  reopenBuyerChecklistCategoryBudget: reopenBuyerChecklistCategoryBudget as jest.Mock,
  updateAttributePlan: updateAttributePlan as jest.Mock,
  updateBuyerCategoryCard: updateBuyerCategoryCard as jest.Mock,
  updateCarryoverCandidate: updateCarryoverCandidate as jest.Mock,
  updateCarryoverLine: updateCarryoverLine as jest.Mock,
  updateNewStyleTargets: updateNewStyleTargets as jest.Mock,
};

function app() {
  const server = express();
  server.use(express.json());
  server.use('/api/v1/purchase-planning', purchasePlanningRoutes);
  return server;
}

function detail() {
  return {
    workbook: {
      id: 'workbook-1',
      label: 'Fall/Winter 2026',
      status: 'DRAFT',
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
      seasonMonths: ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01'],
      seedStoreId: 20,
      targetStoreIds: [20, 21],
      buyer: 'buyer',
      createdBy: 'buyer',
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
      archivedAt: null,
    },
    cards: [{ id: 'card-1', status: 'NOT_STARTED', categoryNumber: 11 }],
    storePlans: [],
    carryoverCandidates: [],
    carryovers: [],
    plannedStyles: [],
    attributePlans: [],
    poLinks: [],
  };
}

describe('buyer workbook purchase-planning routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists and creates buyer workbooks', async () => {
    service.listBuyerWorkbooks.mockResolvedValue([{ id: 'workbook-1', label: 'FW', cardCount: 1, completeCount: 0 }]);
    service.createBuyerWorkbook.mockResolvedValue(detail());

    const list = await request(app()).get('/api/v1/purchase-planning/buyer-workbooks?status=all');
    const created = await request(app())
      .post('/api/v1/purchase-planning/buyer-workbooks')
      .send({
        label: 'FW 2026 Smoking',
        buyingSeason: 'FALL_WINTER',
        seasonYear: 2026,
        seedStoreId: 20,
        targetStoreIds: [20, 21],
        categoryNumbers: [11],
        buyer: 'buyer',
      });

    expect(list.status).toBe(200);
    expect(list.body.workbooks).toHaveLength(1);
    expect(service.listBuyerWorkbooks).toHaveBeenCalledWith({ status: 'all' });
    expect(created.status).toBe(201);
    expect(service.createBuyerWorkbook).toHaveBeenCalledWith(expect.objectContaining({
      buyingSeason: 'FALL_WINTER',
      seedStoreId: 20,
      categoryNumbers: [11],
    }));
  });

  it('lists buyer checklist categories for the landing dashboard', async () => {
    service.listBuyerChecklistCategories.mockResolvedValue([
      {
        categoryNumber: 262,
        categoryLabel: '262 - Category',
        departmentNumber: 56,
        departmentLabel: '56 - ZAP',
        last12MonthsSales: 1000,
        currentInventoryUnits: 20,
        currentSeason: { workbookId: null, cardId: null, status: null },
        nextSeason: { workbookId: null, cardId: null, status: null },
        followingSeason: { workbookId: null, cardId: null, status: null },
        action: 'START_REVIEW',
      },
    ]);

    const res = await request(app()).get('/api/v1/purchase-planning/buyer-checklist/categories?buyingSeason=FALL_WINTER&seasonYear=2026');

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(service.listBuyerChecklistCategories).toHaveBeenCalledWith({
      buyer: undefined,
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
      includeNoBudget: false,
    });
  });

  it('marks and reopens no-budget buyer checklist categories', async () => {
    service.markBuyerChecklistCategoryNoBudget.mockResolvedValue({
      categoryNumber: 262,
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
      status: 'NO_BUDGET',
      noBudgetId: 'no-budget-1',
    });
    service.reopenBuyerChecklistCategoryBudget.mockResolvedValue({
      categoryNumber: 262,
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
      status: 'REOPENED',
      noBudgetId: null,
    });

    const noBudget = await request(app())
      .post('/api/v1/purchase-planning/buyer-checklist/categories/no-budget')
      .send({
        categoryNumber: 262,
        buyingSeason: 'FALL_WINTER',
        seasonYear: 2026,
        buyer: 'buyer',
        actor: 'buyer',
      });
    const reopen = await request(app())
      .post('/api/v1/purchase-planning/buyer-checklist/categories/reopen')
      .send({
        categoryNumber: 262,
        buyingSeason: 'FALL_WINTER',
        seasonYear: 2026,
        buyer: 'buyer',
        actor: 'buyer',
      });

    expect(noBudget.status).toBe(200);
    expect(noBudget.body.result.status).toBe('NO_BUDGET');
    expect(service.markBuyerChecklistCategoryNoBudget).toHaveBeenCalledWith(expect.objectContaining({
      categoryNumber: 262,
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
      buyer: 'buyer',
      actor: 'buyer',
    }));
    expect(reopen.status).toBe(200);
    expect(reopen.body.result.status).toBe('REOPENED');
    expect(service.reopenBuyerChecklistCategoryBudget).toHaveBeenCalledWith(expect.objectContaining({
      categoryNumber: 262,
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
    }));
  });

  it('marks no-budget categories in bulk', async () => {
    service.markBuyerChecklistCategoriesNoBudget.mockResolvedValue([
      { categoryNumber: 262, buyingSeason: 'FALL_WINTER', seasonYear: 2026, status: 'NO_BUDGET', noBudgetId: 'no-budget-1' },
      { categoryNumber: 560, buyingSeason: 'FALL_WINTER', seasonYear: 2026, status: 'NO_BUDGET', noBudgetId: 'no-budget-2' },
    ]);
    service.reopenBuyerChecklistCategoriesBudget.mockResolvedValue([
      { categoryNumber: 262, buyingSeason: 'FALL_WINTER', seasonYear: 2026, status: 'REOPENED', noBudgetId: null },
      { categoryNumber: 560, buyingSeason: 'FALL_WINTER', seasonYear: 2026, status: 'REOPENED', noBudgetId: null },
    ]);

    const noBudget = await request(app())
      .post('/api/v1/purchase-planning/buyer-checklist/categories/no-budget/bulk')
      .send({
        categoryNumbers: [262, 560],
        buyingSeason: 'FALL_WINTER',
        seasonYear: 2026,
        actor: 'buyer',
      });
    const reopen = await request(app())
      .post('/api/v1/purchase-planning/buyer-checklist/categories/reopen/bulk')
      .send({
        categoryNumbers: [262, 560],
        buyingSeason: 'FALL_WINTER',
        seasonYear: 2026,
        actor: 'buyer',
      });

    expect(noBudget.status).toBe(200);
    expect(noBudget.body.results).toHaveLength(2);
    expect(service.markBuyerChecklistCategoriesNoBudget).toHaveBeenCalledWith(expect.objectContaining({
      categoryNumbers: [262, 560],
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
    }));
    expect(reopen.status).toBe(200);
    expect(reopen.body.results).toHaveLength(2);
    expect(service.reopenBuyerChecklistCategoriesBudget).toHaveBeenCalledWith(expect.objectContaining({
      categoryNumbers: [262, 560],
    }));
  });

  it('can include no-budget rows in the landing dashboard', async () => {
    service.listBuyerChecklistCategories.mockResolvedValue([]);

    const res = await request(app()).get('/api/v1/purchase-planning/buyer-checklist/categories?buyingSeason=FALL_WINTER&seasonYear=2026&includeNoBudget=true');

    expect(res.status).toBe(200);
    expect(service.listBuyerChecklistCategories).toHaveBeenCalledWith({
      buyer: undefined,
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
      includeNoBudget: true,
    });
  });

  it('updates category cards and copies the seed model', async () => {
    service.updateBuyerCategoryCard.mockResolvedValue(detail());
    service.copySeedModel.mockResolvedValue(detail());

    const update = await request(app())
      .patch('/api/v1/purchase-planning/buyer-workbooks/workbook-1/cards/card-1')
      .send({
        status: 'HISTORY_REVIEWED',
        targetNewSkuCount: 4,
        targetCarryoverSkuCount: 11,
        salesProjections: [
          { yearMonth: '2025-08', projectedUnits: 30, projectedSales: 61496 },
          { yearMonth: '2025-09', projectedUnits: 32, projectedSales: 65000 },
        ],
        actor: 'buyer',
      });
    const copy = await request(app())
      .post('/api/v1/purchase-planning/buyer-workbooks/workbook-1/cards/card-1/copy-model')
      .send({ targetStoreIds: [21], actor: 'buyer' });

    expect(update.status).toBe(200);
    expect(service.updateBuyerCategoryCard).toHaveBeenCalledWith('workbook-1', 'card-1', expect.objectContaining({
      status: 'HISTORY_REVIEWED',
      targetNewSkuCount: 4,
      salesProjections: [
        { yearMonth: '2025-08', projectedUnits: 30, projectedSales: 61496 },
        { yearMonth: '2025-09', projectedUnits: 32, projectedSales: 65000 },
      ],
    }));
    expect(copy.status).toBe(200);
    expect(service.copySeedModel).toHaveBeenCalledWith('workbook-1', 'card-1', { targetStoreIds: [21], actor: 'buyer' });
  });

  it('adds carryovers, flags unavailable replacements, and adds planned styles', async () => {
    service.addCarryoverLine.mockResolvedValue(detail());
    service.flagCarryoverUnavailable.mockResolvedValue(detail());
    service.addPlannedStyle.mockResolvedValue(detail());

    const carryover = await request(app())
      .post('/api/v1/purchase-planning/buyer-workbooks/workbook-1/cards/card-1/carryovers')
      .send({ skuCode: 'ABC123', totalQuantity: 12 });
    const unavailable = await request(app())
      .post('/api/v1/purchase-planning/buyer-workbooks/workbook-1/carryovers/line-1/unavailable')
      .send({ reason: 'Fabric unavailable', actor: 'buyer' });
    const style = await request(app())
      .post('/api/v1/purchase-planning/buyer-workbooks/workbook-1/cards/card-1/planned-styles')
      .send({ vendorCode: 'VEN', workingStyle: 'New style', targetUnits: 24 });

    expect(carryover.status).toBe(201);
    expect(service.addCarryoverLine).toHaveBeenCalledWith('workbook-1', 'card-1', expect.objectContaining({ skuCode: 'ABC123' }));
    expect(unavailable.status).toBe(200);
    expect(service.flagCarryoverUnavailable).toHaveBeenCalledWith('workbook-1', 'line-1', { reason: 'Fabric unavailable', actor: 'buyer' });
    expect(style.status).toBe(201);
    expect(service.addPlannedStyle).toHaveBeenCalledWith('workbook-1', 'card-1', expect.objectContaining({ workingStyle: 'New style' }));
  });

  it('reviews carryover candidates and creates model/replacement lines', async () => {
    service.listCarryoverCandidates.mockResolvedValue([{ id: 'candidate-1', skuCode: 'ABC123' }]);
    service.updateCarryoverCandidate.mockResolvedValue(detail());
    service.createModelLineFromCandidate.mockResolvedValue(detail());
    service.flagCandidateUnavailable.mockResolvedValue(detail());
    service.updateCarryoverLine.mockResolvedValue(detail());
    service.updateNewStyleTargets.mockResolvedValue(detail());
    service.updateAttributePlan.mockResolvedValue(detail());

    const candidates = await request(app())
      .get('/api/v1/purchase-planning/buyer-workbooks/workbook-1/cards/card-1/carryover-candidates');
    const decision = await request(app())
      .patch('/api/v1/purchase-planning/buyer-workbooks/workbook-1/carryover-candidates/candidate-1')
      .send({ decision: 'WINNER', actor: 'buyer' });
    const model = await request(app())
      .post('/api/v1/purchase-planning/buyer-workbooks/workbook-1/carryover-candidates/candidate-1/create-model-line')
      .send({ actor: 'buyer' });
    const unavailable = await request(app())
      .post('/api/v1/purchase-planning/buyer-workbooks/workbook-1/carryover-candidates/candidate-1/unavailable')
      .send({ reason: 'Fabric unavailable', actor: 'buyer' });
    const line = await request(app())
      .patch('/api/v1/purchase-planning/buyer-workbooks/workbook-1/carryovers/line-1')
      .send({ sizeCells: [{ rowLabel: '8', columnLabel: 'M', quantity: 2, plannedQty: 3 }], actor: 'buyer' });
    const targets = await request(app())
      .patch('/api/v1/purchase-planning/buyer-workbooks/workbook-1/cards/card-1/new-style-targets')
      .send({ replacementStyleTargetCount: 1, additionalNewStyleTargetCount: 4, totalNewStyleTargetCount: 5, actor: 'buyer' });
    const attributePlan = await request(app())
      .patch('/api/v1/purchase-planning/buyer-workbooks/workbook-1/cards/card-1/attribute-plan')
      .send({
        actor: 'buyer',
        rows: [{
          dimensionCode: 'color',
          dimensionLabel: 'Color',
          valueCode: 'black',
          valueLabel: 'Black',
          plannedStyleCount: 2,
        }],
      });

    expect(candidates.status).toBe(200);
    expect(service.listCarryoverCandidates).toHaveBeenCalledWith('workbook-1', 'card-1');
    expect(decision.status).toBe(200);
    expect(service.updateCarryoverCandidate).toHaveBeenCalledWith('workbook-1', 'candidate-1', { decision: 'WINNER', actor: 'buyer' });
    expect(model.status).toBe(201);
    expect(service.createModelLineFromCandidate).toHaveBeenCalledWith('workbook-1', 'candidate-1', { actor: 'buyer' });
    expect(unavailable.status).toBe(200);
    expect(service.flagCandidateUnavailable).toHaveBeenCalledWith('workbook-1', 'candidate-1', { reason: 'Fabric unavailable', actor: 'buyer' });
    expect(line.status).toBe(200);
    expect(service.updateCarryoverLine).toHaveBeenCalledWith('workbook-1', 'line-1', expect.objectContaining({ actor: 'buyer' }));
    expect(targets.status).toBe(200);
    expect(service.updateNewStyleTargets).toHaveBeenCalledWith('workbook-1', 'card-1', expect.objectContaining({ totalNewStyleTargetCount: 5 }));
    expect(attributePlan.status).toBe(200);
    expect(service.updateAttributePlan).toHaveBeenCalledWith('workbook-1', 'card-1', expect.objectContaining({ actor: 'buyer' }));
  });

  it('links purchase orders and manages store-category carrying', async () => {
    service.linkPurchaseOrder.mockResolvedValue(detail());
    service.listStoreCategoryCarrying.mockResolvedValue([{ storeId: 20, categoryNumber: 11, carries: true }]);
    service.bulkUpdateStoreCategoryCarrying.mockResolvedValue([{ storeId: 20, categoryNumber: 11, carries: false }]);

    const po = await request(app())
      .post('/api/v1/purchase-planning/buyer-workbooks/workbook-1/po-links')
      .send({ cardId: 'card-1', plannedStyleId: 'style-1', poId: 'po-1', quantity: 24, linkedBy: 'buyer' });
    const carryingList = await request(app()).get('/api/v1/purchase-planning/store-category-carrying?categoryNumber=11');
    const carryingUpdate = await request(app())
      .put('/api/v1/purchase-planning/store-category-carrying/bulk')
      .send({ categoryNumber: 11, storeIds: [20], carries: false, updatedBy: 'buyer' });

    expect(po.status).toBe(201);
    expect(service.linkPurchaseOrder).toHaveBeenCalledWith('workbook-1', expect.objectContaining({ poId: 'po-1' }));
    expect(carryingList.status).toBe(200);
    expect(service.listStoreCategoryCarrying).toHaveBeenCalledWith(11);
    expect(carryingUpdate.status).toBe(200);
    expect(service.bulkUpdateStoreCategoryCarrying).toHaveBeenCalledWith(expect.objectContaining({ categoryNumber: 11, storeIds: [20] }));
  });

  it('maps buyer workbook service errors', async () => {
    service.flagCarryoverUnavailable.mockRejectedValue({
      isBuyerWorkbookServiceError: true,
      status: 400,
      code: 'REASON_REQUIRED',
      message: 'Unavailable reason is required.',
    });

    const res = await request(app())
      .post('/api/v1/purchase-planning/buyer-workbooks/workbook-1/carryovers/line-1/unavailable')
      .send({ reason: 'Vendor discontinued' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
  });
});
