import { Prisma } from '../prismaClient';
import { prisma } from '../db/prisma';
import {
  materializeTransfersFromPreview,
  type TransferCommitLine,
} from './transferRunShared';
import { loadSalesHistoryMetricAggregates } from './transferRunSalesHistory';
import { selectedCityCount, transferLaneAllowed, type TransferLaneStoreContext } from './transferLanePolicy';
import type {
  AutoTransferCriteria,
  AutoTransferPreviewLine,
  AutoTransferPreviewRecord,
  AutoTransferPreviewSummary,
  BalancingTransferCriteria,
  BalancingTransferMetricSnapshot,
  BalancingTransferPreviewLine,
  BalancingTransferPreviewRecord,
  BalancingTransferPreviewSummary,
  CommitTransferRunResult,
  CreateAutoTransferRunInput,
  CreateBalancingTransferRunInput,
  TransferPreviewCell,
  TransferPreviewException,
  TransferStoreOption,
} from '../models/transferRuns';

export class TransferRunServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isTransferRunServiceError(err: unknown): err is TransferRunServiceError {
  return err instanceof TransferRunServiceError;
}

interface CandidateSkuRow {
  id: string;
  code: string | null;
  provisionalCode: string;
  descriptionRics: string | null;
  vendorId: string | null;
  categoryNumber: number | null;
  season: string | null;
  styleColor: string | null;
  groupCode: string | null;
  keywords: string | null;
  currentCost: Prisma.Decimal | number | string | null;
  retailPrice: Prisma.Decimal | number | string | null;
  listPrice: Prisma.Decimal | number | string | null;
  currentPriceSlot: string | null;
  perks: Prisma.Decimal | number | string | null;
}

interface StockCellState {
  rowLabel: string;
  columnLabel: string;
  onHand: number;
}

interface TargetCellState {
  rowLabel: string;
  columnLabel: string;
  modelQty: number;
  maxQty: number;
  reorderQty: number | null;
}

interface WorkingCellState {
  rowLabel: string;
  columnLabel: string;
  onHand: number;
  modelQty: number;
  maxQty: number;
  reorderQty: number | null;
}

interface LegacyTransferStoreContext extends TransferLaneStoreContext {
  storeLabel: string;
}

interface MetricAggregateRow {
  skuId: string;
  storeId: number;
  netMovementQty: number | null;
  positiveMovementQty: number | null;
  netSoldUnits: number | null;
  netRevenue: number | null;
  netCost: number | null;
}

interface StoredAutoRunPayload {
  request: CreateAutoTransferRunInput;
  warehouseStoreLabel: string;
  targetStores: TransferStoreOption[];
  summary: AutoTransferPreviewSummary;
  lines: AutoTransferPreviewLine[];
  exceptions: TransferPreviewException[];
}

interface StoredBalancingRunPayload {
  request: CreateBalancingTransferRunInput;
  summary: BalancingTransferPreviewSummary;
  lines: BalancingTransferPreviewLine[];
  exceptions: TransferPreviewException[];
}

function toNumber(value: Prisma.Decimal | number | string | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return Number(value);
}

function skuCodeOf(sku: CandidateSkuRow): string {
  return sku.code?.trim() || sku.provisionalCode.trim();
}

function cellKey(rowLabel: string, columnLabel: string): string {
  return `${rowLabel}::${columnLabel}`;
}

function storeLabel(storeId: number): string {
  return `Store ${storeId}`;
}

function formatStoreOptionLabel(storeId: number, description: string | null | undefined): string {
  const trimmed = description?.trim();
  return trimmed ? `${storeId} - ${trimmed}` : storeLabel(storeId);
}

function trimCodes(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function ensureMap<K, V>(map: Map<K, V>, key: K, factory: () => V): V {
  const existing = map.get(key);
  if (existing) return existing;
  const next = factory();
  map.set(key, next);
  return next;
}

function uniqueSortedNumbers(values: number[]): number[] {
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0))].sort(
    (a, b) => a - b,
  );
}

