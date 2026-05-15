import { prisma } from '../../db/prisma';
import { getSkuStoreCellRollup } from '../ricsInventoryAdapter';
import { createPurchasePlan, getPurchasePlan, getPurchasePlanSalesTrendSummary } from './purchasePlanningSavedService';
import {
  completeBuyerSalesProjectionCard,
  linkBuyerSalesProjectionPlanDraft,
  syncBuyerSalesProjectionDraftForPlan,
} from './buyerSalesProjectionSync';
import { buildSeasonWindowFromYearMonth } from './season';
import type { PurchasePlanDetailResponse, PurchasePlanSalesTrendSummary } from './types';

const ATTRIBUTE_VARIANCE_PCT_THRESHOLD = 10;
const ATTRIBUTE_VARIANCE_UNITS_THRESHOLD = 20;

type DbClient = {
  $queryRawUnsafe: typeof prisma.$queryRawUnsafe;
  $executeRawUnsafe: typeof prisma.$executeRawUnsafe;
};

export type BuyerWorkbookSeason = 'SPRING_SUMMER' | 'FALL_WINTER';
export type BuyerWorkbookStatus = 'DRAFT' | 'ARCHIVED';
export type BuyerCategoryStatus =
  | 'NOT_STARTED'
  | 'HISTORY_REVIEWED'
  | 'CARRYOVER_REVIEW'
  | 'CARRYOVERS'
  | 'NEW_STYLES'
  | 'PO_LINKED'
  | 'COMPLETE'
  | 'NO_BUDGET';

export type PlannedStyleStatus = 'PLANNED' | 'SELECTED' | 'LINKED' | 'CANCELLED';
export type CarryoverDecision = 'UNREVIEWED' | 'WINNER' | 'MAYBE' | 'DROP';
export type CarryoverAvailability = 'UNKNOWN' | 'AVAILABLE' | 'UNAVAILABLE';
export type BuyerChecklistStepStatus = 'missing' | 'draft' | 'confirmed' | 'complete' | 'alert' | 'not_applicable';

export interface BuyerChecklistSalesProjectionStep {
  status: BuyerChecklistStepStatus;
  projectedUnits: number;
  updatedAt: string | null;
  planId: string | null;
}

export interface BuyerChecklistInventoryPlanStep {
  status: BuyerChecklistStepStatus;
  hasProjectionPlan: boolean;
  currentInventoryUnits: number;
  departmentOtbUnits: number | null;
}

export interface BuyerChecklistCarryoverStep {
  status: BuyerChecklistStepStatus;
  targetCount: number;
  plannedCount: number;
  boughtCount: number;
}

export interface BuyerChecklistAttributePlanStep {
  status: BuyerChecklistStepStatus;
  plannedUnits: number;
  currentInventoryUnits: number;
  purchaseUnits: number;
  actualUnits: number;
  maxVariancePct: number;
  maxVarianceUnits: number;
  alertCount: number;
  updatedAt: string | null;
}

export interface BuyerChecklistWorkflowSteps {
  salesProjection: BuyerChecklistSalesProjectionStep;
  inventoryPlan: BuyerChecklistInventoryPlanStep;
  carryovers: BuyerChecklistCarryoverStep;
  attributePlan: BuyerChecklistAttributePlanStep;
}

export class BuyerWorkbookServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isBuyerWorkbookServiceError(err: unknown): err is BuyerWorkbookServiceError {
  return err instanceof BuyerWorkbookServiceError;
}

export interface HistoricalMonthMetric {
  yearMonth: string;
  quantitySold: number;
  netSales: number;
  profit: number;
  beginningOnHand: number;
  inventoryValue: number;
  roiPct: number | null;
  turns: number | null;
  newSkuDistinctCount: number;
  carryoverSkuDistinctCount: number;
  newSkuUnitsSold: number;
  carryoverSkuUnitsSold: number;
  sellThroughPct: number | null;
}

export interface HistoricalTargetSummary {
  suggestedNewSkuCount: number;
  suggestedCarryoverSkuCount: number;
  sampleMonths: number;
  totalQuantitySold: number;
  totalNetSales: number;
  averageBeginningOnHand: number;
}

export interface SalesProjectionMonth {
  yearMonth: string;
  projectedUnits: number;
  projectedSales: number;
}

