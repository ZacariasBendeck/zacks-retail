import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { prisma } from '../db/prisma';
import { getTraceId } from '../observability/requestContext';
import {
  Inventory,
  AuditLogEntry,
  StockAdjustmentInput,
  InventoryMutationInput,
  OnHandSkuResult,
  DepartmentOnHand,
  rowToInventory,
  rowToAuditLog,
} from '../models/inventory';
import { PaginationEnvelope } from '../models/sku';
import {
  applyInventoryDelta,
  auditRowToLegacyShape,
  getAggregateInventoryRow,
  getOrCreateAggregateInventoryRow,
  inventoryRowToLegacyShape,
} from './postgresInventoryLedger';

export async function getInventoryBySkuId(skuId: string): Promise<Inventory | null> {
  const row = await getAggregateInventoryRow(skuId);
  if (!row) return null;
  return rowToInventory(inventoryRowToLegacyShape(row));
}

export async function adjustStock(
  skuId: string,
  input: StockAdjustmentInput,
): Promise<{ inventory: Inventory; auditEntry: AuditLogEntry }> {
  const result = await prisma.$transaction(async (tx) => {
    const { inventory, audit } = await applyInventoryDelta({
      skuId,
      quantityDelta: input.adjustment,
      reason: input.reason,
      performedBy: input.performedBy ?? 'system',
    }, tx);
    return { inventory, audit };
  });

  return {
    inventory: rowToInventory(inventoryRowToLegacyShape(result.inventory)),
    auditEntry: rowToAuditLog(auditRowToLegacyShape(result.audit)),
  };
}

export async function getAuditLog(
  skuId: string,
  params: { page: number; pageSize: number; sort?: string; order?: 'asc' | 'desc' }
): Promise<PaginationEnvelope<AuditLogEntry> | null> {
  const inventory = await getAggregateInventoryRow(skuId);
  if (!inventory) return null;

  const totalItems = await prisma.inventoryAuditLog.count({
    where: { skuId, skuSizeId: null },
  });
  const totalPages = Math.ceil(totalItems / params.pageSize);
  const offset = (params.page - 1) * params.pageSize;

  const sortField = params.sort === 'adjustment' ? 'adjustment' : 'createdAt';
  const sortDir = params.order === 'asc' ? 'asc' : 'desc';
  const rows = await prisma.inventoryAuditLog.findMany({
    where: { skuId, skuSizeId: null },
    orderBy: [{ [sortField]: sortDir }, { id: sortDir }],
    skip: offset,
    take: params.pageSize,
  });

  return {
    data: rows.map((row) => rowToAuditLog(auditRowToLegacyShape(row))),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
      totalPages,
    },
  };
}

// ── Cursor-paginated inventory list (ZAI-298) ───────────────────

import {
  InventoryListParams,
  InventoryListItem,
  CursorPaginationEnvelope,
  InventoryListSortField,
} from '../models/inventory';

const INV_LIST_SORT_MAP: Record<InventoryListSortField, string> = {
  quantityOnHand: 'i.quantity_on_hand',
  updatedAt: 'i.updated_at',
  skuCode: 's.sku_code',
  department: 's.department',
};

function encodeCursor(sortValue: string | number, id: string): string {
  return Buffer.from(JSON.stringify({ s: sortValue, id })).toString('base64url');
}