function chunkArray<T>(values: T[], chunkSize: number): T[][] {
  if (values.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

function normalizeLimit(value: number | undefined): number | undefined {
  if (value == null || Number.isNaN(value)) return undefined;
  return Math.max(1, Math.trunc(value));
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

function applyReorderRounding(shortfall: number, reorderQty: number | null): number {
  if (!reorderQty || reorderQty <= 1) return shortfall;
  return Math.ceil(shortfall / reorderQty) * reorderQty;
}

function buildAutoPreviewSummary(
  lines: AutoTransferPreviewLine[],
  exceptions: TransferPreviewException[],
): AutoTransferPreviewSummary {
  return {
    transferCount: lines.length,
    skuCount: new Set(lines.map((line) => line.skuId)).size,
    receiverStoreCount: new Set(lines.map((line) => line.toStoreId)).size,
    totalUnits: lines.reduce((sum, line) => sum + line.suggestedQuantity, 0),
    exceptionCount: exceptions.length,
  };
}

function buildBalancingPreviewSummary(
  lines: BalancingTransferPreviewLine[],
  exceptions: TransferPreviewException[],
): BalancingTransferPreviewSummary {
  return {
    transferCount: lines.length,
    skuCount: new Set(lines.map((line) => line.skuId)).size,
    storePairCount: new Set(lines.map((line) => `${line.fromStoreId}-${line.toStoreId}`)).size,
    totalUnits: lines.reduce((sum, line) => sum + line.suggestedQuantity, 0),
    exceptionCount: exceptions.length,
  };
}

function pushException(
  bucket: TransferPreviewException[],
  exception: TransferPreviewException,
): void {
  bucket.push(exception);
}

async function listDistinctTransferStoreIds(): Promise<number[]> {
  const storeMasterRows = await prisma.storeMaster.findMany({
    where: { number: { gt: 0 } },
    select: { number: true },
    orderBy: { number: 'asc' },
  });
  if (storeMasterRows.length > 0) {
    return storeMasterRows.map((row) => row.number);
  }

  const [stockStores, targetStores] = await Promise.all([
    prisma.stockLevel.findMany({
      distinct: ['storeId'],
      select: { storeId: true },
      orderBy: { storeId: 'asc' },
    }),
    prisma.replenishmentTarget.findMany({
      distinct: ['storeId'],
      select: { storeId: true },
      orderBy: { storeId: 'asc' },
    }),
  ]);

  return uniqueSortedNumbers([
    ...stockStores.map((row) => row.storeId),
    ...targetStores.map((row) => row.storeId),
  ]);
}

export async function listTransferStores(): Promise<TransferStoreOption[]> {
  const storeMasterRows = await prisma.storeMaster.findMany({
    where: { number: { gt: 0 } },
    select: {
      number: true,
      description: true,
    },
    orderBy: { number: 'asc' },
  });
  if (storeMasterRows.length > 0) {
    return storeMasterRows.map((row) => ({
      storeId: row.number,
      storeLabel: formatStoreOptionLabel(row.number, row.description),
    }));
  }

  const storeIds = await listDistinctTransferStoreIds();
  return storeIds.map((storeId) => ({ storeId, storeLabel: storeLabel(storeId) }));
}

async function loadTransferStoreContexts(storeIds: number[]): Promise<Map<number, LegacyTransferStoreContext>> {
  if (storeIds.length === 0) return new Map<number, LegacyTransferStoreContext>();

  const rows = await prisma.storeMaster.findMany({
    where: { number: { in: storeIds } },
    select: {
      number: true,
      description: true,
      city: true,
      region: true,
    },
  });

  const contextById = new Map<number, LegacyTransferStoreContext>();
  for (const row of rows) {
    contextById.set(row.number, {
      storeId: row.number,
      storeLabel: formatStoreOptionLabel(row.number, row.description),
      city: row.city?.trim() || null,
      region: row.region ?? null,
      transferCapable: true,
    });
  }

  for (const storeId of storeIds) {
    if (!contextById.has(storeId)) {
      contextById.set(storeId, {
        storeId,
        storeLabel: storeLabel(storeId),
        city: null,
        region: null,
        transferCapable: true,
      });
    }
  }

  return contextById;
}

function buildSkuWhere(
  criteria: AutoTransferCriteria | BalancingTransferCriteria | undefined,
): Prisma.SkuWhereInput {
  const normalizedVendorCodes = trimCodes(criteria?.vendorCodes);
  const normalizedSeasons = trimCodes(criteria?.seasons);
  const normalizedGroupCodes = trimCodes(criteria?.groupCodes);
  const normalizedSkuCodes = trimCodes(criteria?.skuCodes);
  const normalizedStyleColors = 'styleColors' in (criteria ?? {}) ? trimCodes((criteria as BalancingTransferCriteria).styleColors) : [];
  const normalizedKeywords = trimCodes(criteria?.keywords);

  const where: Prisma.SkuWhereInput = {
    NOT: { skuState: 'DISCONTINUED' },
    code: { not: null },
  };

  const andClauses: Prisma.SkuWhereInput[] = [];

  if (normalizedVendorCodes.length > 0) {
    andClauses.push({ vendorId: { in: normalizedVendorCodes } });
  }
  if (criteria?.categoryMin != null || criteria?.categoryMax != null) {
    andClauses.push({
      categoryNumber: {
        gte: criteria?.categoryMin ?? undefined,
        lte: criteria?.categoryMax ?? undefined,
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

  if ('includeOriginalRetailOnly' in (criteria ?? {}) && criteria) {
    const balancing = criteria as BalancingTransferCriteria;
    if (balancing.includeOriginalRetailOnly) {
      andClauses.push({
        OR: [
          { currentPriceSlot: null },
          { currentPriceSlot: 'LIST' },
          { currentPriceSlot: 'RETAIL' },
        ],
      });
    }
    if (balancing.includeMarkdownOnly) {
      andClauses.push({ currentPriceSlot: { in: ['MARKDOWN1', 'MARKDOWN2'] } });
    }
    if (balancing.includePerksOnly) {
      andClauses.push({ perks: { gt: new Prisma.Decimal(0) } });
    }
  }

  if (andClauses.length > 0) {
    where.AND = andClauses;
  }

  return where;
}

async function loadCandidateSkus(
  criteria: AutoTransferCriteria | BalancingTransferCriteria | undefined,
): Promise<CandidateSkuRow[]> {
  const limit = normalizeLimit(criteria?.limit);
  return prisma.sku.findMany({
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
    },
    orderBy: [{ code: 'asc' }],
    take: limit,
  });
}

async function loadStockAndTargets(
  skuIds: string[],
  storeIds: number[],
): Promise<{
  stockBySku: Map<string, Map<number, Map<string, StockCellState>>>;
  targetBySku: Map<string, Map<number, Map<string, TargetCellState>>>;
}> {
  if (skuIds.length === 0 || storeIds.length === 0) {
    return {
      stockBySku: new Map(),
      targetBySku: new Map(),
    };
  }

  const stockRows: Array<{
    skuId: string;
    storeId: number;
    columnLabel: string;
    rowLabel: string;
    onHand: number;
  }> = [];
  const targetRows: Array<{
    skuId: string;
    storeId: number;
    columnLabel: string;
    rowLabel: string;
    modelQty: number | null;
    maxQty: number | null;
    reorderQty: number | null;
  }> = [];

  for (const skuChunk of chunkArray(skuIds, 2_000)) {
    const [stockChunkRows, targetChunkRows] = await Promise.all([
      prisma.stockLevel.findMany({
        where: {
          skuId: { in: skuChunk },
          storeId: { in: storeIds },
        },
        select: {
          skuId: true,
          storeId: true,
          columnLabel: true,
          rowLabel: true,
          onHand: true,
        },
      }),
      prisma.replenishmentTarget.findMany({
        where: {
          skuId: { in: skuChunk },
          storeId: { in: storeIds },
        },
        select: {
          skuId: true,
          storeId: true,
          columnLabel: true,
          rowLabel: true,
          modelQty: true,
          maxQty: true,
          reorderQty: true,
        },
      }),
    ]);

    stockRows.push(...stockChunkRows);
    targetRows.push(...targetChunkRows);
  }

  const stockBySku = new Map<string, Map<number, Map<string, StockCellState>>>();
  for (const row of stockRows) {
    const storeMap = ensureMap(stockBySku, row.skuId, () => new Map<number, Map<string, StockCellState>>());
    const cellMap = ensureMap(storeMap, row.storeId, () => new Map<string, StockCellState>());
    cellMap.set(cellKey(row.rowLabel, row.columnLabel), {
      rowLabel: row.rowLabel,
      columnLabel: row.columnLabel,
      onHand: row.onHand,
    });
  }

  const targetBySku = new Map<string, Map<number, Map<string, TargetCellState>>>();
  for (const row of targetRows) {
    const storeMap = ensureMap(targetBySku, row.skuId, () => new Map<number, Map<string, TargetCellState>>());
    const cellMap = ensureMap(storeMap, row.storeId, () => new Map<string, TargetCellState>());
    cellMap.set(cellKey(row.rowLabel, row.columnLabel), {
      rowLabel: row.rowLabel,
      columnLabel: row.columnLabel,
      modelQty: row.modelQty ?? 0,
      maxQty: row.maxQty ?? 0,
      reorderQty: row.reorderQty ?? null,
    });
  }

  return { stockBySku, targetBySku };
}

function autoSortComparator(
  sortOrder: 'SKU' | 'VENDOR' | 'CATEGORY' | 'LOCATION',
): (left: AutoTransferPreviewLine, right: AutoTransferPreviewLine) => number {
  if (sortOrder === 'VENDOR') {
    return (left, right) =>
      (left.vendorCode ?? '').localeCompare(right.vendorCode ?? '')
      || left.skuCode.localeCompare(right.skuCode)
      || left.toStoreId - right.toStoreId;
  }
  if (sortOrder === 'CATEGORY') {
    return (left, right) =>
      (left.categoryNumber ?? 0) - (right.categoryNumber ?? 0)
      || left.skuCode.localeCompare(right.skuCode)
      || left.toStoreId - right.toStoreId;
  }
  if (sortOrder === 'LOCATION') {
    return (left, right) =>
      left.toStoreId - right.toStoreId
      || left.skuCode.localeCompare(right.skuCode);
  }
  return (left, right) => left.skuCode.localeCompare(right.skuCode) || left.toStoreId - right.toStoreId;
}

function addAutoPreviewCell(
  lineBucket: Map<string, AutoTransferPreviewLine>,
  sku: CandidateSkuRow,
  fromStoreId: number,
  toStoreId: number,
  cell: TransferPreviewCell,
): void {
  const lineKey = `${sku.id}:${fromStoreId}:${toStoreId}`;
  const existing = lineBucket.get(lineKey);
  if (existing) {
    existing.cells.push(cell);
    existing.suggestedQuantity += cell.suggestedQuantity;
    return;
  }

  lineBucket.set(lineKey, {
    skuId: sku.id,
    skuCode: skuCodeOf(sku),
    description: sku.descriptionRics,
    vendorCode: sku.vendorId,
    categoryNumber: sku.categoryNumber,
    season: sku.season,
    unitCostSnapshot: toNumber(sku.currentCost) ?? 0,
    fromStoreId,
    fromStoreLabel: storeLabel(fromStoreId),
    toStoreId,
    toStoreLabel: storeLabel(toStoreId),
    suggestedQuantity: cell.suggestedQuantity,
    cells: [cell],
  });
}

function buildAutoPreview(
  skus: CandidateSkuRow[],
  stockBySku: Map<string, Map<number, Map<string, StockCellState>>>,
  targetBySku: Map<string, Map<number, Map<string, TargetCellState>>>,
  input: CreateAutoTransferRunInput,
): { lines: AutoTransferPreviewLine[]; exceptions: TransferPreviewException[] } {
  const lineBucket = new Map<string, AutoTransferPreviewLine>();
  const exceptions: TransferPreviewException[] = [];
  const targetStoreIds = uniqueSortedNumbers(input.targetStoreIds);

  for (const sku of skus) {
    const skuStock = stockBySku.get(sku.id) ?? new Map<number, Map<string, StockCellState>>();
    const skuTargets = targetBySku.get(sku.id) ?? new Map<number, Map<string, TargetCellState>>();
    const warehouseCells = skuStock.get(input.warehouseStoreId) ?? new Map<string, StockCellState>();
    const warehouseWorking = new Map<string, number>();

    for (const [key, state] of warehouseCells.entries()) {
      warehouseWorking.set(key, state.onHand);
    }

    for (const targetStoreId of targetStoreIds) {
      const targetCells = skuTargets.get(targetStoreId);
      if (!targetCells || targetCells.size === 0) continue;
      const receiverCells = skuStock.get(targetStoreId) ?? new Map<string, StockCellState>();

      const sortedTargetCells = [...targetCells.values()].sort(
        (left, right) => left.rowLabel.localeCompare(right.rowLabel) || left.columnLabel.localeCompare(right.columnLabel),
      );

      for (const targetCell of sortedTargetCells) {
        if (targetCell.modelQty <= 0) continue;
        const key = cellKey(targetCell.rowLabel, targetCell.columnLabel);
        const receiverOnHand = receiverCells.get(key)?.onHand ?? 0;
        const baseShortfall = targetCell.modelQty - receiverOnHand;
        if (baseShortfall <= 0) continue;

        const roundedShortfall = applyReorderRounding(baseShortfall, targetCell.reorderQty);
        const warehouseOnHand = warehouseWorking.get(key) ?? 0;
        // RICS Automatic Transfers only propose lines the warehouse can fully satisfy.
        // If the warehouse cannot cover the rounded shortfall for this store/cell, skip it.
        if (warehouseOnHand < roundedShortfall) continue;
        if (roundedShortfall <= 0) continue;

        addAutoPreviewCell(lineBucket, sku, input.warehouseStoreId, targetStoreId, {
          rowLabel: targetCell.rowLabel,
          columnLabel: targetCell.columnLabel,
          suggestedQuantity: roundedShortfall,
          fromOnHand: warehouseOnHand,
          toOnHand: receiverOnHand,
          fromModelQty: 0,
          toModelQty: targetCell.modelQty,
          reorderQty: targetCell.reorderQty,
        });
        warehouseWorking.set(key, warehouseOnHand - roundedShortfall);
      }
    }
  }

  const lines = [...lineBucket.values()];
  lines.sort(autoSortComparator(input.sortOrder));
  for (const line of lines) {
    line.cells.sort((left, right) => left.rowLabel.localeCompare(right.rowLabel) || left.columnLabel.localeCompare(right.columnLabel));
  }

  return { lines, exceptions };
}

function cloneWorkingCells(
  stockBySku: Map<string, Map<number, Map<string, StockCellState>>>,
  targetBySku: Map<string, Map<number, Map<string, TargetCellState>>>,
  skuId: string,
  storeIds: number[],
): Map<number, Map<string, WorkingCellState>> {
  const storeMap = new Map<number, Map<string, WorkingCellState>>();
  const skuStock = stockBySku.get(skuId) ?? new Map<number, Map<string, StockCellState>>();
  const skuTargets = targetBySku.get(skuId) ?? new Map<number, Map<string, TargetCellState>>();

  for (const storeId of storeIds) {
    const cellMap = new Map<string, WorkingCellState>();
    const stockCells = skuStock.get(storeId) ?? new Map<string, StockCellState>();
    const targetCells = skuTargets.get(storeId) ?? new Map<string, TargetCellState>();
    const keys = new Set<string>([...stockCells.keys(), ...targetCells.keys()]);
    for (const key of keys) {
      const stockCell = stockCells.get(key);
      const targetCell = targetCells.get(key);
      cellMap.set(key, {
        rowLabel: stockCell?.rowLabel ?? targetCell?.rowLabel ?? '',
        columnLabel: stockCell?.columnLabel ?? targetCell?.columnLabel ?? '',
        onHand: stockCell?.onHand ?? 0,
        modelQty: targetCell?.modelQty ?? 0,
        maxQty: targetCell?.maxQty ?? 0,
        reorderQty: targetCell?.reorderQty ?? null,
      });
    }
    if (cellMap.size > 0) {
      storeMap.set(storeId, cellMap);
    }
  }

  return storeMap;
}

async function loadMetricAggregates(
  skuIds: string[],
  storeIds: number[],
  startAt: Date,
): Promise<Map<string, MetricAggregateRow>> {
  const rows = await loadSalesHistoryMetricAggregates(skuIds, storeIds, startAt) as MetricAggregateRow[];

  const map = new Map<string, MetricAggregateRow>();
  for (const row of rows) {
    map.set(`${row.skuId}:${row.storeId}`, row);
  }
  return map;
}

function buildMetricSnapshot(
  sku: CandidateSkuRow,
  storeId: number,
  currentOnHand: number,
  metricKey: 'ROI' | 'TURNS' | 'SELL_THRU',
  aggregateMap: Map<string, MetricAggregateRow>,
): BalancingTransferMetricSnapshot {
  const aggregate = aggregateMap.get(`${sku.id}:${storeId}`);
  const netMovementQty = Number(aggregate?.netMovementQty ?? 0);
  const positiveMovementQty = Number(aggregate?.positiveMovementQty ?? 0);
  const netSoldUnits = Math.max(0, Number(aggregate?.netSoldUnits ?? 0));
  const beginningOnHand = Math.max(0, currentOnHand - netMovementQty);
  const availableQty = Math.max(1, beginningOnHand + Math.max(0, positiveMovementQty));
  const averageOnHand = Math.max(1, (beginningOnHand + currentOnHand) / 2);
  const currentCost = Math.max(0, toNumber(sku.currentCost) ?? 0);
  const retailPrice = Math.max(0, toNumber(sku.retailPrice) ?? toNumber(sku.listPrice) ?? 0);
  const revenue = Math.abs(Number(aggregate?.netRevenue ?? 0)) > 0
    ? Number(aggregate?.netRevenue ?? 0)
    : netSoldUnits * retailPrice;
  const cost = Math.abs(Number(aggregate?.netCost ?? 0)) > 0
    ? Number(aggregate?.netCost ?? 0)
    : netSoldUnits * currentCost;
  const grossProfit = revenue - cost;

  if (metricKey === 'SELL_THRU') {
    const value = netSoldUnits / availableQty;
    return {
      metricValue: value,
      displayValue: value * 100,
      netSoldUnits,
      beginningOnHand,
      endingOnHand: currentOnHand,
    };
  }

  if (metricKey === 'TURNS') {
    const value = netSoldUnits / averageOnHand;
    return {
      metricValue: value,
      displayValue: value,
      netSoldUnits,
      beginningOnHand,
      endingOnHand: currentOnHand,
    };
  }

  const inventoryInvestment = Math.max(1, averageOnHand * Math.max(1, currentCost));
  const value = grossProfit / inventoryInvestment;
  return {
    metricValue: value,
    displayValue: value * 100,
    netSoldUnits,
    beginningOnHand,
    endingOnHand: currentOnHand,
  };
}

function metricComparator(
  metricByStore: Map<number, BalancingTransferMetricSnapshot>,
  direction: 'asc' | 'desc',
): (leftStoreId: number, rightStoreId: number) => number {
  return (leftStoreId, rightStoreId) => {
    const left = metricByStore.get(leftStoreId)?.metricValue ?? 0;
    const right = metricByStore.get(rightStoreId)?.metricValue ?? 0;
    if (direction === 'desc') {
      return right - left || leftStoreId - rightStoreId;
    }
    return left - right || leftStoreId - rightStoreId;
  };
}

function meetsTieBreak(
  receiverMetric: number,
  donorMetric: number,
  kind: 'ABSOLUTE' | 'PERCENT',
  value: number,
): boolean {
  if (kind === 'ABSOLUTE') {
    return receiverMetric - donorMetric >= value;
  }
  if (Math.abs(donorMetric) < Number.EPSILON) {
    return receiverMetric > donorMetric;
  }
  return ((receiverMetric - donorMetric) / Math.abs(donorMetric)) * 100 >= value;
}

function addBalancingPreviewCell(
  bucket: Map<string, BalancingTransferPreviewLine>,
  sku: CandidateSkuRow,
  fromStoreId: number,
  toStoreId: number,
  fromMetric: BalancingTransferMetricSnapshot,
  toMetric: BalancingTransferMetricSnapshot,
  cell: TransferPreviewCell,
  reason: string,
): void {
  const lineKey = `${sku.id}:${fromStoreId}:${toStoreId}`;
  const existing = bucket.get(lineKey);
  if (existing) {
    existing.cells.push(cell);
    existing.suggestedQuantity += cell.suggestedQuantity;
    existing.fromModelQty += cell.fromModelQty;
    existing.toModelQty += cell.toModelQty;
    existing.reason = reason;
    return;
  }

  bucket.set(lineKey, {
    skuId: sku.id,
    skuCode: skuCodeOf(sku),
    description: sku.descriptionRics,
    vendorCode: sku.vendorId,
    categoryNumber: sku.categoryNumber,
    season: sku.season,
    styleColor: sku.styleColor,
    unitCostSnapshot: toNumber(sku.currentCost) ?? 0,
    fromStoreId,
    fromStoreLabel: storeLabel(fromStoreId),
    toStoreId,
    toStoreLabel: storeLabel(toStoreId),
    suggestedQuantity: cell.suggestedQuantity,
    reason,
    fromMetric,
    toMetric,
    fromModelQty: cell.fromModelQty,
    toModelQty: cell.toModelQty,
    cells: [cell],
  });
}

function maybeWarnNoSalesHistory(
  metricBySkuStore: Map<string, BalancingTransferMetricSnapshot>,
  exceptions: TransferPreviewException[],
  input: CreateBalancingTransferRunInput,
): void {
  const totalSold = [...metricBySkuStore.values()].reduce((sum, metric) => sum + metric.netSoldUnits, 0);
  if (totalSold === 0) {
    pushException(exceptions, {
      code: 'BALANCING_NO_SALES_HISTORY',
      severity: 'warning',
      message: `No imported sales history was found in app.sales_history_ticket for the selected ${input.salesPeriod.toLowerCase()} window. Priority falls back to equal metrics.`,
    });
  }
  if (input.salesPeriod === 'SEASON') {
    pushException(exceptions, {
      code: 'BALANCING_SEASON_WINDOW_APPROX',
      severity: 'warning',
      message: 'Season currently uses a rolling 180-day window until seasonal sales snapshots are promoted into app-owned inventory reporting.',
    });
  }
}

function sortBalancingLines(
  lines: BalancingTransferPreviewLine[],
  sortOrder: 'SKU' | 'VENDOR' | 'CATEGORY',
): void {
  if (sortOrder === 'VENDOR') {
    lines.sort(
      (left, right) =>
        (left.vendorCode ?? '').localeCompare(right.vendorCode ?? '')
        || left.skuCode.localeCompare(right.skuCode)
        || left.toStoreId - right.toStoreId,
    );
    return;
  }
  if (sortOrder === 'CATEGORY') {
    lines.sort(
      (left, right) =>
        (left.categoryNumber ?? 0) - (right.categoryNumber ?? 0)
        || left.skuCode.localeCompare(right.skuCode)
        || left.toStoreId - right.toStoreId,
    );
    return;
  }
  lines.sort(
    (left, right) =>
      left.skuCode.localeCompare(right.skuCode)
      || left.toStoreId - right.toStoreId
      || left.fromStoreId - right.fromStoreId,
  );
}

function buildBalancingPreview(
  skus: CandidateSkuRow[],
  stockBySku: Map<string, Map<number, Map<string, StockCellState>>>,
  targetBySku: Map<string, Map<number, Map<string, TargetCellState>>>,
  input: CreateBalancingTransferRunInput,
  storeIds: number[],
  metricAggregates: Map<string, MetricAggregateRow>,
  storeContextById: Map<number, LegacyTransferStoreContext>,
): { lines: BalancingTransferPreviewLine[]; exceptions: TransferPreviewException[] } {
  const exceptions: TransferPreviewException[] = [];
  const lineBucket = new Map<string, BalancingTransferPreviewLine>();
  const metricBySkuStore = new Map<string, BalancingTransferMetricSnapshot>();

  if (selectedCityCount(storeContextById.values()) > 1) {
    pushException(exceptions, {
      code: 'BALANCING_CITY_LANE_RESTRICTION',
      severity: 'warning',
      message: 'Cross-city transfers are currently blocked using app.store_master.city. Only same-city store pairs are eligible in this preview.',
    });
  }

  for (const sku of skus) {
    const workingStoreCells = cloneWorkingCells(stockBySku, targetBySku, sku.id, storeIds);
    if (workingStoreCells.size < 2) continue;

    const metricByStore = new Map<number, BalancingTransferMetricSnapshot>();
    for (const [storeId, cells] of workingStoreCells.entries()) {
      const currentOnHand = [...cells.values()].reduce((sum, cell) => sum + cell.onHand, 0);
      const metric = buildMetricSnapshot(sku, storeId, currentOnHand, input.performanceMetric, metricAggregates);
      metricByStore.set(storeId, metric);
      metricBySkuStore.set(`${sku.id}:${storeId}`, metric);
    }

    const workingPositiveSizeCount = new Map<number, number>();
    for (const [storeId, cells] of workingStoreCells.entries()) {
      workingPositiveSizeCount.set(
        storeId,
        [...cells.values()].filter((cell) => cell.onHand > 0).length,
      );
    }

    if (input.stripStoresBelowSizeCount != null && input.stripStoresBelowSizeCount > 0) {
      const priorityStores = [...workingStoreCells.keys()].sort(metricComparator(metricByStore, 'desc'));
      for (const donorStoreId of priorityStores.slice().reverse()) {
        const sizeCount = workingPositiveSizeCount.get(donorStoreId) ?? 0;
        if (sizeCount === 0 || sizeCount >= input.stripStoresBelowSizeCount) continue;
        const donorCells = workingStoreCells.get(donorStoreId);
        if (!donorCells) continue;
        for (const donorCell of donorCells.values()) {
          if (donorCell.onHand <= 0) continue;
          const receiverStoreId = priorityStores.find((candidateStoreId) => {
            if (candidateStoreId === donorStoreId) return false;
            if (!transferLaneAllowed(storeContextById.get(donorStoreId), storeContextById.get(candidateStoreId))) return false;
            const candidateCells = workingStoreCells.get(candidateStoreId);
            const candidateCell = candidateCells?.get(cellKey(donorCell.rowLabel, donorCell.columnLabel));
            return (candidateCell?.onHand ?? 0) === 0;
          });
          if (receiverStoreId == null) {
            pushException(exceptions, {
              code: 'BALANCING_STRIP_NO_RECEIVER',
              severity: 'warning',
              message: `No receiver was available when stripping ${skuCodeOf(sku)} from store ${donorStoreId}.`,
              skuId: sku.id,
              skuCode: skuCodeOf(sku),
              fromStoreId: donorStoreId,
              rowLabel: donorCell.rowLabel,
              columnLabel: donorCell.columnLabel,
            });
            continue;
          }

          const receiverCells = workingStoreCells.get(receiverStoreId)!;
          const receiverKey = cellKey(donorCell.rowLabel, donorCell.columnLabel);
          const receiverCell = receiverCells.get(receiverKey) ?? {
            rowLabel: donorCell.rowLabel,
            columnLabel: donorCell.columnLabel,
            onHand: 0,
            modelQty: 0,
            maxQty: 0,
            reorderQty: donorCell.reorderQty,
          };
          receiverCells.set(receiverKey, receiverCell);

          addBalancingPreviewCell(
            lineBucket,
            sku,
            donorStoreId,
            receiverStoreId,
            metricByStore.get(donorStoreId)!,
            metricByStore.get(receiverStoreId)!,
            {
              rowLabel: donorCell.rowLabel,
              columnLabel: donorCell.columnLabel,
              suggestedQuantity: donorCell.onHand,
              fromOnHand: donorCell.onHand,
              toOnHand: receiverCell.onHand,
              fromModelQty: donorCell.modelQty,
              toModelQty: receiverCell.modelQty,
              reorderQty: donorCell.reorderQty,
            },
            `Strip skeleton stock from store ${donorStoreId} (< ${input.stripStoresBelowSizeCount} sizes on hand).`,
          );

          receiverCell.onHand += donorCell.onHand;
          donorCell.onHand = 0;
        }
      }
    }

    const allCellKeys = new Set<string>();
    for (const cells of workingStoreCells.values()) {
      for (const key of cells.keys()) allCellKeys.add(key);
    }

    const hasAnyModel = [...workingStoreCells.values()].some((cells) =>
      [...cells.values()].some((cell) => cell.modelQty > 0),
    );
    if (input.balancingMethod === 'OVER_UNDER_MODELS' && !hasAnyModel) {
      continue;
    }
    if (input.balancingMethod === 'WITHOUT_MODELS' && hasAnyModel) {
      continue;
    }

    for (const key of allCellKeys) {
      const cellStates = [...workingStoreCells.entries()].map(([storeId, cells]) => {
        const state = cells.get(key) ?? {
          rowLabel: '',
          columnLabel: '',
          onHand: 0,
          modelQty: 0,
          maxQty: 0,
          reorderQty: null,
        };
        return { storeId, state };
      });
      if (cellStates.length < 2) continue;

      const rowLabel = cellStates[0]?.state.rowLabel ?? '';
      const columnLabel = cellStates[0]?.state.columnLabel ?? '';

      for (const entry of cellStates) {
        if (entry.state.onHand < 0) {
          pushException(exceptions, {
            code: 'BALANCING_NEGATIVE_ON_HAND',
            severity: 'warning',
            message: `Skipped ${skuCodeOf(sku)} ${rowLabel || '∅'} ${columnLabel || '∅'} at store ${entry.storeId} because on hand is negative.`,
            skuId: sku.id,
            skuCode: skuCodeOf(sku),
            fromStoreId: entry.storeId,
            rowLabel,
            columnLabel,
          });
        }
      }

      if (input.balancingMethod === 'OVER_UNDER_MODELS') {
        const donors = cellStates
          .filter(({ state }) => state.modelQty > 0 && state.onHand > state.modelQty && state.onHand >= 0)
          .sort((left, right) => metricComparator(metricByStore, 'asc')(left.storeId, right.storeId));
        const receivers = cellStates
          .filter(({ state }) => state.modelQty > 0 && state.onHand < state.modelQty && state.onHand >= 0)
          .sort((left, right) => metricComparator(metricByStore, 'desc')(left.storeId, right.storeId));

        for (const receiver of receivers) {
          let remainingNeed = receiver.state.modelQty - receiver.state.onHand;
          if (remainingNeed <= 0) continue;
          for (const donor of donors) {
            if (donor.storeId === receiver.storeId) continue;
            if (!transferLaneAllowed(storeContextById.get(donor.storeId), storeContextById.get(receiver.storeId))) continue;
            const donorMetric = metricByStore.get(donor.storeId)?.metricValue ?? 0;
            const receiverMetric = metricByStore.get(receiver.storeId)?.metricValue ?? 0;
            if (!meetsTieBreak(receiverMetric, donorMetric, input.tieBreakKind, input.tieBreakValue)) continue;
            const surplus = donor.state.onHand - donor.state.modelQty;
            if (surplus <= 0) continue;
            const moveQty = Math.min(surplus, remainingNeed);
            if (moveQty <= 0) continue;
            addBalancingPreviewCell(
              lineBucket,
              sku,
              donor.storeId,
              receiver.storeId,
              metricByStore.get(donor.storeId)!,
              metricByStore.get(receiver.storeId)!,
              {
                rowLabel,
                columnLabel,
                suggestedQuantity: moveQty,
                fromOnHand: donor.state.onHand,
                toOnHand: receiver.state.onHand,
                fromModelQty: donor.state.modelQty,
                toModelQty: receiver.state.modelQty,
                reorderQty: donor.state.reorderQty,
              },
              `Receiver is under model and outranks donor by the selected ${input.performanceMetric} tie-break.`,
            );
            donor.state.onHand -= moveQty;
            receiver.state.onHand += moveQty;
            remainingNeed -= moveQty;
            if (remainingNeed <= 0) break;
          }
        }
      } else {
        const donors = cellStates
          .filter(({ state }) => state.onHand >= 2)
          .sort((left, right) => metricComparator(metricByStore, 'asc')(left.storeId, right.storeId));
        const receivers = cellStates
          .filter(({ state }) => state.onHand === 0)
          .sort((left, right) => metricComparator(metricByStore, 'desc')(left.storeId, right.storeId));

        for (const receiver of receivers) {
          for (const donor of donors) {
            if (donor.storeId === receiver.storeId) continue;
            if (donor.state.onHand < 2) continue;
            if (!transferLaneAllowed(storeContextById.get(donor.storeId), storeContextById.get(receiver.storeId))) continue;
            const donorMetric = metricByStore.get(donor.storeId)?.metricValue ?? 0;
            const receiverMetric = metricByStore.get(receiver.storeId)?.metricValue ?? 0;
            if (!meetsTieBreak(receiverMetric, donorMetric, input.tieBreakKind, input.tieBreakValue)) continue;
            addBalancingPreviewCell(
              lineBucket,
              sku,
              donor.storeId,
              receiver.storeId,
              metricByStore.get(donor.storeId)!,
              metricByStore.get(receiver.storeId)!,
              {
                rowLabel,
                columnLabel,
                suggestedQuantity: 1,
                fromOnHand: donor.state.onHand,
                toOnHand: receiver.state.onHand,
                fromModelQty: donor.state.modelQty,
                toModelQty: receiver.state.modelQty,
                reorderQty: donor.state.reorderQty,
              },
              input.balancingMethod === 'WITHOUT_MODELS'
                ? 'SKU has no models; single unit moved from lower-priority donor to higher-priority zero store.'
                : 'Single unit moved to a higher-priority zero store without considering models.',
            );
            donor.state.onHand -= 1;
            receiver.state.onHand += 1;
            break;
          }
        }
      }
    }

    if (input.transferDoublesToLowerPriority) {
      const allCellKeysForDownwardPass = new Set<string>();
      for (const cells of workingStoreCells.values()) {
        for (const key of cells.keys()) allCellKeysForDownwardPass.add(key);
      }
      const priorityStores = [...workingStoreCells.keys()].sort(metricComparator(metricByStore, 'desc'));
      for (const key of allCellKeysForDownwardPass) {
        for (let donorIndex = 0; donorIndex < priorityStores.length; donorIndex++) {
          const donorStoreId = priorityStores[donorIndex]!;
          const donorCells = workingStoreCells.get(donorStoreId)!;
          const donorCell = donorCells.get(key);
          if (!donorCell || donorCell.onHand < 2) continue;
          const receiverStoreId = priorityStores.slice(donorIndex + 1).find((candidateStoreId) => {
            if (!transferLaneAllowed(storeContextById.get(donorStoreId), storeContextById.get(candidateStoreId))) return false;
            const candidateCell = workingStoreCells.get(candidateStoreId)?.get(key);
            return (candidateCell?.onHand ?? 0) === 0;
          });
          if (receiverStoreId == null) continue;
          const receiverCells = workingStoreCells.get(receiverStoreId)!;
          const receiverCell = receiverCells.get(key) ?? {
            rowLabel: donorCell.rowLabel,
            columnLabel: donorCell.columnLabel,
            onHand: 0,
            modelQty: 0,
            maxQty: 0,
            reorderQty: donorCell.reorderQty,
          };
          receiverCells.set(key, receiverCell);
          addBalancingPreviewCell(
            lineBucket,
            sku,
            donorStoreId,
            receiverStoreId,
            metricByStore.get(donorStoreId)!,
            metricByStore.get(receiverStoreId)!,
            {
              rowLabel: donorCell.rowLabel,
              columnLabel: donorCell.columnLabel,
              suggestedQuantity: 1,
              fromOnHand: donorCell.onHand,
              toOnHand: receiverCell.onHand,
              fromModelQty: donorCell.modelQty,
              toModelQty: receiverCell.modelQty,
              reorderQty: donorCell.reorderQty,
            },
            'Transfer doubles to lower-priority stores was enabled; donor shared a single extra unit downward.',
          );
          donorCell.onHand -= 1;
          receiverCell.onHand += 1;
        }
      }
    }
  }

  maybeWarnNoSalesHistory(metricBySkuStore, exceptions, input);

  const lines = [...lineBucket.values()];
  sortBalancingLines(lines, input.sortOrder ?? 'SKU');
  for (const line of lines) {
    line.cells.sort((left, right) => left.rowLabel.localeCompare(right.rowLabel) || left.columnLabel.localeCompare(right.columnLabel));
  }
  return { lines, exceptions };
}

function buildAutoRecordFromStored(
  row: {
    id: string;
    status: string;
    warehouseStoreId: number;
    sortOrder: 'SKU' | 'VENDOR' | 'CATEGORY' | 'LOCATION';
    inTransitPos: boolean;
    requestedBy: string;
    createdAt: Date;
    previewedAt: Date | null;
    committedAt: Date | null;
    generatedTransferIds: string[];
    criteriaJson: Prisma.JsonValue;
  },
): AutoTransferPreviewRecord {
  const payload = row.criteriaJson as unknown as StoredAutoRunPayload;
  return {
    id: row.id,
    status: row.status as AutoTransferPreviewRecord['status'],
    warehouseStoreId: row.warehouseStoreId,
    warehouseStoreLabel: payload.warehouseStoreLabel,
    targetStores: payload.targetStores,
    sortOrder: row.sortOrder,
    inTransitPos: row.inTransitPos,
    criteria: payload.request.criteria ?? {},
    summary: payload.summary,
    lines: payload.lines,
    exceptions: payload.exceptions,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    previewedAt: row.previewedAt?.toISOString() ?? null,
    committedAt: row.committedAt?.toISOString() ?? null,
    generatedTransferIds: row.generatedTransferIds,
  };
}

function buildBalancingRecordFromStored(
  row: {
    id: string;
    status: string;
    balancingMethod: 'OVER_UNDER_MODELS' | 'WITHOUT_MODELS' | 'WITHOUT_CONSIDERING_MODELS';
    performanceMetric: 'ROI' | 'TURNS' | 'SELL_THRU';
    salesPeriod: 'MONTH' | 'SEASON' | 'YEAR';
    tieBreakKind: 'ABSOLUTE' | 'PERCENT';
    tieBreakValue: Prisma.Decimal;
    transferDoublesToLowerPriority: boolean;
    stripStoresBelowSizeCount: number | null;
    inTransitPos: boolean;
    requestedBy: string;
    createdAt: Date;
    previewedAt: Date | null;
    committedAt: Date | null;
    generatedTransferIds: string[];
    criteriaJson: Prisma.JsonValue;
    exceptionsJson: Prisma.JsonValue | null;
  },
): BalancingTransferPreviewRecord {
  const payload = row.criteriaJson as unknown as StoredBalancingRunPayload;
  const exceptions = row.exceptionsJson
    ? (row.exceptionsJson as unknown as TransferPreviewException[])
    : payload.exceptions;
  return {
    id: row.id,
    status: row.status as BalancingTransferPreviewRecord['status'],
    balancingMethod: row.balancingMethod,
    performanceMetric: row.performanceMetric,
    salesPeriod: row.salesPeriod,
    sortOrder: payload.request.sortOrder ?? 'SKU',
    tieBreakKind: row.tieBreakKind,
    tieBreakValue: Number(row.tieBreakValue),
    transferDoublesToLowerPriority: row.transferDoublesToLowerPriority,
    stripStoresBelowSizeCount: row.stripStoresBelowSizeCount,
    inTransitPos: row.inTransitPos,
    criteria: payload.request.criteria ?? {},
    summary: payload.summary,
    lines: payload.lines,
    exceptions,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    previewedAt: row.previewedAt?.toISOString() ?? null,
    committedAt: row.committedAt?.toISOString() ?? null,
    generatedTransferIds: row.generatedTransferIds,
  };
}

export async function createAutoTransferRun(
  input: CreateAutoTransferRunInput,
  actorOverride?: string | null,
): Promise<AutoTransferPreviewRecord> {
  const warehouseStoreId = Number(input.warehouseStoreId);
  const targetStoreIds = uniqueSortedNumbers(input.targetStoreIds);
  if (targetStoreIds.length === 0) {
    throw new TransferRunServiceError(422, 'TARGET_STORES_REQUIRED', 'Select at least one target store.');
  }
  if (targetStoreIds.includes(warehouseStoreId)) {
    throw new TransferRunServiceError(422, 'AUTO_TRANSFER_STORE_COLLISION', 'Warehouse store cannot also be a target store.');
  }

  const requestedBy = actorOverride?.trim() || 'system';
  const criteria: AutoTransferCriteria = {
    vendorCodes: trimCodes(input.criteria?.vendorCodes),
    categoryMin: input.criteria?.categoryMin ?? null,
    categoryMax: input.criteria?.categoryMax ?? null,
    seasons: trimCodes(input.criteria?.seasons),
    groupCodes: trimCodes(input.criteria?.groupCodes),
    keywords: trimCodes(input.criteria?.keywords),
    skuCodes: trimCodes(input.criteria?.skuCodes),
    limit: normalizeLimit(input.criteria?.limit),
  };

  const skus = await loadCandidateSkus(criteria);
  const storeIds = uniqueSortedNumbers([warehouseStoreId, ...targetStoreIds]);
  const { stockBySku, targetBySku } = await loadStockAndTargets(
    skus.map((sku) => sku.id),
    storeIds,
  );
  const { lines, exceptions } = buildAutoPreview(skus, stockBySku, targetBySku, {
    ...input,
    targetStoreIds,
    criteria,
  });

  if (criteria.limit != null && skus.length >= criteria.limit) {
    pushException(exceptions, {
      code: 'AUTO_SKU_LIMIT_REACHED',
      severity: 'warning',
      message: `Preview hit the explicit SKU limit at ${criteria.limit.toLocaleString()} SKUs. Narrow criteria if results look truncated.`,
    });
  }

  const summary = buildAutoPreviewSummary(lines, exceptions);
  const previewedAt = new Date();
  const row = await prisma.autoTransferRun.create({
    data: {
      status: 'PREVIEWED',
      warehouseStoreId,
      targetStoreIds,
      sortOrder: input.sortOrder,
      criteriaJson: ({
        request: {
          ...input,
          targetStoreIds,
          criteria,
        },
        warehouseStoreLabel: storeLabel(warehouseStoreId),
        targetStores: targetStoreIds.map((storeId) => ({ storeId, storeLabel: storeLabel(storeId) })),
        summary,
        lines,
        exceptions,
      } as unknown) as Prisma.InputJsonValue,
      inTransitPos: Boolean(input.inTransitPos),
      requestedBy,
      previewedAt,
    },
    select: {
      id: true,
      status: true,
      warehouseStoreId: true,
      sortOrder: true,
      inTransitPos: true,
      requestedBy: true,
      createdAt: true,
      previewedAt: true,
      committedAt: true,
      generatedTransferIds: true,
      criteriaJson: true,
    },
  });

  return buildAutoRecordFromStored(row);
}

export async function getAutoTransferRunPreview(id: string): Promise<AutoTransferPreviewRecord | null> {
  const row = await prisma.autoTransferRun.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      warehouseStoreId: true,
      sortOrder: true,
      inTransitPos: true,
      requestedBy: true,
      createdAt: true,
      previewedAt: true,
      committedAt: true,
      generatedTransferIds: true,
      criteriaJson: true,
    },
  });
  if (!row) return null;
  return buildAutoRecordFromStored(row);
}

export async function commitAutoTransferRun(id: string): Promise<CommitTransferRunResult> {
  const row = await prisma.autoTransferRun.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      requestedBy: true,
      inTransitPos: true,
      createdAt: true,
      committedAt: true,
      generatedTransferIds: true,
      criteriaJson: true,
    },
  });
  if (!row) {
    throw new TransferRunServiceError(404, 'AUTO_TRANSFER_RUN_NOT_FOUND', 'Automatic transfer preview not found.');
  }

  const payload = row.criteriaJson as unknown as StoredAutoRunPayload;
  if (!payload?.lines) {
    throw new TransferRunServiceError(500, 'AUTO_TRANSFER_PREVIEW_MISSING', 'Automatic transfer preview payload is missing.');
  }

  if (row.status === 'COMMITTED') {
    return {
      runId: row.id,
      status: 'COMMITTED',
      generatedTransferIds: row.generatedTransferIds,
      totalTransfers: row.generatedTransferIds.length,
      totalUnits: payload.summary.totalUnits,
      committedAt: row.committedAt?.toISOString() ?? row.createdAt.toISOString(),
    };
  }

  const committedAt = new Date();
  const generatedTransferIds = await prisma.$transaction(async (tx) => {
    return materializeTransfersFromPreview(tx, {
      origin: 'AUTO',
      originRunId: row.id,
      requestedBy: row.requestedBy,
      committedAt,
      inTransitPos: row.inTransitPos,
      lines: payload.lines.map((line) => ({
        skuId: line.skuId,
        skuCode: line.skuCode,
        unitCostSnapshot: line.unitCostSnapshot,
        fromStoreId: line.fromStoreId,
        toStoreId: line.toStoreId,
        cells: line.cells,
      })),
      makeSourceConflictError: (line) =>
        new TransferRunServiceError(
          409,
          'TRANSFER_SOURCE_CONFLICT',
          `Source stock changed before commit for ${line.skuCode} at store ${line.fromStoreId}. Recompute the preview.`,
        ),
    });
  });

  await prisma.autoTransferRun.update({
    where: { id: row.id },
    data: {
      status: 'COMMITTED',
      committedAt,
      generatedTransferIds,
    },
  });

  return {
    runId: row.id,
    status: 'COMMITTED',
    generatedTransferIds,
    totalTransfers: generatedTransferIds.length,
    totalUnits: payload.summary.totalUnits,
    committedAt: committedAt.toISOString(),
  };
}