export interface SalesProjectionPlan {
  months: SalesProjectionMonth[];
  totalProjectedUnits: number;
  totalProjectedSales: number;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface AttributeMixRow {
  valueCode: string;
  valueLabel: string;
  unitsSold: number;
  netSales: number;
  profit: number;
  salesPct: number;
  roiPct: number | null;
  sellThroughPct: number | null;
  skuCount: number;
}

export interface AttributeMixDimension {
  dimensionCode: string;
  dimensionLabel: string;
  totalUnitsSold: number;
  totalNetSales: number;
  totalProfit: number;
  values: AttributeMixRow[];
}

export interface AttributePlanRow {
  id: string;
  workbookId: string;
  cardId: string;
  dimensionCode: string;
  dimensionLabel: string;
  valueCode: string;
  valueLabel: string;
  plannedStyleCount: number;
  plannedUnits: number;
  notes: string | null;
  updatedBy: string;
  updatedAt: string;
}

export interface AttributeReconciliationRow {
  dimensionCode: string;
  dimensionLabel: string;
  valueCode: string;
  valueLabel: string;
  plannedStyleCount: number;
  plannedUnits: number;
  currentInventoryUnits: number;
  purchaseUnits: number;
  actualUnits: number;
  plannedPct: number;
  actualPct: number;
  varianceUnits: number;
  variancePct: number;
  status: BuyerChecklistStepStatus;
}

export interface AttributeReconciliationDimension {
  dimensionCode: string;
  dimensionLabel: string;
  plannedUnits: number;
  currentInventoryUnits: number;
  purchaseUnits: number;
  actualUnits: number;
  maxVariancePct: number;
  maxVarianceUnits: number;
  alertCount: number;
  values: AttributeReconciliationRow[];
}

export interface CarryoverCandidateMetrics {
  unitsSold: number;
  netSales: number;
  profit: number;
  grossProfitPct: number | null;
  inventoryValue: number;
  roiPct: number | null;
  turns: number | null;
  currentOnHand: number;
  currentOnOrder: number;
  futureOnOrder: number;
  sellThroughPct: number | null;
}

export interface CarryoverCandidate {
  id: string;
  workbookId: string;
  cardId: string;
  storeId: number;
  categoryNumber: number;
  skuId: string | null;
  skuCode: string;
  skuDescription: string | null;
  color: string | null;
  metrics: CarryoverCandidateMetrics;
  decision: CarryoverDecision;
  availability: CarryoverAvailability;
  unavailableReason: string | null;
  carryoverLineId: string | null;
  replacementStyleId: string | null;
  notes: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuyerChecklistSeasonPlan {
  buyingSeason: BuyerWorkbookSeason;
  seasonYear: number;
  workbookId: string | null;
  cardId: string | null;
  status: BuyerCategoryStatus | null;
  updatedAt: string | null;
  noBudgetId: string | null;
  noBudgetNote: string | null;
  noBudgetMarkedBy: string | null;
  noBudgetMarkedAt: string | null;
  steps?: BuyerChecklistWorkflowSteps | null;
}

export interface BuyerChecklistCategoryRow {
  buyerCode: string | null;
  buyerLabel: string | null;
  categoryNumber: number;
  categoryLabel: string;
  departmentNumber: number | null;
  departmentLabel: string;
  last12MonthsSales: number;
  last12MonthsUnits: number;
  currentInventoryUnits: number;
  currentInventoryValue: number;
  departmentOtbUnits: number | null;
  currentSeason: BuyerChecklistSeasonPlan;
  nextSeason: BuyerChecklistSeasonPlan;
  followingSeason: BuyerChecklistSeasonPlan;
  action: 'START_REVIEW' | 'CONTINUE' | 'NO_BUDGET';
}

type BuyerChecklistCategorySqlRow = {
  buyerCode: string | null;
  buyerLabel: string | null;
  categoryNumber: number;
  categoryLabel: string;
  departmentNumber: number | null;
  departmentLabel: string | null;
};

type BuyerChecklistCategorySalesSqlRow = {
  categoryNumber: number;
  last12MonthsSales: unknown;
  last12MonthsUnits: unknown;
};

type BuyerChecklistCategoryInventorySqlRow = {
  categoryNumber: number;
  currentInventoryUnits: unknown;
  currentInventoryValue: unknown;
};

export interface BuyerNoBudgetCategoryResult {
  categoryNumber: number;
  buyingSeason: BuyerWorkbookSeason;
  seasonYear: number;
  status: 'NO_BUDGET' | 'REOPENED';
  noBudgetId: string | null;
}

export interface BuyerWorkbookListItem {
  id: string;
  label: string;
  status: BuyerWorkbookStatus;
  buyingSeason: BuyerWorkbookSeason;
  seasonYear: number;
  seasonMonths: string[];
  seedStoreId: number;
  targetStoreIds: number[];
  buyer: string;
  cardCount: number;
  completeCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface BuyerCategoryCard {
  id: string;
  workbookId: string;
  departmentNumber: number | null;
  departmentLabel: string;
  categoryNumber: number;
  categoryLabel: string;
  status: BuyerCategoryStatus;
  seedStoreId: number;
  targetStoreIds: number[];
  suggestedNewSkuCount: number;
  suggestedCarryoverSkuCount: number;
  targetNewSkuCount: number;
  targetCarryoverSkuCount: number;
  replacementStyleTargetCount: number;
  additionalNewStyleTargetCount: number;
  totalNewStyleTargetCount: number;
  history: {
    months: HistoricalMonthMetric[];
    summary: HistoricalTargetSummary;
  };
  salesProjection: SalesProjectionPlan;
  salesProjectionPlanId: string | null;
  attributeMix: AttributeMixDimension[];
  attributeReconciliation: AttributeReconciliationDimension[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoreCategoryPlan {
  id: string;
  workbookId: string;
  cardId: string;
  storeId: number;
  copiedFromStoreId: number | null;
  status: 'DRAFT' | 'COPIED' | 'EDITED';
  targetNewSkuCount: number;
  targetCarryoverSkuCount: number;
  notes: string | null;
}

export interface CarryoverLine {
  id: string;
  workbookId: string;
  cardId: string;
  storeId: number | null;
  skuId: string | null;
  skuCode: string;
  skuDescription: string | null;
  color: string | null;
  sizeCells: Array<{
    rowLabel?: string | null;
    columnLabel?: string | null;
    sizeLabel?: string | null;
    quantity: number;
    plannedQty?: number;
    recommendedQty?: number;
    onHand?: number;
    currentOnOrder?: number;
    futureOnOrder?: number;
    modelQty?: number;
    modelShort?: number;
    skuSalesQty?: number;
    forecastDemandQty?: number;
  }>;
  totalQuantity: number;
  source: 'SEED' | 'COPY' | 'MANUAL' | 'REORDER_PLANNER';
  unavailable: boolean;
  unavailableReason: string | null;
  replacementStyleId: string | null;
  carryoverCandidateId: string | null;
  notes: string | null;
}

export interface PlannedStyle {
  id: string;
  workbookId: string;
  cardId: string;
  replacementForCarryoverLineId: string | null;
  replacementForCarryoverCandidateId: string | null;
  vendorCode: string | null;
  vendorName: string | null;
  workingStyle: string | null;
  description: string | null;
  color: string | null;
  colorFamily: string | null;
  attributes: Record<string, unknown>;
  quotedUnitCost: number | null;
  targetNewSkuCount: number;
  targetUnits: number;
  status: PlannedStyleStatus;
  linkedSkuId: string | null;
  linkedSkuCode: string | null;
  notes: string | null;
}

export interface PoLink {
  id: string;
  workbookId: string;
  cardId: string;
  carryoverLineId: string | null;
  plannedStyleId: string | null;
  poId: string;
  poNumber: string;
  poLineId: string | null;
  quantity: number;
  notes: string | null;
  linkedBy: string;
  linkedAt: string;
}

export interface BuyerWorkbookDetail {
  workbook: Omit<BuyerWorkbookListItem, 'cardCount' | 'completeCount'>;
  cards: BuyerCategoryCard[];
  storePlans: StoreCategoryPlan[];
  carryoverCandidates: CarryoverCandidate[];
  carryovers: CarryoverLine[];
  plannedStyles: PlannedStyle[];
  attributePlans: AttributePlanRow[];
  poLinks: PoLink[];
}

export interface BuyerSalesProjectionWorkbookResult {
  plan: PurchasePlanDetailResponse;
  trendSummary: PurchasePlanSalesTrendSummary;
  buyerWorkbook: BuyerWorkbookDetail;
}

export interface StoreCategoryCarryingRow {
  storeId: number;
  storeLabel: string;
  categoryNumber: number;
  categoryLabel: string;
  carries: boolean;
  suggestedCarries: boolean;
  stockSkuCount: number;
  stockUnits: number;
  modelSkuCount: number;
  modelUnits: number;
  source: 'SEED' | 'CHAIN' | 'MANUAL';
  chainCode: string | null;
  note: string | null;
  updatedBy: string;
  updatedAt: string;
}

interface CategoryRow {
  categoryNumber: number;
  categoryLabel: string;
  departmentNumber: number | null;
  departmentLabel: string | null;
}

interface WorkbookRow {
  id: string;
  label: string;
  status: BuyerWorkbookStatus;
  buyingSeason: BuyerWorkbookSeason;
  seasonYear: number;
  seasonMonths: string[] | null;
  seedStoreId: number;
  targetStoreIds: number[] | string[] | null;
  buyer: string;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  archivedAt: Date | string | null;
  cardCount?: unknown;
  completeCount?: unknown;
}

interface CardRow {
  id: string;
  workbookId: string;
  departmentNumber: number | null;
  departmentLabel: string;
  categoryNumber: number;
  categoryLabel: string;
  status: BuyerCategoryStatus;
  seedStoreId: number;
  targetStoreIds: number[] | string[] | null;
  suggestedNewSkuCount: number;
  suggestedCarryoverSkuCount: number;
  targetNewSkuCount: number;
  targetCarryoverSkuCount: number;
  replacementStyleTargetCount: number;
  additionalNewStyleTargetCount: number;
  totalNewStyleTargetCount: number;
  historyJson: unknown;
  salesProjectionJson: unknown;
  salesProjectionUnits: unknown;
  salesProjectionSales: unknown;
  salesProjectionUpdatedBy: string | null;
  salesProjectionUpdatedAt: Date | string | null;
  salesProjectionPlanId: string | null;
  attributeMixJson: unknown;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface BuyerChecklistPlanSqlRow {
  categoryNumber: number;
  buyingSeason: BuyerWorkbookSeason;
  seasonYear: number;
  workbookId: string;
  cardId: string;
  status: BuyerCategoryStatus;
  updatedAt: Date | string;
  salesProjectionPlanId: string | null;
  salesProjectionUnits: unknown;
  salesProjectionUpdatedAt: Date | string | null;
  targetCarryoverSkuCount: unknown;
  plannedCarryoverCount: unknown;
  boughtCarryoverCount: unknown;
}

interface StorePlanRow {
  id: string;
  workbookId: string;
  cardId: string;
  storeId: number;
  copiedFromStoreId: number | null;
  status: 'DRAFT' | 'COPIED' | 'EDITED';
  targetNewSkuCount: number;
  targetCarryoverSkuCount: number;
  notes: string | null;
}

interface CarryoverRow {
  id: string;
  workbookId: string;
  cardId: string;
  storeId: number | null;
  skuId: string | null;
  skuCode: string;
  skuDescription: string | null;
  color: string | null;
  sizeCells: unknown;
  totalQuantity: number;
  source: CarryoverLine['source'];
  unavailable: boolean;
  unavailableReason: string | null;
  replacementStyleId: string | null;
  carryoverCandidateId: string | null;
  notes: string | null;
}

interface PlannedStyleRow {
  id: string;
  workbookId: string;
  cardId: string;
  replacementForCarryoverLineId: string | null;
  replacementForCarryoverCandidateId: string | null;
  vendorCode: string | null;
  vendorName: string | null;
  workingStyle: string | null;
  description: string | null;
  color: string | null;
  colorFamily: string | null;
  attributesJson: unknown;
  quotedUnitCost: unknown;
  targetNewSkuCount: number;
  targetUnits: number;
  status: PlannedStyleStatus;
  linkedSkuId: string | null;
  linkedSkuCode: string | null;
  notes: string | null;
}

interface CarryoverCandidateRow {
  id: string;
  workbookId: string;
  cardId: string;
  storeId: number;
  categoryNumber: number;
  skuId: string | null;
  skuCode: string;
  skuDescription: string | null;
  color: string | null;
  metricsJson: unknown;
  decision: CarryoverDecision;
  availability: CarryoverAvailability;
  unavailableReason: string | null;
  carryoverLineId: string | null;
  replacementStyleId: string | null;
  notes: string | null;
  reviewedBy: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface AttributePlanDbRow {
  id: string;
  workbookId: string;
  cardId: string;
  dimensionCode: string;
  dimensionLabel: string;
  valueCode: string;
  valueLabel: string;
  plannedStyleCount: number;
  plannedUnits: number;
  notes: string | null;
  updatedBy: string;
  updatedAt: Date | string;
}

interface AttributeActualSqlRow {
  cardId: string;
  dimensionCode: string;
  dimensionLabel: string;
  valueCode: string;
  valueLabel: string;
  currentInventoryUnits: unknown;
  purchaseUnits: unknown;
}

interface PoLinkRow {
  id: string;
  workbookId: string;
  cardId: string;
  carryoverLineId: string | null;
  plannedStyleId: string | null;
  poId: string;
  poNumber: string;
  poLineId: string | null;
  quantity: number;
  notes: string | null;
  linkedBy: string;
  linkedAt: Date | string;
}

interface HistorySqlRow {
  yearMonth: string;
  quantitySold: unknown;
  netSales: unknown;
  profit: unknown;
  beginningOnHand: unknown;
  inventoryValue: unknown;
  newSkuDistinctCount: unknown;
  carryoverSkuDistinctCount: unknown;
  newSkuUnitsSold: unknown;
  carryoverSkuUnitsSold: unknown;
}

interface AttributeMixSqlRow {
  dimensionCode: string;
  dimensionLabel: string;
  valueCode: string;
  valueLabel: string;
  unitsSold: unknown;
  netSales: unknown;
  profit: unknown;
  inventoryValue: unknown;
  skuCount: unknown;
}

interface CarryoverCandidateMetricSqlRow {
  skuId: string | null;
  skuCode: string;
  skuDescription: string | null;
  color: string | null;
  unitsSold: unknown;
  netSales: unknown;
  profit: unknown;
  inventoryValue: unknown;
  currentOnHand: unknown;
  currentOnOrder: unknown;
  futureOnOrder: unknown;
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'object' && 'toNumber' in value) {
    const decimalLike = value as { toNumber?: () => number };
    if (typeof decimalLike.toNumber === 'function') return Number(decimalLike.toNumber());
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function toNullableNumber(value: unknown): number | null {
  return value == null ? null : toNumber(value);
}

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseIntArray(value: number[] | string[] | null | undefined): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0)
    .sort((a, b) => a - b);
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function jsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as T[] : [];
    } catch {
      return [];
    }
  }
  return [];
}

function jsonObject<T extends Record<string, unknown>>(value: unknown): T {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as T;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : {} as T;
    } catch {
      return {} as T;
    }
  }
  return {} as T;
}

function yearMonth(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function monthsForBuyerSeason(season: BuyerWorkbookSeason, seasonYear: number): string[] {
  if (season === 'SPRING_SUMMER') {
    return [2, 3, 4, 5, 6, 7].map((month) => yearMonth(seasonYear, month));
  }
  return [
    yearMonth(seasonYear, 8),
    yearMonth(seasonYear, 9),
    yearMonth(seasonYear, 10),
    yearMonth(seasonYear, 11),
    yearMonth(seasonYear, 12),
    yearMonth(seasonYear + 1, 1),
  ];
}

function shiftYearMonth(input: string, offsetMonths: number): string {
  const [yearRaw, monthRaw] = input.split('-');
  const date = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1 + offsetMonths, 1));
  return yearMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

function monthNumbers(months: string[]): number[] {
  return uniqueSorted(months.map((month) => Number(month.slice(5, 7))));
}

export function calculateSellThroughPct(input: {
  unitsSold: number;
  beginningInventory: number;
  inboundUnits?: number | null;
}): number | null {
  if (input.inboundUnits == null) return null;
  const available = Math.max(0, input.beginningInventory) + Math.max(0, input.inboundUnits);
  if (available <= 0) return null;
  return Math.round((Math.max(0, input.unitsSold) / available) * 1000) / 10;
}

export function summarizeHistoricalTargets(months: HistoricalMonthMetric[]): HistoricalTargetSummary {
  const sampleMonths = months.length;
  const totalQuantitySold = months.reduce((sum, row) => sum + row.quantitySold, 0);
  const totalNetSales = months.reduce((sum, row) => sum + row.netSales, 0);
  const averageBeginningOnHand = sampleMonths
    ? Math.round(months.reduce((sum, row) => sum + row.beginningOnHand, 0) / sampleMonths)
    : 0;
  return {
    suggestedNewSkuCount: sampleMonths
      ? Math.round(months.reduce((sum, row) => sum + row.newSkuDistinctCount, 0) / sampleMonths)
      : 0,
    suggestedCarryoverSkuCount: sampleMonths
      ? Math.round(months.reduce((sum, row) => sum + row.carryoverSkuDistinctCount, 0) / sampleMonths)
      : 0,
    sampleMonths,
    totalQuantitySold,
    totalNetSales,
    averageBeginningOnHand,
  };
}

function normalizeSalesProjection(row: CardRow, historyMonths: HistoricalMonthMetric[]): SalesProjectionPlan {
  const savedMonths = jsonArray<Partial<SalesProjectionMonth>>(row.salesProjectionJson)
    .map((month) => ({
      yearMonth: typeof month.yearMonth === 'string' ? month.yearMonth : '',
      projectedUnits: Math.max(0, Math.round(toNumber(month.projectedUnits))),
      projectedSales: Math.max(0, Math.round(toNumber(month.projectedSales) * 100) / 100),
    }))
    .filter((month) => /^\d{4}-\d{2}$/.test(month.yearMonth));

  const months = savedMonths.length > 0
    ? savedMonths
    : historyMonths.map((month) => ({
      yearMonth: month.yearMonth,
      projectedUnits: Math.max(0, Math.round(month.quantitySold)),
      projectedSales: Math.max(0, Math.round(month.netSales * 100) / 100),
    }));

  const totalProjectedUnits = savedMonths.length > 0
    ? Math.max(0, Math.round(toNumber(row.salesProjectionUnits)))
    : months.reduce((sum, month) => sum + month.projectedUnits, 0);
  const totalProjectedSales = savedMonths.length > 0
    ? Math.max(0, Math.round(toNumber(row.salesProjectionSales) * 100) / 100)
    : Math.round(months.reduce((sum, month) => sum + month.projectedSales, 0) * 100) / 100;

  return {
    months,
    totalProjectedUnits,
    totalProjectedSales,
    updatedBy: row.salesProjectionUpdatedBy,
    updatedAt: toIso(row.salesProjectionUpdatedAt),
  };
}

export function aggregateAttributeMix(rows: Array<{
  dimensionCode: string;
  dimensionLabel: string;
  valueCode: string;
  valueLabel: string;
  unitsSold: number;
  netSales: number;
  profit: number;
  inventoryValue?: number | null;
  roiPct?: number | null;
  sellThroughPct?: number | null;
  skuCount?: number;
}>): AttributeMixDimension[] {
  const byDimension = new Map<string, {
    dimensionCode: string;
    dimensionLabel: string;
    rows: typeof rows;
  }>();
  for (const row of rows) {
    const key = row.dimensionCode;
    const group = byDimension.get(key) ?? {
      dimensionCode: row.dimensionCode,
      dimensionLabel: row.dimensionLabel,
      rows: [],
    };
    group.rows.push(row);
    byDimension.set(key, group);
  }

  return [...byDimension.values()]
    .map((group) => {
      const totalUnitsSold = group.rows.reduce((sum, row) => sum + Math.max(0, row.unitsSold), 0);
      const totalNetSales = group.rows.reduce((sum, row) => sum + Math.max(0, row.netSales), 0);
      const totalProfit = group.rows.reduce((sum, row) => sum + row.profit, 0);
      return {
        dimensionCode: group.dimensionCode,
        dimensionLabel: group.dimensionLabel,
        totalUnitsSold: Math.round(totalUnitsSold),
        totalNetSales: Math.round(totalNetSales * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        values: group.rows
          .map((row) => ({
            valueCode: row.valueCode,
            valueLabel: row.valueLabel,
            unitsSold: Math.round(row.unitsSold),
            netSales: Math.round(row.netSales * 100) / 100,
            profit: Math.round(row.profit * 100) / 100,
            salesPct: totalUnitsSold > 0 ? Math.round((row.unitsSold / totalUnitsSold) * 1000) / 10 : 0,
            roiPct: row.inventoryValue && row.inventoryValue > 0
              ? Math.round((row.profit / row.inventoryValue) * 1000) / 10
              : row.roiPct ?? null,
            sellThroughPct: row.sellThroughPct ?? null,
            skuCount: Math.round(row.skuCount ?? 0),
          }))
          .sort((left, right) => right.unitsSold - left.unitsSold || left.valueLabel.localeCompare(right.valueLabel)),
      };
    })
    .sort((left, right) => left.dimensionLabel.localeCompare(right.dimensionLabel));
}

function normalizeAttributeMix(raw: unknown): AttributeMixDimension[] {
  const parsed = Array.isArray(raw) ? raw : jsonArray<Record<string, unknown>>(raw);
  if (parsed.length === 0) return [];

  const grouped = parsed.filter((row): row is AttributeMixDimension => (
    !!row
    && typeof row === 'object'
    && Array.isArray((row as { values?: unknown }).values)
  ));
  if (grouped.length === parsed.length) {
    return grouped.map((dimension) => ({
      ...dimension,
      totalUnitsSold: toNumber(dimension.totalUnitsSold),
      totalNetSales: toNumber(dimension.totalNetSales),
      totalProfit: toNumber(dimension.totalProfit),
      values: Array.isArray(dimension.values) ? dimension.values : [],
    }));
  }

  return aggregateAttributeMix(parsed
    .filter((row) => !!row && typeof row === 'object')
    .map((row) => row as Record<string, unknown>)
    .filter((row) => cleanText(row.dimensionCode) && cleanText(row.valueCode))
    .map((row) => ({
      dimensionCode: cleanText(row.dimensionCode)!,
      dimensionLabel: cleanText(row.dimensionLabel) ?? cleanText(row.dimensionCode)!,
      valueCode: cleanText(row.valueCode)!,
      valueLabel: cleanText(row.valueLabel) ?? cleanText(row.valueCode)!,
      unitsSold: toNumber(row.unitsSold),
      netSales: toNumber(row.netSales),
      profit: toNumber(row.profit),
      inventoryValue: toNullableNumber(row.inventoryValue),
      roiPct: toNullableNumber(row.roiPct),
      sellThroughPct: toNullableNumber(row.sellThroughPct),
      skuCount: toNumber(row.skuCount),
    })));
}

function normalizeWorkbook(row: WorkbookRow): Omit<BuyerWorkbookListItem, 'cardCount' | 'completeCount'> {
  return {
    id: row.id,
    label: row.label,
    status: row.status,
    buyingSeason: row.buyingSeason,
    seasonYear: Number(row.seasonYear),
    seasonMonths: row.seasonMonths ?? [],
    seedStoreId: Number(row.seedStoreId),
    targetStoreIds: parseIntArray(row.targetStoreIds),
    buyer: row.buyer,
    createdBy: row.createdBy,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
    archivedAt: toIso(row.archivedAt),
  };
}

function normalizeWorkbookList(row: WorkbookRow): BuyerWorkbookListItem {
  return {
    ...normalizeWorkbook(row),
    cardCount: Math.round(toNumber(row.cardCount)),
    completeCount: Math.round(toNumber(row.completeCount)),
  };
}

function normalizeCard(row: CardRow): BuyerCategoryCard {
  const history = jsonObject<{ months?: HistoricalMonthMetric[]; summary?: HistoricalTargetSummary }>(row.historyJson);
  const historyMonths = Array.isArray(history.months) ? history.months : [];
  const attributeMix = normalizeAttributeMix(row.attributeMixJson);
  return {
    id: row.id,
    workbookId: row.workbookId,
    departmentNumber: row.departmentNumber == null ? null : Number(row.departmentNumber),
    departmentLabel: row.departmentLabel,
    categoryNumber: Number(row.categoryNumber),
    categoryLabel: row.categoryLabel,
    status: row.status,
    seedStoreId: Number(row.seedStoreId),
    targetStoreIds: parseIntArray(row.targetStoreIds),
    suggestedNewSkuCount: Number(row.suggestedNewSkuCount),
    suggestedCarryoverSkuCount: Number(row.suggestedCarryoverSkuCount),
    targetNewSkuCount: Number(row.targetNewSkuCount),
    targetCarryoverSkuCount: Number(row.targetCarryoverSkuCount),
    replacementStyleTargetCount: Number(row.replacementStyleTargetCount ?? 0),
    additionalNewStyleTargetCount: Number(row.additionalNewStyleTargetCount ?? 0),
    totalNewStyleTargetCount: Number(row.totalNewStyleTargetCount ?? 0),
    history: {
      months: historyMonths,
      summary: history.summary ?? summarizeHistoricalTargets([]),
    },
    salesProjection: normalizeSalesProjection(row, historyMonths),
    salesProjectionPlanId: row.salesProjectionPlanId,
    attributeMix,
    attributeReconciliation: [],
    notes: row.notes,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function normalizeStorePlan(row: StorePlanRow): StoreCategoryPlan {
  return {
    ...row,
    storeId: Number(row.storeId),
    copiedFromStoreId: row.copiedFromStoreId == null ? null : Number(row.copiedFromStoreId),
    targetNewSkuCount: Number(row.targetNewSkuCount),
    targetCarryoverSkuCount: Number(row.targetCarryoverSkuCount),
  };
}

function normalizeCarryover(row: CarryoverRow): CarryoverLine {
  return {
    id: row.id,
    workbookId: row.workbookId,
    cardId: row.cardId,
    storeId: row.storeId == null ? null : Number(row.storeId),
    skuId: row.skuId,
    skuCode: row.skuCode,
    skuDescription: row.skuDescription,
    color: row.color,
    sizeCells: jsonArray(row.sizeCells),
    totalQuantity: Number(row.totalQuantity),
    source: row.source,
    unavailable: Boolean(row.unavailable),
    unavailableReason: row.unavailableReason,
    replacementStyleId: row.replacementStyleId,
    carryoverCandidateId: row.carryoverCandidateId,
    notes: row.notes,
  };
}

function normalizeStyle(row: PlannedStyleRow): PlannedStyle {
  return {
    id: row.id,
    workbookId: row.workbookId,
    cardId: row.cardId,
    replacementForCarryoverLineId: row.replacementForCarryoverLineId,
    replacementForCarryoverCandidateId: row.replacementForCarryoverCandidateId,
    vendorCode: row.vendorCode,
    vendorName: row.vendorName,
    workingStyle: row.workingStyle,
    description: row.description,
    color: row.color,
    colorFamily: row.colorFamily,
    attributes: jsonObject(row.attributesJson),
    quotedUnitCost: toNullableNumber(row.quotedUnitCost),
    targetNewSkuCount: Number(row.targetNewSkuCount),
    targetUnits: Number(row.targetUnits),
    status: row.status,
    linkedSkuId: row.linkedSkuId,
    linkedSkuCode: row.linkedSkuCode,
    notes: row.notes,
  };
}

function normalizeCandidate(row: CarryoverCandidateRow): CarryoverCandidate {
  return {
    id: row.id,
    workbookId: row.workbookId,
    cardId: row.cardId,
    storeId: Number(row.storeId),
    categoryNumber: Number(row.categoryNumber),
    skuId: row.skuId,
    skuCode: row.skuCode,
    skuDescription: row.skuDescription,
    color: row.color,
    metrics: {
      unitsSold: 0,
      netSales: 0,
      profit: 0,
      grossProfitPct: null,
      inventoryValue: 0,
      roiPct: null,
      turns: null,
      currentOnHand: 0,
      currentOnOrder: 0,
      futureOnOrder: 0,
      sellThroughPct: null,
      ...jsonObject<Partial<CarryoverCandidateMetrics>>(row.metricsJson),
    },
    decision: row.decision,
    availability: row.availability,
    unavailableReason: row.unavailableReason,
    carryoverLineId: row.carryoverLineId,
    replacementStyleId: row.replacementStyleId,
    notes: row.notes,
    reviewedBy: row.reviewedBy,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function normalizeAttributePlan(row: AttributePlanDbRow): AttributePlanRow {
  return {
    id: row.id,
    workbookId: row.workbookId,
    cardId: row.cardId,
    dimensionCode: row.dimensionCode,
    dimensionLabel: row.dimensionLabel,
    valueCode: row.valueCode,
    valueLabel: row.valueLabel,
    plannedStyleCount: Number(row.plannedStyleCount),
    plannedUnits: Number(row.plannedUnits),
    notes: row.notes,
    updatedBy: row.updatedBy,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function normalizePoLink(row: PoLinkRow): PoLink {
  return {
    id: row.id,
    workbookId: row.workbookId,
    cardId: row.cardId,
    carryoverLineId: row.carryoverLineId,
    plannedStyleId: row.plannedStyleId,
    poId: row.poId,
    poNumber: row.poNumber,
    poLineId: row.poLineId,
    quantity: Number(row.quantity),
    notes: row.notes,
    linkedBy: row.linkedBy,
    linkedAt: toIso(row.linkedAt)!,
  };
}

function attributeActualKey(cardId: string, dimensionCode: string, valueCode: string): string {
  return `${cardId}::${dimensionCode}::${valueCode}`;
}

function buildAttributeReconciliation(
  plans: AttributePlanRow[],
  actualRows: AttributeActualSqlRow[],
): Map<string, AttributeReconciliationDimension[]> {
  const actualMap = new Map<string, {
    cardId: string;
    dimensionCode: string;
    dimensionLabel: string;
    valueCode: string;
    valueLabel: string;
    currentInventoryUnits: number;
    purchaseUnits: number;
  }>();

  for (const row of actualRows) {
    const key = attributeActualKey(row.cardId, row.dimensionCode, row.valueCode);
    const existing = actualMap.get(key);
    const currentInventoryUnits = toNumber(row.currentInventoryUnits);
    const purchaseUnits = toNumber(row.purchaseUnits);
    if (existing) {
      existing.currentInventoryUnits += currentInventoryUnits;
      existing.purchaseUnits += purchaseUnits;
    } else {
      actualMap.set(key, {
        cardId: row.cardId,
        dimensionCode: row.dimensionCode,
        dimensionLabel: row.dimensionLabel,
        valueCode: row.valueCode,
        valueLabel: row.valueLabel,
        currentInventoryUnits,
        purchaseUnits,
      });
    }
  }

  const planMap = new Map<string, AttributePlanRow>();
  for (const plan of plans) {
    planMap.set(attributeActualKey(plan.cardId, plan.dimensionCode, plan.valueCode), plan);
  }

  const keys = new Set([...planMap.keys(), ...actualMap.keys()]);
  const byCardDimension = new Map<string, AttributeReconciliationRow[]>();
  const dimensionMeta = new Map<string, { cardId: string; dimensionCode: string; dimensionLabel: string }>();

  for (const key of keys) {
    const plan = planMap.get(key);
    const actual = actualMap.get(key);
    const cardId = plan?.cardId ?? actual?.cardId;
    const dimensionCode = plan?.dimensionCode ?? actual?.dimensionCode;
    const valueCode = plan?.valueCode ?? actual?.valueCode;
    if (!cardId || !dimensionCode || !valueCode) continue;
    const dimensionLabel = plan?.dimensionLabel ?? actual?.dimensionLabel ?? dimensionCode;
    const valueLabel = plan?.valueLabel ?? actual?.valueLabel ?? valueCode;
    const row: AttributeReconciliationRow = {
      dimensionCode,
      dimensionLabel,
      valueCode,
      valueLabel,
      plannedStyleCount: plan?.plannedStyleCount ?? 0,
      plannedUnits: plan?.plannedUnits ?? 0,
      currentInventoryUnits: actual?.currentInventoryUnits ?? 0,
      purchaseUnits: actual?.purchaseUnits ?? 0,
      actualUnits: (actual?.currentInventoryUnits ?? 0) + (actual?.purchaseUnits ?? 0),
      plannedPct: 0,
      actualPct: 0,
      varianceUnits: 0,
      variancePct: 0,
      status: 'complete',
    };
    const dimensionKey = `${cardId}::${dimensionCode}`;
    if (!byCardDimension.has(dimensionKey)) byCardDimension.set(dimensionKey, []);
    byCardDimension.get(dimensionKey)!.push(row);
    dimensionMeta.set(dimensionKey, { cardId, dimensionCode, dimensionLabel });
  }

  const byCard = new Map<string, AttributeReconciliationDimension[]>();
  for (const [dimensionKey, rows] of byCardDimension.entries()) {
    const meta = dimensionMeta.get(dimensionKey);
    if (!meta) continue;
    const plannedUnits = rows.reduce((sum, row) => sum + row.plannedUnits, 0);
    const currentInventoryUnits = rows.reduce((sum, row) => sum + row.currentInventoryUnits, 0);
    const purchaseUnits = rows.reduce((sum, row) => sum + row.purchaseUnits, 0);
    const actualUnits = rows.reduce((sum, row) => sum + row.actualUnits, 0);
    let maxVariancePct = 0;
    let maxVarianceUnits = 0;
    let alertCount = 0;

    const values = rows
      .map((row) => {
        const plannedPct = plannedUnits > 0 ? (row.plannedUnits / plannedUnits) * 100 : 0;
        const actualPct = actualUnits > 0 ? (row.actualUnits / actualUnits) * 100 : 0;
        const varianceUnits = row.actualUnits - row.plannedUnits;
        const variancePct = actualPct - plannedPct;
        const isAlert = Math.abs(variancePct) > ATTRIBUTE_VARIANCE_PCT_THRESHOLD
          || Math.abs(varianceUnits) > ATTRIBUTE_VARIANCE_UNITS_THRESHOLD;
        maxVariancePct = Math.max(maxVariancePct, Math.abs(variancePct));
        maxVarianceUnits = Math.max(maxVarianceUnits, Math.abs(varianceUnits));
        if (isAlert) alertCount += 1;
        return {
          ...row,
          plannedPct: roundOne(plannedPct),
          actualPct: roundOne(actualPct),
          varianceUnits: Math.round(varianceUnits),
          variancePct: roundOne(variancePct),
          status: isAlert ? 'alert' as BuyerChecklistStepStatus : 'complete' as BuyerChecklistStepStatus,
        };
      })
      .sort((left, right) => Math.abs(right.variancePct) - Math.abs(left.variancePct)
        || Math.abs(right.varianceUnits) - Math.abs(left.varianceUnits)
        || left.valueLabel.localeCompare(right.valueLabel));

    const dimension: AttributeReconciliationDimension = {
      dimensionCode: meta.dimensionCode,
      dimensionLabel: meta.dimensionLabel,
      plannedUnits: Math.round(plannedUnits),
      currentInventoryUnits: Math.round(currentInventoryUnits),
      purchaseUnits: Math.round(purchaseUnits),
      actualUnits: Math.round(actualUnits),
      maxVariancePct: roundOne(maxVariancePct),
      maxVarianceUnits: Math.round(maxVarianceUnits),
      alertCount,
      values,
    };
    if (!byCard.has(meta.cardId)) byCard.set(meta.cardId, []);
    byCard.get(meta.cardId)!.push(dimension);
  }

  for (const dimensions of byCard.values()) {
    dimensions.sort((left, right) => right.alertCount - left.alertCount || left.dimensionLabel.localeCompare(right.dimensionLabel));
  }

  return byCard;
}

function attributeSummaryFromReconciliation(dimensions: AttributeReconciliationDimension[]): BuyerChecklistAttributePlanStep {
  const plannedUnits = dimensions.reduce((sum, dimension) => sum + dimension.plannedUnits, 0);
  const currentInventoryUnits = dimensions.reduce((sum, dimension) => sum + dimension.currentInventoryUnits, 0);
  const purchaseUnits = dimensions.reduce((sum, dimension) => sum + dimension.purchaseUnits, 0);
  const actualUnits = dimensions.reduce((sum, dimension) => sum + dimension.actualUnits, 0);
  const maxVariancePct = dimensions.reduce((max, dimension) => Math.max(max, dimension.maxVariancePct), 0);
  const maxVarianceUnits = dimensions.reduce((max, dimension) => Math.max(max, dimension.maxVarianceUnits), 0);
  const alertCount = dimensions.reduce((sum, dimension) => sum + dimension.alertCount, 0);
  return {
    status: dimensions.length === 0 ? 'missing' : alertCount > 0 ? 'alert' : 'complete',
    plannedUnits,
    currentInventoryUnits,
    purchaseUnits,
    actualUnits,
    maxVariancePct,
    maxVarianceUnits,
    alertCount,
    updatedAt: null,
  };
}

async function audit(db: DbClient, workbookId: string, action: string, actor: string, before: unknown, after: unknown): Promise<void> {
  await db.$executeRawUnsafe(
    `
      INSERT INTO app.buyer_purchase_workbook_audit
        (workbook_id, action, actor, before_json, after_json)
      VALUES ($1::uuid, $2, $3, $4::jsonb, $5::jsonb)
    `,
    workbookId,
    action,
    actor,
    JSON.stringify(before ?? null),
    JSON.stringify(after ?? null),
  );
}

async function ensureStoreIds(storeIds: number[], db: DbClient = prisma): Promise<void> {
  if (storeIds.length === 0) return;
  const rows = await db.$queryRawUnsafe<Array<{ count: unknown }>>(
    `
      SELECT COUNT(*)::int AS count
      FROM app.store_master
      WHERE number = ANY($1::int[])
    `,
    storeIds,
  );
  if (Number(rows[0]?.count ?? 0) !== new Set(storeIds).size) {
    throw new BuyerWorkbookServiceError(400, 'INVALID_STORE', 'One or more selected stores do not exist.');
  }
}

async function resolveCategories(input: {
  categoryNumbers?: number[];
  departmentNumbers?: number[];
}, db: DbClient = prisma): Promise<CategoryRow[]> {
  const categoryNumbers = uniqueSorted(input.categoryNumbers ?? []);
  const departmentNumbers = uniqueSorted(input.departmentNumbers ?? []);
  if (categoryNumbers.length === 0 && departmentNumbers.length === 0) {
    throw new BuyerWorkbookServiceError(400, 'CATEGORY_REQUIRED', 'Select at least one category or department.');
  }

  const rows = await db.$queryRawUnsafe<CategoryRow[]>(
    `
      SELECT
        c.number AS "categoryNumber",
        c.number::text || ' - ' || c."desc" AS "categoryLabel",
        d.number AS "departmentNumber",
        CASE
          WHEN d.number IS NULL THEN 'Unmapped'
          ELSE d.number::text || ' - ' || d."desc"
        END AS "departmentLabel"
      FROM app.taxonomy_category c
      LEFT JOIN app.taxonomy_department d
        ON c.number BETWEEN d.beg_categ AND d.end_categ
      WHERE
        ($1::int[] = '{}'::int[] OR c.number = ANY($1::int[]))
        AND ($2::int[] = '{}'::int[] OR d.number = ANY($2::int[]))
      ORDER BY COALESCE(d.number, 9999), c.number
    `,
    categoryNumbers,
    departmentNumbers,
  );

  if (rows.length === 0) {
    throw new BuyerWorkbookServiceError(404, 'CATEGORY_NOT_FOUND', 'No matching categories were found.');
  }
  return rows;
}

async function ensureCategoryNumbers(categoryNumbers: number[], db: DbClient = prisma): Promise<void> {
  const uniqueCategoryNumbers = uniqueSorted(categoryNumbers);
  if (uniqueCategoryNumbers.length === 0) {
    throw new BuyerWorkbookServiceError(400, 'CATEGORY_REQUIRED', 'Select at least one category.');
  }
  const rows = await resolveCategories({ categoryNumbers: uniqueCategoryNumbers }, db);
  if (rows.length !== uniqueCategoryNumbers.length) {
    throw new BuyerWorkbookServiceError(404, 'CATEGORY_NOT_FOUND', 'One or more selected categories were not found.');
  }
}

async function resolveTargetStoreIds(input: {
  explicitStoreIds?: number[];
  categoryNumbers: number[];
  seedStoreId: number;
}, db: DbClient = prisma): Promise<number[]> {
  const explicit = uniqueSorted(input.explicitStoreIds ?? []);
  if (explicit.length > 0) return uniqueSorted([input.seedStoreId, ...explicit]);

  const carryingRows = await db.$queryRawUnsafe<Array<{ storeId: unknown }>>(
    `
      SELECT DISTINCT store_id AS "storeId"
      FROM app.store_category_carrying
      WHERE carries = true
        AND category_number = ANY($1::int[])
      ORDER BY store_id
    `,
    input.categoryNumbers,
  );
  const carrying = carryingRows.map((row) => Number(row.storeId)).filter((storeId) => Number.isInteger(storeId));
  if (carrying.length > 0) return uniqueSorted([input.seedStoreId, ...carrying]);

  return [input.seedStoreId];
}

export async function listBuyerChecklistCategories(input: {
  buyer?: string | null;
  buyingSeason?: BuyerWorkbookSeason;
  seasonYear?: number;
  includeNoBudget?: boolean;
} = {}): Promise<BuyerChecklistCategoryRow[]> {
  const buyer = cleanText(input.buyer);
  const buyingSeason = input.buyingSeason ?? 'FALL_WINTER';
  const seasonYear = input.seasonYear ?? new Date().getFullYear();
  const includeNoBudget = input.includeNoBudget === true;
  const seasonSeries = buyerSeasonSeries(buyingSeason, seasonYear);
  const reportMonth = await latestInventorySnapshotYearMonth();
  const fromYearMonth = shiftYearMonth(reportMonth, -11);

  const categoryRows = await prisma.$queryRawUnsafe<BuyerChecklistCategorySqlRow[]>(
    `
WITH category_assignment AS (
  SELECT
    cba.category_number,
    av.code AS buyer_code,
    av.label_es AS buyer_label,
    av.sort_order AS buyer_sort_order
  FROM app.category_buyer_assignment cba
  JOIN app.attribute_value av ON av.id = cba.buyer_value_id
  JOIN app.attribute_dimension ad
    ON ad.id = av.dimension_id
   AND ad.code = 'buyer'
  WHERE COALESCE(BTRIM(av.code), '') <> ''
    AND (
      $1::text IS NULL
      OR UPPER(BTRIM(av.code)) = UPPER(BTRIM($1::text))
    )
)
SELECT
  STRING_AGG(ca.buyer_code, ', ' ORDER BY ca.buyer_sort_order NULLS LAST, ca.buyer_code) AS "buyerCode",
  STRING_AGG(COALESCE(NULLIF(ca.buyer_label, ''), ca.buyer_code), ', ' ORDER BY ca.buyer_sort_order NULLS LAST, ca.buyer_code) AS "buyerLabel",
  c.number AS "categoryNumber",
  c.number::text || ' - ' || c."desc" AS "categoryLabel",
  d.number AS "departmentNumber",
  CASE WHEN d.number IS NULL THEN 'Unmapped' ELSE d.number::text || ' - ' || d."desc" END AS "departmentLabel"
FROM app.taxonomy_category c
JOIN category_assignment ca ON ca.category_number = c.number
LEFT JOIN app.taxonomy_department d ON c.number BETWEEN d.beg_categ AND d.end_categ
GROUP BY c.number, c."desc", d.number, d."desc"
ORDER BY COALESCE(d.number, 9999), c.number
LIMIT 1000
    `,
    buyer,
  );

  const baseCategoryNumbers = categoryRows.map((row) => Number(row.categoryNumber));
  const planRows = baseCategoryNumbers.length === 0 ? [] : await prisma.$queryRawUnsafe<BuyerChecklistPlanSqlRow[]>(
    `
      SELECT DISTINCT ON (c.category_number, w.buying_season, w.season_year)
        c.category_number AS "categoryNumber",
        w.buying_season AS "buyingSeason",
        w.season_year AS "seasonYear",
        w.id::text AS "workbookId",
        c.id::text AS "cardId",
        c.status,
        c.updated_at AS "updatedAt",
        c.sales_projection_plan_id::text AS "salesProjectionPlanId",
        c.sales_projection_units AS "salesProjectionUnits",
        c.sales_projection_updated_at AS "salesProjectionUpdatedAt",
        c.target_carryover_sku_count AS "targetCarryoverSkuCount",
        (
          SELECT COUNT(DISTINCT l.id)::int
          FROM app.buyer_purchase_carryover_line l
          WHERE l.card_id = c.id
            AND l.unavailable = false
        ) AS "plannedCarryoverCount",
        (
          SELECT COUNT(DISTINCT p.carryover_line_id)::int
          FROM app.buyer_purchase_po_link p
          WHERE p.card_id = c.id
            AND p.carryover_line_id IS NOT NULL
        ) AS "boughtCarryoverCount"
      FROM app.buyer_purchase_category_card c
      JOIN app.buyer_purchase_workbook w ON w.id = c.workbook_id
      WHERE c.category_number = ANY($1::int[])
        AND w.status <> 'ARCHIVED'
        AND w.buying_season = ANY($2::text[])
        AND w.season_year = ANY($3::int[])
      ORDER BY c.category_number, w.buying_season, w.season_year, c.updated_at DESC
    `,
    baseCategoryNumbers,
    seasonSeries.map((season) => season.buyingSeason),
    seasonSeries.map((season) => season.seasonYear),
  );

  const noBudgetRows = baseCategoryNumbers.length === 0 ? [] : await prisma.$queryRawUnsafe<Array<{
    id: string;
    categoryNumber: number;
    buyingSeason: BuyerWorkbookSeason;
    seasonYear: number;
    buyerCode: string | null;
    note: string | null;
    markedBy: string | null;
    markedAt: Date | string;
    updatedAt: Date | string;
  }>>(
    `
      SELECT
        id::text,
        category_number AS "categoryNumber",
        buying_season AS "buyingSeason",
        season_year AS "seasonYear",
        buyer_code AS "buyerCode",
        note,
        marked_by AS "markedBy",
        marked_at AS "markedAt",
        updated_at AS "updatedAt"
      FROM app.buyer_purchase_no_budget_category
      WHERE status = 'ACTIVE'
        AND category_number = ANY($1::int[])
        AND buying_season = ANY($2::text[])
        AND season_year = ANY($3::int[])
    `,
    baseCategoryNumbers,
    seasonSeries.map((season) => season.buyingSeason),
    seasonSeries.map((season) => season.seasonYear),
  );

  const planMap = new Map<string, BuyerChecklistSeasonPlan>();
  const planDetailByCardId = new Map<string, BuyerChecklistPlanSqlRow>();
  for (const row of planRows) {
    planDetailByCardId.set(row.cardId, row);
    planMap.set(`${row.categoryNumber}:${row.buyingSeason}:${row.seasonYear}`, {
      buyingSeason: row.buyingSeason,
      seasonYear: Number(row.seasonYear),
      workbookId: row.workbookId,
      cardId: row.cardId,
      status: row.status,
      updatedAt: toIso(row.updatedAt),
      noBudgetId: null,
      noBudgetNote: null,
      noBudgetMarkedBy: null,
      noBudgetMarkedAt: null,
    });
  }
  const noBudgetMap = new Map(noBudgetRows.map((row) => [
    `${row.categoryNumber}:${row.buyingSeason}:${row.seasonYear}`,
    row,
  ]));
  const currentSeason = seasonSeries[0];
  const visibleCategoryRows = includeNoBudget ? categoryRows : categoryRows.filter((row) => {
    const key = `${row.categoryNumber}:${currentSeason.buyingSeason}:${currentSeason.seasonYear}`;
    const currentPlan = mergeNoBudgetPlan(
      planMap.get(key) ?? emptySeasonPlan(currentSeason.buyingSeason, currentSeason.seasonYear),
      noBudgetMap.get(key),
    );
    return currentPlan.status !== 'NO_BUDGET';
  });

  const categoryNumbers = visibleCategoryRows.map((row) => Number(row.categoryNumber));
  const [salesRows, inventoryRows] = await Promise.all([
    loadBuyerChecklistCategorySales({
      categoryNumbers,
      fromYearMonth,
      toYearMonth: reportMonth,
    }),
    loadBuyerChecklistCategoryInventory({
      categoryNumbers,
    }),
  ]);

  const salesMap = new Map(salesRows.map((row) => [
    Number(row.categoryNumber),
    {
      sales: toNumber(row.last12MonthsSales),
      units: toNumber(row.last12MonthsUnits),
    },
  ]));
  const inventoryMap = new Map(inventoryRows.map((row) => [
    Number(row.categoryNumber),
    {
      units: toNumber(row.currentInventoryUnits),
      value: toNumber(row.currentInventoryValue),
    },
  ]));
  const currentCardIds = visibleCategoryRows
    .map((row) => {
      const currentPlan = planMap.get(`${row.categoryNumber}:${currentSeason.buyingSeason}:${currentSeason.seasonYear}`);
      return currentPlan?.cardId ?? null;
    })
    .filter((cardId): cardId is string => Boolean(cardId));
  const [currentAttributePlans, currentAttributeActualRows] = await Promise.all([
    loadAttributePlansForCards(currentCardIds),
    loadAttributeActualRowsForCards(currentCardIds),
  ]);
  const attributeReconciliationByCard = buildAttributeReconciliation(currentAttributePlans, currentAttributeActualRows);
  const attributePlanUpdatedAtByCard = new Map<string, string | null>();
  for (const plan of currentAttributePlans) {
    const previous = attributePlanUpdatedAtByCard.get(plan.cardId);
    if (!previous || plan.updatedAt > previous) attributePlanUpdatedAtByCard.set(plan.cardId, plan.updatedAt);
  }
  const attributeSummaryByCard = new Map<string, BuyerChecklistAttributePlanStep>();
  for (const cardId of currentCardIds) {
    const summary = attributeSummaryFromReconciliation(attributeReconciliationByCard.get(cardId) ?? []);
    summary.updatedAt = attributePlanUpdatedAtByCard.get(cardId) ?? null;
    attributeSummaryByCard.set(cardId, summary);
  }

  const rows: BuyerChecklistCategoryRow[] = visibleCategoryRows.map((row) => {
    const plans = Object.fromEntries(seasonSeries.map((season) => [
      season.key,
      mergeNoBudgetPlan(
        planMap.get(`${row.categoryNumber}:${season.buyingSeason}:${season.seasonYear}`)
          ?? emptySeasonPlan(season.buyingSeason, season.seasonYear),
        noBudgetMap.get(`${row.categoryNumber}:${season.buyingSeason}:${season.seasonYear}`),
      ),
    ])) as Pick<BuyerChecklistCategoryRow, 'currentSeason' | 'nextSeason' | 'followingSeason'>;
    const currentInventoryUnits = Math.round(inventoryMap.get(Number(row.categoryNumber))?.units ?? 0);
    const currentDepartmentOtbUnits: number | null = null;
    plans.currentSeason = {
      ...plans.currentSeason,
      steps: buildChecklistWorkflowSteps({
        plan: plans.currentSeason,
        detail: plans.currentSeason.cardId ? planDetailByCardId.get(plans.currentSeason.cardId) : undefined,
        attributePlan: plans.currentSeason.cardId ? attributeSummaryByCard.get(plans.currentSeason.cardId) : undefined,
        currentInventoryUnits,
        departmentOtbUnits: currentDepartmentOtbUnits,
      }),
    };
    const action: BuyerChecklistCategoryRow['action'] = plans.currentSeason.status === 'NO_BUDGET'
      ? 'NO_BUDGET'
      : plans.currentSeason.cardId
        ? 'CONTINUE'
        : 'START_REVIEW';
    return {
      buyerCode: row.buyerCode,
      buyerLabel: row.buyerLabel,
      categoryNumber: Number(row.categoryNumber),
      categoryLabel: row.categoryLabel,
      departmentNumber: row.departmentNumber == null ? null : Number(row.departmentNumber),
      departmentLabel: row.departmentLabel ?? 'Unmapped',
      last12MonthsSales: Math.round((salesMap.get(Number(row.categoryNumber))?.sales ?? 0) * 100) / 100,
      last12MonthsUnits: Math.round(salesMap.get(Number(row.categoryNumber))?.units ?? 0),
      currentInventoryUnits,
      currentInventoryValue: Math.round((inventoryMap.get(Number(row.categoryNumber))?.value ?? 0) * 100) / 100,
      departmentOtbUnits: currentDepartmentOtbUnits,
      ...plans,
      action,
    };
  });
  return rows;
}

export async function markBuyerChecklistCategoryNoBudget(input: {
  categoryNumber: number;
  buyingSeason: BuyerWorkbookSeason;
  seasonYear: number;
  buyer?: string | null;
  note?: string | null;
  actor?: string | null;
}): Promise<BuyerNoBudgetCategoryResult> {
  const results = await markBuyerChecklistCategoriesNoBudget({
    categoryNumbers: [input.categoryNumber],
    buyingSeason: input.buyingSeason,
    seasonYear: input.seasonYear,
    buyer: input.buyer,
    note: input.note,
    actor: input.actor,
  });
  return results[0];
}

export async function markBuyerChecklistCategoriesNoBudget(input: {
  categoryNumbers: number[];
  buyingSeason: BuyerWorkbookSeason;
  seasonYear: number;
  buyer?: string | null;
  note?: string | null;
  actor?: string | null;
}): Promise<BuyerNoBudgetCategoryResult[]> {
  const categoryNumbers = uniqueSorted(input.categoryNumbers.map((value) => Math.trunc(Number(value))));
  const seasonYear = Math.trunc(Number(input.seasonYear));
  const actor = cleanText(input.actor) ?? 'system';
  const note = cleanText(input.note) ?? null;
  if (categoryNumbers.some((categoryNumber) => !Number.isInteger(categoryNumber) || categoryNumber <= 0)) {
    throw new BuyerWorkbookServiceError(400, 'INVALID_CATEGORY', 'categoryNumbers must be positive integers.');
  }
  if (!Number.isInteger(seasonYear) || seasonYear < 2020 || seasonYear > 2100) {
    throw new BuyerWorkbookServiceError(400, 'INVALID_SEASON_YEAR', 'seasonYear must be between 2020 and 2100.');
  }
  await ensureCategoryNumbers(categoryNumbers);
  const buyerCode = cleanText(input.buyer);
  let results: BuyerNoBudgetCategoryResult[] = [];

  await prisma.$transaction(async (tx) => {
    const upserted = await tx.$queryRawUnsafe<Array<{ id: string; categoryNumber: number }>>(
      `
        INSERT INTO app.buyer_purchase_no_budget_category
          (category_number, buying_season, season_year, buyer_code, note, marked_by)
        SELECT
          DISTINCT category_number::int,
          $2::text,
          $3::int,
          $4::text,
          $5::text,
          $6::text
        FROM unnest($1::int[]) AS input(category_number)
        ON CONFLICT (category_number, buying_season, season_year)
          WHERE status = 'ACTIVE'
        DO UPDATE SET
          buyer_code = COALESCE(EXCLUDED.buyer_code, app.buyer_purchase_no_budget_category.buyer_code),
          note = CASE WHEN $7::boolean THEN EXCLUDED.note ELSE app.buyer_purchase_no_budget_category.note END,
          marked_by = EXCLUDED.marked_by,
          marked_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id::text, category_number AS "categoryNumber"
      `,
      categoryNumbers,
      input.buyingSeason,
      seasonYear,
      buyerCode,
      note,
      actor,
      input.note !== undefined,
    );
    results = upserted.map((row) => ({
      categoryNumber: Number(row.categoryNumber),
      buyingSeason: input.buyingSeason,
      seasonYear,
      status: 'NO_BUDGET',
      noBudgetId: row.id,
    }));

    const beforeCards = await tx.$queryRawUnsafe<Array<{
      workbookId: string;
      cardId: string;
      categoryNumber: number;
      status: BuyerCategoryStatus;
    }>>(
      `
        SELECT
          w.id::text AS "workbookId",
          c.id::text AS "cardId",
          c.category_number AS "categoryNumber",
          c.status
        FROM app.buyer_purchase_category_card c
        JOIN app.buyer_purchase_workbook w ON w.id = c.workbook_id
        WHERE c.category_number = ANY($1::int[])
          AND w.buying_season = $2::text
          AND w.season_year = $3::int
          AND w.status <> 'ARCHIVED'
      `,
      categoryNumbers,
      input.buyingSeason,
      seasonYear,
    );

    if (beforeCards.length > 0) {
      await tx.$executeRawUnsafe(
        `
          UPDATE app.buyer_purchase_category_card c
          SET
            status = 'NO_BUDGET',
            notes = CASE WHEN $4::text IS NULL THEN notes ELSE $4::text END,
            updated_at = CURRENT_TIMESTAMP
          FROM app.buyer_purchase_workbook w
          WHERE c.workbook_id = w.id
            AND c.category_number = ANY($1::int[])
            AND w.buying_season = $2::text
            AND w.season_year = $3::int
            AND w.status <> 'ARCHIVED'
        `,
        categoryNumbers,
        input.buyingSeason,
        seasonYear,
        note,
      );
      const workbookIds = [...new Set(beforeCards.map((row) => row.workbookId))];
      await tx.$executeRawUnsafe(
        `
          UPDATE app.buyer_purchase_workbook
          SET updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY($1::uuid[])
        `,
        workbookIds,
      );
      for (const workbookId of workbookIds) {
        await audit(
          tx,
          workbookId,
          'category_no_budget',
          actor,
          beforeCards.filter((row) => row.workbookId === workbookId),
          { categoryNumbers, buyingSeason: input.buyingSeason, seasonYear, note },
        );
      }
    }
  });
  return results;
}

export async function reopenBuyerChecklistCategoryBudget(input: {
  categoryNumber: number;
  buyingSeason: BuyerWorkbookSeason;
  seasonYear: number;
  buyer?: string | null;
  actor?: string | null;
}): Promise<BuyerNoBudgetCategoryResult> {
  const results = await reopenBuyerChecklistCategoriesBudget({
    categoryNumbers: [input.categoryNumber],
    buyingSeason: input.buyingSeason,
    seasonYear: input.seasonYear,
    buyer: input.buyer,
    actor: input.actor,
  });
  return results[0];
}

export async function reopenBuyerChecklistCategoriesBudget(input: {
  categoryNumbers: number[];
  buyingSeason: BuyerWorkbookSeason;
  seasonYear: number;
  buyer?: string | null;
  actor?: string | null;
}): Promise<BuyerNoBudgetCategoryResult[]> {
  const categoryNumbers = uniqueSorted(input.categoryNumbers.map((value) => Math.trunc(Number(value))));
  const seasonYear = Math.trunc(Number(input.seasonYear));
  const actor = cleanText(input.actor) ?? 'system';
  if (categoryNumbers.some((categoryNumber) => !Number.isInteger(categoryNumber) || categoryNumber <= 0)) {
    throw new BuyerWorkbookServiceError(400, 'INVALID_CATEGORY', 'categoryNumbers must be positive integers.');
  }
  if (!Number.isInteger(seasonYear) || seasonYear < 2020 || seasonYear > 2100) {
    throw new BuyerWorkbookServiceError(400, 'INVALID_SEASON_YEAR', 'seasonYear must be between 2020 and 2100.');
  }
  await ensureCategoryNumbers(categoryNumbers);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_no_budget_category
        SET
          status = 'REOPENED',
          reopened_by = $4::text,
          reopened_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE status = 'ACTIVE'
          AND category_number = ANY($1::int[])
          AND buying_season = $2::text
          AND season_year = $3::int
      `,
      categoryNumbers,
      input.buyingSeason,
      seasonYear,
      actor,
    );

    const beforeCards = await tx.$queryRawUnsafe<Array<{
      workbookId: string;
      cardId: string;
      status: BuyerCategoryStatus;
      categoryNumber: number;
    }>>(
      `
        SELECT
          w.id::text AS "workbookId",
          c.id::text AS "cardId",
          c.status,
          c.category_number AS "categoryNumber"
        FROM app.buyer_purchase_category_card c
        JOIN app.buyer_purchase_workbook w ON w.id = c.workbook_id
        WHERE c.category_number = ANY($1::int[])
          AND w.buying_season = $2::text
          AND w.season_year = $3::int
          AND w.status <> 'ARCHIVED'
          AND c.status = 'NO_BUDGET'
      `,
      categoryNumbers,
      input.buyingSeason,
      seasonYear,
    );

    if (beforeCards.length > 0) {
      await tx.$executeRawUnsafe(
        `
          UPDATE app.buyer_purchase_category_card c
          SET
            status = 'NOT_STARTED',
            updated_at = CURRENT_TIMESTAMP
          FROM app.buyer_purchase_workbook w
          WHERE c.workbook_id = w.id
            AND c.category_number = ANY($1::int[])
            AND w.buying_season = $2::text
            AND w.season_year = $3::int
            AND w.status <> 'ARCHIVED'
            AND c.status = 'NO_BUDGET'
        `,
        categoryNumbers,
        input.buyingSeason,
        seasonYear,
      );
      const workbookIds = [...new Set(beforeCards.map((row) => row.workbookId))];
      await tx.$executeRawUnsafe(
        `
          UPDATE app.buyer_purchase_workbook
          SET updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY($1::uuid[])
        `,
        workbookIds,
      );
      for (const workbookId of workbookIds) {
        await audit(
          tx,
          workbookId,
          'category_reopen_budget',
          actor,
          beforeCards.filter((row) => row.workbookId === workbookId),
          { categoryNumbers, buyingSeason: input.buyingSeason, seasonYear, status: 'NOT_STARTED' },
        );
      }
    }
  });

  return categoryNumbers.map((categoryNumber) => ({
    categoryNumber,
    buyingSeason: input.buyingSeason,
    seasonYear,
    status: 'REOPENED',
    noBudgetId: null,
  }));
}

async function loadHistoricalMetrics(input: {
  seedStoreId: number;
  categoryNumber: number;
  seasonMonths: string[];
}, db: DbClient = prisma): Promise<{ months: HistoricalMonthMetric[]; summary: HistoricalTargetSummary }> {
  const toYearMonth = await latestYearMonth(db);
  const fromYearMonth = shiftYearMonth(toYearMonth, -11);
  const rows = await db.$queryRawUnsafe<HistorySqlRow[]>(
    `
WITH chain_first AS (
  SELECT
    UPPER(BTRIM(s.sku_code)) AS sku_code,
    MIN(s.date_first_received) AS first_received
  FROM app.inventory_history_snapshot s
  JOIN app.sku k ON k.id = s.sku_id
  WHERE s.store_id = $1::int
    AND k.category_number = $2::int
    AND s.date_first_received IS NOT NULL
  GROUP BY 1
),
src AS (
  SELECT
    m.year_month,
    UPPER(BTRIM(h.sku_code)) AS sku_code,
    cf.first_received,
    COALESCE(m.qty_sales, 0)::float8 AS qty_sales,
    COALESCE(m.net_sales, 0)::float8 AS net_sales,
    COALESCE(m.profit, 0)::float8 AS profit,
    COALESCE(m.qty_on_hand, 0)::float8 AS qty_on_hand,
    COALESCE(m.inventory_value, 0)::float8 AS inventory_value
  FROM app.inventory_history_snapshot h
  JOIN app.inventory_history_month m ON m.snapshot_id = h.id
  JOIN app.sku k ON k.id = h.sku_id
  LEFT JOIN chain_first cf ON cf.sku_code = UPPER(BTRIM(h.sku_code))
  WHERE h.store_id = $1::int
    AND k.category_number = $2::int
    AND m.year_month >= $3::text
    AND m.year_month <= $4::text
)
SELECT
  year_month AS "yearMonth",
  SUM(qty_sales)::float8 AS "quantitySold",
  SUM(net_sales)::float8 AS "netSales",
  SUM(profit)::float8 AS "profit",
  SUM(qty_on_hand)::float8 AS "beginningOnHand",
  SUM(inventory_value)::float8 AS "inventoryValue",
  COUNT(DISTINCT CASE
    WHEN qty_on_hand > 0
     AND first_received IS NOT NULL
     AND (
       (substring(year_month from 1 for 4)::int - EXTRACT(YEAR FROM first_received)::int) * 12
       + (substring(year_month from 6 for 2)::int - EXTRACT(MONTH FROM first_received)::int)
     ) BETWEEN 0 AND 3
    THEN sku_code END)::int AS "newSkuDistinctCount",
  COUNT(DISTINCT CASE
    WHEN qty_on_hand > 0
     AND (
       first_received IS NULL
       OR (
         (substring(year_month from 1 for 4)::int - EXTRACT(YEAR FROM first_received)::int) * 12
         + (substring(year_month from 6 for 2)::int - EXTRACT(MONTH FROM first_received)::int)
       ) NOT BETWEEN 0 AND 3
     )
    THEN sku_code END)::int AS "carryoverSkuDistinctCount",
  SUM(CASE
    WHEN first_received IS NOT NULL
     AND (
       (substring(year_month from 1 for 4)::int - EXTRACT(YEAR FROM first_received)::int) * 12
       + (substring(year_month from 6 for 2)::int - EXTRACT(MONTH FROM first_received)::int)
     ) BETWEEN 0 AND 3
    THEN qty_sales ELSE 0 END)::float8 AS "newSkuUnitsSold",
  SUM(CASE
    WHEN first_received IS NULL
      OR (
        (substring(year_month from 1 for 4)::int - EXTRACT(YEAR FROM first_received)::int) * 12
        + (substring(year_month from 6 for 2)::int - EXTRACT(MONTH FROM first_received)::int)
      ) NOT BETWEEN 0 AND 3
    THEN qty_sales ELSE 0 END)::float8 AS "carryoverSkuUnitsSold"
FROM src
GROUP BY year_month
ORDER BY year_month
    `,
    input.seedStoreId,
    input.categoryNumber,
    fromYearMonth,
    toYearMonth,
  );

  const months: HistoricalMonthMetric[] = rows.map((row) => {
    const quantitySold = toNumber(row.quantitySold);
    const netSales = toNumber(row.netSales);
    const profit = toNumber(row.profit);
    const inventoryValue = toNumber(row.inventoryValue);
    const cogs = Math.max(0, netSales - profit);
    return {
      yearMonth: row.yearMonth,
      quantitySold: Math.round(quantitySold),
      netSales,
      profit,
      beginningOnHand: Math.round(toNumber(row.beginningOnHand)),
      inventoryValue,
      roiPct: inventoryValue > 0 ? Math.round((profit / inventoryValue) * 1000) / 10 : null,
      turns: inventoryValue > 0 ? Math.round((cogs / inventoryValue) * 100) / 100 : null,
      newSkuDistinctCount: Math.round(toNumber(row.newSkuDistinctCount)),
      carryoverSkuDistinctCount: Math.round(toNumber(row.carryoverSkuDistinctCount)),
      newSkuUnitsSold: Math.round(toNumber(row.newSkuUnitsSold)),
      carryoverSkuUnitsSold: Math.round(toNumber(row.carryoverSkuUnitsSold)),
      sellThroughPct: calculateSellThroughPct({
        unitsSold: quantitySold,
        beginningInventory: toNumber(row.beginningOnHand),
        inboundUnits: null,
      }),
    };
  });

  return { months, summary: summarizeHistoricalTargets(months) };
}

async function loadAttributeMix(input: {
  seedStoreId: number;
  categoryNumber: number;
  fromYearMonth: string;
  toYearMonth: string;
}, db: DbClient = prisma): Promise<AttributeMixDimension[]> {
  const rows = await db.$queryRawUnsafe<AttributeMixSqlRow[]>(
    `
WITH category_family AS (
  SELECT family_code
  FROM app.category_product_family
  WHERE category_number = $2::int
),
relevant_dimensions AS (
  SELECT d.id, d.code, d.label_es
  FROM app.attribute_dimension d
  WHERE COALESCE(BTRIM(LOWER(d.code)), '') NOT IN (
      'cadena', 'chain', 'store_chain', 'store_group',
      'buyer', 'comprador',
      'macro_dept', 'department', 'dept', 'company', 'empresa',
      'gender', 'genero', 'discount_type', 'tipo_de_descuento',
      'marca', 'brand'
    )
    AND COALESCE(BTRIM(LOWER(d.label_es)), '') NOT IN (
      'cadena', 'buyer', 'comprador',
      'departamento macro', 'department', 'empresa',
      'gender', 'genero', 'tipo de descuento',
      'marca', 'brand'
    )
    AND (
      d.code IN ('color', 'color_family')
      OR EXISTS (
        SELECT 1
        FROM app.attribute_family_rule r
        JOIN category_family cf ON cf.family_code = r.family_code
        WHERE r.dimension_id = d.id
          AND r.enabled = true
      )
    )
),
sales_by_sku AS (
  SELECT
    UPPER(BTRIM(h.sku_code)) AS sku_code,
    SUM(COALESCE(m.qty_sales, 0))::float8 AS units_sold,
    SUM(COALESCE(m.net_sales, 0))::float8 AS net_sales,
    SUM(COALESCE(m.profit, 0))::float8 AS profit,
    SUM(COALESCE(m.inventory_value, 0))::float8 AS inventory_value
  FROM app.inventory_history_snapshot h
  JOIN app.inventory_history_month m ON m.snapshot_id = h.id
  JOIN app.sku k ON k.id = h.sku_id
  WHERE h.store_id = $1::int
    AND k.category_number = $2::int
    AND m.year_month >= $3::text
    AND m.year_month <= $4::text
    AND (COALESCE(m.qty_sales, 0) <> 0 OR COALESCE(m.net_sales, 0) <> 0)
  GROUP BY UPPER(BTRIM(h.sku_code))
)
SELECT
  d.code AS "dimensionCode",
  d.label_es AS "dimensionLabel",
  v.code AS "valueCode",
  v.label_es AS "valueLabel",
  SUM(s.units_sold)::float8 AS "unitsSold",
  SUM(s.net_sales)::float8 AS "netSales",
  SUM(s.profit)::float8 AS "profit",
  SUM(s.inventory_value)::float8 AS "inventoryValue",
  COUNT(DISTINCT s.sku_code)::int AS "skuCount"
FROM sales_by_sku s
JOIN app.sku_attribute_assignment a ON UPPER(a.sku_code) = s.sku_code
JOIN relevant_dimensions d ON d.id = a.dimension_id
JOIN app.attribute_value v ON v.id = a.value_id
GROUP BY d.code, d.label_es, v.code, v.label_es
ORDER BY d.label_es, SUM(s.units_sold) DESC, v.label_es
    `,
    input.seedStoreId,
    input.categoryNumber,
    input.fromYearMonth,
    input.toYearMonth,
  );

  return aggregateAttributeMix(rows.map((row) => ({
    dimensionCode: row.dimensionCode,
    dimensionLabel: row.dimensionLabel,
    valueCode: row.valueCode,
    valueLabel: row.valueLabel,
    unitsSold: toNumber(row.unitsSold),
    netSales: toNumber(row.netSales),
    profit: toNumber(row.profit),
    inventoryValue: toNumber(row.inventoryValue),
    skuCount: toNumber(row.skuCount),
  })));
}

async function loadAttributeActualRowsForCards(cardIds: string[], db: DbClient = prisma): Promise<AttributeActualSqlRow[]> {
  if (cardIds.length === 0) return [];
  return db.$queryRawUnsafe<AttributeActualSqlRow[]>(
    `
WITH card_scope AS (
  SELECT
    c.id,
    c.id::text AS card_id,
    c.category_number,
    CASE
      WHEN COALESCE(array_length(c.target_store_ids, 1), 0) > 0 THEN c.target_store_ids
      ELSE ARRAY[c.seed_store_id]
    END AS store_ids
  FROM app.buyer_purchase_category_card c
  WHERE c.id = ANY($1::uuid[])
),
plan_dimensions AS (
  SELECT DISTINCT
    card_id::text AS card_id,
    dimension_code
  FROM app.buyer_purchase_attribute_plan
  WHERE card_id = ANY($1::uuid[])
),
inventory_units AS (
  SELECT
    cs.card_id AS "cardId",
    d.code AS "dimensionCode",
    d.label_es AS "dimensionLabel",
    v.code AS "valueCode",
    v.label_es AS "valueLabel",
    SUM(GREATEST(COALESCE(sl.on_hand, 0), 0))::float8 AS "currentInventoryUnits",
    0::float8 AS "purchaseUnits"
  FROM card_scope cs
  JOIN app.sku k ON k.category_number = cs.category_number
  JOIN app.stock_level sl ON sl.sku_id = k.id
    AND sl.store_id = ANY(cs.store_ids)
    AND COALESCE(sl.on_hand, 0) > 0
  JOIN app.sku_attribute_assignment a ON UPPER(a.sku_code) = UPPER(COALESCE(k.code, k.provisional_code))
  JOIN app.attribute_dimension d ON d.id = a.dimension_id
  JOIN app.attribute_value v ON v.id = a.value_id
  JOIN plan_dimensions pd
    ON pd.card_id = cs.card_id
   AND pd.dimension_code = d.code
  GROUP BY cs.card_id, d.code, d.label_es, v.code, v.label_es
),
po_skus AS (
  SELECT
    p.card_id::text AS card_id,
    UPPER(BTRIM(COALESCE(cl.sku_code, ps.linked_sku_code))) AS sku_code,
    SUM(GREATEST(COALESCE(p.quantity, 0), 0))::float8 AS quantity
  FROM app.buyer_purchase_po_link p
  LEFT JOIN app.buyer_purchase_carryover_line cl ON cl.id = p.carryover_line_id
  LEFT JOIN app.buyer_purchase_planned_style ps ON ps.id = p.planned_style_id
  WHERE p.card_id = ANY($1::uuid[])
    AND COALESCE(cl.sku_code, ps.linked_sku_code) IS NOT NULL
  GROUP BY p.card_id, UPPER(BTRIM(COALESCE(cl.sku_code, ps.linked_sku_code)))
),
purchase_units AS (
  SELECT
    ps.card_id AS "cardId",
    d.code AS "dimensionCode",
    d.label_es AS "dimensionLabel",
    v.code AS "valueCode",
    v.label_es AS "valueLabel",
    0::float8 AS "currentInventoryUnits",
    SUM(ps.quantity)::float8 AS "purchaseUnits"
  FROM po_skus ps
  JOIN app.sku k ON UPPER(COALESCE(k.code, k.provisional_code)) = ps.sku_code
  JOIN app.sku_attribute_assignment a ON UPPER(a.sku_code) = ps.sku_code
  JOIN app.attribute_dimension d ON d.id = a.dimension_id
  JOIN app.attribute_value v ON v.id = a.value_id
  JOIN plan_dimensions pd
    ON pd.card_id = ps.card_id
   AND pd.dimension_code = d.code
  GROUP BY ps.card_id, d.code, d.label_es, v.code, v.label_es
)
SELECT
  combined."cardId",
  combined."dimensionCode",
  combined."dimensionLabel",
  combined."valueCode",
  combined."valueLabel",
  SUM(combined."currentInventoryUnits")::float8 AS "currentInventoryUnits",
  SUM(combined."purchaseUnits")::float8 AS "purchaseUnits"
FROM (
  SELECT * FROM inventory_units
  UNION ALL
  SELECT * FROM purchase_units
) combined
GROUP BY combined."cardId", combined."dimensionCode", combined."dimensionLabel", combined."valueCode", combined."valueLabel"
ORDER BY combined."cardId", combined."dimensionLabel", combined."valueLabel"
    `,
    cardIds,
  );
}

async function loadAttributePlansForCards(cardIds: string[], db: DbClient = prisma): Promise<AttributePlanRow[]> {
  if (cardIds.length === 0) return [];
  const rows = await db.$queryRawUnsafe<AttributePlanDbRow[]>(
    `
      SELECT
        id::text,
        workbook_id::text AS "workbookId",
        card_id::text AS "cardId",
        dimension_code AS "dimensionCode",
        dimension_label AS "dimensionLabel",
        value_code AS "valueCode",
        value_label AS "valueLabel",
        planned_style_count AS "plannedStyleCount",
        planned_units AS "plannedUnits",
        notes,
        updated_by AS "updatedBy",
        updated_at AS "updatedAt"
      FROM app.buyer_purchase_attribute_plan
      WHERE card_id = ANY($1::uuid[])
      ORDER BY dimension_label, value_label
    `,
    cardIds,
  );
  return rows.map(normalizeAttributePlan);
}

function nextBuyerSeason(input: { buyingSeason: BuyerWorkbookSeason; seasonYear: number }): {
  buyingSeason: BuyerWorkbookSeason;
  seasonYear: number;
} {
  if (input.buyingSeason === 'SPRING_SUMMER') {
    return { buyingSeason: 'FALL_WINTER', seasonYear: input.seasonYear };
  }
  return { buyingSeason: 'SPRING_SUMMER', seasonYear: input.seasonYear + 1 };
}

function buyerSeasonSeries(buyingSeason: BuyerWorkbookSeason, seasonYear: number): Array<{
  key: 'currentSeason' | 'nextSeason' | 'followingSeason';
  buyingSeason: BuyerWorkbookSeason;
  seasonYear: number;
}> {
  const current = { buyingSeason, seasonYear };
  const next = nextBuyerSeason(current);
  const following = nextBuyerSeason(next);
  return [
    { key: 'currentSeason', ...current },
    { key: 'nextSeason', ...next },
    { key: 'followingSeason', ...following },
  ];
}

async function findBuyerChecklistCategoryRow(input: {
  categoryNumber: number;
  buyingSeason: BuyerWorkbookSeason;
  seasonYear: number;
  buyer?: string | null;
  includeNoBudget?: boolean;
}): Promise<BuyerChecklistCategoryRow> {
  const rows = await listBuyerChecklistCategories({
    buyer: input.buyer,
    buyingSeason: input.buyingSeason,
    seasonYear: input.seasonYear,
    includeNoBudget: input.includeNoBudget,
  });
  const row = rows.find((candidate) => candidate.categoryNumber === input.categoryNumber);
  if (!row) {
    throw new BuyerWorkbookServiceError(404, 'CATEGORY_NOT_FOUND', 'Category was not found in the buyer checklist.');
  }
  return row;
}

function emptySalesProjectionStep(status: BuyerChecklistStepStatus): BuyerChecklistSalesProjectionStep {
  return {
    status,
    projectedUnits: 0,
    updatedAt: null,
    planId: null,
  };
}

function emptyInventoryPlanStep(
  status: BuyerChecklistStepStatus,
  currentInventoryUnits: number,
  departmentOtbUnits: number | null,
): BuyerChecklistInventoryPlanStep {
  return {
    status,
    hasProjectionPlan: false,
    currentInventoryUnits,
    departmentOtbUnits,
  };
}

function emptyCarryoverStep(status: BuyerChecklistStepStatus): BuyerChecklistCarryoverStep {
  return {
    status,
    targetCount: 0,
    plannedCount: 0,
    boughtCount: 0,
  };
}

function emptyAttributePlanStep(status: BuyerChecklistStepStatus): BuyerChecklistAttributePlanStep {
  return {
    status,
    plannedUnits: 0,
    currentInventoryUnits: 0,
    purchaseUnits: 0,
    actualUnits: 0,
    maxVariancePct: 0,
    maxVarianceUnits: 0,
    alertCount: 0,
    updatedAt: null,
  };
}

function emptyWorkflowSteps(
  status: BuyerChecklistStepStatus,
  currentInventoryUnits: number,
  departmentOtbUnits: number | null,
): BuyerChecklistWorkflowSteps {
  return {
    salesProjection: emptySalesProjectionStep(status),
    inventoryPlan: emptyInventoryPlanStep(status, currentInventoryUnits, departmentOtbUnits),
    carryovers: emptyCarryoverStep(status),
    attributePlan: emptyAttributePlanStep(status),
  };
}

function buildChecklistWorkflowSteps(input: {
  plan: BuyerChecklistSeasonPlan;
  detail: BuyerChecklistPlanSqlRow | undefined;
  attributePlan: BuyerChecklistAttributePlanStep | undefined;
  currentInventoryUnits: number;
  departmentOtbUnits: number | null;
}): BuyerChecklistWorkflowSteps {
  if (input.plan.status === 'NO_BUDGET') {
    return emptyWorkflowSteps('not_applicable', input.currentInventoryUnits, input.departmentOtbUnits);
  }
  if (!input.plan.cardId || !input.detail) {
    return emptyWorkflowSteps('missing', input.currentInventoryUnits, input.departmentOtbUnits);
  }

  const planId = input.detail.salesProjectionPlanId;
  const salesProjectionUpdatedAt = toIso(input.detail.salesProjectionUpdatedAt);
  const hasProjectionPlan = Boolean(planId);
  const salesProjectionStatus: BuyerChecklistStepStatus = salesProjectionUpdatedAt
    ? 'confirmed'
    : hasProjectionPlan ? 'draft' : 'missing';
  const inventoryStatus: BuyerChecklistStepStatus = hasProjectionPlan
    ? 'draft'
    : 'missing';
  const targetCount = Math.max(0, Math.round(toNumber(input.detail.targetCarryoverSkuCount)));
  const plannedCount = Math.max(0, Math.round(toNumber(input.detail.plannedCarryoverCount)));
  const boughtCount = Math.max(0, Math.round(toNumber(input.detail.boughtCarryoverCount)));
  const carryoverStatus: BuyerChecklistStepStatus = targetCount <= 0
    ? plannedCount > 0 || boughtCount > 0
      ? boughtCount >= Math.max(1, plannedCount) ? 'complete' : 'draft'
      : 'not_applicable'
    : boughtCount >= targetCount
      ? 'complete'
      : plannedCount > 0 || boughtCount > 0 ? 'draft' : 'missing';

  return {
    salesProjection: {
      status: salesProjectionStatus,
      projectedUnits: Math.max(0, Math.round(toNumber(input.detail.salesProjectionUnits))),
      updatedAt: salesProjectionUpdatedAt,
      planId,
    },
    inventoryPlan: {
      status: inventoryStatus,
      hasProjectionPlan,
      currentInventoryUnits: input.currentInventoryUnits,
      departmentOtbUnits: input.departmentOtbUnits,
    },
    carryovers: {
      status: carryoverStatus,
      targetCount,
      plannedCount,
      boughtCount,
    },
    attributePlan: input.attributePlan ?? emptyAttributePlanStep('missing'),
  };
}

function emptySeasonPlan(buyingSeason: BuyerWorkbookSeason, seasonYear: number): BuyerChecklistSeasonPlan {
  return {
    buyingSeason,
    seasonYear,
    workbookId: null,
    cardId: null,
    status: null,
    updatedAt: null,
    noBudgetId: null,
    noBudgetNote: null,
    noBudgetMarkedBy: null,
    noBudgetMarkedAt: null,
  };
}

function mergeNoBudgetPlan(
  plan: BuyerChecklistSeasonPlan,
  noBudget: {
    id: string;
    note: string | null;
    markedBy: string | null;
    markedAt: Date | string;
    updatedAt: Date | string;
  } | undefined,
): BuyerChecklistSeasonPlan {
  if (!noBudget) return plan;
  return {
    ...plan,
    status: 'NO_BUDGET',
    updatedAt: toIso(noBudget.updatedAt) ?? toIso(noBudget.markedAt),
    noBudgetId: noBudget.id,
    noBudgetNote: noBudget.note,
    noBudgetMarkedBy: noBudget.markedBy,
    noBudgetMarkedAt: toIso(noBudget.markedAt),
  };
}

async function latestYearMonth(db: DbClient = prisma): Promise<string> {
  const rows = await db.$queryRawUnsafe<Array<{ yearMonth: string | null }>>(
    `
      SELECT MAX(year_month) AS "yearMonth"
      FROM app.inventory_history_month
    `,
  );
  return rows[0]?.yearMonth ?? yearMonth(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1);
}

async function latestInventorySnapshotYearMonth(db: DbClient = prisma): Promise<string> {
  const rows = await db.$queryRawUnsafe<Array<{ yearMonth: string | null }>>(
    `
      SELECT to_char(MAX(snapshot_as_of), 'YYYY-MM') AS "yearMonth"
      FROM app.inventory_history_snapshot
    `,
  );
  return rows[0]?.yearMonth ?? shiftYearMonth(await latestYearMonth(db), 1);
}

function parseYearMonthParts(input: string): { year: number; month: number } {
  const [yearPart, monthPart] = input.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new BuyerWorkbookServiceError(500, 'INVALID_YEAR_MONTH', `Invalid year-month value: ${input}`);
  }
  return { year, month };
}

async function loadBuyerChecklistCategorySales(input: {
  categoryNumbers: number[];
  fromYearMonth: string;
  toYearMonth: string;
}, db: DbClient = prisma): Promise<BuyerChecklistCategorySalesSqlRow[]> {
  if (input.categoryNumbers.length === 0) return [];
  const report = parseYearMonthParts(input.toYearMonth);
  return db.$queryRawUnsafe<BuyerChecklistCategorySalesSqlRow[]>(
    `
WITH src AS (
  SELECT
    k.category_number AS category_number,
    CONCAT(
      CASE
        WHEN m.slot_number < $4::int THEN $3::int
        ELSE $3::int - 1
      END,
      '-',
      LPAD(m.slot_number::text, 2, '0')
    ) AS year_month,
    COALESCE(m.qty_sales, 0)::float8 AS qty_sales,
    COALESCE(m.net_sales, 0)::float8 AS net_sales,
    COALESCE(m.profit, 0)::float8 AS profit
  FROM app.sku k
  JOIN app.inventory_history_snapshot s
    ON s.sku_code = COALESCE(k.code, k.provisional_code)
  JOIN app.inventory_history_month m ON m.snapshot_id = s.id
  WHERE k.category_number = ANY($5::int[])
    AND COALESCE(k.rics_status, '') <> 'D'
    AND (
      m.qty_sales <> 0 OR
      COALESCE(m.net_sales, 0) <> 0 OR
      COALESCE(m.profit, 0) <> 0
    )

  UNION ALL

  SELECT
    k.category_number AS category_number,
    $2::text AS year_month,
    COALESCE(s.month_qty_sales, 0)::float8 AS qty_sales,
    COALESCE(s.month_dol_sales, 0)::float8 AS net_sales,
    COALESCE(s.month_profit, 0)::float8 AS profit
  FROM app.sku k
  JOIN app.inventory_history_snapshot s
    ON s.sku_code = COALESCE(k.code, k.provisional_code)
  WHERE k.category_number = ANY($5::int[])
    AND COALESCE(k.rics_status, '') <> 'D'
    AND (
      COALESCE(s.month_qty_sales, 0) <> 0 OR
      COALESCE(s.month_dol_sales, 0) <> 0 OR
      COALESCE(s.month_profit, 0) <> 0
    )
)
SELECT
  category_number AS "categoryNumber",
  SUM(qty_sales)::float8 AS "last12MonthsUnits",
  SUM(net_sales)::float8 AS "last12MonthsSales"
FROM src
WHERE year_month >= $1::text
  AND year_month <= $2::text
  AND (qty_sales <> 0 OR net_sales <> 0 OR profit <> 0)
GROUP BY category_number
    `,
    input.fromYearMonth,
    input.toYearMonth,
    report.year,
    report.month,
    input.categoryNumbers,
  );
}

async function loadBuyerChecklistCategoryInventory(input: {
  categoryNumbers: number[];
}, db: DbClient = prisma): Promise<BuyerChecklistCategoryInventorySqlRow[]> {
  if (input.categoryNumbers.length === 0) return [];
  return db.$queryRawUnsafe<BuyerChecklistCategoryInventorySqlRow[]>(
    `
SELECT
  k.category_number AS "categoryNumber",
  SUM(COALESCE(s.on_hand, 0))::float8 AS "currentInventoryUnits",
  SUM(COALESCE(s.on_hand, 0) * COALESCE(k.current_cost, s.average_cost, 0))::float8 AS "currentInventoryValue"
FROM app.sku k
JOIN app.inventory_history_snapshot s
  ON s.sku_code = COALESCE(k.code, k.provisional_code)
WHERE k.category_number = ANY($1::int[])
  AND COALESCE(k.rics_status, '') <> 'D'
GROUP BY k.category_number
    `,
    input.categoryNumbers,
  );
}

function shiftBuyerSeasonYearMonthStart(season: BuyerWorkbookSeason, seasonYear: number): string {
  return season === 'SPRING_SUMMER' ? yearMonth(seasonYear, 2) : yearMonth(seasonYear, 8);
}

async function loadCarryoverCandidateMetrics(input: {
  storeId: number;
  categoryNumber: number;
  seasonMonths: string[];
}, db: DbClient = prisma): Promise<CarryoverCandidateMetricSqlRow[]> {
  const fromYearMonth = shiftYearMonth(input.seasonMonths[0], -36);
  const toYearMonth = shiftYearMonth(input.seasonMonths[0], -1);
  const selectedMonthNumbers = monthNumbers(input.seasonMonths);
  return db.$queryRawUnsafe<CarryoverCandidateMetricSqlRow[]>(
    `
WITH chain_first AS (
  SELECT
    UPPER(BTRIM(sku_code)) AS sku_code,
    MIN(date_first_received) AS first_received
  FROM app.inventory_history_snapshot
  WHERE store_id = $1::int
    AND sku_code IS NOT NULL
    AND BTRIM(sku_code) <> ''
  GROUP BY 1
),
src AS (
  SELECT
    h.sku_id,
    UPPER(BTRIM(h.sku_code)) AS sku_code,
    COALESCE(k.description_web, k.description_rics, k.style_color) AS sku_description,
    k.style_color AS color,
    cf.first_received,
    m.year_month,
    COALESCE(m.qty_sales, 0)::float8 AS qty_sales,
    COALESCE(m.net_sales, 0)::float8 AS net_sales,
    COALESCE(m.profit, 0)::float8 AS profit,
    COALESCE(m.inventory_value, 0)::float8 AS inventory_value,
    COALESCE(h.on_hand, 0)::float8 AS current_on_hand,
    COALESCE(h.current_on_order, 0)::float8 AS current_on_order,
    COALESCE(h.future_on_order, 0)::float8 AS future_on_order
  FROM app.inventory_history_snapshot h
  JOIN app.inventory_history_month m ON m.snapshot_id = h.id
  JOIN app.sku k ON k.id = h.sku_id
  LEFT JOIN chain_first cf ON cf.sku_code = UPPER(BTRIM(h.sku_code))
  WHERE h.store_id = $1::int
    AND k.category_number = $2::int
    AND m.year_month >= $3::text
    AND m.year_month <= $4::text
    AND m.calendar_month = ANY($5::int[])
    AND h.sku_code IS NOT NULL
    AND BTRIM(h.sku_code) <> ''
),
carryover AS (
  SELECT *
  FROM src
  WHERE first_received IS NULL
     OR (
       (substring(year_month from 1 for 4)::int - EXTRACT(YEAR FROM first_received)::int) * 12
       + (substring(year_month from 6 for 2)::int - EXTRACT(MONTH FROM first_received)::int)
     ) NOT BETWEEN 0 AND 3
)
SELECT
  sku_id::text AS "skuId",
  sku_code AS "skuCode",
  MAX(sku_description) AS "skuDescription",
  MAX(color) AS color,
  SUM(qty_sales)::float8 AS "unitsSold",
  SUM(net_sales)::float8 AS "netSales",
  SUM(profit)::float8 AS profit,
  SUM(inventory_value)::float8 AS "inventoryValue",
  MAX(current_on_hand)::float8 AS "currentOnHand",
  MAX(current_on_order)::float8 AS "currentOnOrder",
  MAX(future_on_order)::float8 AS "futureOnOrder"
FROM carryover
GROUP BY sku_id, sku_code
HAVING SUM(qty_sales) > 0 OR MAX(current_on_hand) > 0 OR MAX(current_on_order) > 0 OR MAX(future_on_order) > 0
ORDER BY SUM(qty_sales) DESC, sku_code
    `,
    input.storeId,
    input.categoryNumber,
    fromYearMonth,
    toYearMonth,
    selectedMonthNumbers,
  );
}

function normalizeCandidateMetrics(row: CarryoverCandidateMetricSqlRow): CarryoverCandidateMetrics {
  const unitsSold = toNumber(row.unitsSold);
  const netSales = toNumber(row.netSales);
  const profit = toNumber(row.profit);
  const inventoryValue = toNumber(row.inventoryValue);
  const cogs = Math.max(0, netSales - profit);
  return {
    unitsSold: Math.round(unitsSold),
    netSales: Math.round(netSales * 100) / 100,
    profit: Math.round(profit * 100) / 100,
    grossProfitPct: netSales > 0 ? Math.round((profit / netSales) * 1000) / 10 : null,
    inventoryValue: Math.round(inventoryValue * 100) / 100,
    roiPct: inventoryValue > 0 ? Math.round((profit / inventoryValue) * 1000) / 10 : null,
    turns: inventoryValue > 0 ? Math.round((cogs / inventoryValue) * 100) / 100 : null,
    currentOnHand: Math.round(toNumber(row.currentOnHand)),
    currentOnOrder: Math.round(toNumber(row.currentOnOrder)),
    futureOnOrder: Math.round(toNumber(row.futureOnOrder)),
    sellThroughPct: null,
  };
}

async function ensureCarryoverCandidates(db: DbClient, input: {
  workbookId: string;
  cardId: string;
  storeId: number;
  categoryNumber: number;
  seasonMonths: string[];
  actor: string;
}): Promise<void> {
  const rows = await loadCarryoverCandidateMetrics({
    storeId: input.storeId,
    categoryNumber: input.categoryNumber,
    seasonMonths: input.seasonMonths,
  }, db);
  for (const row of rows) {
    await db.$executeRawUnsafe(
      `
        INSERT INTO app.buyer_purchase_carryover_candidate (
          workbook_id,
          card_id,
          store_id,
          category_number,
          sku_id,
          sku_code,
          sku_description,
          color,
          metrics_json,
          reviewed_by
        )
        VALUES ($1::uuid, $2::uuid, $3::int, $4::int, $5::uuid, $6, $7, $8, $9::jsonb, $10)
        ON CONFLICT (card_id, store_id, sku_code) DO UPDATE SET
          sku_id = EXCLUDED.sku_id,
          sku_description = EXCLUDED.sku_description,
          color = EXCLUDED.color,
          metrics_json = EXCLUDED.metrics_json,
          updated_at = CURRENT_TIMESTAMP
      `,
      input.workbookId,
      input.cardId,
      input.storeId,
      input.categoryNumber,
      row.skuId,
      row.skuCode,
      row.skuDescription,
      row.color,
      JSON.stringify(normalizeCandidateMetrics(row)),
      input.actor,
    );
  }
}

async function insertStorePlans(db: DbClient, input: {
  workbookId: string;
  cardId: string;
  storeIds: number[];
  copiedFromStoreId?: number | null;
  targetNewSkuCount: number;
  targetCarryoverSkuCount: number;
  status?: 'DRAFT' | 'COPIED' | 'EDITED';
}): Promise<void> {
  if (input.storeIds.length === 0) return;
  await db.$executeRawUnsafe(
    `
      INSERT INTO app.buyer_purchase_store_category_plan (
        workbook_id,
        card_id,
        store_id,
        copied_from_store_id,
        status,
        target_new_sku_count,
        target_carryover_sku_count
      )
      SELECT
        $1::uuid,
        $2::uuid,
        unnest($3::int[]),
        $4::int,
        $5,
        $6::int,
        $7::int
      ON CONFLICT (card_id, store_id) DO UPDATE SET
        copied_from_store_id = EXCLUDED.copied_from_store_id,
        status = EXCLUDED.status,
        target_new_sku_count = EXCLUDED.target_new_sku_count,
        target_carryover_sku_count = EXCLUDED.target_carryover_sku_count,
        updated_at = CURRENT_TIMESTAMP
    `,
    input.workbookId,
    input.cardId,
    input.storeIds,
    input.copiedFromStoreId ?? null,
    input.status ?? 'DRAFT',
    input.targetNewSkuCount,
    input.targetCarryoverSkuCount,
  );
}

export async function listBuyerWorkbooks(params: {
  status?: BuyerWorkbookStatus | 'all';
} = {}): Promise<BuyerWorkbookListItem[]> {
  const status = params.status && params.status !== 'all' ? params.status : null;
  const rows = await prisma.$queryRawUnsafe<WorkbookRow[]>(
    `
      SELECT
        w.id::text,
        w.label,
        w.status,
        w.buying_season AS "buyingSeason",
        w.season_year AS "seasonYear",
        w.season_months AS "seasonMonths",
        w.seed_store_id AS "seedStoreId",
        w.target_store_ids AS "targetStoreIds",
        w.buyer,
        w.created_by AS "createdBy",
        w.created_at AS "createdAt",
        w.updated_at AS "updatedAt",
        w.archived_at AS "archivedAt",
        COUNT(c.id)::int AS "cardCount",
        COUNT(c.id) FILTER (WHERE c.status = 'COMPLETE')::int AS "completeCount"
      FROM app.buyer_purchase_workbook w
      LEFT JOIN app.buyer_purchase_category_card c ON c.workbook_id = w.id
      WHERE ($1::text IS NULL OR w.status = $1::text)
      GROUP BY w.id
      ORDER BY w.updated_at DESC
    `,
    status,
  );
  return rows.map(normalizeWorkbookList);
}

export async function createBuyerWorkbook(input: {
  label?: string | null;
  buyingSeason: BuyerWorkbookSeason;
  seasonYear: number;
  seedStoreId: number;
  targetStoreIds?: number[];
  categoryNumbers?: number[];
  departmentNumbers?: number[];
  buyer?: string | null;
  createdBy?: string | null;
}): Promise<BuyerWorkbookDetail> {
  const seasonMonths = monthsForBuyerSeason(input.buyingSeason, input.seasonYear);
  const categories = await resolveCategories({
    categoryNumbers: input.categoryNumbers,
    departmentNumbers: input.departmentNumbers,
  });
  const targetStoreIds = await resolveTargetStoreIds({
    explicitStoreIds: input.targetStoreIds,
    categoryNumbers: categories.map((row) => row.categoryNumber),
    seedStoreId: input.seedStoreId,
  });
  await ensureStoreIds(targetStoreIds);
  const label = cleanText(input.label)
    ?? `${input.buyingSeason === 'SPRING_SUMMER' ? 'Spring/Summer' : 'Fall/Winter'} ${input.seasonYear}`;
  const buyer = cleanText(input.buyer) ?? 'buyer';
  const createdBy = cleanText(input.createdBy) ?? buyer;

  const workbookId = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `
        INSERT INTO app.buyer_purchase_workbook (
          label,
          buying_season,
          season_year,
          season_months,
          seed_store_id,
          target_store_ids,
          buyer,
          created_by
        )
        VALUES ($1, $2, $3::int, $4::text[], $5::int, $6::int[], $7, $8)
        RETURNING id::text
      `,
      label,
      input.buyingSeason,
      input.seasonYear,
      seasonMonths,
      input.seedStoreId,
      targetStoreIds,
      buyer,
      createdBy,
    );
    const nextWorkbookId = rows[0]?.id;
    if (!nextWorkbookId) throw new BuyerWorkbookServiceError(500, 'CREATE_FAILED', 'Workbook was not created.');

    for (const category of categories) {
      const history = await loadHistoricalMetrics({
        seedStoreId: input.seedStoreId,
        categoryNumber: category.categoryNumber,
        seasonMonths,
      }, tx);
      const firstHistoryMonth = shiftYearMonth(seasonMonths[0], -36);
      const lastHistoryMonth = shiftYearMonth(seasonMonths[0], -1);
      const attributeMix = await loadAttributeMix({
        seedStoreId: input.seedStoreId,
        categoryNumber: category.categoryNumber,
        fromYearMonth: firstHistoryMonth,
        toYearMonth: lastHistoryMonth,
      }, tx);
      const cardRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `
          INSERT INTO app.buyer_purchase_category_card (
            workbook_id,
            department_number,
            department_label,
            category_number,
          category_label,
          status,
          seed_store_id,
          target_store_ids,
          suggested_new_sku_count,
            suggested_carryover_sku_count,
            target_new_sku_count,
            target_carryover_sku_count,
            history_json,
            attribute_mix_json
          )
          VALUES (
            $1::uuid,
            $2::int,
            $3,
            $4::int,
            $5,
            'NOT_STARTED',
            $6::int,
            $7::int[],
            $8::int,
            $9::int,
            $10::int,
            $11::int,
            $12::jsonb,
            $13::jsonb
          )
          RETURNING id::text
        `,
        nextWorkbookId,
        category.departmentNumber,
        category.departmentLabel ?? 'Unmapped',
        category.categoryNumber,
        category.categoryLabel,
        input.seedStoreId,
        targetStoreIds,
        history.summary.suggestedNewSkuCount,
        history.summary.suggestedCarryoverSkuCount,
        history.summary.suggestedNewSkuCount,
        history.summary.suggestedCarryoverSkuCount,
        JSON.stringify(history),
        JSON.stringify(attributeMix),
      );
      const cardId = cardRows[0]?.id;
      if (!cardId) throw new BuyerWorkbookServiceError(500, 'CREATE_FAILED', 'Category card was not created.');
      await ensureCarryoverCandidates(tx, {
        workbookId: nextWorkbookId,
        cardId,
        storeId: input.seedStoreId,
        categoryNumber: category.categoryNumber,
        seasonMonths,
        actor: createdBy,
      });
      await insertStorePlans(tx, {
        workbookId: nextWorkbookId,
        cardId,
        storeIds: targetStoreIds,
        targetNewSkuCount: history.summary.suggestedNewSkuCount,
        targetCarryoverSkuCount: history.summary.suggestedCarryoverSkuCount,
      });
    }

    await audit(tx, nextWorkbookId, 'workbook_create', createdBy, null, {
      label,
      buyingSeason: input.buyingSeason,
      seasonYear: input.seasonYear,
      categoryCount: categories.length,
      targetStoreIds,
    });
    return nextWorkbookId;
  }, { timeout: 120_000 });

  return getBuyerWorkbook(workbookId);
}

async function loadWorkbookRow(id: string, db: DbClient = prisma): Promise<WorkbookRow> {
  const rows = await db.$queryRawUnsafe<WorkbookRow[]>(
    `
      SELECT
        id::text,
        label,
        status,
        buying_season AS "buyingSeason",
        season_year AS "seasonYear",
        season_months AS "seasonMonths",
        seed_store_id AS "seedStoreId",
        target_store_ids AS "targetStoreIds",
        buyer,
        created_by AS "createdBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        archived_at AS "archivedAt"
      FROM app.buyer_purchase_workbook
      WHERE id = $1::uuid
      LIMIT 1
    `,
    id,
  );
  const row = rows[0];
  if (!row) throw new BuyerWorkbookServiceError(404, 'WORKBOOK_NOT_FOUND', 'Buyer workbook not found.');
  return row;
}

export async function getBuyerWorkbook(id: string): Promise<BuyerWorkbookDetail> {
  const workbook = normalizeWorkbook(await loadWorkbookRow(id));
  const [cardRows, storePlanRows, candidateRows, carryoverRows, styleRows, attributePlanRows, linkRows] = await Promise.all([
    prisma.$queryRawUnsafe<CardRow[]>(
      `
        SELECT
          id::text,
          workbook_id::text AS "workbookId",
          department_number AS "departmentNumber",
          department_label AS "departmentLabel",
          category_number AS "categoryNumber",
          category_label AS "categoryLabel",
          status,
          seed_store_id AS "seedStoreId",
          target_store_ids AS "targetStoreIds",
          suggested_new_sku_count AS "suggestedNewSkuCount",
          suggested_carryover_sku_count AS "suggestedCarryoverSkuCount",
          target_new_sku_count AS "targetNewSkuCount",
          target_carryover_sku_count AS "targetCarryoverSkuCount",
          replacement_style_target_count AS "replacementStyleTargetCount",
          additional_new_style_target_count AS "additionalNewStyleTargetCount",
          total_new_style_target_count AS "totalNewStyleTargetCount",
          history_json AS "historyJson",
          sales_projection_json AS "salesProjectionJson",
          sales_projection_units AS "salesProjectionUnits",
          sales_projection_sales AS "salesProjectionSales",
          sales_projection_updated_by AS "salesProjectionUpdatedBy",
          sales_projection_updated_at AS "salesProjectionUpdatedAt",
          sales_projection_plan_id::text AS "salesProjectionPlanId",
          attribute_mix_json AS "attributeMixJson",
          notes,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM app.buyer_purchase_category_card
        WHERE workbook_id = $1::uuid
        ORDER BY COALESCE(department_number, 9999), category_number
      `,
      id,
    ),
    prisma.$queryRawUnsafe<StorePlanRow[]>(
      `
        SELECT
          id::text,
          workbook_id::text AS "workbookId",
          card_id::text AS "cardId",
          store_id AS "storeId",
          copied_from_store_id AS "copiedFromStoreId",
          status,
          target_new_sku_count AS "targetNewSkuCount",
          target_carryover_sku_count AS "targetCarryoverSkuCount",
          notes
        FROM app.buyer_purchase_store_category_plan
        WHERE workbook_id = $1::uuid
        ORDER BY store_id
      `,
      id,
    ),
    prisma.$queryRawUnsafe<CarryoverCandidateRow[]>(
      `
        SELECT
          id::text,
          workbook_id::text AS "workbookId",
          card_id::text AS "cardId",
          store_id AS "storeId",
          category_number AS "categoryNumber",
          sku_id::text AS "skuId",
          sku_code AS "skuCode",
          sku_description AS "skuDescription",
          color,
          metrics_json AS "metricsJson",
          decision,
          availability,
          unavailable_reason AS "unavailableReason",
          carryover_line_id::text AS "carryoverLineId",
          replacement_style_id::text AS "replacementStyleId",
          notes,
          reviewed_by AS "reviewedBy",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM app.buyer_purchase_carryover_candidate
        WHERE workbook_id = $1::uuid
        ORDER BY card_id, decision, sku_code
      `,
      id,
    ),
    prisma.$queryRawUnsafe<CarryoverRow[]>(
      `
        SELECT
          id::text,
          workbook_id::text AS "workbookId",
          card_id::text AS "cardId",
          store_id AS "storeId",
          sku_id::text AS "skuId",
          sku_code AS "skuCode",
          sku_description AS "skuDescription",
          color,
          size_cells AS "sizeCells",
          total_quantity AS "totalQuantity",
          source,
          unavailable,
          unavailable_reason AS "unavailableReason",
          replacement_style_id::text AS "replacementStyleId",
          carryover_candidate_id::text AS "carryoverCandidateId",
          notes
        FROM app.buyer_purchase_carryover_line
        WHERE workbook_id = $1::uuid
        ORDER BY store_id NULLS FIRST, sku_code
      `,
      id,
    ),
    prisma.$queryRawUnsafe<PlannedStyleRow[]>(
      `
        SELECT
          id::text,
          workbook_id::text AS "workbookId",
          card_id::text AS "cardId",
          replacement_for_carryover_line_id::text AS "replacementForCarryoverLineId",
          replacement_for_carryover_candidate_id::text AS "replacementForCarryoverCandidateId",
          vendor_code AS "vendorCode",
          vendor_name AS "vendorName",
          working_style AS "workingStyle",
          description,
          color,
          color_family AS "colorFamily",
          attributes_json AS "attributesJson",
          quoted_unit_cost AS "quotedUnitCost",
          target_new_sku_count AS "targetNewSkuCount",
          target_units AS "targetUnits",
          status,
          linked_sku_id::text AS "linkedSkuId",
          linked_sku_code AS "linkedSkuCode",
          notes
        FROM app.buyer_purchase_planned_style
        WHERE workbook_id = $1::uuid
        ORDER BY created_at, working_style
      `,
      id,
    ),
    prisma.$queryRawUnsafe<AttributePlanDbRow[]>(
      `
        SELECT
          id::text,
          workbook_id::text AS "workbookId",
          card_id::text AS "cardId",
          dimension_code AS "dimensionCode",
          dimension_label AS "dimensionLabel",
          value_code AS "valueCode",
          value_label AS "valueLabel",
          planned_style_count AS "plannedStyleCount",
          planned_units AS "plannedUnits",
          notes,
          updated_by AS "updatedBy",
          updated_at AS "updatedAt"
        FROM app.buyer_purchase_attribute_plan
        WHERE workbook_id = $1::uuid
        ORDER BY dimension_label, value_label
      `,
      id,
    ),
    prisma.$queryRawUnsafe<PoLinkRow[]>(
      `
        SELECT
          id::text,
          workbook_id::text AS "workbookId",
          card_id::text AS "cardId",
          carryover_line_id::text AS "carryoverLineId",
          planned_style_id::text AS "plannedStyleId",
          po_id::text AS "poId",
          po_number AS "poNumber",
          po_line_id::text AS "poLineId",
          quantity,
          notes,
          linked_by AS "linkedBy",
          linked_at AS "linkedAt"
        FROM app.buyer_purchase_po_link
        WHERE workbook_id = $1::uuid
        ORDER BY linked_at DESC
      `,
      id,
    ),
  ]);

  const normalizedAttributePlans = attributePlanRows.map(normalizeAttributePlan);
  const attributeActualRows = await loadAttributeActualRowsForCards(cardRows.map((row) => row.id));
  const attributeReconciliationByCard = buildAttributeReconciliation(normalizedAttributePlans, attributeActualRows);
  const cards = cardRows.map((row) => {
    const card = normalizeCard(row);
    return {
      ...card,
      attributeReconciliation: attributeReconciliationByCard.get(card.id) ?? [],
    };
  });

  return {
    workbook,
    cards,
    storePlans: storePlanRows.map(normalizeStorePlan),
    carryoverCandidates: candidateRows.map(normalizeCandidate),
    carryovers: carryoverRows.map(normalizeCarryover),
    plannedStyles: styleRows.map(normalizeStyle),
    attributePlans: normalizedAttributePlans,
    poLinks: linkRows.map(normalizePoLink),
  };
}

function projectionWorkbookWindow() {
  const seasonWindow = buildSeasonWindowFromYearMonth(undefined, 5);
  const first = seasonWindow[0]!;
  const last = seasonWindow[seasonWindow.length - 1]!;
  return {
    first,
    last,
    months: seasonWindow.flatMap((season) => season.months),
    labelSuffix: `${first.seasonLabel} to ${last.seasonLabel}`,
  };
}

async function findExistingCategoryProjectionPlan(input: {
  categoryNumber: number;
  season: string;
  seasonYear: number;
  months: string[];
}, db: DbClient = prisma): Promise<string | null> {
  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
    `
      SELECT p.id::text AS id
      FROM app.purchase_plan p
      WHERE p.status = 'draft'
        AND COALESCE(p.planning_scope, 'store_group') = 'enterprise'
        AND COALESCE(p.planning_dimension, 'department') = 'category'
        AND p.store_group_code IS NULL
        AND p.season = $1
        AND p.season_year = $2::int
        AND p.season_months = $3::text[]
        AND COALESCE(p.selected_categories, ARRAY[]::int[]) = ARRAY[$4::int]
      ORDER BY p.updated_at DESC, p.created_at DESC
      LIMIT 1
    `,
    input.season,
    input.seasonYear,
    input.months,
    input.categoryNumber,
  );
  return rows[0]?.id ?? null;
}

async function linkSalesProjectionPlan(input: {
  workbookId: string;
  cardId: string;
  planId: string;
  actor: string;
}, db: DbClient = prisma): Promise<void> {
  const before = normalizeCard(await ensureCard(input.workbookId, input.cardId, db));
  await linkBuyerSalesProjectionPlanDraft(input, db);
  const after = normalizeCard(await ensureCard(input.workbookId, input.cardId, db));
  await audit(db, input.workbookId, 'sales_projection_workbook_link', input.actor, before, after);
}

async function buildSalesProjectionWorkbookResult(
  workbookId: string,
  plan: PurchasePlanDetailResponse,
): Promise<BuyerSalesProjectionWorkbookResult> {
  const [trendSummary, buyerWorkbook] = await Promise.all([
    getPurchasePlanSalesTrendSummary(plan.plan.id),
    getBuyerWorkbook(workbookId),
  ]);
  return { plan, trendSummary, buyerWorkbook };
}

export async function ensureBuyerSalesProjectionWorkbook(
  workbookId: string,
  cardId: string,
  actorInput?: string | null,
): Promise<BuyerSalesProjectionWorkbookResult> {
  const actor = cleanText(actorInput) ?? 'buyer';
  const card = normalizeCard(await ensureCard(workbookId, cardId));
  if (card.salesProjectionPlanId) {
    try {
      if (!card.salesProjection.updatedAt) {
        await syncBuyerSalesProjectionDraftForPlan(card.salesProjectionPlanId);
      }
      return buildSalesProjectionWorkbookResult(workbookId, await getPurchasePlan(card.salesProjectionPlanId));
    } catch (err) {
      if ((err as { code?: string })?.code !== 'PLAN_NOT_FOUND') throw err;
    }
  }

  const window = projectionWorkbookWindow();
  const existingPlanId = await findExistingCategoryProjectionPlan({
    categoryNumber: card.categoryNumber,
    season: window.first.season,
    seasonYear: window.first.seasonYear,
    months: window.months,
  });
  const plan = existingPlanId
    ? await getPurchasePlan(existingPlanId)
    : await createPurchasePlan({
      planningScope: 'enterprise',
      planningDimension: 'category',
      season: window.first.season,
      seasonYear: window.first.seasonYear,
      seasonMonths: window.months,
      departmentNumbers: card.departmentNumber == null ? [] : [card.departmentNumber],
      categoryNumbers: [card.categoryNumber],
      label: `Enterprise-wide ${card.categoryLabel} ${window.labelSuffix}`,
      forecast: { method: 'holtWinters' },
      eohMethod: 'forward',
      coverMonths: 3,
      discountNormalization: true,
      createdBy: actor,
    });

  await prisma.$transaction(async (tx) => {
    await linkSalesProjectionPlan({
      workbookId,
      cardId,
      planId: plan.plan.id,
      actor,
    }, tx);
  });

  return buildSalesProjectionWorkbookResult(workbookId, plan);
}

export async function confirmBuyerSalesProjectionWorkbook(
  workbookId: string,
  cardId: string,
  actorInput?: string | null,
): Promise<BuyerWorkbookDetail> {
  const actor = cleanText(actorInput) ?? 'buyer';
  const { plan } = await ensureBuyerSalesProjectionWorkbook(workbookId, cardId, actor);

  await prisma.$transaction(async (tx) => {
    const before = normalizeCard(await ensureCard(workbookId, cardId, tx));
    await completeBuyerSalesProjectionCard({ workbookId, cardId, planId: plan.plan.id, actor }, tx);
    const after = normalizeCard(await ensureCard(workbookId, cardId, tx));
    await audit(tx, workbookId, 'sales_projection_workbook_confirm', actor, before, after);
  });

  return getBuyerWorkbook(workbookId);
}

async function ensureCard(workbookId: string, cardId: string, db: DbClient = prisma): Promise<CardRow> {
  const rows = await db.$queryRawUnsafe<CardRow[]>(
    `
      SELECT
        id::text,
        workbook_id::text AS "workbookId",
        department_number AS "departmentNumber",
        department_label AS "departmentLabel",
        category_number AS "categoryNumber",
        category_label AS "categoryLabel",
        status,
        seed_store_id AS "seedStoreId",
        target_store_ids AS "targetStoreIds",
        suggested_new_sku_count AS "suggestedNewSkuCount",
        suggested_carryover_sku_count AS "suggestedCarryoverSkuCount",
        target_new_sku_count AS "targetNewSkuCount",
        target_carryover_sku_count AS "targetCarryoverSkuCount",
        replacement_style_target_count AS "replacementStyleTargetCount",
        additional_new_style_target_count AS "additionalNewStyleTargetCount",
        total_new_style_target_count AS "totalNewStyleTargetCount",
        history_json AS "historyJson",
        sales_projection_json AS "salesProjectionJson",
        sales_projection_units AS "salesProjectionUnits",
        sales_projection_sales AS "salesProjectionSales",
        sales_projection_updated_by AS "salesProjectionUpdatedBy",
        sales_projection_updated_at AS "salesProjectionUpdatedAt",
        sales_projection_plan_id::text AS "salesProjectionPlanId",
        attribute_mix_json AS "attributeMixJson",
        notes,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM app.buyer_purchase_category_card
      WHERE workbook_id = $1::uuid
        AND id = $2::uuid
      LIMIT 1
    `,
    workbookId,
    cardId,
  );
  const row = rows[0];
  if (!row) throw new BuyerWorkbookServiceError(404, 'CARD_NOT_FOUND', 'Category card not found.');
  return row;
}

async function ensureCandidate(workbookId: string, candidateId: string, db: DbClient = prisma): Promise<CarryoverCandidate> {
  const rows = await db.$queryRawUnsafe<CarryoverCandidateRow[]>(
    `
      SELECT
        id::text,
        workbook_id::text AS "workbookId",
        card_id::text AS "cardId",
        store_id AS "storeId",
        category_number AS "categoryNumber",
        sku_id::text AS "skuId",
        sku_code AS "skuCode",
        sku_description AS "skuDescription",
        color,
        metrics_json AS "metricsJson",
        decision,
        availability,
        unavailable_reason AS "unavailableReason",
        carryover_line_id::text AS "carryoverLineId",
        replacement_style_id::text AS "replacementStyleId",
        notes,
        reviewed_by AS "reviewedBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM app.buyer_purchase_carryover_candidate
      WHERE workbook_id = $1::uuid
        AND id = $2::uuid
      LIMIT 1
    `,
    workbookId,
    candidateId,
  );
  const row = rows[0];
  if (!row) throw new BuyerWorkbookServiceError(404, 'CANDIDATE_NOT_FOUND', 'Carryover candidate not found.');
  return normalizeCandidate(row);
}

export async function updateBuyerCategoryCard(workbookId: string, cardId: string, input: {
  status?: BuyerCategoryStatus;
  targetNewSkuCount?: number;
  targetCarryoverSkuCount?: number;
  salesProjections?: SalesProjectionMonth[];
  notes?: string | null;
  actor?: string | null;
}): Promise<BuyerWorkbookDetail> {
  const actor = cleanText(input.actor) ?? 'system';
  const salesProjectionMonths = input.salesProjections?.map((month) => ({
    yearMonth: month.yearMonth,
    projectedUnits: Math.max(0, Math.trunc(toNumber(month.projectedUnits))),
    projectedSales: Math.max(0, Math.round(toNumber(month.projectedSales) * 100) / 100),
  })).filter((month) => /^\d{4}-\d{2}$/.test(month.yearMonth)) ?? null;
  const salesProjectionUnits = salesProjectionMonths?.reduce((sum, month) => sum + month.projectedUnits, 0) ?? null;
  const salesProjectionSales = salesProjectionMonths == null
    ? null
    : Math.round(salesProjectionMonths.reduce((sum, month) => sum + month.projectedSales, 0) * 100) / 100;
  await prisma.$transaction(async (tx) => {
    const before = normalizeCard(await ensureCard(workbookId, cardId, tx));
    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_category_card
        SET
          status = COALESCE($3::text, status),
          target_new_sku_count = COALESCE($4::int, target_new_sku_count),
          target_carryover_sku_count = COALESCE($5::int, target_carryover_sku_count),
          notes = CASE WHEN $6::boolean THEN $7::text ELSE notes END,
          sales_projection_json = CASE WHEN $8::boolean THEN $9::jsonb ELSE sales_projection_json END,
          sales_projection_units = CASE WHEN $8::boolean THEN $10::int ELSE sales_projection_units END,
          sales_projection_sales = CASE WHEN $8::boolean THEN $11::numeric ELSE sales_projection_sales END,
          sales_projection_updated_by = CASE WHEN $8::boolean THEN $12::text ELSE sales_projection_updated_by END,
          sales_projection_updated_at = CASE WHEN $8::boolean THEN CURRENT_TIMESTAMP ELSE sales_projection_updated_at END,
          updated_at = CURRENT_TIMESTAMP
        WHERE workbook_id = $1::uuid
          AND id = $2::uuid
      `,
      workbookId,
      cardId,
      input.status ?? null,
      input.targetNewSkuCount == null ? null : Math.max(0, Math.trunc(input.targetNewSkuCount)),
      input.targetCarryoverSkuCount == null ? null : Math.max(0, Math.trunc(input.targetCarryoverSkuCount)),
      input.notes !== undefined,
      input.notes ?? null,
      input.salesProjections !== undefined,
      JSON.stringify(salesProjectionMonths ?? []),
      salesProjectionUnits,
      salesProjectionSales,
      actor,
    );
    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_workbook
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      workbookId,
    );
    const after = normalizeCard(await ensureCard(workbookId, cardId, tx));
    await audit(tx, workbookId, 'category_card_update', actor, before, after);
  });
  return getBuyerWorkbook(workbookId);
}

export async function listCarryoverCandidates(workbookId: string, cardId: string): Promise<CarryoverCandidate[]> {
  const card = normalizeCard(await ensureCard(workbookId, cardId));
  const workbook = await loadWorkbookRow(workbookId);
  await ensureCarryoverCandidates(prisma, {
    workbookId,
    cardId,
    storeId: card.seedStoreId,
    categoryNumber: card.categoryNumber,
    seasonMonths: workbook.seasonMonths ?? [],
    actor: 'system',
  });
  const rows = await prisma.$queryRawUnsafe<CarryoverCandidateRow[]>(
    `
      SELECT
        id::text,
        workbook_id::text AS "workbookId",
        card_id::text AS "cardId",
        store_id AS "storeId",
        category_number AS "categoryNumber",
        sku_id::text AS "skuId",
        sku_code AS "skuCode",
        sku_description AS "skuDescription",
        color,
        metrics_json AS "metricsJson",
        decision,
        availability,
        unavailable_reason AS "unavailableReason",
        carryover_line_id::text AS "carryoverLineId",
        replacement_style_id::text AS "replacementStyleId",
        notes,
        reviewed_by AS "reviewedBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM app.buyer_purchase_carryover_candidate
      WHERE workbook_id = $1::uuid
        AND card_id = $2::uuid
      ORDER BY decision, availability, sku_code
    `,
    workbookId,
    cardId,
  );
  return rows.map(normalizeCandidate);
}

export async function updateCarryoverCandidate(workbookId: string, candidateId: string, input: {
  decision?: CarryoverDecision;
  availability?: CarryoverAvailability;
  notes?: string | null;
  actor?: string | null;
}): Promise<BuyerWorkbookDetail> {
  const actor = cleanText(input.actor) ?? 'system';
  await prisma.$transaction(async (tx) => {
    const before = await ensureCandidate(workbookId, candidateId, tx);
    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_carryover_candidate
        SET
          decision = COALESCE($3::text, decision),
          availability = COALESCE($4::text, availability),
          notes = CASE WHEN $5::boolean THEN $6 ELSE notes END,
          reviewed_by = $7,
          updated_at = CURRENT_TIMESTAMP
        WHERE workbook_id = $1::uuid
          AND id = $2::uuid
      `,
      workbookId,
      candidateId,
      input.decision ?? null,
      input.availability ?? null,
      input.notes !== undefined,
      input.notes ?? null,
      actor,
    );
    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_category_card
        SET status = CASE WHEN status IN ('NOT_STARTED', 'HISTORY_REVIEWED') THEN 'CARRYOVER_REVIEW' ELSE status END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      before.cardId,
    );
    await audit(tx, workbookId, 'carryover_candidate_update', actor, before, input);
  });
  return getBuyerWorkbook(workbookId);
}

export async function createModelLineFromCandidate(workbookId: string, candidateId: string, input: {
  actor?: string | null;
} = {}): Promise<BuyerWorkbookDetail> {
  const actor = cleanText(input.actor) ?? 'system';
  const candidate = await ensureCandidate(workbookId, candidateId);
  let planCells: Awaited<ReturnType<typeof getSkuStoreCellRollup>> = [];
  try {
    planCells = await getSkuStoreCellRollup({
      storeNumbers: [candidate.storeId],
      skus: [candidate.skuCode],
      limit: 1,
    });
  } catch {
    planCells = [];
  }
  const sizeCells = planCells.length
    ? planCells.map((line) => ({
      rowLabel: line.rowLabel,
      columnLabel: line.columnLabel,
      sizeLabel: [line.rowLabel, line.columnLabel].filter(Boolean).join(' ').trim() || line.columnLabel || line.rowLabel,
      quantity: Math.max(0, Math.trunc(line.reorder ?? 0)),
      plannedQty: Math.max(0, Math.trunc(line.reorder ?? 0)),
      recommendedQty: Math.max(0, Math.trunc(line.reorder ?? 0)),
      onHand: Math.max(0, Math.trunc(line.onHand ?? 0)),
      currentOnOrder: Math.max(0, Math.trunc(line.currentOnOrder ?? 0)),
      futureOnOrder: Math.max(0, Math.trunc(line.futureOnOrder ?? 0)),
      modelQty: Math.max(0, Math.trunc(line.model ?? 0)),
      modelShort: Math.max(0, Math.trunc((line.model ?? 0) - (line.onHand ?? 0) - (line.currentOnOrder ?? 0) - (line.futureOnOrder ?? 0))),
      skuSalesQty: Math.max(0, Math.trunc(line.ytdSales ?? 0)),
      forecastDemandQty: Math.max(0, Math.trunc(line.lySales ?? 0)),
    }))
    : [{
      rowLabel: null,
      columnLabel: null,
      sizeLabel: 'Needs size review',
      quantity: 0,
      plannedQty: 0,
      recommendedQty: 0,
      onHand: Math.max(0, Math.trunc(candidate.metrics.currentOnHand ?? 0)),
      currentOnOrder: Math.max(0, Math.trunc(candidate.metrics.currentOnOrder ?? 0)),
      futureOnOrder: Math.max(0, Math.trunc(candidate.metrics.futureOnOrder ?? 0)),
      modelQty: 0,
      modelShort: 0,
      skuSalesQty: Math.max(0, Math.trunc(candidate.metrics.unitsSold ?? 0)),
      forecastDemandQty: 0,
    }];
  const totalQuantity = sizeCells.reduce((sum, cell) => sum + cell.plannedQty, 0);

  await prisma.$transaction(async (tx) => {
    await ensureCard(workbookId, candidate.cardId, tx);
    const lineRows = candidate.carryoverLineId
      ? await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `
            UPDATE app.buyer_purchase_carryover_line
            SET
              sku_id = $4::uuid,
              sku_description = $5,
              color = $6,
              size_cells = $7::jsonb,
              total_quantity = $8::int,
              source = 'REORDER_PLANNER',
              carryover_candidate_id = $9::uuid,
              updated_at = CURRENT_TIMESTAMP
            WHERE workbook_id = $1::uuid
              AND card_id = $2::uuid
              AND id = $3::uuid
            RETURNING id::text
          `,
        workbookId,
        candidate.cardId,
        candidate.carryoverLineId,
        candidate.skuId,
        candidate.skuDescription,
        candidate.color,
        JSON.stringify(sizeCells),
        totalQuantity,
        candidate.id,
      )
      : await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `
            INSERT INTO app.buyer_purchase_carryover_line (
              workbook_id,
              card_id,
              store_id,
              sku_id,
              sku_code,
              sku_description,
              color,
              size_cells,
              total_quantity,
              source,
              carryover_candidate_id
            )
            VALUES ($1::uuid, $2::uuid, $3::int, $4::uuid, $5, $6, $7, $8::jsonb, $9::int, 'REORDER_PLANNER', $10::uuid)
            RETURNING id::text
          `,
        workbookId,
        candidate.cardId,
        candidate.storeId,
        candidate.skuId,
        candidate.skuCode,
        candidate.skuDescription,
        candidate.color,
        JSON.stringify(sizeCells),
        totalQuantity,
        candidate.id,
      );
    const lineId = lineRows[0]?.id ?? candidate.carryoverLineId;
    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_carryover_candidate
        SET decision = 'WINNER',
            availability = CASE WHEN availability = 'UNKNOWN' THEN 'AVAILABLE' ELSE availability END,
            carryover_line_id = $3::uuid,
            reviewed_by = $4,
            updated_at = CURRENT_TIMESTAMP
        WHERE workbook_id = $1::uuid
          AND id = $2::uuid
      `,
      workbookId,
      candidate.id,
      lineId,
      actor,
    );
    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_category_card
        SET status = CASE WHEN status IN ('NOT_STARTED', 'HISTORY_REVIEWED', 'CARRYOVER_REVIEW') THEN 'CARRYOVERS' ELSE status END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      candidate.cardId,
    );
    await audit(tx, workbookId, 'carryover_model_from_candidate', actor, candidate, { lineId, totalQuantity });
  });
  return getBuyerWorkbook(workbookId);
}

export async function flagCandidateUnavailable(workbookId: string, candidateId: string, input: {
  reason: string;
  actor?: string | null;
}): Promise<BuyerWorkbookDetail> {
  const reason = cleanText(input.reason);
  if (!reason) throw new BuyerWorkbookServiceError(400, 'REASON_REQUIRED', 'Unavailable reason is required.');
  const actor = cleanText(input.actor) ?? 'system';
  await prisma.$transaction(async (tx) => {
    const candidate = await ensureCandidate(workbookId, candidateId, tx);
    const styleRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `
        INSERT INTO app.buyer_purchase_planned_style (
          workbook_id,
          card_id,
          replacement_for_carryover_line_id,
          replacement_for_carryover_candidate_id,
          working_style,
          description,
          color,
          target_new_sku_count,
          target_units,
          notes
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, 1, $8::int, $9)
        RETURNING id::text
      `,
      workbookId,
      candidate.cardId,
      candidate.carryoverLineId,
      candidate.id,
      `Replacement for ${candidate.skuCode}`,
      candidate.skuDescription,
      candidate.color,
      candidate.carryoverLineId ? candidate.metrics.currentOnHand : 0,
      candidate.carryoverLineId ? reason : `${reason}. Quantity still needs review.`,
    );
    const styleId = styleRows[0]?.id;
    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_carryover_candidate
        SET decision = CASE WHEN decision = 'UNREVIEWED' THEN 'WINNER' ELSE decision END,
            availability = 'UNAVAILABLE',
            unavailable_reason = $3,
            replacement_style_id = $4::uuid,
            reviewed_by = $5,
            updated_at = CURRENT_TIMESTAMP
        WHERE workbook_id = $1::uuid
          AND id = $2::uuid
      `,
      workbookId,
      candidate.id,
      reason,
      styleId,
      actor,
    );
    if (candidate.carryoverLineId) {
      await tx.$executeRawUnsafe(
        `
          UPDATE app.buyer_purchase_carryover_line
          SET unavailable = true,
              unavailable_reason = $3,
              replacement_style_id = $4::uuid,
              updated_at = CURRENT_TIMESTAMP
          WHERE workbook_id = $1::uuid
            AND id = $2::uuid
        `,
        workbookId,
        candidate.carryoverLineId,
        reason,
        styleId,
      );
    }
    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_category_card
        SET status = CASE WHEN status IN ('NOT_STARTED', 'HISTORY_REVIEWED', 'CARRYOVER_REVIEW', 'CARRYOVERS') THEN 'NEW_STYLES' ELSE status END,
            replacement_style_target_count = replacement_style_target_count + 1,
            total_new_style_target_count = total_new_style_target_count + 1,
            target_new_sku_count = target_new_sku_count + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      candidate.cardId,
    );
    await audit(tx, workbookId, 'carryover_candidate_unavailable', actor, candidate, { reason, styleId });
  });
  return getBuyerWorkbook(workbookId);
}

export async function updateCarryoverLine(workbookId: string, lineId: string, input: {
  sizeCells?: CarryoverLine['sizeCells'];
  totalQuantity?: number | null;
  notes?: string | null;
  actor?: string | null;
}): Promise<BuyerWorkbookDetail> {
  const actor = cleanText(input.actor) ?? 'system';
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string; sizeCells: unknown }>>(
      `
        SELECT id::text, size_cells AS "sizeCells"
        FROM app.buyer_purchase_carryover_line
        WHERE workbook_id = $1::uuid
          AND id = $2::uuid
        LIMIT 1
      `,
      workbookId,
      lineId,
    );
    if (!rows[0]) throw new BuyerWorkbookServiceError(404, 'CARRYOVER_NOT_FOUND', 'Carryover line not found.');
    const nextCells = input.sizeCells ?? jsonArray(rows[0].sizeCells);
    const totalQuantity = input.totalQuantity == null
      ? nextCells.reduce((sum, cell) => sum + Math.max(0, Math.trunc(Number((cell as { plannedQty?: number; quantity?: number }).plannedQty ?? (cell as { quantity?: number }).quantity ?? 0))), 0)
      : Math.max(0, Math.trunc(input.totalQuantity));
    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_carryover_line
        SET size_cells = CASE WHEN $3::boolean THEN $4::jsonb ELSE size_cells END,
            total_quantity = $5::int,
            notes = CASE WHEN $6::boolean THEN $7 ELSE notes END,
            updated_at = CURRENT_TIMESTAMP
        WHERE workbook_id = $1::uuid
          AND id = $2::uuid
      `,
      workbookId,
      lineId,
      input.sizeCells !== undefined,
      JSON.stringify(nextCells),
      totalQuantity,
      input.notes !== undefined,
      input.notes ?? null,
    );
    await audit(tx, workbookId, 'carryover_line_update', actor, { lineId }, { totalQuantity });
  });
  return getBuyerWorkbook(workbookId);
}

export async function updateNewStyleTargets(workbookId: string, cardId: string, input: {
  replacementStyleTargetCount?: number;
  additionalNewStyleTargetCount?: number;
  totalNewStyleTargetCount?: number;
  actor?: string | null;
}): Promise<BuyerWorkbookDetail> {
  const actor = cleanText(input.actor) ?? 'system';
  await prisma.$transaction(async (tx) => {
    const before = normalizeCard(await ensureCard(workbookId, cardId, tx));
    const replacement = input.replacementStyleTargetCount == null
      ? before.replacementStyleTargetCount
      : Math.max(0, Math.trunc(input.replacementStyleTargetCount));
    const additional = input.additionalNewStyleTargetCount == null
      ? before.additionalNewStyleTargetCount
      : Math.max(0, Math.trunc(input.additionalNewStyleTargetCount));
    const total = input.totalNewStyleTargetCount == null
      ? replacement + additional
      : Math.max(0, Math.trunc(input.totalNewStyleTargetCount));
    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_category_card
        SET replacement_style_target_count = $3::int,
            additional_new_style_target_count = $4::int,
            total_new_style_target_count = $5::int,
            target_new_sku_count = $5::int,
            status = CASE WHEN status IN ('NOT_STARTED', 'HISTORY_REVIEWED', 'CARRYOVER_REVIEW', 'CARRYOVERS') THEN 'NEW_STYLES' ELSE status END,
            updated_at = CURRENT_TIMESTAMP
        WHERE workbook_id = $1::uuid
          AND id = $2::uuid
      `,
      workbookId,
      cardId,
      replacement,
      additional,
      total,
    );
    await audit(tx, workbookId, 'new_style_targets_update', actor, before, { replacement, additional, total });
  });
  return getBuyerWorkbook(workbookId);
}

export async function updateAttributePlan(workbookId: string, cardId: string, input: {
  rows: Array<{
    dimensionCode: string;
    dimensionLabel: string;
    valueCode: string;
    valueLabel: string;
    plannedStyleCount?: number | null;
    plannedUnits?: number | null;
    notes?: string | null;
  }>;
  actor?: string | null;
}): Promise<BuyerWorkbookDetail> {
  const actor = cleanText(input.actor) ?? 'system';
  await prisma.$transaction(async (tx) => {
    await ensureCard(workbookId, cardId, tx);
    for (const row of input.rows) {
      const dimensionCode = cleanText(row.dimensionCode);
      const valueCode = cleanText(row.valueCode);
      if (!dimensionCode || !valueCode) continue;
      await tx.$executeRawUnsafe(
        `
          INSERT INTO app.buyer_purchase_attribute_plan (
            workbook_id,
            card_id,
            dimension_code,
            dimension_label,
            value_code,
            value_label,
            planned_style_count,
            planned_units,
            notes,
            updated_by,
            updated_at
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::int, $8::int, $9, $10, CURRENT_TIMESTAMP)
          ON CONFLICT (card_id, dimension_code, value_code) DO UPDATE SET
            dimension_label = EXCLUDED.dimension_label,
            value_label = EXCLUDED.value_label,
            planned_style_count = EXCLUDED.planned_style_count,
            planned_units = EXCLUDED.planned_units,
            notes = EXCLUDED.notes,
            updated_by = EXCLUDED.updated_by,
            updated_at = CURRENT_TIMESTAMP
        `,
        workbookId,
        cardId,
        dimensionCode,
        cleanText(row.dimensionLabel) ?? dimensionCode,
        valueCode,
        cleanText(row.valueLabel) ?? valueCode,
        Math.max(0, Math.trunc(row.plannedStyleCount ?? 0)),
        Math.max(0, Math.trunc(row.plannedUnits ?? 0)),
        row.notes ?? null,
        actor,
      );
    }
    await audit(tx, workbookId, 'attribute_plan_update', actor, null, { rowCount: input.rows.length });
  });
  return getBuyerWorkbook(workbookId);
}

export async function addCarryoverLine(workbookId: string, cardId: string, input: {
  storeId?: number | null;
  skuCode: string;
  skuDescription?: string | null;
  color?: string | null;
  sizeCells?: CarryoverLine['sizeCells'];
  totalQuantity?: number | null;
  notes?: string | null;
  actor?: string | null;
}): Promise<BuyerWorkbookDetail> {
  const skuCode = cleanText(input.skuCode)?.toUpperCase();
  if (!skuCode) throw new BuyerWorkbookServiceError(400, 'SKU_REQUIRED', 'SKU code is required.');
  const sizeCells = input.sizeCells ?? [];
  const totalQuantity = input.totalQuantity == null
    ? sizeCells.reduce((sum, cell) => sum + Math.max(0, Math.trunc(Number(cell.quantity ?? 0))), 0)
    : Math.max(0, Math.trunc(input.totalQuantity));
  const actor = cleanText(input.actor) ?? 'system';

  await prisma.$transaction(async (tx) => {
    await ensureCard(workbookId, cardId, tx);
    const skuRows = await tx.$queryRawUnsafe<Array<{ id: string | null; description: string | null; color: string | null }>>(
      `
        SELECT
          id::text,
          COALESCE(description_web, description_rics, style_color) AS description,
          style_color AS color
        FROM app.sku
        WHERE UPPER(COALESCE(code, provisional_code)) = $1
        LIMIT 1
      `,
      skuCode,
    );
    const sku = skuRows[0];
    const inserted = await tx.$queryRawUnsafe<CarryoverRow[]>(
      `
        INSERT INTO app.buyer_purchase_carryover_line (
          workbook_id,
          card_id,
          store_id,
          sku_id,
          sku_code,
          sku_description,
          color,
          size_cells,
          total_quantity,
          source,
          notes
        )
        VALUES ($1::uuid, $2::uuid, $3::int, $4::uuid, $5, $6, $7, $8::jsonb, $9::int, 'SEED', $10)
        RETURNING
          id::text,
          workbook_id::text AS "workbookId",
          card_id::text AS "cardId",
          store_id AS "storeId",
          sku_id::text AS "skuId",
          sku_code AS "skuCode",
          sku_description AS "skuDescription",
          color,
          size_cells AS "sizeCells",
          total_quantity AS "totalQuantity",
          source,
          unavailable,
          unavailable_reason AS "unavailableReason",
          replacement_style_id::text AS "replacementStyleId",
          carryover_candidate_id::text AS "carryoverCandidateId",
          notes
      `,
      workbookId,
      cardId,
      input.storeId ?? null,
      sku?.id ?? null,
      skuCode,
      cleanText(input.skuDescription) ?? sku?.description ?? null,
      cleanText(input.color) ?? sku?.color ?? null,
      JSON.stringify(sizeCells),
      totalQuantity,
      cleanText(input.notes),
    );
    await audit(tx, workbookId, 'carryover_add', actor, null, normalizeCarryover(inserted[0]));
  });
  return getBuyerWorkbook(workbookId);
}

export async function flagCarryoverUnavailable(workbookId: string, lineId: string, input: {
  reason: string;
  actor?: string | null;
}): Promise<BuyerWorkbookDetail> {
  const reason = cleanText(input.reason);
  if (!reason) throw new BuyerWorkbookServiceError(400, 'REASON_REQUIRED', 'Unavailable reason is required.');
  const actor = cleanText(input.actor) ?? 'system';

  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<CarryoverRow[]>(
      `
        SELECT
          id::text,
          workbook_id::text AS "workbookId",
          card_id::text AS "cardId",
          store_id AS "storeId",
          sku_id::text AS "skuId",
          sku_code AS "skuCode",
          sku_description AS "skuDescription",
          color,
          size_cells AS "sizeCells",
          total_quantity AS "totalQuantity",
          source,
          unavailable,
          unavailable_reason AS "unavailableReason",
          replacement_style_id::text AS "replacementStyleId",
          carryover_candidate_id::text AS "carryoverCandidateId",
          notes
        FROM app.buyer_purchase_carryover_line
        WHERE workbook_id = $1::uuid
          AND id = $2::uuid
        LIMIT 1
      `,
      workbookId,
      lineId,
    );
    const beforeRow = rows[0];
    if (!beforeRow) throw new BuyerWorkbookServiceError(404, 'CARRYOVER_NOT_FOUND', 'Carryover line not found.');
    const before = normalizeCarryover(beforeRow);

    const styleRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `
        INSERT INTO app.buyer_purchase_planned_style (
          workbook_id,
          card_id,
          replacement_for_carryover_line_id,
          replacement_for_carryover_candidate_id,
          working_style,
          description,
          color,
          target_new_sku_count,
          target_units,
          notes
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, 1, $8::int, $9)
        RETURNING id::text
      `,
      workbookId,
      before.cardId,
      lineId,
      before.carryoverCandidateId,
      `Replacement for ${before.skuCode}`,
      before.skuDescription,
      before.color,
      before.totalQuantity,
      reason,
    );
    const replacementStyleId = styleRows[0]?.id;
    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_carryover_line
        SET
          unavailable = true,
          unavailable_reason = $3,
          replacement_style_id = $4::uuid,
          updated_at = CURRENT_TIMESTAMP
        WHERE workbook_id = $1::uuid
          AND id = $2::uuid
      `,
      workbookId,
      lineId,
      reason,
      replacementStyleId,
    );
    if (before.carryoverCandidateId) {
      await tx.$executeRawUnsafe(
        `
          UPDATE app.buyer_purchase_carryover_candidate
          SET availability = 'UNAVAILABLE',
              unavailable_reason = $3,
              replacement_style_id = $4::uuid,
              updated_at = CURRENT_TIMESTAMP
          WHERE workbook_id = $1::uuid
            AND id = $2::uuid
        `,
        workbookId,
        before.carryoverCandidateId,
        reason,
        replacementStyleId,
      );
    }
    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_category_card
        SET status = CASE
              WHEN status IN ('NOT_STARTED', 'HISTORY_REVIEWED', 'CARRYOVER_REVIEW', 'CARRYOVERS') THEN 'NEW_STYLES'
              ELSE status
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      before.cardId,
    );
    await audit(tx, workbookId, 'carryover_unavailable', actor, before, { ...before, unavailable: true, replacementStyleId });
  });
  return getBuyerWorkbook(workbookId);
}

