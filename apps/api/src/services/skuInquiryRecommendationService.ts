import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import {
  getInquiryInfo,
  getInquiryOpenPoRows,
  getInquiryTrend,
  getInventoryInquiry,
} from './ricsInventoryFacade';
import type {
  InventoryInquiry,
  InquiryInfoDetail,
  InquiryOpenPoRow,
  InquiryTrend,
} from './ricsInventoryAdapter';

export type InquiryRecommendationDecision =
  | 'NO_ACTION'
  | 'REBALANCE'
  | 'BUY'
  | 'MARKDOWN_REVIEW'
  | 'HOLD'
  | 'INVESTIGATE';

export type InquiryRecommendationUrgency = 'LOW' | 'MEDIUM' | 'HIGH';
export type InquiryRecommendationConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type InquiryRecommendationStyleTag = 'WINNER' | 'OK' | 'DUD';

export interface InquiryRecommendationBaselineRisk {
  daysUntilModelRisk: number | null;
  estimatedModelRiskDate: string | null;
  basis: string;
}

export interface InquiryRecommendationBuyPlan {
  shouldBuy: boolean;
  quantity: number | null;
  orderByDate: string | null;
  estimatedArrivalDate: string | null;
  leadTimeDays: number;
  basis: string;
}

export interface InquiryRecommendationAction {
  type: 'TRANSFER' | 'BUY' | 'MODEL_INCREASE' | 'MARKDOWN_REVIEW' | 'HOLD' | 'INVESTIGATE';
  priority: number;
  title: string;
  details: string;
  sourceStoreNumber?: number | null;
  sourceStoreName?: string | null;
  targetStoreNumber?: number | null;
  targetStoreName?: string | null;
  size?: string | null;
  quantity?: number | null;
}

export interface InquiryRecommendation {
  summary: string;
  styleTag: InquiryRecommendationStyleTag;
  decision: InquiryRecommendationDecision;
  urgency: InquiryRecommendationUrgency;
  confidence: InquiryRecommendationConfidence;
  baselineRisk: InquiryRecommendationBaselineRisk;
  buyPlan: InquiryRecommendationBuyPlan;
  actions: InquiryRecommendationAction[];
  reasons: string[];
  watchouts: string[];
  questions: string[];
}

export interface InquiryRecommendationRequest {
  notes?: string | null;
}

interface StoreSalesSummary {
  mtd: number;
  std: number;
  ytd: number;
  ly: number;
}

interface RecommendationSnapshot {
  sku: string;
  planning: {
    analysisDate: string;
    storeAutoReplenishmentCadenceDays: number;
    purchaseLeadTimeDays: number;
    monthToDateDaysElapsed: number;
    demandPaceUnitsPerDay: number | null;
    demandPaceSource: string | null;
    chainProjectedAvailable: number;
    chainExcessAboveModel: number;
    estimatedDaysUntilChainReachesModel: number | null;
    estimatedChainModelRiskDate: string | null;
    projectedUnitsSoldDuringLeadTime: number | null;
  };
  operatorContext: {
    notes: string | null;
  };
  header: {
    description: string | null;
    brand: string | null;
    vendorCode: string | null;
    category: number | null;
    season: string | null;
    sizeTypeCode: number | null;
    sizeTypeDescription: string | null;
    columns: string[];
    rows: string[];
  };
  pricing: InventoryInquiry['pricing'] | null;
  rollup: InventoryInquiry['rollup'] | null;
  info: InquiryInfoDetail | null;
  trend: {
    scopeLabel: string | null;
    current: InquiryTrend['columns'][number] | null;
    trailingWeeks: InquiryTrend['columns'];
  } | null;
  openPoRows: InquiryOpenPoRow[];
  chain: {
    onHand: number;
    currentOnOrder: number;
    futureOnOrder: number;
    totalModel: number;
    totalShort: number;
    totalExcess: number;
    visibleStoreCount: number;
  };
  sizes: Array<{
    size: string;
    onHand: number;
    model: number;
    short: number;
    excess: number;
    ytdSales: number;
    lySales: number;
    storesWithStock: number;
    storesMissingAtModel: number[];
  }>;
  stores: Array<{
    storeNumber: number;
    storeName: string;
    onHand: number;
    currentOnOrder: number;
    futureOnOrder: number;
    totalModel: number;
    totalShort: number;
    totalExcess: number;
    sales: StoreSalesSummary;
    missingSizes: Array<{ size: string; qtyShort: number }>;
    extraSizes: Array<{ size: string; qtyExcess: number }>;
  }>;
}

