import { Client } from 'pg';

const DEFAULT_SIZE_TYPE_TABLE = 'rics_mirror.size_types';
const DEFAULT_QUANTITY_TABLE = 'rics_mirror.inventory_quantities';
const IMPORT_SOURCE = 'RICS_IMPORT';

export interface InventorySalesCellBackfillResult {
  runId: string;
  mirrorRowsRead: number;
  targetRowsPrepared: number;
  importedRows: number;
  durationMs: number;
  skippedMissingSkuRows: number;
  missingSkuCodes: string[];
}

export interface InventorySalesCellBackfillOptions {
  pgClient: Client;
  runId: string;
  sourceSizeTypeTable?: string;
  sourceQuantityTable?: string;
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

interface ProjectionRow {
  storeId: number;
  skuId: string;
  columnLabel: string;
  rowLabel: string;
  mtdSales: number;
  stdSales: number;
  ytdSales: number;
  lySales: number;
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

function quoteQualifiedRef(ref: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(ref)) {
    throw new Error(`Invalid table reference: ${ref}`);
  }
  return ref
    .split('.')
    .map((part) => `"${part}"`)
    .join('.');
}

function resolveColumnLabel(sizeType: SizeTypeRow | null, absoluteColumn: number): string {
  if (!sizeType || sizeType.maxColumns === 0) {
    return absoluteColumn === 1 ? '' : String(absoluteColumn);
  }
  return normalizeLabel(sizeType.columns[absoluteColumn - 1]) || String(absoluteColumn);
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

async function loadSizeTypeMap(c: Client, sourceTable: string): Promise<Map<number, SizeTypeRow>> {
  const columnSelect = Array.from({ length: 54 }, (_, index) => {
    const n = pad2(index + 1);
    return `columns_${n} AS "Columns_${n}"`;
  }).join(', ');
  const sourceRef = quoteQualifiedRef(sourceTable);

  const result = await c.query<Record<string, string | number | null>>(`
    SELECT
      code AS "Code",
      max_columns AS "MaxColumns",
      ${columnSelect}
    FROM ${sourceRef}
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

    out.set(code, { code, maxColumns, columns });
  }

  return out;
}

async function loadMirrorQuantityRows(c: Client, sourceTable: string): Promise<MirrorQuantityRow[]> {
  const metricSelect = ['m_t_d_sales_', 's_t_d_sales_', 'y_t_d_sales_', 'ly_sales_']
    .flatMap((prefix) =>
      Array.from({ length: 18 }, (_, index) => {
        const n = pad2(index + 1);
        return `${prefix}${n} AS "${prefix}${n}"`;
      }),
    )
    .join(', ');
  const sourceRef = quoteQualifiedRef(sourceTable);

  const result = await c.query<MirrorQuantityRow>(`
    SELECT
      sku AS "skuCode",
      store AS "storeId",
      "row" AS "rowLabel",
      segment AS "segment",
      ${metricSelect}
    FROM ${sourceRef}
    WHERE sku IS NOT NULL
    ORDER BY sku, store, "row", segment
  `);

  return result.rows;
}

async function truncateProjectionRows(c: Client): Promise<void> {
  await c.query('TRUNCATE TABLE app.inventory_sales_cell');
}

async function insertProjectionRows(c: Client, rows: ProjectionRow[], runId: string): Promise<number> {
  if (rows.length === 0) return 0;

  let inserted = 0;
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
        row.mtdSales,
        row.stdSales,
        row.ytdSales,
        row.lySales,
        IMPORT_SOURCE,
        runId,
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
        $${base + 10}::uuid,
        NOW(),
        NOW()
      )`;
    });

    const result = await c.query(
      `
      INSERT INTO app.inventory_sales_cell (
        id,
        store_id,
        sku_id,
        column_label,
        row_label,
        mtd_sales,
        std_sales,
        ytd_sales,
        ly_sales,
        source,
        source_run_id,
        created_at,
        updated_at
      )
      VALUES ${tuples.join(',\n')}
      `,
      values,
    );
    inserted += Number(result.rowCount ?? 0);
  }