export async function copySeedModel(workbookId: string, cardId: string, input: {
  targetStoreIds?: number[];
  actor?: string | null;
} = {}): Promise<BuyerWorkbookDetail> {
  const actor = cleanText(input.actor) ?? 'system';
  await prisma.$transaction(async (tx) => {
    const card = normalizeCard(await ensureCard(workbookId, cardId, tx));
    const targetStores = uniqueSorted((input.targetStoreIds?.length ? input.targetStoreIds : card.targetStoreIds)
      .filter((storeId) => storeId !== card.seedStoreId));
    await ensureStoreIds(targetStores, tx);

    const seedLines = await tx.$queryRawUnsafe<CarryoverRow[]>(
      `
        SELECT
          id::text,
          workbook_id::text AS "workbookId",
          card_id::text AS "cardId",
          store_id AS "storeId",
          sku_id::text AS "skuId",
          sku_code AS "skuCode",
          sku_description AS "skuDescription",
          color,
          size_cells AS "sizeCells",
          total_quantity AS "totalQuantity",
          source,
          unavailable,
          unavailable_reason AS "unavailableReason",
          replacement_style_id::text AS "replacementStyleId",
          carryover_candidate_id::text AS "carryoverCandidateId",
          notes
        FROM app.buyer_purchase_carryover_line
        WHERE workbook_id = $1::uuid
          AND card_id = $2::uuid
          AND (store_id = $3::int OR store_id IS NULL)
          AND unavailable = false
        ORDER BY sku_code
      `,
      workbookId,
      cardId,
      card.seedStoreId,
    );

    await tx.$executeRawUnsafe(
      `
        DELETE FROM app.buyer_purchase_carryover_line
        WHERE workbook_id = $1::uuid
          AND card_id = $2::uuid
          AND source = 'COPY'
          AND store_id = ANY($3::int[])
      `,
      workbookId,
      cardId,
      targetStores,
    );
    for (const storeId of targetStores) {
      for (const seed of seedLines) {
        await tx.$executeRawUnsafe(
          `
            INSERT INTO app.buyer_purchase_carryover_line (
              workbook_id,
              card_id,
              store_id,
              sku_id,
              sku_code,
              sku_description,
              color,
              size_cells,
              total_quantity,
              source,
              carryover_candidate_id,
              notes
            )
            VALUES ($1::uuid, $2::uuid, $3::int, $4::uuid, $5, $6, $7, $8::jsonb, $9::int, 'COPY', $10::uuid, $11)
          `,
          workbookId,
          cardId,
          storeId,
          seed.skuId,
          seed.skuCode,
          seed.skuDescription,
          seed.color,
          JSON.stringify(jsonArray(seed.sizeCells)),
          seed.totalQuantity,
          seed.carryoverCandidateId,
          seed.notes,
        );
      }
    }
    await insertStorePlans(tx, {
      workbookId,
      cardId,
      storeIds: targetStores,
      copiedFromStoreId: card.seedStoreId,
      targetNewSkuCount: card.targetNewSkuCount,
      targetCarryoverSkuCount: card.targetCarryoverSkuCount,
      status: 'COPIED',
    });
    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_category_card
        SET status = CASE WHEN status IN ('NOT_STARTED', 'HISTORY_REVIEWED', 'CARRYOVER_REVIEW') THEN 'CARRYOVERS' ELSE status END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      cardId,
    );
    await audit(tx, workbookId, 'seed_model_copy', actor, null, {
      cardId,
      seedStoreId: card.seedStoreId,
      targetStores,
      copiedLineCount: seedLines.length,
    });
  });
  return getBuyerWorkbook(workbookId);
}

