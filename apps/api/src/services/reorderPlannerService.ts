import { prisma } from '../db/prisma';
import { logger } from '../observability/logger';
import { traceStep } from '../observability/requestContext';
import { getInventoryInquiry } from './ricsInventoryFacade';
import { appendPurchaseOrderLineItem, createPurchaseOrder } from './purchaseOrderService';
import { getCasePackByCode } from './casePackService';
import {
  getDemandSourceSkusForReplacementSkuId,
  getReplacementContextBySkuId,
  type DemandSourceSku,
} from './products/skuReplacementService';
import type { PoLineItem, PurchaseOrder } from '../models/purchaseOrder';
import {
  currentYearMonth,
  forecastSeasonalDemand,
  getDepartmentSeasonalityRow,
  indexesByCalendarMonth,
  lastCompletedYearMonth,
  nextYearMonths,
  resolveDepartmentForCategory,
  type MonthQuantity,
} from './seasonalityIndexService';

const DEFAULT_LEAD_TIME_DAYS = 90;
const DEFAULT_ORDER_CYCLE_DAYS = 90;
const DEFAULT_MOQ_QTY = 0;
const AVERAGE_DAYS_PER_MONTH = 365 / 12;
const REORDER_PLAN_MAX_CONCURRENT = Math.max(1, Math.trunc(Number(process.env.REORDER_PLAN_MAX_CONCURRENT ?? 1)));

type CurveSource = 'SKU_SALES' | 'CATEGORY_SALES' | 'MODEL' | 'PREVIOUS_ORDER' | 'NONE';
type DefaultsScope = 'SKU' | 'VENDOR' | 'DEFAULT';

export interface SkuRow {
  id: string;
  sku_code: string;
  vendor_id: string | null;
  category_number: number | null;
  size_type: number | null;
  order_multiple: number | null;
  current_cost: unknown;
  retail_price: unknown;
  description: string | null;
  sku_state: string;
}

interface ChainCandidate {
  chainId: string | null;
  chainLabel: string;
  storeNumbers: number[];
  source: 'TOTAL' | 'MATCHING_SET' | 'STORE_MODEL' | 'FALLBACK';
}

interface MutableSizeLine {
  key: string;
  rowLabel: string;
  columnLabel: string;
  sizeLabel: string;
  onHand: number;
  currentOnOrder: number;
  futureOnOrder: number;
  modelQty: number;
  modelShort: number;
  skuSalesQty: number;
  skuMonthlySales: Map<string, number>;
  categorySalesQty: number;
  previousOrderQty: number;
  curvePct: number;
  curveSource: CurveSource;
  forecastDemandQty: number;
  baselineMonthlyDemand: number;
  activeDemandMonths: number;
  projectedSales: number;
  recommendedQty: number;
}

export interface MonthlySizeSalesRow {
  year_month: string;
  column_label: string;
  row_label: string;
  qty: unknown;
}

export interface MonthlyStoreSizeSalesRow extends MonthlySizeSalesRow {
  store_id: unknown;
}

interface CasePackRow {
  code: string;
  description: string | null;
  column_label: string | null;
  row_label: string | null;
  quantity: unknown;
}

interface VendorDraftPoRow {
  po_id: string;
  po_number: string;
  updated_at: Date | string | null;
  line_count: unknown;
  total_quantity: unknown;
}

interface CasePackSupplierUsage {
  usageCount: number;
  lastUsedAt: string | null;
}

interface CasePackCategoryUsage {
  skuCount: number;
  usageCount: number;
  lastUsedAt: string | null;
}

let activeReorderPlanBuilds = 0;
const reorderPlanWaiters: Array<() => void> = [];

interface ReorderPlanTimingEntry {
  name: string;
  ms: number;
}

export interface ReorderCasePackCell {
  rowLabel: string;
  columnLabel: string;
  sizeLabel: string;
  quantity: number;
}

export interface ReorderCasePackCandidate {
  code: string;
  description: string | null;
  unitsPerPack: number;
  cells: ReorderCasePackCell[];
  supplierUsed?: boolean;
  supplierUsageCount?: number;
  supplierLastUsedAt?: string | null;
  sameSkuPreviousPack?: boolean;
  categorySkuCount?: number;
  categoryUsageCount?: number;
  categoryLastUsedAt?: string | null;
}

export type ReorderCasePackBadge = 'PREVIOUS_SKU' | 'CATEGORY_USED' | 'BEST_FIT';

export interface ReorderCasePackSuggestion {
  code: string;
  description: string | null;
  multiplier: number;
  unitsPerPack: number;
  totalUnits: number;
  autoApply: boolean;
  overbuyQty: number;
  overbuyLimitQty: number;
  supplierUsed: boolean;
  supplierUsageCount: number;
  supplierLastUsedAt: string | null;
  sameSkuPreviousPack: boolean;
  shortageQty: number;
  excessQty: number;
  differenceQty: number;
  sizeCells: ReorderCasePackCell[];
}

export interface ReorderCasePackChoice extends ReorderCasePackSuggestion {
  categoryUsed: boolean;
  categorySkuCount: number;
  categoryUsageCount: number;
  categoryLastUsedAt: string | null;
  badges: ReorderCasePackBadge[];
}

export interface VendorDraftPoSummary {
  poId: string;
  poNumber: string;
  updatedAt: string;
  lineCount: number;
  totalQuantity: number;
}

export interface ReorderPlannerDefaults {
  scope: DefaultsScope;
  scopeKey: string | null;
  leadTimeDays: number;
  orderCycleDays: number;
  moqQty: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface ReorderPlanSizeLine {
  rowLabel: string;
  columnLabel: string;
  sizeLabel: string;
  onHand: number;
  currentOnOrder: number;
  futureOnOrder: number;
  onOrder: number;
  modelQty: number;
  modelShort: number;
  skuSalesQty: number;
  categorySalesQty: number;
  previousOrderQty: number;
  curvePct: number;
  curveSource: CurveSource;
  forecastDemandQty: number;
  baselineMonthlyDemand: number;
  activeDemandMonths: number;
  projectedSales: number;
  recommendedQty: number;
}

export interface ReorderPlanChain {
  chainId: string | null;
  chainLabel: string;
  source: ChainCandidate['source'];
  storeNumbers: number[];
  storeCount: number;
  totals: {
    onHand: number;
    currentOnOrder: number;
    futureOnOrder: number;
    modelQty: number;
    modelShort: number;
    skuSalesQty: number;
    categorySalesQty: number;
    previousOrderQty: number;
    forecastDemandQty: number;
    projectedSales: number;
    recommendedQty: number;
  };
  previousOrder: {
    poNumber: string | null;
    orderDate: string | null;
    source: 'NATIVE' | 'LEGACY' | null;
    casePackId: string | null;
    casePackMultiplier: number | null;
  };
  casePackSuggestion: ReorderCasePackSuggestion | null;
  casePackChoices: ReorderCasePackChoice[];
  sizeLines: ReorderPlanSizeLine[];
}

export interface ReorderPlan {
  sku: {
    id: string;
    code: string;
    description: string | null;
    vendorCode: string | null;
    category: number | null;
    sizeTypeCode: number | null;
    orderMultiple: number | null;
    unitCost: number;
    retailPrice: number;
  };
  planning: {
    analysisDate: string;
    leadTimeDays: number;
    orderCycleDays: number;
    coverageDays: number;
    moqQty: number;
    salesLookbackDays: number;
    forecastMonths: string[];
    forecastStartMonth: string;
    seasonalityHistoryEndMonth: string;
  };
  seasonality: {
    basis: 'DEPARTMENT_ALL_STORES';
    departmentNumber: number | null;
    departmentLabel: string | null;
    averageMonthlyQty: number;
    sampleMonths: number;
    indexes: Array<{ month: number; label: string; index: number; rawSalesQty: number }>;
  };
  vendorDraftPo: {
    poId: string;
    poNumber: string;
    updatedAt: string;
    lineCount: number;
    totalQuantity: number;
  } | null;
  demandSources: DemandSourceSku[];
  defaults: ReorderPlannerDefaults;
  chains: ReorderPlanChain[];
  warnings: string[];
}

export interface ReorderPlanOptions {
  leadTimeDays?: number | null;
  orderCycleDays?: number | null;
  moqQty?: number | null;
}

export interface SaveReorderDefaultsInput {
  scopeType?: 'SKU' | 'VENDOR';
  leadTimeDays?: number | null;
  orderCycleDays?: number | null;
  moqQty?: number | null;
  updatedBy?: string | null;
}

export interface CreateReorderDraftPoInput extends ReorderPlanOptions {
  chainId?: string | null;
  chainLabel?: string | null;
  casePackId?: string | null;
  casePackMultiplier?: number | null;
  sizeCells: Array<{ rowLabel?: string | null; columnLabel?: string | null; quantity: number }>;
  createdBy?: string | null;
}

export interface ReorderDraftPoResult {
  poId: string;
  poNumber: string;
  totalQuantity: number;
  mode: 'CREATED' | 'APPENDED';
  appendedToExistingPo: boolean;
  purchaseOrder: PurchaseOrder;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function reorderPlanSlowThresholdMs(): number {
  const raw = Number(process.env.REORDER_PLAN_SLOW_MS ?? 1_000);
  return Number.isFinite(raw) && raw >= 0 ? raw : 1_000;
}

async function timeReorderPlanStep<T>(
  timings: ReorderPlanTimingEntry[],
  name: string,
  loader: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await traceStep(`reorderPlan.${name}`, loader);
  } finally {
    timings.push({ name, ms: Date.now() - startedAt });
  }
}

function logSlowReorderPlan(
  sku: string,
  totalMs: number,
  timings: ReorderPlanTimingEntry[],
  error?: unknown,
): void {
  const thresholdMs = reorderPlanSlowThresholdMs();
  if (totalMs < thresholdMs) return;

  logger.warn(
    {
      event: 'reorder_plan.slow',
      sku,
      totalMs,
      thresholdMs,
      steps: timings.map((entry) => ({ name: entry.name, ms: entry.ms })),
      error: error instanceof Error ? error.message : undefined,
    },
    'slow reorder plan',
  );
}

function asNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clampPositiveInt(value: number | null | undefined, fallback: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(730, n);
}

function clampNonNegativeInt(value: number | null | undefined, fallback: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(100000, n);
}

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function acquireReorderPlanSlot(): Promise<() => void> {
  if (activeReorderPlanBuilds < REORDER_PLAN_MAX_CONCURRENT) {
    activeReorderPlanBuilds += 1;
    return releaseReorderPlanSlot;
  }
  await new Promise<void>((resolve) => {
    reorderPlanWaiters.push(resolve);
  });
  activeReorderPlanBuilds += 1;
  return releaseReorderPlanSlot;
}

function releaseReorderPlanSlot(): void {
  activeReorderPlanBuilds = Math.max(0, activeReorderPlanBuilds - 1);
  const next = reorderPlanWaiters.shift();
  if (next) next();
}

function isTemporaryDatabaseResourceError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return message.includes('Code: `53100`')
    || message.includes('could not resize shared memory segment')
    || message.includes('No space left on device');
}

