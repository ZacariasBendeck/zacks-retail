import { Prisma } from '../../prismaClient';
import { prisma } from '../../db/prisma';
import type { CreateBalancingTransferRunV2Input } from '../../models/transferRunsV2';
import {
  loadSalesHistoryCategoryCurveSales,
  loadSalesHistoryChainCellSales,
  loadSalesHistoryMetricAggregates,
  loadSalesHistoryStoreCellSales,
} from '../transferRunSalesHistory';
import type {
  BalancingFactsV2,
  CandidateSkuRowV2,
  CategoryCurveAggregateRowV2,
  ChainCellSalesAggregateRowV2,
  InTransitInboundAggregateRowV2,
  NormalizedBalancingTransferCriteriaV2,
  StoreCellSalesAggregateRowV2,
  StoreFactV2,
  StoreMetricAggregateRowV2,
  WorkingCellStateV2,
  WorkingSkuStateV2,
} from './types';

function toNumber(value: Prisma.Decimal | number | string | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return Number(value);
}

function trimCodes(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function normalizeLimit(value: number | undefined): number | undefined {
  if (value == null || Number.isNaN(value)) return undefined;
  return Math.max(1, Math.trunc(value));
}

function uniqueSortedNumbers(values: number[]): number[] {
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0))].sort(
    (a, b) => a - b,
  );
}

function ensureMap<K, V>(map: Map<K, V>, key: K, factory: () => V): V {
  const existing = map.get(key);
  if (existing) return existing;
  const next = factory();
  map.set(key, next);
  return next;
}

export function cellKey(rowLabel: string, columnLabel: string): string {
  return `${rowLabel}::${columnLabel}`;
}

function metricKeyForSkuStore(skuId: string, storeId: number): string {
  return `${skuId}:${storeId}`;
}

function cellMetricKey(skuId: string, storeId: number, rowLabel: string, columnLabel: string): string {
  return `${skuId}:${storeId}:${rowLabel}:${columnLabel}`;
}

function chainCellMetricKey(skuId: string, rowLabel: string, columnLabel: string): string {
  return `${skuId}:${rowLabel}:${columnLabel}`;
}

function categoryCurveKey(categoryNumber: number | null, sizeType: number | null, rowLabel: string, columnLabel: string): string {
  return `${categoryNumber ?? 'null'}:${sizeType ?? 'null'}:${rowLabel}:${columnLabel}`;
}

function storeLabel(row: { number: number; description: string }): string {
  return `${row.number} - ${row.description}`;
}

function skuCodeOf(sku: CandidateSkuRowV2): string {
  return sku.code?.trim() || sku.provisionalCode.trim();
}

function startOfSalesPeriod(period: 'MONTH' | 'SEASON' | 'YEAR'): Date {
  const now = new Date();
  const start = new Date(now);
  if (period === 'MONTH') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === 'YEAR') {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  start.setDate(start.getDate() - 180);
  start.setHours(0, 0, 0, 0);
  return start;
}