export async function addPlannedStyle(workbookId: string, cardId: string, input: {
  replacementForCarryoverLineId?: string | null;
  replacementForCarryoverCandidateId?: string | null;
  vendorCode?: string | null;
  vendorName?: string | null;
  workingStyle?: string | null;
  description?: string | null;
  color?: string | null;
  colorFamily?: string | null;
  attributes?: Record<string, unknown>;
  quotedUnitCost?: number | null;
  targetNewSkuCount?: number | null;
  targetUnits?: number | null;
  notes?: string | null;
  actor?: string | null;
}): Promise<BuyerWorkbookDetail> {
  const actor = cleanText(input.actor) ?? 'system';
  await prisma.$transaction(async (tx) => {
    await ensureCard(workbookId, cardId, tx);
    const inserted = await tx.$queryRawUnsafe<PlannedStyleRow[]>(
      `
        INSERT INTO app.buyer_purchase_planned_style (
          workbook_id,
          card_id,
          replacement_for_carryover_line_id,
          replacement_for_carryover_candidate_id,
          vendor_code,
          vendor_name,
          working_style,
          description,
          color,
          color_family,
          attributes_json,
          quoted_unit_cost,
          target_new_sku_count,
          target_units,
          notes
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11::jsonb,
          $12::numeric,
          $13::int,
          $14::int,
          $15
        )
        RETURNING
          id::text,
          workbook_id::text AS "workbookId",
          card_id::text AS "cardId",
          replacement_for_carryover_line_id::text AS "replacementForCarryoverLineId",
          replacement_for_carryover_candidate_id::text AS "replacementForCarryoverCandidateId",
          vendor_code AS "vendorCode",
          vendor_name AS "vendorName",
          working_style AS "workingStyle",
          description,
          color,
          color_family AS "colorFamily",
          attributes_json AS "attributesJson",
          quoted_unit_cost AS "quotedUnitCost",
          target_new_sku_count AS "targetNewSkuCount",
          target_units AS "targetUnits",
          status,
          linked_sku_id::text AS "linkedSkuId",
          linked_sku_code AS "linkedSkuCode",
          notes
      `,
      workbookId,
      cardId,
      input.replacementForCarryoverLineId ?? null,
      input.replacementForCarryoverCandidateId ?? null,
      cleanText(input.vendorCode)?.toUpperCase(),
      cleanText(input.vendorName),
      cleanText(input.workingStyle),
      cleanText(input.description),
      cleanText(input.color),
      cleanText(input.colorFamily),
      JSON.stringify(input.attributes ?? {}),
      input.quotedUnitCost ?? null,
      Math.max(0, Math.trunc(input.targetNewSkuCount ?? 1)),
      Math.max(0, Math.trunc(input.targetUnits ?? 0)),
      cleanText(input.notes),
    );
    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_category_card
        SET status = CASE WHEN status IN ('NOT_STARTED', 'HISTORY_REVIEWED', 'CARRYOVER_REVIEW', 'CARRYOVERS') THEN 'NEW_STYLES' ELSE status END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      cardId,
    );
    await audit(tx, workbookId, 'planned_style_add', actor, null, normalizeStyle(inserted[0]));
  });
  return getBuyerWorkbook(workbookId);
}

