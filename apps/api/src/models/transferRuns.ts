export interface TransferStoreOption {
  storeId: number;
  storeLabel: string;
}

export interface TransferPreviewException {
  code: string;
  severity: 'warning' | 'error';
  message: string;
  skuId?: string;
  skuCode?: string;
  fromStoreId?: number;
  toStoreId?: number;
  rowLabel?: string;
  columnLabel?: string;
}

export interface TransferPreviewCell {
  columnLabel: string;
  rowLabel: string;
  suggestedQuantity: number;
  fromOnHand: number;
  toOnHand: number;
  fromModelQty: number;
  toModelQty: number;
  reorderQty: number | null;
}

export interface AutoTransferCriteria {
  vendorCodes?: string[];
  categoryMin?: number | null;
  categoryMax?: number | null;
  seasons?: string[];
  groupCodes?: string[];
  keywords?: string[];
  skuCodes?: string[];
  limit?: number;
}

export interface CreateAutoTransferRunInput {
  warehouseStoreId: number;
  targetStoreIds: number[];
  sortOrder: 'SKU' | 'VENDOR' | 'CATEGORY' | 'LOCATION';
  inTransitPos?: boolean;
  criteria?: AutoTransferCriteria;
}

export interface AutoTransferPreviewLine {
  skuId: string;
  skuCode: string;
  description: string | null;
  vendorCode: string | null;
  categoryNumber: number | null;
  season: string | null;
  unitCostSnapshot: number;
  fromStoreId: number;
  fromStoreLabel: string;
  toStoreId: number;
  toStoreLabel: string;
  suggestedQuantity: number;
  cells: TransferPreviewCell[];
}

export interface AutoTransferPreviewSummary {
  transferCount: number;
  skuCount: number;
  receiverStoreCount: number;
  totalUnits: number;
  exceptionCount: number;
}

export interface AutoTransferPreviewRecord {
  id: string;
  status: 'PREVIEWED' | 'COMMITTED' | 'CANCELLED';
  warehouseStoreId: number;
  warehouseStoreLabel: string;
  targetStores: TransferStoreOption[];
  sortOrder: 'SKU' | 'VENDOR' | 'CATEGORY' | 'LOCATION';
  inTransitPos: boolean;
  criteria: AutoTransferCriteria;
  summary: AutoTransferPreviewSummary;
  lines: AutoTransferPreviewLine[];
  exceptions: TransferPreviewException[];
  requestedBy: string;
  createdAt: string;
  previewedAt: string | null;
  committedAt: string | null;
  generatedTransferIds: string[];
}

export interface BalancingTransferCriteria {
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

export interface CreateBalancingTransferRunInput {
  balancingMethod: 'OVER_UNDER_MODELS' | 'WITHOUT_MODELS' | 'WITHOUT_CONSIDERING_MODELS';
  performanceMetric: 'ROI' | 'TURNS' | 'SELL_THRU';
  salesPeriod: 'MONTH' | 'SEASON' | 'YEAR';
  sortOrder?: 'SKU' | 'VENDOR' | 'CATEGORY';
  tieBreakKind: 'ABSOLUTE' | 'PERCENT';
  tieBreakValue: number;
  transferDoublesToLowerPriority?: boolean;
  stripStoresBelowSizeCount?: number | null;
  inTransitPos?: boolean;
  criteria?: BalancingTransferCriteria;
}

export interface BalancingTransferMetricSnapshot {
  metricValue: number;
  displayValue: number;
  netSoldUnits: number;
  beginningOnHand: number;
  endingOnHand: number;
}

export interface BalancingTransferPreviewLine {
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
  fromMetric: BalancingTransferMetricSnapshot;
  toMetric: BalancingTransferMetricSnapshot;
  fromModelQty: number;
  toModelQty: number;
  cells: TransferPreviewCell[];
}

export interface BalancingTransferPreviewSummary {
  transferCount: number;
  skuCount: number;
  storePairCount: number;
  totalUnits: number;
  exceptionCount: number;
}

export interface BalancingTransferPreviewRecord {
  id: string;
  status: 'PREVIEWED' | 'COMMITTED' | 'CANCELLED';
  balancingMethod: 'OVER_UNDER_MODELS' | 'WITHOUT_MODELS' | 'WITHOUT_CONSIDERING_MODELS';
  performanceMetric: 'ROI' | 'TURNS' | 'SELL_THRU';
  salesPeriod: 'MONTH' | 'SEASON' | 'YEAR';
  sortOrder: 'SKU' | 'VENDOR' | 'CATEGORY';
  tieBreakKind: 'ABSOLUTE' | 'PERCENT';
  tieBreakValue: number;
  transferDoublesToLowerPriority: boolean;
  stripStoresBelowSizeCount: number | null;
  inTransitPos: boolean;
  criteria: BalancingTransferCriteria;
  summary: BalancingTransferPreviewSummary;
  lines: BalancingTransferPreviewLine[];
  exceptions: TransferPreviewException[];
  requestedBy: string;
  createdAt: string;
  previewedAt: string | null;
  committedAt: string | null;
  generatedTransferIds: string[];
}

export interface CommitTransferRunResult {
  runId: string;
  status: 'COMMITTED';
  generatedTransferIds: string[];
  totalTransfers: number;
  totalUnits: number;
  committedAt: string;
}