function buildSkuWhere(criteria: NormalizedBalancingTransferCriteriaV2): Prisma.SkuWhereInput {
  const normalizedVendorCodes = trimCodes(criteria.vendorCodes);
  const normalizedSeasons = trimCodes(criteria.seasons);
  const normalizedGroupCodes = trimCodes(criteria.groupCodes);
  const normalizedSkuCodes = trimCodes(criteria.skuCodes);
  const normalizedStyleColors = trimCodes(criteria.styleColors);
  const normalizedKeywords = trimCodes(criteria.keywords);

  const where: Prisma.SkuWhereInput = {
    NOT: { skuState: 'DISCONTINUED' },
    code: { not: null },
  };

  const andClauses: Prisma.SkuWhereInput[] = [];

  if (normalizedVendorCodes.length > 0) {
    andClauses.push({ vendorId: { in: normalizedVendorCodes } });
  }
  if (criteria.categoryMin != null || criteria.categoryMax != null) {
    andClauses.push({
      categoryNumber: {
        gte: criteria.categoryMin ?? undefined,
        lte: criteria.categoryMax ?? undefined,
      },
    });
  }
  if (normalizedSeasons.length > 0) {
    andClauses.push({ season: { in: normalizedSeasons } });
  }
  if (normalizedGroupCodes.length > 0) {
    andClauses.push({ groupCode: { in: normalizedGroupCodes } });
  }
  if (normalizedStyleColors.length > 0) {
    andClauses.push({ styleColor: { in: normalizedStyleColors } });
  }
  if (normalizedSkuCodes.length > 0) {
    andClauses.push({
      OR: [
        { code: { in: normalizedSkuCodes } },
        { provisionalCode: { in: normalizedSkuCodes } },
      ],
    });
  }
  if (normalizedKeywords.length > 0) {
    andClauses.push({
      OR: normalizedKeywords.map((keyword) => ({
        keywords: { contains: keyword, mode: 'insensitive' as const },
      })),
    });
  }
  if (criteria.includeOriginalRetailOnly) {
    andClauses.push({
      OR: [
        { currentPriceSlot: null },
        { currentPriceSlot: 'LIST' },
        { currentPriceSlot: 'RETAIL' },
      ],
    });
  }
  if (criteria.includeMarkdownOnly) {
    andClauses.push({ currentPriceSlot: { in: ['MARKDOWN1', 'MARKDOWN2'] } });
  }
  if (criteria.includePerksOnly) {
    andClauses.push({ perks: { gt: new Prisma.Decimal(0) } });
  }
  if (andClauses.length > 0) {
    where.AND = andClauses;
  }

  return where;
}

async function loadStores(storeIds: number[] | undefined): Promise<StoreFactV2[]> {
  const where = storeIds && storeIds.length > 0
    ? { number: { in: storeIds } }
    : undefined;
  const rows = await prisma.storeMaster.findMany({
    where,
    select: {
      number: true,
      description: true,
      city: true,
      region: true,
    },
    orderBy: { number: 'asc' },
  });

  return rows.map((row) => ({
    storeId: row.number,
    storeLabel: storeLabel(row),
    city: row.city?.trim() || null,
    region: row.region ?? null,
    transferCapable: true,
  }));
}

async function loadCandidateSkus(
  criteria: NormalizedBalancingTransferCriteriaV2,
): Promise<CandidateSkuRowV2[]> {
  const limit = normalizeLimit(criteria.limit);
  const rows = await prisma.sku.findMany({
    where: buildSkuWhere(criteria),
    select: {
      id: true,
      code: true,
      provisionalCode: true,
      descriptionRics: true,
      vendorId: true,
      categoryNumber: true,
      season: true,
      styleColor: true,
      groupCode: true,
      keywords: true,
      currentCost: true,
      retailPrice: true,
      listPrice: true,
      currentPriceSlot: true,
      perks: true,
      sizeType: true,
    },
    orderBy: [{ code: 'asc' }],
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    provisionalCode: row.provisionalCode,
    descriptionRics: row.descriptionRics,
    vendorId: row.vendorId,
    categoryNumber: row.categoryNumber,
    season: row.season,
    styleColor: row.styleColor,
    groupCode: row.groupCode,
    keywords: row.keywords,
    currentCost: toNumber(row.currentCost),
    retailPrice: toNumber(row.retailPrice),
    listPrice: toNumber(row.listPrice),
    currentPriceSlot: row.currentPriceSlot,
    perks: toNumber(row.perks),
    sizeType: row.sizeType ?? null,
  }));
}

