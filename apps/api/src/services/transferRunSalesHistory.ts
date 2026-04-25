import { prisma } from '../db/prisma';

export interface SalesHistoryMetricAggregateRow {
  skuId: string;
  storeId: number;
  netMovementQty: number | null;
  positiveMovementQty: number | null;
  netSoldUnits: number | null;
  netRevenue: number | null;
  netCost: number | null;
}

export interface SalesHistoryStoreCellAggregateRow {
  skuId: string;
  storeId: number;
  rowLabel: string;
  columnLabel: string;
  soldUnits: number;
}

export interface SalesHistoryChainCellAggregateRow {
  skuId: string;
  rowLabel: string;
  columnLabel: string;
  soldUnits: number;
}

export interface SalesHistoryCategoryCurveAggregateRow {
  categoryNumber: number | null;
  sizeType: number | null;
  rowLabel: string;
  columnLabel: string;
  soldUnits: number;
}

export async function loadSalesHistoryMetricAggregates(
  skuIds: string[],
  storeIds: number[],
  startAt: Date,
): Promise<SalesHistoryMetricAggregateRow[]> {
  if (skuIds.length === 0 || storeIds.length === 0) return [];

  return prisma.$queryRawUnsafe<SalesHistoryMetricAggregateRow[]>(
    `SELECT
        l.sku_id AS "skuId",
        t.store_id AS "storeId",
        COALESCE(SUM(CASE
          WHEN l.is_return THEN ABS(l.quantity)
          ELSE -ABS(l.quantity)
        END), 0)::float8 AS "netMovementQty",
        COALESCE(SUM(CASE
          WHEN l.is_return THEN ABS(l.quantity)
          ELSE 0
        END), 0)::float8 AS "positiveMovementQty",
        COALESCE(SUM(CASE
          WHEN l.is_return THEN -ABS(l.quantity)
          ELSE ABS(l.quantity)
        END), 0)::float8 AS "netSoldUnits",
        COALESCE(SUM(CASE
          WHEN l.is_return THEN -ABS(l.net_amount)
          ELSE ABS(l.net_amount)
        END), 0)::float8 AS "netRevenue",
        COALESCE(SUM(CASE
          WHEN l.is_return THEN -ABS(l.cost_amount)
          ELSE ABS(l.cost_amount)
        END), 0)::float8 AS "netCost"
      FROM app.sales_history_ticket_line l
      JOIN app.sales_history_ticket t ON t.id = l.ticket_id
      WHERE l.sku_id = ANY($1::uuid[])
        AND t.store_id = ANY($2::int[])
        AND t.status = 'completed'
        AND t.purchased_at >= $3
      GROUP BY l.sku_id, t.store_id`,
    skuIds,
    storeIds,
    startAt,
  );
}

export async function loadSalesHistoryStoreCellSales(
  skuIds: string[],
  storeIds: number[],
  startAt: Date,
): Promise<SalesHistoryStoreCellAggregateRow[]> {
  if (skuIds.length === 0 || storeIds.length === 0) return [];

  return prisma.$queryRawUnsafe<SalesHistoryStoreCellAggregateRow[]>(
    `SELECT
        l.sku_id AS "skuId",
        t.store_id AS "storeId",
        COALESCE(l.row_label, '') AS "rowLabel",
        COALESCE(l.column_label, '') AS "columnLabel",
        COALESCE(SUM(CASE
          WHEN l.is_return THEN -ABS(l.quantity)
          ELSE ABS(l.quantity)
        END), 0)::float8 AS "soldUnits"
      FROM app.sales_history_ticket_line l
      JOIN app.sales_history_ticket t ON t.id = l.ticket_id
      WHERE l.sku_id = ANY($1::uuid[])
        AND t.store_id = ANY($2::int[])
        AND t.status = 'completed'
        AND t.purchased_at >= $3
      GROUP BY l.sku_id, t.store_id, COALESCE(l.row_label, ''), COALESCE(l.column_label, '')`,
    skuIds,
    storeIds,
    startAt,
  );
}

export async function loadSalesHistoryChainCellSales(
  skuIds: string[],
  startAt: Date,
): Promise<SalesHistoryChainCellAggregateRow[]> {
  if (skuIds.length === 0) return [];

  return prisma.$queryRawUnsafe<SalesHistoryChainCellAggregateRow[]>(
    `SELECT
        l.sku_id AS "skuId",
        COALESCE(l.row_label, '') AS "rowLabel",
        COALESCE(l.column_label, '') AS "columnLabel",
        COALESCE(SUM(CASE
          WHEN l.is_return THEN -ABS(l.quantity)
          ELSE ABS(l.quantity)
        END), 0)::float8 AS "soldUnits"
      FROM app.sales_history_ticket_line l
      JOIN app.sales_history_ticket t ON t.id = l.ticket_id
      WHERE l.sku_id = ANY($1::uuid[])
        AND t.status = 'completed'
        AND t.purchased_at >= $2
      GROUP BY l.sku_id, COALESCE(l.row_label, ''), COALESCE(l.column_label, '')`,
    skuIds,
    startAt,
  );
}

export async function loadSalesHistoryCategoryCurveSales(
  categories: number[],
  sizeTypes: number[],
  startAt: Date,
): Promise<SalesHistoryCategoryCurveAggregateRow[]> {
  if (categories.length === 0 || sizeTypes.length === 0) return [];

  return prisma.$queryRawUnsafe<SalesHistoryCategoryCurveAggregateRow[]>(
    `SELECT
        s.category_number AS "categoryNumber",
        s.size_type AS "sizeType",
        COALESCE(l.row_label, '') AS "rowLabel",
        COALESCE(l.column_label, '') AS "columnLabel",
        COALESCE(SUM(CASE
          WHEN l.is_return THEN -ABS(l.quantity)
          ELSE ABS(l.quantity)
        END), 0)::float8 AS "soldUnits"
      FROM app.sales_history_ticket_line l
      JOIN app.sales_history_ticket t ON t.id = l.ticket_id
      JOIN app.sku s ON s.id = l.sku_id
      WHERE s.category_number = ANY($1::int[])
        AND s.size_type = ANY($2::smallint[])
        AND t.status = 'completed'
        AND t.purchased_at >= $3
      GROUP BY s.category_number, s.size_type, COALESCE(l.row_label, ''), COALESCE(l.column_label, '')`,
    categories,
    sizeTypes,
    startAt,
  );
}
