import { Prisma } from '../prismaClient';
import { prisma } from '../db/prisma';
import type { TransferPreviewException } from '../models/transferRuns';
import type {
  BalancingTransferCriteriaV2,
  BalancingTransferPreviewComparisonV2,
  BalancingTransferPreviewLineV2,
  BalancingTransferPreviewRecordV2,
  BalancingTransferPreviewSummaryV2,
  CommitTransferRunV2Result,
  CreateBalancingTransferRunV2Input,
} from '../models/transferRunsV2';
import { materializeTransfersFromPreview } from './transferRunShared';
import {
  createBalancingTransferRun,
  TransferRunServiceError,
} from './transferRunService';
import { buildBalancingPreviewV2 } from './transferRunV2/buildPreview';
import { loadBalancingFactsV2 } from './transferRunV2/loadFacts';

interface StoredBalancingRunV2Row {
  id: string;
  status: 'PREVIEWED' | 'COMMITTED' | 'CANCELLED' | 'QUEUED';
  goalPreset: 'DAILY_RESCUE' | 'WEEKLY_BALANCE' | 'SEASONAL_CONSOLIDATION';
  balancingMethod: 'OVER_UNDER_MODELS' | 'WITHOUT_MODELS' | 'WITHOUT_CONSIDERING_MODELS';
  performanceMetric: 'ROI' | 'TURNS' | 'SELL_THRU';
  salesPeriod: 'MONTH' | 'SEASON' | 'YEAR';
  sortOrder: 'SKU' | 'VENDOR' | 'CATEGORY' | 'LOCATION';
  tieBreakKind: 'ABSOLUTE' | 'PERCENT';
  tieBreakValue: Prisma.Decimal;
  transferDoublesToLowerPriority: boolean;
  stripStoresBelowSizeCount: number | null;
  inTransitPos: boolean;
  allowLowConfidenceMoves: boolean;
  cooldownDays: number;
  protectDaysOverride: number | null;
  requestedBy: string;
  createdAt: Date;
  previewedAt: Date | null;
  committedAt: Date | null;
  generatedTransferIds: string[];
  criteriaJson: Prisma.JsonValue;
  summaryJson: Prisma.JsonValue;
  linesJson: Prisma.JsonValue;
  exceptionsJson: Prisma.JsonValue | null;
  comparisonJson: Prisma.JsonValue | null;
}

function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asArray<T>(value: Prisma.JsonValue | null | undefined): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asObject<T>(value: Prisma.JsonValue | null | undefined, fallback: T): T {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : fallback;
}

function buildStoredRecord(row: StoredBalancingRunV2Row): BalancingTransferPreviewRecordV2 {
  return {
    id: row.id,
    status: row.status === 'QUEUED' ? 'PREVIEWED' : row.status,
    goalPreset: row.goalPreset,
    balancingMethod: row.balancingMethod,
    performanceMetric: row.performanceMetric,
    salesPeriod: row.salesPeriod,
    sortOrder: (row.sortOrder === 'LOCATION' ? 'SKU' : row.sortOrder) as BalancingTransferPreviewRecordV2['sortOrder'],
    tieBreakKind: row.tieBreakKind,
    tieBreakValue: toNumber(row.tieBreakValue),
    transferDoublesToLowerPriority: row.transferDoublesToLowerPriority,
    stripStoresBelowSizeCount: row.stripStoresBelowSizeCount,
    inTransitPos: row.inTransitPos,
    allowLowConfidenceMoves: row.allowLowConfidenceMoves,
    cooldownDays: row.cooldownDays,
    protectDaysOverride: row.protectDaysOverride,
    criteria: asObject<BalancingTransferCriteriaV2>(row.criteriaJson, {}),
    summary: asObject<BalancingTransferPreviewSummaryV2>(row.summaryJson, {
      transferCount: 0,
      skuCount: 0,
      storePairCount: 0,
      totalUnits: 0,
      exceptionCount: 0,
      passBreakdown: [],
    }),
    lines: asArray<BalancingTransferPreviewLineV2>(row.linesJson),
    exceptions: asArray<TransferPreviewException>(row.exceptionsJson),
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    previewedAt: row.previewedAt?.toISOString() ?? null,
    committedAt: row.committedAt?.toISOString() ?? null,
    generatedTransferIds: row.generatedTransferIds,
    comparison: row.comparisonJson == null
      ? null
      : asObject<BalancingTransferPreviewComparisonV2 | null>(row.comparisonJson, null),
  };
}