async function loadStockLevels(
  skuIds: string[],
  storeIds: number[],
): Promise<Map<string, { onHand: number; lastMovementAt: Date | null; lastReceivedAt: Date | null }>> {
  const rows = await prisma.stockLevel.findMany({
    where: {
      skuId: { in: skuIds },
      storeId: { in: storeIds },
    },
    select: {
      skuId: true,
      storeId: true,
      rowLabel: true,
      columnLabel: true,
      onHand: true,
      lastMovementAt: true,
      lastReceivedAt: true,
    },
  });

  const map = new Map<string, { onHand: number; lastMovementAt: Date | null; lastReceivedAt: Date | null }>();
  for (const row of rows) {
    map.set(cellMetricKey(row.skuId, row.storeId, row.rowLabel, row.columnLabel), {
      onHand: row.onHand,
      lastMovementAt: row.lastMovementAt ?? null,
      lastReceivedAt: row.lastReceivedAt ?? null,
    });
  }
  return map;
}

async function loadTargets(
  skuIds: string[],
  storeIds: number[],
): Promise<Map<string, { modelQty: number; maxQty: number; reorderQty: number | null }>> {
  const rows = await prisma.replenishmentTarget.findMany({
    where: {
      skuId: { in: skuIds },
      storeId: { in: storeIds },
    },
    select: {
      skuId: true,
      storeId: true,
      rowLabel: true,
      columnLabel: true,
      modelQty: true,
      maxQty: true,
      reorderQty: true,
    },
  });

  const map = new Map<string, { modelQty: number; maxQty: number; reorderQty: number | null }>();
  for (const row of rows) {
    map.set(cellMetricKey(row.skuId, row.storeId, row.rowLabel, row.columnLabel), {
      modelQty: row.modelQty ?? 0,
      maxQty: row.maxQty ?? 0,
      reorderQty: row.reorderQty ?? null,
    });
  }
  return map;
}

async function loadMetricAggregates(
  skuIds: string[],
  storeIds: number[],
  startAt: Date,
): Promise<Map<string, StoreMetricAggregateRowV2>> {
  const rows = await loadSalesHistoryMetricAggregates(skuIds, storeIds, startAt) as StoreMetricAggregateRowV2[];

  const map = new Map<string, StoreMetricAggregateRowV2>();
  for (const row of rows) {
    map.set(metricKeyForSkuStore(row.skuId, row.storeId), row);
  }
  return map;
}

async function loadStoreCellSales(
  skuIds: string[],
  storeIds: number[],
  startAt: Date,
): Promise<Map<string, number>> {
  const rows = await loadSalesHistoryStoreCellSales(skuIds, storeIds, startAt) as StoreCellSalesAggregateRowV2[];

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(cellMetricKey(row.skuId, row.storeId, row.rowLabel, row.columnLabel), Number(row.soldUnits ?? 0));
  }
  return map;
}

async function loadChainCellSales(
  skuIds: string[],
  startAt: Date,
): Promise<Map<string, number>> {
  const rows = await loadSalesHistoryChainCellSales(skuIds, startAt) as ChainCellSalesAggregateRowV2[];

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(chainCellMetricKey(row.skuId, row.rowLabel, row.columnLabel), Number(row.soldUnits ?? 0));
  }
  return map;
}

async function loadCategoryCurveSales(
  categories: Array<number | null>,
  sizeTypes: Array<number | null>,
  startAt: Date,
): Promise<Map<string, number>> {
  const validCategories = categories.filter((value): value is number => value != null);
  const validSizeTypes = sizeTypes.filter((value): value is number => value != null);
  const rows = await loadSalesHistoryCategoryCurveSales(validCategories, validSizeTypes, startAt) as CategoryCurveAggregateRowV2[];

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(categoryCurveKey(row.categoryNumber ?? null, row.sizeType ?? null, row.rowLabel, row.columnLabel), Number(row.soldUnits ?? 0));
  }
  return map;
}

