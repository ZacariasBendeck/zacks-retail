export type AdjustmentType = 'RECEIPT' | 'TRANSFER' | 'MANUAL_ADJUST' | 'RETURN' | 'DAMAGE' | 'SHRINKAGE';

export interface AdjustmentRow {
  id: string;
  type: AdjustmentType;
  from_location_id: string | null;
  to_location_id: string | null;
  reason: string | null;
  created_by: string;
  created_at: string;
}

export interface AdjustmentLineRow {
  id: string;
  adjustment_id: string;
  sku_id: string;
  quantity: number;
  created_at: string;
}

export interface AdjustmentLineItem {
  skuId: string;
  skuCode?: string;
  brand?: string;
  quantity: number;
}

export interface Adjustment {
  id: string;
  type: AdjustmentType;
  fromLocationId: string | null;
  fromLocationName?: string | null;
  toLocationId: string | null;
  toLocationName?: string | null;
  reason: string | null;
  lineItems: AdjustmentLineItem[];
  createdBy: string;
  createdAt: string;
}

export interface CreateAdjustmentInput {
  type: AdjustmentType;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  reason?: string | null;
  lineItems: { skuId: string; quantity: number }[];
  createdBy?: string;
}

export interface AdjustmentListParams {
  page: number;
  pageSize: number;
  sort?: string;
  order?: 'asc' | 'desc';
  type?: AdjustmentType;
  fromDate?: string;
  toDate?: string;
}

export interface LocationRow {
  id: string;
  name: string;
  active: number;
  created_at: string;
}

export interface Location {
  id: string;
  name: string;
}