export async function createBalancingTransferRun(
  input: CreateBalancingTransferRunInput,
  actorOverride?: string | null,
): Promise<BalancingTransferPreviewRecord> {
  const requestedBy = actorOverride?.trim() || 'system';
  const criteria: BalancingTransferCriteria = {
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

  if (criteria.includeOriginalRetailOnly && criteria.includeMarkdownOnly) {
    throw new TransferRunServiceError(
      422,
      'BALANCING_PRICE_FILTER_CONFLICT',
      'Select either original retail only or markdown only, not both.',
    );
  }

  const availableStores = await listDistinctTransferStoreIds();
  const effectiveStoreIds = criteria.storeIds && criteria.storeIds.length > 0
    ? criteria.storeIds
    : availableStores;
  if (effectiveStoreIds.length < 2) {
    throw new TransferRunServiceError(422, 'BALANCING_STORES_REQUIRED', 'Select at least two stores.');
  }

  const normalizedInput: CreateBalancingTransferRunInput = {
    ...input,
    sortOrder: input.sortOrder ?? 'SKU',
    criteria,
  };
  const storeContextById = await loadTransferStoreContexts(effectiveStoreIds);

  const skus = await loadCandidateSkus(criteria);
  const { stockBySku, targetBySku } = await loadStockAndTargets(
    skus.map((sku) => sku.id),
    effectiveStoreIds,
  );
  const metricAggregates = await loadMetricAggregates(
    skus.map((sku) => sku.id),
    effectiveStoreIds,
    startOfSalesPeriod(input.salesPeriod),
  );
  const { lines, exceptions } = buildBalancingPreview(
    skus,
    stockBySku,
    targetBySku,
    normalizedInput,
    effectiveStoreIds,
    metricAggregates,
    storeContextById,
  );

  if (criteria.limit != null && skus.length >= criteria.limit) {
    pushException(exceptions, {
      code: 'BALANCING_SKU_LIMIT_REACHED',
      severity: 'warning',
      message: `Preview hit the explicit SKU limit at ${criteria.limit.toLocaleString()} SKUs. Narrow criteria if results look truncated.`,
    });
  }

  const summary = buildBalancingPreviewSummary(lines, exceptions);
  const previewedAt = new Date();
  const row = await prisma.balancingTransferRun.create({
    data: {
      status: 'PREVIEWED',
      balancingMethod: input.balancingMethod,
      performanceMetric: input.performanceMetric,
      salesPeriod: input.salesPeriod,
      tieBreakKind: input.tieBreakKind,
      tieBreakValue: new Prisma.Decimal(input.tieBreakValue),
      transferDoublesToLowerPriority: Boolean(input.transferDoublesToLowerPriority),
      stripStoresBelowSizeCount: input.stripStoresBelowSizeCount ?? null,
      criteriaJson: ({
        request: normalizedInput,
        summary,
        lines,
        exceptions,
      } as unknown) as Prisma.InputJsonValue,
      inTransitPos: Boolean(input.inTransitPos),
      requestedBy,
      previewedAt,
      exceptionsJson: exceptions as unknown as Prisma.InputJsonValue,
    },
    select: {
      id: true,
      status: true,
      balancingMethod: true,
      performanceMetric: true,
      salesPeriod: true,
      tieBreakKind: true,
      tieBreakValue: true,
      transferDoublesToLowerPriority: true,
      stripStoresBelowSizeCount: true,
      inTransitPos: true,
      requestedBy: true,
      createdAt: true,
      previewedAt: true,
      committedAt: true,
      generatedTransferIds: true,
      criteriaJson: true,
      exceptionsJson: true,
    },
  });

  return buildBalancingRecordFromStored(row);
}

export async function getBalancingTransferRunPreview(
  id: string,
): Promise<BalancingTransferPreviewRecord | null> {
  const row = await prisma.balancingTransferRun.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      balancingMethod: true,
      performanceMetric: true,
      salesPeriod: true,
      tieBreakKind: true,
      tieBreakValue: true,
      transferDoublesToLowerPriority: true,
      stripStoresBelowSizeCount: true,
      inTransitPos: true,
      requestedBy: true,
      createdAt: true,
      previewedAt: true,
      committedAt: true,
      generatedTransferIds: true,
      criteriaJson: true,
      exceptionsJson: true,
    },
  });
  if (!row) return null;
  return buildBalancingRecordFromStored(row);
}

