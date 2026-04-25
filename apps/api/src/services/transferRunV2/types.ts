import type {
  BalancingTransferMetricSnapshotV2,
  BalancingTransferPreviewComparisonV2,
  BalancingTransferPreviewLineV2,
  BalancingTransferPreviewSummaryV2,
  CreateBalancingTransferRunV2Input,
} from '../../models/transferRunsV2';
import type { TransferPreviewException } from '../../models/transferRuns';

export interface CandidateSkuRowV2 {
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
  currentCost: number | null;
  retailPrice: number | null;
  listPrice: number | null;
  currentPriceSlot: string | null;
  perks: number | null;
  sizeType: number | null;
}

export interface StoreFactV2 {
  storeId: number;
  storeLabel: string;
  region: number | null;
  transferCapable: boolean;
}

export interface WorkingCellStateV2 {
  skuId: string;
  skuCode: string;
  storeId: number;
  storeLabel: string;
  region: number | null;
  rowLabel: string;
  columnLabel: string;
  onHand: number;
  lastMovementAt: Date | null;
  lastReceivedAt: Date | null;
  inboundQty: number;
  reservedQty: number;
  modelQty: number;
  maxQty: number;
  reorderQty: number | null;
  storeSoldUnits: number;
  chainSoldUnits: number;
  categoryCurveUnits: number;
  forecastDailyQty: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  coreSize: boolean;
  eligibleReceiver: boolean;
  presentationFloorQty: number;
  serviceFloorQty: number;
  targetQty: number;
  needQty: number;
  donorProtectQty: number;
  spareQty: number;
  effectiveAvailableQty: number;
  routeBucket: string | null;
  metric: BalancingTransferMetricSnapshotV2;
}

export interface WorkingSkuStateV2 {
  sku: CandidateSkuRowV2;
  stores: Map<number, Map<string, WorkingCellStateV2>>;
}

export interface StoreMetricAggregateRowV2 {
  skuId: string;
  storeId: number;
  netMovementQty: number | null;
  positiveMovementQty: number | null;
  netSoldUnits: number | null;
  netRevenue: number | null;
  netCost: number | null;
}

export interface StoreCellSalesAggregateRowV2 {
  skuId: string;
  storeId: number;
  rowLabel: string;
  columnLabel: string;
  soldUnits: number;
}

export interface ChainCellSalesAggregateRowV2 {
  skuId: string;
  rowLabel: string;
  columnLabel: string;
  soldUnits: number;
}

export interface CategoryCurveAggregateRowV2 {
  categoryNumber: number | null;
  sizeType: number | null;
  rowLabel: string;
  columnLabel: string;
  soldUnits: number;
}

export interface InTransitInboundAggregateRowV2 {
  skuId: string;
  storeId: number;
  rowLabel: string;
  columnLabel: string;
  quantity: number;
}

export interface NormalizedBalancingTransferCriteriaV2 {
  storeIds: number[];
  vendorCodes: string[];
  categoryMin: number | null;
  categoryMax: number | null;
  seasons: string[];
  styleColors: string[];
  skuCodes: string[];
  groupCodes: string[];
  keywords: string[];
  limit?: number;
  includeOriginalRetailOnly: boolean;
  includeMarkdownOnly: boolean;
  includePerksOnly: boolean;
}

export interface BalancingFactsV2 {
  input: Required<
    Pick<
      CreateBalancingTransferRunV2Input,
      | 'balancingMethod'
      | 'performanceMetric'
      | 'salesPeriod'
      | 'tieBreakKind'
      | 'tieBreakValue'
      | 'transferDoublesToLowerPriority'
      | 'inTransitPos'
      | 'allowLowConfidenceMoves'
      | 'cooldownDays'
    >
  > & {
    goalPreset: 'DAILY_RESCUE' | 'WEEKLY_BALANCE' | 'SEASONAL_CONSOLIDATION';
    sortOrder: 'SKU' | 'VENDOR' | 'CATEGORY';
    stripStoresBelowSizeCount: number | null;
    protectDaysOverride: number | null;
    criteria: NormalizedBalancingTransferCriteriaV2;
  };
  stores: StoreFactV2[];
  skus: CandidateSkuRowV2[];
  workingBySku: Map<string, WorkingSkuStateV2>;
  metricAggregates: Map<string, StoreMetricAggregateRowV2>;
  storeCellSales: Map<string, number>;
  chainCellSales: Map<string, number>;
  categoryCurveSales: Map<string, number>;
  inTransitInbound: Map<string, number>;
}

export interface BuildPreviewResultV2 {
  lines: BalancingTransferPreviewLineV2[];
  exceptions: TransferPreviewException[];
  summary: BalancingTransferPreviewSummaryV2;
  comparison: BalancingTransferPreviewComparisonV2 | null;
}
