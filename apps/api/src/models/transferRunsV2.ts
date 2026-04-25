import type {
  CommitTransferRunResult,
  TransferPreviewCell,
  TransferPreviewException,
} from './transferRuns';

export interface BalancingTransferCriteriaV2 {
  storeIds?: number[];
  vendorCodes?: string[];
  categoryMin?: number | null;
  categoryMax?: number | null;
  seasons?: string[];
  styleColors?: string[];
  skuCodes?: string[];
  groupCodes?: string[];
  keywords?: string[];
  limit?: number;
  includeOriginalRetailOnly?: boolean;
  includeMarkdownOnly?: boolean;
  includePerksOnly?: boolean;
}

export interface CreateBalancingTransferRunV2Input {
  goalPreset?: 'DAILY_RESCUE' | 'WEEKLY_BALANCE' | 'SEASONAL_CONSOLIDATION';
  balancingMethod: 'OVER_UNDER_MODELS' | 'WITHOUT_MODELS' | 'WITHOUT_CONSIDERING_MODELS';
  performanceMetric: 'ROI' | 'TURNS' | 'SELL_THRU';
  salesPeriod: 'MONTH' | 'SEASON' | 'YEAR';
  sortOrder?: 'SKU' | 'VENDOR' | 'CATEGORY';
  tieBreakKind: 'ABSOLUTE' | 'PERCENT';
  tieBreakValue: number;
  transferDoublesToLowerPriority?: boolean;
  stripStoresBelowSizeCount?: number | null;
  inTransitPos?: boolean;
  allowLowConfidenceMoves?: boolean;
  cooldownDays?: number;
  protectDaysOverride?: number | null;
  criteria?: BalancingTransferCriteriaV2;
}

export interface BalancingTransferDecisionContext {
  decisionPass:
    | 'SERVICE_RESCUE'
    | 'CURVE_REPAIR'
    | 'COVERAGE_REBALANCE'
    | 'DOWNWARD_SHARE'
    | 'SKELETON_CONSOLIDATION';
  reasonCode:
    | 'CORE_SIZE_STOCKOUT'
    | 'BROKEN_CURVE'
    | 'UNDER_TARGET_COVER'
    | 'UNDER_MODEL'
    | 'DOWNWARD_FILL'
    | 'SKELETON_PULLBACK';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  coreSize: boolean;
  receiverNeedQtyBefore: number;
  receiverNeedQtyAfter: number;
  donorSpareQtyBefore: number;
  donorSpareQtyAfter: number;
  receiverCoverDaysBefore: number | null;
  receiverCoverDaysAfter: number | null;
  donorCoverDaysBefore: number | null;
  donorCoverDaysAfter: number | null;
  routeBucket: string | null;
  expectedMarginRecovered: number | null;
}

export interface BalancingTransferMetricSnapshotV2 {
  metricValue: number;
  displayValue: number;
  netSoldUnits: number;
  beginningOnHand: number;
  endingOnHand: number;
}

export interface BalancingTransferPreviewLineV2 {
  skuId: string;
  skuCode: string;
  description: string | null;
  vendorCode: string | null;
  categoryNumber: number | null;
  season: string | null;
  styleColor: string | null;
  unitCostSnapshot: number;
  fromStoreId: number;
  fromStoreLabel: string;
  toStoreId: number;
  toStoreLabel: string;
  suggestedQuantity: number;
  reason: string;
  fromMetric: BalancingTransferMetricSnapshotV2;
  toMetric: BalancingTransferMetricSnapshotV2;
  fromModelQty: number;
  toModelQty: number;
  cells: TransferPreviewCell[];
  decisionContext: BalancingTransferDecisionContext;
}

export interface BalancingTransferPreviewSummaryV2 {
  transferCount: number;
  skuCount: number;
  storePairCount: number;
  totalUnits: number;
  exceptionCount: number;
  passBreakdown: Array<{
    decisionPass: BalancingTransferDecisionContext['decisionPass'];
    transferCount: number;
    totalUnits: number;
  }>;
}

export interface BalancingTransferPreviewComparisonV2 {
  legacyRunId: string;
  legacyTransferCount: number;
  legacyTotalUnits: number;
  deltaTransferCount: number;
  deltaUnits: number;
}

export interface BalancingTransferPreviewRecordV2 {
  id: string;
  status: 'PREVIEWED' | 'COMMITTED' | 'CANCELLED';
  goalPreset: 'DAILY_RESCUE' | 'WEEKLY_BALANCE' | 'SEASONAL_CONSOLIDATION';
  balancingMethod: 'OVER_UNDER_MODELS' | 'WITHOUT_MODELS' | 'WITHOUT_CONSIDERING_MODELS';
  performanceMetric: 'ROI' | 'TURNS' | 'SELL_THRU';
  salesPeriod: 'MONTH' | 'SEASON' | 'YEAR';
  sortOrder: 'SKU' | 'VENDOR' | 'CATEGORY';
  tieBreakKind: 'ABSOLUTE' | 'PERCENT';
  tieBreakValue: number;
  transferDoublesToLowerPriority: boolean;
  stripStoresBelowSizeCount: number | null;
  inTransitPos: boolean;
  allowLowConfidenceMoves: boolean;
  cooldownDays: number;
  protectDaysOverride: number | null;
  criteria: BalancingTransferCriteriaV2;
  summary: BalancingTransferPreviewSummaryV2;
  lines: BalancingTransferPreviewLineV2[];
  exceptions: TransferPreviewException[];
  requestedBy: string;
  createdAt: string;
  previewedAt: string | null;
  committedAt: string | null;
  generatedTransferIds: string[];
  comparison?: BalancingTransferPreviewComparisonV2 | null;
}

export type CommitTransferRunV2Result = CommitTransferRunResult;
