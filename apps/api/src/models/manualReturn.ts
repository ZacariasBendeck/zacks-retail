import type { PaginationEnvelope } from './sku';

export interface ManualReturnContextQuery {
  storeId: number;
  skuCode?: string;
  upc?: string;
}

export interface ManualReturnStoreOption {
  storeId: number;
  storeLabel: string;
}

export interface ManualReturnContextCell {
  columnLabel: string;
  rowLabel: string;
  quantityOnHand: number;
}

export interface ManualReturnCasePack {
  id: string;
  code: string;
  description: string;
  multiplierDefault: number;
  cells: Array<{
    columnLabel: string;
    rowLabel: string;
    quantityPerPack: number;
  }>;
}

export interface ManualReturnContext {
  storeId: number;
  storeLabel: string;
  skuId: string;
  skuCode: string;
  description: string | null;
  categoryNumber: number | null;
  vendorCode: string | null;
  vendorName: string | null;
  vendorSku: string | null;
  styleColor: string | null;
  sizeTypeCode: number | null;
  sizeGrid: {
    columns: string[];
    rows: string[];
  };
  defaultUnitCost: number | null;
  currentOnHandByCell: ManualReturnContextCell[];
  availableCasePacks: ManualReturnCasePack[];
  scannedUpcTarget?: {
    columnLabel: string;
    rowLabel: string;
  };
}

export interface CreateManualReturnLineInput {
  columnLabel?: string;
  rowLabel?: string;
  quantity: number;
}

export interface CreateManualReturnInput {
  storeId: number;
  skuId: string;
  returnReasonCode?: string | null;
  rmaNumber?: string | null;
  movementAt?: string | null;
  performedBy?: string | null;
  unitCostOverride?: number | null;
  casePackId?: string | null;
  casePackMultiplier?: number | null;
  note?: string | null;
  idempotencyKey?: string | null;
  lines: CreateManualReturnLineInput[];
}

export interface ManualReturnLineRecord {
  id: string;
  columnLabel: string;
  rowLabel: string;
  quantity: number;
  unitCost: number;
  movementId: string;
}

export interface ManualReturnRecord {
  id: string;
  storeId: number;
  storeLabel: string;
  skuId: string;
  skuCode: string;
  description: string | null;
  categoryNumber: number | null;
  vendorCode: string | null;
  vendorName: string | null;
  vendorSku: string | null;
  styleColor: string | null;
  returnReasonCode: string | null;
  rmaNumber: string | null;
  movementAt: string;
  unitCostApplied: number | null;
  casePackId: string | null;
  casePackMultiplier: number | null;
  note: string | null;
  totalUnits: number;
  createdAt: string;
  performedBy: string;
  lines: ManualReturnLineRecord[];
}

export interface ManualReturnListParams {
  page: number;
  pageSize: number;
  sort: 'movementAt' | 'createdAt';
  order: 'asc' | 'desc';
  storeId?: number;
  skuId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface ManualReturnListItem {
  id: string;
  storeId: number;
  storeLabel: string;
  skuId: string;
  skuCode: string;
  description: string | null;
  totalUnits: number;
  movementAt: string;
  createdAt: string;
  performedBy: string;
  rmaNumber: string | null;
  returnReasonCode: string | null;
}

export type ManualReturnListEnvelope = PaginationEnvelope<ManualReturnListItem>;
