export type PriceSlot = 'LIST' | 'RETAIL' | 'MARKDOWN1' | 'MARKDOWN2';

export interface InquiryPricing {
  retail: number;
  markdown1: number;
  markdown2: number;
  avgCost: number;
  currentCost: number;
  listPrice: number;
  currentSlot: PriceSlot;
}

export interface InquiryRollupCell {
  qty: number;
  net: number;
  markdown: number;
  profit: number;
}

export interface InquiryRollup {
  week: InquiryRollupCell;
  month: InquiryRollupCell;
  season: InquiryRollupCell;
  year: InquiryRollupCell;
}

export interface InquirySizeGrid {
  columns: string[];
  rows: Array<{ label: string; cells: Array<{ value: number | null }> }>;
  total?: number;
}

export interface InquiryGrids {
  onHand?: InquirySizeGrid;
  onOrderCurrent?: InquirySizeGrid;
  onOrderFuture?: InquirySizeGrid;
  model?: InquirySizeGrid;
  max?: InquirySizeGrid;
  reorder?: InquirySizeGrid;
  short?: InquirySizeGrid;
  mtdSales?: InquirySizeGrid;
  stdSales?: InquirySizeGrid;
  ytdSales?: InquirySizeGrid;
  lySales?: InquirySizeGrid;
  singleColumn?: InquirySizeGrid;
  allStoresOnHand?: InquirySizeGrid;
  allStoresOneRow?: InquirySizeGrid;
  allStoresSummary?: InquirySizeGrid;
}

export interface InquirySizeType {
  id: number;
  name: string;
  columns: string[];
  rows: string[];
}

export interface InquiryInfo {
  seasonCode: string | null;
  labelCode: string | null;
  groupCode: string | null;
  firstReceivedAt: string | null;
  lastMarkdownAt: string | null;
  perks: number | null;
  comment: string | null;
}

export type SkuReplacementType = 'EXACT' | 'SIMILAR' | 'VENDOR_SUBSTITUTE';

export interface InquirySkuReplacement {
  id: string;
  oldSkuId: string;
  oldSkuCode: string;
  oldDescription: string | null;
  replacementSkuId: string;
  replacementSkuCode: string;
  replacementDescription: string | null;
  replacementType: SkuReplacementType;
  transferDemand: boolean;
  effectiveAt: string;
  retiredAt: string | null;
  note: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface InquiryReplacementContext {
  replacedBy: InquirySkuReplacement | null;
  supersedes: InquirySkuReplacement[];
}

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

export interface InventoryInquiry {
  sku: string;
  description: string;
  category: { id: number; name: string } | null;
  vendor: { code: string; name: string } | null;
  vendorSku: string | null;
  styleColor: string | null;
  status: string | null;
  sizeType: InquirySizeType | null;
  lastReceivedAt: string | null;
  pricing: InquiryPricing;
  rollup: InquiryRollup;
  grids: InquiryGrids;
  pictureUrl: string | null;
  info: InquiryInfo;
  replacementContext: InquiryReplacementContext;
}