const PROMPT_PATH = path.join(__dirname, 'prompts', 'sku-inquiry-recommendation.md');
const DEFAULT_MODEL = process.env.SKU_INQUIRY_AI_MODEL?.trim() || 'claude-sonnet-4-6';
let cachedPrompt: { prompt: string; mtimeMs: number } | null = null;
const VALID_DECISIONS = new Set<InquiryRecommendationDecision>([
  'NO_ACTION',
  'REBALANCE',
  'BUY',
  'MARKDOWN_REVIEW',
  'HOLD',
  'INVESTIGATE',
]);
const VALID_URGENCY = new Set<InquiryRecommendationUrgency>(['LOW', 'MEDIUM', 'HIGH']);
const VALID_CONFIDENCE = new Set<InquiryRecommendationConfidence>(['LOW', 'MEDIUM', 'HIGH']);
const VALID_STYLE_TAGS = new Set<InquiryRecommendationStyleTag>(['WINNER', 'OK', 'DUD']);
const VALID_ACTION_TYPES = new Set<InquiryRecommendationAction['type']>([
  'TRANSFER',
  'BUY',
  'MODEL_INCREASE',
  'MARKDOWN_REVIEW',
  'HOLD',
  'INVESTIGATE',
]);

function loadPromptTemplate(): string {
  const stat = fs.statSync(PROMPT_PATH);
  if (cachedPrompt && cachedPrompt.mtimeMs === stat.mtimeMs) return cachedPrompt.prompt;
  const prompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
  cachedPrompt = { prompt, mtimeMs: stat.mtimeMs };
  return prompt;
}

export function clearSkuInquiryRecommendationPromptCache(): void {
  cachedPrompt = null;
}

function asTextBlock(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asOptionalInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asDecision(value: unknown): InquiryRecommendationDecision {
  return typeof value === 'string' && VALID_DECISIONS.has(value as InquiryRecommendationDecision)
    ? value as InquiryRecommendationDecision
    : 'INVESTIGATE';
}

function asUrgency(value: unknown): InquiryRecommendationUrgency {
  return typeof value === 'string' && VALID_URGENCY.has(value as InquiryRecommendationUrgency)
    ? value as InquiryRecommendationUrgency
    : 'MEDIUM';
}

function asConfidence(value: unknown): InquiryRecommendationConfidence {
  return typeof value === 'string' && VALID_CONFIDENCE.has(value as InquiryRecommendationConfidence)
    ? value as InquiryRecommendationConfidence
    : 'LOW';
}

function asStyleTag(value: unknown): InquiryRecommendationStyleTag {
  return typeof value === 'string' && VALID_STYLE_TAGS.has(value as InquiryRecommendationStyleTag)
    ? value as InquiryRecommendationStyleTag
    : 'OK';
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asOptionalString(item))
    .filter((item): item is string => item != null);
}

function normalizeAction(value: unknown, index: number): InquiryRecommendationAction | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const type =
    typeof record.type === 'string' && VALID_ACTION_TYPES.has(record.type as InquiryRecommendationAction['type'])
      ? record.type as InquiryRecommendationAction['type']
      : null;
  const title = asOptionalString(record.title);
  const details = asOptionalString(record.details);
  if (!type || !title || !details) return null;

  const priority = asOptionalInteger(record.priority) ?? index + 1;
  return {
    type,
    priority,
    title,
    details,
    sourceStoreNumber: asOptionalInteger(record.sourceStoreNumber),
    sourceStoreName: asOptionalString(record.sourceStoreName),
    targetStoreNumber: asOptionalInteger(record.targetStoreNumber),
    targetStoreName: asOptionalString(record.targetStoreName),
    size: asOptionalString(record.size),
    quantity: asOptionalInteger(record.quantity),
  };
}

