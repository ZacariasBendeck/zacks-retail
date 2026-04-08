import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import {
  Inventory,
  InventoryRow,
  AuditLogEntry,
  AuditLogRow,
  StockAdjustmentInput,
  InventoryMutationInput,
  OnHandSkuResult,
  DepartmentOnHand,
  rowToInventory,
  rowToAuditLog,
} from '../models/inventory';
import { PaginationEnvelope } from '../models/sku';

export function getInventoryBySkuId(skuId: string): Inventory | null {
  const db = getDb();

  const skuExists = db.prepare('SELECT id FROM skus WHERE id = ?').get(skuId);
  if (!skuExists) return null;

  const row = db.prepare('SELECT * FROM inventory WHERE sku_id = ?').get(skuId) as unknown as InventoryRow | undefined;
  if (!row) return null;

  return rowToInventory(row);
}

export function adjustStock(skuId: string, input: StockAdjustmentInput): { inventory: Inventory; auditEntry: AuditLogEntry } {
  const db = getDb();

  const skuExists = db.prepare('SELECT id FROM skus WHERE id = ?').get(skuId);
  if (!skuExists) {
    throw new Error('SKU_NOT_FOUND');
  }

  const invRow = db.prepare('SELECT * FROM inventory WHERE sku_id = ?').get(skuId) as unknown as InventoryRow | undefined;
  if (!invRow) {
    throw new Error('SKU_NOT_FOUND');
  }

  const newBalance = invRow.quantity_on_hand + input.adjustment;
  if (newBalance < 0) {
    throw new Error('INSUFFICIENT_STOCK');
  }

  // Use a transaction pattern: node:sqlite doesn't have transaction(), so we use exec
  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(
      "UPDATE inventory SET quantity_on_hand = ?, version = version + 1, updated_at = datetime('now') WHERE sku_id = ?"
    ).run(newBalance, skuId);

    const auditId = uuidv4();
    db.prepare(
      'INSERT INTO inventory_audit_log (id, sku_id, adjustment, reason, resulting_balance, performed_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(auditId, skuId, input.adjustment, input.reason, newBalance, input.performedBy ?? 'system');

    db.exec('COMMIT');

    const updatedRow = db.prepare('SELECT * FROM inventory WHERE sku_id = ?').get(skuId) as unknown as InventoryRow;
    const auditRow = db.prepare('SELECT * FROM inventory_audit_log WHERE id = ?').get(auditId) as unknown as AuditLogRow;

    return {
      inventory: rowToInventory(updatedRow),
      auditEntry: rowToAuditLog(auditRow),
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

const AUDIT_SORT_MAP: Record<string, string> = {
  createdAt: 'created_at',
  adjustment: 'adjustment',
};

export function getAuditLog(
  skuId: string,
  params: { page: number; pageSize: number; sort?: string; order?: 'asc' | 'desc' }
): PaginationEnvelope<AuditLogEntry> | null {
  const db = getDb();

  const skuExists = db.prepare('SELECT id FROM skus WHERE id = ?').get(skuId);
  if (!skuExists) return null;

  const countRow = db.prepare(
    'SELECT COUNT(*) as total FROM inventory_audit_log WHERE sku_id = ?'
  ).get(skuId) as unknown as { total: number };

  const totalItems = countRow.total;
  const totalPages = Math.ceil(totalItems / params.pageSize);
  const offset = (params.page - 1) * params.pageSize;

  const sortCol = AUDIT_SORT_MAP[params.sort ?? 'createdAt'] || 'created_at';
  const sortDir = params.order === 'desc' ? 'DESC' : 'ASC';

  const rows = db.prepare(
    `SELECT * FROM inventory_audit_log WHERE sku_id = ? ORDER BY ${sortCol} ${sortDir}, rowid DESC LIMIT ? OFFSET ?`
  ).all(skuId, params.pageSize, offset) as unknown as AuditLogRow[];

  return {
    data: rows.map(rowToAuditLog),
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

export function executeMutation(input: InventoryMutationInput): MutationResult | MutationError {
  const traceId = uuidv4();
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
    const existing = db.prepare(
      'SELECT * FROM inventory_audit_log WHERE idempotency_key = ?'
    ).get(input.idempotencyKey) as unknown as AuditLogRow | undefined;

    if (existing) {
      // Same key found — verify payload matches (simplified: check skuId + delta)
      if (existing.sku_id !== input.skuId || existing.adjustment !== input.quantityDelta) {
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
      const entry = rowToAuditLog(existing);
      const currentInv = db.prepare('SELECT version FROM inventory WHERE sku_id = ?').get(input.skuId) as { version: number } | undefined;
      return { ...entry, version: currentInv?.version ?? 1, idempotentReplay: true };
    }
  }

  // Get or create inventory row
  let invRow = db.prepare('SELECT * FROM inventory WHERE sku_id = ?').get(input.skuId) as unknown as InventoryRow | undefined;

  db.exec('BEGIN TRANSACTION');
  try {
    if (!invRow) {
      const invId = uuidv4();
      db.prepare(
        "INSERT INTO inventory (id, sku_id, quantity_on_hand, quantity_reserved, version) VALUES (?, ?, 0, 0, 1)"
      ).run(invId, input.skuId);
      invRow = db.prepare('SELECT * FROM inventory WHERE id = ?').get(invId) as unknown as InventoryRow;
    }

    // Optimistic concurrency: if expectedVersion is provided, verify it matches
    if (input.expectedVersion !== undefined && input.expectedVersion !== invRow.version) {
      db.exec('ROLLBACK');
      return {
        error: {
          code: 'CONFLICT_VERSION_MISMATCH',
          message: 'Inventory version conflict. Another mutation was applied concurrently.',
          details: [
            { field: 'expectedVersion', value: String(input.expectedVersion) },
            { field: 'currentVersion', value: String(invRow.version) },
          ],
          traceId,
        },
      };
    }

    const newBalance = invRow.quantity_on_hand + input.quantityDelta;
    if (newBalance < 0) {
      db.exec('ROLLBACK');
      return {
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: 'Mutation would bring quantity below zero.',
          details: [
            { field: 'quantityDelta', value: String(input.quantityDelta) },
            { field: 'currentOnHand', value: String(invRow.quantity_on_hand) },
          ],
          traceId,
        },
      };
    }

    const newVersion = (invRow.version ?? 1) + 1;

    // Atomic update with version increment; WHERE version = ? ensures no concurrent write sneaked in
    const updateResult = db.prepare(
      "UPDATE inventory SET quantity_on_hand = ?, version = ?, updated_at = datetime('now') WHERE sku_id = ? AND version = ?"
    ).run(newBalance, newVersion, input.skuId, invRow.version);

    if ((updateResult as any).changes === 0) {
      db.exec('ROLLBACK');
      return {
        error: {
          code: 'CONFLICT_VERSION_MISMATCH',
          message: 'Inventory version conflict. Another mutation was applied concurrently.',
          details: [
            { field: 'expectedVersion', value: String(invRow.version) },
            { field: 'currentVersion', value: 'unknown (row changed)' },
          ],
          traceId,
        },
      };
    }

    const auditId = uuidv4();
    db.prepare(
      `INSERT INTO inventory_audit_log
        (id, sku_id, adjustment, reason, resulting_balance, performed_by,
         source_document_ref_type, source_document_ref_id, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      auditId, input.skuId, input.quantityDelta, input.reasonCode, newBalance,
      input.actorId, input.sourceDocumentRef.type, input.sourceDocumentRef.id,
      input.idempotencyKey ?? null,
    );

    db.exec('COMMIT');

    const auditRow = db.prepare('SELECT * FROM inventory_audit_log WHERE id = ?').get(auditId) as unknown as AuditLogRow;
    return { ...rowToAuditLog(auditRow), version: newVersion };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ── On-Hand Lookup (ZAI-134 spec AC5) ────────────────────────────

export function getOnHandBySku(filters: {
  brandId?: number;
  style?: string;
  colorId?: number;
  sizeId?: number;
}): OnHandSkuResult | null {
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
      s.department,
      COALESCE(i.quantity_on_hand, 0) as on_hand_units,
      COALESCE(i.quantity_on_hand, 0) - COALESCE(i.quantity_reserved, 0) as available_units,
      COALESCE(i.quantity_reserved, 0) as reserved_units,
      datetime('now') as as_of
    FROM skus s
    LEFT JOIN ref_brands rb ON rb.id = s.brand_id
    LEFT JOIN ref_colors rc ON rc.id = s.color_id
    LEFT JOIN inventory i ON i.sku_id = s.id
    WHERE ${whereClause} AND s.active = 1
    LIMIT 1
  `).get(...values) as {
    sku_id: string; sku_code: string; brand_name: string | null; style: string;
    color_name: string | null; department: string; on_hand_units: number;
    available_units: number; reserved_units: number; as_of: string;
  } | undefined;

  if (!row) return null;

  return {
    skuId: row.sku_id,
    skuCode: row.sku_code,
    brand: row.brand_name,
    style: row.style,
    color: row.color_name,
    department: row.department,
    onHandUnits: row.on_hand_units,
    availableUnits: row.available_units,
    reservedUnits: row.reserved_units,
    asOf: row.as_of,
  };
}

// ── Department On-Hand Summary (ZAI-134 spec AC6) ─────────────────

const ALL_DEPARTMENTS = ['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT'];

export function getOnHandByDepartments(): DepartmentOnHand[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT
      s.department,
      COUNT(DISTINCT s.id) as total_skus,
      COALESCE(SUM(i.quantity_on_hand), 0) as total_units_on_hand,
      COALESCE(SUM(i.quantity_on_hand * s.price), 0) as total_cost_value
    FROM skus s
    LEFT JOIN inventory i ON i.sku_id = s.id
    WHERE s.active = 1
    GROUP BY s.department
  `).all() as { department: string; total_skus: number; total_units_on_hand: number; total_cost_value: number }[];

  const resultMap = new Map<string, DepartmentOnHand>();
  for (const dept of ALL_DEPARTMENTS) {
    resultMap.set(dept, { department: dept, totalSkus: 0, totalUnitsOnHand: 0, totalCostValue: 0 });
  }
  for (const row of rows) {
    resultMap.set(row.department, {
      department: row.department,
      totalSkus: row.total_skus,
      totalUnitsOnHand: row.total_units_on_hand,
      totalCostValue: row.total_cost_value,
    });
  }

  return ALL_DEPARTMENTS.map(d => resultMap.get(d)!);
}
