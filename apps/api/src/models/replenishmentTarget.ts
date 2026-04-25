export interface ReplenishmentTargetCell {
  columnLabel: string;
  rowLabel: string;
  onHand: number;
  modelQty: number;
  maxQty: number;
  reorderQty: number;
}

export interface ReplenishmentTargetStore {
  storeId: number;
  storeLabel: string;
  cells: ReplenishmentTargetCell[];
  totals: {
    onHand: number;
    modelQty: number;
    maxQty: number;
    reorderQty: number;
  };
}

export interface ReplenishmentTargetRecord {
  skuId: string;
  skuCode: string;
  description: string | null;
  brand: string | null;
  vendorCode: string | null;
  categoryNumber: number | null;
  season: string | null;
  sizeGrid: {
    columns: string[];
    rows: string[];
  };
  stores: ReplenishmentTargetStore[];
}

export interface UpdateReplenishmentTargetCellInput {
  columnLabel?: string;
  rowLabel?: string;
  modelQty?: number | null;
  maxQty?: number | null;
  reorderQty?: number | null;
}

export interface UpdateReplenishmentTargetInput {
  cells: UpdateReplenishmentTargetCellInput[];
  additionalStoreIds?: number[];
  updatedBy?: string | null;
}
