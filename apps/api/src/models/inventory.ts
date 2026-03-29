export interface InventoryRow {
  id: string;
  sku_id: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  last_counted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Inventory {
  id: string;
  skuId: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  lastCountedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogRow {
  id: string;
  sku_id: string;
  adjustment: number;
  reason: string;
  resulting_balance: number;
  performed_by: string;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  skuId: string;
  adjustment: number;
  reason: string;
  resultingBalance: number;
  performedBy: string;
  createdAt: string;
}

export interface StockAdjustmentInput {
  adjustment: number;
  reason: string;
  performedBy?: string;
}

export function rowToInventory(row: InventoryRow): Inventory {
  return {
    id: row.id,
    skuId: row.sku_id,
    quantityOnHand: row.quantity_on_hand,
    quantityReserved: row.quantity_reserved,
    quantityAvailable: row.quantity_on_hand - row.quantity_reserved,
    lastCountedAt: row.last_counted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToAuditLog(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    skuId: row.sku_id,
    adjustment: row.adjustment,
    reason: row.reason,
    resultingBalance: row.resulting_balance,
    performedBy: row.performed_by,
    createdAt: row.created_at,
  };
}
