import type { Client } from 'pg';

export interface StockLevelBackfillResult {
  runId: string;
  mirroredSkuCount: number;
  mirrorRowsRead: number;
  baselineCells: number;
  movementRowsReplayed: number;
  projectionRowsWritten: number;
  missingSkuCodes: string[];
  durationMs: number;
}

export interface StockLevelBackfillOptions {
  pgClient: Client;
  runId: string;
}

interface AppSkuRow {
  id: string;
  code: string | null;
  provisionalCode: string | null;
  sizeType: number | null;
}

interface SizeTypeRow {
  code: number;
  maxColumns: number;
  columns: string[];
}

interface MirrorQuantityRow {
  skuCode: string | null;
  storeId: number | null;
  rowLabel: string | null;
  segment: number | null;
  [key: string]: string | number | null;
}

interface MovementRow {
  skuId: string;
  storeId: number;
  columnLabel: string | null;
  rowLabel: string | null;
  quantityDelta: number;
  movementType: string;
  movementAt: Date;
}

interface ProjectionRow {
  skuId: string;
  storeId: number;
  columnLabel: string;
  rowLabel: string;
  onHand: number;
  lastReceivedAt: Date | null;
  lastMovementAt: Date | null;
  version: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function projectionKey(skuId: string, storeId: number, columnLabel: string, rowLabel: string): string {
  return `${skuId}|${storeId}|${columnLabel}|${rowLabel}`;
}

function isReceiptMovementType(movementType: string): boolean {
  const normalized = movementType.trim().toUpperCase();
  return normalized === 'MANUAL_RECEIPT' || normalized === 'PO_RECEIPT';
}

async function loadAppSkuMap(c: Client): Promise<Map<string, AppSkuRow>> {
  const result = await c.query<AppSkuRow>(`
    SELECT
      id,
      code,
      provisional_code AS "provisionalCode",
      size_type AS "sizeType"
    FROM app.sku
  `);

  const out = new Map<string, AppSkuRow>();
  for (const row of result.rows) {
    if (row.code) out.set(row.code.trim(), row);
    if (row.provisionalCode) out.set(row.provisionalCode.trim(), row);
  }
  return out;
}

async function loadSizeTypeMap(c: Client): Promise<Map<number, SizeTypeRow>> {
  const columnSelect = Array.from({ length: 54 }, (_, index) => {
    const n = pad2(index + 1);
    return `columns_${n} AS "Columns_${n}"`;
  }).join(', ');

  const result = await c.query<Record<string, string | number | null>>(`
    SELECT
      code AS "Code",
      max_columns AS "MaxColumns",
      ${columnSelect}
    FROM rics_mirror.size_types
  `);

  const out = new Map<number, SizeTypeRow>();
  for (const row of result.rows) {
    const code = Number(row.Code ?? 0);
    if (!Number.isFinite(code) || code <= 0) continue;

    const maxColumns = Math.min(54, Math.max(0, Number(row.MaxColumns ?? 0)));
    const columns: string[] = [];
    for (let i = 1; i <= maxColumns; i++) {
      columns.push(normalizeLabel(row[`Columns_${pad2(i)}`] as string | null));
    }

    out.set(code, {
      code,
      maxColumns,
      columns,
    });
  }

  return out;
}

async function loadMirrorQuantityRows(c: Client): Promise<MirrorQuantityRow[]> {
  const onHandSelect = Array.from({ length: 18 }, (_, index) => {
    const n = pad2(index + 1);
    return `on_hand_${n} AS "OnHand_${n}"`;
  }).join(', ');

  const result = await c.query<MirrorQuantityRow>(`
    SELECT
      sku AS "skuCode",
      store AS "storeId",
      "row" AS "rowLabel",
      segment AS "segment",
      ${onHandSelect}
    FROM rics_mirror.inventory_quantities
    WHERE sku IS NOT NULL
    ORDER BY sku, store, "row", segment
  `);

  return result.rows;
}

async function loadMovementRows(c: Client): Promise<MovementRow[]> {
  const result = await c.query<MovementRow>(`
    SELECT
      sku_id AS "skuId",
      store_id AS "storeId",
      column_label AS "columnLabel",
      row_label AS "rowLabel",
      quantity_delta AS "quantityDelta",
      movement_type AS "movementType",
      movement_at AS "movementAt"
    FROM app.stock_movement
    ORDER BY movement_at ASC, created_at ASC, id ASC
  `);
  return result.rows;
}

function resolveColumnLabel(sizeType: SizeTypeRow | null, absoluteColumn: number): string {
  if (!sizeType || sizeType.maxColumns === 0) return '';
  return normalizeLabel(sizeType.columns[absoluteColumn - 1]) || String(absoluteColumn);
}

function getOrCreateProjectionRow(
  projection: Map<string, ProjectionRow>,
  skuId: string,
  storeId: number,
  columnLabel: string,
  rowLabel: string,
): ProjectionRow {
  const key = projectionKey(skuId, storeId, columnLabel, rowLabel);
  let row = projection.get(key);
  if (!row) {
    row = {
      skuId,
      storeId,
      columnLabel,
      rowLabel,
      onHand: 0,
      lastReceivedAt: null,
      lastMovementAt: null,
      version: 1,
    };
    projection.set(key, row);
  }
  return row;
}

async function insertProjectionRows(c: Client, rows: ProjectionRow[]): Promise<void> {
  if (rows.length === 0) return;

  const chunkSize = 1000;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const values: unknown[] = [];
    const tuples = chunk.map((row, index) => {
      const base = index * 10;
      values.push(
        row.storeId,
        row.skuId,
        row.columnLabel,
        row.rowLabel,
        row.onHand,
        0,
        row.lastReceivedAt,
        row.lastMovementAt,
        row.version,
        row.lastMovementAt ?? row.lastReceivedAt ?? new Date(),
      );
      return `(
        gen_random_uuid(),
        $${base + 1},
        $${base + 2},
        $${base + 3},
        $${base + 4},
        $${base + 5},
        $${base + 6},
        $${base + 7},
        $${base + 8},
        $${base + 9},
        NOW(),
        $${base + 10}
      )`;
    });

    await c.query(
      `
      INSERT INTO app.stock_level (
        id,
        store_id,
        sku_id,
        column_label,
        row_label,
        on_hand,
        reserved,
        last_received_at,
        last_movement_at,
        version,
        created_at,
        updated_at
      )
      VALUES ${tuples.join(',\n')}
      `,
      values,
    );
  }
}