async function loadInTransitInbound(
  skuIds: string[],
  storeIds: number[],
): Promise<Map<string, number>> {
  if (skuIds.length === 0 || storeIds.length === 0) return new Map();

  const rows = await prisma.$queryRawUnsafe<InTransitInboundAggregateRowV2[]>(
    `SELECT
        tl.sku_id AS "skuId",
        t.to_store_id AS "storeId",
        tl.row_label AS "rowLabel",
        tl.column_label AS "columnLabel",
        COALESCE(SUM(tl.quantity), 0)::float8 AS "quantity"
      FROM app.transfer_line tl
      JOIN app.transfer t ON t.id = tl.transfer_id
      WHERE tl.sku_id = ANY($1::uuid[])
        AND t.to_store_id = ANY($2::int[])
        AND t.status = 'IN_TRANSIT'
      GROUP BY tl.sku_id, t.to_store_id, tl.row_label, tl.column_label`,
    skuIds,
    storeIds,
  );

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(cellMetricKey(row.skuId, row.storeId, row.rowLabel, row.columnLabel), Number(row.quantity ?? 0));
  }
  return map;
}

function normalizeInput(
  input: CreateBalancingTransferRunV2Input,
  availableStoreIds: number[],
): BalancingFactsV2['input'] {
  const criteria = {
    storeIds: uniqueSortedNumbers(input.criteria?.storeIds ?? []),
    vendorCodes: trimCodes(input.criteria?.vendorCodes),
    categoryMin: input.criteria?.categoryMin ?? null,
    categoryMax: input.criteria?.categoryMax ?? null,
    seasons: trimCodes(input.criteria?.seasons),
    styleColors: trimCodes(input.criteria?.styleColors),
    skuCodes: trimCodes(input.criteria?.skuCodes),
    groupCodes: trimCodes(input.criteria?.groupCodes),
    keywords: trimCodes(input.criteria?.keywords),
    limit: normalizeLimit(input.criteria?.limit),
    includeOriginalRetailOnly: Boolean(input.criteria?.includeOriginalRetailOnly),
    includeMarkdownOnly: Boolean(input.criteria?.includeMarkdownOnly),
    includePerksOnly: Boolean(input.criteria?.includePerksOnly),
  };

  return {
    goalPreset: input.goalPreset ?? 'WEEKLY_BALANCE',
    balancingMethod: input.balancingMethod,
    performanceMetric: input.performanceMetric,
    salesPeriod: input.salesPeriod,
    sortOrder: input.sortOrder ?? 'SKU',
    tieBreakKind: input.tieBreakKind,
    tieBreakValue: input.tieBreakValue,
    transferDoublesToLowerPriority: Boolean(input.transferDoublesToLowerPriority),
    stripStoresBelowSizeCount: input.stripStoresBelowSizeCount ?? null,
    inTransitPos: Boolean(input.inTransitPos),
    allowLowConfidenceMoves: Boolean(input.allowLowConfidenceMoves),
    cooldownDays: input.cooldownDays ?? 14,
    protectDaysOverride: input.protectDaysOverride ?? null,
    criteria: {
      ...criteria,
      storeIds: criteria.storeIds.length > 0 ? criteria.storeIds : availableStoreIds,
    },
  };
}