function buildFallbackSummary(
  decision: InquiryRecommendationDecision,
  actions: InquiryRecommendationAction[],
): string {
  const decisionLabel = decision.replace(/_/g, ' ').toLowerCase();
  if (!actions.length) {
    return `AI recommendation: ${decisionLabel}.`;
  }
  return `AI recommendation: ${decisionLabel}. Top action: ${actions[0].title}.`;
}

function normalizeBaselineRisk(value: unknown): InquiryRecommendationBaselineRisk {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    daysUntilModelRisk: asOptionalInteger(record.daysUntilModelRisk),
    estimatedModelRiskDate: asOptionalString(record.estimatedModelRiskDate),
    basis: asOptionalString(record.basis) ?? 'AI did not provide a baseline-risk explanation.',
  };
}

function normalizeBuyPlan(value: unknown): InquiryRecommendationBuyPlan {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    shouldBuy: asBoolean(record.shouldBuy),
    quantity: asOptionalInteger(record.quantity),
    orderByDate: asOptionalString(record.orderByDate),
    estimatedArrivalDate: asOptionalString(record.estimatedArrivalDate),
    leadTimeDays: asOptionalInteger(record.leadTimeDays) ?? 90,
    basis: asOptionalString(record.basis) ?? 'AI did not provide a buy-plan explanation.',
  };
}

function normalizeRecommendationPayload(value: unknown): InquiryRecommendation {
  if (!value || typeof value !== 'object') {
    throw new Error('AI recommendation payload was empty');
  }

  const record = value as Record<string, unknown>;
  const decision = asDecision(record.decision);
  const actions = Array.isArray(record.actions)
    ? record.actions
        .map((action, index) => normalizeAction(action, index))
        .filter((action): action is InquiryRecommendationAction => action != null)
    : [];
  const summary = asOptionalString(record.summary) ?? buildFallbackSummary(decision, actions);

  return {
    summary,
    styleTag: asStyleTag(record.styleTag),
    decision,
    urgency: asUrgency(record.urgency),
    confidence: asConfidence(record.confidence),
    baselineRisk: normalizeBaselineRisk(record.baselineRisk),
    buyPlan: normalizeBuyPlan(record.buyPlan),
    actions,
    reasons: normalizeStringArray(record.reasons),
    watchouts: normalizeStringArray(record.watchouts),
    questions: normalizeStringArray(record.questions),
  };
}

function parseTextRecommendation(text: string): InquiryRecommendation {
  const normalized = asTextBlock(text);
  try {
    return normalizeRecommendationPayload(JSON.parse(normalized));
  } catch (error) {
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return normalizeRecommendationPayload(JSON.parse(normalized.slice(start, end + 1)));
      } catch {
        // Fall through to the final error below.
      }
    }
    const message = error instanceof Error ? error.message : 'unknown parse error';
    throw new Error(`AI recommendation response could not be parsed: ${message}`);
  }
}

function normalizeNotes(notes?: string | null): string | null {
  if (typeof notes !== 'string') return null;
  const trimmed = notes.trim();
  if (!trimmed) return null;
  return trimmed.length > 2000 ? trimmed.slice(0, 2000) : trimmed;
}

