import {
  buildBuyerSalesProjectionSnapshot,
  completeBuyerSalesProjectionCard,
  linkBuyerSalesProjectionPlanDraft,
  syncBuyerSalesProjectionDraftForPlanRows,
} from '../../src/services/purchasePlanning/buyerSalesProjectionSync';

function db(rows: Array<{ yearMonth: string; currentProjSales: number }> = []) {
  return {
    $queryRawUnsafe: jest.fn(async () => rows),
    $executeRawUnsafe: jest.fn(async () => 0),
  };
}

describe('buyer sales projection sync', () => {
  it('builds a monthly projection snapshot from saved purchase-plan rows', () => {
    const snapshot = buildBuyerSalesProjectionSnapshot([
      { yearMonth: '2026-06', currentProjSales: 8 },
      { yearMonth: '2026-05', currentProjSales: 10 },
      { yearMonth: '2026-05', currentProjSales: 3 },
    ]);

    expect(snapshot).toEqual({
      months: [
        { yearMonth: '2026-05', projectedUnits: 13, projectedSales: 0 },
        { yearMonth: '2026-06', projectedUnits: 8, projectedSales: 0 },
      ],
      totalProjectedUnits: 21,
      totalProjectedSales: 0,
    });
  });

  it('syncs linked buyer cards as draft when saved worksheet rows change', async () => {
    const mockDb = db();

    await syncBuyerSalesProjectionDraftForPlanRows('plan-1', [
      { yearMonth: '2026-05', currentProjSales: 8 },
      { yearMonth: '2026-06', currentProjSales: 7 },
    ], mockDb as never);

    const cardUpdate = mockDb.$executeRawUnsafe.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE app.buyer_purchase_category_card'));
    expect(cardUpdate?.slice(1)).toEqual([
      'plan-1',
      JSON.stringify([
        { yearMonth: '2026-05', projectedUnits: 8, projectedSales: 0 },
        { yearMonth: '2026-06', projectedUnits: 7, projectedSales: 0 },
      ]),
      15,
      0,
    ]);
    expect(String(cardUpdate?.[0])).toContain('sales_projection_updated_at = NULL');
  });

  it('links a plan and writes draft projected units to the selected buyer card', async () => {
    const mockDb = db([
      { yearMonth: '2026-05', currentProjSales: 12 },
      { yearMonth: '2026-06', currentProjSales: 13 },
    ]);

    await linkBuyerSalesProjectionPlanDraft({
      workbookId: 'workbook-1',
      cardId: 'card-1',
      planId: 'plan-1',
    }, mockDb as never);

    const cardUpdate = mockDb.$executeRawUnsafe.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE app.buyer_purchase_category_card'));
    expect(cardUpdate?.slice(1)).toEqual([
      'workbook-1',
      'card-1',
      'plan-1',
      JSON.stringify([
        { yearMonth: '2026-05', projectedUnits: 12, projectedSales: 0 },
        { yearMonth: '2026-06', projectedUnits: 13, projectedSales: 0 },
      ]),
      25,
      0,
    ]);
    expect(String(cardUpdate?.[0])).toContain('sales_projection_updated_at = NULL');
  });

  it('marks a buyer card sales projection complete from the saved worksheet snapshot', async () => {
    const mockDb = db([
      { yearMonth: '2026-05', currentProjSales: 9 },
      { yearMonth: '2026-06', currentProjSales: 11 },
    ]);

    await completeBuyerSalesProjectionCard({
      workbookId: 'workbook-1',
      cardId: 'card-1',
      planId: 'plan-1',
      actor: 'buyer',
    }, mockDb as never);

    const cardUpdate = mockDb.$executeRawUnsafe.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE app.buyer_purchase_category_card'));
    expect(cardUpdate?.slice(1)).toEqual([
      'workbook-1',
      'card-1',
      'plan-1',
      JSON.stringify([
        { yearMonth: '2026-05', projectedUnits: 9, projectedSales: 0 },
        { yearMonth: '2026-06', projectedUnits: 11, projectedSales: 0 },
      ]),
      20,
      0,
      'buyer',
    ]);
    expect(String(cardUpdate?.[0])).toContain("status = CASE WHEN status = 'NOT_STARTED' THEN 'HISTORY_REVIEWED' ELSE status END");
    expect(String(cardUpdate?.[0])).toContain('sales_projection_updated_at = CURRENT_TIMESTAMP');
  });
});