export async function loadBalancingFactsV2(
  input: CreateBalancingTransferRunV2Input,
): Promise<BalancingFactsV2> {
  const requestedStoreIds = uniqueSortedNumbers(input.criteria?.storeIds ?? []);
  const stores = await loadStores(requestedStoreIds.length > 0 ? requestedStoreIds : undefined);
  const availableStoreIds = stores.map((store) => store.storeId);
  const normalizedInput = normalizeInput(input, availableStoreIds);
  const effectiveStoreIds = normalizedInput.criteria.storeIds;
  const skus = await loadCandidateSkus(normalizedInput.criteria);
  const skuIds = skus.map((sku) => sku.id);
  const startAt = startOfSalesPeriod(normalizedInput.salesPeriod);

  const [stockLevelMap, targetMap, metricAggregates, storeCellSales, chainCellSales, categoryCurveSales, inTransitInbound] = await Promise.all([
    loadStockLevels(skuIds, effectiveStoreIds),
    loadTargets(skuIds, effectiveStoreIds),
    loadMetricAggregates(skuIds, effectiveStoreIds, startAt),
    loadStoreCellSales(skuIds, effectiveStoreIds, startAt),
    loadChainCellSales(skuIds, startAt),
    loadCategoryCurveSales(
      skus.map((sku) => sku.categoryNumber ?? null),
      skus.map((sku) => sku.sizeType ?? null),
      startAt,
    ),
    loadInTransitInbound(skuIds, effectiveStoreIds),
  ]);

  const storeById = new Map<number, StoreFactV2>(stores.map((store) => [store.storeId, store]));
  const workingBySku = new Map<string, WorkingSkuStateV2>();

  for (const sku of skus) {
    const storeMap = new Map<number, Map<string, WorkingCellStateV2>>();
    for (const storeId of effectiveStoreIds) {
      const store = storeById.get(storeId);
      if (!store) continue;
      const cellKeys = new Set<string>();

      for (const key of [stockLevelMap, targetMap, storeCellSales, inTransitInbound].map((map) => map.keys())) {
        for (const rawKey of key) {
          if (rawKey.startsWith(`${sku.id}:${storeId}:`)) {
            cellKeys.add(rawKey.slice(`${sku.id}:${storeId}:`.length));
          }
        }
      }

      if (cellKeys.size === 0) continue;
      const cellMap = ensureMap(storeMap, storeId, () => new Map<string, WorkingCellStateV2>());

      for (const localCellKey of cellKeys) {
        const [row, col] = localCellKey.split(':');
        const globalCellKey = cellMetricKey(sku.id, storeId, row, col);
        const stockCell = stockLevelMap.get(globalCellKey);
        const target = targetMap.get(globalCellKey);
        const workingCell: WorkingCellStateV2 = {
          skuId: sku.id,
          skuCode: skuCodeOf(sku),
          storeId,
          storeLabel: store.storeLabel,
          city: store.city,
          region: store.region,
          rowLabel: row,
          columnLabel: col,
          onHand: stockCell?.onHand ?? 0,
          lastMovementAt: stockCell?.lastMovementAt ?? null,
          lastReceivedAt: stockCell?.lastReceivedAt ?? null,
          inboundQty: inTransitInbound.get(globalCellKey) ?? 0,
          reservedQty: 0,
          modelQty: target?.modelQty ?? 0,
          maxQty: target?.maxQty ?? 0,
          reorderQty: target?.reorderQty ?? null,
          storeSoldUnits: storeCellSales.get(globalCellKey) ?? 0,
          chainSoldUnits: chainCellSales.get(chainCellMetricKey(sku.id, row, col)) ?? 0,
          categoryCurveUnits: categoryCurveSales.get(categoryCurveKey(sku.categoryNumber ?? null, sku.sizeType ?? null, row, col)) ?? 0,
          forecastDailyQty: 0,
          confidence: 'LOW',
          coreSize: false,
          eligibleReceiver: false,
          presentationFloorQty: 0,
          serviceFloorQty: 0,
          targetQty: 0,
          needQty: 0,
          donorProtectQty: 0,
          spareQty: 0,
          effectiveAvailableQty: 0,
          routeBucket: null,
          metric: {
            metricValue: 0,
            displayValue: 0,
            netSoldUnits: 0,
            beginningOnHand: 0,
            endingOnHand: 0,
          },
        };
        cellMap.set(cellKey(row, col), workingCell);
      }
    }

    if (storeMap.size > 0) {
      workingBySku.set(sku.id, { sku, stores: storeMap });
    }
  }

  return {
    input: normalizedInput,
    stores,
    skus,
    workingBySku,
    metricAggregates,
    storeCellSales,
    chainCellSales,
    categoryCurveSales,
    inTransitInbound,
  };
}