function sizeKey(columnLabel: string | null | undefined, rowLabel: string | null | undefined): string {
  return `${(rowLabel ?? '').trim()}|${(columnLabel ?? '').trim()}`;
}

function sizeLabel(columnLabel: string, rowLabel: string): string {
  if (columnLabel && rowLabel) return `${columnLabel}/${rowLabel}`;
  return rowLabel || columnLabel || 'ONE SIZE';
}

function sameSizeLabel(left: string, right: string): boolean {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

function findSizeLabel(labels: string[], value: string): string | null {
  if (!value.trim()) return null;
  return labels.find((label) => sameSizeLabel(label, value)) ?? null;
}

function resolveSizeGridCell(
  columnLabel: string | null | undefined,
  rowLabel: string | null | undefined,
  columnLabels: string[],
  rowLabels: string[],
): { columnLabel: string; rowLabel: string } | null {
  const column = (columnLabel ?? '').trim();
  const row = (rowLabel ?? '').trim();

  if (columnLabels.length === 0 && rowLabels.length === 0) {
    return { columnLabel: column, rowLabel: row };
  }

  if (rowLabels.length === 0) {
    const matchedColumn = findSizeLabel(columnLabels, column) ?? findSizeLabel(columnLabels, row);
    return matchedColumn ? { columnLabel: matchedColumn, rowLabel: '' } : null;
  }

  if (columnLabels.length === 0) {
    const matchedRow = findSizeLabel(rowLabels, row) ?? findSizeLabel(rowLabels, column);
    return matchedRow ? { columnLabel: '', rowLabel: matchedRow } : null;
  }

  const matchedColumn = findSizeLabel(columnLabels, column);
  const matchedRow = findSizeLabel(rowLabels, row);
  return matchedColumn && matchedRow
    ? { columnLabel: matchedColumn, rowLabel: matchedRow }
    : null;
}

function addToMap(map: Map<string, number>, key: string, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

function normalizeCasePackCode(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase();
}

function sumLine(lines: ReorderPlanSizeLine[], get: (line: ReorderPlanSizeLine) => number): number {
  return lines.reduce((sum, line) => sum + get(line), 0);
}

function normalizeRatios(lines: MutableSizeLine[], source: CurveSource): void {
  const total = lines.reduce((sum, line) => {
    if (source === 'SKU_SALES') return sum + line.skuSalesQty;
    if (source === 'CATEGORY_SALES') return sum + line.categorySalesQty;
    if (source === 'MODEL') return sum + line.modelQty;
    if (source === 'PREVIOUS_ORDER') return sum + line.previousOrderQty;
    return sum;
  }, 0);
  for (const line of lines) {
    const basis =
      source === 'SKU_SALES' ? line.skuSalesQty
        : source === 'CATEGORY_SALES' ? line.categorySalesQty
          : source === 'MODEL' ? line.modelQty
            : source === 'PREVIOUS_ORDER' ? line.previousOrderQty
              : 0;
    line.curveSource = source;
    line.curvePct = total > 0 ? basis / total : 0;
  }
}

export function applyOrderConstraints(
  lines: ReorderPlanSizeLine[],
  moqQty: number,
  orderMultiple: number | null | undefined,
): ReorderPlanSizeLine[] {
  const total = lines.reduce((sum, line) => sum + line.recommendedQty, 0);
  if (total <= 0) return lines;

  let target = Math.max(total, Math.max(0, Math.trunc(moqQty)));
  const multiple = Math.trunc(Number(orderMultiple ?? 0));
  if (multiple > 1 && target % multiple !== 0) {
    target = Math.ceil(target / multiple) * multiple;
  }
  const extra = target - total;
  if (extra <= 0) return lines;

  const weightTotal = lines.reduce((sum, line) => sum + Math.max(0, line.curvePct), 0);
  const weighted = lines.map((line, index) => {
    const exact = weightTotal > 0 ? (Math.max(0, line.curvePct) / weightTotal) * extra : extra / lines.length;
    return {
      index,
      add: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  let allocated = weighted.reduce((sum, item) => sum + item.add, 0);
  weighted.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const item of weighted) {
    if (allocated >= extra) break;
    item.add += 1;
    allocated += 1;
  }
  const additions = new Map(weighted.map((item) => [item.index, item.add]));
  return lines.map((line, index) => ({
    ...line,
    recommendedQty: line.recommendedQty + (additions.get(index) ?? 0),
  }));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

export function calculateRecommendedReorderQty(input: {
  modelQty: number;
  forecastDemandQty: number;
  onHand: number;
  onOrder: number;
}): number {
  return Math.max(0, Math.ceil(
    Math.max(0, input.modelQty)
    + Math.max(0, input.forecastDemandQty)
    - Math.max(0, input.onHand)
    - Math.max(0, input.onOrder),
  ));
}

export function resolveForecastMonths(analysisDate: Date, leadTimeDays: number, orderCycleDays: number): {
  forecastStartMonth: string;
  forecastMonths: string[];
} {
  const forecastStartMonth = currentYearMonth(addDays(analysisDate, Math.max(0, Math.trunc(leadTimeDays))));
  const buyHorizonDays = Math.max(1, Math.trunc(leadTimeDays) + Math.trunc(orderCycleDays));
  const forecastMonthCount = Math.max(1, Math.ceil(buyHorizonDays / AVERAGE_DAYS_PER_MONTH));
  return {
    forecastStartMonth,
    forecastMonths: nextYearMonths(forecastStartMonth, forecastMonthCount),
  };
}

export function calculateNativeOnOrderSupplement(input: {
  currentOnOrder: number;
  futureOnOrder: number;
  nativeOpenQty: number;
}): number {
  const existingOnOrder = Math.max(0, input.currentOnOrder) + Math.max(0, input.futureOnOrder);
  return Math.max(0, Math.trunc(Math.max(0, input.nativeOpenQty) - existingOnOrder));
}

export function buildReorderAppendLineItems(
  existingLines: PoLineItem[],
  newLine: {
    skuId: string;
    quantity: number;
    unitCost: number;
    casePackId?: string | null;
    casePackMultiplier?: number | null;
    sizeCells: Array<{ columnLabel: string; rowLabel: string; quantity: number }>;
  },
): Array<{
  skuId: string;
  quantity: number;
  unitCost: number;
  casePackId?: string | null;
  casePackMultiplier?: number | null;
  sizeCells: Array<{ columnLabel: string; rowLabel: string; quantity: number }>;
}> {
  return [
    ...existingLines.map((line) => ({
      skuId: line.skuId,
      quantity: line.quantityOrdered,
      unitCost: line.unitCost,
      casePackId: line.casePackId,
      casePackMultiplier: line.casePackMultiplier,
      sizeCells: line.sizeCells.map((cell) => ({
        columnLabel: cell.columnLabel,
        rowLabel: cell.rowLabel,
        quantity: cell.quantity,
      })),
    })),
    newLine,
  ];
}

function compareCasePackScores(
  a: Pick<ReorderCasePackSuggestion, 'shortageQty' | 'excessQty' | 'differenceQty' | 'sameSkuPreviousPack' | 'supplierUsed' | 'supplierUsageCount' | 'supplierLastUsedAt' | 'multiplier' | 'code'>,
  b: Pick<ReorderCasePackSuggestion, 'shortageQty' | 'excessQty' | 'differenceQty' | 'sameSkuPreviousPack' | 'supplierUsed' | 'supplierUsageCount' | 'supplierLastUsedAt' | 'multiplier' | 'code'>,
): number {
  const supplierLastUsedA = a.supplierLastUsedAt ? new Date(a.supplierLastUsedAt).getTime() : 0;
  const supplierLastUsedB = b.supplierLastUsedAt ? new Date(b.supplierLastUsedAt).getTime() : 0;
  return a.shortageQty - b.shortageQty
    || a.excessQty - b.excessQty
    || a.differenceQty - b.differenceQty
    || Number(b.sameSkuPreviousPack) - Number(a.sameSkuPreviousPack)
    || Number(b.supplierUsed) - Number(a.supplierUsed)
    || b.supplierUsageCount - a.supplierUsageCount
    || supplierLastUsedB - supplierLastUsedA
    || a.multiplier - b.multiplier
    || a.code.localeCompare(b.code, undefined, { numeric: true });
}

function buildCasePackFit(
  lines: ReorderPlanSizeLine[],
  pack: ReorderCasePackCandidate,
): ReorderCasePackSuggestion | null {
  const targetTotal = lines.reduce((sum, line) => sum + Math.max(0, Math.trunc(line.recommendedQty)), 0);
  if (targetTotal <= 0) return null;
  if (pack.unitsPerPack <= 0 || pack.cells.length === 0) return null;

  const packQtyBySize = new Map<string, number>();
  for (const cell of pack.cells) {
    const qty = Math.max(0, Math.trunc(cell.quantity));
    if (qty <= 0) continue;
    addToMap(packQtyBySize, sizeKey(cell.columnLabel, cell.rowLabel), qty);
  }
  if (packQtyBySize.size === 0) return null;

  let maxNeededForCoveredSizes = 1;
  for (const line of lines) {
    const target = Math.max(0, Math.trunc(line.recommendedQty));
    const packQty = packQtyBySize.get(sizeKey(line.columnLabel, line.rowLabel)) ?? 0;
    if (target > 0 && packQty > 0) {
      maxNeededForCoveredSizes = Math.max(maxNeededForCoveredSizes, Math.ceil(target / packQty));
    }
  }
  const maxByTotal = Math.max(1, Math.ceil(targetTotal / pack.unitsPerPack));
  const maxMultiplier = Math.min(10000, Math.max(maxNeededForCoveredSizes, maxByTotal));

  let bestAutoApply: ReorderCasePackSuggestion | null = null;
  let bestOptional: ReorderCasePackSuggestion | null = null;
  for (let multiplier = 1; multiplier <= maxMultiplier; multiplier += 1) {
    let shortageQty = 0;
    let excessQty = 0;
    let differenceQty = 0;
    const sizeCells: ReorderCasePackCell[] = [];

    for (const line of lines) {
      const target = Math.max(0, Math.trunc(line.recommendedQty));
      const quantity = (packQtyBySize.get(sizeKey(line.columnLabel, line.rowLabel)) ?? 0) * multiplier;
      shortageQty += Math.max(0, target - quantity);
      excessQty += Math.max(0, quantity - target);
      differenceQty += Math.abs(quantity - target);
      if (quantity > 0) {
        sizeCells.push({
          rowLabel: line.rowLabel,
          columnLabel: line.columnLabel,
          sizeLabel: line.sizeLabel,
          quantity,
        });
      }
    }

    const candidate: ReorderCasePackSuggestion = {
      code: pack.code,
      description: pack.description,
      multiplier,
      unitsPerPack: pack.unitsPerPack,
      totalUnits: pack.unitsPerPack * multiplier,
      autoApply: false,
      overbuyQty: 0,
      overbuyLimitQty: Math.max(Math.ceil(targetTotal * 0.10), pack.unitsPerPack),
      supplierUsed: Boolean(pack.supplierUsed),
      supplierUsageCount: Math.max(0, Math.trunc(Number(pack.supplierUsageCount ?? 0))),
      supplierLastUsedAt: pack.supplierLastUsedAt ?? null,
      sameSkuPreviousPack: Boolean(pack.sameSkuPreviousPack),
      shortageQty,
      excessQty,
      differenceQty,
      sizeCells,
    };
    candidate.overbuyQty = Math.max(0, candidate.totalUnits - targetTotal);
    candidate.autoApply = candidate.shortageQty === 0 && candidate.overbuyQty <= candidate.overbuyLimitQty;

    if (candidate.autoApply && (!bestAutoApply || compareCasePackScores(candidate, bestAutoApply) < 0)) {
      bestAutoApply = candidate;
    }
    if (!bestOptional || compareCasePackScores(candidate, bestOptional) < 0) {
      bestOptional = candidate;
    }
  }

  return bestAutoApply ?? bestOptional;
}

export function buildCasePackSuggestion(
  lines: ReorderPlanSizeLine[],
  casePacks: ReorderCasePackCandidate[],
): ReorderCasePackSuggestion | null {
  let bestAutoApply: ReorderCasePackSuggestion | null = null;
  let bestOptional: ReorderCasePackSuggestion | null = null;
  for (const pack of casePacks) {
    const candidate = buildCasePackFit(lines, pack);
    if (!candidate) continue;
    if (candidate.autoApply && (!bestAutoApply || compareCasePackScores(candidate, bestAutoApply) < 0)) {
      bestAutoApply = candidate;
    }
    if (!bestOptional || compareCasePackScores(candidate, bestOptional) < 0) {
      bestOptional = candidate;
    }
  }
  return bestAutoApply ?? bestOptional;
}

function compareCategoryCasePackChoices(a: ReorderCasePackChoice, b: ReorderCasePackChoice): number {
  const categoryLastUsedA = a.categoryLastUsedAt ? new Date(a.categoryLastUsedAt).getTime() : 0;
  const categoryLastUsedB = b.categoryLastUsedAt ? new Date(b.categoryLastUsedAt).getTime() : 0;
  return Number(b.sameSkuPreviousPack) - Number(a.sameSkuPreviousPack)
    || b.categorySkuCount - a.categorySkuCount
    || b.categoryUsageCount - a.categoryUsageCount
    || categoryLastUsedB - categoryLastUsedA
    || compareCasePackScores(a, b);
}

export function buildCategoryFirstCasePackChoices(
  lines: ReorderPlanSizeLine[],
  casePacks: ReorderCasePackCandidate[],
): ReorderCasePackChoice[] {
  const candidates = casePacks
    .map((pack): ReorderCasePackChoice | null => {
      const fit = buildCasePackFit(lines, pack);
      if (!fit) return null;
      const categorySkuCount = Math.max(0, Math.trunc(Number(pack.categorySkuCount ?? 0)));
      const categoryUsageCount = Math.max(0, Math.trunc(Number(pack.categoryUsageCount ?? 0)));
      if (!fit.sameSkuPreviousPack && categoryUsageCount <= 0) return null;
      return {
        ...fit,
        categoryUsed: categoryUsageCount > 0,
        categorySkuCount,
        categoryUsageCount,
        categoryLastUsedAt: pack.categoryLastUsedAt ?? null,
        badges: [],
      };
    })
    .filter((choice): choice is ReorderCasePackChoice => choice != null);

  let bestFitCode = '';
  for (const choice of candidates) {
    if (!bestFitCode) {
      bestFitCode = normalizeCasePackCode(choice.code);
      continue;
    }
    const bestChoice = candidates.find((candidate) => normalizeCasePackCode(candidate.code) === bestFitCode);
    if (bestChoice && compareCasePackScores(choice, bestChoice) < 0) {
      bestFitCode = normalizeCasePackCode(choice.code);
    }
  }

  return candidates
    .sort(compareCategoryCasePackChoices)
    .map((choice) => ({
      ...choice,
      badges: [
        ...(choice.sameSkuPreviousPack ? ['PREVIOUS_SKU' as const] : []),
        ...(choice.categoryUsed ? ['CATEGORY_USED' as const] : []),
        ...(normalizeCasePackCode(choice.code) === bestFitCode ? ['BEST_FIT' as const] : []),
      ],
    }));
}

async function loadSku(skuCode: string): Promise<SkuRow | null> {
  const rows = await prisma.$queryRawUnsafe<SkuRow[]>(
    `
      SELECT
        id::text,
        COALESCE(code, provisional_code) AS sku_code,
        vendor_id,
        category_number,
        size_type,
        order_multiple,
        current_cost,
        COALESCE(retail_price, list_price, 0) AS retail_price,
        COALESCE(description_web, description_rics, style_color) AS description,
        sku_state
      FROM app.sku
      WHERE UPPER(COALESCE(code, provisional_code)) = UPPER($1)
      LIMIT 1
    `,
    skuCode.trim(),
  );
  return rows[0] ?? null;
}

async function findVendorDraftPurchaseOrder(vendorId: string | null | undefined): Promise<VendorDraftPoSummary | null> {
  const vendorCode = cleanText(vendorId)?.toUpperCase();
  if (!vendorCode) return null;
  const rows = await prisma.$queryRawUnsafe<VendorDraftPoRow[]>(
    `
      SELECT
        po.id::text AS po_id,
        po.po_number,
        po.updated_at,
        COUNT(pol.id)::int AS line_count,
        COALESCE(SUM(pol.quantity_ordered), 0)::int AS total_quantity
      FROM app.purchase_order po
      LEFT JOIN app.purchase_order_line pol ON pol.po_id = po.id
      WHERE po.vendor_code = $1
        AND po.status = 'DRAFT'
      GROUP BY po.id, po.po_number, po.updated_at, po.created_at
      ORDER BY po.updated_at DESC NULLS LAST, po.created_at DESC
      LIMIT 1
    `,
    vendorCode,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    poId: row.po_id,
    poNumber: row.po_number,
    updatedAt: toIsoDate(row.updated_at) ?? new Date(0).toISOString(),
    lineCount: Math.trunc(asNumber(row.line_count)),
    totalQuantity: Math.trunc(asNumber(row.total_quantity)),
  };
}

async function loadDefaults(sku: SkuRow): Promise<ReorderPlannerDefaults> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    scope_type: DefaultsScope;
    scope_key: string;
    lead_time_days: number;
    order_cycle_days: number;
    moq_qty: number;
    updated_at: Date | string | null;
    updated_by: string | null;
  }>>(
    `
      SELECT scope_type, scope_key, lead_time_days, order_cycle_days, moq_qty, updated_at, updated_by
      FROM app.reorder_planner_defaults
      WHERE (scope_type = 'SKU' AND scope_key = $1)
         OR (scope_type = 'VENDOR' AND scope_key = $2)
      ORDER BY CASE scope_type WHEN 'SKU' THEN 0 ELSE 1 END
      LIMIT 1
    `,
    sku.id,
    sku.vendor_id ?? '',
  );
  const row = rows[0];
  if (!row) {
    return {
      scope: 'DEFAULT',
      scopeKey: null,
      leadTimeDays: DEFAULT_LEAD_TIME_DAYS,
      orderCycleDays: DEFAULT_ORDER_CYCLE_DAYS,
      moqQty: DEFAULT_MOQ_QTY,
      updatedAt: null,
      updatedBy: null,
    };
  }
  return {
    scope: row.scope_type,
    scopeKey: row.scope_key,
    leadTimeDays: Number(row.lead_time_days),
    orderCycleDays: Number(row.order_cycle_days),
    moqQty: Number(row.moq_qty),
    updatedAt: toIsoDate(row.updated_at),
    updatedBy: row.updated_by,
  };
}

async function loadPlanningChains(skuId: string, inquiryStoreNumbers: number[]): Promise<ChainCandidate[]> {
  const matchingRows = await prisma.$queryRawUnsafe<Array<{
    code: string;
    label: string;
    store_numbers: number[] | null;
  }>>(
    `
      SELECT
        sg.code,
        sg.label,
        COALESCE(array_agg(sgm.store_number ORDER BY sgm.store_number) FILTER (WHERE sgm.store_number IS NOT NULL), '{}') AS store_numbers
      FROM app.matching_set_member msm
      JOIN app.matching_set ms ON ms.id = msm.set_id
      JOIN app.store_group sg ON sg.code = ms.chain_id
      LEFT JOIN app.store_group_member sgm ON sgm.group_code = sg.code
      WHERE msm.sku_id = $1::uuid
        AND ms.active = true
        AND ms.planning_active = true
        AND ms.chain_id IS NOT NULL
      GROUP BY sg.code, sg.label
      ORDER BY sg.label
    `,
    skuId,
  );

  const modelRows = await prisma.$queryRawUnsafe<Array<{
    code: string;
    label: string;
    store_numbers: number[] | null;
  }>>(
    `
      SELECT
        sg.code,
        sg.label,
        array_agg(DISTINCT rt.store_id ORDER BY rt.store_id) AS store_numbers
      FROM app.replenishment_target rt
      JOIN app.store_group_member sgm ON sgm.store_number = rt.store_id
      JOIN app.store_group sg ON sg.code = sgm.group_code
      WHERE rt.sku_id = $1::uuid
        AND COALESCE(rt.model_qty, 0) > 0
        AND sg.active = true
      GROUP BY sg.code, sg.label
      ORDER BY sg.label
    `,
    skuId,
  );

  const byChain = new Map<string, ChainCandidate>();
  for (const row of matchingRows) {
    byChain.set(row.code, {
      chainId: row.code,
      chainLabel: row.label,
      storeNumbers: (row.store_numbers ?? []).map(Number).filter((n) => Number.isFinite(n)),
      source: 'MATCHING_SET',
    });
  }
  for (const row of modelRows) {
    const existing = byChain.get(row.code);
    const storeNumbers = (row.store_numbers ?? []).map(Number).filter((n) => Number.isFinite(n));
    if (existing) {
      existing.storeNumbers = [...new Set([...existing.storeNumbers, ...storeNumbers])].sort((a, b) => a - b);
    } else {
      byChain.set(row.code, {
        chainId: row.code,
        chainLabel: row.label,
        storeNumbers,
        source: 'STORE_MODEL',
      });
    }
  }

  if (byChain.size > 0) return [...byChain.values()];

  return [{
    chainId: null,
    chainLabel: inquiryStoreNumbers.length > 0 ? 'Modeled stores' : 'All stores',
    storeNumbers: inquiryStoreNumbers,
    source: 'FALLBACK',
  }];
}

async function loadCategorySalesBySize(
  sku: SkuRow,
  storeNumbers: number[],
): Promise<Map<string, number>> {
  if (sku.category_number == null) return new Map();
  const hasStores = storeNumbers.length > 0;
  const rows = await prisma.$queryRawUnsafe<Array<{
    column_label: string;
    row_label: string;
    qty: unknown;
  }>>(
    `
      SELECT
        COALESCE(l.column_label, '') AS column_label,
        COALESCE(l.row_label, l.size_value, '') AS row_label,
        COALESCE(SUM(l.quantity), 0)::int AS qty
      FROM app.sales_history_ticket t
      JOIN app.sales_history_ticket_line l ON l.ticket_id = t.id
      JOIN app.sku s ON s.id = l.sku_id
      WHERE s.category_number = $1
        AND ($2::int IS NULL OR s.size_type = $2)
        AND t.status = 'completed'
        AND t.purchased_at >= now() - interval '12 months'
        ${hasStores ? 'AND t.store_id = ANY($3::int[])' : ''}
      GROUP BY COALESCE(l.column_label, ''), COALESCE(l.row_label, l.size_value, '')
    `,
    sku.category_number,
    sku.size_type,
    ...(hasStores ? [storeNumbers] : []),
  );
  return new Map(rows.map((r) => [sizeKey(r.column_label, r.row_label), asNumber(r.qty)]));
}

async function loadActiveCasePackCandidates(
  sizeTypeCode: number | null | undefined,
  columnLabels: string[],
  rowLabels: string[],
): Promise<ReorderCasePackCandidate[]> {
  if (sizeTypeCode == null) return [];
  const rows = await prisma.$queryRawUnsafe<CasePackRow[]>(
    `
      SELECT
        cp.code,
        NULLIF(BTRIM(cp."desc"), '') AS description,
        cpc.column_label,
        cpc.row_label,
        COALESCE(cpc.quantity, 0)::int AS quantity
      FROM app.case_pack cp
      JOIN app.case_pack_cell cpc ON cpc.case_pack_code = cp.code
      WHERE cp.active = true
        AND cp.size_type_code = $1
      ORDER BY cp.code, NULLIF(cpc.row_label, '') NULLS FIRST, cpc.column_label
    `,
    sizeTypeCode,
  );

  const byPack = new Map<string, {
    code: string;
    description: string | null;
    cellsBySize: Map<string, ReorderCasePackCell>;
  }>();
  for (const row of rows) {
    const resolved = resolveSizeGridCell(row.column_label, row.row_label, columnLabels, rowLabels);
    if (!resolved) continue;
    const quantity = Math.max(0, Math.trunc(asNumber(row.quantity)));
    if (quantity <= 0) continue;
    let pack = byPack.get(row.code);
    if (!pack) {
      pack = { code: row.code, description: row.description, cellsBySize: new Map() };
      byPack.set(row.code, pack);
    }
    const key = sizeKey(resolved.columnLabel, resolved.rowLabel);
    const existing = pack.cellsBySize.get(key);
    const nextQty = (existing?.quantity ?? 0) + quantity;
    pack.cellsBySize.set(key, {
      rowLabel: resolved.rowLabel,
      columnLabel: resolved.columnLabel,
      sizeLabel: sizeLabel(resolved.columnLabel, resolved.rowLabel),
      quantity: nextQty,
    });
  }

  return [...byPack.values()]
    .map((pack) => {
      const cells = [...pack.cellsBySize.values()]
        .sort((a, b) => a.rowLabel.localeCompare(b.rowLabel, undefined, { numeric: true })
          || a.columnLabel.localeCompare(b.columnLabel, undefined, { numeric: true }));
      return {
        code: pack.code,
        description: pack.description,
        unitsPerPack: cells.reduce((sum, cell) => sum + cell.quantity, 0),
        cells,
      };
    })
    .filter((pack) => pack.unitsPerPack > 0);
}

async function loadSupplierCasePackUsage(
  vendorCode: string | null | undefined,
  sizeTypeCode: number | null | undefined,
): Promise<Map<string, CasePackSupplierUsage>> {
  const normalizedVendor = cleanText(vendorCode)?.toUpperCase() ?? '';
  if (!normalizedVendor || sizeTypeCode == null) return new Map();

  const rows = await prisma.$queryRawUnsafe<Array<{
    code: string;
    usage_count: unknown;
    last_used_at: Date | string | null;
  }>>(
    `
      WITH usage_rows AS (
        SELECT
          NULLIF(BTRIM(pol.case_pack_id), '') AS case_pack_code,
          po.po_number::text AS po_number,
          po.order_date AS used_at
        FROM app.purchase_order po
        JOIN app.purchase_order_line pol ON pol.po_id = po.id
        WHERE UPPER(BTRIM(po.vendor_code)) = $1
          AND po.status <> 'CANCELLED'
          AND NULLIF(BTRIM(pol.case_pack_id), '') IS NOT NULL
        UNION ALL
        SELECT
          NULLIF(BTRIM(l.case_pack_code), '') AS case_pack_code,
          po.po_number::text AS po_number,
          COALESCE(po.last_received_at, po.order_date) AS used_at
        FROM app.purchase_order_legacy po
        JOIN app.purchase_order_legacy_line l ON l.po_number = po.po_number
        WHERE UPPER(BTRIM(COALESCE(l.vendor_code, po.vendor_code, ''))) = $1
          AND NULLIF(BTRIM(l.case_pack_code), '') IS NOT NULL
      )
      SELECT
        cp.code,
        COUNT(DISTINCT usage_rows.po_number)::int AS usage_count,
        MAX(usage_rows.used_at) AS last_used_at
      FROM usage_rows
      JOIN app.case_pack cp ON UPPER(cp.code) = UPPER(usage_rows.case_pack_code)
      WHERE cp.active = true
        AND cp.size_type_code = $2
      GROUP BY cp.code
    `,
    normalizedVendor,
    sizeTypeCode,
  );

  return new Map(rows.map((row) => [normalizeCasePackCode(row.code), {
    usageCount: asNumber(row.usage_count),
    lastUsedAt: toIsoDate(row.last_used_at),
  }]));
}

async function loadCategoryCasePackUsage(
  categoryNumber: number | null | undefined,
  sizeTypeCode: number | null | undefined,
): Promise<Map<string, CasePackCategoryUsage>> {
  if (categoryNumber == null || sizeTypeCode == null) return new Map();

  const rows = await prisma.$queryRawUnsafe<Array<{
    code: string;
    sku_count: unknown;
    usage_count: unknown;
    last_used_at: Date | string | null;
  }>>(
    `
      WITH usage_rows AS (
        SELECT
          NULLIF(BTRIM(pol.case_pack_id), '') AS case_pack_code,
          po.po_number::text AS po_number,
          po.order_date AS used_at,
          pol.sku_id::text AS sku_key
        FROM app.purchase_order po
        JOIN app.purchase_order_line pol ON pol.po_id = po.id
        JOIN app.sku s ON s.id = pol.sku_id
        WHERE s.category_number = $1
          AND po.status <> 'CANCELLED'
          AND NULLIF(BTRIM(pol.case_pack_id), '') IS NOT NULL
        UNION ALL
        SELECT
          NULLIF(BTRIM(l.case_pack_code), '') AS case_pack_code,
          po.po_number::text AS po_number,
          COALESCE(po.last_received_at, po.order_date) AS used_at,
          s.id::text AS sku_key
        FROM app.purchase_order_legacy po
        JOIN app.purchase_order_legacy_line l ON l.po_number = po.po_number
        JOIN app.sku s ON (
          s.id = l.sku_id
          OR (
            l.sku_id IS NULL
            AND UPPER(BTRIM(COALESCE(s.code, s.provisional_code))) = UPPER(BTRIM(l.sku_code))
          )
        )
        WHERE s.category_number = $1
          AND NULLIF(BTRIM(l.case_pack_code), '') IS NOT NULL
      )
      SELECT
        cp.code,
        COUNT(DISTINCT usage_rows.sku_key)::int AS sku_count,
        COUNT(DISTINCT usage_rows.po_number || '|' || usage_rows.sku_key || '|' || UPPER(usage_rows.case_pack_code))::int AS usage_count,
        MAX(usage_rows.used_at) AS last_used_at
      FROM usage_rows
      JOIN app.case_pack cp ON UPPER(cp.code) = UPPER(usage_rows.case_pack_code)
      WHERE cp.active = true
        AND cp.size_type_code = $2
      GROUP BY cp.code
    `,
    categoryNumber,
    sizeTypeCode,
  );

  return new Map(rows.map((row) => [normalizeCasePackCode(row.code), {
    skuCount: asNumber(row.sku_count),
    usageCount: asNumber(row.usage_count),
    lastUsedAt: toIsoDate(row.last_used_at),
  }]));
}

async function loadNativeOpenPurchaseOrdersBySize(skuId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    column_label: string;
    row_label: string;
    qty: unknown;
  }>>(
    `
      SELECT
        COALESCE(c.column_label, '') AS column_label,
        COALESCE(c.row_label, '') AS row_label,
        COALESCE(SUM(
          CASE
            WHEN c.id IS NULL THEN GREATEST(pol.quantity_ordered - pol.quantity_received, 0)
            ELSE GREATEST(0, ROUND(
              c.quantity_ordered::numeric
              * GREATEST(pol.quantity_ordered - pol.quantity_received, 0)::numeric
              / NULLIF(pol.quantity_ordered, 0)
            ))::int
          END
        ), 0)::int AS qty
      FROM app.purchase_order_line pol
      JOIN app.purchase_order po ON po.id = pol.po_id
      LEFT JOIN app.purchase_order_line_size_cell c ON c.po_line_id = pol.id
      WHERE pol.sku_id = $1::uuid
        AND po.status IN ('DRAFT','SUBMITTED','CONFIRMED','PARTIALLY_RECEIVED')
        AND GREATEST(pol.quantity_ordered - pol.quantity_received, 0) > 0
      GROUP BY COALESCE(c.column_label, ''), COALESCE(c.row_label, '')
    `,
    skuId,
  );
  return new Map(rows.map((row) => [sizeKey(row.column_label, row.row_label), asNumber(row.qty)]));
}

async function loadSkuMonthlySalesBySize(
  sku: SkuRow,
  storeNumbers: number[],
  demandSources: DemandSourceSku[] = [],
): Promise<MonthlySizeSalesRow[]> {
  return aggregateSkuMonthlySalesBySize(
    await loadSkuMonthlySalesByStoreAndSize(sku, storeNumbers, demandSources),
    storeNumbers,
  );
}

function aggregateSkuMonthlySalesBySize(
  rows: MonthlyStoreSizeSalesRow[],
  storeNumbers: number[],
): MonthlySizeSalesRow[] {
  const storeSet = new Set(storeNumbers);
  const hasStores = storeSet.size > 0;
  const byKey = new Map<string, MonthlySizeSalesRow>();
  for (const row of rows) {
    const storeId = Number(row.store_id);
    if (hasStores && !storeSet.has(storeId)) continue;
    const key = `${row.year_month}|${row.column_label}|${row.row_label}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.qty = asNumber(existing.qty) + asNumber(row.qty);
    } else {
      byKey.set(key, {
        year_month: row.year_month,
        column_label: row.column_label,
        row_label: row.row_label,
        qty: asNumber(row.qty),
      });
    }
  }
  return [...byKey.values()];
}

async function loadSkuMonthlySalesByStoreAndSize(
  sku: SkuRow,
  storeNumbers: number[],
  demandSources: DemandSourceSku[] = [],
): Promise<MonthlyStoreSizeSalesRow[]> {
  const hasStores = storeNumbers.length > 0;
  const skuIds = [sku.id, ...demandSources.map((source) => source.skuId)];
  const skuCodes = [sku.sku_code, ...demandSources.map((source) => source.skuCode)];
  const byIdRows = await prisma.$queryRawUnsafe<MonthlyStoreSizeSalesRow[]>(
    `
      SELECT
        t.store_id AS store_id,
        to_char(date_trunc('month', t.purchased_at), 'YYYY-MM') AS year_month,
        COALESCE(l.column_label, '') AS column_label,
        COALESCE(l.row_label, l.size_value, '') AS row_label,
        COALESCE(SUM(l.quantity), 0)::int AS qty
      FROM app.sales_history_ticket t
      JOIN app.sales_history_ticket_line l ON l.ticket_id = t.id
      WHERE l.sku_id = ANY($1::uuid[])
        AND t.status = 'completed'
        AND t.purchased_at >= now() - interval '12 months'
        ${hasStores ? 'AND t.store_id = ANY($2::int[])' : ''}
      GROUP BY t.store_id, to_char(date_trunc('month', t.purchased_at), 'YYYY-MM'), COALESCE(l.column_label, ''), COALESCE(l.row_label, l.size_value, '')
    `,
    skuIds,
    ...(hasStores ? [storeNumbers] : []),
  );
  const codeRows = await prisma.$queryRawUnsafe<MonthlyStoreSizeSalesRow[]>(
    `
      SELECT
        t.store_id AS store_id,
        to_char(date_trunc('month', t.purchased_at), 'YYYY-MM') AS year_month,
        COALESCE(l.column_label, '') AS column_label,
        COALESCE(l.row_label, l.size_value, '') AS row_label,
        COALESCE(SUM(l.quantity), 0)::int AS qty
      FROM app.sales_history_ticket t
      JOIN app.sales_history_ticket_line l ON l.ticket_id = t.id
      WHERE l.sku_id IS NULL
        AND l.sku_code = ANY($1::text[])
        AND t.status = 'completed'
        AND t.purchased_at >= now() - interval '12 months'
        ${hasStores ? 'AND t.store_id = ANY($2::int[])' : ''}
      GROUP BY t.store_id, to_char(date_trunc('month', t.purchased_at), 'YYYY-MM'), COALESCE(l.column_label, ''), COALESCE(l.row_label, l.size_value, '')
    `,
    skuCodes,
    ...(hasStores ? [storeNumbers] : []),
  );
  return [...byIdRows, ...codeRows];
}

async function loadWarehouseStoreNumbers(): Promise<number[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ number: unknown }>>(
    `
      SELECT number
      FROM app.store_master
      WHERE number = 99
         OR "desc" ILIKE '%BODEGA%'
         OR "desc" ILIKE '%ALMACEN%'
         OR "desc" ILIKE '%ALMACÉN%'
         OR "desc" ILIKE '%WAREHOUSE%'
      ORDER BY number
    `,
  );
  const numbers = rows.map((row) => Number(row.number)).filter((n) => Number.isFinite(n));
  return numbers.length > 0 ? [...new Set(numbers)] : [99];
}

async function loadWarehouseStockBySize(
  skuId: string,
  warehouseStoreNumbers: number[],
): Promise<Map<number, Map<string, number>>> {
  if (warehouseStoreNumbers.length === 0) return new Map();
  const rows = await prisma.$queryRawUnsafe<Array<{
    store_id: unknown;
    column_label: string;
    row_label: string;
    on_hand: unknown;
  }>>(
    `
      SELECT
        store_id,
        COALESCE(column_label, '') AS column_label,
        COALESCE(row_label, '') AS row_label,
        COALESCE(SUM(on_hand), 0)::int AS on_hand
      FROM app.stock_level
      WHERE sku_id = $1::uuid
        AND store_id = ANY($2::int[])
      GROUP BY store_id, COALESCE(column_label, ''), COALESCE(row_label, '')
    `,
    skuId,
    warehouseStoreNumbers,
  );
  const byStore = new Map<number, Map<string, number>>();
  for (const row of rows) {
    const storeId = Number(row.store_id);
    if (!Number.isFinite(storeId)) continue;
    let bySize = byStore.get(storeId);
    if (!bySize) {
      bySize = new Map<string, number>();
      byStore.set(storeId, bySize);
    }
    addToMap(bySize, sizeKey(row.column_label, row.row_label), Math.max(0, asNumber(row.on_hand)));
  }
  return byStore;
}

interface PreviousOrder {
  poNumber: string | null;
  orderDate: string | null;
  source: 'NATIVE' | 'LEGACY' | null;
  casePackId: string | null;
  casePackMultiplier: number | null;
  cells: Map<string, number>;
}

async function loadNativePreviousOrder(skuId: string): Promise<PreviousOrder | null> {
  const candidates = await prisma.$queryRawUnsafe<Array<{
    id: string;
    po_number: string;
    order_date: Date | string | null;
    case_pack_id: string | null;
    case_pack_multiplier: unknown;
  }>>(
    `
      SELECT
        po.id::text,
        po.po_number,
        po.order_date,
        MAX(NULLIF(BTRIM(pol.case_pack_id), '')) AS case_pack_id,
        MAX(pol.case_pack_multiplier) AS case_pack_multiplier
      FROM app.purchase_order po
      JOIN app.purchase_order_line pol ON pol.po_id = po.id
      WHERE pol.sku_id = $1::uuid
        AND po.status <> 'CANCELLED'
      GROUP BY po.id, po.po_number, po.order_date, po.created_at
      ORDER BY po.order_date DESC, po.created_at DESC
      LIMIT 1
    `,
    skuId,
  );
  const candidate = candidates[0];
  if (!candidate) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{
    column_label: string;
    row_label: string;
    qty: unknown;
  }>>(
    `
      SELECT
        COALESCE(c.column_label, '') AS column_label,
        COALESCE(c.row_label, '') AS row_label,
        COALESCE(SUM(c.quantity_ordered), 0)::int AS qty
      FROM app.purchase_order_line pol
      LEFT JOIN app.purchase_order_line_size_cell c ON c.po_line_id = pol.id
      WHERE pol.po_id = $1::uuid
        AND pol.sku_id = $2::uuid
      GROUP BY COALESCE(c.column_label, ''), COALESCE(c.row_label, '')
    `,
    candidate.id,
    skuId,
  );
  const cells = new Map<string, number>();
  for (const row of rows) addToMap(cells, sizeKey(row.column_label, row.row_label), asNumber(row.qty));
  return {
    poNumber: candidate.po_number,
    orderDate: toIsoDate(candidate.order_date),
    source: 'NATIVE',
    casePackId: cleanText(candidate.case_pack_id),
    casePackMultiplier: candidate.case_pack_multiplier == null ? null : Math.trunc(asNumber(candidate.case_pack_multiplier)),
    cells,
  };
}

async function loadLegacyPreviousOrder(
  sku: SkuRow,
  columnLabels: string[],
): Promise<PreviousOrder | null> {
  const candidatesById = await prisma.$queryRawUnsafe<Array<{
    po_number: string;
    order_date: Date | string | null;
    last_received_at: Date | string | null;
    case_pack_code: string | null;
    case_multiplier: unknown;
  }>>(
    `
      SELECT
        po.po_number,
        po.order_date,
        po.last_received_at,
        MAX(NULLIF(BTRIM(l.case_pack_code), '')) AS case_pack_code,
        MAX(l.case_multiplier) AS case_multiplier
      FROM app.purchase_order_legacy po
      JOIN app.purchase_order_legacy_line l ON l.po_number = po.po_number
      WHERE l.sku_id = $1::uuid
      GROUP BY po.po_number, po.order_date, po.last_received_at
      ORDER BY COALESCE(po.last_received_at, po.order_date) DESC NULLS LAST, po.po_number DESC
      LIMIT 1
    `,
    sku.id,
  );
  const candidates = candidatesById.length > 0
    ? candidatesById
    : await prisma.$queryRawUnsafe<Array<{
      po_number: string;
      order_date: Date | string | null;
      last_received_at: Date | string | null;
      case_pack_code: string | null;
      case_multiplier: unknown;
    }>>(
      `
        SELECT
          po.po_number,
          po.order_date,
          po.last_received_at,
          MAX(NULLIF(BTRIM(l.case_pack_code), '')) AS case_pack_code,
          MAX(l.case_multiplier) AS case_multiplier
        FROM app.purchase_order_legacy po
        JOIN app.purchase_order_legacy_line l ON l.po_number = po.po_number
        WHERE l.sku_code = $1
        GROUP BY po.po_number, po.order_date, po.last_received_at
        ORDER BY COALESCE(po.last_received_at, po.order_date) DESC NULLS LAST, po.po_number DESC
        LIMIT 1
      `,
      sku.sku_code,
    );
  const candidate = candidates[0];
  if (!candidate) return null;
  const rowsById = await prisma.$queryRawUnsafe<Array<{
    row_label: string;
    segment: number;
    ordered_qtys: number[];
  }>>(
    `
      SELECT row_label, segment, ordered_qtys
      FROM app.purchase_order_legacy_line
      WHERE po_number = $1
        AND sku_id = $2::uuid
      ORDER BY row_label, segment
    `,
    candidate.po_number,
    sku.id,
  );
  const rows = rowsById.length > 0
    ? rowsById
    : await prisma.$queryRawUnsafe<Array<{
      row_label: string;
      segment: number;
      ordered_qtys: number[];
    }>>(
      `
        SELECT row_label, segment, ordered_qtys
        FROM app.purchase_order_legacy_line
        WHERE po_number = $1
          AND sku_code = $2
        ORDER BY row_label, segment
      `,
      candidate.po_number,
      sku.sku_code,
    );
  const cells = new Map<string, number>();
  for (const row of rows) {
    const offset = Math.max(0, Number(row.segment) - 1) * 18;
    for (const [index, qtyRaw] of (row.ordered_qtys ?? []).entries()) {
      const qty = Number(qtyRaw ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const columnLabel = columnLabels[offset + index] ?? String(offset + index + 1);
      addToMap(cells, sizeKey(columnLabel, row.row_label ?? ''), qty);
    }
  }
  return {
    poNumber: candidate.po_number,
    orderDate: toIsoDate(candidate.last_received_at ?? candidate.order_date),
    source: 'LEGACY',
    casePackId: cleanText(candidate.case_pack_code),
    casePackMultiplier: candidate.case_multiplier == null ? null : Math.trunc(asNumber(candidate.case_multiplier)),
    cells,
  };
}

async function loadPreviousOrder(
  sku: SkuRow,
  columnLabels: string[],
): Promise<PreviousOrder> {
  const [native, legacy] = await Promise.all([
    loadNativePreviousOrder(sku.id),
    loadLegacyPreviousOrder(sku, columnLabels),
  ]);
  if (native && legacy) {
    const nativeTime = native.orderDate ? new Date(native.orderDate).getTime() : 0;
    const legacyTime = legacy.orderDate ? new Date(legacy.orderDate).getTime() : 0;
    return nativeTime >= legacyTime ? native : legacy;
  }
  return native ?? legacy ?? {
    poNumber: null,
    orderDate: null,
    source: null,
    casePackId: null,
    casePackMultiplier: null,
    cells: new Map(),
  };
}

function addBaseSizeCells(
  map: Map<string, MutableSizeLine>,
  columnLabels: string[],
  rowLabels: string[],
): void {
  const columns = columnLabels.length > 0 ? columnLabels : [''];
  const rows = rowLabels.length > 0 ? rowLabels : [''];
  for (const rowLabel of rows) {
    for (const columnLabel of columns) {
      const key = sizeKey(columnLabel, rowLabel);
      if (!map.has(key)) {
        map.set(key, {
          key,
          rowLabel,
          columnLabel,
          sizeLabel: sizeLabel(columnLabel, rowLabel),
          onHand: 0,
          currentOnOrder: 0,
          futureOnOrder: 0,
          modelQty: 0,
          modelShort: 0,
          skuSalesQty: 0,
          skuMonthlySales: new Map<string, number>(),
          categorySalesQty: 0,
          previousOrderQty: 0,
          curvePct: 0,
          curveSource: 'NONE',
          forecastDemandQty: 0,
          baselineMonthlyDemand: 0,
          activeDemandMonths: 0,
          projectedSales: 0,
          recommendedQty: 0,
        });
      }
    }
  }
}

function ensureLine(map: Map<string, MutableSizeLine>, columnLabel: string, rowLabel: string): MutableSizeLine {
  const key = sizeKey(columnLabel, rowLabel);
  let line = map.get(key);
  if (!line) {
    line = {
      key,
      rowLabel,
      columnLabel,
      sizeLabel: sizeLabel(columnLabel, rowLabel),
      onHand: 0,
      currentOnOrder: 0,
      futureOnOrder: 0,
      modelQty: 0,
      modelShort: 0,
      skuSalesQty: 0,
      skuMonthlySales: new Map<string, number>(),
      categorySalesQty: 0,
      previousOrderQty: 0,
      curvePct: 0,
      curveSource: 'NONE',
      forecastDemandQty: 0,
      baselineMonthlyDemand: 0,
      activeDemandMonths: 0,
      projectedSales: 0,
      recommendedQty: 0,
    };
    map.set(key, line);
  }
  return line;
}

async function buildReorderPlan(skuCode: string, options: ReorderPlanOptions = {}): Promise<ReorderPlan | null> {
  const totalStartedAt = Date.now();
  const timings: ReorderPlanTimingEntry[] = [];
  try {
  const sku = await timeReorderPlanStep(timings, 'sku', () => loadSku(skuCode));
  if (!sku) {
    logSlowReorderPlan(skuCode, Date.now() - totalStartedAt, timings);
    return null;
  }
  const demandSources = await timeReorderPlanStep(
    timings,
    'demandSources',
    () => getDemandSourceSkusForReplacementSkuId(sku.id),
  );
  const inquiry = await timeReorderPlanStep(timings, 'inventoryInquiry', () => getInventoryInquiry(sku.sku_code));
  if (!inquiry) {
    logSlowReorderPlan(sku.sku_code, Date.now() - totalStartedAt, timings);
    return null;
  }

  const [defaults, department, vendorDraftPo] = await Promise.all([
    timeReorderPlanStep(timings, 'defaults', () => loadDefaults(sku)),
    timeReorderPlanStep(timings, 'department', () => resolveDepartmentForCategory(sku.category_number)),
    timeReorderPlanStep(timings, 'vendorDraftPo', () => findVendorDraftPurchaseOrder(sku.vendor_id)),
  ]);
  const leadTimeDays = clampPositiveInt(options.leadTimeDays, defaults.leadTimeDays);
  const orderCycleDays = clampPositiveInt(options.orderCycleDays, defaults.orderCycleDays);
  const moqQty = clampNonNegativeInt(options.moqQty, defaults.moqQty);
  const analysisDate = new Date();
  const coverageDays = leadTimeDays + orderCycleDays;
  const { forecastStartMonth, forecastMonths } = resolveForecastMonths(analysisDate, leadTimeDays, orderCycleDays);
  const seasonalityHistoryEndMonth = lastCompletedYearMonth(analysisDate);
  const salesLookbackDays = 365;
  const columnLabels = inquiry.master.sizeType.columnLabels.filter((label) => label.trim().length > 0);
  const rowLabels = inquiry.master.sizeType.rowLabels.filter((label) => label.trim().length > 0);
  const modeledStoreNumbers = inquiry.stores
    .filter((store) => store.cells.some((cell) => Number(cell.model ?? 0) > 0))
    .map((store) => store.storeNumber);
  const fallbackStoreNumbers = modeledStoreNumbers.length > 0
    ? modeledStoreNumbers
    : inquiry.stores.map((store) => store.storeNumber);
  const detectedChains = await timeReorderPlanStep(timings, 'planningChains', () => loadPlanningChains(sku.id, fallbackStoreNumbers));
  const chains: ChainCandidate[] = [
    {
      chainId: null,
      chainLabel: 'Total order',
      storeNumbers: fallbackStoreNumbers,
      source: 'TOTAL',
    },
    ...detectedChains.filter((chain) => chain.storeNumbers.length > 0),
  ];
  const allChainStoreNumbers = [...new Set(chains.flatMap((chain) =>
    chain.storeNumbers.length > 0 ? chain.storeNumbers : fallbackStoreNumbers,
  ))].sort((a, b) => a - b);
  const warnings: string[] = [];
  if (!sku.vendor_id) warnings.push('SKU has no vendor; draft PO creation will be blocked until a vendor is assigned.');
  for (const source of demandSources) {
    warnings.push(`Demand includes replaced SKU ${source.skuCode}.`);
  }
  if (detectedChains.length === 0) warnings.push('No planning chains were detected for this SKU.');
  if (department.departmentNumber == null) {
    warnings.push('SKU category is not mapped to a department; reorder demand uses neutral seasonality.');
  }
  const [
    previousOrder,
    warehouseStoreNumbers,
    seasonalityRow,
    casePacks,
    supplierCasePackUsage,
    categoryCasePackUsage,
    nativeOpenPoBySize,
    skuMonthlySalesRows,
  ] = await Promise.all([
    timeReorderPlanStep(timings, 'previousOrder', () => loadPreviousOrder(sku, columnLabels)),
    timeReorderPlanStep(timings, 'warehouseStores', () => loadWarehouseStoreNumbers()),
    timeReorderPlanStep(timings, 'seasonality', () => getDepartmentSeasonalityRow(department.departmentNumber, seasonalityHistoryEndMonth)),
    timeReorderPlanStep(timings, 'casePacks', () => loadActiveCasePackCandidates(sku.size_type, columnLabels, rowLabels)),
    timeReorderPlanStep(timings, 'supplierCasePackUsage', () => loadSupplierCasePackUsage(sku.vendor_id, sku.size_type)),
    timeReorderPlanStep(timings, 'categoryCasePackUsage', () => loadCategoryCasePackUsage(sku.category_number, sku.size_type)),
    timeReorderPlanStep(timings, 'nativeOpenPoBySize', () => loadNativeOpenPurchaseOrdersBySize(sku.id)),
    timeReorderPlanStep(timings, 'skuMonthlySales', () =>
      loadSkuMonthlySalesByStoreAndSize(sku, allChainStoreNumbers, demandSources),
    ),
  ]);
  const previousCasePackCode = normalizeCasePackCode(previousOrder.casePackId);
  const casePacksForSuggestion = casePacks.map((pack) => {
    const usage = supplierCasePackUsage.get(normalizeCasePackCode(pack.code));
    const categoryUsage = categoryCasePackUsage.get(normalizeCasePackCode(pack.code));
    return {
      ...pack,
      supplierUsed: Boolean(usage),
      supplierUsageCount: usage?.usageCount ?? 0,
      supplierLastUsedAt: usage?.lastUsedAt ?? null,
      categorySkuCount: categoryUsage?.skuCount ?? 0,
      categoryUsageCount: categoryUsage?.usageCount ?? 0,
      categoryLastUsedAt: categoryUsage?.lastUsedAt ?? null,
      sameSkuPreviousPack: previousCasePackCode.length > 0
        && normalizeCasePackCode(pack.code) === previousCasePackCode,
    };
  });
  const seasonalityIndexes = indexesByCalendarMonth(seasonalityRow);
  if (seasonalityRow.sampleMonths === 0) {
    warnings.push('Department seasonality history is empty; every month is treated as a neutral 1.00 index.');
  }
  const warehouseStockByStore = await timeReorderPlanStep(timings, 'warehouseStock', () => loadWarehouseStockBySize(sku.id, warehouseStoreNumbers));
  const totalWarehouseOnHand = [...warehouseStockByStore.values()]
    .flatMap((bySize) => [...bySize.values()])
    .reduce((sum, qty) => sum + qty, 0);
  if (totalWarehouseOnHand > 0) {
    const stockStoreNumbers = [...warehouseStockByStore.entries()]
      .filter(([, bySize]) => [...bySize.values()].some((qty) => qty > 0))
      .map(([storeNumber]) => storeNumber);
    warnings.push(`Warehouse on-hand (${totalWarehouseOnHand} units in store ${stockStoreNumbers.join(', ')}) is included in availability before recommending reorder quantities.`);
  }

  const planChains: ReorderPlanChain[] = [];
  let categorySalesFallbackWarningAdded = false;
  for (const chain of chains) {
    const chainStartedAt = Date.now();
    const chainStores = chain.storeNumbers.length > 0 ? chain.storeNumbers : fallbackStoreNumbers;
    const storeSet = new Set(chainStores);
    const lineMap = new Map<string, MutableSizeLine>();
    addBaseSizeCells(lineMap, columnLabels, rowLabels);

    for (const store of inquiry.stores) {
      if (storeSet.size > 0 && !storeSet.has(store.storeNumber)) continue;
      for (const cell of store.cells) {
        const line = ensureLine(lineMap, cell.columnLabel, cell.rowLabel);
        const onHand = Number(cell.onHand ?? 0);
        const currentOnOrder = Number(cell.currentOnOrder ?? 0);
        const futureOnOrder = Number(cell.futureOnOrder ?? 0);
        const modelQty = Number(cell.model ?? 0);
        line.onHand += onHand;
        line.currentOnOrder += currentOnOrder;
        line.futureOnOrder += futureOnOrder;
        line.modelQty += modelQty;
      }
    }

    for (const [warehouseStoreNumber, stockBySize] of warehouseStockByStore) {
      if (storeSet.has(warehouseStoreNumber)) continue;
      for (const [key, qty] of stockBySize) {
        const [rowLabel, columnLabel] = key.split('|');
        const resolved = resolveSizeGridCell(columnLabel, rowLabel, columnLabels, rowLabels);
        if (!resolved) continue;
        const line = ensureLine(lineMap, resolved.columnLabel, resolved.rowLabel);
        line.onHand += qty;
      }
    }
    let nativeOnOrderSupplementQty = 0;
    for (const [key, nativeOpenQty] of nativeOpenPoBySize) {
      const [rowLabel, columnLabel] = key.split('|');
      const resolved = resolveSizeGridCell(columnLabel, rowLabel, columnLabels, rowLabels);
      if (!resolved) continue;
      const line = ensureLine(lineMap, resolved.columnLabel, resolved.rowLabel);
      const supplement = calculateNativeOnOrderSupplement({
        currentOnOrder: line.currentOnOrder,
        futureOnOrder: line.futureOnOrder,
        nativeOpenQty,
      });
      line.futureOnOrder += supplement;
      nativeOnOrderSupplementQty += supplement;
    }
    if (nativeOnOrderSupplementQty > 0 && chain.chainId == null) {
      warnings.push(`Open native purchase orders add ${nativeOnOrderSupplementQty} units to on-order availability before calculating the reorder suggestion.`);
    }

    const skuSalesRows = aggregateSkuMonthlySalesBySize(skuMonthlySalesRows, chainStores);

    for (const row of skuSalesRows) {
      const resolved = resolveSizeGridCell(row.column_label, row.row_label, columnLabels, rowLabels);
      if (!resolved) continue;
      const line = ensureLine(lineMap, resolved.columnLabel, resolved.rowLabel);
      const qty = asNumber(row.qty);
      line.skuSalesQty += qty;
      line.skuMonthlySales.set(row.year_month, (line.skuMonthlySales.get(row.year_month) ?? 0) + qty);
    }
    const chainSkuSalesQty = [...lineMap.values()].reduce((sum, line) => sum + line.skuSalesQty, 0);
    if (chainSkuSalesQty <= 0) {
      try {
        const categorySales = await timeReorderPlanStep(
          timings,
          `chain:${chain.chainLabel}:categorySales`,
          () => loadCategorySalesBySize(sku, chainStores),
        );
        for (const [key, qty] of categorySales) {
          const [rowLabel, columnLabel] = key.split('|');
          const resolved = resolveSizeGridCell(columnLabel, rowLabel, columnLabels, rowLabels);
          if (!resolved) continue;
          const line = ensureLine(lineMap, resolved.columnLabel, resolved.rowLabel);
          line.categorySalesQty += qty;
        }
      } catch (err) {
        if (!isTemporaryDatabaseResourceError(err)) throw err;
        if (!categorySalesFallbackWarningAdded) {
          warnings.push('Category sales curve fallback could not be loaded because the database was temporarily resource constrained; the planner used model/previous-order curve fallback instead.');
          categorySalesFallbackWarningAdded = true;
        }
      }
    }
    for (const [key, qty] of previousOrder.cells) {
      const [rowLabel, columnLabel] = key.split('|');
      const resolved = resolveSizeGridCell(columnLabel, rowLabel, columnLabels, rowLabels);
      if (!resolved) continue;
      const line = ensureLine(lineMap, resolved.columnLabel, resolved.rowLabel);
      line.previousOrderQty += qty;
    }

    const lines = [...lineMap.values()];
    const totalSkuSales = lines.reduce((sum, line) => sum + line.skuSalesQty, 0);
    const totalCategorySales = lines.reduce((sum, line) => sum + line.categorySalesQty, 0);
    const totalModel = lines.reduce((sum, line) => sum + line.modelQty, 0);
    const totalPrevious = lines.reduce((sum, line) => sum + line.previousOrderQty, 0);
    const curveSource: CurveSource =
      totalSkuSales > 0 ? 'SKU_SALES'
        : totalCategorySales > 0 ? 'CATEGORY_SALES'
          : totalModel > 0 ? 'MODEL'
            : totalPrevious > 0 ? 'PREVIOUS_ORDER'
              : 'NONE';
    normalizeRatios(lines, curveSource);

    const normalized = lines.map((line) => {
      const onOrder = line.currentOnOrder + line.futureOnOrder;
      line.modelShort = Math.max(0, line.modelQty - line.onHand - onOrder);
      const forecast = forecastSeasonalDemand(
        [...line.skuMonthlySales.entries()].map(([yearMonth, quantity]): MonthQuantity => ({ yearMonth, quantity })),
        seasonalityIndexes,
        forecastMonths,
      );
      line.forecastDemandQty = forecast.forecastQty;
      line.baselineMonthlyDemand = forecast.baselineMonthlyQty;
      line.activeDemandMonths = forecast.activeMonths;
      line.projectedSales = line.forecastDemandQty;
      line.recommendedQty = calculateRecommendedReorderQty({
        modelQty: line.modelQty,
        forecastDemandQty: line.forecastDemandQty,
        onHand: line.onHand,
        onOrder,
      });
      return {
        rowLabel: line.rowLabel,
        columnLabel: line.columnLabel,
        sizeLabel: line.sizeLabel,
        onHand: line.onHand,
        currentOnOrder: line.currentOnOrder,
        futureOnOrder: line.futureOnOrder,
        onOrder,
        modelQty: line.modelQty,
        modelShort: line.modelShort,
        skuSalesQty: line.skuSalesQty,
        categorySalesQty: line.categorySalesQty,
        previousOrderQty: line.previousOrderQty,
        curvePct: line.curvePct,
        curveSource: line.curveSource,
        forecastDemandQty: line.forecastDemandQty,
        baselineMonthlyDemand: line.baselineMonthlyDemand,
        activeDemandMonths: line.activeDemandMonths,
        projectedSales: line.projectedSales,
        recommendedQty: line.recommendedQty,
      };
    });

    const constrained = applyOrderConstraints(normalized, moqQty, sku.order_multiple)
      .sort((a, b) => a.rowLabel.localeCompare(b.rowLabel, undefined, { numeric: true })
        || a.columnLabel.localeCompare(b.columnLabel, undefined, { numeric: true }));
    const casePackChoices = buildCategoryFirstCasePackChoices(constrained, casePacksForSuggestion);
    const casePackSuggestion = casePackChoices[0] ?? null;

    planChains.push({
      chainId: chain.chainId,
      chainLabel: chain.chainLabel,
      source: chain.source,
      storeNumbers: chainStores,
      storeCount: chainStores.length,
      previousOrder: {
        poNumber: previousOrder.poNumber,
        orderDate: previousOrder.orderDate,
        source: previousOrder.source,
        casePackId: previousOrder.casePackId,
        casePackMultiplier: previousOrder.casePackMultiplier,
      },
      casePackSuggestion,
      casePackChoices,
      sizeLines: constrained,
      totals: {
        onHand: sumLine(constrained, (line) => line.onHand),
        currentOnOrder: sumLine(constrained, (line) => line.currentOnOrder),
        futureOnOrder: sumLine(constrained, (line) => line.futureOnOrder),
        modelQty: sumLine(constrained, (line) => line.modelQty),
        modelShort: sumLine(constrained, (line) => line.modelShort),
        skuSalesQty: sumLine(constrained, (line) => line.skuSalesQty),
        categorySalesQty: sumLine(constrained, (line) => line.categorySalesQty),
        previousOrderQty: sumLine(constrained, (line) => line.previousOrderQty),
        forecastDemandQty: sumLine(constrained, (line) => line.forecastDemandQty),
        projectedSales: sumLine(constrained, (line) => line.projectedSales),
        recommendedQty: sumLine(constrained, (line) => line.recommendedQty),
      },
    });
    timings.push({ name: `chain:${chain.chainLabel}:build`, ms: Date.now() - chainStartedAt });
  }

  const plan: ReorderPlan = {
    sku: {
      id: sku.id,
      code: sku.sku_code,
      description: sku.description,
      vendorCode: sku.vendor_id,
      category: sku.category_number,
      sizeTypeCode: sku.size_type,
      orderMultiple: sku.order_multiple,
      unitCost: asNumber(sku.current_cost),
      retailPrice: asNumber(sku.retail_price),
    },
    planning: {
      analysisDate: analysisDate.toISOString(),
      leadTimeDays,
      orderCycleDays,
      coverageDays,
      moqQty,
      salesLookbackDays,
      forecastMonths,
      forecastStartMonth,
      seasonalityHistoryEndMonth,
    },
    seasonality: {
      basis: 'DEPARTMENT_ALL_STORES',
      departmentNumber: department.departmentNumber,
      departmentLabel: department.departmentLabel ?? seasonalityRow.departmentLabel,
      averageMonthlyQty: seasonalityRow.averageMonthlyQty,
      sampleMonths: seasonalityRow.sampleMonths,
      indexes: seasonalityRow.months.map((month) => ({
        month: month.month,
        label: month.label,
        index: month.index,
        rawSalesQty: month.rawSalesQty,
      })),
    },
    vendorDraftPo,
    demandSources,
    defaults,
    chains: planChains,
    warnings,
  };
  logSlowReorderPlan(sku.sku_code, Date.now() - totalStartedAt, timings);
  return plan;
  } catch (err) {
    logSlowReorderPlan(skuCode, Date.now() - totalStartedAt, timings, err);
    throw err;
  }
}

export async function getReorderPlan(skuCode: string, options: ReorderPlanOptions = {}): Promise<ReorderPlan | null> {
  const release = await acquireReorderPlanSlot();
  try {
    return await buildReorderPlan(skuCode, options);
  } finally {
    release();
  }
}

export async function saveReorderDefaults(
  skuCode: string,
  input: SaveReorderDefaultsInput,
): Promise<ReorderPlannerDefaults | null> {
  const sku = await loadSku(skuCode);
  if (!sku) return null;
  const existing = await loadDefaults(sku);
  const scopeType = input.scopeType ?? 'SKU';
  const scopeKey = scopeType === 'SKU' ? sku.id : sku.vendor_id;
  if (!scopeKey) throw new Error('SKU has no vendor for vendor-scoped defaults.');
  const leadTimeDays = clampPositiveInt(input.leadTimeDays, existing.leadTimeDays);
  const orderCycleDays = clampPositiveInt(input.orderCycleDays, existing.orderCycleDays);
  const moqQty = clampNonNegativeInt(input.moqQty, existing.moqQty);
  const actor = cleanText(input.updatedBy) ?? 'system';

  const rows = await prisma.$queryRawUnsafe<Array<{
    scope_type: DefaultsScope;
    scope_key: string;
    lead_time_days: number;
    order_cycle_days: number;
    moq_qty: number;
    updated_at: Date | string | null;
    updated_by: string | null;
  }>>(
    `
      INSERT INTO app.reorder_planner_defaults (
        scope_type, scope_key, lead_time_days, order_cycle_days, moq_qty, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $6)
      ON CONFLICT (scope_type, scope_key)
      DO UPDATE SET
        lead_time_days = EXCLUDED.lead_time_days,
        order_cycle_days = EXCLUDED.order_cycle_days,
        moq_qty = EXCLUDED.moq_qty,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = EXCLUDED.updated_by
      RETURNING scope_type, scope_key, lead_time_days, order_cycle_days, moq_qty, updated_at, updated_by
    `,
    scopeType,
    scopeKey,
    leadTimeDays,
    orderCycleDays,
    moqQty,
    actor,
  );
  const row = rows[0];
  return {
    scope: row.scope_type,
    scopeKey: row.scope_key,
    leadTimeDays: Number(row.lead_time_days),
    orderCycleDays: Number(row.order_cycle_days),
    moqQty: Number(row.moq_qty),
    updatedAt: toIsoDate(row.updated_at),
    updatedBy: row.updated_by,
  };
}

export async function createReorderDraftPurchaseOrder(
  skuCode: string,
  input: CreateReorderDraftPoInput,
): Promise<ReorderDraftPoResult | null | { error: string }> {
  const sku = await loadSku(skuCode);
  if (!sku) return null;
  const replacementContext = await getReplacementContextBySkuId(sku.id);
  if (replacementContext.replacedBy) {
    return { error: `SKU_REPLACED_BY:${replacementContext.replacedBy.replacementSkuCode}` };
  }
  if (!sku.vendor_id) return { error: 'SKU_VENDOR_REQUIRED' };
  const defaults = await loadDefaults(sku);
  const leadTimeDays = clampPositiveInt(input.leadTimeDays, defaults.leadTimeDays);
  const orderCycleDays = clampPositiveInt(input.orderCycleDays, defaults.orderCycleDays);
  const moqQty = clampNonNegativeInt(input.moqQty, defaults.moqQty);
  const createdBy = cleanText(input.createdBy) ?? 'system';
  const sizeCells = input.sizeCells
    .map((cell) => ({
      columnLabel: cleanText(cell.columnLabel) ?? '',
      rowLabel: cleanText(cell.rowLabel) ?? '',
      quantity: Math.trunc(Number(cell.quantity)),
    }))
    .filter((cell) => cell.quantity > 0);
  const totalQuantity = sizeCells.reduce((sum, cell) => sum + cell.quantity, 0);
  if (totalQuantity <= 0) return { error: 'EMPTY_REORDER_QUANTITY' };
  const casePackId = cleanText(input.casePackId);
  let casePackMultiplier: number | null = null;
  if (casePackId) {
    const casePack = await getCasePackByCode(casePackId);
    if (!casePack) return { error: 'CASE_PACK_NOT_FOUND' };
    if (!casePack.active) return { error: 'CASE_PACK_INACTIVE' };
    if (sku.size_type == null || casePack.sizeTypeCode !== sku.size_type) {
      return { error: 'CASE_PACK_SIZE_TYPE_MISMATCH' };
    }
    casePackMultiplier = Math.max(1, Math.trunc(Number(input.casePackMultiplier ?? 1) || 1));
  }

  const notes = [
    `Generated from Inventory Inquiry reorder planner for SKU ${sku.sku_code}.`,
    `Chain: ${cleanText(input.chainLabel) ?? cleanText(input.chainId) ?? 'Unassigned'}.`,
    `Lead time: ${leadTimeDays} days. Order cycle: ${orderCycleDays} days. MOQ: ${moqQty}.`,
    casePackId ? `Case pack: ${casePackId} x ${casePackMultiplier}.` : null,
    `Calculation date: ${new Date().toISOString()}.`,
  ].filter(Boolean).join(' ');

  const newLineItem = {
    skuId: sku.id,
    quantity: totalQuantity,
    unitCost: asNumber(sku.current_cost),
    casePackId,
    casePackMultiplier,
    sizeCells,
  };

  const existingVendorDraftPo = await findVendorDraftPurchaseOrder(sku.vendor_id);
  if (existingVendorDraftPo) {
    const appendResult = await appendPurchaseOrderLineItem(existingVendorDraftPo.poId, {
      ...newLineItem,
      notes,
      expectedVendorId: sku.vendor_id,
    });
    if (!appendResult) return { error: 'EXISTING_PO_NOT_FOUND' };
    if ('error' in appendResult) return appendResult;
    return {
      poId: appendResult.id,
      poNumber: appendResult.poNumber,
      totalQuantity,
      mode: 'APPENDED',
      appendedToExistingPo: true,
      purchaseOrder: appendResult,
    };
  }

  const result = await createPurchaseOrder({
    vendorId: sku.vendor_id,
    lineItems: [newLineItem],
    notes,
    createdBy,
    origin: 'REORDER_PLANNER',
  });
  if ('error' in result) return result;
  return {
    poId: result.id,
    poNumber: result.poNumber,
    totalQuantity,
    mode: 'CREATED',
    appendedToExistingPo: false,
    purchaseOrder: result,
  };
}

export const __test = {
  aggregateSkuMonthlySalesBySize,
  loadSkuMonthlySalesByStoreAndSize,
  loadSkuMonthlySalesBySize,
};
