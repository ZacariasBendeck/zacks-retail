export interface InventoryRow {
  id: string;
  sku_id: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  last_counted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Inventory {
  id: string;
  skuId: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  version: number;
  lastCountedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SourceDocumentRefType =
  | 'PURCHASE_ORDER_RECEIPT'
  | 'TRANSFER_ORDER'
  | 'STOCK_ADJUSTMENT'
  | 'INITIAL_IMPORT'
  | 'SYSTEM_RECONCILIATION';

export interface SourceDocumentRef {
  type: SourceDocumentRefType;
  id: string;
}

export interface AuditLogRow {
  id: string;
  sku_id: string;
  adjustment: number;
  reason: string;
  resulting_balance: number;
  performed_by: string;
  source_document_ref_type: string | null;
  source_document_ref_id: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  skuId: string;
  adjustment: number;
  reason: string;
  resultingBalance: number;
  performedBy: string;
  sourceDocumentRef: SourceDocumentRef | null;
  idempotencyKey: string | null;
  createdAt: string;
}

export interface StockAdjustmentInput {
  adjustment: number;
  reason: string;
  performedBy?: string;
}

export interface InventoryMutationInput {
  skuId: string;
  quantityDelta: number;
  reasonCode: string;
  categoryCode: number;
  sourceDocumentRef: SourceDocumentRef;
  actorId: string;
  occurredAt?: string;
  idempotencyKey?: string;
  expectedVersion?: number;
}

export interface OnHandSkuResult {
  skuId: string;
  skuCode: string;
  brand: string | null;
  style: string;
  color: string | null;
  department: string;
  onHandUnits: number;
  availableUnits: number;
  reservedUnits: number;
  asOf: string;
}

export interface DepartmentOnHand {
  department: string;
  totalSkus: number;
  totalUnitsOnHand: number;
  totalCostValue: number;
}

export function rowToInventory(row: InventoryRow): Inventory {
  return {
    id: row.id,
    skuId: row.sku_id,
    quantityOnHand: row.quantity_on_hand,
    quantityReserved: row.quantity_reserved,
    quantityAvailable: row.quantity_on_hand - row.quantity_reserved,
    version: row.version ?? 1,
    lastCountedAt: row.last_counted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Cursor-paginated inventory list (ZAI-298) ──────────────────

export type InventoryListSortField = 'quantityOnHand' | 'updatedAt' | 'skuCode' | 'department';

export const INVENTORY_LIST_SORT_ALLOWLIST: readonly InventoryListSortField[] = [
  'quantityOnHand', 'updatedAt', 'skuCode', 'department',
] as const;

export interface InventoryListParams {
  limit: number;
  cursor?: string;
  sort: InventoryListSortField;
  order: 'asc' | 'desc';
  department?: string;
  brandId?: number;
  categoryId?: number;
  active?: boolean;
  q?: string;
}

export interface InventoryListItem {
  inventoryId: string;
  skuId: string;
  skuCode: string;
  style: string;
  department: string;
  brandId: number | null;
  brandName: string | null;
  categoryId: number | null;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  version: number;
  updatedAt: string;
}

export interface CursorPaginationEnvelope<T> {
  data: T[];
  nextCursor: string | null;
  limit: number;
  appliedSort: { field: string; order: string };
  appliedFilters: Record<string, string | number | boolean>;
}

// ── Movement timeline (ZAI-357) ──────────────────────────────────

export type MovementType = 'sale' | 'po_receipt' | 'transfer_in' | 'transfer_out' | 'adjustment';

export const MOVEMENT_TYPES: readonly MovementType[] = [
  'sale', 'po_receipt', 'transfer_in', 'transfer_out', 'adjustment',
] as const;

export type MovementTimelineSortField = 'movementAt' | 'quantityDelta';

export const MOVEMENT_TIMELINE_SORT_ALLOWLIST: readonly MovementTimelineSortField[] = [
  'movementAt', 'quantityDelta',
] as const;

export interface MovementTimelineParams {
  limit: number;
  cursor?: string;
  sort: MovementTimelineSortField;
  order: 'asc' | 'desc';
  skuId?: string;
  locationId?: string;
  movementType?: MovementType;
  fromDate?: string;
  toDate?: string;
}

export interface MovementTimelineItem {
  id: string;
  skuId: string;
  skuCode: string | null;
  locationId: string;
  locationCode: string | null;
  movementType: MovementType;
  quantityDelta: number;
  unitCostSnapshot: number | null;
  movementAt: string;
  createdAt: string;
}

// ── Movement reconciliation (ZAI-357) ────────────────────────────

export type ReconciliationSortField = 'expectedQuantityDelta' | 'lastMovementAt' | 'movementRowCount';

export const RECONCILIATION_SORT_ALLOWLIST: readonly ReconciliationSortField[] = [
  'expectedQuantityDelta', 'lastMovementAt', 'movementRowCount',
] as const;

export interface ReconciliationParams {
  limit: number;
  cursor?: string;
  sort: ReconciliationSortField;
  order: 'asc' | 'desc';
  skuId?: string;
  locationId?: string;
}

export interface ReconciliationItem {
  skuId: string;
  skuCode: string | null;
  locationId: string;
  locationCode: string | null;
  expectedQuantityDelta: number;
  movementRowCount: number;
  firstMovementAt: string;
  lastMovementAt: string;
}

export function rowToAuditLog(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    skuId: row.sku_id,
    adjustment: row.adjustment,
    reason: row.reason,
    resultingBalance: row.resulting_balance,
    performedBy: row.performed_by,
    sourceDocumentRef: row.source_document_ref_type
      ? { type: row.source_document_ref_type as SourceDocumentRefType, id: row.source_document_ref_id! }
      : null,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}