export async function updatePlannedStyle(workbookId: string, styleId: string, input: {
  vendorCode?: string | null;
  vendorName?: string | null;
  workingStyle?: string | null;
  description?: string | null;
  color?: string | null;
  colorFamily?: string | null;
  attributes?: Record<string, unknown>;
  quotedUnitCost?: number | null;
  targetNewSkuCount?: number | null;
  targetUnits?: number | null;
  status?: PlannedStyleStatus;
  linkedSkuId?: string | null;
  linkedSkuCode?: string | null;
  notes?: string | null;
  actor?: string | null;
}): Promise<BuyerWorkbookDetail> {
  const actor = cleanText(input.actor) ?? 'system';
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<PlannedStyleRow[]>(
      `
        SELECT
          id::text,
          workbook_id::text AS "workbookId",
          card_id::text AS "cardId",
          replacement_for_carryover_line_id::text AS "replacementForCarryoverLineId",
          replacement_for_carryover_candidate_id::text AS "replacementForCarryoverCandidateId",
          vendor_code AS "vendorCode",
          vendor_name AS "vendorName",
          working_style AS "workingStyle",
          description,
          color,
          color_family AS "colorFamily",
          attributes_json AS "attributesJson",
          quoted_unit_cost AS "quotedUnitCost",
          target_new_sku_count AS "targetNewSkuCount",
          target_units AS "targetUnits",
          status,
          linked_sku_id::text AS "linkedSkuId",
          linked_sku_code AS "linkedSkuCode",
          notes
        FROM app.buyer_purchase_planned_style
        WHERE workbook_id = $1::uuid
          AND id = $2::uuid
        LIMIT 1
      `,
      workbookId,
      styleId,
    );
    const before = rows[0] ? normalizeStyle(rows[0]) : null;
    if (!before) throw new BuyerWorkbookServiceError(404, 'STYLE_NOT_FOUND', 'Planned style not found.');

    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_planned_style
        SET
          vendor_code = CASE WHEN $3::boolean THEN $4 ELSE vendor_code END,
          vendor_name = CASE WHEN $5::boolean THEN $6 ELSE vendor_name END,
          working_style = CASE WHEN $7::boolean THEN $8 ELSE working_style END,
          description = CASE WHEN $9::boolean THEN $10 ELSE description END,
          color = CASE WHEN $11::boolean THEN $12 ELSE color END,
          color_family = CASE WHEN $13::boolean THEN $14 ELSE color_family END,
          attributes_json = CASE WHEN $15::boolean THEN $16::jsonb ELSE attributes_json END,
          quoted_unit_cost = CASE WHEN $17::boolean THEN $18::numeric ELSE quoted_unit_cost END,
          target_new_sku_count = COALESCE($19::int, target_new_sku_count),
          target_units = COALESCE($20::int, target_units),
          status = COALESCE($21::text, status),
          linked_sku_id = CASE WHEN $22::boolean THEN $23::uuid ELSE linked_sku_id END,
          linked_sku_code = CASE WHEN $24::boolean THEN $25 ELSE linked_sku_code END,
          notes = CASE WHEN $26::boolean THEN $27 ELSE notes END,
          updated_at = CURRENT_TIMESTAMP
        WHERE workbook_id = $1::uuid
          AND id = $2::uuid
      `,
      workbookId,
      styleId,
      input.vendorCode !== undefined,
      cleanText(input.vendorCode)?.toUpperCase() ?? null,
      input.vendorName !== undefined,
      cleanText(input.vendorName),
      input.workingStyle !== undefined,
      cleanText(input.workingStyle),
      input.description !== undefined,
      cleanText(input.description),
      input.color !== undefined,
      cleanText(input.color),
      input.colorFamily !== undefined,
      cleanText(input.colorFamily),
      input.attributes !== undefined,
      JSON.stringify(input.attributes ?? {}),
      input.quotedUnitCost !== undefined,
      input.quotedUnitCost ?? null,
      input.targetNewSkuCount == null ? null : Math.max(0, Math.trunc(input.targetNewSkuCount)),
      input.targetUnits == null ? null : Math.max(0, Math.trunc(input.targetUnits)),
      input.status ?? null,
      input.linkedSkuId !== undefined,
      input.linkedSkuId ?? null,
      input.linkedSkuCode !== undefined,
      cleanText(input.linkedSkuCode)?.toUpperCase() ?? null,
      input.notes !== undefined,
      input.notes ?? null,
    );
    await audit(tx, workbookId, 'planned_style_update', actor, before, { styleId, patch: input });
  });
  return getBuyerWorkbook(workbookId);
}

export async function deletePlannedStyle(workbookId: string, styleId: string, actorInput?: string | null): Promise<BuyerWorkbookDetail> {
  const actor = cleanText(actorInput) ?? 'system';
  await prisma.$transaction(async (tx) => {
    const before = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `
        SELECT id::text
        FROM app.buyer_purchase_planned_style
        WHERE workbook_id = $1::uuid
          AND id = $2::uuid
      `,
      workbookId,
      styleId,
    );
    if (!before[0]) throw new BuyerWorkbookServiceError(404, 'STYLE_NOT_FOUND', 'Planned style not found.');
    await tx.$executeRawUnsafe(
      `
        DELETE FROM app.buyer_purchase_planned_style
        WHERE workbook_id = $1::uuid
          AND id = $2::uuid
      `,
      workbookId,
      styleId,
    );
    await audit(tx, workbookId, 'planned_style_delete', actor, { styleId }, null);
  });
  return getBuyerWorkbook(workbookId);
}

export async function linkPurchaseOrder(workbookId: string, input: {
  cardId: string;
  carryoverLineId?: string | null;
  plannedStyleId?: string | null;
  poId: string;
  poLineId?: string | null;
  quantity?: number | null;
  notes?: string | null;
  linkedBy?: string | null;
}): Promise<BuyerWorkbookDetail> {
  if (!input.carryoverLineId && !input.plannedStyleId) {
    throw new BuyerWorkbookServiceError(400, 'LINK_TARGET_REQUIRED', 'Select a carryover line or planned style to link.');
  }
  const actor = cleanText(input.linkedBy) ?? 'system';
  await prisma.$transaction(async (tx) => {
    await ensureCard(workbookId, input.cardId, tx);
    const poRows = await tx.$queryRawUnsafe<Array<{ poNumber: string }>>(
      `
        SELECT po_number AS "poNumber"
        FROM app.purchase_order
        WHERE id = $1::uuid
        LIMIT 1
      `,
      input.poId,
    );
    const poNumber = poRows[0]?.poNumber;
    if (!poNumber) throw new BuyerWorkbookServiceError(404, 'PO_NOT_FOUND', 'Purchase order not found.');
    await tx.$executeRawUnsafe(
      `
        INSERT INTO app.buyer_purchase_po_link (
          workbook_id,
          card_id,
          carryover_line_id,
          planned_style_id,
          po_id,
          po_number,
          po_line_id,
          quantity,
          notes,
          linked_by
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7::uuid, $8::int, $9, $10)
      `,
      workbookId,
      input.cardId,
      input.carryoverLineId ?? null,
      input.plannedStyleId ?? null,
      input.poId,
      poNumber,
      input.poLineId ?? null,
      Math.max(0, Math.trunc(input.quantity ?? 0)),
      cleanText(input.notes),
      actor,
    );
    if (input.plannedStyleId) {
      await tx.$executeRawUnsafe(
        `
          UPDATE app.buyer_purchase_planned_style
          SET status = 'LINKED',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1::uuid
        `,
        input.plannedStyleId,
      );
    }
    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_category_card
        SET status = CASE WHEN status <> 'COMPLETE' THEN 'PO_LINKED' ELSE status END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      input.cardId,
    );
    await audit(tx, workbookId, 'po_link_add', actor, null, { ...input, poNumber });
  });
  return getBuyerWorkbook(workbookId);
}

export async function unlinkPurchaseOrder(workbookId: string, linkId: string, actorInput?: string | null): Promise<BuyerWorkbookDetail> {
  const actor = cleanText(actorInput) ?? 'system';
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<PoLinkRow[]>(
      `
        SELECT
          id::text,
          workbook_id::text AS "workbookId",
          card_id::text AS "cardId",
          carryover_line_id::text AS "carryoverLineId",
          planned_style_id::text AS "plannedStyleId",
          po_id::text AS "poId",
          po_number AS "poNumber",
          po_line_id::text AS "poLineId",
          quantity,
          notes,
          linked_by AS "linkedBy",
          linked_at AS "linkedAt"
        FROM app.buyer_purchase_po_link
        WHERE workbook_id = $1::uuid
          AND id = $2::uuid
        LIMIT 1
      `,
      workbookId,
      linkId,
    );
    const before = rows[0] ? normalizePoLink(rows[0]) : null;
    if (!before) throw new BuyerWorkbookServiceError(404, 'PO_LINK_NOT_FOUND', 'PO link not found.');
    await tx.$executeRawUnsafe(
      `
        DELETE FROM app.buyer_purchase_po_link
        WHERE workbook_id = $1::uuid
          AND id = $2::uuid
      `,
      workbookId,
      linkId,
    );
    await audit(tx, workbookId, 'po_link_delete', actor, before, null);
  });
  return getBuyerWorkbook(workbookId);
}

export async function archiveBuyerWorkbook(workbookId: string, actorInput?: string | null): Promise<BuyerWorkbookDetail> {
  const actor = cleanText(actorInput) ?? 'system';
  await prisma.$transaction(async (tx) => {
    const before = normalizeWorkbook(await loadWorkbookRow(workbookId, tx));
    await tx.$executeRawUnsafe(
      `
        UPDATE app.buyer_purchase_workbook
        SET status = 'ARCHIVED',
            archived_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      workbookId,
    );
    await audit(tx, workbookId, 'workbook_archive', actor, before, { ...before, status: 'ARCHIVED' });
  });
  return getBuyerWorkbook(workbookId);
}