function numericCellValue(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function deriveDemandPace(
  rollup: InventoryInquiry['rollup'] | null | undefined,
  analysisDate: Date,
): { unitsPerDay: number | null; source: string | null } {
  const monthQty = numericCellValue(rollup?.month?.qty);
  if (monthQty > 0) {
    return {
      unitsPerDay: monthQty / Math.max(1, analysisDate.getDate()),
      source: 'MONTH_TO_DATE',
    };
  }

  const weekQty = numericCellValue(rollup?.week?.qty);
  if (weekQty > 0) {
    return {
      unitsPerDay: weekQty / 7,
      source: 'WEEK',
    };
  }

  const yearQty = numericCellValue(rollup?.year?.qty);
  if (yearQty > 0) {
    return {
      unitsPerDay: yearQty / 365,
      source: 'YEAR',
    };
  }

  return {
    unitsPerDay: null,
    source: null,
  };
}

function parseSalesByStore(grid: InventoryInquiry['grids']['allStoresSummary'] | undefined): Map<number, StoreSalesSummary> {
  const out = new Map<number, StoreSalesSummary>();
  if (!grid) return out;
  const labels = new Set(['MTD Sales', 'STD Sales', 'YTD Sales', 'L/Y Sales']);
  const rows = new Map(grid.rows.map((row) => [row.label, row.cells]));

  grid.columns.forEach((col, idx) => {
    const storeNumber = Number(col);
    if (!Number.isFinite(storeNumber)) return;
    let hasAny = false;
    const summary: StoreSalesSummary = { mtd: 0, std: 0, ytd: 0, ly: 0 };
    for (const label of labels) {
      const cells = rows.get(label);
      const value = numericCellValue(cells?.[idx]?.value);
      if (value !== 0) hasAny = true;
      if (label === 'MTD Sales') summary.mtd = value;
      if (label === 'STD Sales') summary.std = value;
      if (label === 'YTD Sales') summary.ytd = value;
      if (label === 'L/Y Sales') summary.ly = value;
    }
    if (hasAny) out.set(storeNumber, summary);
  });
  return out;
}

export function buildSkuRecommendationSnapshot(
  inquiry: InventoryInquiry,
  info: InquiryInfoDetail | null,
  trend: InquiryTrend | null,
  openPoRows: InquiryOpenPoRow[],
  notes?: string | null,
): RecommendationSnapshot {
  const storeSales = parseSalesByStore(inquiry.grids?.allStoresSummary);
  const sizeMap = new Map<string, {
    size: string;
    onHand: number;
    model: number;
    short: number;
    excess: number;
    ytdSales: number;
    lySales: number;
    storesWithStock: number;
    storesMissingAtModel: number[];
  }>();

  const stores = (inquiry.stores ?? []).map((store) => {
    let totalModel = 0;
    let totalShort = 0;
    let totalExcess = 0;
    const missingSizes: Array<{ size: string; qtyShort: number }> = [];
    const extraSizes: Array<{ size: string; qtyExcess: number }> = [];

    for (const cell of store.cells ?? []) {
      const size = cell.columnLabel || '(blank)';
      const onHand = numericCellValue(cell.onHand);
      const model = numericCellValue(cell.model);
      const ytdSales = numericCellValue(cell.ytdSales);
      const lySales = numericCellValue(cell.lySales);
      totalModel += model;
      const short = Math.max(0, model - onHand);
      const excess = Math.max(0, onHand - model);
      totalShort += short;
      totalExcess += excess;
      if (short > 0) missingSizes.push({ size, qtyShort: short });
      if (excess > 0) extraSizes.push({ size, qtyExcess: excess });

      const existing = sizeMap.get(size) ?? {
        size,
        onHand: 0,
        model: 0,
        short: 0,
        excess: 0,
        ytdSales: 0,
        lySales: 0,
        storesWithStock: 0,
        storesMissingAtModel: [],
      };
      existing.onHand += onHand;
      existing.model += model;
      existing.short += short;
      existing.excess += excess;
      existing.ytdSales += ytdSales;
      existing.lySales += lySales;
      if (onHand > 0) existing.storesWithStock += 1;
      if (short > 0) existing.storesMissingAtModel.push(store.storeNumber);
      sizeMap.set(size, existing);
    }

    return {
      storeNumber: store.storeNumber,
      storeName: store.storeName ?? `Store ${store.storeNumber}`,
      onHand: numericCellValue(store.totals?.onHand),
      currentOnOrder: numericCellValue(store.totals?.currentOnOrder),
      futureOnOrder: numericCellValue(store.totals?.futureOnOrder),
      totalModel,
      totalShort,
      totalExcess,
      sales: storeSales.get(store.storeNumber) ?? { mtd: 0, std: 0, ytd: 0, ly: 0 },
      missingSizes,
      extraSizes,
    };
  });

  const analysisDate = new Date();
  const chainTotalModel = stores.reduce((sum, store) => sum + store.totalModel, 0);
  const chainProjectedAvailable =
    numericCellValue(inquiry.totals?.onHand) +
    numericCellValue(inquiry.totals?.currentOnOrder) +
    numericCellValue(inquiry.totals?.futureOnOrder);
  const chainExcessAboveModel = chainProjectedAvailable - chainTotalModel;
  const demandPace = deriveDemandPace(inquiry.rollup ?? null, analysisDate);
  const estimatedDaysUntilChainReachesModel =
    demandPace.unitsPerDay != null
      ? Math.max(0, Math.ceil(chainExcessAboveModel / demandPace.unitsPerDay))
      : null;
  const estimatedChainModelRiskDate =
    estimatedDaysUntilChainReachesModel != null
      ? formatIsoDate(addDays(analysisDate, estimatedDaysUntilChainReachesModel))
      : null;

  return {
    sku: inquiry.sku,
    planning: {
      analysisDate: formatIsoDate(analysisDate),
      storeAutoReplenishmentCadenceDays: 2,
      purchaseLeadTimeDays: 90,
      monthToDateDaysElapsed: analysisDate.getDate(),
      demandPaceUnitsPerDay: demandPace.unitsPerDay,
      demandPaceSource: demandPace.source,
      chainProjectedAvailable,
      chainExcessAboveModel,
      estimatedDaysUntilChainReachesModel,
      estimatedChainModelRiskDate,
      projectedUnitsSoldDuringLeadTime:
        demandPace.unitsPerDay != null ? Math.ceil(demandPace.unitsPerDay * 90) : null,
    },
    operatorContext: {
      notes: normalizeNotes(notes),
    },
    header: {
      description: inquiry.master?.description ?? null,
      brand: inquiry.master?.brand ?? null,
      vendorCode: inquiry.master?.vendorCode ?? null,
      category: inquiry.master?.category ?? null,
      season: inquiry.master?.season ?? null,
      sizeTypeCode: inquiry.master?.sizeType?.code ?? null,
      sizeTypeDescription: inquiry.master?.sizeType?.desc ?? null,
      columns: inquiry.master?.sizeType?.columnLabels ?? [],
      rows: inquiry.master?.sizeType?.rowLabels ?? [],
    },
    pricing: inquiry.pricing ?? null,
    rollup: inquiry.rollup ?? null,
    info,
    trend: trend
      ? {
          scopeLabel: trend.scopeLabel ?? null,
          current: trend.columns.find((col) => col.label === 'Current') ?? null,
          trailingWeeks: trend.columns,
        }
      : null,
    openPoRows,
    chain: {
      onHand: numericCellValue(inquiry.totals?.onHand),
      currentOnOrder: numericCellValue(inquiry.totals?.currentOnOrder),
      futureOnOrder: numericCellValue(inquiry.totals?.futureOnOrder),
      totalModel: chainTotalModel,
      totalShort: stores.reduce((sum, store) => sum + store.totalShort, 0),
      totalExcess: stores.reduce((sum, store) => sum + store.totalExcess, 0),
      visibleStoreCount: stores.length,
    },
    sizes: Array.from(sizeMap.values()).sort((a, b) => {
      if (b.short !== a.short) return b.short - a.short;
      if (b.excess !== a.excess) return b.excess - a.excess;
      return a.size.localeCompare(b.size);
    }),
    stores: stores.sort((a, b) => {
      if (b.totalShort !== a.totalShort) return b.totalShort - a.totalShort;
      if (b.sales.ytd !== a.sales.ytd) return b.sales.ytd - a.sales.ytd;
      return a.storeNumber - b.storeNumber;
    }),
  };
}

export async function analyzeSkuInquiryRecommendation(
  sku: string,
  request: InquiryRecommendationRequest = {},
): Promise<InquiryRecommendation | null> {
  const notes = normalizeNotes(request.notes);
  const [inquiry, info, trend, openPoRows] = await Promise.all([
    getInventoryInquiry(sku),
    getInquiryInfo(sku),
    getInquiryTrend(sku),
    getInquiryOpenPoRows(sku),
  ]);

  if (!inquiry) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const prompt = loadPromptTemplate();
  const snapshot = buildSkuRecommendationSnapshot(inquiry, info, trend, openPoRows, notes);
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2200,
    messages: [
      {
        role: 'user',
        content:
          `${prompt}\n\nReturn one complete JSON object and no surrounding text.` +
          `\n\n## Snapshot\n\n${JSON.stringify(snapshot, null, 2)}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No structured response from AI recommendation service');
  }

  return parseTextRecommendation(textBlock.text);
}