  return inserted;
}

export async function inventorySalesCellBackfill(
  opts: InventorySalesCellBackfillOptions,
): Promise<InventorySalesCellBackfillResult> {
  const { pgClient: c, runId } = opts;
  const sourceSizeTypeTable = opts.sourceSizeTypeTable ?? DEFAULT_SIZE_TYPE_TABLE;
  const sourceQuantityTable = opts.sourceQuantityTable ?? DEFAULT_QUANTITY_TABLE;
  const startedMs = Date.now();

  await c.query('BEGIN');
  try {
    const skuMap = await loadAppSkuMap(c);
    const sizeTypeMap = await loadSizeTypeMap(c, sourceSizeTypeTable);
    const quantityRows = await loadMirrorQuantityRows(c, sourceQuantityTable);

    const projection = new Map<string, ProjectionRow>();
    const missingSkuCodes = new Set<string>();
    let skippedMissingSkuRows = 0;

    for (const row of quantityRows) {
      const skuCode = normalizeLabel(row.skuCode);
      if (!skuCode) continue;

      const sku = skuMap.get(skuCode);
      if (!sku) {
        missingSkuCodes.add(skuCode);
        skippedMissingSkuRows += 1;
        continue;
      }

      const storeId = Number(row.storeId ?? 0);
      if (!Number.isFinite(storeId) || storeId < 0) continue;

      const sizeType = sku.sizeType != null ? sizeTypeMap.get(Number(sku.sizeType)) ?? null : null;
      const rowLabel = sizeType ? normalizeLabel(row.rowLabel as string | null) : '';
      const segment = Math.max(1, Number(row.segment ?? 1));
      const firstAbsoluteColumn = (segment - 1) * 18 + 1;

      for (let i = 1; i <= 18; i++) {
        const absoluteColumn = firstAbsoluteColumn + (i - 1);
        if (sizeType && absoluteColumn > sizeType.maxColumns) break;

        const mtdSales = Number(row[`m_t_d_sales_${pad2(i)}`] ?? 0) || 0;
        const stdSales = Number(row[`s_t_d_sales_${pad2(i)}`] ?? 0) || 0;
        const ytdSales = Number(row[`y_t_d_sales_${pad2(i)}`] ?? 0) || 0;
        const lySales = Number(row[`ly_sales_${pad2(i)}`] ?? 0) || 0;
        if (mtdSales === 0 && stdSales === 0 && ytdSales === 0 && lySales === 0) continue;

        const columnLabel = resolveColumnLabel(sizeType, absoluteColumn);
        if (!columnLabel && !rowLabel && absoluteColumn > 1) continue;

        const key = projectionKey(sku.id, storeId, columnLabel, rowLabel);
        const current = projection.get(key) ?? {
          storeId,
          skuId: sku.id,
          columnLabel,
          rowLabel,
          mtdSales: 0,
          stdSales: 0,
          ytdSales: 0,
          lySales: 0,
        };
        current.mtdSales += mtdSales;
        current.stdSales += stdSales;
        current.ytdSales += ytdSales;
        current.lySales += lySales;
        projection.set(key, current);
      }
    }

    const projectionRows = [...projection.values()];
    await truncateProjectionRows(c);
    const importedRows = await insertProjectionRows(c, projectionRows, runId);
    await c.query('COMMIT');

    return {
      runId,
      mirrorRowsRead: quantityRows.length,
      targetRowsPrepared: projectionRows.length,
      importedRows,
      durationMs: Date.now() - startedMs,
      skippedMissingSkuRows,
      missingSkuCodes: [...missingSkuCodes].sort(),
    };
  } catch (error) {
    try {
      await c.query('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    throw error;
  }
}
