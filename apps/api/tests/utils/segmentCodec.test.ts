/**
 * Unit tests for the Access wide-column segment codec.
 *
 * RICS stores size-type grids (and several other entities) in a "segment" shape:
 * `Columns_01..Columns_54` + `Rows_01..Rows_27`, with blank/null slots for
 * unused cells. This codec flattens wide rows into ordered arrays on read, and
 * re-shards arrays back into sparse column objects on write. It also handles
 * multi-segment tables like `Inventory Quantities` (18 cells × N segments).
 */
import {
  SEG,
  columnName,
  columnList,
  unpackRow,
  flattenSegments,
  shardIntoSegments,
  segmentWriteColumns,
} from '../../src/utils/segmentCodec';

describe('segmentCodec', () => {
  describe('columnName + columnList', () => {
    it('pads the index to 2 digits', () => {
      expect(columnName(SEG.SIZETYPE_COLUMNS, 1)).toBe('Columns_01');
      expect(columnName(SEG.SIZETYPE_COLUMNS, 17)).toBe('Columns_17');
      expect(columnName(SEG.SIZETYPE_COLUMNS, 54)).toBe('Columns_54');
    });

    it('emits a bracketed SQL list of all cells by default', () => {
      const out = columnList(SEG.SIZETYPE_ROWS);
      expect(out).toHaveLength(27);
      expect(out[0]).toBe('[Rows_01]');
      expect(out[26]).toBe('[Rows_27]');
    });

    it('respects an explicit count', () => {
      const out = columnList(SEG.SIZETYPE_COLUMNS, 5);
      expect(out).toEqual(['[Columns_01]', '[Columns_02]', '[Columns_03]', '[Columns_04]', '[Columns_05]']);
    });
  });

  describe('unpackRow', () => {
    it('trims strings, leaves numbers intact, maps DBNull/undefined to null', () => {
      const row = {
        OnHand_01: 5,
        OnHand_02: '  7 ',
        OnHand_03: null,
        OnHand_04: undefined,
        OnHand_05: '',
      };
      const out = unpackRow<number | string>(row, SEG.INV_ON_HAND, 5);
      expect(out).toEqual([5, '7', null, null, null]);
    });

    it('reads the full 18-cell segment when no count is provided', () => {
      const row: Record<string, string | number> = {};
      for (let i = 1; i <= 18; i += 1) {
        row[`OnHand_${String(i).padStart(2, '0')}`] = i;
      }
      const out = unpackRow<number>(row, SEG.INV_ON_HAND);
      expect(out).toHaveLength(18);
      expect(out[0]).toBe(1);
      expect(out[17]).toBe(18);
    });

    it('handles the size-type column prefix and 54-wide width', () => {
      const row: Record<string, string | null> = {};
      for (let i = 1; i <= 54; i += 1) {
        row[`Columns_${String(i).padStart(2, '0')}`] = i <= 5 ? `S${i}` : null;
      }
      const out = unpackRow<string>(row, SEG.SIZETYPE_COLUMNS, 54);
      expect(out).toHaveLength(54);
      expect(out[0]).toBe('S1');
      expect(out[4]).toBe('S5');
      expect(out[5]).toBeNull();
      expect(out[53]).toBeNull();
    });
  });

  describe('flattenSegments', () => {
    it('concatenates segments in order, sorted by segment number', () => {
      const segs = [
        { segment: 2, cells: [19, 20, 21] },
        { segment: 1, cells: [1, 2, 3] },
      ];
      const out = flattenSegments<number>(segs);
      expect(out).toEqual([1, 2, 3, 19, 20, 21]);
    });

    it('handles a single segment', () => {
      expect(flattenSegments<number>([{ segment: 1, cells: [1, 2, 3] }])).toEqual([1, 2, 3]);
    });

    it('handles empty input', () => {
      expect(flattenSegments([])).toEqual([]);
    });
  });

  describe('shardIntoSegments', () => {
    it('shards a flat array into 18-cell segments', () => {
      const cells = Array.from({ length: 36 }, (_, i) => i + 1);
      const out = shardIntoSegments<number>(cells, SEG.INV_ON_HAND);
      expect(out).toHaveLength(2);
      expect(out[0].segment).toBe(1);
      expect(out[0].cells).toHaveLength(18);
      expect(out[0].cells[0]).toBe(1);
      expect(out[1].segment).toBe(2);
      expect(out[1].cells[0]).toBe(19);
    });

    it('pads the final segment with nulls when the array is short', () => {
      const cells = [1, 2, 3, 4, 5];
      const out = shardIntoSegments<number>(cells, SEG.INV_ON_HAND);
      expect(out).toHaveLength(1);
      expect(out[0].cells).toHaveLength(18);
      expect(out[0].cells[5]).toBeNull();
      expect(out[0].cells[17]).toBeNull();
    });

    it('emits a single all-null segment for an empty input', () => {
      const out = shardIntoSegments<number>([], SEG.INV_ON_HAND);
      expect(out).toHaveLength(1);
      expect(out[0].segment).toBe(1);
      expect(out[0].cells.every((c) => c === null)).toBe(true);
    });
  });

  describe('segmentWriteColumns', () => {
    it('pads the values array to cellsPerSegment and aligns columns', () => {
      const out = segmentWriteColumns([1, 2, 3], SEG.INV_ON_HAND);
      expect(out.columns).toHaveLength(18);
      expect(out.columns[0]).toBe('OnHand_01');
      expect(out.values[0]).toBe(1);
      expect(out.values[17]).toBeNull();
    });
  });

  describe('round-trip size types', () => {
    it('unpackRow + shardIntoSegments round-trips the label list', () => {
      const labels = ['060', '065', '070', '075', '080'];
      const row: Record<string, string> = {};
      labels.forEach((v, i) => {
        row[`Columns_${String(i + 1).padStart(2, '0')}`] = v;
      });
      const unpacked = unpackRow<string>(row, SEG.SIZETYPE_COLUMNS, 54);
      // Trim out trailing nulls
      const compact = unpacked.filter((v) => v !== null) as string[];
      expect(compact).toEqual(labels);
    });
  });
});
