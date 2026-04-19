/**
 * SizeType repository — RISIZE.MDB / `SizeTypes`.
 *
 * Schema: Code SMALLINT | Desc WCHAR | ColumnDesc WCHAR | RowDesc WCHAR |
 *   Columns_01..54 WCHAR | Rows_01..27 WCHAR | MaxColumns SMALLINT |
 *   MaxRows SMALLINT | TableType WCHAR | DateLastChanged DATE
 *
 * RICS p. 147 — a Size Type is the grid shape for a SKU: up to 54 columns
 * (e.g. size numbers) × 27 rows (e.g. widths). `ColumnDesc` / `RowDesc` are
 * the axis labels (max 5 chars each). Each `Columns_NN` / `Rows_NN` cell
 * holds the label printed on labels and shown in grids (max 3 chars).
 *
 * Storage note: the physical row is wide (single row per SizeType), so the
 * segment codec only needs to unpack/pack a single row — not the multi-segment
 * shape used by `Inventory Quantities`. We still route through
 * utils/segmentCodec.ts so the same trim/null-handling logic lives in one
 * place.
 */

import { executeQuery, executeNonQuery, type AccessParam } from '../../services/accessOleDb';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { openRicsDb, RicsDb, toRepoError, trimString, coerceNumber } from './ricsAccess';
import { parseAccessDate } from './parseAccessDate';
import {
  SEG,
  columnList,
  columnName,
  unpackRow,
} from '../../utils/segmentCodec';

export interface SizeType {
  code: number;
  description: string;
  columnDescription: string;
  rowDescription: string;
  tableType: string | null;
  /** The non-blank column labels in order (length ≤ `maxColumns`). */
  columns: string[];
  /** The non-blank row labels in order (length ≤ `maxRows`). */
  rows: string[];
  maxColumns: number;
  maxRows: number;
  dateLastChanged: Date | null;
}

export interface SizeTypeInput {
  code: number;
  description: string;
  columnDescription: string;
  rowDescription: string;
  tableType?: string | null;
  columns: string[];
  rows: string[];
}

interface SizeTypeRow {
  Code: number;
  Desc: string | null;
  ColumnDesc: string | null;
  RowDesc: string | null;
  MaxColumns: number | null;
  MaxRows: number | null;
  TableType: string | null;
  DateLastChanged: string | null;
  [cell: string]: unknown;
}

const ALL_COLUMNS = columnList(SEG.SIZETYPE_COLUMNS); // ["[Columns_01]", ..., "[Columns_54]"]
const ALL_ROWS = columnList(SEG.SIZETYPE_ROWS); // ["[Rows_01]", ..., "[Rows_27]"]

function mapRow(row: SizeTypeRow): SizeType {
  const maxColumns = Math.min(54, Math.max(0, coerceNumber(row.MaxColumns) ?? 0));
  const maxRows = Math.min(27, Math.max(0, coerceNumber(row.MaxRows) ?? 0));
  const columns = unpackRow<string>(row, SEG.SIZETYPE_COLUMNS, maxColumns)
    .map((v) => (typeof v === 'string' ? v : v == null ? '' : String(v)))
    .filter((v) => v.length > 0);
  const rows = unpackRow<string>(row, SEG.SIZETYPE_ROWS, maxRows)
    .map((v) => (typeof v === 'string' ? v : v == null ? '' : String(v)))
    .filter((v) => v.length > 0);
  return {
    code: Number(row.Code),
    description: trimString(row.Desc) ?? '',
    columnDescription: trimString(row.ColumnDesc) ?? '',
    rowDescription: trimString(row.RowDesc) ?? '',
    tableType: trimString(row.TableType),
    columns,
    rows,
    maxColumns,
    maxRows,
    dateLastChanged: parseAccessDate(row.DateLastChanged),
  };
}

function validate(input: SizeTypeInput): RepoError | null {
  if (!Number.isInteger(input.code) || input.code < 0 || input.code > 9999) {
    return { kind: 'ConstraintViolation', message: 'Size type code must be a non-negative integer.' };
  }
  const desc = input.description?.trim() ?? '';
  if (desc.length === 0) {
    return { kind: 'ConstraintViolation', message: 'Size type description is required.' };
  }
  if (desc.length > 20) {
    return { kind: 'ConstraintViolation', message: 'Size type description exceeds 20 characters.' };
  }
  if ((input.columnDescription ?? '').trim().length > 5) {
    return { kind: 'ConstraintViolation', message: 'Column description exceeds 5 characters (RICS p. 147).' };
  }
  if ((input.rowDescription ?? '').trim().length > 5) {
    return { kind: 'ConstraintViolation', message: 'Row description exceeds 5 characters (RICS p. 147).' };
  }
  if (!Array.isArray(input.columns) || input.columns.length > 54) {
    return { kind: 'ConstraintViolation', message: 'Columns must be an array of at most 54 labels (RICS p. 147).' };
  }
  if (!Array.isArray(input.rows) || input.rows.length > 27) {
    return { kind: 'ConstraintViolation', message: 'Rows must be an array of at most 27 labels (RICS p. 147).' };
  }
  for (const c of input.columns) {
    if (typeof c !== 'string' || c.trim().length === 0) {
      return { kind: 'ConstraintViolation', message: 'Every column label must be a non-empty string.' };
    }
    if (c.trim().length > 3) {
      return { kind: 'ConstraintViolation', message: `Column label "${c}" exceeds 3 characters (RICS p. 147).` };
    }
  }
  for (const r of input.rows) {
    if (typeof r !== 'string' || r.trim().length === 0) {
      return { kind: 'ConstraintViolation', message: 'Every row label must be a non-empty string.' };
    }
    if (r.trim().length > 2) {
      return { kind: 'ConstraintViolation', message: `Row label "${r}" exceeds 2 characters (RICS p. 147).` };
    }
  }
  return null;
}

