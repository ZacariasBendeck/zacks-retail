import { prisma } from '../../db/prisma';
import type { PurchasePlanSavedRow } from './types';

type DbClient = {
  $queryRawUnsafe: typeof prisma.$queryRawUnsafe;
  $executeRawUnsafe: typeof prisma.$executeRawUnsafe;
};

type ProjectionRowInput = Pick<PurchasePlanSavedRow, 'yearMonth' | 'currentProjSales'>;

export interface BuyerSalesProjectionSnapshotMonth {
  yearMonth: string;
  projectedUnits: number;
  projectedSales: number;
}

export interface BuyerSalesProjectionSnapshot {
  months: BuyerSalesProjectionSnapshotMonth[];
  totalProjectedUnits: number;
  totalProjectedSales: number;
}

export function buildBuyerSalesProjectionSnapshot(rows: ProjectionRowInput[]): BuyerSalesProjectionSnapshot {
  const unitsByMonth = new Map<string, number>();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}$/.test(row.yearMonth)) continue;
    const projectedUnits = Math.max(0, Math.round(Number(row.currentProjSales) || 0));
    unitsByMonth.set(row.yearMonth, (unitsByMonth.get(row.yearMonth) ?? 0) + projectedUnits);
  }

  const months = [...unitsByMonth.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([yearMonth, projectedUnits]) => ({
      yearMonth,
      projectedUnits,
      projectedSales: 0,
    }));

  return {
    months,
    totalProjectedUnits: months.reduce((sum, month) => sum + month.projectedUnits, 0),
    totalProjectedSales: 0,
  };
}

export async function loadBuyerSalesProjectionSnapshot(
  planId: string,
  db: DbClient = prisma,
): Promise<BuyerSalesProjectionSnapshot> {
  const rows = await db.$queryRawUnsafe<ProjectionRowInput[]>(
    `
      SELECT
        r.year_month AS "yearMonth",
        r.current_proj_sales AS "currentProjSales"
      FROM app.purchase_plan_row r
      WHERE r.plan_id = $1::uuid
      ORDER BY r.year_month
    `,
    planId,
  );
  return buildBuyerSalesProjectionSnapshot(rows);
}

export async function syncBuyerSalesProjectionDraftForPlanRows(
  planId: string,
  rows: ProjectionRowInput[],
  db: DbClient = prisma,
): Promise<void> {
  const snapshot = buildBuyerSalesProjectionSnapshot(rows);
  await writeBuyerSalesProjectionDraftForPlan(planId, snapshot, db);
}

export async function syncBuyerSalesProjectionDraftForPlan(
  planId: string,
  db: DbClient = prisma,
): Promise<void> {
  const snapshot = await loadBuyerSalesProjectionSnapshot(planId, db);
  await writeBuyerSalesProjectionDraftForPlan(planId, snapshot, db);
}

export async function linkBuyerSalesProjectionPlanDraft(input: {
  workbookId: string;
  cardId: string;
  planId: string;
}, db: DbClient = prisma): Promise<void> {
  const snapshot = await loadBuyerSalesProjectionSnapshot(input.planId, db);
  await db.$executeRawUnsafe(
    `
      UPDATE app.buyer_purchase_category_card
      SET
        sales_projection_plan_id = $3::uuid,
        sales_projection_json = $4::jsonb,
        sales_projection_units = $5::int,
        sales_projection_sales = $6,
        sales_projection_updated_by = NULL,
        sales_projection_updated_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE workbook_id = $1::uuid
        AND id = $2::uuid
    `,
    input.workbookId,
    input.cardId,
    input.planId,
    JSON.stringify(snapshot.months),
    snapshot.totalProjectedUnits,
    snapshot.totalProjectedSales,
  );
  await touchBuyerWorkbook(input.workbookId, db);
}

export async function completeBuyerSalesProjectionCard(input: {
  workbookId: string;
  cardId: string;
  planId: string;
  actor: string;
}, db: DbClient = prisma): Promise<void> {
  const snapshot = await loadBuyerSalesProjectionSnapshot(input.planId, db);
  await db.$executeRawUnsafe(
    `
      UPDATE app.buyer_purchase_category_card
      SET
        status = CASE WHEN status = 'NOT_STARTED' THEN 'HISTORY_REVIEWED' ELSE status END,
        sales_projection_plan_id = $3::uuid,
        sales_projection_json = $4::jsonb,
        sales_projection_units = $5::int,
        sales_projection_sales = $6,
        sales_projection_updated_by = $7::text,
        sales_projection_updated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE workbook_id = $1::uuid
        AND id = $2::uuid
    `,
    input.workbookId,
    input.cardId,
    input.planId,
    JSON.stringify(snapshot.months),
    snapshot.totalProjectedUnits,
    snapshot.totalProjectedSales,
    input.actor,
  );
  await touchBuyerWorkbook(input.workbookId, db);
}

async function writeBuyerSalesProjectionDraftForPlan(
  planId: string,
  snapshot: BuyerSalesProjectionSnapshot,
  db: DbClient,
): Promise<void> {
  await db.$executeRawUnsafe(
    `
      UPDATE app.buyer_purchase_category_card
      SET
        sales_projection_json = $2::jsonb,
        sales_projection_units = $3::int,
        sales_projection_sales = $4,
        sales_projection_updated_by = NULL,
        sales_projection_updated_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE sales_projection_plan_id = $1::uuid
    `,
    planId,
    JSON.stringify(snapshot.months),
    snapshot.totalProjectedUnits,
    snapshot.totalProjectedSales,
  );
  await db.$executeRawUnsafe(
    `
      UPDATE app.buyer_purchase_workbook w
      SET updated_at = CURRENT_TIMESTAMP
      WHERE EXISTS (
        SELECT 1
        FROM app.buyer_purchase_category_card c
        WHERE c.workbook_id = w.id
          AND c.sales_projection_plan_id = $1::uuid
      )
    `,
    planId,
  );
}

async function touchBuyerWorkbook(workbookId: string, db: DbClient): Promise<void> {
  await db.$executeRawUnsafe(
    `
      UPDATE app.buyer_purchase_workbook
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = $1::uuid
    `,
    workbookId,
  );
}
