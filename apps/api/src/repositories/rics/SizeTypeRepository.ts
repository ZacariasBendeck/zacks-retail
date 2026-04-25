/**
 * SizeType repository — `app.taxonomy_size_type` in Postgres.
 *
 * Schema (per RICS p. 147):
 *   code SMALLINT (PK) | desc TEXT | column_desc TEXT | row_desc TEXT |
 *   table_type TEXT? | columns TEXT[] | rows TEXT[] | max_columns SMALLINT |
 *   max_rows SMALLINT | date_last_changed TIMESTAMP
 *
 * A Size Type is the grid shape for a SKU: up to 54 columns (sizes) × 27 rows
 * (widths). In RICS these were stored as a single wide row with 54 Columns_NN
 * + 27 Rows_NN slots — the Postgres port uses native text arrays, which
 * keeps writes atomic and drops the segment codec entirely.
 */

import { prisma } from '../../db/prisma';
import { Err, Ok, type Result, type RepoError } from './repoResult';
import { isUniqueViolation, duplicatePrimaryKey, isRecordNotFound, notFound } from './prismaErrors';
import { loadSkuCountsBySizeType } from './taxonomySkuCounts';

export interface SizeType {
  code: number;
  description: string;
  columnDescription: string;
  rowDescription: string;
  tableType: string | null;
  /** Non-blank column labels in order (length ≤ `maxColumns`). */
  columns: string[];
  /** Non-blank row labels in order (length ≤ `maxRows`). */
  rows: string[];
  maxColumns: number;
  maxRows: number;
  dateLastChanged: Date | null;
  skuCount: number;
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
  code: number;
  description: string;
  columnDescription: string;
  rowDescription: string;
  tableType: string | null;
  columns: string[];
  rows: string[];
  maxColumns: number;
  maxRows: number;
  dateLastChanged: Date;
}

function mapRow(row: SizeTypeRow): SizeType {
  return {
    code: row.code,
    description: row.description,
    columnDescription: row.columnDescription,
    rowDescription: row.rowDescription,
    tableType: row.tableType,
    columns: row.columns,
    rows: row.rows,
    maxColumns: row.maxColumns,
    maxRows: row.maxRows,
    dateLastChanged: row.dateLastChanged,
    skuCount: 0,
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

function normalizeLabels(labels: string[]): string[] {
  return labels.map((l) => l.trim()).filter((l) => l.length > 0);
}

export const SizeTypeRepository = {
  async list(): Promise<Result<SizeType[]>> {
    const rows = await prisma.taxonomySizeType.findMany({ orderBy: { code: 'asc' } });
    const counts = await loadSkuCountsBySizeType();
    return Ok(rows.map(mapRow).map((s) => ({ ...s, skuCount: counts.get(s.code) ?? 0 })));
  },

  async getByCode(code: number): Promise<Result<SizeType>> {
    const row = await prisma.taxonomySizeType.findUnique({ where: { code } });
    if (row == null) return Err(notFound(`Size type ${code} not found.`));
    const counts = await loadSkuCountsBySizeType();
    return Ok({ ...mapRow(row), skuCount: counts.get(code) ?? 0 });
  },

  async create(input: SizeTypeInput): Promise<Result<SizeType>> {
    const validationErr = validate(input);
    if (validationErr) return Err(validationErr);

    const columns = normalizeLabels(input.columns);
    const rows = normalizeLabels(input.rows);

    try {
      await prisma.taxonomySizeType.create({
        data: {
          code: input.code,
          description: input.description.trim(),
          columnDescription: (input.columnDescription ?? '').trim(),
          rowDescription: (input.rowDescription ?? '').trim(),
          tableType: input.tableType != null ? input.tableType.trim() : null,
          columns,
          rows,
          maxColumns: columns.length,
          maxRows: rows.length,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Err(duplicatePrimaryKey(`Size type ${input.code} already exists.`));
      }
      throw err;
    }
    return this.getByCode(input.code);
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

    const columns = normalizeLabels(merged.columns);
    const rows = normalizeLabels(merged.rows);

    try {
      await prisma.taxonomySizeType.update({
        where: { code },
        data: {
          description: merged.description.trim(),
          columnDescription: (merged.columnDescription ?? '').trim(),
          rowDescription: (merged.rowDescription ?? '').trim(),
          tableType: merged.tableType != null ? merged.tableType.trim() : null,
          columns,
          rows,
          maxColumns: columns.length,
          maxRows: rows.length,
        },
      });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Size type ${code} not found.`));
      throw err;
    }
    return this.getByCode(code);
  },

  async delete(code: number): Promise<Result<void>> {
    try {
      await prisma.taxonomySizeType.delete({ where: { code } });
    } catch (err) {
      if (isRecordNotFound(err)) return Err(notFound(`Size type ${code} not found.`));
      throw err;
    }
    return Ok(undefined);
  },
};