function buildInsertOrUpdateColumns(input: SizeTypeInput): { columns: string[]; params: AccessParam[] } {
  const columns: string[] = ['[Code]', '[Desc]', '[ColumnDesc]', '[RowDesc]'];
  const params: AccessParam[] = [
    { value: input.code, type: 'integer' },
    { value: input.description.trim(), type: 'string' },
    { value: (input.columnDescription ?? '').trim(), type: 'string' },
    { value: (input.rowDescription ?? '').trim(), type: 'string' },
  ];
  for (let i = 1; i <= 54; i++) {
    columns.push(`[${columnName(SEG.SIZETYPE_COLUMNS, i)}]`);
    const val = input.columns[i - 1] ?? null;
    params.push(val != null ? { value: val.trim(), type: 'string' } : { value: null, type: 'null' });
  }
  for (let i = 1; i <= 27; i++) {
    columns.push(`[${columnName(SEG.SIZETYPE_ROWS, i)}]`);
    const val = input.rows[i - 1] ?? null;
    params.push(val != null ? { value: val.trim(), type: 'string' } : { value: null, type: 'null' });
  }
  columns.push('[MaxColumns]', '[MaxRows]', '[TableType]', '[DateLastChanged]');
  params.push(
    { value: input.columns.length, type: 'integer' },
    { value: input.rows.length, type: 'integer' },
    input.tableType != null ? { value: input.tableType.trim(), type: 'string' } : { value: null, type: 'null' },
    { value: new Date(), type: 'date' },
  );
  return { columns, params };
}

const LIST_COLUMNS = [
  '[Code]',
  '[Desc]',
  '[ColumnDesc]',
  '[RowDesc]',
  '[MaxColumns]',
  '[MaxRows]',
  '[TableType]',
  '[DateLastChanged]',
  ...ALL_COLUMNS,
  ...ALL_ROWS,
].join(', ');

export const SizeTypeRepository = {
  async list(): Promise<Result<SizeType[]>> {
    try {
      const { path, password } = openRicsDb(RicsDb.SizeTypes);
      const rows = executeQuery<SizeTypeRow>(
        path,
        password,
        `SELECT ${LIST_COLUMNS} FROM [SizeTypes] ORDER BY [Code]`,
      );
      return Ok(rows.map(mapRow));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async getByCode(code: number): Promise<Result<SizeType>> {
    try {
      const { path, password } = openRicsDb(RicsDb.SizeTypes);
      const rows = executeQuery<SizeTypeRow>(
        path,
        password,
        `SELECT ${LIST_COLUMNS} FROM [SizeTypes] WHERE [Code] = ?`,
        [{ value: code, type: 'integer' }],
      );
      if (rows.length === 0) {
        return Err({ kind: 'NotFound', message: `Size type ${code} not found.` });
      }
      return Ok(mapRow(rows[0]));
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async create(input: SizeTypeInput): Promise<Result<SizeType>> {
    const validationErr = validate(input);
    if (validationErr) return Err(validationErr);

    try {
      const { path, password } = openRicsDb(RicsDb.SizeTypes);
      const existing = executeQuery<{ n: number }>(
        path,
        password,
        'SELECT COUNT(*) AS n FROM [SizeTypes] WHERE [Code] = ?',
        [{ value: input.code, type: 'integer' }],
      );
      if ((existing[0]?.n ?? 0) > 0) {
        return Err({ kind: 'DuplicatePrimaryKey', message: `Size type ${input.code} already exists.` });
      }
      const { columns, params } = buildInsertOrUpdateColumns(input);
      const placeholders = columns.map(() => '?').join(', ');
      executeNonQuery(
        path,
        password,
        `INSERT INTO [SizeTypes] (${columns.join(', ')}) VALUES (${placeholders})`,
        params,
      );
      return this.getByCode(input.code);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async update(code: number, patch: Partial<Omit<SizeTypeInput, 'code'>>): Promise<Result<SizeType>> {
    const existing = await this.getByCode(code);
    if (!existing.ok) return existing;

    const merged: SizeTypeInput = {
      code,
      description: patch.description ?? existing.value.description,
      columnDescription: patch.columnDescription ?? existing.value.columnDescription,
      rowDescription: patch.rowDescription ?? existing.value.rowDescription,
      tableType: patch.tableType !== undefined ? patch.tableType : existing.value.tableType,
      columns: patch.columns ?? existing.value.columns,
      rows: patch.rows ?? existing.value.rows,
    };
    const validationErr = validate(merged);
    if (validationErr) return Err(validationErr);

    try {
      const { path, password } = openRicsDb(RicsDb.SizeTypes);
      const { columns, params: insertParams } = buildInsertOrUpdateColumns(merged);
      // Drop [Code] from SET; add as WHERE param.
      const setColumns = columns.slice(1); // skip [Code]
      const setParams = insertParams.slice(1);
      const setClause = setColumns.map((c) => `${c} = ?`).join(', ');
      executeNonQuery(
        path,
        password,
        `UPDATE [SizeTypes] SET ${setClause} WHERE [Code] = ?`,
        [...setParams, { value: code, type: 'integer' }],
      );
      return this.getByCode(code);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async delete(code: number): Promise<Result<void>> {
    try {
      const { path, password } = openRicsDb(RicsDb.SizeTypes);
      const rows = executeNonQuery(
        path,
        password,
        'DELETE FROM [SizeTypes] WHERE [Code] = ?',
        [{ value: code, type: 'integer' }],
      );
      if (rows === 0) {
        return Err({ kind: 'NotFound', message: `Size type ${code} not found.` });
      }
      return Ok(undefined);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },
};