function decodeCursor(cursor: string): { s: string | number; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
    if (parsed && typeof parsed.id === 'string' && parsed.s !== undefined) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function listInventory(
  params: InventoryListParams
): CursorPaginationEnvelope<InventoryListItem> {
  const db = getDb();

  const sortCol = INV_LIST_SORT_MAP[params.sort] || 'i.updated_at';
  const sortDir = params.order === 'asc' ? 'ASC' : 'DESC';
  const oppositeOp = sortDir === 'ASC' ? '>' : '<';

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  // Filters
  if (params.department) {
    conditions.push('s.department = ?');
    values.push(params.department);
  }
  if (params.brandId !== undefined) {
    conditions.push('s.brand_id = ?');
    values.push(params.brandId);
  }
  if (params.categoryId !== undefined) {
    conditions.push('s.category_id = ?');
    values.push(params.categoryId);
  }
  if (params.active !== undefined) {
    conditions.push('s.active = ?');
    values.push(params.active ? 1 : 0);
  }
  if (params.q) {
    conditions.push("(s.sku_code LIKE ? OR s.style LIKE ? OR s.rics_description LIKE ?)");
    const pattern = `%${params.q}%`;
    values.push(pattern, pattern, pattern);
  }

  // Cursor condition: (sortCol, i.id) comparison for deterministic paging
  if (params.cursor) {
    const decoded = decodeCursor(params.cursor);
    if (decoded) {
      // Keyset pagination: (sortCol < cursorSortVal) OR (sortCol = cursorSortVal AND i.id < cursorId)
      // Direction depends on ASC/DESC
      conditions.push(
        `(${sortCol} ${oppositeOp} ? OR (${sortCol} = ? AND i.id ${oppositeOp} ?))`
      );
      values.push(decoded.s, decoded.s, decoded.id);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Fetch limit+1 to detect if there are more rows
  const fetchLimit = params.limit + 1;

  const query = `
    SELECT
      i.id AS inventory_id,
      i.sku_id,
      s.sku_code,
      s.style,
      s.department,
      s.brand_id,
      rb.name AS brand_name,
      s.category_id,
      i.quantity_on_hand,
      i.quantity_reserved,
      (i.quantity_on_hand - i.quantity_reserved) AS quantity_available,
      i.version,
      i.updated_at
    FROM inventory i
    INNER JOIN skus s ON s.id = i.sku_id
    LEFT JOIN ref_brands rb ON rb.id = s.brand_id
    ${whereClause}
    ORDER BY ${sortCol} ${sortDir}, i.id ${sortDir}
    LIMIT ?
  `;

  values.push(fetchLimit);

  const rows = db.prepare(query).all(...values) as {
    inventory_id: string; sku_id: string; sku_code: string; style: string;
    department: string; brand_id: number | null; brand_name: string | null;
    category_id: number | null; quantity_on_hand: number; quantity_reserved: number;
    quantity_available: number; version: number; updated_at: string;
  }[];

  const hasMore = rows.length > params.limit;
  const resultRows = hasMore ? rows.slice(0, params.limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore && resultRows.length > 0) {
    const last = resultRows[resultRows.length - 1];
    const sortValue = params.sort === 'quantityOnHand' ? last.quantity_on_hand
      : params.sort === 'skuCode' ? last.sku_code
      : params.sort === 'department' ? last.department
      : last.updated_at;
    nextCursor = encodeCursor(sortValue, last.inventory_id);
  }

  // Build appliedFilters (only include filters actually sent)
  const appliedFilters: Record<string, string | number | boolean> = {};
  if (params.department) appliedFilters.department = params.department;
  if (params.brandId !== undefined) appliedFilters.brandId = params.brandId;
  if (params.categoryId !== undefined) appliedFilters.categoryId = params.categoryId;
  if (params.active !== undefined) appliedFilters.active = params.active;
  if (params.q) appliedFilters.q = params.q;

  return {
    data: resultRows.map((r) => ({
      inventoryId: r.inventory_id,
      skuId: r.sku_id,
      skuCode: r.sku_code,
      style: r.style,
      department: r.department,
      brandId: r.brand_id,
      brandName: r.brand_name,
      categoryId: r.category_id,
      quantityOnHand: r.quantity_on_hand,
      quantityReserved: r.quantity_reserved,
      quantityAvailable: r.quantity_available,
      version: r.version,
      updatedAt: r.updated_at,
    })),
    nextCursor,
    limit: params.limit,
    appliedSort: { field: params.sort, order: params.order },
    appliedFilters,
  };
}

// ── Movement Timeline (ZAI-357) ─────────────────────────────────

import {
  MovementTimelineParams,
  MovementTimelineItem,
  MovementTimelineSortField,
  MovementType,
  ReconciliationParams,
  ReconciliationItem,
  ReconciliationSortField,
} from '../models/inventory';

const TIMELINE_SORT_MAP: Record<MovementTimelineSortField, string> = {
  movementAt: 'l.movement_at',
  quantityDelta: 'l.quantity_delta',
};

export function listMovementTimeline(
  params: MovementTimelineParams
): CursorPaginationEnvelope<MovementTimelineItem> {
  const db = getDb();

  const sortCol = TIMELINE_SORT_MAP[params.sort] || 'l.movement_at';
  const sortDir = params.order === 'asc' ? 'ASC' : 'DESC';
  const oppositeOp = sortDir === 'ASC' ? '>' : '<';

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (params.skuId) {
    conditions.push('l.sku_id = ?');
    values.push(params.skuId);
  }
  if (params.locationId) {
    conditions.push('l.location_id = ?');
    values.push(params.locationId);
  }
  if (params.movementType) {
    conditions.push('l.movement_type = ?');
    values.push(params.movementType);
  }
  if (params.fromDate) {
    conditions.push('l.movement_at >= ?');
    values.push(params.fromDate);
  }
  if (params.toDate) {
    conditions.push('l.movement_at <= ?');
    values.push(params.toDate);
  }

  if (params.cursor) {
    const decoded = decodeCursor(params.cursor);
    if (decoded) {
      conditions.push(
        `(${sortCol} ${oppositeOp} ? OR (${sortCol} = ? AND l.id ${oppositeOp} ?))`
      );
      values.push(decoded.s, decoded.s, decoded.id);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const fetchLimit = params.limit + 1;

  const query = `
    SELECT
      l.id,
      l.sku_id,
      s.sku_code,
      l.location_id,
      loc.code AS location_code,
      l.movement_type,
      l.quantity_delta,
      l.unit_cost_snapshot,
      l.movement_at,
      l.created_at
    FROM inventory_movement_ledger l
    LEFT JOIN skus s ON s.id = l.sku_id
    LEFT JOIN inventory_locations loc ON loc.id = l.location_id
    ${whereClause}
    ORDER BY ${sortCol} ${sortDir}, l.id ${sortDir}
    LIMIT ?
  `;

  values.push(fetchLimit);

  const rows = db.prepare(query).all(...values) as {
    id: string; sku_id: string; sku_code: string | null; location_id: string;
    location_code: string | null; movement_type: string; quantity_delta: number;
    unit_cost_snapshot: number | null; movement_at: string; created_at: string;
  }[];

  const hasMore = rows.length > params.limit;
  const resultRows = hasMore ? rows.slice(0, params.limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore && resultRows.length > 0) {
    const last = resultRows[resultRows.length - 1];
    const sortValue = params.sort === 'quantityDelta' ? last.quantity_delta : last.movement_at;
    nextCursor = encodeCursor(sortValue, last.id);
  }

  const appliedFilters: Record<string, string | number | boolean> = {};
  if (params.skuId) appliedFilters.skuId = params.skuId;
  if (params.locationId) appliedFilters.locationId = params.locationId;
  if (params.movementType) appliedFilters.movementType = params.movementType;
  if (params.fromDate) appliedFilters.fromDate = params.fromDate;
  if (params.toDate) appliedFilters.toDate = params.toDate;

  return {
    data: resultRows.map((r) => ({
      id: r.id,
      skuId: r.sku_id,
      skuCode: r.sku_code,
      locationId: r.location_id,
      locationCode: r.location_code,
      movementType: r.movement_type as MovementType,
      quantityDelta: r.quantity_delta,
      unitCostSnapshot: r.unit_cost_snapshot,
      movementAt: r.movement_at,
      createdAt: r.created_at,
    })),
    nextCursor,
    limit: params.limit,
    appliedSort: { field: params.sort, order: params.order },
    appliedFilters,
  };
}

// ── Movement Reconciliation (ZAI-357) ───────────────────────────

const RECONCILIATION_SORT_MAP: Record<ReconciliationSortField, string> = {
  expectedQuantityDelta: 'r.expected_quantity_delta',
  lastMovementAt: 'r.last_movement_at',
  movementRowCount: 'r.movement_row_count',
};

export function listMovementReconciliation(
  params: ReconciliationParams
): CursorPaginationEnvelope<ReconciliationItem> {
  const db = getDb();

  const sortCol = RECONCILIATION_SORT_MAP[params.sort] || 'r.last_movement_at';
  const sortDir = params.order === 'asc' ? 'ASC' : 'DESC';
  const oppositeOp = sortDir === 'ASC' ? '>' : '<';

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (params.skuId) {
    conditions.push('r.sku_id = ?');
    values.push(params.skuId);
  }
  if (params.locationId) {
    conditions.push('r.location_id = ?');
    values.push(params.locationId);
  }

  // Reconciliation view uses composite key (sku_id, location_id) as row identity for cursor
  if (params.cursor) {
    const decoded = decodeCursor(params.cursor);
    if (decoded) {
      conditions.push(
        `(${sortCol} ${oppositeOp} ? OR (${sortCol} = ? AND (r.sku_id || '|' || r.location_id) ${oppositeOp} ?))`
      );
      values.push(decoded.s, decoded.s, decoded.id);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const fetchLimit = params.limit + 1;

  const query = `
    SELECT
      r.sku_id,
      s.sku_code,
      r.location_id,
      loc.code AS location_code,
      r.expected_quantity_delta,
      r.movement_row_count,
      r.first_movement_at,
      r.last_movement_at
    FROM v_inventory_movement_reconciliation r
    LEFT JOIN skus s ON s.id = r.sku_id
    LEFT JOIN inventory_locations loc ON loc.id = r.location_id
    ${whereClause}
    ORDER BY ${sortCol} ${sortDir}, (r.sku_id || '|' || r.location_id) ${sortDir}
    LIMIT ?
  `;

  values.push(fetchLimit);

  const rows = db.prepare(query).all(...values) as {
    sku_id: string; sku_code: string | null; location_id: string;
    location_code: string | null; expected_quantity_delta: number;
    movement_row_count: number; first_movement_at: string; last_movement_at: string;
  }[];

  const hasMore = rows.length > params.limit;
  const resultRows = hasMore ? rows.slice(0, params.limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore && resultRows.length > 0) {
    const last = resultRows[resultRows.length - 1];
    const sortValue = params.sort === 'expectedQuantityDelta' ? last.expected_quantity_delta
      : params.sort === 'movementRowCount' ? last.movement_row_count
      : last.last_movement_at;
    nextCursor = encodeCursor(sortValue, `${last.sku_id}|${last.location_id}`);
  }

  const appliedFilters: Record<string, string | number | boolean> = {};
  if (params.skuId) appliedFilters.skuId = params.skuId;
  if (params.locationId) appliedFilters.locationId = params.locationId;

  return {
    data: resultRows.map((r) => ({
      skuId: r.sku_id,
      skuCode: r.sku_code,
      locationId: r.location_id,
      locationCode: r.location_code,
      expectedQuantityDelta: r.expected_quantity_delta,
      movementRowCount: r.movement_row_count,
      firstMovementAt: r.first_movement_at,
      lastMovementAt: r.last_movement_at,
    })),
    nextCursor,
    limit: params.limit,
    appliedSort: { field: params.sort, order: params.order },
    appliedFilters,
  };
}

// ── Inventory Mutation (ZAI-134 spec) ────────────────────────────

const VALID_CATEGORY_MIN = 556;
const VALID_CATEGORY_MAX = 599;
const VALID_SOURCE_TYPES = [
  'PURCHASE_ORDER_RECEIPT', 'TRANSFER_ORDER', 'STOCK_ADJUSTMENT',
  'INITIAL_IMPORT', 'SYSTEM_RECONCILIATION',
];

export type MutationError = {
  error: {
    code: string;
    message: string;
    details?: Record<string, string>[];
    traceId: string;
  };
};

export type MutationResult = AuditLogEntry & { version: number; idempotentReplay?: boolean };

export async function executeMutation(input: InventoryMutationInput): Promise<MutationResult | MutationError> {
  const traceId = getTraceId() ?? uuidv4();
  const db = getDb();

  // Validate category code range
  if (input.categoryCode < VALID_CATEGORY_MIN || input.categoryCode > VALID_CATEGORY_MAX) {
    return {
      error: {
        code: 'VALIDATION_CATEGORY_RANGE',
        message: `Category code must be between ${VALID_CATEGORY_MIN} and ${VALID_CATEGORY_MAX}.`,
        details: [{ field: 'categoryCode', value: String(input.categoryCode) }],
        traceId,
      },
    };
  }

  // Validate sourceDocumentRef
  if (!input.sourceDocumentRef || !VALID_SOURCE_TYPES.includes(input.sourceDocumentRef.type)) {
    return {
      error: {
        code: 'VALIDATION_SOURCE_DOCUMENT',
        message: 'sourceDocumentRef.type must be one of: ' + VALID_SOURCE_TYPES.join(', '),
        details: [{ field: 'sourceDocumentRef.type', value: input.sourceDocumentRef?.type ?? 'null' }],
        traceId,
      },
    };
  }

  if (!input.sourceDocumentRef.id || input.sourceDocumentRef.id.trim() === '') {
    return {
      error: {
        code: 'VALIDATION_SOURCE_DOCUMENT',
        message: 'sourceDocumentRef.id must be a non-empty string.',
        details: [{ field: 'sourceDocumentRef.id', value: 'empty' }],
        traceId,
      },
    };
  }

  // Validate SKU exists and has valid canonical attributes
  const sku = db.prepare(
    'SELECT id, brand_id, color_id, style, category_id FROM skus WHERE id = ?'
  ).get(input.skuId) as { id: string; brand_id: number | null; color_id: number | null; style: string | null; category_id: number | null } | undefined;

  if (!sku) {
    return {
      error: {
        code: 'VALIDATION_CANONICAL_ATTRIBUTE',
        message: 'SKU not found.',
        details: [{ field: 'skuId', value: input.skuId }],
        traceId,
      },
    };
  }

  if (!sku.brand_id || !sku.color_id || !sku.style) {
    const missing: Record<string, string>[] = [];
    if (!sku.brand_id) missing.push({ field: 'brandId', value: 'null' });
    if (!sku.color_id) missing.push({ field: 'colorId', value: 'null' });
    if (!sku.style) missing.push({ field: 'style', value: 'null' });
    return {
      error: {
        code: 'VALIDATION_CANONICAL_ATTRIBUTE',
        message: 'SKU is missing required canonical attributes (brand, style, color).',
        details: missing,
        traceId,
      },
    };
  }

  // Idempotency check
  if (input.idempotencyKey) {
    const existing = await prisma.inventoryAuditLog.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existing) {
      // Same key found — verify payload matches (simplified: check skuId + delta)
      if (existing.skuId !== input.skuId || existing.adjustment !== input.quantityDelta) {
        return {
          error: {
            code: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
            message: 'Idempotency key already used with a different payload.',
            details: [{ field: 'idempotencyKey', value: input.idempotencyKey }],
            traceId,
          },
        };
      }
      // Replay: return the existing entry with current version
      const entry = rowToAuditLog(auditRowToLegacyShape(existing));
      const currentInv = await getOrCreateAggregateInventoryRow(input.skuId);
      return { ...entry, version: currentInv.version ?? 1, idempotentReplay: true };
    }
  }

  try {
    const { inventory, audit } = await prisma.$transaction(async (tx) => {
      return applyInventoryDelta({
        skuId: input.skuId,
        quantityDelta: input.quantityDelta,
        reason: input.reasonCode,
        performedBy: input.actorId,
        sourceDocumentRefType: input.sourceDocumentRef.type,
        sourceDocumentRefId: input.sourceDocumentRef.id,
        idempotencyKey: input.idempotencyKey ?? null,
        expectedVersion: input.expectedVersion,
      }, tx);
    });

    return {
      ...rowToAuditLog(auditRowToLegacyShape(audit)),
      version: inventory.version,
    };
  } catch (err) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_STOCK') {
      return {
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: 'Mutation would bring quantity below zero.',
          details: [{ field: 'quantityDelta', value: String(input.quantityDelta) }],
          traceId,
        },
      };
    }
    if (err instanceof Error && err.message === 'CONFLICT_VERSION_MISMATCH') {
      const currentVersion = (err as Error & { currentVersion?: number }).currentVersion;
      return {
        error: {
          code: 'CONFLICT_VERSION_MISMATCH',
          message: 'Inventory version conflict. Another mutation was applied concurrently.',
          details: input.expectedVersion == null
            ? []
            : [
                { field: 'expectedVersion', value: String(input.expectedVersion) },
                ...(typeof currentVersion === 'number'
                  ? [{ field: 'currentVersion', value: String(currentVersion) }]
                  : []),
              ],
          traceId,
        },
      };
    }
    throw err;
  }
}

// ── On-Hand Lookup (ZAI-134 spec AC5) ────────────────────────────

export async function getOnHandBySku(filters: {
  brandId?: number;
  style?: string;
  colorId?: number;
  sizeId?: number;
}): Promise<OnHandSkuResult | null> {
  const db = getDb();

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (filters.brandId) {
    conditions.push('s.brand_id = ?');
    values.push(filters.brandId);
  }
  if (filters.style) {
    conditions.push('s.style = ?');
    values.push(filters.style);
  }
  if (filters.colorId) {
    conditions.push('s.color_id = ?');
    values.push(filters.colorId);
  }
  if (filters.sizeId) {
    conditions.push('s.size_type_id = ?');
    values.push(filters.sizeId);
  }

  if (conditions.length === 0) return null;

  const whereClause = conditions.join(' AND ');

  const row = db.prepare(`
    SELECT
      s.id as sku_id,
      s.sku_code,
      rb.name as brand_name,
      s.style,
      rc.name as color_name,
      s.department
    FROM skus s
    LEFT JOIN ref_brands rb ON rb.id = s.brand_id
    LEFT JOIN ref_colors rc ON rc.id = s.color_id
    WHERE ${whereClause} AND s.active = 1
    LIMIT 1
  `).get(...values) as {
    sku_id: string; sku_code: string; brand_name: string | null; style: string;
    color_name: string | null; department: string;
  } | undefined;

  if (!row) return null;
  const inventory = await getAggregateInventoryRow(row.sku_id);
  const onHandUnits = inventory?.quantityOnHand ?? 0;
  const reservedUnits = inventory?.quantityReserved ?? 0;

  return {
    skuId: row.sku_id,
    skuCode: row.sku_code,
    brand: row.brand_name,
    style: row.style,
    color: row.color_name,
    department: row.department,
    onHandUnits,
    availableUnits: onHandUnits - reservedUnits,
    reservedUnits,
    asOf: new Date().toISOString(),
  };
}

// ── Department On-Hand Summary (ZAI-134 spec AC6) ─────────────────

const ALL_DEPARTMENTS = ['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT'];

export async function getOnHandByDepartments(): Promise<DepartmentOnHand[]> {
  const db = getDb();

  const rows = db.prepare(`
    SELECT
      s.id as sku_id,
      s.department,
      s.price
    FROM skus s
    WHERE s.active = 1
  `).all() as { sku_id: string; department: string; price: number | null }[];

  const inventoryRows = rows.length === 0
    ? []
    : await prisma.inventory.findMany({
        where: {
          skuId: { in: rows.map((row) => row.sku_id) },
          skuSizeId: null,
        },
        select: {
          skuId: true,
          quantityOnHand: true,
        },
      });
  const inventoryBySkuId = new Map(inventoryRows.map((row) => [row.skuId, row.quantityOnHand]));

  const resultMap = new Map<string, DepartmentOnHand>();
  for (const dept of ALL_DEPARTMENTS) {
    resultMap.set(dept, { department: dept, totalSkus: 0, totalUnitsOnHand: 0, totalCostValue: 0 });
  }
  for (const row of rows) {
    const current = resultMap.get(row.department) ?? {
      department: row.department,
      totalSkus: 0,
      totalUnitsOnHand: 0,
      totalCostValue: 0,
    };
    const quantityOnHand = inventoryBySkuId.get(row.sku_id) ?? 0;
    current.totalSkus += 1;
    current.totalUnitsOnHand += quantityOnHand;
    current.totalCostValue += quantityOnHand * (row.price ?? 0);
    resultMap.set(row.department, current);
  }

  return ALL_DEPARTMENTS.map(d => resultMap.get(d)!);
}