export async function commitBalancingTransferRun(id: string): Promise<CommitTransferRunResult> {
  const row = await prisma.balancingTransferRun.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      requestedBy: true,
      inTransitPos: true,
      createdAt: true,
      committedAt: true,
      generatedTransferIds: true,
      criteriaJson: true,
    },
  });
  if (!row) {
    throw new TransferRunServiceError(404, 'BALANCING_TRANSFER_RUN_NOT_FOUND', 'Balancing transfer preview not found.');
  }

  const payload = row.criteriaJson as unknown as StoredBalancingRunPayload;
  if (!payload?.lines) {
    throw new TransferRunServiceError(500, 'BALANCING_PREVIEW_MISSING', 'Balancing transfer preview payload is missing.');
  }

  if (row.status === 'COMMITTED') {
    return {
      runId: row.id,
      status: 'COMMITTED',
      generatedTransferIds: row.generatedTransferIds,
      totalTransfers: row.generatedTransferIds.length,
      totalUnits: payload.summary.totalUnits,
      committedAt: row.committedAt?.toISOString() ?? row.createdAt.toISOString(),
    };
  }

  const committedAt = new Date();
  const generatedTransferIds = await prisma.$transaction(async (tx) => {
    return materializeTransfersFromPreview(tx, {
      origin: 'BALANCING',
      originRunId: row.id,
      requestedBy: row.requestedBy,
      committedAt,
      inTransitPos: row.inTransitPos,
      lines: payload.lines.map((line) => ({
        skuId: line.skuId,
        skuCode: line.skuCode,
        unitCostSnapshot: line.unitCostSnapshot,
        fromStoreId: line.fromStoreId,
        toStoreId: line.toStoreId,
        cells: line.cells,
      })),
      makeSourceConflictError: (line) =>
        new TransferRunServiceError(
          409,
          'TRANSFER_SOURCE_CONFLICT',
          `Source stock changed before commit for ${line.skuCode} at store ${line.fromStoreId}. Recompute the preview.`,
        ),
    });
  });

  await prisma.balancingTransferRun.update({
    where: { id: row.id },
    data: {
      status: 'COMMITTED',
      committedAt,
      generatedTransferIds,
    },
  });

  return {
    runId: row.id,
    status: 'COMMITTED',
    generatedTransferIds,
    totalTransfers: generatedTransferIds.length,
    totalUnits: payload.summary.totalUnits,
    committedAt: committedAt.toISOString(),
  };
}
