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
}

export interface InquiryGrids {
  onHand?: InquirySizeGrid;
  model?: InquirySizeGrid;
  max?: InquirySizeGrid;
  reorder?: InquirySizeGrid;
  short?: InquirySizeGrid;
  allStoresOnHand?: InquirySizeGrid;
  allStoresSummary?: InquirySizeGrid;
}

export interface InquirySizeType {
  id: number;
  name: string;
  columns: string[];
  rows: string[];
}

export interface InventoryInquiry {
  sku: string;
  description: string;
  category: { id: number; name: string } | null;
  vendor: { code: string; name: string } | null;
  vendorSku: string | null;
  styleColor: string | null;
  sizeType: InquirySizeType | null;
  lastReceivedAt: string | null;
  pricing: InquiryPricing;
  rollup: InquiryRollup;
  grids: InquiryGrids;
  pictureUrl: string | null;
}