function createSourceConflictError(line: { skuCode: string; fromStoreId: number }): TransferRunServiceError {
  return new TransferRunServiceError(
    409,
    'TRANSFER_SOURCE_CONFLICT',
    `Source stock changed before commit for ${line.skuCode} at store ${line.fromStoreId}. Recompute the preview.`,
  );
}

function buildLegacyComparisonInput(input: CreateBalancingTransferRunV2Input) {
  return {
    balancingMethod: input.balancingMethod,
    performanceMetric: input.performanceMetric,
    salesPeriod: input.salesPeriod,
    sortOrder: input.sortOrder ?? 'SKU',
    tieBreakKind: input.tieBreakKind,
    tieBreakValue: input.tieBreakValue,
    transferDoublesToLowerPriority: Boolean(input.transferDoublesToLowerPriority),
    stripStoresBelowSizeCount: input.stripStoresBelowSizeCount ?? null,
    inTransitPos: Boolean(input.inTransitPos),
    criteria: {
      storeIds: input.criteria?.storeIds ?? [],
      vendorCodes: input.criteria?.vendorCodes ?? [],
      categoryMin: input.criteria?.categoryMin ?? null,
      categoryMax: input.criteria?.categoryMax ?? null,
      seasons: input.criteria?.seasons ?? [],
      styleColors: input.criteria?.styleColors ?? [],
      skuCodes: input.criteria?.skuCodes ?? [],
      groupCodes: input.criteria?.groupCodes ?? [],
      keywords: input.criteria?.keywords ?? [],
      limit: input.criteria?.limit,
      includeOriginalRetailOnly: Boolean(input.criteria?.includeOriginalRetailOnly),
      includeMarkdownOnly: Boolean(input.criteria?.includeMarkdownOnly),
      includePerksOnly: Boolean(input.criteria?.includePerksOnly),
    },
  } as const;
}

export async function createBalancingTransferRunV2(
  input: CreateBalancingTransferRunV2Input,
  actorOverride?: string | null,
): Promise<BalancingTransferPreviewRecordV2> {
  const requestedBy = actorOverride?.trim() || 'system';
  if (input.criteria?.includeOriginalRetailOnly && input.criteria?.includeMarkdownOnly) {
    throw new TransferRunServiceError(
      422,
      'BALANCING_PRICE_FILTER_CONFLICT',
      'Select either original retail only or markdown only, not both.',
    );
  }

  const facts = await loadBalancingFactsV2(input);
  if (facts.input.criteria.storeIds.length < 2) {
    throw new TransferRunServiceError(422, 'BALANCING_STORES_REQUIRED', 'Select at least two stores.');
  }

  const preview = buildBalancingPreviewV2(facts);
  let comparison: BalancingTransferPreviewComparisonV2 | null = null;
  let comparedLegacyRunId: string | undefined;
  try {
    const legacyPreview = await createBalancingTransferRun(buildLegacyComparisonInput(input), requestedBy);
    comparison = {
      legacyRunId: legacyPreview.id,
      legacyTransferCount: legacyPreview.summary.transferCount,
      legacyTotalUnits: legacyPreview.summary.totalUnits,
      deltaTransferCount: preview.summary.transferCount - legacyPreview.summary.transferCount,
      deltaUnits: preview.summary.totalUnits - legacyPreview.summary.totalUnits,
    };
    comparedLegacyRunId = legacyPreview.id;
  } catch {
    preview.exceptions.push({
      code: 'BALANCING_V2_COMPARISON_UNAVAILABLE',
      severity: 'warning',
      message: 'Legacy comparison could not be generated for this v2 preview.',
    });
    preview.summary.exceptionCount = preview.exceptions.length;
  }

  const previewedAt = new Date();
  const row = await prisma.balancingTransferRunV2.create({
    data: {
      status: 'PREVIEWED',
      goalPreset: facts.input.goalPreset,
      balancingMethod: facts.input.balancingMethod,
      performanceMetric: facts.input.performanceMetric,
      salesPeriod: facts.input.salesPeriod,
      sortOrder: facts.input.sortOrder,
      tieBreakKind: facts.input.tieBreakKind,
      tieBreakValue: new Prisma.Decimal(facts.input.tieBreakValue),
      transferDoublesToLowerPriority: facts.input.transferDoublesToLowerPriority,
      stripStoresBelowSizeCount: facts.input.stripStoresBelowSizeCount,
      inTransitPos: facts.input.inTransitPos,
      allowLowConfidenceMoves: facts.input.allowLowConfidenceMoves,
      cooldownDays: facts.input.cooldownDays,
      protectDaysOverride: facts.input.protectDaysOverride,
      requestedBy,
      previewedAt,
      criteriaJson: facts.input.criteria as unknown as Prisma.InputJsonValue,
      summaryJson: preview.summary as unknown as Prisma.InputJsonValue,
      linesJson: preview.lines as unknown as Prisma.InputJsonValue,
      exceptionsJson: preview.exceptions as unknown as Prisma.InputJsonValue,
      comparisonJson: comparison == null
        ? undefined
        : (comparison as unknown as Prisma.InputJsonValue),
      comparedLegacyRunId,
    },
    select: {
      id: true,
      status: true,
      goalPreset: true,
      balancingMethod: true,
      performanceMetric: true,
      salesPeriod: true,
      sortOrder: true,
      tieBreakKind: true,
      tieBreakValue: true,
      transferDoublesToLowerPriority: true,
      stripStoresBelowSizeCount: true,
      inTransitPos: true,
      allowLowConfidenceMoves: true,
      cooldownDays: true,
      protectDaysOverride: true,
      requestedBy: true,
      createdAt: true,
      previewedAt: true,
      committedAt: true,
      generatedTransferIds: true,
      criteriaJson: true,
      summaryJson: true,
      linesJson: true,
      exceptionsJson: true,
      comparisonJson: true,
    },
  });

  return buildStoredRecord(row);
}

