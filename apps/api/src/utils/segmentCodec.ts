/**
 * segmentCodec — pack/unpack the "wide-column segment" shape RICS uses in
 * several tables:
 *
 *   • `SizeTypes` — `Columns_01..54`, `Rows_01..27` (single-row shape, no Segment)
 *   • `Inventory Quantities` — `OnHand_01..18`, `CurrentOnOrder_01..18`, ...
 *     (multi-segment shape, rows are keyed by `(SKU, Store, Row, Segment)`)
 *   • `RILABLS.Labels` — `Counts_01..18` with the same (SKU, Row, Segment) key
 *   • `NRMACodes` — `NRMACode_01..18` keyed by `(Code, Row, Segment)`
 *
 * The RICS convention: each segment row holds up to N cells (18 for inventory
 * tables, 54 for SizeTypes because it has no Segment column). If a size type
 * has more than 18 columns, the inventory table stores multiple segment rows.
 *
 * Codec responsibilities:
 *   1. Flatten wide columns into ordered arrays (read path).
 *   2. Re-shard a flat array back into segment rows for writes (write path).
 *   3. Provide helpers to emit the `Columns_XX` / `OnHand_XX` column lists for
 *      SQL projection without typos.
 *
 * Used by: SizeTypeRepository (Step 2), plus later the inventory, labels, and
 * NRMA repos in subsequent steps.
 */

export interface SegmentShape {
  /** The column-family prefix, e.g. 'Columns', 'OnHand', 'Counts', 'NRMACode'. */
  prefix: string;
  /** 2-digit zero-padded width of the column suffix (always 2 in RICS). */
  padding: number;
  /** How many cells per segment row (18 for inventory, 54 for SizeTypes). */
  cellsPerSegment: number;
}

export const SEG = {
  SIZETYPE_COLUMNS: { prefix: 'Columns', padding: 2, cellsPerSegment: 54 } as SegmentShape,
  SIZETYPE_ROWS: { prefix: 'Rows', padding: 2, cellsPerSegment: 27 } as SegmentShape,
  INV_ON_HAND: { prefix: 'OnHand', padding: 2, cellsPerSegment: 18 } as SegmentShape,
  INV_CURRENT_ON_ORDER: { prefix: 'CurrentOnOrder', padding: 2, cellsPerSegment: 18 } as SegmentShape,
  INV_FUTURE_ON_ORDER: { prefix: 'FutureOnOrder', padding: 2, cellsPerSegment: 18 } as SegmentShape,
  INV_MODEL: { prefix: 'Model', padding: 2, cellsPerSegment: 18 } as SegmentShape,
  LABEL_COUNTS: { prefix: 'Counts', padding: 2, cellsPerSegment: 18 } as SegmentShape,
  NRMA_CODE: { prefix: 'NRMACode', padding: 2, cellsPerSegment: 18 } as SegmentShape,
};

/** Generate the column name for cell `index` (1-based) under `shape`. */
export function columnName(shape: SegmentShape, index: number): string {
  return `${shape.prefix}_${String(index).padStart(shape.padding, '0')}`;
}

/** Emit a bracketed list of all cell columns for SQL projection. */
export function columnList(shape: SegmentShape, count?: number): string[] {
  const max = count ?? shape.cellsPerSegment;
  const out: string[] = [];
  for (let i = 1; i <= max; i++) out.push(`[${columnName(shape, i)}]`);
  return out;
}

/**
 * Read one segment row (as returned by OLE DB) and collect its cells into an
 * ordered array. Trims strings; passes numbers through; maps DBNull/undefined
 * to `null`.
 */
export function unpackRow<T = string | number | null>(
  row: Record<string, unknown>,
  shape: SegmentShape,
  count?: number,
): Array<T | null> {
  const max = count ?? shape.cellsPerSegment;
  const out: Array<T | null> = [];
  for (let i = 1; i <= max; i++) {
    const raw = row[columnName(shape, i)];
    if (raw === undefined || raw === null) {
      out.push(null);
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim();
      out.push((trimmed === '' ? null : (trimmed as unknown as T)));
    } else {
      out.push(raw as unknown as T);
    }
  }
  return out;
}

/**
 * Flatten a group of segment rows keyed by `Segment` (1-based) into a single
 * array, concatenating cells in order. For tables like `Inventory Quantities`
 * where one logical entity spans multiple segment rows, `cells` is returned
 * in the natural column order (segment1.cells[0..17], segment2.cells[0..17], ...).
 */
export function flattenSegments<T = string | number | null>(
  segmentRows: Array<{ segment: number; cells: Array<T | null> }>,
): Array<T | null> {
  const sorted = [...segmentRows].sort((a, b) => a.segment - b.segment);
  const out: Array<T | null> = [];
  for (const s of sorted) out.push(...s.cells);
  return out;
}

/**
 * Re-shard a flat cell array into an array of segment rows for writes.
 * Fills trailing cells in the final segment with `null` if the flat array is
 * shorter than `shape.cellsPerSegment * segmentCount`.
 */
export function shardIntoSegments<T = string | number | null>(
  cells: Array<T | null>,
  shape: SegmentShape,
): Array<{ segment: number; cells: Array<T | null> }> {
  if (cells.length === 0) {
    return [{ segment: 1, cells: Array.from({ length: shape.cellsPerSegment }, () => null) }];
  }
  const segments: Array<{ segment: number; cells: Array<T | null> }> = [];
  let segIndex = 0;
  while (segIndex * shape.cellsPerSegment < cells.length) {
    const slice = cells.slice(
      segIndex * shape.cellsPerSegment,
      (segIndex + 1) * shape.cellsPerSegment,
    );
    // Pad out to a full row so every column has a value.
    while (slice.length < shape.cellsPerSegment) slice.push(null);
    segments.push({ segment: segIndex + 1, cells: slice });
    segIndex += 1;
  }
  return segments;
}

/**
 * Build a parameterized column-to-value mapping for an INSERT/UPDATE segment
 * row. Returns the ordered list of column names and the ordered list of
 * placeholder values — caller is responsible for turning the values into
 * `AccessParam` entries with the right types.
 */
export function segmentWriteColumns(
  cells: Array<string | number | null>,
  shape: SegmentShape,
): { columns: string[]; values: Array<string | number | null> } {
  const columns: string[] = [];
  const values: Array<string | number | null> = [];
  for (let i = 0; i < shape.cellsPerSegment; i++) {
    columns.push(columnName(shape, i + 1));
    values.push(cells[i] ?? null);
  }
  return { columns, values };
}