export async function listStoreCategoryCarrying(categoryNumber: number): Promise<StoreCategoryCarryingRow[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    storeId: number;
    storeLabel: string;
    categoryNumber: number;
    categoryLabel: string;
    carries: boolean | null;
    suggestedCarries: boolean | null;
    stockSkuCount: unknown;
    stockUnits: unknown;
    modelSkuCount: unknown;
    modelUnits: unknown;
    source: StoreCategoryCarryingRow['source'] | null;
    chainCode: string | null;
    note: string | null;
    updatedBy: string | null;
    updatedAt: Date | string | null;
  }>>(
    `
      WITH eligible_sku AS (
        SELECT id
        FROM app.sku
        WHERE category_number = $1::int
          AND sku_state <> 'DISCONTINUED'
          AND COALESCE(NULLIF(BTRIM(code), ''), NULLIF(BTRIM(provisional_code), '')) IS NOT NULL
          AND COALESCE(NULLIF(BTRIM(code), ''), NULLIF(BTRIM(provisional_code), '')) NOT LIKE '|%'
      ),
      stock_signal AS (
        SELECT
          sl.store_id,
          COUNT(DISTINCT sl.sku_id)::int AS stock_sku_count,
          SUM(GREATEST(COALESCE(sl.on_hand, 0), 0))::int AS stock_units
        FROM app.stock_level sl
        JOIN eligible_sku sku ON sku.id = sl.sku_id
        WHERE COALESCE(sl.on_hand, 0) > 0
        GROUP BY sl.store_id
      ),
      target_model AS (
        SELECT
          rt.store_id,
          rt.sku_id,
          SUM(GREATEST(COALESCE(rt.model_qty, 0), 0))::int AS model_units
        FROM app.replenishment_target rt
        JOIN eligible_sku sku ON sku.id = rt.sku_id
        WHERE COALESCE(rt.model_qty, 0) > 0
        GROUP BY rt.store_id, rt.sku_id
      ),
      history_model AS (
        SELECT
          h.store_id,
          h.sku_id,
          MAX(GREATEST(COALESCE(h.model_qty, 0), 0))::int AS model_units
        FROM app.inventory_history_snapshot h
        JOIN eligible_sku sku ON sku.id = h.sku_id
        WHERE COALESCE(h.model_qty, 0) > 0
        GROUP BY h.store_id, h.sku_id
      ),
      model_signal AS (
        SELECT
          COALESCE(tm.store_id, hm.store_id) AS store_id,
          COALESCE(tm.sku_id, hm.sku_id) AS sku_id,
          GREATEST(COALESCE(tm.model_units, 0), COALESCE(hm.model_units, 0)) AS model_units
        FROM target_model tm
        FULL OUTER JOIN history_model hm
          ON hm.store_id = tm.store_id
         AND hm.sku_id = tm.sku_id
      ),
      model_rollup AS (
        SELECT
          store_id,
          COUNT(DISTINCT sku_id)::int AS model_sku_count,
          SUM(model_units)::int AS model_units
        FROM model_signal
        GROUP BY store_id
      )
      SELECT
        s.number AS "storeId",
        s.number::text || ' - ' || s."desc" AS "storeLabel",
        c.number AS "categoryNumber",
        c.number::text || ' - ' || c."desc" AS "categoryLabel",
        COALESCE(sc.carries, false) AS carries,
        (COALESCE(stock.stock_units, 0) > 0 OR COALESCE(model.model_units, 0) > 0) AS "suggestedCarries",
        COALESCE(stock.stock_sku_count, 0)::int AS "stockSkuCount",
        COALESCE(stock.stock_units, 0)::int AS "stockUnits",
        COALESCE(model.model_sku_count, 0)::int AS "modelSkuCount",
        COALESCE(model.model_units, 0)::int AS "modelUnits",
        COALESCE(sc.source, 'SEED') AS source,
        sc.chain_code AS "chainCode",
        sc.note,
        COALESCE(sc.updated_by, 'system') AS "updatedBy",
        sc.updated_at AS "updatedAt"
      FROM app.store_master s
      CROSS JOIN app.taxonomy_category c
      LEFT JOIN app.store_category_carrying sc
        ON sc.store_id = s.number
       AND sc.category_number = c.number
      LEFT JOIN stock_signal stock
        ON stock.store_id = s.number
      LEFT JOIN model_rollup model
        ON model.store_id = s.number
      WHERE c.number = $1::int
      ORDER BY s.number
    `,
    categoryNumber,
  );
  return rows.map((row) => ({
    storeId: Number(row.storeId),
    storeLabel: row.storeLabel,
    categoryNumber: Number(row.categoryNumber),
    categoryLabel: row.categoryLabel,
    carries: Boolean(row.carries),
    suggestedCarries: Boolean(row.suggestedCarries),
    stockSkuCount: Math.round(toNumber(row.stockSkuCount)),
    stockUnits: Math.round(toNumber(row.stockUnits)),
    modelSkuCount: Math.round(toNumber(row.modelSkuCount)),
    modelUnits: Math.round(toNumber(row.modelUnits)),
    source: row.source ?? 'SEED',
    chainCode: row.chainCode,
    note: row.note,
    updatedBy: row.updatedBy ?? 'system',
    updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
  }));
}