export async function stockLevelBackfill(
  opts: StockLevelBackfillOptions,
): Promise<StockLevelBackfillResult> {
  const { pgClient: c, runId } = opts;
  const startedMs = Date.now();

  await c.query('BEGIN');
  try {
    const skuMap = await loadAppSkuMap(c);
    const sizeTypeMap = await loadSizeTypeMap(c);
    const quantityRows = await loadMirrorQuantityRows(c);
    const movementRows = await loadMovementRows(c);

    const projection = new Map<string, ProjectionRow>();
    const missingSkuCodes = new Set<string>();

    for (const row of quantityRows) {
      const skuCode = normalizeLabel(row.skuCode);
      if (!skuCode) continue;

      const sku = skuMap.get(skuCode);
      if (!sku) {
        missingSkuCodes.add(skuCode);
        continue;
      }

      const storeId = Number(row.storeId ?? 0);
      if (!Number.isFinite(storeId) || storeId <= 0) continue;

      const sizeType = sku.sizeType != null ? sizeTypeMap.get(Number(sku.sizeType)) ?? null : null;
      const rowLabel = sizeType ? normalizeLabel(row.rowLabel as string | null) : '';
      const segment = Math.max(1, Number(row.segment ?? 1));
      const firstAbsoluteColumn = (segment - 1) * 18 + 1;

      for (let i = 1; i <= 18; i++) {
        const qty = Number(row[`OnHand_${pad2(i)}`] ?? 0) || 0;
        if (qty === 0) continue;

        const absoluteColumn = firstAbsoluteColumn + (i - 1);
        if (sizeType && sizeType.maxColumns > 0 && absoluteColumn > sizeType.maxColumns) continue;

        const columnLabel = resolveColumnLabel(sizeType, absoluteColumn);
        const projectionRow = getOrCreateProjectionRow(projection, sku.id, storeId, columnLabel, rowLabel);
        projectionRow.onHand += qty;
      }
    }

    const baselineCells = projection.size;

    for (const movement of movementRows) {
      const projectionRow = getOrCreateProjectionRow(
        projection,
        movement.skuId,
        movement.storeId,
        normalizeLabel(movement.columnLabel),
        normalizeLabel(movement.rowLabel),
      );

      projectionRow.onHand += Number(movement.quantityDelta ?? 0);
      projectionRow.version += 1;

      if (!projectionRow.lastMovementAt || movement.movementAt > projectionRow.lastMovementAt) {
        projectionRow.lastMovementAt = movement.movementAt;
      }
      if (
        isReceiptMovementType(movement.movementType) &&
        (!projectionRow.lastReceivedAt || movement.movementAt > projectionRow.lastReceivedAt)
      ) {
        projectionRow.lastReceivedAt = movement.movementAt;
      }
    }

    const projectionRows = [...projection.values()].filter((row) => {
      return row.onHand !== 0 || row.lastMovementAt != null || row.lastReceivedAt != null;
    });

    await c.query('TRUNCATE TABLE app.stock_level');
    await insertProjectionRows(c, projectionRows);
    await c.query('COMMIT');

    return {
      runId,
      mirroredSkuCount: skuMap.size,
      mirrorRowsRead: quantityRows.length,
      baselineCells,
      movementRowsReplayed: movementRows.length,
      projectionRowsWritten: projectionRows.length,
      missingSkuCodes: [...missingSkuCodes].sort(),
      durationMs: Date.now() - startedMs,
    };
  } catch (err) {
    try {
      await c.query('ROLLBACK');
    } catch {
      // ignore rollback failure; surface original error
    }
    throw err;
  }
}