export async function getBalancingTransferRunPreviewV2(
  id: string,
): Promise<BalancingTransferPreviewRecordV2 | null> {
  const row = await prisma.balancingTransferRunV2.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      goalPreset: true,
      balancingMethod: true,
      performanceMetric: true,
      salesPeriod: true,
      sortOrder: true,
      tieBreakKind: true,
      tieBreakValue: true,
      transferDoublesToLowerPriority: true,
      stripStoresBelowSizeCount: true,
      inTransitPos: true,
      allowLowConfidenceMoves: true,
      cooldownDays: true,
      protectDaysOverride: true,
      requestedBy: true,
      createdAt: true,
      previewedAt: true,
      committedAt: true,
      generatedTransferIds: true,
      criteriaJson: true,
      summaryJson: true,
      linesJson: true,
      exceptionsJson: true,
      comparisonJson: true,
    },
  });
  if (!row) return null;
  return buildStoredRecord(row);
}

export async function commitBalancingTransferRunV2(id: string): Promise<CommitTransferRunV2Result> {
  const row = await prisma.balancingTransferRunV2.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      requestedBy: true,
      inTransitPos: true,
      createdAt: true,
      committedAt: true,
      generatedTransferIds: true,
      summaryJson: true,
      linesJson: true,
    },
  });
  if (!row) {
    throw new TransferRunServiceError(404, 'BALANCING_TRANSFER_RUN_V2_NOT_FOUND', 'Balancing transfer v2 preview not found.');
  }

  const lines = asArray<BalancingTransferPreviewLineV2>(row.linesJson);
  const summary = asObject<BalancingTransferPreviewSummaryV2>(row.summaryJson, {
    transferCount: 0,
    skuCount: 0,
    storePairCount: 0,
    totalUnits: 0,
    exceptionCount: 0,
    passBreakdown: [],
  });

  if (row.status === 'COMMITTED') {
    return {
      runId: row.id,
      status: 'COMMITTED',
      generatedTransferIds: row.generatedTransferIds,
      totalTransfers: row.generatedTransferIds.length,
      totalUnits: summary.totalUnits,
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
      lines: lines.map((line) => ({
        skuId: line.skuId,
        skuCode: line.skuCode,
        unitCostSnapshot: line.unitCostSnapshot,
        fromStoreId: line.fromStoreId,
        toStoreId: line.toStoreId,
        cells: line.cells,
      })),
      makeSourceConflictError: createSourceConflictError,
    });
  });

  await prisma.balancingTransferRunV2.update({
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
    totalUnits: summary.totalUnits,
    committedAt: committedAt.toISOString(),
  };
}