export async function bulkUpdateStoreCategoryCarrying(input: {
  categoryNumber: number;
  storeIds?: number[];
  chainCode?: string | null;
  carries: boolean;
  exceptions?: Array<{ storeId: number; carries: boolean; note?: string | null }>;
  note?: string | null;
  updatedBy?: string | null;
}): Promise<StoreCategoryCarryingRow[]> {
  const actor = cleanText(input.updatedBy) ?? 'system';
  const explicitStoreIds = uniqueSorted(input.storeIds ?? []);
  let storeIds = explicitStoreIds;
  if (storeIds.length === 0 && cleanText(input.chainCode)) {
    const rows = await prisma.$queryRawUnsafe<Array<{ storeId: unknown }>>(
      `
        SELECT store_number AS "storeId"
        FROM app.store_group_member
        WHERE group_code = $1
        ORDER BY store_number
      `,
      cleanText(input.chainCode),
    );
    storeIds = rows.map((row) => Number(row.storeId)).filter((storeId) => Number.isInteger(storeId));
  }
  if (storeIds.length === 0) {
    throw new BuyerWorkbookServiceError(400, 'STORE_REQUIRED', 'Select stores or a store chain.');
  }
  await ensureStoreIds(storeIds);
  const exceptionMap = new Map((input.exceptions ?? []).map((item) => [item.storeId, item]));

  await prisma.$transaction(async (tx) => {
    for (const storeId of storeIds) {
      const exception = exceptionMap.get(storeId);
      await tx.$executeRawUnsafe(
        `
          INSERT INTO app.store_category_carrying (
            store_id,
            category_number,
            carries,
            source,
            chain_code,
            note,
            updated_by,
            updated_at
          )
          VALUES ($1::int, $2::int, $3::boolean, $4, $5, $6, $7, CURRENT_TIMESTAMP)
          ON CONFLICT (store_id, category_number) DO UPDATE SET
            carries = EXCLUDED.carries,
            source = EXCLUDED.source,
            chain_code = EXCLUDED.chain_code,
            note = EXCLUDED.note,
            updated_by = EXCLUDED.updated_by,
            updated_at = CURRENT_TIMESTAMP
        `,
        storeId,
        input.categoryNumber,
        exception?.carries ?? input.carries,
        exception ? 'MANUAL' : (cleanText(input.chainCode) ? 'CHAIN' : 'MANUAL'),
        cleanText(input.chainCode),
        exception?.note ?? cleanText(input.note),
        actor,
      );
    }
  });
  return listStoreCategoryCarrying(input.categoryNumber);
}
